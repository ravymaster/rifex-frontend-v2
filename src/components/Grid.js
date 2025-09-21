import { useEffect, useState, useMemo } from 'react';

export default function Grid({ raffleId, priceCLP, buyerEmail }) {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const key = `rf_seen_${raffleId}_${buyerEmail || 'anon'}`;
    const seen = typeof window !== 'undefined' ? localStorage.getItem(key) : '1';
    if (!seen) {
      setShowWelcome(true);
      localStorage.setItem(key, '1');
    }
  }, [raffleId, buyerEmail]);

  useEffect(() => {
    const fetchTickets = async () => {
      const res = await fetch(`/api/rifas/${raffleId}/tickets`);
      const data = await res.json();
      setTickets(data.tickets || []);
    };
    fetchTickets();
  }, [raffleId]);

  const total = useMemo(
    () => selected.length * (priceCLP || 0),
    [selected, priceCLP]
  );

  function toggle(n, status) {
    if (status !== 'available') return;
    setSelected(s => (s.includes(n) ? s.filter(x => x !== n) : [...s, n]));
  }

  async function pay() {
    if (!selected.length) return;
    setLoading(true);
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raffleId, numbers: selected, buyerEmail })
    });
    const data = await res.json();
    setLoading(false);
    if (data?.init_point) window.location.href = data.init_point;
    else alert('No se pudo iniciar el pago');
  }

  return (
    <div style={{ maxWidth: 900, margin: '1.5rem auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {showWelcome && (
        <div style={{
          position: 'relative',
          border: '1px solid #e5e7eb',
          padding: 16,
          borderRadius: 12,
          marginBottom: 20,
          background: '#fff'
        }}>
          <button
            onClick={() => setShowWelcome(false)}
            aria-label="Cerrar"
            style={{
              position: 'absolute',
              top: -10, right: -10,
              width: 28, height: 28,
              borderRadius: 999,
              border: 'none',
              background: '#ef4444',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >×</button>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>¡Bienvenido!</h3>
          <p style={{ marginTop: 8, color: '#4b5563' }}>
            Elige tus números y paga seguro con Mercado Pago. Los seleccionados se marcan en <b>verde</b>.
          </p>
        </div>
      )}

      <div className="grid">
        {tickets.map(t => {
          const isSelected = selected.includes(t.number);
          const isDisabled = t.status !== 'available';
          const isSold     = t.status === 'sold';
          const isPending  = t.status === 'pending';

          return (
            <button
              key={t.number}
              onClick={() => toggle(t.number, t.status)}
              disabled={isDisabled}
              aria-pressed={isSelected}
              title={`N° ${t.number}`}
              className={`tile ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
            >
              {(t.icon_url || t.iconUrl) && (
                <img
                  src={t.icon_url || t.iconUrl}
                  alt=""
                  draggable="false"
                  className={`icon ${isSelected ? 'hiddenIcon' : ''} ${isSold ? 'soldIcon' : ''} ${isPending ? 'pendingIcon' : ''}`}
                />
              )}

              {isSold && <span className="badge sold">VEND.</span>}
              {isPending && <span className="badge pending">RES.</span>}

              {isSelected && <span aria-hidden="true" className="selOverlay" />}
              {isSelected && <span aria-hidden="true" className="check">✓</span>}

              <span className={`pill ${isSelected ? 'pillSelected' : ''}`}>{t.number}</span>

              {isDisabled && <span className="dim" />}
            </button>
          );
        })}
      </div>

      <div className="footer">
        <div><strong>Total:</strong> ${total.toLocaleString('es-CL')}</div>
        <button onClick={pay} disabled={loading || !selected.length} className={`buy ${loading || !selected.length ? 'off' : ''}`}>
          {loading ? 'Redirigiendo…' : `Comprar seleccionados (${selected.length})`}
        </button>
      </div>

      {/* === estilos (styled-jsx) === */}
      <style jsx>{`
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
          gap: 12px;
        }
        .tile {
          position: relative;
          height: 64px;
          border-radius: 14px;
          padding: 0;
          border: 1px solid #E5E7EB;
          background: #0b1221;
          overflow: hidden;
          color: #fff;
          transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease;
        }
        .tile.selected {
          border-color: #18A957;
          transform: scale(1.06);
          /* halo verde + borde interior blanco */
          box-shadow:
            inset 0 0 0 3px #fff,
            0 0 0 6px rgba(24,169,87,0.65),
            0 8px 24px rgba(24,169,87,0.35);
        }
        /* Doble borde ANIMADO */
        .tile.selected::before {
          content: '';
          position: absolute;
          inset: 3px;
          border: 3px solid #fff;
          border-radius: 12px;
          z-index: 1003;
          animation: pulse 1.1s ease-in-out infinite;
          pointer-events: none;
        }
        .tile.selected::after {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 16px;
          box-shadow: 0 0 0 6px rgba(24,169,87,0.65), 0 0 32px rgba(24,169,87,0.55);
          z-index: 1002;
          animation: halo 1.4s ease-in-out infinite;
          pointer-events: none;
        }

        .icon {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 14px;
          transition: opacity .12s, filter .12s;
          z-index: 0; /* siempre al fondo */
        }
        .hiddenIcon { opacity: 0; } /* ícono oculto al seleccionar */
        .soldIcon { filter: grayscale(1); }
        .pendingIcon { filter: grayscale(.35); }

        .badge {
          position: absolute;
          top: 6px; left: 6px;
          font-size: 10px;
          font-weight: 800;
          padding: 4px 6px;
          border-radius: 8px;
          letter-spacing: .4px;
          z-index: 1004;
        }
        .badge.sold { background: #111827; color: #fff; }
        .badge.pending { background: #F59E0B; color: #111; }

        .selOverlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(34,197,94,0.98) 0%, rgba(16,185,129,0.98) 100%);
          border-radius: 14px;
          z-index: 1001;
          pointer-events: none;
        }
        .check {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          font-weight: 900;
          color: #0b1221;
          text-shadow: 0 1px 0 rgba(255,255,255,.7);
          z-index: 1004;
          pointer-events: none;
        }
        .pill {
          position: absolute;
          right: 6px; bottom: 6px;
          min-width: 22px; height: 22px;
          padding: 0 6px;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 999px;
          font-size: 12px; font-weight: 800;
          background: rgba(255,255,255,.12);
          color: #fff;
          border: 1px solid rgba(255,255,255,.2);
          z-index: 1004;
        }
        .pillSelected {
          min-width: 26px; height: 26px;
          padding: 0 8px;
          font-size: 14px; font-weight: 900;
          background: #fff; color: #0b1221;
          border: 1px solid rgba(0,0,0,.25);
        }

        .dim {
          position: absolute; inset: 0;
          background: linear-gradient(0deg, rgba(0,0,0,.55), rgba(0,0,0,.25));
          border-radius: 14px;
          z-index: 2; pointer-events: none;
        }

        .footer {
          margin-top: 18px;
          display: flex; align-items: center; gap: 12px; justify-content: space-between;
        }
        .buy {
          padding: 12px 18px; border-radius: 10px; border: none;
          background: linear-gradient(90deg,#1d4ed8,#18A957);
          color: #fff; font-weight: 700; cursor: pointer;
          box-shadow: 0 6px 20px rgba(24,169,87,.25);
        }
        .buy.off {
          background: #9CA3AF; box-shadow: none; cursor: not-allowed;
        }

        @keyframes pulse {
          0%   { opacity: .95; transform: scale(1); }
          50%  { opacity: .55; transform: scale(.985); }
          100% { opacity: .95; transform: scale(1); }
        }
        @keyframes halo {
          0%   { box-shadow: 0 0 0 6px rgba(24,169,87,.65), 0 0 32px rgba(24,169,87,.55); }
          50%  { box-shadow: 0 0 0 9px rgba(24,169,87,.35), 0 0 22px rgba(24,169,87,.35); }
          100% { box-shadow: 0 0 0 6px rgba(24,169,87,.65), 0 0 32px rgba(24,169,87,.55); }
        }
      `}</style>
    </div>
  );
}








