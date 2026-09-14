// src/pages/api/medidor-qr/m/[slug]/visit.js
// MEDIDOR QR V1 — POST público: registra un escaneo/visita. Público,
// rate-limited por IP+slug. record_medidor_qr_visit (RPC) incrementa
// scan_count (crudo, sin deduplicar) + registra el visitante distinto
// (deduplicado por visitor_key) en la misma llamada — dos métricas
// separadas a propósito (sección 8 del mandato).
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
  if (await enforceRateLimit(req, res, { key: `medidor-qr-visit:${ip}:${slug}`, maxHits: 20, windowSeconds: 60 })) return;

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

    const { data: result, error: rpcErr } = await supabase.rpc('record_medidor_qr_visit', {
      p_medidor_qr_id: medidor.id,
      p_visitor_key: visitorKey,
    });
    if (rpcErr) throw rpcErr;
    if (!result?.ok) return res.status(400).json({ ok: false, error: result?.error || 'invalid_request' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[api/medidor-qr/m/[slug]/visit] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
