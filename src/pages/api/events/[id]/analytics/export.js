// src/pages/api/events/[id]/analytics/export.js
// EVENT-5 — export XLSX del reporte de analytics. Organizer-only, mismos
// límites deterministas verificados ANTES de tocar ExcelJS (nunca
// construye el workbook para luego descubrir que excede un límite).
// Genera el buffer completo en memoria (workbook.xlsx.writeBuffer()) —
// sin escritura a disco, compatible con el entorno serverless de Vercel.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { canViewEventAnalytics } from '@/lib/eventAnalyticsAuth';
import { fetchEventAnalyticsData, computeEventAnalyticsSummary, checkAnalyticsLimits, sanitizeFilename } from '@/lib/eventAnalytics';
import { buildEventAnalyticsWorkbook } from '@/lib/eventAnalyticsWorkbook';

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

const LIMIT_ERROR_LABEL = {
  orders: 'órdenes',
  tickets: 'entradas',
  checkins: 'check-ins',
  staff: 'personal de acceso',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { id: eventId } = req.query || {};
  if (!eventId) return res.status(400).json({ ok: false, error: 'missing_event_id' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const ip = resolveClientIp(req);
    // Límite más bajo que el JSON: generar el XLSX es notoriamente más
    // costoso (CPU/memoria) que servir el resumen.
    if (await enforceRateLimit(req, res, { key: `events-analytics-export:${user.id}:${eventId}`, maxHits: 6, windowSeconds: 60 })) return;

    const authorized = await canViewEventAnalytics(supabase, eventId, user.id);
    if (!authorized) return res.status(403).json({ ok: false, error: 'not_authorized' });

    const limits = await checkAnalyticsLimits(supabase, eventId);
    if (!limits.ok) {
      return res.status(422).json({
        ok: false,
        error: 'limit_exceeded',
        limit: limits.limit,
        count: limits.count,
        max: limits.max,
        message: `Este evento supera el límite de ${limits.max.toLocaleString('es-CL')} ${LIMIT_ERROR_LABEL[limits.limit] || limits.limit} por reporte.`,
      });
    }

    const data = await fetchEventAnalyticsData(supabase, eventId);
    if (!data) return res.status(404).json({ ok: false, error: 'not_found' });

    const summary = computeEventAnalyticsSummary(data);
    const workbook = buildEventAnalyticsWorkbook(data, summary);
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `rifex-${sanitizeFilename(data.event.title)}-analytics.xlsx`.replace(/\s+/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    return res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    console.error('[api/events/[id]/analytics/export] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
