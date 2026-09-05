// src/pages/api/inscripciones/[id]/index.js
// INSCRIPCIONES V1 — GET: público solo si status='active' (misma
// actividad que un participante vería en /inscripcion/[id]); el
// organizador puede ver su propia actividad en cualquier status
// presentando un Bearer token válido (mismo criterio exacto que
// GET /api/events/[id]).
//
// PATCH: owner-only. Nunca acepta organizer_id/plan/capacity/status
// directamente del body — plan/capacity son inmutables desde su
// creación (sección 10/25 del mandato: ningún camino de escritura del
// cliente puede tocarlos); status solo cambia vía publish.js/status.js.
import { createClient } from '@supabase/supabase-js';
import { assertOnboardingComplete } from '@/lib/trustOnboardingGate';

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

async function countRegistered(activityId) {
  const { count, error } = await supabase
    .from('registration_participants')
    .select('id', { count: 'exact', head: true })
    .eq('activity_id', activityId);
  if (error) throw error;
  return count || 0;
}

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const { data: activity, error: fetchErr } = await supabase
      .from('registration_activities')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!activity) return res.status(404).json({ ok: false, error: 'not_found' });

    if (req.method === 'GET') {
      if (activity.status === 'active') {
        const registeredCount = await countRegistered(activity.id);
        return res.status(200).json({
          ok: true,
          activity: { ...activity, registered_count: registeredCount, available_slots: Math.max(0, activity.capacity - registeredCount) },
        });
      }
      // No activa: solo el dueño puede verla (mismo criterio anti-
      // enumeration que Eventos — 404 neutro, nunca 403).
      const user = await getRequester(req);
      if (!user || user.id !== activity.organizer_id) {
        return res.status(404).json({ ok: false, error: 'not_found' });
      }
      const registeredCount = await countRegistered(activity.id);
      return res.status(200).json({
        ok: true,
        activity: { ...activity, registered_count: registeredCount, available_slots: Math.max(0, activity.capacity - registeredCount) },
      });
    }

    if (req.method === 'PATCH') {
      const user = await getRequester(req);
      if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });
      if (user.id !== activity.organizer_id) return res.status(403).json({ ok: false, error: 'not_your_activity' });

      const onboarding = await assertOnboardingComplete(user.id);
      if (!onboarding.ok) return res.status(403).json({ ok: false, error: onboarding.reason, message: onboarding.message });

      const body = req.body || {};
      const patch = {};

      if (body.title !== undefined) {
        const title = String(body.title || '').trim();
        if (!title || title.length > MAX_TITLE) return res.status(400).json({ ok: false, error: 'invalid_title' });
        patch.title = title;
      }
      if (body.description !== undefined) {
        const description = body.description ? String(body.description).trim() : null;
        if (description && description.length > MAX_DESCRIPTION) return res.status(400).json({ ok: false, error: 'invalid_description' });
        patch.description = description;
      }
      if (body.cover_image_url !== undefined) {
        patch.cover_image_url = body.cover_image_url ? String(body.cover_image_url) : null;
      }

      let nextStartsAt = activity.starts_at;
      let nextEndsAt = activity.ends_at;
      if (body.starts_at !== undefined) {
        const d = new Date(body.starts_at);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_starts_at' });
        patch.starts_at = d.toISOString();
        nextStartsAt = patch.starts_at;
      }
      if (body.ends_at !== undefined) {
        if (body.ends_at === null) {
          patch.ends_at = null;
          nextEndsAt = null;
        } else {
          const d = new Date(body.ends_at);
          if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_ends_at' });
          patch.ends_at = d.toISOString();
          nextEndsAt = patch.ends_at;
        }
      }
      if (nextEndsAt && new Date(nextEndsAt).getTime() <= new Date(nextStartsAt).getTime()) {
        return res.status(400).json({ ok: false, error: 'ends_before_starts' });
      }

      if (body.timezone !== undefined) patch.timezone = String(body.timezone || 'America/Santiago');

      if (body.modality !== undefined) {
        if (!MODALITIES.includes(body.modality)) return res.status(400).json({ ok: false, error: 'invalid_modality' });
        patch.modality = body.modality;
      }
      if (body.venue_name !== undefined) {
        const v = body.venue_name ? String(body.venue_name).trim() : null;
        if (v && v.length > MAX_SHORT_TEXT) return res.status(400).json({ ok: false, error: 'invalid_venue_name' });
        patch.venue_name = v;
      }
      if (body.address !== undefined) {
        const a = body.address ? String(body.address).trim() : null;
        if (a && a.length > MAX_SHORT_TEXT) return res.status(400).json({ ok: false, error: 'invalid_address' });
        patch.address = a;
      }
      if (body.instructions !== undefined) {
        const i = body.instructions ? String(body.instructions).trim() : null;
        if (i && i.length > MAX_INSTRUCTIONS) return res.status(400).json({ ok: false, error: 'invalid_instructions' });
        patch.instructions = i;
      }

      if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: 'empty_patch' });
      patch.updated_at = new Date().toISOString();

      const { data: updated, error: updErr } = await supabase
        .from('registration_activities')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (updErr) throw updErr;

      return res.status(200).json({ ok: true, activity: updated });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/inscripciones/[id]] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
