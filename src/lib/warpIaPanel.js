// src/lib/warpIaPanel.js
// Panel «Warp IA» (/ia) — cliente de SOLO LECTURA hacia la API de billing de
// Warp DEV (contrato del Note: ENTREGA_LENOVO_WARP_BILLING_API, 2026-11-27).
// Solo se usa en el servidor de Rifex (src/pages/api/ia/[vista].js); la URL y
// la credencial nunca llegan al navegador.
//
// Reglas:
// - Warp es la fuente de verdad. Rifex no guarda ni duplica saldos, recargas
//   ni consumo, y no procesa cobros: solo GET a las rutas de lectura.
// - Nunca se usa la credencial admin de Warp ni la ruta v1 de resumen.
// - Un dato que Warp no entrega queda en null y la UI muestra «No disponible».
// - Solo pasan los campos de la lista blanca; ids de pago del proveedor y el
//   resto de la respuesta se descartan.
//
// Variables privadas del servidor (nunca NEXT_PUBLIC_*):
//   WARP_BILLING_API_URL     — base de Warp DEV
//   WARP_BILLING_READ_TOKEN  — credencial de solo lectura (Bearer)

const ROUTES = Object.freeze({
  sites: '/api/v1/admin/billing/sites',
  recharges: '/api/v1/admin/billing/recharges',
  consumption: '/api/v1/admin/billing/consumption',
});

export const WARP_IA_VIEWS = Object.freeze({
  clientes: { title: 'Clientes y sitios' },
  recargas: { title: 'Recargas' },
  consumo: { title: 'Consumo' },
});

const TIMEOUT_MS = 8000;
const MAX_ROWS = 500;
const MAX_SITES_CONSUMPTION = 50;
const CONSUMPTION_DAYS = 30;

export function warpIaConfigured(env = process.env) {
  return Boolean(env.WARP_BILLING_API_URL && env.WARP_BILLING_READ_TOKEN);
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (v === undefined || v === null || v === '' ? null : String(v).slice(0, 200));
const bool = (v) => (typeof v === 'boolean' ? v : null);

class WarpIaError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

async function getJson(env, fetchImpl, route, query = {}) {
  const base = String(env.WARP_BILLING_API_URL).replace(/\/+$/, '');
  const qs = new URLSearchParams(
    Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${base}${route}${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.WARP_BILLING_READ_TOKEN}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) throw new WarpIaError('warp_rechaza_credencial');
    if (!res.ok) throw new WarpIaError('warp_no_responde');
    const json = await res.json().catch(() => null);
    if (!json || json.ok !== true) throw new WarpIaError('formato_no_reconocido');
    return json;
  } catch (e) {
    if (e instanceof WarpIaError) throw e;
    throw new WarpIaError('warp_no_responde');
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeSite(s) {
  const providers = Array.isArray(s?.providers)
    ? s.providers.map((p) => str(typeof p === 'string' ? p : p?.provider || p?.name)).filter(Boolean)
    : null;
  return {
    site_id: str(s?.siteId),
    site_name: str(s?.name),
    estado: str(s?.estado),
    billing_enabled: bool(s?.billingEnabled),
    currency: str(s?.currency),
    balance_clp: num(s?.balanceClp),
    reserved_clp: num(s?.reservedClp),
    day_consumption_clp: num(s?.dayConsumptionClp),
    month_consumption_clp: num(s?.monthConsumptionClp),
    daily_cap_clp: num(s?.dailyCapClp),
    monthly_cap_clp: num(s?.monthlyCapClp),
    min_balance_clp: num(s?.minBalanceClp),
    providers: providers === null ? null : providers.length ? providers.join(', ') : 'Ninguno configurado',
  };
}

export function normalizeRecharge(r) {
  return {
    topup_id: str(r?.topupId),
    site_id: str(r?.siteId),
    site_name: str(r?.siteName),
    provider: str(r?.provider),
    currency: str(r?.currency),
    requested_amount: num(r?.requestedAmount),
    credit_expected_clp: num(r?.creditExpectedClp),
    fx_clp_per_usd: num(r?.fxClpPerUsd),
    created_at: num(r?.createdAt),
    provider_status: str(r?.providerStatus),
    payment_confirmed: bool(r?.paymentConfirmed),
    confirmed_at: num(r?.confirmedAt),
    balance_credited: bool(r?.balanceCredited),
    credited_at: num(r?.creditedAt),
    note: str(r?.note),
  };
}

// Consumo de un sitio → filas por mes y por día. Si Warp solo observa el gasto
// (source governor_only, sin billetera), el costo de OpenAI del mes viene de
// observedByGovernor y el monto descontado queda «No disponible».
export function normalizeConsumption(site, c) {
  const base = {
    site_id: str(c?.siteId) || site.site_id,
    site_name: site.site_name,
    source: str(c?.source),
    wallet_billing: bool(c?.walletBilling),
  };
  const rows = [];
  for (const m of Array.isArray(c?.months) ? c.months : []) {
    rows.push({ ...base, kind: 'Mes', period: str(m?.month), openai_cost_usd: num(m?.openaiCostUsd), charged_clp: num(m?.chargedClp) });
  }
  for (const d of Array.isArray(c?.days) ? c.days : []) {
    rows.push({ ...base, kind: 'Día', period: str(d?.day), openai_cost_usd: num(d?.openaiCostUsd), charged_clp: num(d?.chargedClp) });
  }
  const g = c?.observedByGovernor;
  if (!rows.length && g) {
    rows.push({ ...base, kind: 'Mes (observado)', period: str(g.month), openai_cost_usd: num(g.monthSpentUsd), charged_clp: null });
  }
  if (!rows.length) rows.push({ ...base, kind: null, period: null, openai_cost_usd: null, charged_clp: null });
  return rows;
}

async function readView(view, env, fetchImpl) {
  if (view === 'clientes') {
    const j = await getJson(env, fetchImpl, ROUTES.sites);
    if (!Array.isArray(j.sites)) throw new WarpIaError('formato_no_reconocido');
    return { items: j.sites.slice(0, MAX_ROWS).map(normalizeSite), meta: {} };
  }
  if (view === 'recargas') {
    const j = await getJson(env, fetchImpl, ROUTES.recharges, { limit: MAX_ROWS });
    if (!Array.isArray(j.recharges)) throw new WarpIaError('formato_no_reconocido');
    return {
      items: j.recharges.slice(0, MAX_ROWS).map(normalizeRecharge),
      meta: { unmatched_payments: num(j.unmatchedPayments) },
    };
  }
  // consumo: siteId es obligatorio en Warp → se leen los sitios y luego cada uno.
  const s = await getJson(env, fetchImpl, ROUTES.sites);
  if (!Array.isArray(s.sites)) throw new WarpIaError('formato_no_reconocido');
  const sites = s.sites.slice(0, MAX_SITES_CONSUMPTION).map(normalizeSite).filter((x) => x.site_id);
  const parts = await Promise.all(
    sites.map(async (site) => {
      try {
        const j = await getJson(env, fetchImpl, ROUTES.consumption, { siteId: site.site_id, days: CONSUMPTION_DAYS });
        return normalizeConsumption(site, j.consumption);
      } catch {
        return normalizeConsumption(site, null);
      }
    })
  );
  return { items: parts.flat().slice(0, MAX_ROWS), meta: {} };
}

export async function fetchWarpIaView(view, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!Object.prototype.hasOwnProperty.call(WARP_IA_VIEWS, view)) {
    return { available: false, reason: 'vista_desconocida', items: [], meta: {} };
  }
  if (!warpIaConfigured(env)) return { available: false, reason: 'api_no_configurada', items: [], meta: {} };
  try {
    const out = await readView(view, env, fetchImpl);
    return { available: true, reason: null, ...out };
  } catch (e) {
    return { available: false, reason: e?.reason || 'warp_no_responde', items: [], meta: {} };
  }
}
