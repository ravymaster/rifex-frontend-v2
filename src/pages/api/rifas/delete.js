import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/rifas/delete
 * body: { id: string, force?: boolean }  // force=true => intentar hard delete si se permite
 * Reglas:
 *  - Si status='closed' o hay tickets sold/pending -> SOFT (archiva)
 *  - Si no hay actividad y force=true -> HARD (borra tickets, purchases y rifa)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  try {
    const { id, force } = req.body || {};
    if (!id) return res.status(400).json({ error: 'missing_id' });

    // 1) Traer rifa
    const { data: raffle, error: rErr } = await supabase
      .from('raffles')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!raffle) return res.status(404).json({ error: 'not_found' });

    // 2) Ver actividad de tickets
    const { data: tStates, error: tErr } = await supabase
      .from('tickets')
      .select('status')
      .eq('raffle_id', id);
    if (tErr) throw tErr;

    const hasPending = (tStates || []).some(t => t.status === 'pending');
    const hasSold    = (tStates || []).some(t => t.status === 'sold');
    const mustArchive = raffle.status === 'closed' || hasPending || hasSold;

    // 3) Soft delete (archivar) si corresponde o si no pidieron force
    if (mustArchive || !force) {
      const { data, error } = await supabase
        .from('raffles')
        .update({ status: 'deleted', end_date: new Date().toISOString().slice(0, 10) })
        .eq('id', id)
        .select('id,status')
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, mode: 'soft', data });
    }

    // 4) Hard delete permitido (sin vendidos ni pending y force=true)
    // Borrar dependencias primero para no chocar con FKs
    await supabase.from('tickets').delete().eq('raffle_id', id);
    await supabase.from('purchases').delete().eq('raffle_id', id);
    const { error: dErr } = await supabase.from('raffles').delete().eq('id', id);
    if (dErr) throw dErr;

    return res.status(200).json({ ok: true, mode: 'hard' });
  } catch (e) {
    console.error('POST /api/rifas/delete error', e);
    const msg = e?.message || e?.error?.message || 'server_error';
    return res.status(500).json({ error: msg });
  }
}
