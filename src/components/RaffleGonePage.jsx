// src/components/RaffleGonePage.jsx
// Página neutra para rutas públicas de Rifas cuando su exposición pública
// está deshabilitada (src/lib/raffleExposure.js). No muestra ni declara
// en metadata ningún dato de la rifa (título, premio, imágenes, ganador):
// solo un mensaje genérico, sin canonical ni Open Graph, con noindex.
import Head from 'next/head';
import Link from 'next/link';
import Layout from '@/components/Layout';

export default function RaffleGonePage() {
  return (
    <Layout disableAutoMeta>
      <Head>
        <title>Página no disponible — Rifex</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </Head>
      <section style={{ minHeight: 'calc(100vh - 64px)', display: 'grid', placeItems: 'center', background: '#F7F8FA' }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: 24, textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1E3A8A' }}>Esta página ya no está disponible</h1>
          <p style={{ color: '#6B7280', margin: '8px 0 16px' }}>El contenido que buscas fue retirado.</p>
          <Link href="/" className="btn btn-primary">Volver al inicio</Link>
        </div>
      </section>
    </Layout>
  );
}
