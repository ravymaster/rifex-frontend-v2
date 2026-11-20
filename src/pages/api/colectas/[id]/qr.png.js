// src/pages/api/colectas/[id]/qr.png.js
// Ficha QR descargable/imprimible de una Colecta. Pública (no requiere
// sesión) — el QR apunta exclusivamente a /colectas/[id], que ya es
// pública; no se expone nada que no se pudiera ver entrando directo a esa
// URL. No es el QR transaccional de Evento (eso no se implementa acá).
//
// El texto de la tarjeta se renderiza con satori, que convierte cada
// glifo en un <path> vectorial usando la fuente empaquetada en
// src/assets/fonts/ — nunca depende de que el servidor tenga una fuente
// sans-serif instalada (el bug original: en el entorno serverless de
// Vercel no hay ninguna, y sharp/SVG con <text> + font-family caía a
// glifos vacíos). Fuente: Inter (SIL Open Font License), la misma que ya
// usa el sitio, descargada una vez y versionada en el repo — nunca se
// pide a una URL externa ni a Google Fonts en tiempo de ejecución.
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import sharp from 'sharp';
import satori from 'satori';
import fs from 'fs';
import path from 'path';
import { deriveEffectiveStatus } from '@/lib/colectaStatus';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Fuerza a Vercel a empaquetar los .woff dentro de la función serverless —
// el trazado automático de archivos no siempre detecta un fs.readFileSync
// con una ruta armada por path.join(), y si el archivo falta en el bundle
// de producción esto fallaría con ENOENT ahí, aunque funcione en local.
export const config = {
  unstable_includeFiles: ['src/assets/fonts/*.woff'],
};

const FONTS_DIR = path.join(process.cwd(), 'src/assets/fonts');
let fontRegular = null;
let fontBold = null;
function loadFonts() {
  if (!fontRegular) fontRegular = fs.readFileSync(path.join(FONTS_DIR, 'Inter-Regular.woff'));
  if (!fontBold) fontBold = fs.readFileSync(path.join(FONTS_DIR, 'Inter-Bold.woff'));
  return [
    { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
    { name: 'Inter', data: fontBold, weight: 700, style: 'normal' },
    { name: 'Inter', data: fontBold, weight: 800, style: 'normal' },
  ];
}

const CARD_W = 700;
const CARD_H = 860;
const QR_SIZE = 460;
const MAX_TITLE_CHARS = 80;

function truncateTitle(title) {
  const t = String(title || 'Colecta');
  return t.length > MAX_TITLE_CHARS ? `${t.slice(0, MAX_TITLE_CHARS - 1).trim()}…` : t;
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
      width: QR_SIZE,
      margin: 1,
      color: { dark: '#111111', light: '#FFFFFFFF' },
    });
    const qrDataUri = `data:image/png;base64,${qrBuffer.toString('base64')}`;

    const tree = {
      type: 'div',
      props: {
        style: {
          width: CARD_W, height: CARD_H, display: 'flex', flexDirection: 'column',
          alignItems: 'center', background: '#F7F8FA', fontFamily: 'Inter', padding: 20,
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', background: '#FFFFFF', borderRadius: 24,
                border: '2px solid #E5E7EB', padding: '36px 40px',
              },
              children: [
                { type: 'div', props: { style: { fontSize: 28, fontWeight: 800, color: '#1E3A8A', display: 'flex' }, children: 'Rifex' } },
                { type: 'div', props: { style: { fontSize: 21, fontWeight: 700, color: '#111111', marginTop: 12, display: 'flex', textAlign: 'center', maxWidth: 520 }, children: truncateTitle(colecta.title) } },
                { type: 'img', props: { src: qrDataUri, width: QR_SIZE, height: QR_SIZE, style: { marginTop: 24, borderRadius: 16, border: '2px solid #E5E7EB' } } },
                { type: 'div', props: { style: { fontSize: 19, fontWeight: 700, color: '#18A957', marginTop: 22, display: 'flex' }, children: 'Escanea para ayudar' } },
                { type: 'div', props: { style: { fontSize: 13, color: '#6B7280', marginTop: 6, display: 'flex' }, children: url } },
              ],
            },
          },
        ],
      },
    };

    const svg = await satori(tree, { width: CARD_W, height: CARD_H, fonts: loadFonts() });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();

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
