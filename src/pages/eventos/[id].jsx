// src/pages/eventos/[id].jsx
// EVENT-2 (Fase 16-17) — Página pública del evento con selector real de
// entradas y checkout. Compra SIN cuenta (guest): solo pide email/nombre,
// nunca exige login. CTA se deshabilita explícitamente si el organizador
// no tiene Mercado Pago conectado (mp_connected=false) — nunca se ofrece
// una compra que no se puede cobrar.
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/evento.module.css';

function fmtDate(iso, timezone) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone || 'America/Santiago',
    });
  } catch { return new Date(iso).toLocaleDateString('es-CL'); }
}
function fmtTime(iso, timezone) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('es-CL', {
      hour: '2-digit', minute: '2-digit', timeZone: timezone || 'America/Santiago',
    });
  } catch { return ''; }
}
function fmtCLP(cents) {
  return Math.round((cents || 0) / 100).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}
const isValidEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function EventoPublico() {
  const router = useRouter();
  const { id } = router.query;

  const [event, setEvent] = useState(null);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [qty, setQty] = useState({}); // { [ticketTypeId]: number }
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [evRes, ttRes] = await Promise.all([
        fetch(`/api/events/${id}`),
        fetch(`/api/events/${id}/ticket-types`),
      ]);
      const evData = await evRes.json();
      if (!evRes.ok || !evData.ok) throw new Error(evData.error === 'not_found' ? 'Evento no encontrado' : 'No se pudo cargar el evento');
      setEvent(evData.event);
      const ttData = await ttRes.json();
      if (ttRes.ok && ttData.ok) setTicketTypes(ttData.items || []);
    } catch (e) {
      setError(e.message || 'No se pudo cargar el evento');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  // EVENT-2 (Fase 21): liberar reservas vencidas de ESTE evento — mismo
  // patrón lazy ya certificado en rifas/[id].jsx (fetch al cargar +
  // setInterval cada 30s mientras la página sigue abierta).
  useEffect(() => {
    if (!id) return;
    const hit = async () => {
      try {
        const r = await fetch(`/api/events/${id}/expire-orders`);
        const j = await r.json().catch(() => null);
        if (j?.ok && j.released > 0) await load();
      } catch { /* silencioso, best-effort */ }
    };
    hit();
    const timer = setInterval(hit, 30_000);
    return () => clearInterval(timer);
  }, [id, load]);

  function availability(t) {
    return Math.max(0, (t.quantity_total || 0) - (t.quantity_sold || 0) - (t.quantity_reserved || 0));
  }

  function setQtyFor(t, next) {
    const avail = availability(t);
    const clamped = Math.max(0, Math.min(next, avail, t.max_per_order || avail));
    setQty((q) => ({ ...q, [t.id]: clamped }));
  }

  const selectedItems = ticketTypes
    .map((t) => ({ t, quantity: qty[t.id] || 0 }))
    .filter((x) => x.quantity > 0);
  const subtotalCents = selectedItems.reduce((s, x) => s + x.quantity * (x.t.price_cents || 0), 0);
  const mpConnected = event?.mp_connected !== false; // undefined (owner-not-included edge) trata como conectado hasta que el checkout lo re-valide server-side

  async function handleBuy() {
    setBuyError(null);
    if (selectedItems.length === 0) {
      setBuyError('Elige al menos una entrada.');
      return;
    }
    if (!isValidEmail(buyerEmail)) {
      setBuyError('Ingresa un email válido.');
      return;
    }
    setBuying(true);
    try {
      const res = await fetch(`/api/events/${id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedItems.map((x) => ({ ticket_type_id: x.t.id, quantity: x.quantity })),
          buyer_email: buyerEmail,
          buyer_name: buyerName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo iniciar el pago');
      }
      window.location.href = data.url;
    } catch (e) {
      setBuyError(e.message || 'No se pudo iniciar el pago');
      await load(); // refresca disponibilidad — pudo cambiar entre que se cargó la página y se intentó comprar
    } finally {
      setBuying(false);
    }
  }

  if (loading) {
    return (
      <Layout title="Evento — Rifex">
        <div className={styles.wrap}><p>Cargando…</p></div>
      </Layout>
    );
  }
  if (error || !event) {
    return (
      <Layout title="Evento no encontrado — Rifex">
        <div className={styles.wrap}><p>{error || 'Evento no encontrado.'}</p></div>
      </Layout>
    );
  }

  return (
    <Layout title={`${event.title} — Rifex Eventos`} description={event.description || 'Evento en Rifex.'}>
      <Head><meta property="og:title" content={event.title} /></Head>
      <div className={styles.wrap}>
        {event.cover_image_url && <img className={styles.cover} src={event.cover_image_url} alt="" />}
        <h1 className={styles.title}>{event.title}</h1>

        <div className={styles.metaRow}>
          <span className={styles.metaItem}>📅 {fmtDate(event.starts_at, event.timezone)}</span>
          <span className={styles.metaItem}>🕐 {fmtTime(event.starts_at, event.timezone)} hrs</span>
          {event.venue_name && <span className={styles.metaItem}>📍 {event.venue_name}</span>}
        </div>
        {event.address && <p className={styles.metaRow}>{event.address}</p>}

        {event.description && <p className={styles.description}>{event.description}</p>}

        <h2 className={styles.sectionTitle}>Entradas</h2>
        <div className={styles.ticketTypes}>
          {ticketTypes.length === 0 && <p>Aún no hay tipos de entrada publicados.</p>}
          {ticketTypes.map((t) => {
            const avail = availability(t);
            const soldOut = avail <= 0;
            return (
              <div key={t.id} className={styles.ticketCard}>
                <div>
                  <div className={styles.ticketName}>{t.name}</div>
                  <div className={styles.ticketAvail}>{soldOut ? 'Agotado' : `${avail} disponibles`}</div>
                </div>
                <div className={styles.ticketPrice}>{fmtCLP(t.price_cents)}</div>
                {!soldOut && mpConnected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
                    <button type="button" onClick={() => setQtyFor(t, (qty[t.id] || 0) - 1)} disabled={(qty[t.id] || 0) <= 0}
                      style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>−</button>
                    <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{qty[t.id] || 0}</span>
                    <button type="button" onClick={() => setQtyFor(t, (qty[t.id] || 0) + 1)} disabled={(qty[t.id] || 0) >= Math.min(avail, t.max_per_order || avail)}
                      style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!mpConnected && ticketTypes.length > 0 && (
          <div className={styles.ctaBox}>
            <p className={styles.ctaText}>Venta de entradas no disponible por el momento.</p>
          </div>
        )}

        {mpConnected && selectedItems.length > 0 && (
          <div className={styles.ctaBox} style={{ display: 'block' }}>
            <p className={styles.ctaText} style={{ marginBottom: 10 }}>
              {selectedItems.map((x) => `${x.quantity} × ${x.t.name}`).join(' · ')} — <strong>{fmtCLP(subtotalCents)}</strong>
            </p>
            <input
              type="email" placeholder="tu@email.com" value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              style={{ display: 'block', width: '100%', maxWidth: 320, margin: '0 auto 8px', padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }}
            />
            <input
              type="text" placeholder="Tu nombre (opcional)" value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              style={{ display: 'block', width: '100%', maxWidth: 320, margin: '0 auto 12px', padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }}
            />
            {buyError && <p style={{ color: '#b91c1c', fontSize: 13.5, marginBottom: 10 }}>{buyError}</p>}
            <button type="button" onClick={handleBuy} disabled={buying} className={styles.ctaBtn} style={{ cursor: buying ? 'wait' : 'pointer', border: 'none' }}>
              {buying ? 'Redirigiendo a Mercado Pago…' : 'Comprar entradas'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
