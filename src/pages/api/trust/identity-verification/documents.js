// src/pages/api/trust/identity-verification/documents.js
// TRUST-3A — POST: sube (o reemplaza) un lado del documento de
// identidad del usuario autenticado. Mismo criterio de body sizeLimit
// que src/pages/api/colectas/upload-photo.js — el cliente ya comprime,
// esto es solo el techo del transporte.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { uploadDocumentSide } from '@/lib/trustIdentityVerificationGate';
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES } from '@/lib/trustIdentityVerificationPolicy';

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
    const uid = ures.user.id;

    if (await enforceRateLimit(req, res, { key: `trust-identity-verification-upload:${uid}`, maxHits: 20, windowSeconds: 60 })) return;

    const { side, contentType, dataBase64 } = req.body || {};
    if (!side || !contentType || !dataBase64) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }
    // El Content-Type declarado por el cliente NUNCA es la autoridad —
    // solo se usa acá para un rechazo temprano y barato; la autoridad
    // real son los magic bytes reales, verificados dentro de
    // processDocumentImage (trustIdentityDocumentProcessing.js).
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(contentType)) {
      return res.status(400).json({ ok: false, error: 'invalid_image_format' });
    }

    const rawBuffer = Buffer.from(dataBase64, 'base64');
    if (rawBuffer.length === 0 || rawBuffer.length > MAX_DOCUMENT_BYTES) {
      return res.status(400).json({ ok: false, error: 'invalid_image_size' });
    }

    const result = await uploadDocumentSide(uid, side, rawBuffer);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.reason });
    }

    return res.status(200).json({ ok: true, side: result.document.side, uploaded_at: result.document.created_at });
  } catch (e) {
    console.error('[api/trust/identity-verification/documents] error', e);
    return res.status(500).json({ ok: false, error: 'upload_failed' });
  }
}
