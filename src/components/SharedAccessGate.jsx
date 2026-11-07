// src/components/SharedAccessGate.jsx
// Puerta neutra para contenido compartido (modo `gated`, ver
// src/lib/raffleShareAccess.js). Solo muestra la marca Rifex, el nombre
// público del organizador (con sus iniciales como avatar) y el botón
// Continuar. Ningún dato del contenido: sin título, descripción, premio,
// fotos, valores, fechas, ganador, condiciones, canonical, Open Graph
// propio ni JSON-LD. Metadata neutra de Rifex y noindex.
// Sin Layout: el encabezado del sitio no forma parte de esta página.
// El formulario es HTML real (POST), no depende de JavaScript.
import Head from 'next/head';

const SHARE_ACCESS_ENDPOINT = '/api/acceso-compartido';

function initials(name) {
  const parts = String(name || '').split(' ').filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'R';
}

export default function SharedAccessGate({ organizerName, returnTo }) {
  const heading = organizerName
    ? `${organizerName} te ha compartido un contenido mediante Rifex`
    : 'Un organizador te ha compartido un contenido mediante Rifex';
  return (
    <>
      <Head>
        <title>Contenido compartido — Rifex</title>
        <meta name="description" content="Contenido compartido mediante Rifex." />
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta property="og:site_name" content="Rifex" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Contenido compartido mediante Rifex" />
        <meta property="og:description" content="Contenido compartido mediante Rifex." />
      </Head>
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F7F8FA', padding: 16, boxSizing: 'border-box', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: 24, textAlign: 'center', width: '100%', maxWidth: 420, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1E3A8A', letterSpacing: '-0.01em' }}>Rifex</div>
          <div aria-hidden="true" style={{ width: 56, height: 56, borderRadius: '50%', background: '#E0E7FF', color: '#1E3A8A', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 20, margin: '20px auto 12px' }}>
            {organizerName ? initials(organizerName) : 'R'}
          </div>
          <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.35, fontWeight: 700, color: '#111827', overflowWrap: 'anywhere' }}>{heading}</h1>
          <p style={{ color: '#6B7280', margin: '10px 0 20px' }}>Para ver los detalles, confirma que deseas continuar.</p>
          <form method="post" action={SHARE_ACCESS_ENDPOINT}>
            <input type="hidden" name="to" value={returnTo} />
            <button type="submit" style={{ width: '100%', minHeight: 44, border: 0, borderRadius: 10, background: '#1E3A8A', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
              Continuar
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
