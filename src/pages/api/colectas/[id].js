// src/pages/api/colectas/[id].js
// Vista pública de una Colecta. Sin auth — cualquiera puede verla, pero
// solo si status es 'active' o 'closed'. draft/deleted devuelven 404
// genérico (no se distingue "existe pero es privada" de "no existe").
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const { data: colecta, error } = await supabase
      .from('colectas')
      .select('id, creator_id, title, description, cover_image_url, gallery_urls, status, created_at')
      .eq('id', id)
      .in('status', ['active', 'closed'])
      .maybeSingle();
    if (error) throw error;
    if (!colecta) return res.status(404).json({ ok: false, error: 'not_found' });

    const { data: profile } = await supabase
      .from('users_profile')
      .select('nombre, avatar_url')
      .eq('user_id', colecta.creator_id)
      .maybeSingle();

    return res.status(200).json({
      ok: true,
      colecta: {
        id: colecta.id,
        title: colecta.title,
        description: colecta.description,
        cover_image_url: colecta.cover_image_url,
        gallery_urls: colecta.gallery_urls || [],
        status: colecta.status,
        created_at: colecta.created_at,
        creator: {
          id: colecta.creator_id,
          nombre: profile?.nombre || 'Creador de Rifex',
          avatar_url: profile?.avatar_url || null,
        },
      },
    });
  } catch (e) {
    console.error('[api/colectas/:id] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
