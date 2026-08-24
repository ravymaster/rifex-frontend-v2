// src/pages/api/events/[id]/orders-summary.js
// EVENT-2 (Fase 20) — información transaccional MÍNIMA para el panel del
// organizador: órdenes, entradas reservadas/vendidas, recaudación
// confirmada (bruto/comisión/neto). NO es EVENT-5 analytics — sin
// gráficos, sin export, sin desglose por fecha. Owner-only, vía Bearer
// token verificado contra events.organizer_id (nunca RLS pública).
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { id: eventId } = req.query || {};
  if (!eventId) return res.status(400).json({ ok: false, error: 'missing_event_id' });

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });
    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

    const { data: event, error: evErr } = await supabase
      .from('events')
      .select('id, organizer_id')
      .eq('id', eventId)
      .maybeSingle();
    if (evErr) throw evErr;
    if (!event) return res.status(404).json({ ok: false, error: 'not_found' });
    if (event.organizer_id !== ures.user.id) return res.status(403).json({ ok: false, error: 'not_your_event' });

    const { data: orders, error: ordErr } = await supabase
      .from('event_orders')
      .select('status, subtotal_cents, platform_fee_cents, total_cents')
      .eq('event_id', eventId);
    if (ordErr) throw ordErr;

    const { data: ticketTypes, error: ttErr } = await supabase
      .from('event_ticket_types')
      .select('id, name, quantity_total, quantity_sold, quantity_reserved')
      .eq('event_id', eventId);
    if (ttErr) throw ttErr;

    // EVENT-3 (Fase 19): entradas emitidas por tipo — separado de
    // quantity_sold (pago) a propósito, para que una discrepancia
    // (vendidas pero aún no emitidas) sea visible, nunca oculta.
    const { data: issuedTickets, error: tkErr } = await supabase
      .from('event_tickets')
      .select('ticket_type_id, status')
      .eq('event_id', eventId);
    if (tkErr) throw tkErr;
    const issuedByType = new Map();
    for (const t of issuedTickets || []) {
      if (t.status === 'void') continue;
      issuedByType.set(t.ticket_type_id, (issuedByType.get(t.ticket_type_id) || 0) + 1);
    }

    const counts = { pending: 0, paid: 0, expired: 0, cancelled: 0, approved_unfulfilled: 0 };
    let grossCents = 0;
    let feeCents = 0;
    for (const o of orders || []) {
      counts[o.status] = (counts[o.status] || 0) + 1;
      if (o.status === 'paid') {
        grossCents += Number(o.subtotal_cents) || 0;
        feeCents += Number(o.platform_fee_cents) || 0;
      }
    }

    const ticketsReserved = (ticketTypes || []).reduce((s, t) => s + (t.quantity_reserved || 0), 0);
    const ticketsSold = (ticketTypes || []).reduce((s, t) => s + (t.quantity_sold || 0), 0);
    const ticketsTotal = (ticketTypes || []).reduce((s, t) => s + (t.quantity_total || 0), 0);
    const ticketsIssued = (ticketTypes || []).reduce((s, t) => s + (issuedByType.get(t.id) || 0), 0);

    return res.status(200).json({
      ok: true,
      orders: { total: (orders || []).length, ...counts },
      tickets: { total: ticketsTotal, sold: ticketsSold, reserved: ticketsReserved, issued: ticketsIssued },
      ticket_types: (ticketTypes || []).map((t) => ({
        id: t.id, name: t.name, sold: t.quantity_sold || 0, issued: issuedByType.get(t.id) || 0,
      })),
      revenue: {
        gross_cents: grossCents,
        platform_fee_cents: feeCents,
        net_cents: grossCents - feeCents,
      },
    });
  } catch (e) {
    console.error('[api/events/[id]/orders-summary] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
