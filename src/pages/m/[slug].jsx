// src/pages/m/[slug].jsx
// MEDIDOR QR V1 — página pública de respuesta. PSCG: PUBLIC_NOINDEX
// (sección 20 del mandato: una página generada por usuario no debe
// convertirse en basura SEO indexable por defecto). Mobile-first, SSR
// para carga rápida — la mayoría llega desde un QR, en el celular.
//
// getServerSideProps usa service_role (bypassa RLS) para resolver el
// Medidor en CUALQUIER estado, no solo 'active' — la política RLS
// pública solo permite status='active', pero el mandato exige que el
// QR nunca se rompa ("Esta medición aún no comienza"/"ha finalizado"
// según measurement_start/end, nunca un 404 genérico para un slug que
// sí existe).
//
// PÁGINA PÚBLICA — MARCA RIFEX (extensión del mandato, endurecida por
// POST-HUMAN-QA CORRECTIONS): Rifex no debe competir visualmente con
// el contenido del creador. Esta superficie NO usa el <Layout> global
// (sin Navbar, sin Footer, sin menú, sin navegación Rifex) — ver
// src/components/MedidorQrPublicShell.jsx. Tras responder, solo un
// botón de destino opcional (con confirmación de dominio real antes de
// navegar — nunca redirección automática) y una firma discreta
// "Powered by Rifex.pro" al pie, nunca un bloque promocional grande.
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import MedidorQrPublicShell from '@/components/MedidorQrPublicShell';
import { getOrCreateVisitorKey } from '@/lib/medidorQrVisitor';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function getServerSideProps(ctx) {
  const slug = String(ctx.params?.slug || '');
  const { data: medidor } = await supabaseAdmin
    .from('medidores_qr')
    .select('id, question, options, status, measurement_start, measurement_end, destination_url, destination_button_label, slug')
    .eq('slug', slug)
    .maybeSingle();

  return { props: { medidor: medidor || null } };
}

function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

export default function MedidorQrPublicPage({ medidor }) {
  const [sent, setSent] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [destinationInfo, setDestinationInfo] = useState(null);
  const [clickRegistered, setClickRegistered] = useState(false);

  const now = new Date();
  const notStartedYet = medidor && medidor.status === 'active' && new Date(medidor.measurement_start) > now;
  const alreadyEnded = medidor && (medidor.status === 'closed' || (medidor.measurement_end && new Date(medidor.measurement_end) < now));
  const isOpen = medidor && !notStartedYet && !alreadyEnded;

  useEffect(() => {
    if (!medidor || !isOpen) return;
    const visitorKey = getOrCreateVisitorKey();
    if (!visitorKey) return;
    fetch(`/api/medidor-qr/m/${medidor.slug}/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_key: visitorKey }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medidor?.id, isOpen]);

  async function respond(optionIndex) {
    if (!medidor || submitting) return;
    setSelected(optionIndex);
    setSubmitting(true);
    setErr(null);
    try {
      const visitorKey = getOrCreateVisitorKey();
      const res = await fetch(`/api/medidor-qr/m/${medidor.slug}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_index: optionIndex, visitor_key: visitorKey }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        if (body.error === 'already_responded') { setSent(true); return; }
        throw new Error(body.error || 'No se pudo registrar tu respuesta');
      }
      if (body.destination_url) {
        const hostname = safeHostname(body.destination_url);
        if (hostname) setDestinationInfo({ url: body.destination_url, label: body.destination_button_label, hostname });
      }
      setSent(true);
    } catch (e) {
      setErr(e.message || 'No se pudo registrar tu respuesta');
      setSelected(null);
    } finally {
      setSubmitting(false);
    }
  }

  function goToDestination() {
    if (!medidor || !destinationInfo || clickRegistered) return;
    setClickRegistered(true);
    // EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1 (punto 13): el
    // registro del clic es "fire-and-forget" — nunca se espera la
    // respuesta antes de navegar. Un analytics endpoint lento o caído
    // no debe atrapar al visitante ni retrasar su salida.
    const visitorKey = getOrCreateVisitorKey();
    fetch(`/api/medidor-qr/m/${medidor.slug}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_key: visitorKey }),
    }).catch(() => {});
    window.open(destinationInfo.url, '_blank', 'noopener,noreferrer');
  }

  const Signature = () => (
    <p style={{ marginTop: 28, fontSize: 11.5, color: '#94a3b8', textAlign: 'center' }}>
      <a href="/medidor-qr" style={{ color: '#94a3b8', textDecoration: 'none' }}>Powered by Rifex.pro</a>
    </p>
  );

  const canonicalPath = `/m/${String(medidor?.slug || '')}`;

  if (!medidor) {
    return (
      <MedidorQrPublicShell title="Medidor no encontrado — Rifex" canonicalPath={canonicalPath}>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Medidor no encontrado</h1>
          <p style={{ color: '#64748b', fontSize: 15, marginTop: 10 }}>Este código no corresponde a ningún Medidor QR válido.</p>
          <Signature />
        </div>
      </MedidorQrPublicShell>
    );
  }

  if (alreadyEnded) {
    return (
      <MedidorQrPublicShell title="Medición finalizada — Rifex" canonicalPath={canonicalPath}>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{medidor.question}</h1>
          <p style={{ color: '#64748b', fontSize: 15, marginTop: 14 }}>Esta medición ha finalizado.</p>
          <Signature />
        </div>
      </MedidorQrPublicShell>
    );
  }

  if (notStartedYet) {
    return (
      <MedidorQrPublicShell title="Medición aún no disponible — Rifex" canonicalPath={canonicalPath}>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{medidor.question}</h1>
          <p style={{ color: '#64748b', fontSize: 15, marginTop: 14 }}>Esta medición aún no comienza. Volvé a intentarlo más tarde.</p>
          <Signature />
        </div>
      </MedidorQrPublicShell>
    );
  }

  const options = Array.isArray(medidor.options) ? medidor.options : [];

  return (
    <MedidorQrPublicShell title={`${medidor.question} — Rifex`} canonicalPath={canonicalPath}>
      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
        {!sent && (
          <>
            <h1 style={{ fontSize: 25, fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.25 }}>{medidor.question}</h1>
            {err && <p style={{ color: '#b91c1c', fontSize: 13.5, marginTop: 14 }}>{err}</p>}
            <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
              {options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => respond(i)}
                  disabled={submitting}
                  style={{
                    padding: '19px 20px', borderRadius: 16, minHeight: 56,
                    border: selected === i ? '2px solid #18A957' : '1px solid #d1d5db',
                    background: '#fff', fontSize: 16.5, fontWeight: 700, color: '#0f172a',
                    cursor: submitting ? 'wait' : 'pointer', textAlign: 'left',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 18 }}>Tu respuesta es anónima.</p>
          </>
        )}

        {sent && (
          <div aria-live="polite">
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, margin: '0 auto' }}>
              ✓
            </div>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: '#0f172a', margin: '18px 0 6px' }}>Gracias por responder</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Tu respuesta fue registrada.</p>

            {destinationInfo && (
              <div style={{ marginTop: 26 }}>
                <p style={{ fontSize: 14, color: '#334155', marginBottom: 12 }}>
                  ¿Quieres continuar a {destinationInfo.hostname}?
                </p>
                <button
                  onClick={goToDestination}
                  style={{ padding: '15px 24px', minHeight: 52, width: '100%', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
                >
                  {destinationInfo.label || `Ir a ${destinationInfo.hostname}`} →
                </button>
              </div>
            )}
          </div>
        )}

        <Signature />
      </div>
    </MedidorQrPublicShell>
  );
}
