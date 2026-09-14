// src/pages/panel/inscripciones/index.jsx
// INSCRIPCIONES V1 — panel: lista de actividades del organizador. PSCG:
// PRIVATE_AUTHENTICATED, boundary ssr_redirect.
//
// SSR AUTH HARDENING (2026-09-04): originalmente copiaba el patrón
// client-side histórico de panel/eventos/index.jsx (deuda documentada,
// fuera del alcance de esta misión) — un anónimo recibía 200 con el
// shell completo del panel (título, botón "+ Crear inscripción",
// "Cargando…") y solo se redirigía después de hidratar. Como
// Inscripciones es un módulo NUEVO clasificado PRIVATE_AUTHENTICATED
// desde su primer commit, esa deuda no debe propagarse acá. Ahora usa
// el mismo boundary real que mis-iniciativas.jsx/crear-inscripcion.jsx:
// getServerSideProps resuelve la sesión vía getSupabaseServer y
// redirige (307) ANTES de que el componente se renderice — un request
// anónimo nunca recibe el HTML del panel.
//
// RIFEX PANEL SCALABILITY (2026-09-05) — paginación tradicional real
// del lado del servidor, con botones "Anterior/Siguiente" (nunca carga
// continua al hacer scroll): `page` es estado local del componente, se
// envía como `?page=` a /api/inscripciones/mine, que ya devuelve solo
// esa página + `pagination.total/totalPages` reales. El control de
// paginación se oculta solo si totalPages <= 1.
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback, useRef } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import PaginationControls from '@/components/panel/PaginationControls';

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
    return { redirect: { destination: '/login?next=/panel/inscripciones', permanent: false } };
  }
  return { props: {} };
}

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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingPage, setLoadingPage] = useState(false);
  const tokenRef = useRef(null);

  const load = useCallback(async (accessToken, targetPage) => {
    setLoadingPage(true);
    try {
      const res = await fetch(`/api/inscripciones/mine?page=${targetPage}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || 'No se pudieron cargar tus inscripciones');
      setItems(body.items || []);
      setPage(body.pagination?.page || 1);
      setTotalPages(body.pagination?.totalPages || 1);
      setError(null);
    } catch (e) {
      setError(e.message || 'No se pudieron cargar tus inscripciones');
      setItems([]);
    } finally {
      setLoadingPage(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/panel/inscripciones'); return; }
      tokenRef.current = session.access_token;
      await load(session.access_token, 1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function goToPage(nextPage) {
    if (!tokenRef.current || nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    load(tokenRef.current, nextPage);
  }

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

        <PaginationControls page={page} totalPages={totalPages} onChange={goToPage} busy={loadingPage} />
      </div>
    </Layout>
  );
}
