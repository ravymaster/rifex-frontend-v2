// src/components/rifex/PrizeGallery.jsx
// RIFEX RAFFLE EXPERIENCE 2026 — cierra el bug real encontrado en la
// auditoría: raffle.prize_photos siempre llegó correcto desde el backend
// (upload, storage, columna, API) pero nunca se renderizaba en ningún
// lado. Este componente es exclusivamente de render — cero cambios de
// backend/storage/schema.
import { useState } from "react";
import styles from "../../styles/prizeGallery.module.css";

// Sin fotos (premio en dinero, o premio físico sin fotos subidas): un
// fondo de marca en vez de inventar una imagen de stock — nunca mostrar
// un <img> roto ni un espacio en blanco.
function MoneyHero({ label }) {
  return (
    <div className={styles.moneyHero} aria-hidden="true">
      <span className={styles.moneyIcon}>💰</span>
      <span className={styles.moneyLabel}>{label}</span>
    </div>
  );
}

export default function PrizeGallery({ photos, prizeType, title }) {
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (list.length === 0) {
    return (
      <div className={styles.wrap}>
        <MoneyHero label={prizeType === "physical" ? (title || "Premio físico") : "Premio en dinero"} />
      </div>
    );
  }

  const active = list[Math.min(activeIdx, list.length - 1)];

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.mainImageBtn}
        onClick={() => setLightboxOpen(true)}
        aria-label="Ampliar imagen del premio"
      >
        <img className={styles.mainImage} src={active} alt={title || "Premio"} loading="eager" />
      </button>

      {list.length > 1 && (
        <div className={styles.thumbRow} role="tablist" aria-label="Miniaturas del premio">
          {list.map((url, i) => (
            <button
              key={url + i}
              type="button"
              role="tab"
              aria-selected={i === activeIdx}
              className={`${styles.thumbBtn} ${i === activeIdx ? styles.thumbActive : ""}`}
              onClick={() => setActiveIdx(i)}
            >
              <img className={styles.thumbImage} src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div
          className={styles.lightboxBackdrop}
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Imagen ampliada del premio"
        >
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => setLightboxOpen(false)}
            aria-label="Cerrar"
          >
            ✕
          </button>
          <img
            className={styles.lightboxImage}
            src={active}
            alt={title || "Premio"}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
