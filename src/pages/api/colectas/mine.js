// src/pages/api/colectas/mine.js
// Panel del creador: SOLO sus propias colectas, identidad siempre desde la
// sesión (nunca un user_id mandado por el cliente). Recaudado se calcula
// en vivo sumando colecta_contributions con status='approved' — nunca se
// guarda ni se confía en un contador editable.
import { createClient } from '@supabase/supabase-js';
import { deriveEffectiveStatus } from '@/lib/colectaStatus';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
  const uid = ures.user.id;

  try {
    const { data: colectas, error: cErr } = await supabase
      .from('colectas')
      .select('id, title, status, start_at, end_at, created_at')
      .eq('creator_id', uid)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });
    if (cErr) throw cErr;

    const ids = (colectas || []).map((c) => c.id);
    let raisedByColecta = {};
    if (ids.length) {
      const { data: approved, error: aErr } = await supabase
        .from('colecta_contributions')
        .select('colecta_id, amount_cents')
        .in('colecta_id', ids)
        .eq('status', 'approved');
      if (aErr) throw aErr;
      for (const row of approved || []) {
        raisedByColecta[row.colecta_id] = (raisedByColecta[row.colecta_id] || 0) + (row.amount_cents || 0);
      }
    }

    const items = (colectas || []).map((c) => ({
      id: c.id,
      title: c.title,
      status: deriveEffectiveStatus(c),
      start_at: c.start_at,
      end_at: c.end_at,
      created_at: c.created_at,
      raised_cents: raisedByColecta[c.id] || 0,
    }));

    const { data: gw } = await supabase
      .from('merchant_gateways')
      .select('status')
      .eq('user_id', uid)
      .eq('provider', 'mp')
      .maybeSingle();
    const mpConnected = gw?.status === 'connected';

    return res.status(200).json({ ok: true, items, mp_connected: mpConnected });
  } catch (e) {
    console.error('[api/colectas/mine] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
