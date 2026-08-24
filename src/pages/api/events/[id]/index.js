// src/pages/api/events/[id]/index.js
// EVENT-1 — GET: público solo si published; el owner puede ver su propio
// evento en cualquier status (draft/published/cancelled) presentando un
// Bearer token válido. PATCH: owner-only, nunca acepta organizer_id/status
// directamente desde el body (status solo cambia vía publish.js o acciones
// explícitas futuras — EVENT-1 permite cancelar aquí, ver más abajo).
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function getRequester(req) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return null;
  const { data: ures, error } = await supabase.auth.getUser(token);
  if (error || !ures?.user) return null;
  return ures.user;
}

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const { data: event, error: fetchErr } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!event) return res.status(404).json({ ok: false, error: 'not_found' });

    if (req.method === 'GET') {
      if (event.status === 'published') {
        return res.status(200).json({ ok: true, event });
      }
      // No publicado: solo el dueño puede verlo.
      const user = await getRequester(req);
      if (!user || user.id !== event.organizer_id) {
        return res.status(404).json({ ok: false, error: 'not_found' });
      }
      return res.status(200).json({ ok: true, event });
    }

    if (req.method === 'PATCH') {
      const user = await getRequester(req);
      if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });
      if (user.id !== event.organizer_id) return res.status(403).json({ ok: false, error: 'not_your_event' });

      const body = req.body || {};
      const patch = {};

      if (body.title !== undefined) {
        const title = String(body.title || '').trim();
        if (!title || title.length > 140) return res.status(400).json({ ok: false, error: 'invalid_title' });
        patch.title = title;
      }
      if (body.description !== undefined) {
        const description = body.description ? String(body.description).trim() : null;
        if (description && description.length > 5000) return res.status(400).json({ ok: false, error: 'invalid_description' });
        patch.description = description;
      }
      if (body.cover_image_url !== undefined) {
        patch.cover_image_url = body.cover_image_url ? String(body.cover_image_url) : null;
      }
      if (body.gallery_urls !== undefined) {
        patch.gallery_urls = Array.isArray(body.gallery_urls)
          ? body.gallery_urls.map((u) => String(u)).filter(Boolean).slice(0, 10)
          : [];
      }
      if (body.venue_name !== undefined) patch.venue_name = body.venue_name ? String(body.venue_name).trim() : null;
      if (body.address !== undefined) patch.address = body.address ? String(body.address).trim() : null;
      if (body.terms_text !== undefined) patch.terms_text = body.terms_text ? String(body.terms_text).trim() : null;
      if (body.timezone !== undefined) patch.timezone = String(body.timezone || 'America/Santiago');

      let nextStartsAt = event.starts_at;
      let nextEndsAt = event.ends_at;
      if (body.starts_at !== undefined) {
        const d = new Date(body.starts_at);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_starts_at' });
        patch.starts_at = d.toISOString();
        nextStartsAt = patch.starts_at;
      }
      if (body.ends_at !== undefined) {
        const d = new Date(body.ends_at);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_ends_at' });
        patch.ends_at = d.toISOString();
        nextEndsAt = patch.ends_at;
      }
      if (new Date(nextEndsAt).getTime() <= new Date(nextStartsAt).getTime()) {
        return res.status(400).json({ ok: false, error: 'ends_before_starts' });
      }

      // EVENT-1 (decisión de producto cerrada #6): cancelación de evento
      // publicado o draft, sin reembolsos (no existen orders todavía) —
      // transición explícita y acotada, nunca un status arbitrario.
      if (body.status !== undefined) {
        if (body.status !== 'cancelled') {
          return res.status(400).json({ ok: false, error: 'invalid_status_transition' });
        }
        if (event.status === 'cancelled') {
          return res.status(409).json({ ok: false, error: 'already_cancelled' });
        }
        patch.status = 'cancelled';
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, error: 'empty_patch' });
      }
      patch.updated_at = new Date().toISOString();

      const { data: updated, error: updErr } = await supabase
        .from('events')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (updErr) throw updErr;

      return res.status(200).json({ ok: true, event: updated });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/events/[id]] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
