// src/pages/api/chat/[raffleId].js
// Chat público por rifa. GET es abierto. POST acepta sesión real (Bearer)
// o invitado con solo nombre — los mensajes de invitado siempre se marcan
// como tal para que nadie los confunda con el creador verificado.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_LEN = 500;
const MAX_GUEST_NAME_LEN = 40;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const raffleId = String(req.query.raffleId || '').trim();
  if (!raffleId) return res.status(400).json({ ok: false, error: 'missing_raffle_id' });

  if (req.method === 'GET') {
    try {
      const { data: messages, error } = await supabase
        .from('raffle_messages')
        .select('id, user_id, guest_name, body, created_at')
        .eq('raffle_id', raffleId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;

      const userIds = [...new Set((messages || []).map((m) => m.user_id).filter(Boolean))];
      let authorsById = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('users_profile')
          .select('user_id, nombre, avatar_url')
          .in('user_id', userIds);
        authorsById = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
      }

      const out = (messages || []).map((m) => ({
        id: m.id,
        user_id: m.user_id,
        body: m.body,
        created_at: m.created_at,
        is_guest: !m.user_id,
        nombre: m.user_id ? (authorsById[m.user_id]?.nombre || 'Usuario') : (m.guest_name || 'Invitado'),
        avatar_url: m.user_id ? (authorsById[m.user_id]?.avatar_url || null) : null,
      }));

      return res.status(200).json({ ok: true, messages: out });
    } catch (e) {
      console.error('[api/chat/:raffleId] GET error', e);
      return res.status(500).json({ ok: false, error: e?.message || 'error' });
    }
  }

  if (req.method === 'POST') {
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ ok: false, error: 'empty_message' });
    if (body.length > MAX_LEN) return res.status(400).json({ ok: false, error: 'message_too_long' });

    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;

    let userId = null;
    let authorNombre = null;
    let authorAvatar = null;
    let guestName = null;

    if (token) {
      const { data: ures, error: uerr } = await supabase.auth.getUser(token);
      if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
      userId = ures.user.id;

      const { data: profile } = await supabase
        .from('users_profile')
        .select('nombre, avatar_url')
        .eq('user_id', userId)
        .maybeSingle();
      authorNombre = profile?.nombre || 'Usuario';
      authorAvatar = profile?.avatar_url || null;
    } else {
      guestName = String(req.body?.guest_name || '').trim().slice(0, MAX_GUEST_NAME_LEN);
      if (!guestName) return res.status(400).json({ ok: false, error: 'missing_guest_name' });
      authorNombre = guestName;
    }

    try {
      const { data: raffle } = await supabase
        .from('raffles')
        .select('id')
        .eq('id', raffleId)
        .maybeSingle();
      if (!raffle) return res.status(404).json({ ok: false, error: 'raffle_not_found' });

      const { data: inserted, error: ierr } = await supabase
        .from('raffle_messages')
        .insert({ raffle_id: raffleId, user_id: userId, guest_name: guestName, body })
        .select('id, user_id, body, created_at')
        .single();
      if (ierr) throw ierr;

      return res.status(201).json({
        ok: true,
        message: {
          ...inserted,
          is_guest: !userId,
          nombre: authorNombre,
          avatar_url: authorAvatar,
        },
      });
    } catch (e) {
      console.error('[api/chat/:raffleId] POST error', e);
      return res.status(500).json({ ok: false, error: e?.message || 'error' });
    }
  }

  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
