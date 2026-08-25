// src/pages/api/events/[id]/staff/index.js
// EVENT-4 — gestión de personal de acceso. Owner-only en ambos métodos:
// "Solo owner gestiona staff" (docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md).
// GET: listado completo (incluye revoked, para que el owner pueda ver
// historial y reactivar). POST: alta de un colaborador `door` — nunca
// acepta un user_id directamente del cliente ("no aceptar user_id
// arbitrario sin validación"); siempre resuelve por email real vía
// find_user_id_by_email (SECURITY DEFINER, service_role-only). Sin
// búsqueda pública de usuarios: este endpoint nunca devuelve un listado
// de candidatos, solo éxito/error sobre UN email exacto.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';

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
  const { id: eventId } = req.query || {};
  if (!eventId) return res.status(400).json({ ok: false, error: 'missing_event_id' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const ip = resolveClientIp(req);
    if (await enforceRateLimit(req, res, { key: `events-staff:${user.id}:${eventId}`, maxHits: 30, windowSeconds: 60 })) return;

    const { data: event, error: evErr } = await supabase
      .from('events')
      .select('id, organizer_id')
      .eq('id', eventId)
      .maybeSingle();
    if (evErr) throw evErr;
    if (!event) return res.status(404).json({ ok: false, error: 'not_found' });
    if (event.organizer_id !== user.id) return res.status(403).json({ ok: false, error: 'not_your_event' });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('event_staff')
        .select('id, user_id, role, status, user_email_snapshot, created_at, updated_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, items: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || email.length > 200 || !email.includes('@')) {
        return res.status(400).json({ ok: false, error: 'invalid_email' });
      }
      // V1: único rol soportado es 'door' — mismo criterio explícito del
      // documento canónico ("No RBAC empresarial").
      const role = 'door';

      const { data: resolvedUserId, error: findErr } = await supabase.rpc('find_user_id_by_email', { p_email: email });
      if (findErr) throw findErr;
      if (!resolvedUserId) return res.status(404).json({ ok: false, error: 'user_not_found' });

      if (resolvedUserId === event.organizer_id) {
        return res.status(409).json({ ok: false, error: 'already_organizer' });
      }

      const { data: existing, error: exErr } = await supabase
        .from('event_staff')
        .select('id, status')
        .eq('event_id', eventId)
        .eq('user_id', resolvedUserId)
        .maybeSingle();
      if (exErr) throw exErr;

      if (existing) {
        if (existing.status === 'active') {
          return res.status(409).json({ ok: false, error: 'already_staff' });
        }
        // Reactivar un colaborador previamente revocado, en vez de crear
        // una segunda fila para el mismo (event_id, user_id) — el UNIQUE
        // de la tabla lo impediría de todos modos.
        const { data: reactivated, error: reErr } = await supabase
          .from('event_staff')
          .update({ status: 'active', user_email_snapshot: email, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (reErr) throw reErr;
        return res.status(200).json({ ok: true, staff: reactivated });
      }

      const { data: created, error: insErr } = await supabase
        .from('event_staff')
        .insert({ event_id: eventId, user_id: resolvedUserId, role, status: 'active', user_email_snapshot: email })
        .select('*')
        .single();
      if (insErr) throw insErr;

      return res.status(201).json({ ok: true, staff: created });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/events/[id]/staff] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
