// src/pages/api/rifas/delete.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const { id, force } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

    // ¿Tiene ventas?
    let sold = 0;
    {
      const { data, error } = await supabase
        .from('tickets')
        .select('status', { count: 'exact', head: true })
        .eq('raffle_id', id)
        .eq('status', 'sold');
      if (error) throw error;
      sold = data || 0;
    }

    // Si hay vendidos, forzamos soft delete
    const canHard = !!force && sold === 0;

    if (canHard) {
      // Borrado definitivo seguro (primero tickets)
      const delT = await supabase.from('tickets').delete().eq('raffle_id', id);
      if (delT.error) throw delT.error;

      const delR = await supabase.from('raffles').delete().eq('id', id);
      if (delR.error) throw delR.error;

      return res.status(200).json({ ok: true, mode: 'hard' });
    }

    // Soft delete → marcamos status=deleted
    const { error } = await supabase
      .from('raffles')
      .update({ status: 'deleted' })
      .eq('id', id);
    if (error) throw error;

    return res.status(200).json({ ok: true, mode: 'soft' });
  } catch (e) {
    console.error('[api/rifas/delete]', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

