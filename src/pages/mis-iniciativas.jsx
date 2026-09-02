// src/pages/mis-iniciativas.jsx
// EVENT-1 (Fase 12) — distribuidor superior simple: Rifas / Campañas /
// Eventos, cada una redirige a su panel propio. Sin mega-dashboard, sin
// lógica mezclada — solo 3 tarjetas.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';

// AUTH UX 2026 — el `checking` de abajo ya evitaba que el shell interno
// se rendereara en el HTML para anónimos (return null mientras checking),
// pero seguía dependiendo exclusivamente de JS cliente. Este boundary
// server-side hace la protección real; el useEffect/checking se conserva
// para la UX de sesión ya iniciada (no requiere round-trip extra).
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
    return { redirect: { destination: '/login?next=/mis-iniciativas', permanent: false } };
  }
  return { props: {} };
}

const INITIATIVES = [
  { key: 'rifas', title: 'Rifas', description: 'Crea rifas, vende números y sortea un ganador.', href: '/panel', cta: 'Ir a mis rifas' },
  { key: 'campanas', title: 'Campañas', description: 'Recauda aportes para una causa o proyecto.', href: '/crear-colecta', cta: 'Ir a mis campañas' },
  { key: 'eventos', title: 'Eventos', description: 'Crea eventos, configura entradas y publícalas.', href: '/panel/eventos', cta: 'Ir a mis eventos' },
];

export default function MisIniciativas() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) { router.push('/login?next=/mis-iniciativas'); return; }
      setChecking(false);
    })();
  }, [router]);

  if (checking) return null;

  return (
    <Layout title="Mis iniciativas — Rifex" description="Rifas, Campañas y Eventos en un solo lugar." noindex>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Mis iniciativas</h1>
        <p style={{ color: '#64748b', fontSize: 14.5, marginBottom: 28 }}>Cada producto tiene su propio panel especializado.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
          {INITIATIVES.map((it) => (
            <div key={it.key} style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 22 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>{it.title}</h2>
              <p style={{ color: '#64748b', fontSize: 13.5, lineHeight: 1.5, margin: '0 0 16px' }}>{it.description}</p>
              <Link
                href={it.href}
                style={{
                  display: 'inline-flex', alignItems: 'center', padding: '9px 16px',
                  borderRadius: 999, background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)',
                  color: '#fff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
                }}
              >
                {it.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
