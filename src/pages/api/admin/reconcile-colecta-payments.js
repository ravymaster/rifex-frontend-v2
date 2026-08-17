// src/pages/api/admin/reconcile-colecta-payments.js
// Reconciliación de respaldo para Colecta (C5R). Archivo nuevo, sibling
// de admin/reconcile-payments.js (Rifa) — no lo toca, no comparte código
// en runtime con él, mismo mecanismo de auth (x-admin-token).
//
// Mercado Pago es la fuente de verdad. Un aporte 'pending' nunca tiene
// mp_payment_id todavía (recién se guarda junto al status en la
// transición final), así que se busca el pago real por
// external_reference = contribution.id (seteado siempre en
// checkout/colecta.js), nunca por un payment_id que todavía no existe en
// la fila. Toda la lógica de decisión (fetch/búsqueda con fallback al
// token del vendedor, chequeo de monto, mapeo de estado) está extraída
// en src/lib/colectaReconcile.js para no copiar a mano lo que ya está
// probado en webhook-colecta.js.
import { createClient } from '@supabase/supabase-js';
import {
  resolveSellerToken,
  searchColectaPaymentsByContribution,
  pickBestPayment,
  metadataMatches,
  computeColectaTransition,
  logReconcileTrace,
} from '@/lib/colectaReconcile';

export const config = { runtime: 'nodejs' };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function reconcileOne(contributionId) {
  // Re-fetch fresco: la fila pudo haber cambiado entre que se armó la
  // lista de candidatos y que le toca el turno acá.
  const { data: contribution, error: cErr } = await supabase
    .from('colecta_contributions')
    .select('*')
    .eq('id', contributionId)
    .maybeSingle();
  if (cErr) return { contribution_id: contributionId, ok: false, error: 'db_error', detail: cErr.message };
  if (!contribution) return { contribution_id: contributionId, ok: false, error: 'contribution_not_found' };

  if (contribution.status !== 'pending') {
    return { contribution_id: contributionId, ok: true, already_processed: true, status: contribution.status };
  }

  const { data: colecta, error: colErr } = await supabase
    .from('colectas')
    .select('id, creator_id')
    .eq('id', contribution.colecta_id)
    .maybeSingle();
  if (colErr) return { contribution_id: contributionId, ok: false, error: 'db_error', detail: colErr.message };
  if (!colecta) {
    await logReconcileTrace({
      contributionId, colectaId: contribution.colecta_id, paymentId: null,
      previousStatus: 'pending', resultingStatus: 'pending', reason: 'colecta_not_found',
    });
    return { contribution_id: contributionId, ok: false, error: 'colecta_not_found' };
  }

  const sellerToken = await resolveSellerToken(colecta.creator_id);
  if (!sellerToken) {
    await logReconcileTrace({
      contributionId, colectaId: colecta.id, paymentId: null,
      previousStatus: 'pending', resultingStatus: 'pending', reason: 'no_seller_token',
    });
    return { contribution_id: contributionId, ok: false, error: 'no_seller_token' };
  }

  const search = await searchColectaPaymentsByContribution(contributionId, sellerToken);
  if (!search.ok) {
    await logReconcileTrace({
      contributionId, colectaId: colecta.id, paymentId: null,
      previousStatus: 'pending', resultingStatus: 'pending', reason: 'search_failed',
      error: `status=${search.status} via=${search.via}`,
    });
    return { contribution_id: contributionId, ok: false, error: 'search_failed', status: search.status, via: search.via };
  }

  const mp = pickBestPayment(search.results);
  if (!mp) {
    // No hay ningún payment de MP con esta referencia todavía — el
    // aportante nunca terminó el checkout, o MP aún no lo procesó.
    // 'pending' es el estado correcto, no un error.
    await logReconcileTrace({
      contributionId, colectaId: colecta.id, paymentId: null,
      previousStatus: 'pending', resultingStatus: 'pending', reason: 'no_payment_found',
    });
    return { contribution_id: contributionId, ok: true, kept_pending: true, reason: 'no_payment_found' };
  }

  // Defensa adicional: la metadata REAL del payment (no el body de nadie)
  // debe coincidir con la fila que se está reconciliando, aunque ya se
  // haya encontrado por external_reference.
  if (!metadataMatches(mp, colecta.id, contribution.id)) {
    await logReconcileTrace({
      contributionId, colectaId: colecta.id, paymentId: mp?.id || null,
      previousStatus: 'pending', resultingStatus: 'pending', reason: 'metadata_mismatch',
      error: JSON.stringify({ expected: { colecta_id: colecta.id, contribution_id: contribution.id }, got: mp?.metadata || {} }),
    });
    return { contribution_id: contributionId, ok: false, error: 'metadata_mismatch' };
  }

  const transition = computeColectaTransition(contribution, mp);

  if (!transition.newStatus) {
    // Estado intermedio real de MP (pending/in_process/authorized/etc) —
    // se mantiene pending, no es un error.
    await logReconcileTrace({
      contributionId, colectaId: colecta.id, paymentId: mp.id,
      previousStatus: 'pending', resultingStatus: 'pending', reason: transition.reason,
      error: transition.mpStatus ? `mp_status=${transition.mpStatus}` : null,
    });
    return { contribution_id: contributionId, ok: true, kept_pending: true, mp_status: transition.mpStatus, payment_id: mp.id };
  }

  // Guard .eq('status','pending') de nuevo: si el webhook (o otra corrida
  // de reconciliación) ya la procesó justo ahora, esta pierde la carrera
  // sin romper nada.
  const { data: updated, error: uErr } = await supabase
    .from('colecta_contributions')
    .update({
      status: transition.newStatus,
      mp_payment_id: String(mp.id),
      marketplace_fee_cents: transition.marketplace_fee_cents,
    })
    .eq('id', contributionId)
    .eq('colecta_id', colecta.id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (uErr) {
    if (uErr.code === '23505') {
      // unique(mp_payment_id): este payment_id ya acreditó otra contribution.
      await logReconcileTrace({
        contributionId, colectaId: colecta.id, paymentId: mp.id,
        previousStatus: 'pending', resultingStatus: 'pending', reason: 'payment_already_used',
      });
      return { contribution_id: contributionId, ok: false, error: 'payment_already_used', payment_id: mp.id };
    }
    await logReconcileTrace({
      contributionId, colectaId: colecta.id, paymentId: mp.id,
      previousStatus: 'pending', resultingStatus: 'pending', reason: 'db_error', error: uErr.message,
    });
    return { contribution_id: contributionId, ok: false, error: 'db_error', detail: uErr.message };
  }

  if (!updated) {
    await logReconcileTrace({
      contributionId, colectaId: colecta.id, paymentId: mp.id,
      previousStatus: 'pending', resultingStatus: 'race_lost', reason: transition.reason,
    });
    return { contribution_id: contributionId, ok: true, already_processed: true, race: true };
  }

  await logReconcileTrace({
    contributionId, colectaId: colecta.id, paymentId: mp.id,
    previousStatus: 'pending', resultingStatus: transition.newStatus, reason: transition.reason,
  });
  return { contribution_id: contributionId, ok: true, status: transition.newStatus, payment_id: mp.id, reason: transition.reason };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const adminHeader = req.headers['x-admin-token'];
  if (!adminHeader || adminHeader !== process.env.ADMIN_API_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const { contribution_id, limit = 20 } = req.body || {};
    let candidateIds = [];

    if (contribution_id) {
      candidateIds = [String(contribution_id)];
    } else {
      // Solo filas con referencia suficiente para consultar MP: una
      // preference real fue creada (mp_preference_id no nulo). Una fila
      // pending sin eso nunca tuvo checkout — no hay nada que reconciliar.
      const { data, error } = await supabase
        .from('colecta_contributions')
        .select('id')
        .eq('status', 'pending')
        .not('mp_preference_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(Math.min(100, Number(limit) || 20));
      if (error) throw error;
      candidateIds = (data || []).map((r) => r.id);
    }

    const results = [];
    for (const id of candidateIds) {
      results.push(await reconcileOne(id));
    }

    return res.status(200).json({ ok: true, checked: results.length, results });
  } catch (e) {
    console.error('[reconcile-colecta] fatal:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
