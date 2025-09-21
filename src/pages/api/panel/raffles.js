// src/pages/api/panel/raffles.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'missing_auth' });

    // Validar el token para obtener el usuario real
    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ error: 'invalid_auth' });

    const user = ures.user;
    const uid = user.id;
    const email = (user.email || '').toLowerCase();

    const { status, q } = req.query || {};

    // Base query: rifas del usuario
    let query = supabase
      .from('raffles')
      .select('id,title,price_cents,total_numbers,prize_type,prize_amount_cents,status,end_date,created_at')
      .or(`creator_id.eq.${uid},creator_email.eq.${email}`)
      .order('created_at', { ascending: false });

    // Filtro de estado
    if (status && status !== 'all') {
      query = query.eq('status', status);
    } else {
      query = query.neq('status', 'deleted');
    }

    // Búsqueda por título o ID
    if (q && q.trim()) {
      const s = q.trim();
      query = query.or(`title.ilike.%${s}%,id.eq.${s}`);
    }

    const { data: raffles, error } = await query;
    if (error) throw error;

    // Conteo de vendidos
    const ids = (raffles || []).map(r => r.id);
    const soldById = {};
    if (ids.length) {
      const { data: soldRows, error: sErr } = await supabase
        .from('tickets')
        .select('raffle_id')
        .eq('status', 'sold')
        .in('raffle_id', ids);
      if (sErr) throw sErr;
      for (const r of soldRows) {
        soldById[r.raffle_id] = (soldById[r.raffle_id] || 0) + 1;
      }
    }

    const items = (raffles || []).map(r => ({ ...r, sold: soldById[r.id] || 0 }));
    return res.status(200).json({ items });
  } catch (e) {
    console.error('panel/raffles error', e);
    return res.status(500).json({ error: e?.message || 'server_error' });
  }
}



