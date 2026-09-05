// src/pages/api/events/upload-photo.js
// EVENT-1 — mismo patrón que colectas/upload-photo.js (Fase 14: reutilizar
// patrón, no dominio — bucket propio, sin tocar el flujo de Colectas).
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { enforceRateLimit } from '@/lib/rateLimit';

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BUCKET = 'event-photos';
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TARGETS = {
  cover: { width: 1600, height: 700 },
  gallery: { width: 900, height: 900 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

    if (await enforceRateLimit(req, res, { key: `events-upload:${ures.user.id}`, maxHits: 20, windowSeconds: 60 })) return;

    const { filename, contentType, dataBase64, kind } = req.body || {};
    if (!filename || !contentType || !dataBase64) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return res.status(400).json({ ok: false, error: 'invalid_type' });
    }

    const rawBuffer = Buffer.from(dataBase64, 'base64');
    const target = TARGETS[kind] || TARGETS.gallery;

    // Nunca se guarda rawBuffer tal cual — se re-decodifica y re-codifica
    // desde cero con sharp (mismo criterio de seguridad que Colectas: el
    // archivo final contiene solo los píxeles que sharp logró leer, nada
    // de lo que venga pegado o escondido después).
    let buffer;
    try {
      buffer = await sharp(rawBuffer, { failOn: 'error' })
        .rotate()
        .resize(target.width, target.height, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch (imgErr) {
      console.error('[api/events/upload-photo] invalid image', imgErr?.message);
      return res.status(400).json({ ok: false, error: 'invalid_image' });
    }

    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const path = `${ures.user.id}/${Date.now()}-${randomUUID()}-${safeName}.jpg`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return res.status(200).json({ ok: true, url: pub.publicUrl });
  } catch (e) {
    console.error('[api/events/upload-photo] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
