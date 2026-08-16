// src/pages/api/rifas/[id]/index.js
import { createClient } from '@supabase/supabase-js';
import { drawWinner, notifyWinnerDrawn } from '../../../../lib/drawWinner';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Campos editables desde el panel (seguros)
const ALLOWED_FIELDS = new Set(['prize_type', 'prize_amount_cents', 'end_date', 'status']);

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
        .select('id,creator_id,creator_email,status')
        .eq('id', id)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!raffle) return res.status(404).json({ ok: false, error: 'not_found' });
      const isOwner = raffle.creator_id === uid || (raffle.creator_email || '').toLowerCase() === email;
      if (!isOwner) return res.status(403).json({ ok: false, error: 'not_your_raffle' });

      const body = req.body || {};
      const updates = {};

      for (const k of Object.keys(body)) {
        if (ALLOWED_FIELDS.has(k)) updates[k] = body[k];
      }

      if ('prize_amount_cents' in updates) {
        updates.prize_amount_cents = Math.max(0, Math.round(Number(updates.prize_amount_cents || 0)));
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

      // Cerrar la rifa a mano también sortea (entre los números ya vendidos,
      // aunque no se haya agotado) — cerrar ES lanzar el sorteo.
      if (closingNow) {
        try {
          const draw = await drawWinner(id, { force: true });
          if (draw.isNew) await notifyWinnerDrawn(id, draw.winner);
        } catch (e) {
          console.error('[api/rifas/[id]] draw winner error', e?.message || e);
        }
      }

      return res.status(200).json({ ok: true, data });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/rifas/[id]] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
