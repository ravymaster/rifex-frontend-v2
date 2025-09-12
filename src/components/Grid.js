import { useEffect, useState, useMemo } from 'react';

export default function Grid({ raffleId, priceCLP, buyerEmail }) {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  // Banner de bienvenida una sola vez por comprador/raffle
  useEffect(() => {
    const key = `rf_seen_${raffleId}_${buyerEmail}`;
    const seen = localStorage.getItem(key);
    if (!seen) {
      setShowWelcome(true);
      localStorage.setItem(key, '1');
    }
  }, [raffleId, buyerEmail]);

  // Cargar tickets
  useEffect(() => {
    const fetchTickets = async () => {
      const res = await fetch(`/api/rifas/${raffleId}/tickets`);
      const data = await res.json();
      setTickets(data.tickets || []);
    };
    fetchTickets();
  }, [raffleId]);

  // Total CLP
  const total = useMemo(
    () => selected.length * priceCLP,
    [selected, priceCLP]
  );

  // Toggle selección de número
  function toggle(n, status) {
    if (status !== 'available') return;
    setSelected(s =>
      s.includes(n) ? s.filter(x => x !== n) : [...s, n]
    );
  }

  // Iniciar pago en MP
  async function pay() {
    if (!selected.length) return;
    setLoading(true);
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raffleId,
        numbers: selected,
        buyerEmail
      })
    });
    const data = await res.json();
    setLoading(false);

    if (data?.init_point) {
      window.location.href = data.init_point;
    } else {
      alert('No se pudo iniciar el pago');
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      {showWelcome && (
        <div style={{ position: 'relative', border: '1px solid #ccc', padding: 16, borderRadius: 8, marginBottom: 20, background: '#fff' }}>
          <button
            onClick={() => setShowWelcome(false)}
            style={{
              position: 'absolute',
              top: -10,
              right: -10,
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: 'none',
              background: 'red',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
          <h3>¡Bienvenido!</h3>
          <p>Elige tus números y paga seguro con Mercado Pago.</p>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
          gap: 8
        }}
      >
        {tickets.map(t => (
          <button
            key={t.number}
            onClick={() => toggle(t.number, t.status)}
            disabled={t.status !== 'available'}
            style={{
              height: 50,
              borderRadius: 6,
              border: '1px solid #ccc',
              background:
                t.status === 'sold'
                  ? '#ddd'
                  : t.status === 'pending'
                  ? '#fce96a'
                  : selected.includes(t.number)
                  ? '#a7f3d0'
                  : '#fff',
              textDecoration: t.status === 'sold' ? 'line-through' : 'none',
              cursor: t.status === 'available' ? 'pointer' : 'not-allowed'
            }}
          >
            {t.number}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><strong>Total:</strong> ${total.toLocaleString('es-CL')}</div>
        <button
          onClick={pay}
          disabled={loading || !selected.length}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: '#18A957',
            color: '#fff',
            cursor: loading || !selected.length ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Redirigiendo…' : 'Pagar con Mercado Pago'}
        </button>
      </div>
    </div>
  );
}
