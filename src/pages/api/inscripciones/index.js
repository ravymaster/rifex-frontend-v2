// src/pages/api/inscripciones/index.js
// INSCRIPCIONES V1 — POST únicamente: crear una actividad FREE. Nunca
// GET público de listado (a diferencia de /api/events): la landing
// /inscripciones es copy comercial estático, no un directorio de
// actividades — nunca convertir esto en un catálogo indexable de
// actividades de usuarios (mismo espíritu que la razón por la que la
// página individual es PUBLIC_NOINDEX, sección 5 del mandato).
//
// Identidad SIEMPRE derivada de auth.getUser(token) — nunca de un
// organizer_id que mande el cliente. Onboarding: usa
// assertOnboardingComplete (TRUST-1, onboarding general), NUNCA
// assertCreatorEligible (que exige RUT/MP) y NUNCA countryGate — sección
// 4 del mandato: Inscripciones vive FUERA del onboarding financiero
// progresivo, un usuario sin Mercado Pago conectado debe poder crear.
//
// plan/capacity NUNCA se leen del body — ni siquiera para ignorarlos con
// una validación; simplemente no existen como parámetros en la RPC
// create_free_registration_activity, que hardcodea 'free'/50. Esto hace
// que un forgery de plan=gold/capacity=2000 sea estructuralmente
// imposible en este endpoint, no solo rechazado por validación.
import { createClient } from '@supabase/supabase-js';
import { assertOnboardingComplete, getOnboardingRecord } from '@/lib/trustOnboardingGate';
import { enforceRateLimit } from '@/lib/rateLimit';
import { currentFreePeriodKey, nextFreePeriodStartsAt } from '@/lib/registrationFreeQuota';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MODALITIES = ['presencial', 'online', 'hibrida'];
const MAX_TITLE = 140;
const MAX_DESCRIPTION = 5000;
const MAX_SHORT_TEXT = 200;
const MAX_INSTRUCTIONS = 3000;

async function getRequester(req) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return null;
  const { data: ures, error } = await supabase.auth.getUser(token);
  if (error || !ures?.user) return null;
  return ures.user;
}

function deriveOrganizerNameSnapshot(record) {
  if (!record) return null;
  if (record.account_type === 'organization' && record.organization_name) return record.organization_name;
  if (record.person_name) return record.person_name;
  return record.organization_name || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    if (await enforceRateLimit(req, res, { key: `inscripciones-create:${user.id}`, maxHits: 10, windowSeconds: 60 })) return;

    // Sección 4: SOLO onboarding general — nunca assertCreatorEligible,
    // nunca Country Gate. Un usuario sin Mercado Pago conectado debe
    // poder llegar hasta acá.
    const onboarding = await assertOnboardingComplete(user.id);
    if (!onboarding.ok) return res.status(403).json({ ok: false, error: onboarding.reason, message: onboarding.message });

    const body = req.body || {};

    const title = String(body.title || '').trim();
    if (!title || title.length > MAX_TITLE) return res.status(400).json({ ok: false, error: 'invalid_title' });

    const description = body.description != null ? String(body.description).trim() : null;
    if (description && description.length > MAX_DESCRIPTION) return res.status(400).json({ ok: false, error: 'invalid_description' });

    const coverImageUrl = body.cover_image_url ? String(body.cover_image_url) : null;

    const startsAt = body.starts_at ? new Date(body.starts_at) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      return res.status(400).json({ ok: false, error: 'invalid_starts_at' });
    }
    const endsAt = body.ends_at ? new Date(body.ends_at) : null;
    if (body.ends_at && Number.isNaN(endsAt?.getTime())) {
      return res.status(400).json({ ok: false, error: 'invalid_ends_at' });
    }
    if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
      return res.status(400).json({ ok: false, error: 'ends_before_starts' });
    }

    const timezone = body.timezone ? String(body.timezone) : 'America/Santiago';

    const modality = body.modality ? String(body.modality) : 'presencial';
    if (!MODALITIES.includes(modality)) return res.status(400).json({ ok: false, error: 'invalid_modality' });

    const venueName = body.venue_name ? String(body.venue_name).trim() : null;
    if (venueName && venueName.length > MAX_SHORT_TEXT) return res.status(400).json({ ok: false, error: 'invalid_venue_name' });
    const address = body.address ? String(body.address).trim() : null;
    if (address && address.length > MAX_SHORT_TEXT) return res.status(400).json({ ok: false, error: 'invalid_address' });

    const instructions = body.instructions ? String(body.instructions).trim() : null;
    if (instructions && instructions.length > MAX_INSTRUCTIONS) return res.status(400).json({ ok: false, error: 'invalid_instructions' });

    const onboardingRecord = await getOnboardingRecord(user.id);
    const organizerNameSnapshot = deriveOrganizerNameSnapshot(onboardingRecord);

    const periodKey = currentFreePeriodKey(new Date());

    const { data: activity, error: rpcErr } = await supabase.rpc('create_free_registration_activity', {
      p_organizer_id: user.id,
      p_period_key: periodKey,
      p_title: title,
      p_description: description,
      p_cover_image_url: coverImageUrl,
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt ? endsAt.toISOString() : null,
      p_timezone: timezone,
      p_venue_name: venueName,
      p_address: address,
      p_modality: modality,
      p_instructions: instructions,
      p_organizer_name_snapshot: organizerNameSnapshot,
    });

    if (rpcErr) {
      if (rpcErr.code === 'P0001' || /free_quota_already_used/.test(rpcErr.message || '')) {
        return res.status(409).json({
          ok: false,
          error: 'free_quota_already_used',
          message: 'Ya utilizaste tu inscripción gratuita de este mes.',
          next_available_at: nextFreePeriodStartsAt(new Date()).toISOString(),
        });
      }
      throw rpcErr;
    }

    return res.status(201).json({ ok: true, id: activity.id, activity });
  } catch (e) {
    console.error('[api/inscripciones] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
