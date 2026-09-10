// src/pages/crear-medidor-qr.jsx
// MEDIDOR QR V1 — creación. PSCG: PRIVATE_AUTHENTICATED (ssr_redirect).
// Mismo gate que Inscripciones/Convocatorias: SOLO
// assertOnboardingComplete — NUNCA resolveCreationGate/assertCreatorEligible
// (sección 1 del mandato: gratis, sin RUT/MP). Secciones 3/4 del
// mandato: plantillas -> pregunta -> respuestas (2-4) -> período ->
// [destino opcional] -> Crear y generar QR, todo en una sola pantalla
// con pasos verticales (no un wizard multi-página real — más simple de
// mantener consistente, mismo criterio que crear-inscripcion.jsx).
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { assertOnboardingComplete } from '@/lib/trustOnboardingGate';
import { MEDIDOR_QR_TEMPLATES } from '@/lib/medidorQrTemplates';

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
    return { redirect: { destination: '/login?next=/crear-medidor-qr', permanent: false } };
  }

  const onboarding = await assertOnboardingComplete(user.id);
  if (!onboarding.ok) {
    return { redirect: { destination: `/registro/continuar?next=${encodeURIComponent('/crear-medidor-qr')}`, permanent: false } };
  }

  return { props: {} };
}

const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 };
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 };

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CrearMedidorQr() {
  const router = useRouter();
  const [token, setToken] = useState(null);

  const [templateKey, setTemplateKey] = useState(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [measurementStart, setMeasurementStart] = useState(toLocalInputValue(new Date()));
  const [measurementEnd, setMeasurementEnd] = useState(toLocalInputValue(new Date(Date.now() + 30 * 24 * 3600_000)));
  const [wantsDestination, setWantsDestination] = useState(false);
  const [destinationUrl, setDestinationUrl] = useState('');
  const [destinationLabel, setDestinationLabel] = useState('');

  const [created, setCreated] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [quotaMessage, setQuotaMessage] = useState(null);
  // FREE QUOTA ADJUSTMENT (2026-09-09): cupo cuantitativo (10/mes) —
  // se muestra proactivamente, nunca solo al chocar con el límite.
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/crear-medidor-qr'); return; }
      setToken(session.access_token);
      try {
        const res = await fetch('/api/medidor-qr/quota', { headers: { Authorization: `Bearer ${session.access_token}` } });
        const body = await res.json();
        if (res.ok && body.ok) setQuota(body);
      } catch (_) {
        // La cuota es solo informativa acá — si falla, la RPC sigue
        // siendo la autoridad real al intentar crear.
      }
    })();
  }, [router]);

  function pickTemplate(t) {
    setTemplateKey(t.key);
    setQuestion(t.question);
    setOptions(t.options.length >= 2 ? t.options : ['', '']);
    // Sugerencia de punto de partida: se actualiza con cada plantilla
    // elegida hasta que el usuario edite el nombre a mano — desde ahí
    // el override manual manda y ya no se pisa con otra plantilla.
    if (!nameTouched) setName(t.label);
  }

  function updateOption(i, value) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addOption() {
    setOptions((prev) => (prev.length < 4 ? [...prev, ''] : prev));
  }
  function removeOption(i) {
    setOptions((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function create() {
    setErr(null);
    setQuotaMessage(null);

    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!name.trim()) { setErr('El nombre interno es obligatorio.'); return; }
    if (!question.trim()) { setErr('La pregunta es obligatoria.'); return; }
    if (cleanOptions.length < 2 || cleanOptions.length > 4) { setErr('Debes definir entre 2 y 4 respuestas.'); return; }
    if (new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length) {
      setErr('Las respuestas no pueden repetirse.');
      return;
    }
    if (new Date(measurementEnd) <= new Date(measurementStart)) {
      setErr('La fecha de término debe ser posterior al inicio.');
      return;
    }
    if (wantsDestination && !destinationUrl.trim()) {
      setErr('Ingresa una URL de destino o desmarca la opción.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/medidor-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          question: question.trim(),
          options: cleanOptions,
          measurement_start: new Date(measurementStart).toISOString(),
          measurement_end: new Date(measurementEnd).toISOString(),
          destination_url: wantsDestination ? destinationUrl.trim() : null,
          destination_button_label: wantsDestination ? destinationLabel.trim() || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error === 'free_quota_already_used') {
          const nextDate = new Date(data.next_available_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' });
          setQuotaMessage(`${data.message} Podrás crear nuevos Medidores QR a partir del ${nextDate}.`);
          setQuota((q) => (q ? { ...q, used: q.limit, remaining: 0 } : q));
          return;
        }
        throw new Error(data.message || data.error || 'No se pudo crear el Medidor QR');
      }
      setCreated(data.medidor);
      setQuota((q) => (q ? { ...q, used: q.used + 1, remaining: Math.max(0, q.remaining - 1) } : q));
    } catch (e) {
      setErr(e.message || 'No se pudo crear el Medidor QR');
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <Layout title="Medidor QR creado — Rifex">
        <Head><meta name="robots" content="noindex, nofollow" /></Head>
        <div style={{ maxWidth: 460, margin: '0 auto', padding: '0 16px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Tu Medidor QR está listo</h1>
          <img
            src={`/api/medidor-qr/m/${created.slug}/qr.png`}
            alt="Código QR del Medidor"
            style={{ width: 240, height: 240, borderRadius: 16, border: '2px solid #e5e7eb', margin: '0 auto 0', display: 'block' }}
          />
          <a href="https://rifex.pro" target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: 240, margin: '4px auto 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#94a3b8', textDecoration: 'none' }}>
            Powered by rifex.pro
          </a>
          <p style={{ fontWeight: 700, color: '#0f172a', fontSize: 16, margin: '0 0 24px' }}>{created.question}</p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <a href={`/api/medidor-qr/m/${created.slug}/qr.png`} download style={{ padding: '10px 18px', borderRadius: 999, background: '#111827', color: '#fff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
              Descargar QR
            </a>
            <a href={`/m/${created.slug}`} target="_blank" rel="noopener noreferrer" style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #d1d5db', color: '#0f172a', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
              Ver página pública
            </a>
            <button onClick={() => router.push(`/panel/medidor-qr/${created.id}`)} style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
              Ver resultados
            </button>
          </div>

          <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 380, margin: '0 auto' }}>
            Ponlo donde quieras. Mide la respuesta.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Crear Medidor QR — Rifex" description="Crea una pregunta, genera tu QR y mide la respuesta de tu público.">
      <Head><meta name="robots" content="noindex, nofollow" /></Head>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Crear Medidor QR</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: quota ? 6 : 20 }}>
          Gratis — hasta 10 Medidores QR nuevos por mes. Completa los datos y genera tu QR al instante.
        </p>
        {quota && (
          <p style={{ color: '#334155', fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            {quota.used} de {quota.limit} Medidores QR utilizados este mes
          </p>
        )}

        {quotaMessage && (
          <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 13.5, color: '#92400e' }}>
            {quotaMessage}
          </div>
        )}
        {err && <div style={{ color: '#b91c1c', fontSize: 13.5, marginBottom: 16 }}>{err}</div>}

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 22, marginBottom: 16 }}>
          <label style={labelStyle}>Nombre interno *</label>
          <p style={{ fontSize: 12.5, color: '#94a3b8', margin: '0 0 8px' }}>Solo para identificarlo en tu panel — nunca se muestra a quien responde.</p>
          <input
            value={name}
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              // Si el usuario limpia completamente el campo, vuelve al
              // comportamiento automático (la próxima plantilla elegida
              // vuelve a autocompletar) en vez de quedar "atascado" en
              // modo manual con un valor vacío.
              setNameTouched(v.trim() !== '');
            }}
            maxLength={120}
            placeholder="Ej: Vitrina septiembre"
            style={inputStyle}
          />
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 22, marginBottom: 16 }}>
          <p style={{ ...labelStyle, marginBottom: 10 }}>¿Qué quieres medir?</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {MEDIDOR_QR_TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => pickTemplate(t)}
                style={{
                  padding: '10px 12px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                  border: templateKey === t.key ? '2px solid #18A957' : '1px solid #d1d5db',
                  background: '#fff', fontSize: 13, fontWeight: 600, color: '#0f172a',
                }}
              >
                <span aria-hidden="true">{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 22, marginBottom: 16 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Pregunta *</label>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="Ej: ¿Cómo fue tu experiencia con nosotros?" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Respuestas (entre 2 y 4) *</label>
            {options.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={o} onChange={(e) => updateOption(i, e.target.value)} maxLength={80} placeholder={`Respuesta ${i + 1}`} style={inputStyle} />
                {options.length > 2 && (
                  <button type="button" onClick={() => removeOption(i)} style={{ padding: '0 12px', borderRadius: 10, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}>×</button>
                )}
              </div>
            ))}
            {options.length < 4 && (
              <button type="button" onClick={addOption} style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                + Agregar respuesta
              </button>
            )}
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 22, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Inicio de medición *</label>
              <input type="datetime-local" value={measurementStart} onChange={(e) => setMeasurementStart(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Término de medición *</label>
              <input type="datetime-local" value={measurementEnd} onChange={(e) => setMeasurementEnd(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 22, marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: '#334155', cursor: 'pointer', marginBottom: wantsDestination ? 14 : 0 }}>
            <input type="checkbox" checked={wantsDestination} onChange={(e) => setWantsDestination(e.target.checked)} />
            Mostrar un botón para continuar a una URL después de responder (opcional)
          </label>
          {wantsDestination && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>URL de destino</label>
                <input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://ejemplo.cl" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Texto del botón (opcional)</label>
                <input value={destinationLabel} onChange={(e) => setDestinationLabel(e.target.value)} maxLength={60} placeholder="Ir a ejemplo.cl" style={inputStyle} />
              </div>
            </>
          )}
        </div>

        <button onClick={create} disabled={saving} style={{ padding: '12px 22px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Creando…' : 'Crear y generar QR'}
        </button>
      </div>
    </Layout>
  );
}
