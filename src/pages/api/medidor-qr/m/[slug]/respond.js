// src/pages/api/medidor-qr/m/[slug]/respond.js
// MEDIDOR QR V1 — POST público: registra una respuesta anónima. Sin
// login, rate-limited por IP+slug. Toda la autoridad real (ventana
// temporal, status activo, opción válida, anti-duplicación por
// visitor_key) vive en respond_to_medidor_qr (RPC) — este endpoint solo
// resuelve el slug -> id y traduce el resultado. Devuelve
// destination_url/destination_button_label en éxito para que la página
// pública pueda mostrar el botón de destino opcional (extensión del
// mandato) sin una segunda consulta.
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
  if (await enforceRateLimit(req, res, { key: `medidor-qr-respond:${ip}:${slug}`, maxHits: 20, windowSeconds: 60 })) return;

  const visitorKey = String(req.body?.visitor_key || '');
  if (visitorKey.length < 16 || visitorKey.length > 128) return res.status(400).json({ ok: false, error: 'invalid_visitor' });

  const optionIndex = Number.isInteger(req.body?.option_index) ? req.body.option_index : -1;
  if (optionIndex < 0) return res.status(400).json({ ok: false, error: 'invalid_option' });

  try {
    const { data: medidor, error: findErr } = await supabase
      .from('medidores_qr')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!medidor) return res.status(404).json({ ok: false, error: 'not_found' });

    const { data: result, error: rpcErr } = await supabase.rpc('respond_to_medidor_qr', {
      p_medidor_qr_id: medidor.id,
      p_option_index: optionIndex,
      p_visitor_key: visitorKey,
    });
    if (rpcErr) throw rpcErr;
    if (!result?.ok) return res.status(400).json({ ok: false, error: result?.error || 'invalid_request' });

    return res.status(200).json({
      ok: true,
      response_id: result.response_id,
      destination_url: result.destination_url || null,
      destination_button_label: result.destination_button_label || null,
    });
  } catch (e) {
    console.error('[api/medidor-qr/m/[slug]/respond] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
