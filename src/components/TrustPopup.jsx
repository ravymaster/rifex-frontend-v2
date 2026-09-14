// src/components/TrustPopup.jsx
// RIFEX V4 A3 — popup breve de confianza para landings públicas
// individuales. Se muestra una sola vez por dispositivo/sesión
// (localStorage), nunca bloquea la compra, siempre descartable. El texto
// varía solo si `trustLevel === 3` (titularidad contrastada real) — nunca
// inventa un nivel que el backend no confirmó.
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'rifex_trust_popup_seen';

export default function TrustPopup({ trustLevel }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== '1') {
        setVisible(true);
      }
    } catch {
      // localStorage bloqueado — no es crítico, simplemente no se muestra.
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try { window.localStorage.setItem(STORAGE_KEY, '1'); } catch {}
  }

  if (!visible) return null;

  const text = trustLevel === 3
    ? 'La identidad registrada del organizador coincide con la titularidad disponible en su cuenta receptora conectada.'
    : 'El organizador registró su identidad y conectó una cuenta receptora en Rifex. Los pagos se procesan mediante el proveedor conectado y las inconsistencias de titularidad quedan pendientes de revisión.';

  return (
    <div className="rf-trustpopup" role="dialog" aria-live="polite">
      <div className="rf-trustpopup__card">
        <strong className="rf-trustpopup__title">Antes de continuar</strong>
        <p className="rf-trustpopup__text">{text}</p>
        <div className="rf-trustpopup__actions">
          <button type="button" className="rf-trustpopup__btn rf-trustpopup__btn--primary" onClick={dismiss}>
            Entendido
          </button>
          <a href="/seguridad" className="rf-trustpopup__btn">Conocer la seguridad de Rifex</a>
        </div>
      </div>
      <style jsx>{`
        .rf-trustpopup {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 999;
          display: flex; justify-content: center; padding: 12px;
        }
        .rf-trustpopup__card {
          background: #fff; border: 1px solid #E5E7EB; border-radius: 14px;
          box-shadow: 0 -6px 24px rgba(0,0,0,.12); padding: 14px 16px; max-width: 480px; width: 100%;
        }
        .rf-trustpopup__title { display: block; font-size: 13.5px; color: #0F172A; margin-bottom: 4px; }
        .rf-trustpopup__text { margin: 0 0 10px; font-size: 12.5px; line-height: 1.5; color: #4B5563; }
        .rf-trustpopup__actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .rf-trustpopup__btn {
          font-size: 12.5px; font-weight: 700; padding: 7px 12px; border-radius: 8px;
          border: 1px solid #E5E7EB; background: #fff; color: #374151; text-decoration: none; cursor: pointer;
        }
        .rf-trustpopup__btn--primary { background: #0F172A; color: #fff; border-color: #0F172A; }
      `}</style>
    </div>
  );
}
