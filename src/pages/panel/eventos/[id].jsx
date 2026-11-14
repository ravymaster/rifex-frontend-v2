// src/pages/panel/eventos/[id].jsx
// EVENT-1 (Fase 13) — gestión mínima: datos, tipos de entrada, publicar,
// cancelar. EVENT-5 (analytics + export XLSX) agregado como sección nueva,
// sin reemplazar el resumen EVENT-2/EVENT-4 ya existente arriba.
//
// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — SSR AUTH HARDENING:
// mismo boundary real certificado en panel/inscripciones/[id].jsx.
// `next` se construye desde un prefijo literal fijo + el `id` de la
// ruta, saneado con sanitizeNextPath — nunca desde ctx.query, así que un
// id adversarial no puede producir una redirección fuera del origen.
// Autenticación únicamente: ownership real de este evento sigue siendo
// autoridad exclusiva de cada endpoint /api/events/[id]/*, sin cambios.
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { sanitizeNextPath } from '@/lib/countryPolicy';

export async function getServerSideProps(ctx) {
  const s = getSupabaseServer(ctx.req, ctx.res);
  const id = String(ctx.params?.id || '');
  const next = sanitizeNextPath(`/panel/eventos/${id}`, '/panel/eventos');
  let user = null;
  try {
    const { data } = await s.auth.getUser();
    user = data?.user || null;
  } catch (_) {
    user = null;
  }
  if (!user) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(next)}`, permanent: false } };
  }
  return { props: {} };
}

const STATUS_LABEL = { draft: 'Borrador', published: 'Publicado', cancelled: 'Cancelado' };

function fmtPct(rate) {
  if (rate === null || rate === undefined) return '—';
  return `${Math.round(rate * 1000) / 10}%`;
}
const STAFF_STATUS_LABEL = { active: 'Activo', revoked: 'Revocado' };

function fmtCLP(cents) {
  return Math.round((cents || 0) / 100).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

export default function PanelEventoDetalle() {
  const router = useRouter();
  const { id } = router.query;
  const [token, setToken] = useState(null);
  const [event, setEvent] = useState(null);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [staffError, setStaffError] = useState(null);
  const [staffBusy, setStaffBusy] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState(null);

  async function loadAnalytics(tok) {
    try {
      const res = await fetch(`/api/events/${id}/analytics`, { headers: { Authorization: `Bearer ${tok}` } });
      const data = await res.json();
      if (res.ok && data.ok) { setAnalytics(data); setAnalyticsError(null); }
      else setAnalyticsError(data.error || 'No se pudo cargar analytics');
    } catch {
      setAnalyticsError('No se pudo cargar analytics');
    }
  }

  async function downloadExcelReport() {
    setExportBusy(true); setExportError(null);
    try {
      const res = await fetch(`/api/events/${id}/analytics/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'No se pudo generar el reporte');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match ? match[1] : 'rifex-analytics.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e.message || 'No se pudo generar el reporte');
    } finally {
      setExportBusy(false);
    }
  }

  async function loadStaff(tok) {
    try {
      const res = await fetch(`/api/events/${id}/staff`, { headers: { Authorization: `Bearer ${tok}` } });
      const data = await res.json();
      if (res.ok && data.ok) setStaff(data.items || []);
    } catch { /* silencioso — sección secundaria del panel */ }
  }

  async function load(tok) {
    try {
      const [evRes, ttRes, sumRes] = await Promise.all([
        fetch(`/api/events/${id}`, { headers: { Authorization: `Bearer ${tok}` } }),
        fetch(`/api/events/${id}/ticket-types`, { headers: { Authorization: `Bearer ${tok}` } }),
        fetch(`/api/events/${id}/orders-summary`, { headers: { Authorization: `Bearer ${tok}` } }),
      ]);
      const evData = await evRes.json();
      if (!evRes.ok || !evData.ok) throw new Error(evData.error || 'No se pudo cargar el evento');
      setEvent(evData.event);
      const ttData = await ttRes.json();
      if (ttRes.ok && ttData.ok) setTicketTypes(ttData.items || []);
      const sumData = await sumRes.json();
      if (sumRes.ok && sumData.ok) setSummary(sumData);
      await loadStaff(tok);
      await loadAnalytics(tok);
    } catch (e) {
      setError(e.message || 'No se pudo cargar el evento');
    }
  }

  async function addStaff(e) {
    e.preventDefault();
    setStaffError(null);
    const email = staffEmail.trim();
    if (!email) { setStaffError('Ingresa un email.'); return; }
    setStaffBusy(true);
    try {
      const res = await fetch(`/api/events/${id}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const map = {
          user_not_found: 'No existe una cuenta Rifex con ese email.',
          already_staff: 'Ese colaborador ya está activo en este evento.',
          already_organizer: 'Esa cuenta ya es la organizadora del evento.',
          invalid_email: 'Email inválido.',
        };
        throw new Error(map[data.error] || data.error || 'No se pudo agregar');
      }
      setStaffEmail('');
      await loadStaff(token);
    } catch (e) {
      setStaffError(e.message || 'No se pudo agregar');
    } finally {
      setStaffBusy(false);
    }
  }

  async function setStaffStatus(staffId, status) {
    setStaffBusy(true);
    try {
      const res = await fetch(`/api/events/${id}/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo actualizar');
      await loadStaff(token);
    } catch (e) {
      setStaffError(e.message || 'No se pudo actualizar');
    } finally {
      setStaffBusy(false);
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
      <Layout noindex title="Evento — Rifex">
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : <p>Cargando…</p>}
        </div>
      </Layout>
    );
  }

  return (
    <Layout noindex title={`${event.title} — Panel Eventos`}>
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
          {event.address && <p style={{ margin: '0 0 6px', fontSize: 14 }}><strong>Dirección:</strong> {event.address}</p>}
          <p style={{ margin: 0, fontSize: 14 }}><strong>Aforo:</strong> {event.capacity ?? 'No definido'}</p>
        </div>

        {summary && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 18, marginBottom: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Entradas vendidas</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{summary.tickets.sold}/{summary.tickets.total}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Reservadas ahora</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{summary.tickets.reserved}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Recaudación (bruto)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{fmtCLP(summary.revenue.gross_cents)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Comisión Rifex</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{fmtCLP(summary.revenue.platform_fee_cents)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Neto estimado</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#15803d' }}>{fmtCLP(summary.revenue.net_cents)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Ingresaron</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{summary.tickets.checked_in ?? 0}/{summary.tickets.issued}</div>
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>Tipos de entrada</h2>
        <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
          {ticketTypes.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13.5 }}>Sin tipos de entrada.</p>}
          {ticketTypes.map((t) => {
            const emitted = summary?.ticket_types?.find((x) => x.id === t.id)?.issued ?? null;
            const discrepancy = emitted !== null && emitted !== t.quantity_sold;
            const available = Math.max(0, (t.quantity_total || 0) - (t.quantity_sold || 0) - (t.quantity_reserved || 0));
            return (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                <span style={{ fontSize: 13.5, color: discrepancy ? '#b45309' : '#64748b' }}>
                  {t.quantity_sold}/{t.quantity_total} vendidas · {available} disponibles{t.quantity_reserved > 0 ? ` · ${t.quantity_reserved} reservadas` : ''}
                  {emitted !== null ? ` · ${emitted} emitidas` : ''}
                  {discrepancy ? ' ⚠' : ''}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href={`/eventos/${event.id}`} style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff', color: '#0f172a', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>Ver página pública</Link>
          {event.status === 'draft' && (
            <button onClick={publish} disabled={busy} style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
              Publicar
            </button>
          )}
          <Link href={`/panel/eventos/${event.id}/scanner`} style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
            Abrir scanner
          </Link>
          {event.status !== 'cancelled' && (
            <button onClick={cancelEvent} disabled={busy} style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
              Cancelar evento
            </button>
          )}
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '24px 0 12px' }}>Personal de acceso</h2>
        {staffError && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, marginBottom: 12 }}>{staffError}</div>}
        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          {staff.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13.5 }}>Sin personal adicional. Tú (organizador) siempre puedes operar el scanner.</p>}
          {staff.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 16px', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.user_email_snapshot || s.user_id}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Rol: puerta</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: s.status === 'active' ? '#dcfce7' : '#f1f5f9', color: s.status === 'active' ? '#15803d' : '#64748b' }}>
                  {STAFF_STATUS_LABEL[s.status] || s.status}
                </span>
                {s.status === 'active' ? (
                  <button onClick={() => setStaffStatus(s.id, 'revoked')} disabled={staffBusy} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                    Revocar
                  </button>
                ) : (
                  <button onClick={() => setStaffStatus(s.id, 'active')} disabled={staffBusy} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #bbf7d0', background: '#fff', color: '#15803d', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                    Reactivar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={addStaff} style={{ display: 'flex', gap: 8, marginBottom: 30, flexWrap: 'wrap' }}>
          <input
            type="email"
            value={staffEmail}
            onChange={(e) => setStaffEmail(e.target.value)}
            placeholder="email@ejemplo.com"
            style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 12, border: '1px solid #d1d5db', fontSize: 13.5 }}
          />
          <button type="submit" disabled={staffBusy} style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: '#1e3a8a', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
            + Agregar como puerta
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '30px 0 12px', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Analytics</h2>
          <button onClick={downloadExcelReport} disabled={exportBusy} style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
            {exportBusy ? 'Generando…' : 'Descargar reporte Excel'}
          </button>
        </div>
        {exportError && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, marginBottom: 14 }}>{exportError}</div>}
        {analyticsError && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, marginBottom: 14 }}>{analyticsError}</div>}

        {analytics && (
          <>
            {(analytics.analytics.approved_unfulfilled_alert || analytics.analytics.refund_required_alert) && (
              <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 13.5, marginBottom: 16, fontWeight: 600 }}>
                {analytics.analytics.approved_unfulfilled_alert && <div>⚠ Hay órdenes aprobadas (comisión ya cobrada) que nunca emitieron entradas — revisa "Aprobada sin emitir" abajo.</div>}
                {analytics.analytics.refund_required_alert && <div>⚠ Hay órdenes marcadas con reembolso pendiente (refund_required).</div>}
              </div>
            )}

            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: '#64748b', margin: '0 0 8px' }}>Operacional</h3>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 18, marginBottom: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
              {[
                ['Aforo del evento', analytics.operational.event_capacity ?? 'No definido'],
                ['Capacidad configurada (tipos)', analytics.operational.capacity],
                ['Vendidas', analytics.operational.sold],
                ['Disponibles', analytics.operational.available_to_sell],
                ['Emitidas totales', analytics.operational.emitted_total],
                ['Válidas', analytics.operational.valid],
                ['Anuladas', analytics.operational.voided],
                ['Anuladas usadas antes de anularse', analytics.operational.voided_used_before_void],
                ['Ingresadas', analytics.operational.checked_in],
                ['Pendientes de ingreso', analytics.operational.pending_check_in],
                ['% asistencia', fmtPct(analytics.operational.attendance_rate)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: label === 'Anuladas usadas antes de anularse' && value > 0 ? '#b91c1c' : '#0f172a' }}>{value}</div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: '#64748b', margin: '0 0 8px' }}>Financiero</h3>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 18, marginBottom: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
              {[
                ['Recaudación aprobada total', fmtCLP(analytics.financial.gross_approved_total_cents)],
                ['Recaudación cumplida', fmtCLP(analytics.financial.gross_fulfilled_cents)],
                ['Aprobada sin emitir', fmtCLP(analytics.financial.gross_unfulfilled_cents)],
                ['Comisión Rifex total', fmtCLP(analytics.financial.commission_total_cents)],
                ['Comisión sin fulfillment', fmtCLP(analytics.financial.commission_unfulfilled_cents)],
                ['Neto estimado (no conciliado con MP)', fmtCLP(analytics.financial.net_estimated_cents)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: (label === 'Aprobada sin emitir' || label === 'Comisión sin fulfillment') && analytics.financial.gross_unfulfilled_cents > 0 ? '#b91c1c' : '#0f172a' }}>{value}</div>
                </div>
              ))}
              {analytics.financial.refund_required_count > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Refund requerido</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#b91c1c' }}>{analytics.financial.refund_required_count} orden(es) · {fmtCLP(analytics.financial.refund_required_cents)}</div>
                </div>
              )}
            </div>

            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: '#64748b', margin: '0 0 8px' }}>Desglose por tipo de entrada</h3>
            <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
              {analytics.analytics.by_ticket_type.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13.5 }}>Sin tipos de entrada.</p>}
              {analytics.analytics.by_ticket_type.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 16px', fontSize: 13.5 }}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <span style={{ color: '#64748b' }}>{t.sold}/{t.capacity} vendidas · {t.available} disponibles · {t.emitted_total} emitidas · {t.checked_in} ingresadas</span>
                </div>
              ))}
            </div>

            {analytics.analytics.sales_by_date.length > 0 && (
              <>
                <h3 style={{ fontSize: 13.5, fontWeight: 700, color: '#64748b', margin: '0 0 8px' }}>Ventas por fecha ({analytics.event.timezone})</h3>
                <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
                  {analytics.analytics.sales_by_date.map((d) => (
                    <div key={d.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <span>{d.date}</span>
                      <span style={{ color: '#64748b' }}>{d.orders} orden(es) · {fmtCLP(d.gross_cents)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {analytics.analytics.checkins_by_hour.length > 0 && (
              <>
                <h3 style={{ fontSize: 13.5, fontWeight: 700, color: '#64748b', margin: '0 0 8px' }}>Check-ins por hora ({analytics.event.timezone})</h3>
                <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
                  {analytics.analytics.checkins_by_hour.map((h) => (
                    <div key={h.hour} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <span>{h.hour}</span>
                      <span style={{ color: '#64748b' }}>{h.count} check-in(s)</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: '#64748b', margin: '0 0 8px' }}>Actividad de organizador y personal</h3>
            <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
              {analytics.analytics.staff_activity.map((a) => (
                <div key={a.user_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                  <span>{a.is_organizer ? 'Organizador' : (a.email_snapshot || 'Personal de acceso')}</span>
                  <span style={{ color: '#64748b' }}>{a.checkins_count} check-in(s) registrados</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
