// src/pages/api/events/mine.js
// EVENT-1 — eventos del usuario autenticado (cualquier status), para
// /panel/eventos. Identidad SIEMPRE de auth.getUser(token).
//
// RIFEX PANEL SCALABILITY (2026-09-05) — mismo patrón de paginación
// server-side real ya aplicado a /api/inscripciones/mine: PAGE_SIZE=12,
// total real vía `count: 'exact', head: true`, página acotada con
// `.range()`. Esta lista no muestra hoy contadores de ventas/asistencia
// por tarjeta (a diferencia de Mis Inscripciones) — se deja
// deliberadamente así, sin agregar esa UI (fuera de alcance de esta
// misión, sección "NO agrega producto nuevo").
//
// Punto de extensión futuro (sección 11 del mandato, NO implementado):
// un `?q=` de búsqueda por título se agregaría acá como un
// `.ilike('title', `%${q}%`)` adicional antes del `.range()`.
import { createClient } from '@supabase/supabase-js';
import { parsePage, resolvePagination } from '@/lib/panelPagination';

const PAGE_SIZE = 12;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

    const { count: total, error: countErr } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('organizer_id', ures.user.id);
    if (countErr) throw countErr;

    const requestedPage = parsePage(req.query?.page);
    const pagination = resolvePagination(requestedPage, PAGE_SIZE, total || 0);

    const { data, error } = await supabase
      .from('events')
      .select('id, title, cover_image_url, starts_at, ends_at, status, created_at')
      .eq('organizer_id', ures.user.id)
      .order('created_at', { ascending: false })
      .range(pagination.from, pagination.to);
    if (error) throw error;

    return res.status(200).json({
      ok: true,
      items: data || [],
      pagination: { page: pagination.page, pageSize: pagination.pageSize, total: pagination.total, totalPages: pagination.totalPages },
    });
  } catch (e) {
    console.error('[api/events/mine] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
