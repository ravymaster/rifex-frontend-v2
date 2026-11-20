// src/pages/panel/medidor-qr/[id].jsx
// MEDIDOR QR V1 — dashboard privado (sección 11 del mandato). PSCG:
// PRIVATE_AUTHENTICATED, ssr_redirect desde el primer commit. Números
// siempre reales desde /api/medidor-qr/[id] (GET), nunca hardcodeados.
// Funnel completo: Escaneos -> Respuestas -> Clics al destino
// (extensión del mandato), cada métrica etiquetada según lo que
// realmente mide (sección 8).
//
// EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1: sección "Editar"
// contra PATCH /api/medidor-qr/[id]. name/destino/fechas siempre
// editables; pregunta/alternativas SOLO si metrics.response_count===0
// (el servidor es la autoridad real — esto solo evita mostrar campos
// que la API rechazaría, punto 7 del mandato).
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { sanitizeNextPath } from '@/lib/countryPolicy';

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
    const id = String(ctx.params?.id || '');
    const next = sanitizeNextPath(`/panel/medidor-qr/${id}`);
    return { redirect: { destination: `/login?next=${encodeURIComponent(next)}`, permanent: false } };
  }
  return { props: {} };
}

const STATUS_LABEL = { active: 'Activo', closed: 'Cerrado' };
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13.5 };
const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 4 };

function toLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MedidorQrDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [token, setToken] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editErr, setEditErr] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async (accessToken, medidorId) => {
    try {
      const res = await fetch(`/api/medidor-qr/${medidorId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || 'No se pudo cargar el Medidor QR');
      setData(body);
      setError(null);
    } catch (e) {
      setError(e.message || 'No se pudo cargar el Medidor QR');
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const s = session?.session;
      if (!s) { router.push(`/login?next=${encodeURIComponent(`/panel/medidor-qr/${id}`)}`); return; }
      setToken(s.access_token);
      await load(s.access_token, id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function closeMedidor() {
    if (!token || !id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/medidor-qr/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'closed' }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || 'No se pudo cerrar el Medidor');
      await load(token, id);
    } catch (e) {
      setError(e.message || 'No se pudo cerrar el Medidor');
    } finally {
      setBusy(false);
    }
  }

  function openEdit() {
    if (!data) return;
    const m = data.medidor;
    setEditForm({
      name: m.name || '',
      question: m.question || '',
      options: Array.isArray(m.options) ? [...m.options] : ['', ''],
      measurement_start: toLocalInputValue(m.measurement_start),
      measurement_end: toLocalInputValue(m.measurement_end),
      wantsDestination: !!m.destination_url,
      destination_url: m.destination_url || '',
      destination_button_label: m.destination_button_label || '',
    });
    setEditErr(null);
    setEditing(true);
  }

  function updateEditOption(i, value) {
    setEditForm((prev) => ({ ...prev, options: prev.options.map((o, idx) => (idx === i ? value : o)) }));
  }
  function addEditOption() {
    setEditForm((prev) => (prev.options.length < 4 ? { ...prev, options: [...prev.options, ''] } : prev));
  }
  function removeEditOption(i) {
    setEditForm((prev) => (prev.options.length > 2 ? { ...prev, options: prev.options.filter((_, idx) => idx !== i) } : prev));
  }

  async function saveEdit() {
    if (!token || !id || !editForm) return;
    setEditErr(null);

    const locked = data.metrics.response_count > 0;
    const name = editForm.name.trim();
    if (!name) { setEditErr('El nombre interno es obligatorio.'); return; }
    if (new Date(editForm.measurement_end) <= new Date(editForm.measurement_start)) {
      setEditErr('La fecha de término debe ser posterior al inicio.');
      return;
    }
    if (editForm.wantsDestination && !editForm.destination_url.trim()) {
      setEditErr('Ingresa una URL de destino o desmarca la opción.');
      return;
    }

    const payload = {
      name,
      measurement_start: new Date(editForm.measurement_start).toISOString(),
      measurement_end: new Date(editForm.measurement_end).toISOString(),
      destination_url: editForm.wantsDestination ? editForm.destination_url.trim() : '',
      destination_button_label: editForm.wantsDestination ? editForm.destination_button_label.trim() : '',
    };
    if (!locked) {
      const cleanOptions = editForm.options.map((o) => o.trim()).filter(Boolean);
      if (!editForm.question.trim()) { setEditErr('La pregunta es obligatoria.'); return; }
      if (cleanOptions.length < 2 || cleanOptions.length > 4) { setEditErr('Debes definir entre 2 y 4 respuestas.'); return; }
      if (new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length) {
        setEditErr('Las respuestas no pueden repetirse.');
        return;
      }
      payload.question = editForm.question.trim();
      payload.options = cleanOptions;
    }

    setEditSaving(true);
    try {
      const res = await fetch(`/api/medidor-qr/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.message || body.error || 'No se pudo guardar');
      await load(token, id);
      setEditing(false);
    } catch (e) {
      setEditErr(e.message || 'No se pudo guardar');
    } finally {
      setEditSaving(false);
    }
  }

  if (error) {
    return (
      <Layout noindex title="Medidor QR — Rifex">
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <p style={{ color: '#b91c1c' }}>{error}</p>
          <Link href="/panel/medidor-qr">← Volver a mis Medidores QR</Link>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout noindex title="Medidor QR — Rifex">
        <div style={{ maxWidth: 700, margin: '0 auto' }}><p>Cargando…</p></div>
      </Layout>
    );
  }

  const { medidor, metrics } = data;
  const options = Array.isArray(medidor.options) ? medidor.options : [];
  const locked = metrics.response_count > 0;

  return (
    <Layout noindex title={`${medidor.name || medidor.question} — Rifex`}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <Link href="/panel/medidor-qr" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>← Mis Medidores QR</Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 4px', flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>{medidor.name || medidor.question}</h1>
          <span style={{ fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: medidor.status === 'active' ? '#dcfce7' : '#f1f5f9', color: medidor.status === 'active' ? '#15803d' : '#64748b' }}>
            {STATUS_LABEL[medidor.status] || medidor.status}
          </span>
        </div>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 20px' }}>{medidor.question}</p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
          <a href={`/api/medidor-qr/m/${medidor.slug}/qr.png`} download style={{ padding: '9px 16px', borderRadius: 999, background: '#111827', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            Descargar QR
          </a>
          <a href={`/m/${medidor.slug}`} target="_blank" rel="noopener noreferrer" style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d1d5db', color: '#0f172a', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            Abrir
          </a>
          <button onClick={() => (editing ? setEditing(false) : openEdit())} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff', color: '#0f172a', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {editing ? 'Cancelar edición' : 'Editar'}
          </button>
          {medidor.status !== 'closed' && (
            <button onClick={() => window.confirm('¿Cerrar este Medidor QR? No podrás reabrirlo.') && closeMedidor()} disabled={busy} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Cerrar
            </button>
          )}
          <a href={`/api/medidor-qr/${medidor.id}/export`} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d1d5db', color: '#0f172a', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            Descargar Excel
          </a>
        </div>

        {editing && editForm && (
          <div style={{ border: '2px solid #18A957', borderRadius: 16, padding: 20, marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>Editar Medidor QR</h2>
            {editErr && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{editErr}</p>}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Nombre interno *</label>
              <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} maxLength={120} style={inputStyle} />
            </div>

            {locked ? (
              <p style={{ fontSize: 12.5, color: '#94a3b8', background: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                Este Medidor ya tiene respuestas: la pregunta y las alternativas quedan bloqueadas para no alterar el significado histórico de los resultados.
              </p>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Pregunta *</label>
                  <input value={editForm.question} onChange={(e) => setEditForm((p) => ({ ...p, question: e.target.value }))} maxLength={300} style={inputStyle} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Respuestas (entre 2 y 4) *</label>
                  {editForm.options.map((o, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input value={o} onChange={(e) => updateEditOption(i, e.target.value)} maxLength={80} style={inputStyle} />
                      {editForm.options.length > 2 && (
                        <button type="button" onClick={() => removeEditOption(i)} style={{ padding: '0 12px', borderRadius: 10, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}>×</button>
                      )}
                    </div>
                  ))}
                  {editForm.options.length < 4 && (
                    <button type="button" onClick={addEditOption} style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      + Agregar respuesta
                    </button>
                  )}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={labelStyle}>Inicio de medición *</label>
                <input type="datetime-local" value={editForm.measurement_start} onChange={(e) => setEditForm((p) => ({ ...p, measurement_start: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={labelStyle}>Término de medición *</label>
                <input type="datetime-local" value={editForm.measurement_end} onChange={(e) => setEditForm((p) => ({ ...p, measurement_end: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer', marginBottom: editForm.wantsDestination ? 12 : 0 }}>
                <input type="checkbox" checked={editForm.wantsDestination} onChange={(e) => setEditForm((p) => ({ ...p, wantsDestination: e.target.checked }))} />
                Mostrar un botón para continuar a una URL después de responder
              </label>
              {editForm.wantsDestination && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>URL de destino</label>
                    <input value={editForm.destination_url} onChange={(e) => setEditForm((p) => ({ ...p, destination_url: e.target.value }))} placeholder="https://ejemplo.cl" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Texto del botón (opcional)</label>
                    <input value={editForm.destination_button_label} onChange={(e) => setEditForm((p) => ({ ...p, destination_button_label: e.target.value }))} maxLength={60} style={inputStyle} />
                  </div>
                </>
              )}
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>Cambiar el destino no regenera tu QR: la URL impresa sigue siendo válida.</p>
            </div>

            <button onClick={saveEdit} disabled={editSaving} style={{ padding: '10px 20px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: editSaving ? 'wait' : 'pointer' }}>
              {editSaving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, marginBottom: 24 }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>{metrics.scan_count}</p>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Escaneos</p>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>{metrics.response_count}</p>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Respuestas</p>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>{metrics.conversion_pct}%</p>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Conversión</p>
          </div>
          {medidor.destination_url && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>{metrics.destination_clicks}</p>
              <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Clics al destino ({metrics.destination_click_pct}%)</p>
            </div>
          )}
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>Resultados</h2>
          {metrics.breakdown.every((b) => b.count === 0) && <p style={{ color: '#94a3b8', fontSize: 13.5 }}>Todavía no hay respuestas.</p>}
          {metrics.breakdown.map((b) => (
            <div key={b.option_index} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ flex: '0 0 160px', fontSize: 13.5, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{options[b.option_index]}</span>
              <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${b.percent}%`, height: '100%', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)' }} />
              </div>
              <span style={{ flex: '0 0 70px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{b.count} ({b.percent}%)</span>
            </div>
          ))}
        </div>

        {metrics.daily_evolution.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>Evolución</h2>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
              {metrics.daily_evolution.map((d) => {
                const max = Math.max(...metrics.daily_evolution.map((x) => x.responses), 1);
                const h = Math.max(4, Math.round((d.responses / max) * 90));
                return (
                  <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: h, background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', borderRadius: 4 }} title={`${d.date}: ${d.responses}`} />
                    <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{d.date.slice(5)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
