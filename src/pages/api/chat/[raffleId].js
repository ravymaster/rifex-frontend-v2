// src/pages/api/chat/[raffleId].js
// Chat público por rifa. Leer y escribir requieren la misma autorización
// de la Rifa (exposición pública y puerta del modo `gated`, ver
// src/lib/raffleShareAccess.js). POST acepta sesión real (Bearer) o
// invitado con solo nombre — los mensajes de invitado siempre se marcan
// como tal para que nadie los confunda con el creador verificado.
//
// Respuesta pública con lista cerrada de campos: id público del mensaje
// (derivado, no reversible), texto, fecha, nombre público o alias, y las
// marcas is_guest / is_organizer / is_mine. Nunca user_id, creator_id,
// UUID, correo, teléfono, avatar ni datos de autenticación.
import { createClient } from '@supabase/supabase-js';
import { requireRaffleApiAccess } from '@/lib/raffleShareAccess';
import { isUuid } from '@/lib/idOrSlug';
import { checkRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { cleanMessageBody, cleanGuestName, toPublicMessage } from '@/lib/publicChat';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const POST_LIMIT = 10;
const POST_WINDOW_SECONDS = 60;

async function viewerFromBearer(req) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return { token: null, user: null };
  const { data, error } = await supabase.auth.getUser(token);
  return { token, user: error ? null : data?.user || null };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const raffleId = String(req.query.raffleId || '').trim();
  if (!raffleId) return res.status(400).json({ ok: false, error: 'missing_raffle_id' });

  const access = await requireRaffleApiAccess(req, res, raffleId);
  if (!access) return;
  if (!isUuid(raffleId)) return res.status(400).json({ ok: false, error: 'invalid_raffle_id' });

  let raffle = access.raffle;
  if (!raffle) {
    const { data } = await supabase.from('raffles').select('id, creator_id, status').eq('id', raffleId).maybeSingle();
    raffle = data && data.status !== 'deleted' ? data : null;
  }
  if (!raffle) return res.status(404).json({ ok: false, error: 'raffle_not_found' });

  if (req.method === 'GET') {
    try {
      const { user: viewer } = await viewerFromBearer(req);
      const { data: messages, error } = await supabase
        .from('raffle_messages')
        .select('id, user_id, guest_name, body, created_at')
        .eq('raffle_id', raffle.id)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;

      const userIds = [...new Set((messages || []).map((m) => m.user_id).filter(Boolean))];
      let namesById = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('users_profile')
          .select('user_id, nombre')
          .in('user_id', userIds);
        namesById = Object.fromEntries((profiles || []).map((p) => [p.user_id, p.nombre]));
      }

      const out = (messages || []).map((m) => toPublicMessage(m, {
        nombre: m.user_id ? (cleanGuestName(namesById[m.user_id] || '') || 'Usuario') : (m.guest_name || 'Invitado'),
        creatorId: raffle.creator_id,
        viewerId: viewer?.id,
      }));

      return res.status(200).json({ ok: true, messages: out });
    } catch (e) {
      console.error('[api/chat/:raffleId] GET error', e?.message || e);
      return res.status(500).json({ ok: false, error: 'read_failed' });
    }
  }

  // POST
  const body = cleanMessageBody(req.body?.body);
  if (!body) return res.status(400).json({ ok: false, error: typeof req.body?.body === 'string' && req.body.body.trim() ? 'message_too_long' : 'empty_message' });

  const { token, user } = await viewerFromBearer(req);
  if (token && !user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

  let guestName = null;
  let authorNombre = null;
  if (user) {
    const { data: profile } = await supabase.from('users_profile').select('nombre').eq('user_id', user.id).maybeSingle();
    authorNombre = cleanGuestName(profile?.nombre || '') || 'Usuario';
  } else {
    if (typeof req.body?.guest_name !== 'string' || !req.body.guest_name.trim()) {
      return res.status(400).json({ ok: false, error: 'missing_guest_name' });
    }
    guestName = cleanGuestName(req.body.guest_name);
    if (!guestName) return res.status(400).json({ ok: false, error: 'invalid_guest_name' });
    authorNombre = guestName;
  }

  const rlKey = user ? `chat:user:${user.id}` : `chat:ip:${resolveClientIp(req)}`;
  const rl = await checkRateLimit(rlKey, POST_LIMIT, POST_WINDOW_SECONDS);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSeconds));
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }

  try {
    const { data: inserted, error: ierr } = await supabase
      .from('raffle_messages')
      .insert({ raffle_id: raffle.id, user_id: user?.id || null, guest_name: guestName, body })
      .select('id, user_id, body, created_at')
      .single();
    if (ierr) throw ierr;

    return res.status(201).json({
      ok: true,
      message: toPublicMessage(inserted, { nombre: authorNombre, creatorId: raffle.creator_id, viewerId: user?.id }),
    });
  } catch (e) {
    console.error('[api/chat/:raffleId] POST error', e?.message || e);
    return res.status(500).json({ ok: false, error: 'write_failed' });
  }
}
