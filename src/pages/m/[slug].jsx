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
// PÁGINA PÚBLICA — MARCA RIFEX (extensión del mandato): Rifex no debe
// competir visualmente con el contenido del creador. Tras responder,
// solo un botón de destino opcional (con confirmación de dominio real
// antes de navegar — nunca redirección automática) y una firma
// discreta "Powered by Rifex.pro" al pie, nunca un bloque promocional
// grande.
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
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
    <p style={{ marginTop: 20, fontSize: 11.5, color: '#64748b', textAlign: 'center' }}>
      <a href="/medidor-qr" style={{ color: '#64748b', textDecoration: 'none' }}>Powered by Rifex.pro</a>
    </p>
  );

  if (!medidor) {
    return (
      <Layout title="Medidor no encontrado — Rifex" noindex noarchive>
        <div style={{ maxWidth: 420, margin: '48px auto', textAlign: 'center', padding: '0 16px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Medidor no encontrado</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>Este código no corresponde a ningún Medidor QR válido.</p>
          <Signature />
        </div>
      </Layout>
    );
  }

  if (alreadyEnded) {
    return (
      <Layout title="Medición finalizada — Rifex" noindex noarchive>
        <div style={{ maxWidth: 420, margin: '48px auto', textAlign: 'center', padding: '0 16px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', margin: 0 }}>Rifex</p>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '10px 0 4px' }}>{medidor.question}</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 12 }}>Esta medición ha finalizado.</p>
          <Signature />
        </div>
      </Layout>
    );
  }

  if (notStartedYet) {
    return (
      <Layout title="Medición aún no disponible — Rifex" noindex noarchive>
        <div style={{ maxWidth: 420, margin: '48px auto', textAlign: 'center', padding: '0 16px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', margin: 0 }}>Rifex</p>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '10px 0 4px' }}>{medidor.question}</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 12 }}>Esta medición aún no comienza. Volvé a intentarlo más tarde.</p>
          <Signature />
        </div>
      </Layout>
    );
  }

  const options = Array.isArray(medidor.options) ? medidor.options : [];

  return (
    <Layout title={`${medidor.question} — Rifex`} description="Responde en un toque, sin registro." noindex noarchive>
      <div style={{ maxWidth: 420, margin: '24px auto', padding: '0 16px' }}>
        <div style={{ border: '2px solid #e5e7eb', borderRadius: 20, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', margin: 0 }}>Rifex</p>

          {!sent && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '10px 0 20px' }}>{medidor.question}</h1>
              {err && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{err}</p>}
              <div style={{ display: 'grid', gap: 10 }}>
                {options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => respond(i)}
                    disabled={submitting}
                    style={{
                      padding: '15px 16px', borderRadius: 14,
                      border: selected === i ? '2px solid #18A957' : '1px solid #d1d5db',
                      background: '#fff', fontSize: 15, fontWeight: 700, color: '#0f172a',
                      cursor: submitting ? 'wait' : 'pointer', textAlign: 'left',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 16 }}>Tu respuesta es anónima.</p>
            </>
          )}

          {sent && (
            <div style={{ marginTop: 10 }} aria-live="polite">
              <div style={{ padding: '10px 16px', borderRadius: 999, display: 'inline-block', fontWeight: 700, fontSize: 14, background: '#dcfce7', color: '#15803d' }}>
                ✓ Gracias por responder.
              </div>

              {destinationInfo && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 13.5, color: '#334155', marginBottom: 10 }}>
                    ¿Quieres continuar a {destinationInfo.hostname}?
                  </p>
                  <button
                    onClick={goToDestination}
                    style={{ padding: '11px 20px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
                  >
                    {destinationInfo.label || `Ir a ${destinationInfo.hostname}`} →
                  </button>
                </div>
              )}
            </div>
          )}

          <Signature />
        </div>
      </div>
    </Layout>
  );
}
