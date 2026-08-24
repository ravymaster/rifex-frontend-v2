// src/pages/panel/eventos/[id].jsx
// EVENT-1 (Fase 13) — gestión mínima: datos, tipos de entrada, publicar,
// cancelar. Sin ventas/check-ins/export — eso es EVENT-5.
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

const STATUS_LABEL = { draft: 'Borrador', published: 'Publicado', cancelled: 'Cancelado' };

export default function PanelEventoDetalle() {
  const router = useRouter();
  const { id } = router.query;
  const [token, setToken] = useState(null);
  const [event, setEvent] = useState(null);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load(tok) {
    try {
      const [evRes, ttRes] = await Promise.all([
        fetch(`/api/events/${id}`, { headers: { Authorization: `Bearer ${tok}` } }),
        fetch(`/api/events/${id}/ticket-types`, { headers: { Authorization: `Bearer ${tok}` } }),
      ]);
      const evData = await evRes.json();
      if (!evRes.ok || !evData.ok) throw new Error(evData.error || 'No se pudo cargar el evento');
      setEvent(evData.event);
      const ttData = await ttRes.json();
      if (ttRes.ok && ttData.ok) setTicketTypes(ttData.items || []);
    } catch (e) {
      setError(e.message || 'No se pudo cargar el evento');
    }
  }

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push(`/login?next=/panel/eventos/${id}`); return; }
      setToken(session.access_token);
      load(session.access_token);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  async function publish() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/events/${id}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo publicar');
      setEvent(data.event);
      setNotice('Evento publicado.');
    } catch (e) {
      setError(e.message || 'No se pudo publicar');
    } finally {
      setBusy(false);
    }
  }

  async function cancelEvent() {
    if (!confirm('¿Cancelar este evento? Esta acción no se puede deshacer.')) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo cancelar');
      setEvent(data.event);
      setNotice('Evento cancelado.');
    } catch (e) {
      setError(e.message || 'No se pudo cancelar');
    } finally {
      setBusy(false);
    }
  }

  if (!event) {
    return (
      <Layout title="Evento — Rifex">
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : <p>Cargando…</p>}
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`${event.title} — Panel Eventos`}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <p style={{ marginBottom: 8 }}><Link href="/panel/eventos" style={{ color: '#1e3a8a', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>← Mis eventos</Link></p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{event.title}</h1>
          <span style={{ fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: event.status === 'published' ? '#dcfce7' : event.status === 'cancelled' ? '#fee2e2' : '#f1f5f9', color: event.status === 'published' ? '#15803d' : event.status === 'cancelled' ? '#b91c1c' : '#475569' }}>
            {STATUS_LABEL[event.status] || event.status}
          </span>
        </div>

        {error && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, marginBottom: 14 }}>{error}</div>}
        {notice && <div style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, marginBottom: 14 }}>{notice}</div>}

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: '0 0 6px', fontSize: 14 }}><strong>Inicio:</strong> {new Date(event.starts_at).toLocaleString('es-CL', { timeZone: event.timezone || 'America/Santiago' })}</p>
          <p style={{ margin: '0 0 6px', fontSize: 14 }}><strong>Término:</strong> {new Date(event.ends_at).toLocaleString('es-CL', { timeZone: event.timezone || 'America/Santiago' })}</p>
          {event.venue_name && <p style={{ margin: '0 0 6px', fontSize: 14 }}><strong>Lugar:</strong> {event.venue_name}</p>}
          {event.address && <p style={{ margin: 0, fontSize: 14 }}><strong>Dirección:</strong> {event.address}</p>}
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>Tipos de entrada</h2>
        <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
          {ticketTypes.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13.5 }}>Sin tipos de entrada.</p>}
          {ticketTypes.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
              <span style={{ fontSize: 13.5, color: '#64748b' }}>{t.quantity_sold}/{t.quantity_total} vendidas</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href={`/eventos/${event.id}`} style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff', color: '#0f172a', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>Ver página pública</Link>
          {event.status === 'draft' && (
            <button onClick={publish} disabled={busy} style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
              Publicar
            </button>
          )}
          {event.status !== 'cancelled' && (
            <button onClick={cancelEvent} disabled={busy} style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
              Cancelar evento
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
