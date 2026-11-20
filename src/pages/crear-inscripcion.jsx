// src/pages/crear-inscripcion.jsx
// INSCRIPCIONES V1 — creación de actividad FREE. PSCG: PRIVATE_AUTHENTICATED
// (ssr_redirect). Flujo: completar datos -> guardar -> publicar.
//
// Sección 4 del mandato (regla crítica): el gate server-side de esta
// página usa ÚNICAMENTE assertOnboardingComplete (onboarding general) —
// NUNCA resolveCreationGate/assertCreatorEligible (que exigen RUT/MP).
// Un usuario sin Mercado Pago conectado debe poder llegar hasta acá y
// crear. No existe selector de plan/capacidad en este formulario: FREE
// (50 cupos) es automático y no editable desde el cliente.
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { assertOnboardingComplete } from '@/lib/trustOnboardingGate';

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
    return { redirect: { destination: '/login?next=/crear-inscripcion', permanent: false } };
  }

  const onboarding = await assertOnboardingComplete(user.id);
  if (!onboarding.ok) {
    return { redirect: { destination: `/registro/continuar?next=${encodeURIComponent('/crear-inscripcion')}`, permanent: false } };
  }

  return { props: {} };
}

const MODALITIES = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'online', label: 'Online' },
  { value: 'hibrida', label: 'Híbrida' },
];

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CrearInscripcion() {
  const router = useRouter();
  const [token, setToken] = useState(null);

  const [activity, setActivity] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [modality, setModality] = useState('presencial');
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  const [instructions, setInstructions] = useState('');

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [err, setErr] = useState(null);
  const [quotaMessage, setQuotaMessage] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/crear-inscripcion'); return; }
      setToken(session.access_token);
    })();
  }, [router]);

  async function saveDraft() {
    setErr(null);
    setQuotaMessage(null);
    if (!title.trim()) { setErr('El nombre de la actividad es obligatorio.'); return; }
    if (!startsAt) { setErr('La fecha/hora es obligatoria.'); return; }

    setSaving(true);
    try {
      const isUpdate = !!activity;
      const url = isUpdate ? `/api/inscripciones/${activity.id}` : '/api/inscripciones';
      const res = await fetch(url, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          starts_at: new Date(startsAt).toISOString(),
          timezone: 'America/Santiago',
          modality,
          venue_name: modality === 'online' ? null : (venueName.trim() || null),
          address: modality === 'online' ? null : (address.trim() || null),
          instructions: instructions.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error === 'free_quota_already_used') {
          setQuotaMessage(
            `Ya utilizaste tu inscripción gratuita de este mes. Podrás crear otra gratis a partir del ${new Date(data.next_available_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' })}.`
          );
          return;
        }
        throw new Error(data.message || data.error || 'No se pudo guardar la actividad');
      }
      setActivity(data.activity);
    } catch (e) {
      setErr(e.message || 'No se pudo guardar la actividad');
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!activity) return;
    setErr(null);
    setPublishing(true);
    try {
      const res = await fetch(`/api/inscripciones/${activity.id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo publicar');
      router.push(`/panel/inscripciones/${activity.id}`);
    } catch (e) {
      setErr(e.message || 'No se pudo publicar');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Layout title="Crear inscripción — Rifex" description="Crea una actividad gratuita con inscripción y control de acceso QR.">
      <Head><meta name="robots" content="noindex, nofollow" /></Head>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Crear inscripción</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
          Gratis, hasta 50 inscritos. Completa los datos y publica cuando esté listo.
        </p>

        {quotaMessage && (
          <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 13.5, color: '#92400e' }}>
            {quotaMessage}
          </div>
        )}
        {err && <div style={{ color: '#b91c1c', fontSize: 13.5, marginBottom: 16 }}>{err}</div>}

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 22, marginBottom: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Nombre de la actividad *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Ej: Taller de compostaje" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} disabled={!!activity} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={4} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} disabled={!!activity} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Fecha y hora *</label>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} disabled={!!activity} />
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Hora de Chile (America/Santiago).</p>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Modalidad *</label>
            <select value={modality} onChange={(e) => setModality(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} disabled={!!activity}>
              {MODALITIES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {modality !== 'online' && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Lugar</label>
                <input value={venueName} onChange={(e) => setVenueName(e.target.value)} maxLength={200} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} disabled={!!activity} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Dirección</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} disabled={!!activity} />
              </div>
            </div>
          )}
          <div style={{ marginBottom: 0 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Información para los inscritos</label>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={3000} rows={3} placeholder="Qué traer, cómo llegar, etc." style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} disabled={!!activity} />
          </div>
        </div>

        {!activity && (
          <button onClick={saveDraft} disabled={saving} style={{ padding: '12px 22px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Guardando…' : 'Guardar borrador'}
          </button>
        )}

        {activity && (
          <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 16, padding: 20 }}>
            <p style={{ fontWeight: 700, color: '#15803d', fontSize: 14.5, margin: '0 0 6px' }}>Borrador guardado.</p>
            <p style={{ fontSize: 13, color: '#334155', margin: '0 0 14px' }}>Capacidad: 50 inscritos (plan gratuito).</p>
            <button onClick={publish} disabled={publishing} style={{ padding: '12px 22px', borderRadius: 999, border: 'none', background: '#111827', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: publishing ? 'wait' : 'pointer' }}>
              {publishing ? 'Publicando…' : 'Publicar actividad'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
