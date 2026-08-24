// src/pages/eventos/[id].jsx
// EVENT-1 — Página pública del evento. Sin checkout: el CTA queda
// deshabilitado y explícito ("Venta de entradas próximamente"). Consume
// /api/events/[id] (público si published) y /api/events/[id]/ticket-types.
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useState } from 'react';
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

export default function EventoPublico() {
  const router = useRouter();
  const { id } = router.query;

  const [event, setEvent] = useState(null);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
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
    })();
  }, [id]);

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
          {ticketTypes.map((t) => (
            <div key={t.id} className={styles.ticketCard}>
              <div>
                <div className={styles.ticketName}>{t.name}</div>
                <div className={styles.ticketAvail}>
                  {t.quantity_sold >= t.quantity_total ? 'Agotado' : `${t.quantity_total - t.quantity_sold} disponibles`}
                </div>
              </div>
              <div className={styles.ticketPrice}>{fmtCLP(t.price_cents)}</div>
            </div>
          ))}
        </div>

        <div className={styles.ctaBox}>
          <p className={styles.ctaText}>Venta de entradas próximamente.</p>
          <span className={styles.ctaBtn} aria-disabled="true">Comprar entradas</span>
        </div>
      </div>
    </Layout>
  );
}
