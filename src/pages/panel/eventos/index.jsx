// src/pages/panel/eventos/index.jsx
// EVENT-1 (Fase 13) — panel mínimo: lista de eventos del organizador.
// Sin analytics/ventas/check-ins/export (eso llega en EVENT-5).
//
// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — SSR AUTH HARDENING:
// deuda histórica documentada desde PSCG (client_redirect) corregida
// acá con el mismo boundary real ya certificado en
// panel/inscripciones/index.jsx: getServerSideProps resuelve la sesión
// vía getSupabaseServer y redirige (307) ANTES de renderizar — un
// anónimo ya no recibe el shell del panel. Ownership/lógica de negocio
// de Eventos, la carga real de datos (fetch a /api/events/mine con
// Bearer) y todo lo demás quedan exactamente igual, sin tocar.
//
// RIFEX PANEL SCALABILITY (2026-09-05) — mismo patrón de paginación
// tradicional server-side ya aplicado a panel/inscripciones/index.jsx.
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
    return { redirect: { destination: '/login?next=/panel/eventos', permanent: false } };
  }
  return { props: {} };
}

const STATUS_LABEL = { draft: 'Borrador', published: 'Publicado', cancelled: 'Cancelado' };

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }); }
  catch { return '—'; }
}

export default function PanelEventos() {
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
      const res = await fetch(`/api/events/mine?page=${targetPage}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || 'No se pudieron cargar tus eventos');
      setItems(body.items || []);
      setPage(body.pagination?.page || 1);
      setTotalPages(body.pagination?.totalPages || 1);
      setError(null);
    } catch (e) {
      setError(e.message || 'No se pudieron cargar tus eventos');
      setItems([]);
    } finally {
      setLoadingPage(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/panel/eventos'); return; }
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
    <Layout noindex title="Mis eventos — Rifex">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>Mis eventos</h1>
          <Link
            href="/crear-evento"
            style={{ padding: '9px 18px', borderRadius: 999, background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}
          >
            + Crear evento
          </Link>
        </div>

        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {items === null && <p>Cargando…</p>}
        {items && items.length === 0 && <p style={{ color: '#94a3b8' }}>Todavía no has creado ningún evento.</p>}

        <div style={{ display: 'grid', gap: 12 }}>
          {(items || []).map((ev) => (
            <Link
              key={ev.id}
              href={`/panel/eventos/${ev.id}`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 18px', textDecoration: 'none', color: 'inherit' }}
            >
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{ev.title}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{fmtDate(ev.starts_at)}</div>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: ev.status === 'published' ? '#dcfce7' : ev.status === 'cancelled' ? '#fee2e2' : '#f1f5f9', color: ev.status === 'published' ? '#15803d' : ev.status === 'cancelled' ? '#b91c1c' : '#475569' }}>
                {STATUS_LABEL[ev.status] || ev.status}
              </span>
            </Link>
          ))}
        </div>

        <PaginationControls page={page} totalPages={totalPages} onChange={goToPage} busy={loadingPage} />
      </div>
    </Layout>
  );
}
