// src/components/MedidorQrPublicShell.jsx
// MEDIDOR QR V1 — POST-HUMAN-QA CORRECTIONS: shell público minimalista
// para /m/[slug]. A diferencia de casi toda página de Rifex, esta
// superficie NO usa <Layout> — nace de un escaneo, en el celular, y el
// contenido del creador (pregunta/alternativas) debe tener el
// protagonismo total. Sin Navbar, sin Footer global, sin menú, sin
// navegación Rifex, sin CTA promocional. La única presencia de Rifex es
// la firma discreta "Powered by Rifex.pro" que ya trae cada página que
// usa este shell.
//
// Mantiene la infraestructura real que NO depende del Layout visual:
// title/description/canonical/robots (noindex/nofollow/noarchive —
// estas páginas son generadas por usuario, ver
// src/lib/publicSurfaceClassification.js) y viewport mobile-first con
// soporte de safe-area (notch / barras del navegador).
import Head from 'next/head';
import { canonicalUrl } from '@/lib/publicMetadata';

export default function MedidorQrPublicShell({ title, description = 'Responde en un toque, sin registro.', canonicalPath, children }) {
  const canonical = canonicalUrl(canonicalPath || '/');
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="canonical" href={canonical} />
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </Head>
      <div className="mqr-shell">{children}</div>
      <style jsx global>{`
        .mqr-shell {
          min-height: 100dvh;
          min-height: 100vh;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #f7f8fa;
          padding: max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom));
          box-sizing: border-box;
        }
      `}</style>
    </>
  );
}
