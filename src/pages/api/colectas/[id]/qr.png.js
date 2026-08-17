// src/pages/api/colectas/[id]/qr.png.js
// Ficha QR descargable/imprimible de una Colecta. Pública (no requiere
// sesión) — el QR apunta exclusivamente a /colectas/[id], que ya es
// pública; no se expone nada que no se pudiera ver entrando directo a esa
// URL. No es el QR transaccional de Evento (eso no se implementa acá).
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { deriveEffectiveStatus } from '@/lib/colectaStatus';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function escapeXml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

// Corta un texto largo en un máximo de 2 líneas para el título de la tarjeta.
function wrapTitle(title, maxCharsPerLine = 28) {
  const words = String(title || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
    if (lines.length === 2) break;
  }
  if (current && lines.length < 2) lines.push(current.trim());
  return lines.slice(0, 2);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const { data: colecta, error } = await supabase
      .from('colectas')
      .select('id, title, status, end_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    // Mismo criterio de visibilidad que la página pública: draft/deleted no existen para nadie de afuera.
    const effective = deriveEffectiveStatus(colecta);
    if (!colecta || !['active', 'finished', 'closed'].includes(effective)) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    const base = (process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`).replace(/\/+$/, '');
    const url = `${base}/colectas/${colecta.id}`;

    const qrBuffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 520,
      margin: 1,
      color: { dark: '#111111', light: '#FFFFFFFF' },
    });

    const cardW = 700;
    const cardH = 980;
    const qrTop = 210;
    const qrLeft = Math.round((cardW - 520) / 2);
    const titleLines = wrapTitle(colecta.title);

    const svg = `
      <svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#F7F8FA"/>
        <rect x="24" y="24" width="${cardW - 48}" height="${cardH - 48}" rx="24" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="2"/>
        <text x="50%" y="90" font-size="30" font-weight="800" fill="#1E3A8A" text-anchor="middle" font-family="Arial, sans-serif">Rifex</text>
        ${titleLines.map((line, i) => `<text x="50%" y="${140 + i * 32}" font-size="24" font-weight="700" fill="#111111" text-anchor="middle" font-family="Arial, sans-serif">${escapeXml(line)}</text>`).join('')}
        <rect x="${qrLeft - 16}" y="${qrTop - 16}" width="552" height="552" rx="16" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="2"/>
        <text x="50%" y="${qrTop + 590}" font-size="20" font-weight="700" fill="#18A957" text-anchor="middle" font-family="Arial, sans-serif">Escanea para ayudar</text>
        <text x="50%" y="${qrTop + 622}" font-size="14" fill="#6B7280" text-anchor="middle" font-family="Arial, sans-serif">${escapeXml(url)}</text>
      </svg>`;

    const png = await sharp({ create: { width: cardW, height: cardH, channels: 4, background: '#F7F8FA' } })
      .composite([
        { input: Buffer.from(svg), top: 0, left: 0 },
        { input: qrBuffer, top: qrTop, left: qrLeft },
      ])
      .png()
      .toBuffer();

    const safeSlug = String(colecta.title || 'colecta').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="rifex-${safeSlug}-qr.png"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(png);
  } catch (e) {
    console.error('[api/colectas/:id/qr] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
