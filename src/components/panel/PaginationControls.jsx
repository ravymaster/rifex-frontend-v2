// src/components/panel/PaginationControls.jsx
// RIFEX PANEL SCALABILITY (2026-09-05) — control de paginación tradicional
// compartido entre Mis Inscripciones, Mis Eventos y el detalle de una
// inscripción (participantes). Nunca infinite scroll. Renderiza null si
// totalPages <= 1 (sección 4/5 del mandato: "si hay <= PAGE_SIZE, no
// mostrar controles innecesarios"). Ventana compacta de números de
// página para no desbordar en móvil (sección 13).
function pageWindow(page, totalPages) {
  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const withGaps = [];
  for (let i = 0; i < list.length; i++) {
    if (i > 0 && list[i] - list[i - 1] > 1) withGaps.push('…');
    withGaps.push(list[i]);
  }
  return withGaps;
}

export default function PaginationControls({ page, totalPages, onChange, busy = false }) {
  if (!totalPages || totalPages <= 1) return null;
  const items = pageWindow(page, totalPages);

  const btnStyle = (active) => ({
    minWidth: 32,
    padding: '7px 10px',
    borderRadius: 8,
    border: active ? 'none' : '1px solid #d1d5db',
    background: active ? '#1e3a8a' : '#fff',
    color: active ? '#fff' : '#0f172a',
    fontWeight: 700,
    fontSize: 13,
    cursor: active ? 'default' : 'pointer',
  });

  return (
    <nav
      aria-label="Paginación"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 }}
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={busy || page <= 1}
        style={{ ...btnStyle(false), opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'default' : 'pointer' }}
      >
        ← Anterior
      </button>
      {items.map((it, i) =>
        it === '…' ? (
          <span key={`gap-${i}`} style={{ padding: '0 4px', color: '#94a3b8', fontSize: 13 }}>…</span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => onChange(it)}
            disabled={busy || it === page}
            style={btnStyle(it === page)}
          >
            {it}
          </button>
        )
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={busy || page >= totalPages}
        style={{ ...btnStyle(false), opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'default' : 'pointer' }}
      >
        Siguiente →
      </button>
    </nav>
  );
}
