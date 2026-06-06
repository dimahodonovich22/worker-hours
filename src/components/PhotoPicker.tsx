import { useRef, useState } from 'react';
import { compressImage } from '../photos';

type Props = {
  photos: string[];
  onChange: (next: string[]) => void;
};

export function PhotoPicker({ photos, onChange }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue;
        try {
          added.push(await compressImage(f));
        } catch {
          // пропускаем нечитаемые
        }
      }
      if (added.length) onChange([...photos, ...added]);
    } finally {
      setBusy(false);
    }
  }

  function remove(i: number) {
    onChange(photos.filter((_, idx) => idx !== i));
  }

  return (
    <div className="field">
      <span>Фото</span>

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((src, i) => (
            <div key={i} className="photo-thumb" onClick={() => setViewer(i)}>
              <img src={src} alt="" />
              <button
                type="button"
                className="photo-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Удалить фото?')) remove(i);
                }}
                aria-label="Удалить фото"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="photo-buttons">
        <button
          type="button"
          className="ghost photo-btn"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          📷 Камера
        </button>
        <button
          type="button"
          className="ghost photo-btn"
          disabled={busy}
          onClick={() => galleryRef.current?.click()}
        >
          🖼 Галерея
        </button>
      </div>

      {busy && <div className="photo-busy">Обработка...</div>}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {viewer !== null && photos[viewer] && (
        <div className="photo-viewer" onClick={() => setViewer(null)}>
          <img src={photos[viewer]} alt="" />
          <button className="photo-viewer-close" onClick={() => setViewer(null)}>×</button>
        </div>
      )}
    </div>
  );
}
