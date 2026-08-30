// src/pages/api/rifas/[id]/index.js
import { createClient } from '@supabase/supabase-js';
import { assertCreatorEligible } from '@/lib/trustIdentityGate';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Campos editables desde el panel (seguros)
const ALLOWED_FIELDS = new Set([
  'prize_type', 'prize_amount_cents', 'end_date', 'status',
  // RIFEX CLOSURE PASS (2026-08-29): condiciones económicas del premio —
  // editables solo ANTES de la primera venta (ver el mismo chequeo de
  // soldCount de abajo, extendido para cubrir estos campos también).
  'delivery_method', 'requires_transfer_procedures', 'transfer_expenses_owner', 'transfer_conditions',
]);

const DELIVERY_METHODS_FOR_NEW_RAFFLES = new Set(['retira_en_tienda', 'envio_incluido', 'envio_pagado']);
const TRANSFER_EXPENSES_OWNERS = new Set(['creator', 'winner']);
const MAX_TRANSFER_CONDITIONS_LENGTH = 500;
const PRIZE_CONDITION_FIELDS = ['prize_type', 'prize_amount_cents', 'delivery_method', 'requires_transfer_procedures', 'transfer_expenses_owner', 'transfer_conditions'];

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('raffles').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.status(200).json({ ok: true, data });
    }

    if (req.method === 'PATCH') {
      const authz = req.headers.authorization || '';
      const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
      if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

      const { data: ures, error: uerr } = await supabase.auth.getUser(token);
      if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
      const uid = ures.user.id;
      const email = (ures.user.email || '').toLowerCase();

      const { data: raffle, error: rErr } = await supabase
        .from('raffles')
        .select('id,creator_id,creator_email,status,prize_type,delivery_method,requires_transfer_procedures,transfer_expenses_owner,transfer_conditions')
        .eq('id', id)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!raffle) return res.status(404).json({ ok: false, error: 'not_found' });
      const isOwner = raffle.creator_id === uid || (raffle.creator_email || '').toLowerCase() === email;
      if (!isOwner) return res.status(403).json({ ok: false, error: 'not_your_raffle' });

      // TRUST-1/TRUST-2: editar/publicar (incluye cambios de `status`)
      // exige onboarding universal + identidad básica (18+, RUT para
      // Chile) — mismo criterio server-side que la creación.
      const eligibility = await assertCreatorEligible(uid);
      if (!eligibility.ok) return res.status(403).json({ ok: false, error: eligibility.reason, message: eligibility.message });

      const body = req.body || {};
      const updates = {};

      for (const k of Object.keys(body)) {
        if (ALLOWED_FIELDS.has(k)) updates[k] = body[k];
      }

      if ('prize_amount_cents' in updates) {
        updates.prize_amount_cents = Math.max(0, Math.round(Number(updates.prize_amount_cents || 0)));
      }

      // DRAW-1 + RIFEX CLOSURE PASS (2026-08-29): campos congelados desde
      // la primera venta (premio + condiciones económicas del premio).
      // Precio por número, total de números y extension_limit ya no son
      // editables por este endpoint desde antes de DRAW-1 (no están en
      // ALLOWED_FIELDS), así que quedan protegidos por construcción.
      // Indicador autoritativo real de "ya hay participación pagada":
      // tickets.status='sold' — el mismo que ya usaba DRAW-1, reutilizado
      // sin rediseño para delivery_method/transferencia.
      const touchesPrizeConditions = PRIZE_CONDITION_FIELDS.some((f) => f in updates);
      if (touchesPrizeConditions) {
        const { count: soldCount, error: sErr } = await supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('raffle_id', id)
          .eq('status', 'sold');
        if (sErr) throw sErr;
        if ((soldCount ?? 0) > 0) {
          return res.status(409).json({ ok: false, error: 'fields_locked_after_first_sale' });
        }

        // Mismas reglas que la creación (POST /api/rifas), evaluadas
        // sobre el estado EFECTIVO resultante (lo que llega en este PATCH
        // combinado con lo que la rifa ya tenía) — nunca confiar en que
        // el cliente mande el objeto completo.
        const effectivePrizeType = 'prize_type' in updates ? updates.prize_type : raffle.prize_type;
        if (effectivePrizeType === 'money') {
          updates.delivery_method = null;
          updates.requires_transfer_procedures = false;
          updates.transfer_expenses_owner = null;
          updates.transfer_conditions = null;
        } else if (effectivePrizeType === 'physical') {
          const effectiveDelivery = 'delivery_method' in updates ? updates.delivery_method : raffle.delivery_method;
          if (!DELIVERY_METHODS_FOR_NEW_RAFFLES.has(effectiveDelivery)) {
            return res.status(400).json({ ok: false, error: 'invalid_delivery_method' });
          }
          updates.delivery_method = effectiveDelivery;
          const effectiveRequiresTransfer = 'requires_transfer_procedures' in updates
            ? updates.requires_transfer_procedures === true
            : raffle.requires_transfer_procedures === true;
          updates.requires_transfer_procedures = effectiveRequiresTransfer;
          if (!effectiveRequiresTransfer) {
            updates.transfer_expenses_owner = null;
            updates.transfer_conditions = null;
          } else {
            const effectiveOwner = 'transfer_expenses_owner' in updates ? updates.transfer_expenses_owner : raffle.transfer_expenses_owner;
            if (!TRANSFER_EXPENSES_OWNERS.has(effectiveOwner)) {
              return res.status(400).json({ ok: false, error: 'invalid_transfer_expenses_owner' });
            }
            const rawConditions = 'transfer_conditions' in updates ? updates.transfer_conditions : raffle.transfer_conditions;
            const effectiveConditions = typeof rawConditions === 'string' ? rawConditions.trim() : '';
            if (!effectiveConditions) {
              return res.status(400).json({ ok: false, error: 'missing_transfer_conditions' });
            }
            if (effectiveConditions.length > MAX_TRANSFER_CONDITIONS_LENGTH) {
              return res.status(400).json({ ok: false, error: 'transfer_conditions_too_long' });
            }
            updates.transfer_expenses_owner = effectiveOwner;
            updates.transfer_conditions = effectiveConditions;
          }
        } else {
          return res.status(400).json({ ok: false, error: 'invalid_prize_type' });
        }
      }

      const closingNow = 'status' in updates && updates.status === 'closed' && raffle.status !== 'closed';
      if (closingNow && !updates.end_date) {
        updates.end_date = new Date().toISOString().slice(0, 10);
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ ok: false, error: 'no_allowed_fields' });
      }

      const { data, error } = await supabase
        .from('raffles')
        .update(updates)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ ok: false, error: 'not_found' });

      // DRAW-1: "cerrar ventas" ya NO sortea automáticamente. Cerrar detiene
      // la venta (vía el gate de tiempo en checkout/mp.js si sales_end_at
      // estaba configurado, y de todos modos deja de mostrarse como activa);
      // elegir ganador es una acción explícita y separada — ver
      // POST /api/rifas/[id]/draw. El sorteo automático por sold-out (vía
      // webhook/reconciliación) sigue exactamente igual, sin cambios.
      return res.status(200).json({ ok: true, data });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/rifas/[id]] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
