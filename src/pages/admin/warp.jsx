// src/pages/admin/warp.jsx
// WARP CONVERSACIONAL — "Solicitudes Warp" (admin). Relación comercial
// únicamente: listado, búsqueda, filtro, detalle, cambio de estado, notas
// internas e historial. No es el Control Plane: no crea clientes ni claves en
// Warp, no cobra y no activa nada.
// Boundary SSR idéntico a /admin de PROD (app_metadata.role = 'admin'; sin
// puerta temporal DEV). La autoridad real vive en
// /api/admin/warp-conversacional/* vía resolveAdmin.
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { WARP_PILOT_STATUSES, WARP_PILOT_STATUS_LABEL, siteTypeLabel, WARP_TRAFFIC_OPTIONS } from '@/lib/warpPilotRequest';

export async function getServerSideProps(ctx) {
  const s = getSupabaseServer(ctx.req, ctx.res);
  let user = null;
  try {
    const { data } = await s.auth.getUser();
    user = data?.user || null;
  } catch (_) {
    user = null;
  }
  if (!user) {
    return { redirect: { destination: '/login?next=/admin/warp', permanent: false } };
  }
  if (user.app_metadata?.role !== 'admin') return { redirect: { destination: '/', permanent: false } };
  return { props: {} };
}

const card = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: 16 };
const th = { textAlign: 'left', padding: '10px 12px', fontSize: 12, color: '#6B7280', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #F3F4F6', verticalAlign: 'top' };
const input = { minHeight: 40, padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 10, font: 'inherit', boxSizing: 'border-box' };
const btn = { minHeight: 40, padding: '8px 16px', borderRadius: 999, border: 'none', background: '#1E3A8A', color: '#fff', fontWeight: 700, cursor: 'pointer' };

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' });
  } catch {
    return '—';
  }
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminWarp() {
  const router = useRouter();
  const [list, setList] = useState({ status: 'loading', rows: [], total: 0 });
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ status: '', notes: '' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async (query = q, status = statusFilter) => {
    setList((l) => ({ ...l, status: 'loading' }));
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (status) params.set('status', status);
    try {
      const res = await fetch(`/api/admin/warp-conversacional/solicitudes?${params}`, { headers: await authHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setList({ status: res.status === 401 || res.status === 403 ? 'denied' : 'error', rows: [], total: 0 });
        return;
      }
      setList({ status: 'ok', rows: json.requests || [], total: json.total || 0 });
    } catch {
      setList({ status: 'error', rows: [], total: 0 });
    }
  }, [q, statusFilter]);

  const open = useCallback(async (id) => {
    setMsg('');
    try {
      const res = await fetch(`/api/admin/warp-conversacional/solicitudes/${encodeURIComponent(id)}`, { headers: await authHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setMsg('No se pudo abrir la solicitud.');
        return;
      }
      setDetail(json);
      setForm({ status: json.request.status, notes: json.request.internal_notes || '' });
    } catch {
      setMsg('No se pudo abrir la solicitud.');
    }
  }, []);

  useEffect(() => {
    load('', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = typeof router.query.id === 'string' ? router.query.id : '';
    if (id) open(id);
  }, [router.query.id, open]);

  const save = async () => {
    if (!detail) return;
    setMsg('Guardando…');
    try {
      const res = await fetch(`/api/admin/warp-conversacional/solicitudes/${encodeURIComponent(detail.request.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ status: form.status, internalNotes: form.notes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setMsg(json?.error === 'secret_detected' ? 'Las notas parecen contener una clave o contraseña. No las guardes aquí.' : 'No se pudo guardar el cambio.');
        return;
      }
      setMsg(json.unchanged ? 'Sin cambios.' : 'Cambios guardados.');
      await open(detail.request.id);
      await load();
    } catch {
      setMsg('No se pudo guardar el cambio.');
    }
  };

  const r = detail?.request;
  return (
    <>
      <Head><title>Solicitudes Warp — Admin Rifex</title><meta name="robots" content="noindex, nofollow" /></Head>
      <main style={{ padding: '32px 16px 80px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <Link href="/admin" style={{ fontSize: 13, color: '#6B7280' }}>← Volver al panel admin</Link>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>Solicitudes Warp</h1>
          <p style={{ color: '#6B7280', marginTop: 4 }}>
            Relación comercial del piloto de Warp Conversacional. Cambiar el estado no cobra, no crea claves y no activa nada en Warp.
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); load(); }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '18px 0' }}
            role="search"
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B7280' }}>
              Buscar (empresa, dominio o correo)
              <input style={{ ...input, minWidth: 260 }} value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B7280' }}>
              Estado
              <select style={input} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); load(q, e.target.value); }}>
                <option value="">Todos</option>
                {WARP_PILOT_STATUSES.map((s) => <option key={s} value={s}>{WARP_PILOT_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <button type="submit" style={{ ...btn, alignSelf: 'flex-end' }}>Buscar</button>
          </form>

          {list.status === 'denied' && <p role="alert">No tienes permisos para ver esta sección.</p>}
          {list.status === 'error' && <p role="alert">No se pudo cargar el listado.</p>}
          {list.status === 'loading' && <p role="status">Cargando…</p>}

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <caption style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: '#6B7280' }}>{list.total} solicitud(es)</caption>
                <thead>
                  <tr><th style={th}>ID</th><th style={th}>Dominio</th><th style={th}>Empresa</th><th style={th}>Estado</th><th style={th}>Fecha</th></tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => (
                    <tr key={row.id} style={{ background: r?.id === row.id ? '#EEF2FF' : undefined }}>
                      <td style={td}><button type="button" onClick={() => open(row.id)} style={{ background: 'none', border: 'none', color: '#1E3A8A', fontWeight: 700, cursor: 'pointer', padding: 0 }}>{row.shortId}</button></td>
                      <td style={td}>{row.domain}</td>
                      <td style={td}>{row.company_name}</td>
                      <td style={td}>{row.statusLabel}</td>
                      <td style={td}>{fmtDate(row.created_at)}</td>
                    </tr>
                  ))}
                  {list.status === 'ok' && list.rows.length === 0 && <tr><td style={td} colSpan={5}>Sin solicitudes.</td></tr>}
                </tbody>
              </table>
            </div>

            {r && (
              <section style={card} aria-labelledby="detalle-title">
                <h2 id="detalle-title" style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>{r.domain} · {r.shortId}</h2>
                <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 12px', fontSize: 13, margin: 0 }}>
                  <dt>Empresa</dt><dd style={{ margin: 0 }}>{r.company_name}</dd>
                  <dt>Responsable</dt><dd style={{ margin: 0 }}>{r.contact_name}</dd>
                  <dt>Correo</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{r.contact_email}</dd>
                  <dt>Teléfono</dt><dd style={{ margin: 0 }}>{r.contact_phone || '—'}</dd>
                  <dt>Tipo de sitio</dt><dd style={{ margin: 0 }}>{siteTypeLabel(r.site_type)}</dd>
                  <dt>Tráfico</dt><dd style={{ margin: 0 }}>{WARP_TRAFFIC_OPTIONS.find((t) => t.value === r.estimated_traffic)?.label || '—'}</dd>
                  <dt>Creada</dt><dd style={{ margin: 0 }}>{fmtDate(r.created_at)}</dd>
                  <dt>Términos</dt><dd style={{ margin: 0 }}>{fmtDate(r.terms_accepted_at)}</dd>
                  <dt>Compatibilidad</dt><dd style={{ margin: 0 }}>{fmtDate(r.compatibility_accepted_at)}</dd>
                </dl>
                <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>Objetivo</h3>
                <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>{r.objective}</p>
                <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>Información que debería responder</h3>
                <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>{r.authorized_information}</p>

                <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B7280' }}>
                    Estado
                    <select style={input} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                      {WARP_PILOT_STATUSES.map((s) => <option key={s} value={s}>{WARP_PILOT_STATUS_LABEL[s]}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B7280' }}>
                    Notas internas (no visibles para el cliente)
                    <textarea style={{ ...input, minHeight: 90 }} value={form.notes} maxLength={4000} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                  </label>
                  <button type="button" style={{ ...btn, justifySelf: 'start' }} onClick={save}>Guardar cambios</button>
                  <p role="status" style={{ fontSize: 13, color: '#374151', margin: 0 }}>{msg}</p>
                </div>

                <h3 style={{ fontSize: 14, margin: '16px 0 6px' }}>Historial</h3>
                {detail.history.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>Sin cambios registrados.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {detail.history.map((h, i) => (
                      <li key={i}>
                        {fmtDate(h.created_at)}: {WARP_PILOT_STATUS_LABEL[h.from_status] || '—'} → {WARP_PILOT_STATUS_LABEL[h.to_status] || '—'}{h.notes_changed ? ' (notas actualizadas)' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
          {!r && msg && <p role="status" style={{ fontSize: 13 }}>{msg}</p>}
        </div>
      </main>
    </>
  );
}
