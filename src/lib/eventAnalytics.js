// src/lib/eventAnalytics.js
// EVENT-5 — núcleo puro de fórmulas de analytics de un evento. Única fuente
// de verdad de cada KPI, consumida tanto por el endpoint JSON del dashboard
// (analytics/index.js) como por el generador de XLSX
// (analytics/export.js) — nunca se recalcula la misma fórmula dos veces en
// dos archivos distintos.
//
// PAYMENT STATE (event_orders.status) != FULFILLMENT STATE
// (event_order_items.fulfilled / event_orders.tickets_issued_at) != ACCESS
// STATE (event_tickets.used_at / event_checkins) — misma separación de tres
// capas ya establecida en EVENT-2/3/4. Este módulo nunca colapsa las tres
// en una sola cifra sin rotular explícitamente cuál es cuál.
//
// Evidencia real verificada antes de escribir estas fórmulas (ver
// docs/events/EVENT5_ANALYTICS_XLSX.md para el detalle completo con
// citas de archivo:línea):
//   - mark_event_order_paid (2026-08-24_event2_checkout_orders.sql) solo
//     reconcilia una orden a 'paid'/'approved_unfulfilled' cuando
//     webhook-events.js ya verificó mpStatus === 'approved' Y
//     monto/moneda exactos — ambos estados representan dinero real ya
//     cobrado por Mercado Pago, con marketplace_fee ya aplicado
//     (checkout.js pasa platform_fee_cents como marketplace_fee real).
//   - issue_event_order_tickets (2026-08-25_event3_tickets_qr.sql) exige
//     status='paid' estrictamente — 'approved_unfulfilled' NUNCA emite
//     ningún ticket, sin excepción, sin importar si algún
//     event_order_items.fulfilled quedó true.
//   - void_event_ticket no referencia used_at en ningún punto — un ticket
//     con used_at ya establecido (check-in real) puede anularse sin
//     restricción, y used_at nunca se limpia. "Anulada" y "fue ingresada"
//     no son mutuamente excluyentes en los datos reales.

export const ANALYTICS_LIMITS = Object.freeze({
  MAX_ORDERS: 20000,
  MAX_TICKETS: 20000,
  MAX_CHECKINS: 20000,
  MAX_STAFF: 500,
});

/**
 * Verifica los cuatro límites deterministas ANTES de construir cualquier
 * archivo — mide con COUNT (head:true), nunca cargando las filas primero.
 * Nunca trunca: si algún límite se excede, retorna el primer motivo
 * encontrado (orden fijo: orders, tickets, checkins, staff) para que el
 * mensaje de error sea determinista y testeable.
 * @returns {Promise<{ok: true} | {ok: false, error: string, limit: string, count: number, max: number}>}
 */
export async function checkAnalyticsLimits(supabase, eventId) {
  const checks = [
    { table: 'event_orders', max: ANALYTICS_LIMITS.MAX_ORDERS, limit: 'orders' },
    { table: 'event_tickets', max: ANALYTICS_LIMITS.MAX_TICKETS, limit: 'tickets' },
    { table: 'event_checkins', max: ANALYTICS_LIMITS.MAX_CHECKINS, limit: 'checkins' },
    { table: 'event_staff', max: ANALYTICS_LIMITS.MAX_STAFF, limit: 'staff' },
  ];
  for (const c of checks) {
    const { count, error } = await supabase
      .from(c.table)
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);
    if (error) throw error;
    if ((count || 0) > c.max) {
      return { ok: false, error: 'limit_exceeded', limit: c.limit, count: count || 0, max: c.max };
    }
  }
  return { ok: true };
}

/**
 * Trae todas las filas crudas necesarias para el evento, ya acotadas por
 * los límites verificados en checkAnalyticsLimits. Nunca lee auth.users,
 * nunca lee qr_token/access_token.
 */
export async function fetchEventAnalyticsData(supabase, eventId) {
  const { data: event, error: evErr } = await supabase
    .from('events')
    .select('id, organizer_id, title, status, starts_at, ends_at, timezone, venue_name')
    .eq('id', eventId)
    .maybeSingle();
  if (evErr) throw evErr;
  if (!event) return null;

  const { data: ticketTypes, error: ttErr } = await supabase
    .from('event_ticket_types')
    .select('id, name, quantity_total, quantity_sold, quantity_reserved, price_cents')
    .eq('event_id', eventId);
  if (ttErr) throw ttErr;

  const { data: orders, error: ordErr } = await supabase
    .from('event_orders')
    .select('id, buyer_email, buyer_name, status, currency, subtotal_cents, platform_fee_cents, total_cents, refund_required, paid_at, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (ordErr) throw ordErr;

  // event_order_items no tiene event_id propio — se acota vía el filtro
  // sobre el recurso embebido event_orders (FK order_id -> event_orders.id
  // -> event_id), evitando un IN(...) con hasta 20.000 UUIDs en la URL de
  // PostgREST, que rompería por longitud.
  const { data: orderItems, error: oiErr } = await supabase
    .from('event_order_items')
    .select('order_id, quantity, ticket_type_name_snapshot, event_orders!inner(event_id)')
    .eq('event_orders.event_id', eventId);
  if (oiErr) throw oiErr;

  const { data: tickets, error: tkErr } = await supabase
    .from('event_tickets')
    .select('id, order_id, ticket_type_id, ticket_type_name_snapshot, ticket_number, status, issued_at, used_at')
    .eq('event_id', eventId)
    .order('issued_at', { ascending: true });
  if (tkErr) throw tkErr;

  const { data: checkins, error: ciErr } = await supabase
    .from('event_checkins')
    .select('id, ticket_id, checked_in_by, checked_in_at')
    .eq('event_id', eventId)
    .order('checked_in_at', { ascending: true });
  if (ciErr) throw ciErr;

  const { data: staff, error: stErr } = await supabase
    .from('event_staff')
    .select('id, user_id, role, status, user_email_snapshot, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (stErr) throw stErr;

  return {
    event,
    ticketTypes: ticketTypes || [],
    orders: orders || [],
    orderItems: orderItems || [],
    tickets: tickets || [],
    checkins: checkins || [],
    staff: staff || [],
  };
}

function sum(arr, fn) {
  return arr.reduce((acc, x) => acc + (Number(fn(x)) || 0), 0);
}

/**
 * Calcula el bloque completo de KPIs (operacionales + financieros +
 * analytics de desglose) a partir de los datos crudos de
 * fetchEventAnalyticsData. Pura — sin I/O, testeable con datos mockeados.
 */
export function computeEventAnalyticsSummary(data) {
  const { event, ticketTypes, orders, orderItems, tickets, checkins, staff } = data;

  // ---- Operacional ----
  const capacity = sum(ticketTypes, (t) => t.quantity_total);
  const sold = sum(ticketTypes, (t) => t.quantity_sold);

  const emittedTotal = tickets.length;
  const valid = tickets.filter((t) => t.status !== 'void').length;
  const voided = tickets.filter((t) => t.status === 'void').length;
  // Hallazgo real (ver cabecera del archivo): void_event_ticket no protege
  // un ticket con used_at ya establecido — se reporta explícitamente,
  // nunca se oculta dentro de "Anuladas".
  const voidedUsedBeforeVoid = tickets.filter((t) => t.status === 'void' && t.used_at).length;
  const checkedIn = tickets.filter((t) => t.status !== 'void' && t.used_at).length;
  const pendingCheckIn = tickets.filter((t) => t.status !== 'void' && !t.used_at).length;
  const attendanceRate = valid > 0 ? checkedIn / valid : null;

  // ---- Financiero ----
  const approvedOrders = orders.filter((o) => o.status === 'paid' || o.status === 'approved_unfulfilled');
  const paidOrders = orders.filter((o) => o.status === 'paid');
  const unfulfilledOrders = orders.filter((o) => o.status === 'approved_unfulfilled');

  const grossApprovedTotalCents = sum(approvedOrders, (o) => o.total_cents);
  const grossFulfilledCents = sum(paidOrders, (o) => o.total_cents);
  const grossUnfulfilledCents = sum(unfulfilledOrders, (o) => o.total_cents);
  const commissionTotalCents = sum(approvedOrders, (o) => o.platform_fee_cents);
  const commissionUnfulfilledCents = sum(unfulfilledOrders, (o) => o.platform_fee_cents);
  const netEstimatedCents = grossApprovedTotalCents - commissionTotalCents;
  const refundRequiredCount = orders.filter((o) => o.refund_required).length;
  const refundRequiredCents = sum(orders.filter((o) => o.refund_required), (o) => o.total_cents);

  // ---- Desglose por tipo de entrada ----
  const qtyByOrderTypeName = new Map(); // "type name" -> qty ordered
  for (const it of orderItems) {
    const key = it.ticket_type_name_snapshot;
    qtyByOrderTypeName.set(key, (qtyByOrderTypeName.get(key) || 0) + (Number(it.quantity) || 0));
  }
  const issuedByTypeId = new Map();
  const validByTypeId = new Map();
  const checkedInByTypeId = new Map();
  for (const t of tickets) {
    issuedByTypeId.set(t.ticket_type_id, (issuedByTypeId.get(t.ticket_type_id) || 0) + 1);
    if (t.status !== 'void') {
      validByTypeId.set(t.ticket_type_id, (validByTypeId.get(t.ticket_type_id) || 0) + 1);
      if (t.used_at) checkedInByTypeId.set(t.ticket_type_id, (checkedInByTypeId.get(t.ticket_type_id) || 0) + 1);
    }
  }
  const byTicketType = ticketTypes.map((t) => ({
    id: t.id,
    name: t.name,
    capacity: t.quantity_total,
    sold: t.quantity_sold,
    ordered_quantity: qtyByOrderTypeName.get(t.name) || 0,
    emitted_total: issuedByTypeId.get(t.id) || 0,
    valid: validByTypeId.get(t.id) || 0,
    checked_in: checkedInByTypeId.get(t.id) || 0,
  }));

  // ---- Ventas por fecha, en timezone del evento ----
  const tz = event.timezone || 'America/Santiago';
  const salesByDate = new Map();
  for (const o of approvedOrders) {
    const at = o.paid_at || o.created_at;
    if (!at) continue;
    const dateKey = formatDateInTimeZone(at, tz);
    if (!dateKey) continue;
    const bucket = salesByDate.get(dateKey) || { date: dateKey, orders: 0, gross_cents: 0 };
    bucket.orders += 1;
    bucket.gross_cents += Number(o.total_cents) || 0;
    salesByDate.set(dateKey, bucket);
  }
  const salesByDateSorted = Array.from(salesByDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  // ---- Check-ins por hora, en timezone del evento ----
  const checkinsByHour = new Map();
  for (const c of checkins) {
    const key = formatHourInTimeZone(c.checked_in_at, tz);
    if (!key) continue;
    checkinsByHour.set(key, (checkinsByHour.get(key) || 0) + 1);
  }
  const checkinsByHourSorted = Array.from(checkinsByHour.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  // ---- Actividad de organizer y staff ----
  const checkinsByActor = new Map();
  for (const c of checkins) {
    checkinsByActor.set(c.checked_in_by, (checkinsByActor.get(c.checked_in_by) || 0) + 1);
  }
  const staffActivity = staff.map((s) => ({
    user_id: s.user_id,
    email_snapshot: s.user_email_snapshot || null,
    role: s.role,
    status: s.status,
    is_organizer: false,
    checkins_count: checkinsByActor.get(s.user_id) || 0,
  }));
  staffActivity.push({
    user_id: event.organizer_id,
    email_snapshot: null,
    role: 'organizer',
    status: 'active',
    is_organizer: true,
    checkins_count: checkinsByActor.get(event.organizer_id) || 0,
  });

  return {
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      timezone: tz,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
    },
    operational: {
      capacity,
      sold,
      emitted_total: emittedTotal,
      valid,
      voided,
      voided_used_before_void: voidedUsedBeforeVoid,
      checked_in: checkedIn,
      pending_check_in: pendingCheckIn,
      attendance_rate: attendanceRate,
    },
    financial: {
      currency: orders[0]?.currency || 'CLP',
      gross_approved_total_cents: grossApprovedTotalCents,
      gross_fulfilled_cents: grossFulfilledCents,
      gross_unfulfilled_cents: grossUnfulfilledCents,
      commission_total_cents: commissionTotalCents,
      commission_unfulfilled_cents: commissionUnfulfilledCents,
      net_estimated_cents: netEstimatedCents,
      net_estimated_not_reconciled_with_mp: true,
      refund_required_count: refundRequiredCount,
      refund_required_cents: refundRequiredCents,
    },
    analytics: {
      by_ticket_type: byTicketType,
      sales_by_date: salesByDateSorted,
      checkins_by_hour: checkinsByHourSorted,
      staff_activity: staffActivity,
      approved_unfulfilled_alert: unfulfilledOrders.length > 0,
      refund_required_alert: refundRequiredCount > 0,
      event_cancelled: event.status === 'cancelled',
    },
  };
}

// Hallazgo real de rendimiento (EVENT-5, prueba de estrés con 20.000
// filas): construir un Intl.DateTimeFormat nuevo en CADA llamada de
// formateo — como hacían las tres funciones de abajo originalmente — tomó
// ~29s reales para 20.000 filas (medido con la suite de estrés real,
// nunca asumido). La construcción del formateador (carga de datos de
// locale/timezone) es cara; el propio format() es barato. Cacheando el
// formateador por (timeZone, variante) el mismo escenario baja a
// milisegundos — ver docs/events/EVENT5_ANALYTICS_XLSX.md, sección de
// estrés, para el antes/después medido.
const dateTimeFormatCache = new Map();
function getCachedDateTimeFormat(timeZone, variant) {
  const key = `${timeZone}|${variant}`;
  let dtf = dateTimeFormatCache.get(key);
  if (dtf) return dtf;
  const optionsByVariant = {
    full: { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' },
    date: { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' },
    hour: { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' },
  };
  dtf = new Intl.DateTimeFormat('en-US', optionsByVariant[variant]);
  dateTimeFormatCache.set(key, dtf);
  return dtf;
}

/**
 * Formatea un instante UTC a 'DD-MM-YYYY HH:mm' en una zona IANA
 * explícita, vía Intl.DateTimeFormat — independiente del timezone del
 * proceso (Vercel/servidor) o del Excel del usuario que abra el archivo,
 * porque el valor ya queda escrito como texto en la celda.
 */
export function formatEventDateTime(isoString, timeZone) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const tz = timeZone || 'America/Santiago';
  try {
    const dtf = getCachedDateTimeFormat(tz, 'full');
    const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]));
    const hour = p.hour === '24' ? '00' : p.hour;
    return `${p.day}-${p.month}-${p.year} ${hour}:${p.minute}:${p.second}`;
  } catch {
    return '';
  }
}

function formatDateInTimeZone(isoString, timeZone) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const dtf = getCachedDateTimeFormat(timeZone || 'America/Santiago', 'date');
    const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return null;
  }
}

function formatHourInTimeZone(isoString, timeZone) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const dtf = getCachedDateTimeFormat(timeZone || 'America/Santiago', 'hour');
    const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]));
    const hour = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day} ${hour}:00`;
  } catch {
    return null;
  }
}

/**
 * Neutraliza formula injection: si el valor (proveniente de input de
 * usuario — buyer_name, título de evento, nombre de tipo de entrada)
 * comienza con un carácter que Excel/Sheets interpreta como inicio de
 * fórmula (= + - @), antepone un apóstrofe para forzar texto literal.
 * Tab (\t) y CR (\r) también se consideran, por ser vectores conocidos de
 * la misma clase de ataque en algunos parsers.
 */
export function neutralizeFormulaInjection(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
  return s;
}

/**
 * Sanitiza un título de evento para uso seguro en Content-Disposition:
 * conserva letras/números/espacio/guion/guion_bajo, colapsa espacios,
 * trunca a 80 caracteres, y nunca retorna una cadena vacía.
 */
export function sanitizeFilename(title) {
  const base = String(title || 'evento')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-zA-Z0-9-_ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return base || 'evento';
}
