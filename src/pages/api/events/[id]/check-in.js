// src/pages/api/events/[id]/check-in.js
// EVENT-4 — único punto de entrada que puede ejecutar check-in.
//
// GET: "ping" de autorización + datos mínimos del evento para que el
// scanner pueda mostrar su UI sin exponer el listado de staff. No es la
// autoridad de seguridad real (esa es la RPC) — solo evita que un
// usuario no autorizado vea la pantalla de escaneo.
//
// POST: ejecuta el check-in real. Acepta { qr_token } (escaneo normal) o
// { ticket_number } (fallback manual, staff-only, resuelto server-side y
// acotado a este evento — nunca un endpoint público de check-in por
// ticket_number). Ambos caminos terminan en la MISMA autoridad atómica:
// la RPC check_in_event_ticket. Nunca acepta desde el cliente ticket
// status, used_at, owner, checked_in_by, resultado ni timestamp — todo
// eso lo decide y devuelve la RPC.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { canCheckIn } from '@/lib/eventStaffAuth';

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

// EVENT-8: contador de asistencia en vivo — SIEMPRE deriva de
// event_tickets.used_at (la misma autoridad de consumo que escribe
// check_in_event_ticket, la misma que ya usa orders-summary.js/
// eventAnalytics.js para "Ingresaron"). Nunca un contador mutable en
// event_staff/events — nunca una segunda fuente de verdad. Reutiliza el
// índice parcial event_tickets_used_at_idx creado en EVENT-4 justo para
// este conteo.
async function fetchAttendance(eventId) {
  const [{ count: checkedIn, error: ciErr }, { data: ev, error: evErr }] = await Promise.all([
    supabase.from('event_tickets').select('id', { count: 'exact', head: true }).eq('event_id', eventId).not('used_at', 'is', null),
    supabase.from('events').select('capacity').eq('id', eventId).maybeSingle(),
  ]);
  if (ciErr) throw ciErr;
  if (evErr) throw evErr;
  return { checked_in: checkedIn || 0, event_capacity: ev?.capacity ?? null };
}

// Mapa de los códigos de error de la RPC a HTTP status — la RPC decide
// QUÉ pasó, esta función solo lo traduce a un status HTTP razonable.
const ERROR_STATUS = {
  missing_actor: 401,
  missing_event: 400,
  invalid_token: 400,
  ticket_not_found: 404,
  ticket_wrong_event: 409,
  event_not_found: 404,
  not_authorized: 403,
  event_cancelled: 409,
  ticket_void: 409,
  already_used: 409,
};

export default async function handler(req, res) {
  const { id: eventId } = req.query || {};
  if (!eventId) return res.status(400).json({ ok: false, error: 'missing_event_id' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    if (req.method === 'GET') {
      const ip = resolveClientIp(req);
      if (await enforceRateLimit(req, res, { key: `events-checkin-ping:${user.id}:${eventId}`, maxHits: 60, windowSeconds: 60 })) return;

      const { data: event, error: evErr } = await supabase
        .from('events')
        .select('id, title, status')
        .eq('id', eventId)
        .maybeSingle();
      if (evErr) throw evErr;
      if (!event) return res.status(404).json({ ok: false, error: 'not_found' });

      const authorized = await canCheckIn(supabase, eventId, user.id);
      const attendance = authorized ? await fetchAttendance(eventId) : null;
      return res.status(200).json({
        ok: true,
        authorized,
        event: { id: event.id, title: event.title, status: event.status },
        attendance,
      });
    }

    if (req.method === 'POST') {
      const ip = resolveClientIp(req);
      // Suficientemente alto para una puerta real (varios escaneos por
      // segundo en ráfaga de fila), acotado por staff+evento — nunca
      // Redis, misma infraestructura de rate limit ya certificada.
      if (await enforceRateLimit(req, res, { key: `events-checkin:${user.id}:${eventId}`, maxHits: 180, windowSeconds: 60 })) return;

      const body = req.body || {};
      let qrToken = typeof body.qr_token === 'string' ? body.qr_token.trim() : null;
      const ticketNumber = typeof body.ticket_number === 'string' ? body.ticket_number.trim() : null;

      if (!qrToken && ticketNumber) {
        // Fallback manual: resolución server-side, acotada a este evento
        // (scoped), staff-only por el mismo guard de autenticación de
        // arriba — nunca expone ni acepta el qr_token directamente desde
        // un formulario público.
        if (ticketNumber.length > 40) return res.status(400).json({ ok: false, error: 'invalid_ticket_number' });
        const { data: resolved, error: resErr } = await supabase
          .from('event_tickets')
          .select('qr_token')
          .eq('event_id', eventId)
          .eq('ticket_number', ticketNumber)
          .maybeSingle();
        if (resErr) throw resErr;
        if (!resolved) return res.status(404).json({ ok: false, error: 'ticket_not_found' });
        qrToken = resolved.qr_token;
      }

      if (!qrToken || qrToken.length < 16 || qrToken.length > 200) {
        return res.status(400).json({ ok: false, error: 'invalid_token' });
      }

      const { data: rpcResult, error: rpcErr } = await supabase.rpc('check_in_event_ticket', {
        p_qr_token: qrToken,
        p_actor_user_id: user.id,
        p_event_id: eventId,
      });
      if (rpcErr) throw rpcErr;

      // EVENT-8: se adjunta el contador de asistencia vigente a CUALQUIER
      // resultado (pass, already_used, void, cross-event, etc.) — un
      // refetch liviano tras cada intento de escaneo, nunca un contador
      // local del cliente como autoridad (ver cabecera del archivo y
      // fetchAttendance arriba). Solo un intento fallido antes de la
      // resolución del ticket (missing_actor/invalid_token/etc.) no
      // altera el conteo real, pero igual se informa el valor vigente.
      const attendance = await fetchAttendance(eventId);

      if (!rpcResult?.ok) {
        const status = ERROR_STATUS[rpcResult?.error] || 400;
        return res.status(status).json({ ...rpcResult, attendance });
      }
      return res.status(200).json({ ...rpcResult, attendance });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/events/[id]/check-in] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
