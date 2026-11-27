// src/pages/ia/index.jsx
// «Warp IA» — panel privado de operación, independiente de /admin.
// Tres vistas: Clientes y sitios, Recargas y Consumo. Todo se lee de la API
// de operación de Warp a través del servidor de Rifex (/api/ia/[vista]); Rifex
// no guarda ni duplica saldos y no procesa cobros. Un dato que Warp no
// entrega se muestra como «No disponible», nunca como cero.
// Boundary SSR igual a /admin/warp (app_metadata.role = 'admin', más la puerta
// temporal DEV, código muerto en PROD). La autoridad real vive en
// /api/ia/[vista] vía resolveAdmin.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { NO_DISPONIBLE, formatCell } from '@/lib/warpIaFormat';
import { isDevDoorEligible, validateDevDoorSession, devDoorCookieName } from '@/lib/devAdminDoor';

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
    if (isDevDoorEligible()) {
      const sessionId = ctx.req.cookies?.[devDoorCookieName()];
      if (sessionId && (await validateDevDoorSession(sessionId))) return { props: {} };
    }
    return { redirect: { destination: '/login?next=/ia', permanent: false } };
  }
  if (user.app_metadata?.role !== 'admin') return { redirect: { destination: '/', permanent: false } };
  return { props: {} };
}

const VIEWS = [
  {
    key: 'clientes',
    label: 'Clientes y sitios',
    columns: [
      ['site_name', 'Sitio'], ['site_id', 'Id del sitio'], ['estado', 'Estado', 'estado'], ['billing_enabled', 'Facturación activa', 'bool'],
      ['balance_clp', 'Saldo', 'clp'], ['reserved_clp', 'Reservado', 'clp'], ['day_consumption_clp', 'Consumo hoy', 'clp'],
      ['month_consumption_clp', 'Consumo del mes', 'clp'], ['daily_cap_clp', 'Tope diario', 'clp'], ['monthly_cap_clp', 'Tope mensual', 'clp'],
      ['min_balance_clp', 'Saldo mínimo', 'clp'], ['providers', 'Medios de pago'],
    ],
  },
  {
    key: 'recargas',
    label: 'Recargas',
    columns: [
      ['created_at', 'Creada', 'date'], ['site_name', 'Sitio'], ['provider', 'Proveedor', 'provider'], ['requested_amount', 'Monto pedido', 'amount'],
      ['credit_expected_clp', 'Crédito esperado', 'clp'], ['payment_confirmed', 'Pago confirmado', 'bool'], ['confirmed_at', 'Confirmado el', 'date'],
      ['balance_credited', 'Saldo acreditado', 'bool'], ['credited_at', 'Acreditado el', 'date'], ['provider_status', 'Estado del proveedor'],
      ['note', 'Observación', 'note'],
    ],
  },
  {
    key: 'consumo',
    label: 'Consumo',
    columns: [
      ['site_name', 'Sitio'], ['kind', 'Tipo'], ['period', 'Período'], ['openai_cost_usd', 'Costo de OpenAI', 'usd'],
      ['charged_clp', 'Monto descontado al cliente', 'clp'], ['wallet_billing', 'Billetera activa', 'bool'],
    ],
  },
];

const card = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: 16 };
const th = { textAlign: 'left', padding: '10px 12px', fontSize: 12, color: '#6B7280', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #F3F4F6', verticalAlign: 'top' };
const muted = { color: '#9CA3AF' };

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function WarpIaPanel() {
  const router = useRouter();
  const current = VIEWS.find((v) => v.key === router.query.vista) || VIEWS[0];
  const [state, setState] = useState({ status: 'loading', items: [], available: false });

  useEffect(() => {
    if (!router.isReady) return undefined;
    let cancelled = false;
    setState({ status: 'loading', items: [], available: false });
    (async () => {
      try {
        const res = await fetch(`/api/ia/${current.key}`, { headers: await authHeaders() });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) return setState({ status: 'denied', items: [], available: false });
        if (!res.ok || !json?.ok) return setState({ status: 'error', items: [], available: false });
        setState({ status: 'ok', items: json.items || [], available: Boolean(json.available), meta: json.meta || {}, fetchedAt: json.fetched_at });
      } catch {
        if (!cancelled) setState({ status: 'error', items: [], available: false });
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, current.key]);

  return (
    <>
      <Head><title>Warp IA — Rifex</title><meta name="robots" content="noindex, nofollow" /></Head>
      <main style={{ padding: '32px 16px 80px', background: '#F9FAFB', minHeight: '100vh' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 26 }}>Warp IA</h1>
          <p style={{ margin: '0 0 20px', color: '#6B7280', fontSize: 14 }}>
            Datos de facturación leídos de Warp DEV (solo lectura). Rifex no guarda saldos, no procesa cobros y no cambia la facturación desde este panel.
          </p>
          <nav aria-label="Vistas de Warp IA" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={{ pathname: '/ia', query: { vista: v.key } }}
                aria-current={v.key === current.key ? 'page' : undefined}
                style={{
                  padding: '8px 16px', borderRadius: 999, fontWeight: 700, fontSize: 14, textDecoration: 'none',
                  background: v.key === current.key ? '#1E3A8A' : '#fff', color: v.key === current.key ? '#fff' : '#1E3A8A',
                  border: '1px solid #1E3A8A',
                }}
              >
                {v.label}
              </Link>
            ))}
          </nav>
          <section style={card} aria-live="polite">
            <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>{current.label}</h2>
            {state.status === 'loading' && <p style={muted}>Cargando…</p>}
            {state.status === 'denied' && <p>No tienes acceso a este panel.</p>}
            {state.status === 'error' && <p>{NO_DISPONIBLE}: no se pudo consultar el panel.</p>}
            {state.status === 'ok' && !state.available && (
              <p data-testid="ia-no-disponible">{NO_DISPONIBLE}: Warp todavía no entrega estos datos.</p>
            )}
            {state.status === 'ok' && state.available && current.key === 'recargas' && (
              <p style={{ margin: '0 0 12px', fontSize: 13 }}>
                Pagos sin recarga asociada:{' '}
                <strong>{typeof state.meta?.unmatched_payments === 'number' ? state.meta.unmatched_payments.toLocaleString('es-CL') : NO_DISPONIBLE}</strong>
              </p>
            )}
            {state.status === 'ok' && state.available && current.key === 'consumo' && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280' }}>
                El costo de OpenAI y el monto descontado al cliente se muestran por separado. Sin billetera activa, Warp solo observa el costo y el descuento queda «No disponible».
              </p>
            )}
            {state.status === 'ok' && state.available && state.items.length === 0 && <p style={muted}>Warp no informa registros.</p>}
            {state.status === 'ok' && state.available && state.items.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{current.columns.map((c) => <th key={c[0]} style={th}>{c[1]}</th>)}</tr></thead>
                  <tbody>
                    {state.items.map((row, i) => (
                      <tr key={i}>
                        {current.columns.map((c) => {
                          const text = formatCell(row, c);
                          return <td key={c[0]} style={{ ...td, ...(text === NO_DISPONIBLE ? muted : null) }}>{text}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
