// src/pages/api/inscripciones/mine.js
// INSCRIPCIONES V1 — listado privado del organizador autenticado (todas
// sus actividades, cualquier status). Acotado SIEMPRE por
// organizer_id = user.id resuelto server-side — nunca un id que mande
// el cliente (mismo criterio de ownership que /api/panel/eventos).
// Incluye contadores derivados (registered/checked_in) para que
// Mis Iniciativas y el panel puedan mostrarlos sin una segunda ronda de
// requests por actividad.
//
// RIFEX PANEL SCALABILITY (2026-09-05) — paginación server-side real:
// PAGE_SIZE=12 (justificado en docs/panel/PANEL_PAGINATION.md — la
// lista es de una sola columna, 12 tarjetas es una pantalla completa
// sin scroll excesivo en móvil ni desktop). El conteo total viene de un
// `count: 'exact', head: true` real (cero filas descargadas solo para
// contar) — nunca de `items.length`. Los contadores por actividad
// (registered_count/checked_in_count) ya NO se calculan descargando
// todas las filas de registration_participants de todas las
// actividades del organizador (no escala si algún día hay muchas
// actividades con muchos inscritos) — ahora son 2 counts exactos
// (head:true) por cada una de las ≤12 actividades de la página actual,
// acotados por PAGE_SIZE, nunca por el volumen real de inscritos.
//
// Punto de extensión futuro (sección 11 del mandato, NO implementado):
// un `?q=` de búsqueda por título de actividad se agregaría acá como
// un `.ilike('title', `%${q}%`)` adicional antes del `.range()`.
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

async function countParticipants(activityId, onlyCheckedIn) {
  let q = supabase
    .from('registration_participants')
    .select('id', { count: 'exact', head: true })
    .eq('activity_id', activityId);
  if (onlyCheckedIn) q = q.not('checked_in_at', 'is', null);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { count: total, error: countErr } = await supabase
      .from('registration_activities')
      .select('id', { count: 'exact', head: true })
      .eq('organizer_id', user.id);
    if (countErr) throw countErr;

    const requestedPage = parsePage(req.query?.page);
    const pagination = resolvePagination(requestedPage, PAGE_SIZE, total || 0);

    const { data: activities, error } = await supabase
      .from('registration_activities')
      .select('id, title, starts_at, status, plan, capacity, created_at')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })
      .range(pagination.from, pagination.to);
    if (error) throw error;

    const items = await Promise.all(
      (activities || []).map(async (a) => {
        const [registered_count, checked_in_count] = await Promise.all([
          countParticipants(a.id, false),
          countParticipants(a.id, true),
        ]);
        return { ...a, registered_count, checked_in_count };
      })
    );

    return res.status(200).json({
      ok: true,
      items,
      pagination: { page: pagination.page, pageSize: pagination.pageSize, total: pagination.total, totalPages: pagination.totalPages },
    });
  } catch (e) {
    console.error('[api/inscripciones/mine] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
