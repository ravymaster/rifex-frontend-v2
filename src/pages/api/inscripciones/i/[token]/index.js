// src/pages/api/inscripciones/i/[token]/index.js
// INSCRIPCIONES V1 — resolución pública del QR de UN participante. Mismo
// criterio exacto que /api/events/tickets/[token]/index.js: GET puro,
// NUNCA consume/modifica el registro (el escaneo no es check-in, eso es
// check-in.js). Token inexistente -> 404 neutro, sin distinguir "nunca
// existió" de cualquier otro motivo. Nunca expone email/teléfono del
// participante aquí — solo lo mínimo para que quien tenga el enlace
// confirme que es una inscripción real.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { token } = req.query || {};
  if (!token || typeof token !== 'string' || token.length < 16) {
    return res.status(400).json({ ok: false, error: 'invalid_token' });
  }

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `inscripciones-i-resolve:${ip}`, maxHits: 30, windowSeconds: 60 })) return;

  try {
    const { data: participant, error } = await supabase
      .from('registration_participants')
      .select('full_name, activity_id, checked_in_at')
      .eq('qr_token', token)
      .maybeSingle();
    if (error) throw error;
    if (!participant) return res.status(404).json({ ok: false, error: 'not_found' });

    const { data: activity } = await supabase
      .from('registration_activities')
      .select('title, starts_at, ends_at, timezone, venue_name, address, modality, organizer_name_snapshot')
      .eq('id', participant.activity_id)
      .maybeSingle();

    return res.status(200).json({
      ok: true,
      participant: { full_name: participant.full_name, checked_in: !!participant.checked_in_at },
      activity: activity
        ? {
            title: activity.title,
            starts_at: activity.starts_at,
            ends_at: activity.ends_at,
            timezone: activity.timezone,
            venue_name: activity.venue_name,
            address: activity.address,
            modality: activity.modality,
            organizer_name: activity.organizer_name_snapshot,
          }
        : null,
    });
  } catch (e) {
    console.error('[api/inscripciones/i/[token]] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
