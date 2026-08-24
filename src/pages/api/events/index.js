// src/pages/api/events/index.js
// EVENT-1 — Foundation. Dominio nuevo e independiente de raffles/colectas.
// GET: listado público de eventos publicados (sin filtros, EVENT-1).
// POST: crear evento en estado draft. Identidad SIEMPRE derivada de
// auth.getUser(token) — nunca de un organizer_id que mande el cliente,
// mismo criterio ya certificado en /api/rifas e /api/colectas.
import { createClient } from '@supabase/supabase-js';
import { assertCountryGate } from '@/lib/countryGate';
import { enforceRateLimit } from '@/lib/rateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_GALLERY = 10;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, description, cover_image_url, starts_at, ends_at, timezone, venue_name, status')
        .eq('status', 'published')
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, items: data || [] });
    }

    if (req.method === 'POST') {
      const authz = req.headers.authorization || '';
      const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
      if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

      const { data: ures, error: uerr } = await supabase.auth.getUser(token);
      if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
      const organizer_id = ures.user.id;

      // EVENT-1 (Fase 15): mismo criterio que rifas-create/colectas-create
      // — se limita por user_id, nunca por IP, para que un usuario no
      // consuma cupo de otro detrás del mismo NAT/proxy.
      if (await enforceRateLimit(req, res, { key: `events-create:${organizer_id}`, maxHits: 10, windowSeconds: 60 })) return;

      const gate = await assertCountryGate(organizer_id, 'events');
      if (!gate.ok) return res.status(403).json({ ok: false, error: gate.reason, message: gate.message });

      const body = req.body || {};
      const title = String(body.title || '').trim();
      if (!title) return res.status(400).json({ ok: false, error: 'missing_title' });
      if (title.length > 140) return res.status(400).json({ ok: false, error: 'invalid_title' });

      const description = body.description != null ? String(body.description).trim() : null;
      if (description && description.length > 5000) {
        return res.status(400).json({ ok: false, error: 'invalid_description' });
      }

      const coverImageUrl = body.cover_image_url ? String(body.cover_image_url) : null;
      const galleryUrls = Array.isArray(body.gallery_urls)
        ? body.gallery_urls.map((u) => String(u)).filter(Boolean).slice(0, MAX_GALLERY)
        : [];

      const startsAt = body.starts_at ? new Date(body.starts_at) : null;
      const endsAt = body.ends_at ? new Date(body.ends_at) : null;
      if (!startsAt || Number.isNaN(startsAt.getTime())) {
        return res.status(400).json({ ok: false, error: 'invalid_starts_at' });
      }
      if (!endsAt || Number.isNaN(endsAt.getTime())) {
        return res.status(400).json({ ok: false, error: 'invalid_ends_at' });
      }
      if (endsAt.getTime() <= startsAt.getTime()) {
        return res.status(400).json({ ok: false, error: 'ends_before_starts' });
      }

      const timezone = body.timezone ? String(body.timezone) : 'America/Santiago';
      const venueName = body.venue_name ? String(body.venue_name).trim() : null;
      const address = body.address ? String(body.address).trim() : null;
      const termsText = body.terms_text ? String(body.terms_text).trim() : null;

      const { data: created, error: insErr } = await supabase
        .from('events')
        .insert({
          organizer_id,
          title,
          description,
          cover_image_url: coverImageUrl,
          gallery_urls: galleryUrls,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          timezone,
          venue_name: venueName,
          address,
          terms_text: termsText,
          status: 'draft',
        })
        .select('*')
        .single();
      if (insErr) throw insErr;

      return res.status(201).json({ ok: true, id: created.id, event: created });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/events] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
