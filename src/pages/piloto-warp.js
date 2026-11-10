// src/pages/piloto-warp.js
// Página piloto LOCAL del asistente de Warp en Rifex. Solo existe con la
// variable privada RIFEX_WARP_PILOT=on (si no, 404). No forma parte del
// layout global ni del sitio público; noindex.
import Head from 'next/head';
import Layout from '@/components/Layout';
import WarpAssistantPilot from '@/components/warp/WarpAssistantPilot';
import { isWarpPilotEnabled } from '@/lib/warp/assistantPilot';

export async function getServerSideProps({ res }) {
  if (!isWarpPilotEnabled()) return { notFound: true };
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  return { props: {} };
}

export default function PilotoWarpPage() {
  return (
    <Layout disableAutoMeta>
      <Head>
        <title>Piloto asistente — Rifex</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <section style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Piloto del asistente de Rifex</h1>
        <p style={{ color: '#4B5563' }}>
          Página de prueba interna. El asistente solo consulta información pública de Eventos, Campañas e
          Inscripciones. No crea, inscribe, compra ni cobra nada.
        </p>
      </section>
      <WarpAssistantPilot />
    </Layout>
  );
}
