// src/pages/api/events/tickets/[token]/qr.png.js
// EVENT-3 (Fase 14) — ficha QR descargable/imprimible de UN ticket
// individual. Mismo patrón técnico ya certificado en
// colectas/[id]/qr.png.js (satori + sharp + qrcode + fuente Inter
// empaquetada, nunca <text> dependiente de fuentes del sistema) — sin
// convertir el QR de Colectas en ticket QR, solo se reutiliza la técnica
// de renderizado. El QR codifica ÚNICAMENTE la URL /t/<qr_token> — nunca
// datos sensibles directamente en el payload del QR.
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
const CARD_H = 900;
const QR_SIZE = 440;
const MAX_TITLE_CHARS = 70;

function truncate(s, max) {
  const t = String(s || '');
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).json({ ok: false, error: 'invalid_token' });

  try {
    const { data: ticket, error } = await supabase
      .from('event_tickets')
      .select('ticket_number, ticket_type_name_snapshot, status, event_id, qr_token')
      .eq('qr_token', token)
      .maybeSingle();
    if (error) throw error;
    // Mismo criterio anti-enumeration que la resolución JSON: 404 neutro.
    if (!ticket) return res.status(404).json({ ok: false, error: 'not_found' });

    const { data: event } = await supabase
      .from('events')
      .select('title, starts_at, timezone, venue_name')
      .eq('id', ticket.event_id)
      .maybeSingle();

    const base = (process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`).replace(/\/+$/, '');
    const url = `${base}/t/${ticket.qr_token}`;

    const qrBuffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: QR_SIZE,
      margin: 1,
      color: { dark: '#111111', light: '#FFFFFFFF' },
    });
    const qrDataUri = `data:image/png;base64,${qrBuffer.toString('base64')}`;

    const dateStr = event?.starts_at
      ? new Date(event.starts_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: event.timezone || 'America/Santiago' })
      : '';

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
                border: '2px solid #E5E7EB', padding: '32px 36px',
              },
              children: [
                { type: 'div', props: { style: { fontSize: 24, fontWeight: 800, color: '#1E3A8A', display: 'flex' }, children: 'Rifex Eventos' } },
                { type: 'div', props: { style: { fontSize: 20, fontWeight: 700, color: '#111111', marginTop: 10, display: 'flex', textAlign: 'center', maxWidth: 560 }, children: truncate(event?.title, MAX_TITLE_CHARS) } },
                { type: 'div', props: { style: { fontSize: 14, color: '#6B7280', marginTop: 4, display: 'flex' }, children: dateStr } },
                { type: 'img', props: { src: qrDataUri, width: QR_SIZE, height: QR_SIZE, style: { marginTop: 20, borderRadius: 16, border: '2px solid #E5E7EB' } } },
                { type: 'div', props: { style: { fontSize: 18, fontWeight: 700, color: '#18A957', marginTop: 20, display: 'flex' }, children: truncate(ticket.ticket_type_name_snapshot, 40) } },
                { type: 'div', props: { style: { fontSize: 15, fontWeight: 600, color: '#111111', marginTop: 6, display: 'flex' }, children: ticket.ticket_number } },
                ...(ticket.status === 'void'
                  ? [{ type: 'div', props: { style: { fontSize: 15, fontWeight: 700, color: '#B91C1C', marginTop: 10, display: 'flex' }, children: 'ENTRADA ANULADA' } }]
                  : []),
              ],
            },
          },
        ],
      },
    };

    const svg = await satori(tree, { width: CARD_W, height: CARD_H, fonts: loadFonts() });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="rifex-entrada-${ticket.ticket_number}.png"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(png);
  } catch (e) {
    console.error('[api/events/tickets/:token/qr] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
