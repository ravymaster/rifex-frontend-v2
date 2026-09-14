// src/pages/panel/medidor-qr/index.jsx
// MEDIDOR QR V1 — lista de Medidores del organizador. PSCG:
// PRIVATE_AUTHENTICATED, boundary ssr_redirect desde el primer commit.
// Paginación server-side real (src/lib/panelPagination.js).
//
// EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1 (punto 4): búsqueda
// por nombre/pregunta + filtro Todos/Activos/Finalizados, ambos
// resueltos server-side en /api/medidor-qr/mine (nunca filtrado local
// sobre una página ya paginada). Debounce simple de 350ms en la
// búsqueda para no disparar una request por tecla.
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
    return { redirect: { destination: '/login?next=/panel/medidor-qr', permanent: false } };
  }
  return { props: {} };
}

const STATUS_LABEL = { active: 'Activo', closed: 'Cerrado' };
const STATUS_COLOR = {
  active: { bg: '#dcfce7', fg: '#15803d' },
  closed: { bg: '#f1f5f9', fg: '#64748b' },
};
const FILTER_TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Activos' },
  { key: 'finalizados', label: 'Finalizados' },
];

export default function PanelMedidorQr() {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingPage, setLoadingPage] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const tokenRef = useRef(null);
  const debounceRef = useRef(null);

  const load = useCallback(async (accessToken, targetPage, q, status) => {
    setLoadingPage(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage), status });
      if (q) params.set('q', q);
      const res = await fetch(`/api/medidor-qr/mine?${params.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || 'No se pudieron cargar tus Medidores QR');
      setItems(body.items || []);
      setPage(body.pagination?.page || 1);
      setTotalPages(body.pagination?.totalPages || 1);
      setError(null);
    } catch (e) {
      setError(e.message || 'No se pudieron cargar tus Medidores QR');
      setItems([]);
    } finally {
      setLoadingPage(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/panel/medidor-qr'); return; }
      tokenRef.current = session.access_token;
      await load(session.access_token, 1, '', 'all');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function goToPage(nextPage) {
    if (!tokenRef.current || nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    load(tokenRef.current, nextPage, search, statusFilter);
  }

  function onSearchChange(value) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (tokenRef.current) load(tokenRef.current, 1, value, statusFilter);
    }, 350);
  }

  function onFilterChange(nextStatus) {
    setStatusFilter(nextStatus);
    if (tokenRef.current) load(tokenRef.current, 1, search, nextStatus);
  }

  return (
    <Layout noindex title="Mis Medidores QR — Rifex">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>Mis Medidores QR</h1>
          <Link
            href="/crear-medidor-qr"
            style={{ padding: '9px 18px', borderRadius: 999, background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}
          >
            + Crear Medidor QR
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nombre o pregunta…"
            style={{ flex: '1 1 220px', padding: '9px 14px', borderRadius: 999, border: '1px solid #d1d5db', fontSize: 13.5 }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTER_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onFilterChange(t.key)}
                style={{
                  padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  border: statusFilter === t.key ? '2px solid #18A957' : '1px solid #d1d5db',
                  background: statusFilter === t.key ? '#f0fdf4' : '#fff',
                  color: statusFilter === t.key ? '#15803d' : '#334155',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {items === null && <p>Cargando…</p>}
        {items && items.length === 0 && !search && statusFilter === 'all' && (
          <div style={{ border: '1px dashed #d1d5db', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <p style={{ color: '#64748b', fontSize: 14.5, marginBottom: 16 }}>Aún no tienes Medidores QR.</p>
            <Link
              href="/crear-medidor-qr"
              style={{ display: 'inline-flex', padding: '10px 20px', borderRadius: 999, background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}
            >
              Crear Medidor QR
            </Link>
          </div>
        )}
        {items && items.length === 0 && (search || statusFilter !== 'all') && (
          <p style={{ color: '#94a3b8', fontSize: 13.5, textAlign: 'center', padding: '24px 0' }}>No hay Medidores QR que coincidan con tu búsqueda.</p>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {(items || []).map((m) => {
            const color = STATUS_COLOR[m.status] || STATUS_COLOR.active;
            return (
              <Link
                key={m.id}
                href={`/panel/medidor-qr/${m.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 18px', textDecoration: 'none', color: 'inherit', flexWrap: 'wrap', gap: 10 }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{m.name || m.question}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{m.question}</div>
                  <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 2 }}>
                    Escaneos: {m.scan_count} · Respuestas: {m.response_count}
                  </div>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: color.bg, color: color.fg }}>
                  {STATUS_LABEL[m.status] || m.status}
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
