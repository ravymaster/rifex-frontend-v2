// src/pages/api/rifas/[id]/draw.js
// DRAW-1: sorteo manual explícito, separado de "cerrar ventas" (ver
// PATCH /api/rifas/[id]). Este es el único camino manual para elegir
// ganador — explícito (endpoint propio), confirmado (el panel pide
// confirmación aparte antes de llamarlo), y auditado (trigger_source +
// triggered_by quedan en raffle_results, ver drawWinner.js/DRAW-1 migration).
import { createClient } from '@supabase/supabase-js';
import { drawWinner, notifyWinnerDrawn } from '@/lib/drawWinner';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

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
    const email = (ures.user.email || '').toLowerCase();

    const { data: raffle, error: rErr } = await supabase
      .from('raffles')
      .select('id,creator_id,creator_email,status')
      .eq('id', id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!raffle) return res.status(404).json({ ok: false, error: 'not_found' });
    const isOwner = raffle.creator_id === uid || (raffle.creator_email || '').toLowerCase() === email;
    if (!isOwner) return res.status(403).json({ ok: false, error: 'not_your_raffle' });

    if (raffle.status !== 'closed') {
      return res.status(409).json({ ok: false, error: 'sales_not_closed_yet' });
    }

    const { data: existing, error: eErr } = await supabase
      .from('raffle_results')
      .select('raffle_id')
      .eq('raffle_id', id)
      .maybeSingle();
    if (eErr) throw eErr;
    if (existing) return res.status(409).json({ ok: false, error: 'winner_already_exists' });

    const draw = await drawWinner(id, { force: true, triggerSource: 'manual_draw', triggeredBy: uid });
    if (!draw.ready) {
      return res.status(409).json({ ok: false, error: 'no_sold_tickets' });
    }
    if (draw.isNew) {
      await notifyWinnerDrawn(id, draw.winner);
    }

    return res.status(200).json({ ok: true, winner: draw.winner, isNew: draw.isNew });
  } catch (e) {
    console.error('[api/rifas/[id]/draw] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
