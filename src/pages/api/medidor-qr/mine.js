// src/pages/api/medidor-qr/mine.js
// MEDIDOR QR V1 — listado privado del organizador. Mismo patrón de
// paginación server-side real que Inscripciones/Eventos/Convocatorias
// (ver src/lib/panelPagination.js, PAGE_SIZE=12).
//
// EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1 (punto 4): búsqueda
// por nombre/pregunta (?q=) + filtro de estado (?status=all|active|
// finalizados), aplicados server-side a la MISMA query que la
// paginación (nunca filtrado en el cliente sobre una página ya
// paginada). "finalizados" es status='closed' O measurement_end ya
// pasado — mismo criterio de "finalizada" que usa la página pública
// (/m/[slug].jsx) y el dashboard, no solo el campo status crudo.
import { createClient } from '@supabase/supabase-js';
import { parsePage, resolvePagination } from '@/lib/panelPagination';

const PAGE_SIZE = 12;

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

const STATUS_FILTERS = new Set(['all', 'active', 'finalizados']);

function applyFilters(query, { safeQ, statusFilter, nowIso }) {
  let q = query;
  if (safeQ) q = q.or(`name.ilike.%${safeQ}%,question.ilike.%${safeQ}%`);
  if (statusFilter === 'active') q = q.eq('status', 'active').gte('measurement_end', nowIso);
  if (statusFilter === 'finalizados') q = q.or(`status.eq.closed,measurement_end.lt.${nowIso}`);
  return q;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const rawQ = String(req.query?.q || '').trim().slice(0, 100);
    const safeQ = rawQ.replace(/[,()%_]/g, ' ').trim();
    const requestedStatus = String(req.query?.status || 'all').trim();
    const statusFilter = STATUS_FILTERS.has(requestedStatus) ? requestedStatus : 'all';
    const nowIso = new Date().toISOString();

    const { count: total, error: countErr } = await applyFilters(
      supabase.from('medidores_qr').select('id', { count: 'exact', head: true }).eq('organizer_id', user.id),
      { safeQ, statusFilter, nowIso }
    );
    if (countErr) throw countErr;

    const requestedPage = parsePage(req.query?.page);
    const pagination = resolvePagination(requestedPage, PAGE_SIZE, total || 0);

    const { data: items, error } = await applyFilters(
      supabase
        .from('medidores_qr')
        .select('id, name, question, slug, status, scan_count, measurement_start, measurement_end, created_at')
        .eq('organizer_id', user.id),
      { safeQ, statusFilter, nowIso }
    )
      .order('created_at', { ascending: false })
      .range(pagination.from, pagination.to);
    if (error) throw error;

    const withCounts = await Promise.all(
      (items || []).map(async (m) => {
        const { count: responseCount } = await supabase
          .from('medidor_qr_responses')
          .select('id', { count: 'exact', head: true })
          .eq('medidor_qr_id', m.id);
        return { ...m, response_count: responseCount || 0 };
      })
    );

    return res.status(200).json({
      ok: true,
      items: withCounts,
      pagination: { page: pagination.page, pageSize: pagination.pageSize, total: pagination.total, totalPages: pagination.totalPages },
      filters: { q: rawQ, status: statusFilter },
    });
  } catch (e) {
    console.error('[api/medidor-qr/mine] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
