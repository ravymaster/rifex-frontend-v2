// src/pages/api/events/[id]/ticket-types/[typeId].js
// EVENT-1 — PATCH: owner-only, editar/ocultar un tipo de entrada. DELETE:
// owner-only.
// EVENT-2 (Fase 3): un tipo con órdenes reales en su contra (paid,
// reserved via pending) no puede borrarse — la FK de event_order_items
// (sin ON DELETE CASCADE, a propósito) ya lo impide a nivel de DB; acá se
// chequea antes para devolver un error claro en vez de un 23503 crudo.
// Reducir quantity_total por debajo de sold+reserved también queda
// bloqueado por el CHECK de la migración — se traduce a 409 legible.
import { createClient } from '@supabase/supabase-js';
import { assertCreatorEligible } from '@/lib/trustIdentityGate';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  const { id, typeId } = req.query || {};
  if (!id || !typeId) return res.status(400).json({ ok: false, error: 'missing_id' });

  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

    const { data: event, error: evErr } = await supabase
      .from('events')
      .select('id, organizer_id')
      .eq('id', id)
      .maybeSingle();
    if (evErr) throw evErr;
    if (!event) return res.status(404).json({ ok: false, error: 'not_found' });
    if (event.organizer_id !== ures.user.id) return res.status(403).json({ ok: false, error: 'not_your_event' });

    // TRUST-1/TRUST-2: editar (nunca eliminar — quitar un tipo de entrada
    // reduce riesgo, mismo criterio que rifas/delete.js) exige onboarding
    // universal + identidad básica (18+, RUT para Chile).
    if (req.method === 'PATCH') {
      const eligibility = await assertCreatorEligible(ures.user.id);
      if (!eligibility.ok) return res.status(403).json({ ok: false, error: eligibility.reason, message: eligibility.message });
    }

    const { data: ticketType, error: ttErr } = await supabase
      .from('event_ticket_types')
      .select('id, event_id, quantity_sold, quantity_reserved')
      .eq('id', typeId)
      .maybeSingle();
    if (ttErr) throw ttErr;
    if (!ticketType || ticketType.event_id !== id) {
      return res.status(404).json({ ok: false, error: 'ticket_type_not_found' });
    }

    if (req.method === 'DELETE') {
      if ((ticketType.quantity_sold || 0) > 0 || (ticketType.quantity_reserved || 0) > 0) {
        return res.status(409).json({ ok: false, error: 'ticket_type_has_orders' });
      }
      const { error: delErr } = await supabase.from('event_ticket_types').delete().eq('id', typeId);
      if (delErr) {
        if (delErr.code === '23503') {
          return res.status(409).json({ ok: false, error: 'ticket_type_has_orders' });
        }
        throw delErr;
      }
      return res.status(200).json({ ok: true });
    }

    // PATCH
    const body = req.body || {};
    const patch = {};

    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name || name.length > 80) return res.status(400).json({ ok: false, error: 'invalid_name' });
      patch.name = name;
    }
    if (body.price_cents !== undefined) {
      const priceCents = Math.round(Number(body.price_cents));
      if (!Number.isFinite(priceCents) || priceCents < 0) return res.status(400).json({ ok: false, error: 'invalid_price' });
      patch.price_cents = priceCents;
    }
    if (body.quantity_total !== undefined) {
      const quantityTotal = Math.round(Number(body.quantity_total));
      if (!Number.isInteger(quantityTotal) || quantityTotal <= 0) {
        return res.status(400).json({ ok: false, error: 'invalid_quantity_total' });
      }
      patch.quantity_total = quantityTotal;
    }
    if (body.max_per_order !== undefined) {
      const maxPerOrder = Math.round(Number(body.max_per_order));
      if (!Number.isInteger(maxPerOrder) || maxPerOrder <= 0) {
        return res.status(400).json({ ok: false, error: 'invalid_max_per_order' });
      }
      patch.max_per_order = maxPerOrder;
    }
    if (body.sales_start_at !== undefined) {
      if (body.sales_start_at) {
        const d = new Date(body.sales_start_at);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_sales_start_at' });
        patch.sales_start_at = d.toISOString();
      } else {
        patch.sales_start_at = null;
      }
    }
    if (body.sales_end_at !== undefined) {
      if (body.sales_end_at) {
        const d = new Date(body.sales_end_at);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_sales_end_at' });
        patch.sales_end_at = d.toISOString();
      } else {
        patch.sales_end_at = null;
      }
    }
    if (body.sort_order !== undefined) {
      patch.sort_order = Math.round(Number(body.sort_order)) || 0;
    }
    if (body.status !== undefined) {
      if (!['active', 'hidden'].includes(body.status)) {
        return res.status(400).json({ ok: false, error: 'invalid_status' });
      }
      patch.status = body.status;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'empty_patch' });
    }
    patch.updated_at = new Date().toISOString();

    const { data: updated, error: updErr } = await supabase
      .from('event_ticket_types')
      .update(patch)
      .eq('id', typeId)
      .select('*')
      .single();
    if (updErr) {
      // EVENT-8: event_ticket_types_capacity_trg — subir quantity_total o
      // reactivar (status='active') un tipo que empuje la suma comprometida
      // por sobre events.capacity se traduce a 409 legible.
      if (updErr.code === 'P0001' || /event_capacity_exceeded/.test(updErr.message || '')) {
        return res.status(409).json({ ok: false, error: 'event_capacity_exceeded' });
      }
      throw updErr;
    }

    return res.status(200).json({ ok: true, ticket_type: updated });
  } catch (e) {
    console.error('[api/events/[id]/ticket-types/[typeId]] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
