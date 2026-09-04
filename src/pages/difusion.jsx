// src/pages/difusion.jsx
// DIFUSIÓN V1 — PSCG: PRIVATE_AUTHENTICATED, boundary ssr_redirect (ver
// src/lib/publicSurfaceClassification.js). Guía educativa, estática, para
// que un creador entienda cómo compartir su iniciativa en redes sociales
// sin prometer resultados y sin intentar evadir revisiones de plataforma.
// V1 explícitamente NO incluye IA, APIs sociales, publicación automática
// ni analítica — solo texto + un botón "Copiar" que usa el clipboard
// local del navegador.
import { useState } from 'react';
import Layout from '@/components/Layout';
import { getSupabaseServer } from '@/lib/supabaseServer';

// Mismo patrón real que mis-iniciativas.jsx/panel/index.js: el redirect
// ocurre en el propio getServerSideProps, antes de que se envíe cualquier
// HTML del módulo — no depende únicamente de un hook client-side.
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

const EXAMPLE_TEXT = `Estamos organizando una iniciativa para apoyar [motivo o causa].

Puedes conocer todos los detalles, condiciones y formas de participar en el siguiente enlace:

[enlace de tu iniciativa]

Organiza: [nombre del organizador]`;

export default function Difusion() {
  const [copied, setCopied] = useState(false);

  async function copyExample() {
    try {
      await navigator.clipboard.writeText(EXAMPLE_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Difusión</h1>
      <p style={{ color: '#64748b', fontSize: 14.5, marginBottom: 28 }}>
        Cómo compartir tus iniciativas en redes sociales
      </p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Qué debes saber</h2>
        <p style={{ color: '#334155', fontSize: 14.5, lineHeight: 1.7, marginBottom: 10 }}>
          Las redes sociales pueden aplicar restricciones a publicaciones y anuncios relacionados con rifas,
          sorteos, premios o actividades asociadas al azar.
        </p>
        <p style={{ color: '#334155', fontSize: 14.5, lineHeight: 1.7, marginBottom: 10 }}>
          Esto significa que una publicación puede ser limitada, rechazada o eliminada según el contenido, la
          forma de presentación y las políticas de cada plataforma.
        </p>
        <p style={{ color: '#334155', fontSize: 14.5, lineHeight: 1.7 }}>
          Los anuncios pagados pueden estar sujetos a controles adicionales y, en algunos casos, a requisitos
          especiales.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Antes de publicar</h2>
        <ul style={{ color: '#334155', fontSize: 14.5, lineHeight: 1.9, paddingLeft: 20 }}>
          <li>Describe con claridad qué estás organizando.</li>
          <li>Identifica al organizador.</li>
          <li>Usa información verdadera y verificable.</li>
          <li>Evita promesas de ganancias o resultados asegurados.</li>
          <li>Evita mensajes engañosos o exagerados.</li>
          <li>Dirige a las personas al enlace oficial de tu iniciativa en Rifex.</li>
          <li>Revisa siempre las políticas de la red donde publicarás.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Palabras sensibles</h2>
        <p style={{ color: '#334155', fontSize: 14.5, lineHeight: 1.7, marginBottom: 10 }}>
          Palabras como &quot;rifa&quot;, &quot;sorteo&quot;, &quot;premio&quot; o expresiones relacionadas con
          azar pueden activar revisiones adicionales en algunas plataformas.
        </p>
        <p style={{ color: '#334155', fontSize: 14.5, lineHeight: 1.7 }}>
          Usa un texto claro, natural y no engañoso.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Ejemplo de publicación</h2>
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
          {EXAMPLE_TEXT}
        </div>
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
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>
          Adapta este ejemplo a tu iniciativa. No publiques información falsa ni ocultes deliberadamente la
          naturaleza de lo que estás ofreciendo.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Publicidad pagada</h2>
        <p style={{ color: '#334155', fontSize: 14.5, lineHeight: 1.7, marginBottom: 10 }}>
          Los anuncios pagados pueden estar sujetos a políticas adicionales.
        </p>
        <p style={{ color: '#334155', fontSize: 14.5, lineHeight: 1.7, marginBottom: 10 }}>
          Meta, TikTok y otras plataformas pueden aplicar restricciones especiales a determinadas actividades
          relacionadas con premios, sorteos o azar.
        </p>
        <p style={{ color: '#334155', fontSize: 14.5, lineHeight: 1.7, marginBottom: 10 }}>
          Un cambio de redacción no convierte una actividad restringida en una actividad permitida.
        </p>
        <p style={{ color: '#334155', fontSize: 14.5, lineHeight: 1.7 }}>
          Antes de invertir dinero en publicidad, revisa las políticas vigentes de la plataforma correspondiente.
        </p>
      </section>
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
