// Сервер «Учёт часов»: API, вход по паролю, приглашения работников, SQLite, раздача приложения.
// Без внешних зависимостей — только встроенные модули Node 24.
//
// Права:
//   admin  — видит и правит всё, ставка фактуры (overviewRates) только у него.
//   worker — видит и правит только свои записи и заметки; ставки в записях ставит сервер,
//            ставку фактуры и чужие данные не получает вовсе.
//   manager — видит всех и все часы, но все ставки ему приходят как ставка фактуры
//            (настоящих ставок работников сервер не отдаёт); ничего не удаляет,
//            его исправления ждут подтверждения администратора.
//
// Запуск: node server/server.mjs            — сервер
//         node server/server.mjs admin-link — новая ссылка для входа администратора
//         node server/server.mjs manager-link <логин> — менеджер (создать или сбросить пароль): ссылка для входа
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const STATIC_DIR = process.env.STATIC_DIR || path.resolve('dist');
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SECURE_COOKIE = PUBLIC_URL.startsWith('https://');

const COOKIE = 'chasy_session';
const SESSION_DAYS = 365;
const INVITE_DAYS = 7;
const MAX_BODY = 40 * 1024 * 1024; // импорт бэкапа с фото
const MAX_ITEM = 12 * 1024 * 1024; // одна заметка с фото

/* ---------------- База ---------------- */

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'chasy.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS workers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, date TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, date TEXT NOT NULL, data TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS entries_worker ON entries(worker_id, date);
  CREATE INDEX IF NOT EXISTS notes_worker ON notes(worker_id, date);
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    login TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'worker', 'manager')),
    worker_id TEXT,
    pass TEXT,
    invite_hash TEXT,
    invite_expires INTEGER,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );
`);

// Старые базы: в таблице users разрешены только admin/worker — пересоздаём с ролью manager.
{
  const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql ?? '';
  if (!usersSql.includes("'manager'")) {
    db.exec('PRAGMA foreign_keys = OFF'); // иначе пересоздание users удалило бы сессии
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          login TEXT UNIQUE NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'worker', 'manager')),
          worker_id TEXT,
          pass TEXT,
          invite_hash TEXT,
          invite_expires INTEGER,
          created INTEGER NOT NULL
        );
        INSERT INTO users_new (id, login, role, worker_id, pass, invite_hash, invite_expires, created)
          SELECT id, login, role, worker_id, pass, invite_hash, invite_expires, created FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// Исправление работника не меняет запись сразу — оно лежит в pending, пока администратор не примет его.
for (const t of ['entries', 'notes']) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  if (!cols.includes('pending')) db.exec(`ALTER TABLE ${t} ADD COLUMN pending TEXT`);
}

const q = (sql) => db.prepare(sql);
function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
const parseRows = (rows) => rows.map((r) => JSON.parse(r.data));
/** Запись + предложенное исправление (если есть) в поле pendingChange. */
function rowToItem(r) {
  const item = JSON.parse(r.data);
  if (r.pending) item.pendingChange = JSON.parse(r.pending);
  return item;
}
const itemRows = (rows) => rows.map(rowToItem);
const getItem = (table, id) => {
  const r = q(`SELECT data, pending FROM ${table} WHERE id = ?`).get(id);
  return r ? rowToItem(r) : null;
};
/** Сравнение по содержимому (порядок полей не важен). */
function sameContent(a, b) {
  const norm = (v) =>
    Array.isArray(v)
      ? v.map(norm)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => [k, norm(v[k])]))
        : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
const kvGet = (key) => {
  const r = q('SELECT value FROM kv WHERE key = ?').get(key);
  return r ? JSON.parse(r.value) : undefined;
};
const kvSet = (key, value) => {
  if (value === undefined || value === null) q('DELETE FROM kv WHERE key = ?').run(key);
  else q('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
};
const getWorker = (id) => {
  const r = q('SELECT data FROM workers WHERE id = ?').get(id);
  return r ? JSON.parse(r.data) : null;
};

/* ---------------- Пароли, сессии, приглашения ---------------- */

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
const newId = () => crypto.randomBytes(9).toString('base64url');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function checkPassword(password, stored) {
  if (!stored) return false;
  const [kind, saltHex, hashHex] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

function createSession(userId) {
  const t = token();
  q('INSERT INTO sessions (hash, user_id, expires) VALUES (?, ?, ?)').run(
    sha256(t),
    userId,
    Date.now() + SESSION_DAYS * 86400000,
  );
  return t;
}
function sessionCookie(t, maxAgeSec) {
  return `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${SECURE_COOKIE ? '; Secure' : ''}`;
}

/** Новая ссылка-приглашение (или сброс пароля). Старая ссылка перестаёт работать. */
function issueInvite(userId) {
  const t = token();
  q('UPDATE users SET invite_hash = ?, invite_expires = ? WHERE id = ?').run(
    sha256(t),
    Date.now() + INVITE_DAYS * 86400000,
    userId,
  );
  return `${PUBLIC_URL}/#/invite/${t}`;
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'ye', ж: 'zh', з: 'z', и: 'i', і: 'i',
  ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
/** Логин из имени: «Роман» → roman, «Микола» → mikola (уникальный). */
function makeLogin(name) {
  let base = [...String(name).toLowerCase()]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20);
  if (!base || base === 'admin') base = 'worker';
  let login = base;
  for (let i = 2; q('SELECT 1 FROM users WHERE login = ?').get(login); i++) login = `${base}${i}`;
  return login;
}

/** Если администратора ещё нет — создать и выдать ссылку для первого входа. */
function ensureAdmin({ forceLink = false } = {}) {
  let admin = q("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!admin) {
    q("INSERT INTO users (id, login, role, created) VALUES (?, 'admin', 'admin', ?)").run(newId(), Date.now());
    admin = q("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
    forceLink = true;
  }
  const needsLink = !admin.pass && (!admin.invite_expires || admin.invite_expires < Date.now());
  if (forceLink || needsLink) {
    const link = issueInvite(admin.id);
    console.log(`\n=== Ссылка для входа администратора (логин admin, действует ${INVITE_DAYS} дней) ===\n${link}\n`);
  }
}

/* ---------------- Проверка входных данных ---------------- */

const isId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

function checkItem(item, id) {
  if (!isObj(item)) fail(400, 'Неверные данные');
  if (item.id !== id || !isId(item.id)) fail(400, 'Неверный id');
  if (!isId(item.workerId)) fail(400, 'Неверный работник');
  if (!isDate(item.date)) fail(400, 'Неверная дата');
  if (JSON.stringify(item).length > MAX_ITEM) fail(413, 'Слишком большая запись (фото)');
}

/** Ставка для новой записи работника: как в его последней записи, иначе — из карточки работника. */
function workerDefaultRates(workerId) {
  const last = q('SELECT data FROM entries WHERE worker_id = ? ORDER BY date DESC LIMIT 1').get(workerId);
  const e = last ? JSON.parse(last.data) : {};
  const w = getWorker(workerId) ?? {};
  return { hourly: e.hourly ?? w.hourly ?? 0, perKm: e.perKm ?? w.perKm ?? 0 };
}

/* ---------------- Данные для пользователя ---------------- */

/** Менеджер видит всех по ставке фактуры: настоящие ставки работников заменяются на неё. */
function invoiceRates() {
  const r = kvGet('overviewRates') ?? {};
  return { hourly: num(r.hourly) ?? 0, perKm: num(r.perKm) ?? 0 };
}
function maskEntry(e, r) {
  const out = { ...e, hourly: r.hourly, perKm: r.perKm };
  if (e.pendingChange) out.pendingChange = { ...e.pendingChange, data: { ...e.pendingChange.data, hourly: r.hourly, perKm: r.perKm } };
  return out;
}
/** Ответ на изменение записи — для менеджера тоже без настоящих ставок. */
function itemFor(user, table, id) {
  const item = getItem(table, id);
  return user.role === 'manager' && table === 'entries' && item ? maskEntry(item, invoiceRates()) : item;
}

function dataFor(user) {
  if (user.role === 'manager') {
    const r = invoiceRates();
    return {
      workers: parseRows(q('SELECT data FROM workers').all()).map((w) => ({ id: w.id, name: w.name, hourly: r.hourly, perKm: r.perKm })),
      entries: itemRows(q('SELECT data, pending FROM entries ORDER BY date').all()).map((e) => maskEntry(e, r)),
      notes: itemRows(q('SELECT data, pending FROM notes ORDER BY date').all()),
      overviewRates: r,
      selfWorkerId: user.worker_id ?? undefined,
    };
  }
  if (user.role === 'admin') {
    return {
      workers: parseRows(q('SELECT data FROM workers').all()),
      entries: itemRows(q('SELECT data, pending FROM entries ORDER BY date').all()),
      notes: itemRows(q('SELECT data, pending FROM notes ORDER BY date').all()),
      overviewRates: kvGet('overviewRates'),
      selfWorkerId: kvGet('selfWorkerId'),
    };
  }
  // Работник — только своё. Ставку фактуры (overviewRates) не получает.
  const w = getWorker(user.worker_id);
  return {
    workers: w ? [w] : [],
    entries: itemRows(q('SELECT data, pending FROM entries WHERE worker_id = ? ORDER BY date').all(user.worker_id)),
    notes: itemRows(q('SELECT data, pending FROM notes WHERE worker_id = ? ORDER BY date').all(user.worker_id)),
    selfWorkerId: user.worker_id,
  };
}

function publicUser(user) {
  const w = user.worker_id ? getWorker(user.worker_id) : null;
  return { login: user.login, role: user.role, workerId: user.worker_id ?? null, name: w?.name ?? null };
}

/* ---------------- HTTP ---------------- */

function send(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

function readJson(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Слишком большой запрос'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new HttpError(400, 'Неверный JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function currentUser(req) {
  const t = getCookie(req, COOKIE);
  if (!t) return null;
  const s = q('SELECT user_id, expires FROM sessions WHERE hash = ?').get(sha256(t));
  if (!s || s.expires < Date.now()) return null;
  return q('SELECT * FROM users WHERE id = ?').get(s.user_id) ?? null;
}

// Простая защита от подбора пароля: не больше 10 попыток за 15 минут с одного адреса.
const attempts = new Map();
function limitLogin(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60000);
  if (a.length >= 10) fail(429, 'Слишком много попыток. Попробуйте через 15 минут.');
  a.push(now);
  attempts.set(ip, a);
}

async function api(req, res, url) {
  const method = req.method;
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // без «api»
  // Изменяющие запросы — только из самого приложения (защита от подделки запросов с чужих сайтов).
  if (method !== 'GET' && req.headers['x-chasy'] !== '1') fail(403, 'Запрещено');

  /* ---- без входа ---- */
  if (parts[0] === 'login' && method === 'POST') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    limitLogin(ip);
    const { login, password } = await readJson(req, 10000);
    const user = q('SELECT * FROM users WHERE login = ?').get(String(login || '').trim().toLowerCase());
    if (!user || !checkPassword(String(password || ''), user.pass)) fail(401, 'Неверный логин или пароль');
    attempts.delete(ip);
    return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(createSession(user.id), SESSION_DAYS * 86400) });
  }
  if (parts[0] === 'invite' && parts[1]) {
    const user = q('SELECT * FROM users WHERE invite_hash = ?').get(sha256(parts[1]));
    if (!user || !user.invite_expires || user.invite_expires < Date.now()) {
      fail(404, 'Ссылка недействительна или устарела. Попросите новую.');
    }
    if (method === 'GET') return send(res, 200, { user: publicUser(user) });
    if (method === 'POST') {
      const { password } = await readJson(req, 10000);
      if (typeof password !== 'string' || password.length < 6) fail(400, 'Пароль — минимум 6 символов');
      tx(() => {
        q('UPDATE users SET pass = ?, invite_hash = NULL, invite_expires = NULL WHERE id = ?').run(hashPassword(password), user.id);
        q('DELETE FROM sessions WHERE user_id = ?').run(user.id); // выход на всех старых устройствах
      });
      return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(createSession(user.id), SESSION_DAYS * 86400) });
    }
  }

  /* ---- нужен вход ---- */
  const user = currentUser(req);
  if (!user) fail(401, 'Нужно войти');
  const admin = user.role === 'admin';
  const needAdmin = () => {
    if (!admin) fail(403, 'Нет доступа');
  };

  if (parts[0] === 'session' && method === 'GET') return send(res, 200, { user: publicUser(user) });
  if (parts[0] === 'logout' && method === 'POST') {
    const t = getCookie(req, COOKIE);
    if (t) q('DELETE FROM sessions WHERE hash = ?').run(sha256(t));
    return send(res, 200, {}, { 'Set-Cookie': sessionCookie('', 0) });
  }
  if (parts[0] === 'data' && method === 'GET') return send(res, 200, dataFor(user));

  // Рабочие дни и заметки
  if ((parts[0] === 'entries' || parts[0] === 'notes') && parts[1]) {
    const table = parts[0];
    const id = parts[1];
    if (!isId(id)) fail(400, 'Неверный id');
    const existing = q(`SELECT worker_id, data FROM ${table} WHERE id = ?`).get(id);
    const manager = user.role === 'manager';
    if (existing && !admin && !manager && existing.worker_id !== user.worker_id) fail(403, 'Нет доступа');

    // Администратор принимает или отклоняет исправление работника.
    if (parts[2] === 'approve' || parts[2] === 'reject') {
      needAdmin();
      if (method !== 'POST') fail(405, 'Метод не поддерживается');
      const row = q(`SELECT data, pending FROM ${table} WHERE id = ?`).get(id);
      if (!row || !row.pending) fail(404, 'Исправление не найдено — возможно, уже проверено');
      if (parts[2] === 'approve') {
        const cur = JSON.parse(row.data);
        const next = { ...JSON.parse(row.pending).data, id, workerId: cur.workerId };
        if (table === 'entries') {
          // Ставки решает администратор — они остаются как в записи сейчас.
          next.hourly = cur.hourly;
          next.perKm = cur.perKm;
        }
        q(`UPDATE ${table} SET data = ?, date = ?, pending = NULL WHERE id = ?`).run(JSON.stringify(next), next.date, id);
      } else {
        q(`UPDATE ${table} SET pending = NULL WHERE id = ?`).run(id);
      }
      return send(res, 200, getItem(table, id));
    }
    if (parts.length > 2) fail(404, 'Не найдено');

    if (method === 'DELETE') {
      // Удаляет только администратор; работник может свои записи и заметки только исправлять.
      if (!admin) fail(403, 'Удалять может только администратор');
      q(`DELETE FROM ${table} WHERE id = ?`).run(id);
      return send(res, 200, {});
    }
    if (method === 'PUT') {
      const item = await readJson(req, MAX_ITEM + 10000);
      if (!isObj(item)) fail(400, 'Неверные данные');
      delete item.pendingChange; // это поле считает только сервер
      if (!admin) {
        if (!manager) {
          if (!user.worker_id) fail(403, 'Нет доступа');
          item.workerId = user.worker_id; // работник пишет только себе
        } else if (existing) {
          item.workerId = existing.worker_id; // менеджер не переносит запись на другого работника
        }
        if (table === 'entries') {
          // Ставку в записи задаёт только администратор: сохраняется прежняя или берётся обычная ставка работника.
          const rates = existing ? JSON.parse(existing.data) : workerDefaultRates(item.workerId);
          item.hourly = rates.hourly;
          item.perKm = rates.perKm;
        }
      }
      checkItem(item, id);
      if (!getWorker(item.workerId)) fail(400, 'Работник не найден');

      // Работник или менеджер исправляет уже внесённое — запись не меняется, исправление ждёт администратора.
      if (!admin && existing) {
        const current = JSON.parse(existing.data);
        if (sameContent(current, item)) q(`UPDATE ${table} SET pending = NULL WHERE id = ?`).run(id);
        else {
          q(`UPDATE ${table} SET pending = ? WHERE id = ?`).run(
            JSON.stringify({ data: item, at: Date.now(), by: user.login }),
            id,
          );
        }
        return send(res, 200, itemFor(user, table, id));
      }

      // Новая запись (в т.ч. работника) или правка администратора — сохраняется сразу.
      q(`INSERT INTO ${table} (id, worker_id, date, data) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET worker_id = excluded.worker_id, date = excluded.date, data = excluded.data`).run(
        id,
        item.workerId,
        item.date,
        JSON.stringify(item),
      );
      return send(res, 200, itemFor(user, table, id));
    }
  }

  // Работники и их доступ — только администратор
  if (parts[0] === 'workers') {
    needAdmin();
    const id = parts[1];
    if (!id && method === 'GET' && parts.length === 1) {
      return send(res, 200, parseRows(q('SELECT data FROM workers').all()));
    }
    if (id === undefined) fail(404, 'Не найдено');
    if (!isId(id)) fail(400, 'Неверный id');

    if (parts[2] === 'invite' && method === 'POST') {
      const w = getWorker(id);
      if (!w) fail(404, 'Работник не найден');
      let acc = q('SELECT * FROM users WHERE worker_id = ? AND role = ?').get(id, 'worker');
      if (!acc) {
        q("INSERT INTO users (id, login, role, worker_id, created) VALUES (?, ?, 'worker', ?, ?)").run(newId(), makeLogin(w.name), id, Date.now());
        acc = q('SELECT * FROM users WHERE worker_id = ? AND role = ?').get(id, 'worker');
      }
      const link = issueInvite(acc.id);
      return send(res, 200, { link, login: acc.login, days: INVITE_DAYS });
    }
    if (parts[2] === 'account' && method === 'GET') {
      const acc = q("SELECT login, pass, invite_expires FROM users WHERE worker_id = ? AND role = 'worker'").get(id);
      // Вход заведён заранее (логин есть), но ссылку ещё не создавали — это «ещё не приглашён».
      const status = !acc
        ? 'none'
        : acc.pass
          ? 'active'
          : !acc.invite_expires
            ? 'none'
            : acc.invite_expires > Date.now()
              ? 'invited'
              : 'expired';
      return send(res, 200, { status, login: acc?.login ?? null });
    }
    if (parts[2] === 'account' && method === 'DELETE') {
      q("DELETE FROM users WHERE worker_id = ? AND role = 'worker'").run(id); // закрыть доступ
      return send(res, 200, {});
    }
    if (parts.length === 2 && method === 'PUT') {
      const w = await readJson(req, 10000);
      if (!isObj(w) || w.id !== id || typeof w.name !== 'string' || !w.name.trim()) fail(400, 'Неверные данные');
      const clean = { id, name: w.name.trim().slice(0, 60), hourly: num(w.hourly), perKm: num(w.perKm) };
      q('INSERT INTO workers (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(id, JSON.stringify(clean));
      return send(res, 200, clean);
    }
    if (parts.length === 2 && method === 'DELETE') {
      tx(() => {
        q('DELETE FROM entries WHERE worker_id = ?').run(id);
        q('DELETE FROM notes WHERE worker_id = ?').run(id);
        q("DELETE FROM users WHERE worker_id = ? AND role = 'worker'").run(id);
        q('DELETE FROM workers WHERE id = ?').run(id);
        if (kvGet('selfWorkerId') === id) kvSet('selfWorkerId', null);
      });
      return send(res, 200, {});
    }
  }

  if (parts[0] === 'settings' && method === 'PUT') {
    needAdmin();
    const s = await readJson(req, 10000);
    if ('overviewRates' in s) {
      const r = s.overviewRates;
      if (!isObj(r) || num(r.hourly) === undefined || num(r.perKm) === undefined) fail(400, 'Неверная ставка');
      kvSet('overviewRates', { hourly: r.hourly, perKm: r.perKm });
    }
    if ('selfWorkerId' in s) {
      if (s.selfWorkerId !== null && !isId(s.selfWorkerId)) fail(400, 'Неверный работник');
      kvSet('selfWorkerId', s.selfWorkerId);
    }
    return send(res, 200, {});
  }

  // Импорт бэкапа (из основного приложения) — заменяет все рабочие данные. Входы работников сохраняются.
  if (parts[0] === 'import' && method === 'POST') {
    needAdmin();
    const s = await readJson(req);
    if (!Array.isArray(s.workers) || !Array.isArray(s.entries)) fail(400, 'Неверный формат файла');
    const notes = Array.isArray(s.notes) ? s.notes : [];
    for (const w of s.workers) if (!isObj(w) || !isId(w.id) || typeof w.name !== 'string') fail(400, 'Неверный работник в файле');
    for (const e of s.entries) checkItem(e, e?.id);
    for (const n of notes) checkItem(n, n?.id);
    tx(() => {
      q('DELETE FROM entries').run();
      q('DELETE FROM notes').run();
      q('DELETE FROM workers').run();
      for (const w of s.workers) q('INSERT INTO workers (id, data) VALUES (?, ?)').run(w.id, JSON.stringify(w));
      const clean = (x) => {
        const { pendingChange, ...rest } = x; // исправления из файла не переносим — только сами записи
        return JSON.stringify(rest);
      };
      for (const e of s.entries) q('INSERT INTO entries (id, worker_id, date, data) VALUES (?, ?, ?, ?)').run(e.id, e.workerId, e.date, clean(e));
      for (const n of notes) q('INSERT INTO notes (id, worker_id, date, data) VALUES (?, ?, ?, ?)').run(n.id, n.workerId, n.date, clean(n));
      if (isObj(s.overviewRates)) kvSet('overviewRates', s.overviewRates);
      kvSet('selfWorkerId', isId(s.selfWorkerId) ? s.selfWorkerId : null);
    });
    return send(res, 200, { workers: s.workers.length, entries: s.entries.length, notes: notes.length });
  }

  fail(404, 'Не найдено');
}

/* ---------------- Раздача приложения ---------------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  let file = path.join(STATIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(STATIC_DIR)) file = path.join(STATIC_DIR, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(STATIC_DIR, 'index.html'); // приложение одностраничное
    rel = '/index.html';
  }
  const ext = path.extname(file);
  const immutable = rel.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Метод не поддерживается' });
    serveStatic(req, res, url);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Ошибка сервера' });
  }
});

if (process.argv[2] === 'admin-link') {
  ensureAdmin({ forceLink: true });
  process.exit(0);
}
if (process.argv[2] === 'manager-link') {
  const login = String(process.argv[3] || '').trim().toLowerCase();
  if (!/^[a-z0-9]{2,30}$/.test(login)) {
    console.error('Логин: латиница и цифры, например denvick');
    process.exit(1);
  }
  let u = q('SELECT * FROM users WHERE login = ?').get(login);
  if (u && u.role !== 'manager') {
    console.error(`Логин ${login} уже занят (${u.role})`);
    process.exit(1);
  }
  if (!u) {
    q("INSERT INTO users (id, login, role, created) VALUES (?, ?, 'manager', ?)").run(newId(), login, Date.now());
    u = q('SELECT * FROM users WHERE login = ?').get(login);
  }
  console.log(`\n=== Ссылка для входа менеджера (логин ${login}, действует ${INVITE_DAYS} дней) ===\n${issueInvite(u.id)}\n`);
  process.exit(0);
}

ensureAdmin();
q('DELETE FROM sessions WHERE expires < ?').run(Date.now());
server.listen(PORT, () => console.log(`Учёт часов: порт ${PORT}, данные ${DATA_DIR}, адрес ${PUBLIC_URL}`));
