// src/pages/t/[token].jsx
// EVENT-3 (Fase 12) — resolución pública del QR de un ticket. EL QR NO ES
// EL CHECK-IN: esta página es GET puro, nunca consume/modifica el ticket
// (eso es EVENT-4). Sin PII del comprador, sin payment IDs, sin
// access_token de la orden, sin order_id interno — solo lo necesario para
// que quien lo mire (comprador o portero futuro) confirme que es una
// entrada real de Rifex.
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';

function fmtDateTime(iso, timezone) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: timezone || 'America/Santiago',
    });
  } catch { return ''; }
}

export default function TicketResolver() {
  const router = useRouter();
  const { token } = router.query;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/events/tickets/${token}`);
        const body = await res.json();
        if (!res.ok || !body.ok) {
          setError('not_found');
        } else {
          setData(body);
        }
      } catch {
        setError('error');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <Layout title="Entrada — Rifex">
        <div style={{ maxWidth: 420, margin: '48px auto', textAlign: 'center' }}><p>Cargando…</p></div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout title="Entrada no encontrada — Rifex">
        <div style={{ maxWidth: 420, margin: '48px auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Entrada no encontrada</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>Este código no corresponde a ninguna entrada válida.</p>
        </div>
      </Layout>
    );
  }

  const { ticket, event } = data;
  const isValid = ticket.status === 'valid';

  return (
    <Layout title="Entrada — Rifex Eventos">
      <div style={{ maxWidth: 420, margin: '32px auto', padding: '0 16px' }}>
        <div style={{ border: '2px solid #e5e7eb', borderRadius: 20, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', margin: 0 }}>Rifex Eventos</p>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '10px 0 4px' }}>{event?.title || 'Evento'}</h1>
          {event?.starts_at && <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 4px' }}>{fmtDateTime(event.starts_at, event.timezone)}</p>}
          {event?.venue_name && <p style={{ fontSize: 13.5, color: '#64748b', margin: 0 }}>{event.venue_name}</p>}

          <div style={{ marginTop: 18, padding: '10px 16px', borderRadius: 999, display: 'inline-block', fontWeight: 700, fontSize: 14,
            background: isValid ? '#dcfce7' : '#fee2e2', color: isValid ? '#15803d' : '#b91c1c' }}>
            {isValid ? '✓ Entrada válida' : 'Entrada anulada'}
          </div>

          <p style={{ marginTop: 18, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{ticket.ticket_type_name}</p>
          <p style={{ fontSize: 13.5, color: '#94a3b8', fontFamily: 'monospace' }}>{ticket.ticket_number}</p>
        </div>
      </div>
    </Layout>
  );
}
