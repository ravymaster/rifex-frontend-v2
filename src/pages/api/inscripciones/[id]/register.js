// src/pages/api/inscripciones/[id]/register.js
// INSCRIPCIONES V1 — inscripción pública de un participante. Público
// (sin sesión, sección 4/14/15 del mandato), rate-limited por IP. Toda
// la autoridad real de duplicados/aforo vive en la RPC
// register_for_activity (lock de fila + UNIQUE), este endpoint solo
// traduce su resultado a HTTP y dispara el único email obligatorio
// (sección 19: exactamente uno, sin adjuntar el QR como imagen).
//
// activity_not_found Y activity_not_active se mapean al MISMO 404
// genérico — mismo criterio anti-enumeration que
// GET /api/inscripciones/[id] para actividades no activas: un
// participante público nunca puede distinguir "no existe" de "existe
// pero está en draft/closed/archived".
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { sendRegistrationConfirmationEmail } from '@/lib/registrationMailer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_NAME = 140;
const MAX_EMAIL = 200;
const MAX_PHONE = 40;

const MODALITY_LABEL = { presencial: 'Presencial', online: 'Online', hibrida: 'Híbrida' };

function formatDateText(iso, timeZone) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timeZone || 'America/Santiago' });
  } catch { return ''; }
}
function formatTimeText(iso, timeZone) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: timeZone || 'America/Santiago' });
  } catch { return ''; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `inscripciones-register:${ip}:${id}`, maxHits: 8, windowSeconds: 60 })) return;

  const body = req.body || {};
  const fullName = String(body.full_name || '').trim();
  const email = String(body.email || '').trim();
  const phone = body.phone ? String(body.phone).trim() : null;

  if (!fullName || fullName.length > MAX_NAME) return res.status(400).json({ ok: false, error: 'invalid_name' });
  if (!email || email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  if (phone && phone.length > MAX_PHONE) return res.status(400).json({ ok: false, error: 'invalid_phone' });

  try {
    const { data: result, error: rpcErr } = await supabase.rpc('register_for_activity', {
      p_activity_id: id,
      p_full_name: fullName,
      p_email: email,
      p_phone: phone,
    });
    if (rpcErr) throw rpcErr;

    if (!result?.ok) {
      const errorCode = result?.error;
      if (errorCode === 'activity_not_found' || errorCode === 'activity_not_active') {
        return res.status(404).json({ ok: false, error: 'not_found' });
      }
      if (errorCode === 'capacity_full') return res.status(409).json({ ok: false, error: 'capacity_full', message: 'Cupos agotados.' });
      if (errorCode === 'already_registered') return res.status(409).json({ ok: false, error: 'already_registered', message: 'Ya estás inscrito en esta actividad.' });
      return res.status(400).json({ ok: false, error: errorCode || 'invalid_request' });
    }

    const { data: activity } = await supabase
      .from('registration_activities')
      .select('title, starts_at, timezone, venue_name, address, modality, organizer_name_snapshot, instructions')
      .eq('id', id)
      .maybeSingle();

    const base = (process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`).replace(/\/+$/, '');
    const qrLink = `${base}/i/${result.qr_token}`;

    if (activity) {
      const placeText = activity.modality === 'online'
        ? (MODALITY_LABEL[activity.modality] || activity.modality)
        : [activity.venue_name, activity.address].filter(Boolean).join(' — ') || MODALITY_LABEL[activity.modality];

      try {
        await sendRegistrationConfirmationEmail({
          to: email,
          participantName: fullName,
          activityTitle: activity.title,
          dateText: formatDateText(activity.starts_at, activity.timezone),
          timeText: formatTimeText(activity.starts_at, activity.timezone),
          placeText,
          organizerName: activity.organizer_name_snapshot,
          instructions: activity.instructions,
          qrLink,
        });
      } catch (mailErr) {
        // Best-effort: un fallo de envío nunca debe deshacer una
        // inscripción ya confirmada y con cupo real asignado — el
        // participante conserva su lugar aunque el correo falle.
        console.error('[api/inscripciones/[id]/register] email error', mailErr);
      }
    }

    return res.status(201).json({ ok: true, participant_id: result.participant_id, qr_link: qrLink });
  } catch (e) {
    console.error('[api/inscripciones/[id]/register] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
