// src/pages/api/inscripciones/[id]/participants.js
// INSCRIPCIONES V1 — listado de participantes, owner-only estricto
// (sección 22 del mandato). Nunca expone qr_token. registration_participants
// tiene RLS con revoke all — este endpoint (service_role) es uno de los
// pocos caminos autorizados a leerla, siempre acotado por
// activity.organizer_id = user.id verificado server-side primero.
//
// RIFEX PANEL SCALABILITY (2026-09-05) — PAGE_SIZE=25 (mandato,
// sección 3). `summary.registered/checked_in/pending` vienen de counts
// exactos (`count: 'exact', head: true`) sobre la TABLA completa de la
// actividad — nunca de `items.length` de la página actual. Esto
// reemplaza el cálculo que hacía panel/inscripciones/[id].jsx en el
// cliente a partir del array completo de participantes: antes era
// "correcto por accidente" porque ese array traía TODAS las filas; con
// paginación real dejaría de serlo si no se moviera acá. El export
// Excel (export.js) es un endpoint completamente separado que sigue
// consultando el dataset completo sin límite — no se toca.
//
// Punto de extensión futuro (sección 11 del mandato, NO implementado):
// un `?q=` de búsqueda por nombre/email/teléfono se agregaría acá como
// un `.or('full_name.ilike.%q%,email.ilike.%q%,phone.ilike.%q%')`
// adicional antes del `.range()`.
import { createClient } from '@supabase/supabase-js';
import { parsePage, resolvePagination } from '@/lib/panelPagination';

const PAGE_SIZE = 25;

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

    const { data: activity, error: actErr } = await supabase
      .from('registration_activities')
      .select('id, organizer_id')
      .eq('id', id)
      .maybeSingle();
    if (actErr) throw actErr;
    if (!activity) return res.status(404).json({ ok: false, error: 'not_found' });
    if (activity.organizer_id !== user.id) return res.status(403).json({ ok: false, error: 'not_your_activity' });

    const { count: total, error: countErr } = await supabase
      .from('registration_participants')
      .select('id', { count: 'exact', head: true })
      .eq('activity_id', id);
    if (countErr) throw countErr;

    const { count: checkedIn, error: checkedInErr } = await supabase
      .from('registration_participants')
      .select('id', { count: 'exact', head: true })
      .eq('activity_id', id)
      .not('checked_in_at', 'is', null);
    if (checkedInErr) throw checkedInErr;

    const requestedPage = parsePage(req.query?.page);
    const pagination = resolvePagination(requestedPage, PAGE_SIZE, total || 0);

    const { data: participants, error } = await supabase
      .from('registration_participants')
      .select('id, full_name, email, phone, registered_at, checked_in_at')
      .eq('activity_id', id)
      .order('registered_at', { ascending: true })
      .range(pagination.from, pagination.to);
    if (error) throw error;

    return res.status(200).json({
      ok: true,
      items: participants || [],
      pagination: { page: pagination.page, pageSize: pagination.pageSize, total: pagination.total, totalPages: pagination.totalPages },
      summary: {
        registered: total || 0,
        checked_in: checkedIn || 0,
        pending: Math.max(0, (total || 0) - (checkedIn || 0)),
      },
    });
  } catch (e) {
    console.error('[api/inscripciones/[id]/participants] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
