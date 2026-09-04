// src/pages/panel/inscripciones/index.jsx
// INSCRIPCIONES V1 — panel: lista de actividades del organizador. PSCG:
// PRIVATE_AUTHENTICATED. Mismo patrón que panel/eventos/index.jsx.
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

const STATUS_LABEL = { draft: 'Borrador', active: 'Activa', closed: 'Cerrada', archived: 'Archivada' };
const STATUS_COLOR = {
  draft: { bg: '#f1f5f9', fg: '#475569' },
  active: { bg: '#dcfce7', fg: '#15803d' },
  closed: { bg: '#fef3c7', fg: '#92400e' },
  archived: { bg: '#f1f5f9', fg: '#64748b' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }); }
  catch { return '—'; }
}

export default function PanelInscripciones() {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/panel/inscripciones'); return; }
      try {
        const res = await fetch('/api/inscripciones/mine', { headers: { Authorization: `Bearer ${session.access_token}` } });
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error || 'No se pudieron cargar tus inscripciones');
        setItems(body.items || []);
      } catch (e) {
        setError(e.message || 'No se pudieron cargar tus inscripciones');
        setItems([]);
      }
    })();
  }, [router]);

  return (
    <Layout noindex title="Mis inscripciones — Rifex">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>Mis inscripciones</h1>
          <Link
            href="/crear-inscripcion"
            style={{ padding: '9px 18px', borderRadius: 999, background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}
          >
            + Crear inscripción
          </Link>
        </div>

        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {items === null && <p>Cargando…</p>}
        {items && items.length === 0 && <p style={{ color: '#94a3b8' }}>Todavía no has creado ninguna actividad.</p>}

        <div style={{ display: 'grid', gap: 12 }}>
          {(items || []).map((a) => {
            const color = STATUS_COLOR[a.status] || STATUS_COLOR.draft;
            return (
              <Link
                key={a.id}
                href={`/panel/inscripciones/${a.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 18px', textDecoration: 'none', color: 'inherit', flexWrap: 'wrap', gap: 10 }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{a.title}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                    {fmtDate(a.starts_at)} · Inscritos: {a.registered_count}/{a.capacity} · Asistieron: {a.checked_in_count}
                  </div>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: color.bg, color: color.fg }}>
                  {STATUS_LABEL[a.status] || a.status}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
