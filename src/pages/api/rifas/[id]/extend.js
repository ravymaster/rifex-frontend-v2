// src/pages/api/rifas/[id]/extend.js
// DRAW-1: extensión de fecha/hora de sorteo, dentro del límite declarado en
// creación (extension_limit, inmutable desde entonces). Reusa la MISMA
// timezone ya guardada en la rifa (no re-deriva del país actual del
// creador) para que una extensión nunca cambie silenciosamente la zona
// horaria de una rifa ya publicada. Cada extensión queda auditada en
// raffle_date_extensions — nunca sobreescribe el historial.
import { createClient } from '@supabase/supabase-js';
import { zonedTimeToUtcISOString, computeSalesEndAt } from '@/lib/raffleTime';

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
      .select('id,creator_id,creator_email,draw_at,sales_end_at,timezone,extension_limit,extensions_used')
      .eq('id', id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!raffle) return res.status(404).json({ ok: false, error: 'not_found' });
    const isOwner = raffle.creator_id === uid || (raffle.creator_email || '').toLowerCase() === email;
    if (!isOwner) return res.status(403).json({ ok: false, error: 'not_your_raffle' });

    if (!raffle.draw_at || !raffle.timezone) {
      return res.status(400).json({ ok: false, error: 'no_draw_at_configured' });
    }
    if ((raffle.extension_limit || 0) <= 0) {
      return res.status(400).json({ ok: false, error: 'extensions_not_allowed' });
    }
    if ((raffle.extensions_used || 0) >= raffle.extension_limit) {
      return res.status(409).json({ ok: false, error: 'extension_limit_reached' });
    }
    if (new Date(raffle.draw_at).getTime() <= Date.now()) {
      return res.status(409).json({ ok: false, error: 'draw_at_already_passed' });
    }

    const { data: existingWinner, error: wErr } = await supabase
      .from('raffle_results')
      .select('raffle_id')
      .eq('raffle_id', id)
      .maybeSingle();
    if (wErr) throw wErr;
    if (existingWinner) return res.status(409).json({ ok: false, error: 'winner_already_exists' });

    const { new_draw_date, new_draw_time, reason } = req.body || {};
    if (!new_draw_date || !new_draw_time) {
      return res.status(400).json({ ok: false, error: 'missing_new_draw_datetime' });
    }

    const newDrawAtIso = zonedTimeToUtcISOString(new_draw_date, new_draw_time, raffle.timezone);
    if (!newDrawAtIso) return res.status(400).json({ ok: false, error: 'invalid_draw_datetime' });
    if (new Date(newDrawAtIso).getTime() <= Date.now()) {
      return res.status(400).json({ ok: false, error: 'new_draw_at_must_be_future' });
    }
    if (new Date(newDrawAtIso).getTime() <= new Date(raffle.draw_at).getTime()) {
      return res.status(400).json({ ok: false, error: 'new_draw_at_must_be_later' });
    }

    const newSalesEndAtIso = computeSalesEndAt(newDrawAtIso);

    const { data: updated, error: updErr } = await supabase
      .from('raffles')
      .update({
        draw_at: newDrawAtIso,
        sales_end_at: newSalesEndAtIso,
        extensions_used: (raffle.extensions_used || 0) + 1,
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (updErr) throw updErr;

    const { error: histErr } = await supabase.from('raffle_date_extensions').insert({
      raffle_id: id,
      previous_draw_at: raffle.draw_at,
      new_draw_at: newDrawAtIso,
      previous_sales_end_at: raffle.sales_end_at,
      new_sales_end_at: newSalesEndAtIso,
      changed_by: uid,
      reason: reason || null,
    });
    if (histErr) throw histErr;

    return res.status(200).json({ ok: true, data: updated });
  } catch (e) {
    console.error('[api/rifas/[id]/extend] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
