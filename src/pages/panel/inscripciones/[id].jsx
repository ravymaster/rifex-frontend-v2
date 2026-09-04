// src/pages/panel/inscripciones/[id].jsx
// INSCRIPCIONES V1 — panel de administración de UNA actividad. PSCG:
// PRIVATE_AUTHENTICATED, boundary ssr_redirect. Owner-only real
// (verificado server-side en cada endpoint) — este archivo solo refleja
// lo que la API ya protege. Acciones sección 21 del mandato: ver página
// pública, copiar link, ver inscritos, scanner, descargar Excel, editar,
// cerrar/archivar. Nunca muestra métricas financieras (no aplica:
// Inscripciones no cobra).
//
// SSR AUTH HARDENING (2026-09-04): getServerSideProps ahora demuestra
// SESIÓN antes de renderizar (redirect 307 real para anónimos, next
// construido a partir de un literal fijo + el propio id de ruta,
// saneado con sanitizeNextPath como defensa en profundidad — nunca
// puede convertirse en una URL externa, ya que el prefijo
// "/panel/inscripciones/" es siempre literal). Esto es AUTENTICACIÓN,
// no AUTORIZACIÓN: la SSR solo confirma que hay una sesión válida —
// quién es el dueño real de la actividad lo sigue decidiendo,
// exclusivamente, cada endpoint de /api/inscripciones/[id]/* (comparando
// organizer_id server-side) — este boundary nunca reemplaza esa
// verificación, ni intenta resolverla aquí.
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { sanitizeNextPath } from '@/lib/countryPolicy';

export async function getServerSideProps(ctx) {
  const s = getSupabaseServer(ctx.req, ctx.res);
  const id = String(ctx.params?.id || '');
  const next = sanitizeNextPath(`/panel/inscripciones/${id}`, '/panel/inscripciones');
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

const STATUS_LABEL = { draft: 'Borrador', active: 'Activa', closed: 'Cerrada', archived: 'Archivada' };

function fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }); }
  catch { return '—'; }
}

export default function PanelInscripcionDetalle() {
  const router = useRouter();
  const { id } = router.query;
  const [token, setToken] = useState(null);

  const [activity, setActivity] = useState(null);
  const [participants, setParticipants] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editVenueName, setEditVenueName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async (accessToken) => {
    try {
      const [actRes, partRes] = await Promise.all([
        fetch(`/api/inscripciones/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`/api/inscripciones/${id}/participants`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      const actData = await actRes.json();
      if (!actRes.ok || !actData.ok) throw new Error('No se pudo cargar la actividad');
      setActivity(actData.activity);
      setEditTitle(actData.activity.title);
      setEditDescription(actData.activity.description || '');
      setEditVenueName(actData.activity.venue_name || '');
      setEditAddress(actData.activity.address || '');
      setEditInstructions(actData.activity.instructions || '');
      const partData = await partRes.json();
      if (partRes.ok && partData.ok) setParticipants(partData.items || []);
    } catch (e) {
      setError(e.message || 'No se pudo cargar la actividad');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push(`/login?next=/panel/inscripciones/${id}`); return; }
      setToken(session.access_token);
      await load(session.access_token);
    })();
  }, [id, load, router]);

  async function changeStatus(nextStatus) {
    setBusy(true);
    setError(null);
    try {
      const endpoint = nextStatus === 'active' ? 'publish' : 'status';
      const res = await fetch(`/api/inscripciones/${id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: endpoint === 'status' ? JSON.stringify({ status: nextStatus }) : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo actualizar el estado');
      setActivity(data.activity);
    } catch (e) {
      setError(e.message || 'No se pudo actualizar el estado');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/inscripciones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          venue_name: editVenueName.trim() || null,
          address: editAddress.trim() || null,
          instructions: editInstructions.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo guardar');
      setActivity((prev) => ({ ...prev, ...data.activity }));
      setEditing(false);
    } catch (e) {
      setError(e.message || 'No se pudo guardar');
    } finally {
      setSavingEdit(false);
    }
  }

  async function exportXlsx() {
    try {
      const res = await fetch(`/api/inscripciones/${id}/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('No se pudo generar el Excel');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rifex-inscritos-${id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'No se pudo generar el Excel');
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/inscripcion/${id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return <Layout noindex title="Inscripción — Rifex"><p style={{ textAlign: 'center', marginTop: 48 }}>Cargando…</p></Layout>;
  if (error && !activity) return <Layout noindex title="Inscripción — Rifex"><p style={{ textAlign: 'center', marginTop: 48, color: '#b91c1c' }}>{error}</p></Layout>;
  if (!activity) return null;

  const checkedInCount = (participants || []).filter((p) => p.checked_in_at).length;
  const pendingCount = (participants || []).length - checkedInCount;

  return (
    <Layout noindex title={`${activity.title} — Panel Rifex`}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <p style={{ margin: '0 0 12px' }}>
          <Link href="/panel/inscripciones" style={{ color: '#1e3a8a', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>← Mis inscripciones</Link>
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{activity.title}</h1>
          <span style={{ fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#f1f5f9', color: '#475569' }}>
            {STATUS_LABEL[activity.status] || activity.status}
          </span>
        </div>
        <p style={{ color: '#64748b', fontSize: 13.5, marginBottom: 20 }}>{fmtDateTime(activity.starts_at)}</p>

        {error && <div style={{ color: '#b91c1c', fontSize: 13.5, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{activity.registered_count ?? (participants || []).length}/{activity.capacity}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Inscritos</div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d' }}>{checkedInCount}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Asistieron</div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{pendingCount}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Pendientes</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
          {activity.status === 'active' && (
            <a href={`/inscripcion/${id}`} target="_blank" rel="noreferrer" style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d1d5db', color: '#0f172a', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
              Ver página pública
            </a>
          )}
          <button onClick={copyLink} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff', color: '#0f172a', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {copied ? 'Copiado ✓' : 'Copiar link'}
          </button>
          {(activity.status === 'active' || activity.status === 'closed') && (
            <Link href={`/panel/inscripciones/${id}/scanner`} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d1d5db', color: '#0f172a', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
              Scanner
            </Link>
          )}
          <button onClick={exportXlsx} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff', color: '#0f172a', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Descargar Excel
          </button>
          <button onClick={() => setEditing((v) => !v)} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff', color: '#0f172a', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {editing ? 'Cerrar edición' : 'Editar'}
          </button>
          {activity.status === 'draft' && (
            <button onClick={() => changeStatus('active')} disabled={busy} style={{ padding: '9px 16px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Publicar
            </button>
          )}
          {activity.status === 'active' && (
            <button onClick={() => changeStatus('closed')} disabled={busy} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Cerrar inscripciones
            </button>
          )}
          {(activity.status === 'closed' || activity.status === 'draft') && (
            <button onClick={() => changeStatus('archived')} disabled={busy} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Archivar
            </button>
          )}
        </div>

        {editing && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 20, marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>Editar actividad</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Nombre</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={140} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Descripción</label>
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={5000} rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Lugar</label>
                <input value={editVenueName} onChange={(e) => setEditVenueName(e.target.value)} maxLength={200} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Dirección</label>
                <input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} maxLength={200} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Información para los inscritos</label>
              <textarea value={editInstructions} onChange={(e) => setEditInstructions(e.target.value)} maxLength={3000} rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} />
            </div>
            <button onClick={saveEdit} disabled={savingEdit} style={{ padding: '10px 20px', borderRadius: 999, border: 'none', background: '#111827', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
              {savingEdit ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        )}

        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>Inscritos</h2>
        {(!participants || participants.length === 0) && <p style={{ color: '#94a3b8', fontSize: 13.5 }}>Todavía no hay inscritos.</p>}
        {participants && participants.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '8px 10px' }}>Nombre</th>
                  <th style={{ padding: '8px 10px' }}>Email</th>
                  <th style={{ padding: '8px 10px' }}>Teléfono</th>
                  <th style={{ padding: '8px 10px' }}>Inscrito</th>
                  <th style={{ padding: '8px 10px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px' }}>{p.full_name}</td>
                    <td style={{ padding: '8px 10px' }}>{p.email}</td>
                    <td style={{ padding: '8px 10px' }}>{p.phone || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{fmtDateTime(p.registered_at)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {p.checked_in_at
                        ? <span style={{ color: '#15803d', fontWeight: 700 }}>Asistió</span>
                        : <span style={{ color: '#94a3b8' }}>Pendiente</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
