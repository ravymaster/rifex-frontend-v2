// src/components/TrustBadge.jsx
// RIFEX V4 A3 — sello de confianza. Renderiza únicamente cuando `level`
// llega como 3 (titularidad contrastada), un valor que la página que lo usa
// debe derivar de datos reales de backend (mp_identity_match === 'matched')
// — nunca inventado en el cliente. Niveles 1/2/4 no tienen sello visual
// todavía: Nivel 4 queda PRODUCT_DECISION_REQUIRED (ver misión V4 A+B).
import { useState } from 'react';

export default function TrustBadge({ level }) {
  const [open, setOpen] = useState(false);
  if (level !== 3) return null;

  return (
    <div className="rf-trustbadge">
      <button
        type="button"
        className="rf-trustbadge__pill"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        🪪 Titularidad contrastada
      </button>
      {open && (
        <p className="rf-trustbadge__detail">
          El RUT registrado coincide con la información de titularidad disponible en la cuenta receptora conectada.
          Esto no constituye una garantía de resultado ni reemplaza la revisión de las condiciones de la iniciativa.
        </p>
      )}
      <style jsx>{`
        .rf-trustbadge { display: inline-block; margin: 6px 0; }
        .rf-trustbadge__pill {
          display: inline-flex; align-items: center; gap: 6px;
          background: #ECFDF5; border: 1px solid #A7F3D0; color: #065F46;
          border-radius: 999px; padding: 6px 12px; font-weight: 700; font-size: 13px;
          cursor: pointer; font-family: inherit;
        }
        .rf-trustbadge__detail {
          margin: 8px 0 0; max-width: 420px; font-size: 12.5px; line-height: 1.5;
          color: #374151; background: #F9FAFB; border: 1px solid #E5E7EB;
          border-radius: 10px; padding: 10px 12px;
        }
      `}</style>
    </div>
  );
}
