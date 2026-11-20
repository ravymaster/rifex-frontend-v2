// src/pages/api/medidor-qr/m/[slug]/click.js
// MEDIDOR QR V1 — extensión "destino opcional post-respuesta": registra
// un clic VOLUNTARIO al destino. Público, rate-limited por IP. La RPC
// record_medidor_qr_destination_click exige que ese visitor_key ya
// tenga una respuesta registrada (funnel real: escaneos -> respuestas
// -> clics) — este endpoint NO redirige nada, solo cuenta el clic; la
// navegación real la hace el navegador del visitante siguiendo el
// href real ya renderizado en la página (nunca un redirect endpoint
// abierto genérico, ver sección "SEGURIDAD DEL DESTINO" del mandato).
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { slug } = req.query || {};
  if (!slug) return res.status(400).json({ ok: false, error: 'missing_slug' });

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `medidor-qr-click:${ip}:${slug}`, maxHits: 20, windowSeconds: 60 })) return;

  const visitorKey = String(req.body?.visitor_key || '');
  if (visitorKey.length < 16 || visitorKey.length > 128) return res.status(400).json({ ok: false, error: 'invalid_visitor' });

  try {
    const { data: medidor, error: findErr } = await supabase
      .from('medidores_qr')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!medidor) return res.status(404).json({ ok: false, error: 'not_found' });

    const { data: result, error: rpcErr } = await supabase.rpc('record_medidor_qr_destination_click', {
      p_medidor_qr_id: medidor.id,
      p_visitor_key: visitorKey,
    });
    if (rpcErr) throw rpcErr;
    if (!result?.ok) return res.status(400).json({ ok: false, error: result?.error || 'invalid_request' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[api/medidor-qr/m/[slug]/click] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
