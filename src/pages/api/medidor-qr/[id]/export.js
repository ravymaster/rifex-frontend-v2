// src/pages/api/medidor-qr/[id]/export.js
// MEDIDOR QR V1 — export XLSX de métricas. Owner-only. Mismo patrón que
// /api/inscripciones/[id]/export.js: buffer completo en memoria, sin
// escritura a disco (compatible con Vercel serverless). Sección 12 del
// mandato: el Excel contiene MÉTRICAS, nunca personas — reutiliza
// loadMedidorQrMetrics (agregados puros) exactamente igual que el
// dashboard, nunca una consulta separada que pudiera exponer filas
// individuales de respondedores.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/rateLimit';
import { sanitizeFilename } from '@/lib/eventAnalytics';
import { buildMedidorQrWorkbook } from '@/lib/medidorQrWorkbook';
import { loadMedidorQrMetrics } from './index.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function getRequester(req) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return null;
  const { data: ures, error } = await supabase.auth.getUser(token);
  if (error || !ures?.user) return null;
  return ures.user;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    if (await enforceRateLimit(req, res, { key: `medidor-qr-export:${user.id}:${id}`, maxHits: 6, windowSeconds: 60 })) return;

    const { data: medidor, error: fetchErr } = await supabase
      .from('medidores_qr')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!medidor) return res.status(404).json({ ok: false, error: 'not_found' });
    if (medidor.organizer_id !== user.id) return res.status(403).json({ ok: false, error: 'not_your_medidor' });

    const metrics = await loadMedidorQrMetrics(medidor);
    const wb = buildMedidorQrWorkbook({ medidor, metrics });
    const buffer = await wb.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="medidor-qr-${sanitizeFilename(medidor.question)}.xlsx"`);
    return res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    console.error('[api/medidor-qr/[id]/export] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
