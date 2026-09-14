// src/lib/colectaReconcile.js
// Funciones compartidas SOLO para la reconciliación de pagos de Colecta
// (C5R). No las usa ni las toca webhook-colecta.js — sigue exactamente
// como estaba, probado en producción. Mismo principio de sibling-file
// que rige todo Colecta: se reutiliza el PATRÓN ya certificado, nunca se
// edita lo que ya funciona. Nada de esto se usa desde ningún flujo de Rifa.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function resolveSellerToken(creatorId) {
  if (!creatorId) return null;
  const { data } = await supabase
    .from('merchant_gateways')
    .select('access_token')
    .eq('user_id', creatorId)
    .eq('provider', 'mp')
    .maybeSingle();
  return data?.access_token || null;
}

// Un aporte 'pending' nunca tiene mp_payment_id todavía — recién se
// guarda junto con el status en la transición final (ver
// webhook-colecta.js). La única referencia estable desde el momento en
// que se crea la preference es external_reference, que checkout/colecta.js
// siempre setea = contribution.id. Por eso acá se busca por
// external_reference vía la API de búsqueda de pagos de MP, no por
// payment id (que todavía no existe en la fila).
export async function searchColectaPaymentsByContribution(contributionId, sellerToken) {
  async function doSearch(token) {
    const r = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(contributionId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json };
  }

  const platformToken = process.env.MP_ACCESS_TOKEN || null;
  let platformFail = null;
  if (platformToken) {
    const p = await doSearch(platformToken);
    if (p.ok && Array.isArray(p.json?.results) && p.json.results.length) {
      return { ok: true, results: p.json.results, via: 'platform' };
    }
    if (!p.ok) platformFail = p;
    // Ok pero 0 resultados con el token de plataforma no es definitivo —
    // ese token normalmente no ve pagos cobrados por un vendedor conectado
    // vía OAuth. Siempre se intenta también con el token del vendedor,
    // igual que el fallback ya corregido en webhook-colecta.js.
  }
  if (sellerToken) {
    const s = await doSearch(sellerToken);
    if (s.ok) return { ok: true, results: s.json?.results || [], via: 'seller' };
    return { ok: false, status: s.status, json: s.json, via: 'seller' };
  }
  if (platformFail) return { ok: false, status: platformFail.status, json: platformFail.json, via: 'platform' };
  return { ok: false, status: 401, json: { error: 'no_seller_token' }, via: 'none' };
}

// Del conjunto de payments encontrados para un mismo external_reference
// (normalmente 1; puede haber más de uno si el aportante reintentó tras
// un rechazo), se elige el aprobado si existe alguno; si no, el más
// reciente. Nunca se combinan ni se suman más de un payment por aporte.
export function pickBestPayment(results) {
  if (!Array.isArray(results) || !results.length) return null;
  const approved = results.find((p) => String(p?.status || '').toLowerCase() === 'approved');
  if (approved) return approved;
  return [...results].sort((a, b) => new Date(b?.date_created || 0) - new Date(a?.date_created || 0))[0];
}

// Defensa adicional: la metadata REAL del payment (no el body de nadie)
// debe coincidir con la fila que se está reconciliando, aunque ya se haya
// encontrado por external_reference. Extraída como función pura para
// poder probarla sin depender de una llamada real a MP.
export function metadataMatches(mp, colectaId, contributionId) {
  const md = mp?.metadata || {};
  return md.colecta_id === colectaId && md.contribution_id === contributionId;
}

// Misma decisión que aplica webhook-colecta.js, extraída como función
// pura (sin tocar la DB) para no duplicar la lógica a mano acá.
export function computeColectaTransition(contribution, mp) {
  const mpStatus = String(mp?.status || '').toLowerCase();
  const paidAmountCents = Math.round(Number(mp?.transaction_amount || 0) * 100);

  if (paidAmountCents !== contribution.amount_cents) {
    return { newStatus: 'rejected', reason: 'amount_mismatch', paidAmountCents, marketplace_fee_cents: null };
  }
  if (mpStatus === 'approved') {
    const applicationFee = Array.isArray(mp?.fee_details)
      ? mp.fee_details.find((f) => f?.type === 'application_fee')
      : null;
    const marketplace_fee_cents = applicationFee
      ? Math.round(Number(applicationFee.amount || 0) * 100)
      : contribution.marketplace_fee_cents ?? null;
    return { newStatus: 'approved', reason: 'mp_approved', paidAmountCents, marketplace_fee_cents };
  }
  if (['rejected', 'cancelled'].includes(mpStatus)) {
    return { newStatus: 'rejected', reason: 'mp_rejected', paidAmountCents, marketplace_fee_cents: null };
  }
  return { newStatus: null, reason: 'intermediate', mpStatus, paidAmountCents, marketplace_fee_cents: null };
}

// Trazabilidad: reutiliza webhook_events (tabla ya genérica — payload
// jsonb sin columnas específicas de rifa, event_id único, sin RLS que
// bloquee al service role) sin cambiarle el esquema. event_id se genera
// fresco en cada corrida (no se dedupea) porque acá SÍ queremos una fila
// por cada intento de reconciliación, incluso repetidos sobre el mismo
// contribution — es un log de auditoría, no un guard de idempotencia (ese
// guard vive en el UPDATE con .eq('status','pending')).
export async function logReconcileTrace({ contributionId, colectaId, paymentId, previousStatus, resultingStatus, reason, error }) {
  try {
    await supabase.from('webhook_events').insert({
      event_type: 'colecta.reconcile',
      payment_id: paymentId ? String(paymentId) : null,
      payload: {
        contribution_id: contributionId,
        colecta_id: colectaId,
        previous_status: previousStatus,
        resulting_status: resultingStatus,
        reason,
        error: error || null,
      },
      event_id: `colrec_${contributionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
  } catch (e) {
    console.error('[colecta reconcile] trace log error', e?.message || e);
  }
}

export { supabase as colectaReconcileSupabase };
