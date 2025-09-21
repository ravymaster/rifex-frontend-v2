// src/pages/api/rifas/[id]/index.js
import { createClient } from '@supabase/supabase-js';

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
      const body = req.body || {};
      const updates = {};

      for (const k of Object.keys(body)) {
        if (ALLOWED_FIELDS.has(k)) updates[k] = body[k];
      }

      if ('prize_amount_cents' in updates) {
        updates.prize_amount_cents = Math.max(0, Math.round(Number(updates.prize_amount_cents || 0)));
      }
      if ('status' in updates && updates.status === 'closed' && !updates.end_date) {
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
      return res.status(200).json({ ok: true, data });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/rifas/[id]] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}


