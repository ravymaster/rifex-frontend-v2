// src/pages/api/colectas/index.js
// Crea una Colecta. La identidad del creador sale SIEMPRE de la sesión
// verificada — nunca se confía en un creator_id/email mandado por el
// cliente. Queda en estado 'draft' (contrato C1); todavía no hay
// aportes/checkout/pública — eso es fase aparte.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_GALLERY = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const coverImageUrl = req.body?.cover_image_url ? String(req.body.cover_image_url) : null;
  const galleryUrls = Array.isArray(req.body?.gallery_urls)
    ? req.body.gallery_urls.map((u) => String(u)).filter(Boolean)
    : [];

  if (!title || title.length > 140) {
    return res.status(400).json({ ok: false, error: 'invalid_title' });
  }
  if (!description || description.length > 5000) {
    return res.status(400).json({ ok: false, error: 'invalid_description' });
  }
  if (galleryUrls.length > MAX_GALLERY) {
    return res.status(400).json({ ok: false, error: 'too_many_images' });
  }

  try {
    const { data: inserted, error } = await supabase
      .from('colectas')
      .insert({
        creator_id: ures.user.id,
        title,
        description,
        cover_image_url: coverImageUrl,
        gallery_urls: galleryUrls,
        status: 'draft',
      })
      .select('id, title, status, created_at')
      .single();
    if (error) throw error;

    return res.status(201).json({ ok: true, colecta: inserted });
  } catch (e) {
    console.error('[api/colectas] POST error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
