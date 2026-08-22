// src/pages/api/colectas/index.js
// Crea una Colecta. La identidad del creador sale SIEMPRE de la sesión
// verificada — nunca se confía en un creator_id/email mandado por el
// cliente.
//
// Cambio de esta fase (sprint dashboard): antes quedaba en 'draft' y no
// existía ningún paso que la pasara a 'active' — ninguna colecta creada
// por un usuario real se hacía pública sola. Ahora, como la duración
// (start_at/end_at) se define en el momento de crear, la campaña queda
// directa en 'active' — no se inventa un botón "Publicar" que nadie pidió.
// 'draft' sigue siendo un estado válido en el esquema, solo que hoy no se
// genera desde esta ruta.
import { createClient } from '@supabase/supabase-js';
import { assertCountryGate } from '@/lib/countryGate';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_GALLERY = 10;
const ALLOWED_DURATION_DAYS = new Set([15, 30, 60]);
const DEFAULT_DURATION_DAYS = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

  // Country Gate (G2): país operativo del creador, autoridad única =
  // users_profile.country_code server-side.
  const gate = await assertCountryGate(ures.user.id, 'fundraising');
  if (!gate.ok) return res.status(403).json({ ok: false, error: gate.reason, message: gate.message });

  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const coverImageUrl = req.body?.cover_image_url ? String(req.body.cover_image_url) : null;
  const galleryUrls = Array.isArray(req.body?.gallery_urls)
    ? req.body.gallery_urls.map((u) => String(u)).filter(Boolean)
    : [];

  // Duración: nunca se confía en fechas mandadas por el cliente, solo en
  // cuál de las 3 opciones válidas eligió. start_at/end_at se calculan acá.
  const durationDaysRaw = Number(req.body?.duration_days);
  const durationDays = ALLOWED_DURATION_DAYS.has(durationDaysRaw) ? durationDaysRaw : DEFAULT_DURATION_DAYS;
  if (req.body?.duration_days != null && !ALLOWED_DURATION_DAYS.has(durationDaysRaw)) {
    return res.status(400).json({ ok: false, error: 'invalid_duration' });
  }

  // Meta opcional: sigue siendo aporte libre por defecto (goal_cents null,
  // sin barra de progreso). Si mandan una, tiene que ser un número > 0.
  let goalCents = null;
  if (req.body?.goal_cents != null && req.body.goal_cents !== '') {
    const g = Number(req.body.goal_cents);
    if (!Number.isFinite(g) || g <= 0 || !Number.isInteger(g)) {
      return res.status(400).json({ ok: false, error: 'invalid_goal' });
    }
    goalCents = g;
  }

  if (!title || title.length > 140) {
    return res.status(400).json({ ok: false, error: 'invalid_title' });
  }
  if (!description || description.length > 5000) {
    return res.status(400).json({ ok: false, error: 'invalid_description' });
  }
  if (galleryUrls.length > MAX_GALLERY) {
    return res.status(400).json({ ok: false, error: 'too_many_images' });
  }

  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

  try {
    const { data: inserted, error } = await supabase
      .from('colectas')
      .insert({
        creator_id: ures.user.id,
        title,
        description,
        cover_image_url: coverImageUrl,
        gallery_urls: galleryUrls,
        goal_cents: goalCents,
        status: 'active',
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
      })
      .select('id, title, status, start_at, end_at, created_at')
      .single();
    if (error) throw error;

    return res.status(201).json({ ok: true, colecta: inserted });
  } catch (e) {
    console.error('[api/colectas] POST error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
