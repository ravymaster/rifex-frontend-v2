// src/pages/api/rifas/[id]/extend.js
// DRAW-1B: extensión de fecha/hora de sorteo, atómica vía RPC
// (extend_raffle_draw) — ownership, límite, ganador previo, fecha futura y
// anticipación mínima se validan TODOS dentro de la transacción con row
// lock (FOR UPDATE), así dos extensiones concurrentes nunca pueden pisarse
// ni duplicar extensions_used. Reusa la MISMA timezone ya guardada en la
// rifa (no re-deriva del país actual del creador).
import { createClient } from '@supabase/supabase-js';
import { zonedTimeToUtcISOString, computeSalesEndAt } from '@/lib/raffleTime';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Excepciones de la RPC -> status HTTP. Mensaje de la RPC llega tal cual en error.message.
const ERROR_STATUS = {
  raffle_not_found: 404,
  not_your_raffle: 403,
  no_draw_at_configured: 400,
  extensions_not_allowed: 400,
  extension_limit_reached: 409,
  draw_at_already_passed: 409,
  winner_already_exists: 409,
  new_draw_at_must_be_future: 400,
  new_draw_at_must_be_later: 400,
  new_draw_at_too_soon: 400,
};

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
    const uid = ures.user.id;

    // Solo para poder convertir fecha/hora "de pared" a UTC con la MISMA
    // zona de la rifa — no es una decisión de autoridad, esa vive en la RPC.
    const { data: raffle, error: rErr } = await supabase
      .from('raffles')
      .select('timezone')
      .eq('id', id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!raffle) return res.status(404).json({ ok: false, error: 'not_found' });
    if (!raffle.timezone) return res.status(400).json({ ok: false, error: 'no_draw_at_configured' });

    const { new_draw_date, new_draw_time, reason } = req.body || {};
    if (!new_draw_date || !new_draw_time) {
      return res.status(400).json({ ok: false, error: 'missing_new_draw_datetime' });
    }

    const newDrawAtIso = zonedTimeToUtcISOString(new_draw_date, new_draw_time, raffle.timezone);
    if (!newDrawAtIso) return res.status(400).json({ ok: false, error: 'invalid_draw_datetime' });
    const newSalesEndAtIso = computeSalesEndAt(newDrawAtIso);

    const { data: updated, error: rpcErr } = await supabase.rpc('extend_raffle_draw', {
      p_raffle_id: id,
      p_user_id: uid,
      p_new_draw_at: newDrawAtIso,
      p_new_sales_end_at: newSalesEndAtIso,
      p_reason: reason || null,
    });

    if (rpcErr) {
      const status = ERROR_STATUS[rpcErr.message] || 500;
      return res.status(status).json({ ok: false, error: rpcErr.message });
    }

    return res.status(200).json({ ok: true, data: updated });
  } catch (e) {
    console.error('[api/rifas/[id]/extend] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
