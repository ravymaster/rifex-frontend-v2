// src/pages/api/perfil/[id].js
// Perfil público de un creador. Sin auth (cualquiera puede verlo), pero
// nunca expone campos sensibles (rut, email, datos de pago) — solo lo
// que un visitante anónimo debería poder ver.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const uid = String(req.query.id || '').trim();
  if (!uid) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const { data: profile } = await supabase
      .from('users_profile')
      .select('nombre, bio, avatar_url, created_at')
      .eq('user_id', uid)
      .maybeSingle();

    const { data: raffles, error: rErr } = await supabase
      .from('raffles')
      .select('id, title, price_cents, total_numbers, prize_amount_cents, status, end_date, created_at')
      .eq('creator_id', uid)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });
    if (rErr) throw rErr;

    const raffleList = raffles || [];
    const raffleIds = raffleList.map((r) => r.id);
    const active = raffleList.filter((r) => r.status === 'active');
    const completed = raffleList.filter((r) => r.status === 'closed');

    let numbersSold = 0;
    if (raffleIds.length) {
      const { data: payments, error: pErr } = await supabase
        .from('payments')
        .select('numbers')
        .in('raffle_id', raffleIds)
        .eq('status', 'approved');
      if (pErr) throw pErr;
      numbersSold = (payments || []).reduce((sum, p) => sum + (Array.isArray(p.numbers) ? p.numbers.length : 0), 0);
    }

    // Ventas por rifa, para la barra de progreso de cada tarjeta
    let soldByRaffle = {};
    if (raffleIds.length) {
      const { data: tix } = await supabase
        .from('tickets')
        .select('raffle_id')
        .in('raffle_id', raffleIds)
        .eq('status', 'sold');
      for (const t of tix || []) {
        soldByRaffle[t.raffle_id] = (soldByRaffle[t.raffle_id] || 0) + 1;
      }
    }

    const shapeRaffle = (r) => ({
      id: r.id,
      title: r.title,
      price_cents: r.price_cents,
      total_numbers: r.total_numbers,
      prize_amount_cents: r.prize_amount_cents,
      end_date: r.end_date,
      sold: soldByRaffle[r.id] || 0,
    });

    return res.status(200).json({
      ok: true,
      profile: {
        nombre: profile?.nombre || null,
        bio: profile?.bio || null,
        avatar_url: profile?.avatar_url || null,
        member_since: profile?.created_at || null,
      },
      stats: {
        raffles_created: raffleList.length,
        raffles_completed: completed.length,
        numbers_sold: numbersSold,
      },
      active: active.map(shapeRaffle),
      completed: completed.map(shapeRaffle),
    });
  } catch (e) {
    console.error('[api/perfil/:id] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
