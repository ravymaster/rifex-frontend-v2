// src/components/EventoPagoResultado.jsx
// EVENT-2/EVENT-3 (Fase 17/18) — compartido por
// /eventos/pago/{exito,pendiente,error}. Nunca afirma "tu entrada está
// lista" hasta que los tickets existen de verdad (tickets.length>0 en la
// respuesta autoritativa de /api/events/orders/[token], nunca solo por
// order.status==='paid' — el pago y la emisión son estados separados, ver
// eventFulfillment.js). Nunca confía en el parámetro de vuelta de MP
// (?order=&token=) como prueba de pago.
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import Layout from '@/components/Layout';

function copyFor(status, hasTickets) {
  if (status === 'paid' && hasTickets) {
    return { title: '¡Listo!', body: 'Tu pago fue aprobado y tus entradas ya están disponibles.', cta: true };
  }
  if (status === 'paid') {
    return { title: 'Pago confirmado', body: 'Estamos preparando tus entradas — esto puede tardar unos segundos.' };
  }
  const STATIC = {
    pending: { title: 'Confirmando tu pago…', body: 'Estamos confirmando tu pago con Mercado Pago.' },
    approved_unfulfilled: { title: 'Pago recibido — revisión pendiente', body: 'Pago recibido, pero necesitamos revisar tu compra manualmente antes de confirmarla. Te contactaremos a tu email.' },
    expired: { title: 'La reserva expiró', body: 'El tiempo para completar el pago se agotó y las entradas fueron liberadas. Si alcanzaste a pagar, contáctanos con tu comprobante.' },
    cancelled: { title: 'Compra cancelada', body: 'Esta orden fue cancelada.' },
    not_found: { title: 'No encontramos tu compra', body: 'Verifica el enlace o contacta al organizador con tu comprobante de pago.' },
  };
  return STATIC[status] || STATIC.pending;
}

export default function EventoPagoResultado({ kind }) {
  const router = useRouter();
  const { order: orderId, token } = router.query;
  const [order, setOrder] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/events/orders/${token}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.ok) {
          setOrder(data.order);
          setTickets(data.tickets || []);
          setLoading(false);
          // Deja de sondear solo cuando ya no hay nada más que esperar:
          // un estado terminal sin emisión pendiente (expired/cancelled/
          // approved_unfulfilled), o paid CON tickets ya emitidos. 'paid'
          // sin tickets sigue sondeando — cada request reintenta la
          // emisión lazy (ver eventFulfillment.js).
          const doneWaiting = ['expired', 'cancelled', 'approved_unfulfilled'].includes(data.order.status)
            || (data.order.status === 'paid' && (data.tickets || []).length > 0);
          if (doneWaiting && pollRef.current) clearInterval(pollRef.current);
        } else {
          setOrder(null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    poll();
    pollRef.current = setInterval(poll, 3000);
    const stopAfter = setTimeout(() => pollRef.current && clearInterval(pollRef.current), 60_000);
    return () => { cancelled = true; clearInterval(pollRef.current); clearTimeout(stopAfter); };
  }, [token]);

  const status = order?.status || (kind === 'error' && !loading ? 'not_found' : 'pending');
  const copy = copyFor(status, tickets.length > 0);

  return (
    <Layout title={`${copy.title} — Rifex Eventos`}>
      <div style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>{copy.title}</h1>
        <p style={{ color: '#475569', fontSize: 14.5, lineHeight: 1.6, marginBottom: 20 }}>{copy.body}</p>
        {order && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 18, textAlign: 'left', fontSize: 13.5, color: '#334155' }}>
            <p style={{ margin: '0 0 6px' }}><strong>Orden:</strong> {orderId}</p>
            <p style={{ margin: 0 }}><strong>Total:</strong> {Math.round((order.total_cents || 0) / 100).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}</p>
          </div>
        )}
        {copy.cta && token && (
          <p style={{ marginTop: 20 }}>
            <Link href={`/eventos/orden/${token}`} style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 999, background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Ver mis entradas
            </Link>
          </p>
        )}
        <p style={{ marginTop: 24 }}>
          <Link href="/eventos" style={{ color: '#1e3a8a', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>← Volver a Eventos</Link>
        </p>
      </div>
    </Layout>
  );
}
