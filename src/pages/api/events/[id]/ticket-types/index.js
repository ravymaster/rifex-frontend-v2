// src/pages/api/events/[id]/ticket-types/index.js
// EVENT-1 — GET: público (tipos activos) si el evento padre está
// published, o todos los tipos si el requester es el dueño. POST:
// owner-only, crea un tipo de entrada en el evento. Sin orders todavía en
// EVENT-1, así que la edición/creación es simple — EVENT-2 en adelante
// deberá impedir tocar snapshots de tipos ya usados por una orden.
import { createClient } from '@supabase/supabase-js';
import { assertCreatorEligible } from '@/lib/trustIdentityGate';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function getRequester(req) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return null;
  const { data: ures, error } = await supabase.auth.getUser(token);
  if (error || !ures?.user) return null;
  return ures.user;
}

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const { data: event, error: evErr } = await supabase
      .from('events')
      .select('id, organizer_id, status')
      .eq('id', id)
      .maybeSingle();
    if (evErr) throw evErr;
    if (!event) return res.status(404).json({ ok: false, error: 'not_found' });

    if (req.method === 'GET') {
      const user = await getRequester(req);
      const isOwner = !!user && user.id === event.organizer_id;

      if (!isOwner && event.status !== 'published') {
        return res.status(404).json({ ok: false, error: 'not_found' });
      }

      let query = supabase
        .from('event_ticket_types')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });
      if (!isOwner) query = query.eq('status', 'active');

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ ok: true, items: data || [] });
    }

    if (req.method === 'POST') {
      const user = await getRequester(req);
      if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });
      if (user.id !== event.organizer_id) return res.status(403).json({ ok: false, error: 'not_your_event' });

      // TRUST-1/TRUST-2: crear un tipo de entrada exige onboarding
      // universal + identidad básica (18+, RUT para Chile).
      const eligibility = await assertCreatorEligible(user.id);
      if (!eligibility.ok) return res.status(403).json({ ok: false, error: eligibility.reason, message: eligibility.message });

      const body = req.body || {};
      const name = String(body.name || '').trim();
      if (!name || name.length > 80) return res.status(400).json({ ok: false, error: 'invalid_name' });

      const priceCents = Math.round(Number(body.price_cents));
      if (!Number.isFinite(priceCents) || priceCents < 0) {
        return res.status(400).json({ ok: false, error: 'invalid_price' });
      }

      const quantityTotal = Math.round(Number(body.quantity_total));
      if (!Number.isInteger(quantityTotal) || quantityTotal <= 0) {
        return res.status(400).json({ ok: false, error: 'invalid_quantity_total' });
      }

      const maxPerOrder = body.max_per_order != null ? Math.round(Number(body.max_per_order)) : 10;
      if (!Number.isInteger(maxPerOrder) || maxPerOrder <= 0) {
        return res.status(400).json({ ok: false, error: 'invalid_max_per_order' });
      }

      let salesStartAt = null;
      let salesEndAt = null;
      if (body.sales_start_at) {
        const d = new Date(body.sales_start_at);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_sales_start_at' });
        salesStartAt = d.toISOString();
      }
      if (body.sales_end_at) {
        const d = new Date(body.sales_end_at);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_sales_end_at' });
        salesEndAt = d.toISOString();
      }
      if (salesStartAt && salesEndAt && new Date(salesEndAt).getTime() <= new Date(salesStartAt).getTime()) {
        return res.status(400).json({ ok: false, error: 'sales_end_before_start' });
      }

      const sortOrder = body.sort_order != null ? Math.round(Number(body.sort_order)) || 0 : 0;

      const { data: created, error: insErr } = await supabase
        .from('event_ticket_types')
        .insert({
          event_id: id,
          name,
          price_cents: priceCents,
          quantity_total: quantityTotal,
          max_per_order: maxPerOrder,
          sales_start_at: salesStartAt,
          sales_end_at: salesEndAt,
          sort_order: sortOrder,
          status: 'active',
        })
        .select('*')
        .single();
      if (insErr) {
        // EVENT-8: event_ticket_types_capacity_trg — un tipo activo cuyo
        // quantity_total suma más que events.capacity se traduce a 409
        // legible, nunca un 500 crudo.
        if (insErr.code === 'P0001' || /event_capacity_exceeded/.test(insErr.message || '')) {
          return res.status(409).json({ ok: false, error: 'event_capacity_exceeded' });
        }
        throw insErr;
      }

      return res.status(201).json({ ok: true, ticket_type: created });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/events/[id]/ticket-types] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
