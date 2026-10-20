#!/usr/bin/env bash
# Сборка и публикация ТЕСТОВОЙ копии на https://dimahodonovich22.github.io/worker-hours-test/
# Основное приложение (репозиторий worker-hours) не затрагивается.
# Использование: GH_TOKEN=ghp_... scripts/deploy-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${GH_TOKEN:?нужен GH_TOKEN}"

BASE_PATH=/worker-hours-test/ npm run build

# Публикуем готовую сборку в ветку gh-pages репозитория worker-hours-test.
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
cp -R dist/. "$OUT"
touch "$OUT/.nojekyll"
cd "$OUT"
git init -q -b gh-pages
git add -A
git -c user.name=dimahodonovich22 -c user.email=dima.hodonovich22@gmail.com \
  commit -q -m "Deploy $(date '+%Y-%m-%d %H:%M')"
GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c credential.https://github.com.helper= \
  push -q -f "https://dimahodonovich22:${GH_TOKEN}@github.com/dimahodonovich22/worker-hours-test.git" gh-pages
echo "Опубликовано: https://dimahodonovich22.github.io/worker-hours-test/"
