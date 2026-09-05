// src/pages/difusion.jsx
// DIFUSIÓN V1.1 — MULTIPRODUCTO. PSCG: PRIVATE_AUTHENTICATED, boundary
// ssr_redirect (ver src/lib/publicSurfaceClassification.js) — sin
// cambios respecto a V1. Esta versión reemplaza la guía única (orientada
// a Rifas) por un selector de 4 productos (Rifas/Campañas/Eventos/
// Inscripciones), cada uno con su propia introducción, recomendaciones,
// ejemplo copiable y nota de publicidad — sin salir de esta página, sin
// perder sesión. Inscripciones todavía no es un producto real de Rifex:
// se muestra marcada "Próximamente", sin botón de copiar funcional y sin
// ningún CTA hacia un producto inexistente.
// V1.1 sigue sin generación automática por IA, sin APIs sociales, sin
// publicación automática, sin analítica — solo texto + clipboard local.
import { useState } from 'react';
import Layout from '@/components/Layout';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { DIFFUSION_PRODUCTS, DIFFUSION_GUIDES, DIFFUSION_COMMON_AD_NOTE } from '@/lib/difusionGuides';

// Boundary sin cambios respecto a V1 — el redirect ocurre en el propio
// getServerSideProps, antes de que se envíe cualquier HTML del módulo,
// nunca depende únicamente de un hook client-side.
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
    return { redirect: { destination: '/login?next=/difusion', permanent: false } };
  }
  return { props: {} };
}

const H2 = { fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 10 };
const P = { color: '#334155', fontSize: 14.5, lineHeight: 1.7, marginBottom: 10 };
const UL = { color: '#334155', fontSize: 14.5, lineHeight: 1.9, paddingLeft: 20, marginBottom: 10 };

function ExampleBlock({ text, note, copyable, sectionLabel }) {
  const [copied, setCopied] = useState(false);

  async function copyExample() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={H2}>{sectionLabel}</h2>
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 16,
          fontSize: 14,
          color: '#334155',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          marginBottom: 12,
        }}
      >
        {text}
      </div>
      {copyable ? (
        <button
          type="button"
          onClick={copyExample}
          style={{
            background: copied ? '#16a34a' : '#0f172a',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '9px 16px',
            fontSize: 13.5,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copiado' : 'Copiar ejemplo'}
        </button>
      ) : (
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Vista previa
        </span>
      )}
      {note && (
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>{note}</p>
      )}
    </section>
  );
}

function RaffleGuide({ guide }) {
  return (
    <>
      <h2 style={H2}>{guide.tagline}</h2>
      {guide.intro.map((t, i) => (
        <p key={i} style={P}>{t}</p>
      ))}
      <ul style={UL}>
        {guide.clarifications.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      <p style={P}>{guide.sensitiveWordsNote}</p>
      <h2 style={{ ...H2, marginTop: 20 }}>Qué sí puedes hacer</h2>
      <ul style={UL}>
        {guide.doList.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </>
  );
}

function CampaignOrEventGuide({ guide }) {
  return (
    <>
      <h2 style={H2}>{guide.tagline}</h2>
      {guide.intro.map((t, i) => (
        <p key={i} style={P}>{t}</p>
      ))}
      <ul style={UL}>
        {guide.doList.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      {guide.avoidList && (
        <ul style={UL}>
          {guide.avoidList.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
      {guide.extraNote && <p style={P}>{guide.extraNote}</p>}
    </>
  );
}

function RegistrationGuide({ guide }) {
  return (
    <>
      <h2 style={H2}>{guide.tagline}</h2>
      <p style={P}>{guide.previewText}</p>
    </>
  );
}

export default function Difusion() {
  // EVENTOS por defecto: es la identidad pública actual de Rifex
  // (primer ítem del navbar, catálogo público principal), la opción más
  // neutral entre los 3 productos implementados — no hay una preferencia
  // documentada por Rifas en ningún lugar del repo.
  const [active, setActive] = useState('event');
  const guide = DIFFUSION_GUIDES[active];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Difusión</h1>
      <p style={{ color: '#64748b', fontSize: 14.5, marginBottom: 16 }}>
        Cómo compartir tus iniciativas en redes sociales
      </p>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24 }}>
        Aplica para publicaciones y anuncios en Facebook, Instagram, TikTok, X y WhatsApp.
      </p>

      <div
        role="tablist"
        aria-label="Producto"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}
      >
        {DIFFUSION_PRODUCTS.map((p) => {
          const isActive = p.key === active;
          const g = DIFFUSION_GUIDES[p.key];
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(p.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 999,
                border: isActive ? '1px solid #0f172a' : '1px solid #e5e7eb',
                background: isActive ? '#0f172a' : '#fff',
                color: isActive ? '#fff' : '#334155',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {p.label}
              {!g.available && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: isActive ? 'rgba(255,255,255,0.2)' : '#f1f5f9',
                    color: isActive ? '#fff' : '#64748b',
                  }}
                >
                  Próximamente
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {guide.key === 'raffle' && <RaffleGuide guide={guide} />}
        {guide.available && (guide.key === 'campaign' || guide.key === 'event' || guide.key === 'registration') && <CampaignOrEventGuide guide={guide} />}
        {!guide.available && guide.key === 'registration' && <RegistrationGuide guide={guide} />}

        <ExampleBlock
          sectionLabel={guide.available ? 'Ejemplo de publicación' : 'Ejemplo (vista previa)'}
          text={guide.example}
          note={guide.exampleNote}
          copyable={guide.available}
        />

        <section>
          <h2 style={H2}>Publicidad pagada</h2>
          {guide.adNote && <p style={P}>{guide.adNote}</p>}
          <p style={P}>{DIFFUSION_COMMON_AD_NOTE}</p>
        </section>
      </div>
    </div>
  );
}

Difusion.getLayout = (page) => (
  <Layout
    title="Difusión — Rifex"
    description="Guía para compartir tus iniciativas de Rifex en redes sociales de forma clara y responsable."
    canonicalPath="/difusion"
    noindex
    noarchive
  >
    {page}
  </Layout>
);
