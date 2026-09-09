// src/pages/api/medidor-qr/m/[slug]/qr.png.js
// MEDIDOR QR V1 — ficha QR descargable/imprimible de un Medidor.
// Pública (no requiere sesión) — el QR codifica EXCLUSIVAMENTE
// /m/<slug> (identidad pública permanente, sección "INTEGRIDAD" de la
// EXTENSIÓN FINAL: editar información permitida nunca cambia el QR ya
// impreso). Resuelve por status/fecha igual que la página pública — el
// QR debe seguir siendo válido y descargable incluso si la medición ya
// terminó o el Medidor fue cerrado, nunca un 404 solo por eso.
//
// Mismo patrón satori/sharp/qrcode + fuente Inter empaquetada ya
// certificado en colectas/rifas/inscripciones — nunca depende de una
// fuente del sistema operativo del entorno serverless.
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import sharp from 'sharp';
import satori from 'satori';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

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
  const t = String(title || 'Medidor QR');
  return t.length > MAX_TITLE_CHARS ? `${t.slice(0, MAX_TITLE_CHARS - 1).trim()}…` : t;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const slug = String(req.query.slug || '').trim();
  if (!slug) return res.status(400).json({ ok: false, error: 'missing_slug' });

  try {
    const { data: medidor, error } = await supabase
      .from('medidores_qr')
      .select('id, name, question, slug')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    if (!medidor) return res.status(404).json({ ok: false, error: 'not_found' });

    const base = (process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`).replace(/\/+$/, '');
    const url = `${base}/m/${medidor.slug}`;

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
                // El espacio superior es del creador (nombre/pregunta del
                // Medidor) — Rifex nunca compite visualmente con el
                // contenido del creador, mismo principio ya aplicado en
                // la página pública /m/[slug].
                { type: 'div', props: { style: { fontSize: 25, fontWeight: 800, color: '#111111', display: 'flex', textAlign: 'center', maxWidth: 560 }, children: truncateTitle(medidor.name || medidor.question) } },
                { type: 'img', props: { src: qrDataUri, width: QR_SIZE, height: QR_SIZE, style: { marginTop: 24, borderRadius: 16, border: '2px solid #E5E7EB' } } },
                { type: 'div', props: { style: { fontSize: 19, fontWeight: 700, color: '#18A957', marginTop: 22, display: 'flex' }, children: 'Escanea y responde' } },
                { type: 'div', props: { style: { fontSize: 13, color: '#6B7280', marginTop: 6, display: 'flex' }, children: url } },
                // Firma discreta, nunca un bloque promocional grande —
                // no es un link real (PNG estático), pero queda legible
                // como marca de agua para quien vea/imprima el archivo.
                {
                  type: 'div',
                  props: {
                    style: { width: '100%', display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: 18 },
                    children: [
                      { type: 'div', props: { style: { fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'flex' }, children: 'Powered by rifex.pro' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const svg = await satori(tree, { width: CARD_W, height: CARD_H, fonts: loadFonts() });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();

    const safeSlug = String(medidor.slug || 'medidor').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="rifex-medidor-qr-${safeSlug}.png"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(png);
  } catch (e) {
    console.error('[api/medidor-qr/m/[slug]/qr.png] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
