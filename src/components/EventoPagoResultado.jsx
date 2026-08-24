// src/components/EventoPagoResultado.jsx
// EVENT-2 (Fase 17) — compartido por /eventos/pago/{exito,pendiente,error}.
// NUNCA afirma "tu entrada está lista" — EVENT-2 no emite tickets todavía
// (eso es EVENT-3). Solo muestra confirmación definitiva cuando la
// reconciliación autoritativa (el webhook, verificado contra la API real
// de MP) ya dejó la orden en un estado terminal — nunca confía en el
// parámetro de vuelta de MP (?order=&token=) como prueba de pago.
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import Layout from '@/components/Layout';

const STATUS_COPY = {
  pending: { title: 'Confirmando tu compra…', body: 'Pago recibido. Estamos confirmando tu compra — esto puede tardar unos segundos.' },
  paid: { title: '¡Compra confirmada!', body: 'Tu pago fue aprobado. Pronto recibirás más información sobre tus entradas.' },
  approved_unfulfilled: { title: 'Pago recibido — revisión pendiente', body: 'Tu pago fue aprobado, pero necesitamos revisar tu compra manualmente antes de confirmarla. Te contactaremos a tu email.' },
  expired: { title: 'La reserva expiró', body: 'El tiempo para completar el pago se agotó y las entradas fueron liberadas. Si alcanzaste a pagar, contáctanos con tu comprobante.' },
  cancelled: { title: 'Compra cancelada', body: 'Esta orden fue cancelada.' },
  not_found: { title: 'No encontramos tu compra', body: 'Verifica el enlace o contacta al organizador con tu comprobante de pago.' },
};

export default function EventoPagoResultado({ kind }) {
  const router = useRouter();
  const { order: orderId, token } = router.query;
  const [order, setOrder] = useState(null);
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
          setLoading(false);
          // Deja de sondear una vez la orden llega a un estado terminal —
          // 'pending' es el único que sigue sondeando (esperando al webhook).
          if (data.order.status !== 'pending' && pollRef.current) {
            clearInterval(pollRef.current);
          }
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
  const copy = STATUS_COPY[status] || STATUS_COPY.pending;

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
        <p style={{ marginTop: 24 }}>
          <Link href="/eventos" style={{ color: '#1e3a8a', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>← Volver a Eventos</Link>
        </p>
      </div>
    </Layout>
  );
}
