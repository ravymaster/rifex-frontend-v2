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
    // PRE-LAUNCH-FIX-1 (P0-1): este endpoint no exigía ninguna
    // autenticación ni ownership — cualquiera, sin sesión, podía borrar
    // (soft o hard, según `force`) CUALQUIER rifa solo conociendo su
    // UUID. La identidad se deriva SIEMPRE de auth.getUser(token) contra
    // el service role, igual que el resto de endpoints owner-only del
    // proyecto (extend.js, draw.js, PATCH [id].js) — nunca de un
    // creator_id/user_id que mandara el cliente.
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
    const uid = ures.user.id;
    const email = (ures.user.email || '').toLowerCase();

    const { id, force } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

    const { data: raffle, error: rErr } = await supabase
      .from('raffles')
      .select('id,creator_id,creator_email')
      .eq('id', id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!raffle) return res.status(404).json({ ok: false, error: 'not_found' });

    // Mismo criterio de ownership que draw.js/extend.js: creator_id O
    // creator_email (rifas antiguas sin creator_id poblado siguen
    // protegidas). `force:true` NUNCA sustituye esta verificación — solo
    // decide hard vs soft delete una vez que el ownership ya se confirmó.
    const isOwner = raffle.creator_id === uid || (raffle.creator_email || '').toLowerCase() === email;
    if (!isOwner) return res.status(403).json({ ok: false, error: 'not_your_raffle' });

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

