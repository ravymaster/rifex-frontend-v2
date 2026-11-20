// src/pages/eventos/orden/[token].jsx
// EVENT-3 (Fase 9-10) — página persistente "mi orden" para el comprador
// guest, distinta de las páginas transitorias de resultado de pago
// (/eventos/pago/*). Reutiliza el mismo access_token opaco de EVENT-2.
// Mobile-first: cada ticket es su propia card con su propio QR — nunca un
// único QR para todas las entradas.
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
function fmtCLP(cents) {
  return Math.round((cents || 0) / 100).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

const ORDER_STATUS_COPY = {
  pending: { title: 'Confirmando tu pago…', body: 'Estamos confirmando tu pago con Mercado Pago.' },
  paid: { title: 'Pago confirmado', body: null },
  approved_unfulfilled: { title: 'Pago recibido — revisión pendiente', body: 'Necesitamos revisar tu compra manualmente antes de confirmarla. Te contactaremos a tu email.' },
  expired: { title: 'La reserva expiró', body: 'El tiempo para completar el pago se agotó.' },
  cancelled: { title: 'Compra cancelada', body: 'Esta orden fue cancelada.' },
};

export default function OrdenComprador() {
  const router = useRouter();
  const { token } = router.query;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/events/orders/${token}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.ok) { setError(true); setLoading(false); return; }
        setData(body);
        setLoading(false);
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    }
    load();
    // Sigue consultando mientras no haya tickets emitidos (pago pendiente
    // o emisión en curso) — mismo patrón de polling ya usado en las
    // páginas de resultado de pago.
    const timer = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [token]);

  if (loading) {
    return (
      <Layout title="Mi orden — Rifex Eventos">
        <div style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }}><p>Cargando…</p></div>
      </Layout>
    );
  }
  if (error || !data) {
    return (
      <Layout title="Orden no encontrada — Rifex Eventos">
        <div style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>No encontramos tu compra</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>Verifica el enlace o contacta al organizador con tu comprobante de pago.</p>
        </div>
      </Layout>
    );
  }

  const { order, event, tickets } = data;
  const statusCopy = ORDER_STATUS_COPY[order.status] || ORDER_STATUS_COPY.pending;
  const hasTickets = tickets && tickets.length > 0;

  return (
    <Layout title={`Tus entradas — ${event?.title || 'Rifex Eventos'}`}>
      <div style={{ maxWidth: 480, margin: '24px auto', padding: '0 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>Tus entradas</h1>
        {event && (
          <>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1e3a8a', margin: '4px 0 2px' }}>{event.title}</p>
            <p style={{ fontSize: 13.5, color: '#64748b', margin: 0 }}>{fmtDateTime(event.starts_at, event.timezone)}</p>
            {event.venue_name && <p style={{ fontSize: 13.5, color: '#64748b', margin: 0 }}>{event.venue_name}</p>}
          </>
        )}

        {!hasTickets && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 18, marginTop: 16, textAlign: 'center' }}>
            <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>{statusCopy.title}</p>
            {statusCopy.body && <p style={{ fontSize: 13.5, color: '#64748b', margin: 0 }}>{statusCopy.body}</p>}
          </div>
        )}

        {hasTickets && (
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            {tickets.map((t) => (
              <div key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 18, textAlign: 'center' }}>
                <p style={{ fontWeight: 700, color: '#0f172a', fontSize: 15, margin: '0 0 2px' }}>{t.ticket_type_name_snapshot}</p>
                <p style={{ fontSize: 12.5, color: '#94a3b8', fontFamily: 'monospace', margin: '0 0 12px' }}>{t.ticket_number}</p>
                {t.status === 'void' ? (
                  <p style={{ color: '#b91c1c', fontWeight: 700, fontSize: 13.5 }}>Entrada anulada</p>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/events/tickets/${t.qr_token}/qr.png`}
                      alt={`QR de ${t.ticket_number}`}
                      style={{ width: '100%', maxWidth: 260, borderRadius: 12, border: '1px solid #e5e7eb' }}
                    />
                    <a
                      href={`/api/events/tickets/${t.qr_token}/qr.png`}
                      download
                      style={{ display: 'inline-block', marginTop: 12, padding: '8px 16px', borderRadius: 999, border: '1px solid #d1d5db', color: '#0f172a', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}
                    >
                      Descargar
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {order.status === 'paid' && (
          <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, background: '#f8fafc', fontSize: 13, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
            <span>Total pagado</span>
            <strong style={{ color: '#0f172a' }}>{fmtCLP(order.total_cents)}</strong>
          </div>
        )}
      </div>
    </Layout>
  );
}
