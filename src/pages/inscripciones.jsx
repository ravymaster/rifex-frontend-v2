// src/pages/inscripciones.jsx
// INSCRIPCIONES V1 — landing comercial. PSCG: PUBLIC_INDEXABLE (misma
// clasificación que /rifas, /eventos: producto público, indexable,
// nunca un directorio de actividades de usuarios — eso vive en la
// página individual /inscripcion/[id], PUBLIC_NOINDEX).
//
// Copy EXACTO del mandato (sección 6/7). Nunca mostrar en V1: Plus,
// Gold, "200", "2.000", precios futuros, ni "planes próximamente" — el
// CTA de mayor capacidad se resuelve con un separador neutro hacia
// Eventos, nunca prometiendo disponibilidad de Plus/Gold.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

const BULLETS = [
  'Hasta 50 inscritos gratis por actividad',
  'Página pública para compartir tu actividad',
  'Confirmación automática de inscripción',
  'Código QR individual para cada inscrito',
  'Control de acceso con scanner QR',
  'Lista de asistentes en tiempo real',
  'Descarga tu lista de asistentes en Excel',
  '1 actividad gratuita por mes por cuenta',
];

export default function InscripcionesLanding() {
  const [next, setNext] = useState('/crear-inscripcion');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) setNext(`/login?next=${encodeURIComponent('/crear-inscripcion')}`);
    })();
  }, []);

  return (
    <Layout
      title="Inscripciones gratis con QR — Rifex"
      description="Crea una actividad gratuita, recibe inscripciones, controla el acceso con QR y administra tus asistentes desde Rifex."
      canonicalPath="/inscripciones"
    >
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', lineHeight: 1.15, margin: '0 0 14px' }}>
            Inscripciones gratis con QR
          </h1>
          <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.6, maxWidth: 560, margin: '0 auto 24px' }}>
            Organiza talleres, cursos, capacitaciones y actividades. Recibe hasta 50 inscritos,
            controla el acceso con QR y descarga tu lista de asistentes.
          </p>
          <Link
            href={next}
            style={{
              display: 'inline-flex', alignItems: 'center', padding: '13px 26px',
              borderRadius: 999, background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)',
              color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none',
            }}
          >
            Crear una inscripción
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 36 }}>
          {BULLETS.map((b) => (
            <div key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 16px' }}>
              <span style={{ color: '#18a957', fontWeight: 900, fontSize: 15 }}>✓</span>
              <span style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.4 }}>{b}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>¿Necesitas cobrar por participar?</p>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 12px' }}>
            Inscripciones es para actividades gratuitas. Si vendes entradas, revisa Rifex Eventos.
          </p>
          <Link href="/eventos" style={{ color: '#1e3a8a', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
            Ir a Eventos →
          </Link>
        </div>
      </div>
    </Layout>
  );
}
