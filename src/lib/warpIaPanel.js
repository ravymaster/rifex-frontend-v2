// src/lib/warpIaPanel.js
// Panel «Warp IA» (/ia) — cliente de SOLO LECTURA hacia la API de operación
// que entrega Warp (el Note). Solo se usa en el servidor de Rifex
// (src/pages/api/ia/[vista].js); la URL y la clave nunca llegan al navegador.
//
// Reglas:
// - Rifex no guarda ni duplica saldos, recargas ni consumo: cada lectura va a
//   Warp y se muestra tal cual.
// - Rifex no procesa cobros: no hay POST/PUT/DELETE hacia Warp.
// - Un dato que Warp no entrega queda en null y la UI muestra «No disponible»
//   (nunca un cero inventado).
// - Solo pasan los campos de la lista blanca de cada vista; el resto de la
//   respuesta de Warp se descarta.
//
// Variables (servidor, provisorias hasta confirmar con el Note):
//   WARP_IA_API_URL  — base de la API de operación de Warp
//   WARP_IA_API_KEY  — credencial de solo lectura para esa API

export const WARP_IA_VIEWS = Object.freeze({
  clientes: {
    path: 'clientes',
    title: 'Clientes y sitios',
    fields: ['client_id', 'client_name', 'domain', 'site_status', 'plan', 'balance', 'currency', 'updated_at'],
  },
  recargas: {
    path: 'recargas',
    title: 'Recargas',
    fields: ['recharge_id', 'client_name', 'domain', 'amount', 'currency', 'status', 'created_at'],
  },
  consumo: {
    path: 'consumo',
    title: 'Consumo',
    fields: ['client_name', 'domain', 'period', 'conversations', 'model_calls', 'tokens', 'cost', 'currency', 'limit_status'],
  },
});

const TIMEOUT_MS = 8000;
const MAX_ROWS = 500;

export function warpIaConfigured(env = process.env) {
  return Boolean(env.WARP_IA_API_URL && env.WARP_IA_API_KEY);
}

const clean = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  return String(v).slice(0, 200);
};

export function normalizeWarpIaRows(view, payload) {
  const spec = WARP_IA_VIEWS[view];
  const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.data?.items) ? payload.data.items : null;
  if (!spec || !items) return null;
  return items.slice(0, MAX_ROWS).map((row) => Object.fromEntries(spec.fields.map((f) => [f, clean(row?.[f])])));
}

export async function fetchWarpIaView(view, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const spec = WARP_IA_VIEWS[view];
  if (!spec) return { available: false, reason: 'vista_desconocida', items: [] };
  if (!warpIaConfigured(env)) return { available: false, reason: 'api_no_configurada', items: [] };
  const base = String(env.WARP_IA_API_URL).replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${base}/${spec.path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.WARP_IA_API_KEY}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return { available: false, reason: 'warp_no_responde', items: [] };
    const rows = normalizeWarpIaRows(view, await res.json().catch(() => null));
    if (!rows) return { available: false, reason: 'formato_no_reconocido', items: [] };
    return { available: true, reason: null, items: rows };
  } catch {
    return { available: false, reason: 'warp_no_responde', items: [] };
  } finally {
    clearTimeout(timer);
  }
}
