// tests/eventAnalytics.test.mjs
// EVENT-5 — pruebas de las fórmulas puras de src/lib/eventAnalytics.js.
// Cubre específicamente las dos correcciones exigidas antes del GO:
//   1. approved_unfulfilled es dinero real (aprobado + comisión cobrada),
//      nunca excluido silenciosamente de las cifras "totales" — solo de
//      "cumplida".
//   2. un ticket void puede tener used_at (hallazgo real de
//      void_event_ticket, que nunca lo protege ni lo limpia) — debe
//      reportarse explícitamente, nunca ocultarse dentro de "Anuladas".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEventAnalyticsSummary,
  formatEventDateTime,
  neutralizeFormulaInjection,
  sanitizeFilename,
  checkAnalyticsLimits,
  ANALYTICS_LIMITS,
} from '../src/lib/eventAnalytics.js';

function baseEvent(overrides = {}) {
  return {
    id: 'ev-1',
    organizer_id: 'org-1',
    title: 'Evento de prueba',
    status: 'published',
    starts_at: '2026-09-01T20:00:00.000Z',
    ends_at: '2026-09-02T02:00:00.000Z',
    timezone: 'America/Santiago',
    ...overrides,
  };
}

test('modelo financiero: approved_unfulfilled cuenta en aprobada total y comisión, no en cumplida', () => {
  const data = {
    event: baseEvent(),
    ticketTypes: [{ id: 'tt1', name: 'General', quantity_total: 100, quantity_sold: 2, quantity_reserved: 0 }],
    orders: [
      { id: 'o1', status: 'paid', currency: 'CLP', total_cents: 10000, platform_fee_cents: 700, refund_required: false, paid_at: '2026-08-20T12:00:00.000Z', created_at: '2026-08-20T11:00:00.000Z' },
      { id: 'o2', status: 'approved_unfulfilled', currency: 'CLP', total_cents: 10000, platform_fee_cents: 700, refund_required: false, paid_at: '2026-08-21T12:00:00.000Z', created_at: '2026-08-21T11:00:00.000Z' },
      { id: 'o3', status: 'pending', currency: 'CLP', total_cents: 5000, platform_fee_cents: 350, refund_required: false, paid_at: null, created_at: '2026-08-22T11:00:00.000Z' },
    ],
    orderItems: [],
    tickets: [],
    checkins: [],
    staff: [],
  };
  const s = computeEventAnalyticsSummary(data);

  // aprobada total = paid + approved_unfulfilled = 10000 + 10000
  assert.equal(s.financial.gross_approved_total_cents, 20000);
  // cumplida = solo paid
  assert.equal(s.financial.gross_fulfilled_cents, 10000);
  // aprobada sin emitir = solo approved_unfulfilled
  assert.equal(s.financial.gross_unfulfilled_cents, 10000);
  // comisión total = comisión de paid + approved_unfulfilled (nunca excluida)
  assert.equal(s.financial.commission_total_cents, 1400);
  assert.equal(s.financial.commission_unfulfilled_cents, 700);
  // pending NUNCA entra en ninguna cifra financiera "aprobada"
  assert.equal(s.financial.net_estimated_cents, 20000 - 1400);
  assert.equal(s.analytics.approved_unfulfilled_alert, true);
});

test('modelo financiero: sin approved_unfulfilled, la alerta queda en false y ambas cifras coinciden', () => {
  const data = {
    event: baseEvent(),
    ticketTypes: [],
    orders: [
      { id: 'o1', status: 'paid', currency: 'CLP', total_cents: 10000, platform_fee_cents: 700, refund_required: false, paid_at: '2026-08-20T12:00:00.000Z', created_at: '2026-08-20T11:00:00.000Z' },
    ],
    orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.financial.gross_approved_total_cents, s.financial.gross_fulfilled_cents);
  assert.equal(s.financial.gross_unfulfilled_cents, 0);
  assert.equal(s.analytics.approved_unfulfilled_alert, false);
});

test('modelo operacional: ticket void con used_at se reporta explícitamente, nunca oculto', () => {
  const data = {
    event: baseEvent(),
    ticketTypes: [{ id: 'tt1', name: 'General', quantity_total: 10, quantity_sold: 3, quantity_reserved: 0 }],
    orders: [],
    orderItems: [],
    tickets: [
      // ticket normal, válido, no ingresado
      { id: 't1', order_id: 'o1', ticket_type_id: 'tt1', ticket_type_name_snapshot: 'General', ticket_number: 'A1', status: 'valid', issued_at: '2026-08-20T10:00:00.000Z', used_at: null },
      // ticket válido, ya ingresado
      { id: 't2', order_id: 'o1', ticket_type_id: 'tt1', ticket_type_name_snapshot: 'General', ticket_number: 'A2', status: 'valid', issued_at: '2026-08-20T10:00:00.000Z', used_at: '2026-08-25T10:00:00.000Z' },
      // hallazgo real: void_event_ticket nunca limpia used_at — anulado DESPUÉS de haber ingresado
      { id: 't3', order_id: 'o1', ticket_type_id: 'tt1', ticket_type_name_snapshot: 'General', ticket_number: 'A3', status: 'void', issued_at: '2026-08-20T10:00:00.000Z', used_at: '2026-08-24T10:00:00.000Z' },
      // anulado sin haber sido usado nunca
      { id: 't4', order_id: 'o1', ticket_type_id: 'tt1', ticket_type_name_snapshot: 'General', ticket_number: 'A4', status: 'void', issued_at: '2026-08-20T10:00:00.000Z', used_at: null },
    ],
    checkins: [],
    staff: [],
  };
  const s = computeEventAnalyticsSummary(data);

  assert.equal(s.operational.emitted_total, 4, 'emitidas totales incluye TODAS las filas, incluidas void');
  assert.equal(s.operational.valid, 2, 'válidas excluye ambas void');
  assert.equal(s.operational.voided, 2);
  assert.equal(s.operational.voided_used_before_void, 1, 'exactamente el ticket t3 fue usado antes de anularse');
  assert.equal(s.operational.checked_in, 1, 'ingresadas cuenta solo válidas con used_at (t2), nunca t3 aunque tenga used_at');
  assert.equal(s.operational.pending_check_in, 1, 'solo t1 es válida y sin ingresar');
  assert.equal(s.operational.attendance_rate, 1 / 2);
});

test('% asistencia con cero válidas retorna null, nunca NaN/Infinity', () => {
  const data = { event: baseEvent(), ticketTypes: [], orders: [], orderItems: [], tickets: [], checkins: [], staff: [] };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.operational.attendance_rate, null);
  assert.equal(Number.isNaN(s.operational.attendance_rate), false);
});

test('refund_required se cuenta y se suma explícitamente, nunca oculto', () => {
  const data = {
    event: baseEvent(),
    ticketTypes: [],
    orders: [
      { id: 'o1', status: 'paid', currency: 'CLP', total_cents: 15000, platform_fee_cents: 1000, refund_required: true, paid_at: '2026-08-20T12:00:00.000Z', created_at: '2026-08-20T11:00:00.000Z' },
      { id: 'o2', status: 'paid', currency: 'CLP', total_cents: 5000, platform_fee_cents: 350, refund_required: false, paid_at: '2026-08-20T12:00:00.000Z', created_at: '2026-08-20T11:00:00.000Z' },
    ],
    orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.financial.refund_required_count, 1);
  assert.equal(s.financial.refund_required_cents, 15000);
});

test('evento cancelado sigue siendo consultable — computeEventAnalyticsSummary nunca lanza ni omite datos', () => {
  const data = {
    event: baseEvent({ status: 'cancelled' }),
    ticketTypes: [{ id: 'tt1', name: 'General', quantity_total: 10, quantity_sold: 1, quantity_reserved: 0 }],
    orders: [{ id: 'o1', status: 'paid', currency: 'CLP', total_cents: 10000, platform_fee_cents: 700, refund_required: true, paid_at: '2026-08-20T12:00:00.000Z', created_at: '2026-08-20T11:00:00.000Z' }],
    orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.event.status, 'cancelled');
  assert.equal(s.analytics.event_cancelled, true);
  assert.equal(s.financial.gross_approved_total_cents, 10000);
});

test('desglose por tipo de entrada agrega correctamente por ticket_type_id/name', () => {
  const data = {
    event: baseEvent(),
    ticketTypes: [
      { id: 'tt1', name: 'General', quantity_total: 100, quantity_sold: 2, quantity_reserved: 0 },
      { id: 'tt2', name: 'VIP', quantity_total: 20, quantity_sold: 1, quantity_reserved: 0 },
    ],
    orders: [],
    orderItems: [
      { order_id: 'o1', quantity: 2, ticket_type_name_snapshot: 'General' },
      { order_id: 'o2', quantity: 1, ticket_type_name_snapshot: 'VIP' },
    ],
    tickets: [
      { id: 't1', order_id: 'o1', ticket_type_id: 'tt1', ticket_type_name_snapshot: 'General', ticket_number: 'A1', status: 'valid', issued_at: '2026-08-20T10:00:00.000Z', used_at: '2026-08-20T11:00:00.000Z' },
      { id: 't2', order_id: 'o1', ticket_type_id: 'tt1', ticket_type_name_snapshot: 'General', ticket_number: 'A2', status: 'valid', issued_at: '2026-08-20T10:00:00.000Z', used_at: null },
      { id: 't3', order_id: 'o2', ticket_type_id: 'tt2', ticket_type_name_snapshot: 'VIP', ticket_number: 'A3', status: 'valid', issued_at: '2026-08-20T10:00:00.000Z', used_at: null },
    ],
    checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  const general = s.analytics.by_ticket_type.find((t) => t.name === 'General');
  const vip = s.analytics.by_ticket_type.find((t) => t.name === 'VIP');
  assert.equal(general.ordered_quantity, 2);
  assert.equal(general.emitted_total, 2);
  assert.equal(general.checked_in, 1);
  assert.equal(vip.ordered_quantity, 1);
  assert.equal(vip.emitted_total, 1);
  assert.equal(vip.checked_in, 0);
});

test('ventas por fecha y check-ins por hora se agrupan en la zona horaria del evento, no en UTC', () => {
  // 2026-08-20T02:30 UTC = 2026-08-19T22:30 en America/Santiago (UTC-4 en agosto).
  const data = {
    event: baseEvent({ timezone: 'America/Santiago' }),
    ticketTypes: [],
    orders: [
      { id: 'o1', status: 'paid', currency: 'CLP', total_cents: 1000, platform_fee_cents: 70, refund_required: false, paid_at: '2026-08-20T02:30:00.000Z', created_at: '2026-08-20T02:30:00.000Z' },
    ],
    orderItems: [],
    tickets: [{ id: 't1', order_id: 'o1', ticket_type_id: 'tt1', ticket_type_name_snapshot: 'General', ticket_number: 'A1', status: 'valid', issued_at: '2026-08-20T02:30:00.000Z', used_at: null }],
    checkins: [{ id: 'c1', ticket_id: 't1', checked_in_by: 'org-1', checked_in_at: '2026-08-20T02:30:00.000Z' }],
    staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.analytics.sales_by_date[0].date, '2026-08-19', 'la fecha en zona Santiago debe ser el día anterior a la fecha UTC');
  assert.equal(s.analytics.checkins_by_hour[0].hour, '2026-08-19 22:00', 'la hora debe estar en zona Santiago, no UTC');
});

test('formatEventDateTime es determinista independiente del timezone del proceso', () => {
  const out = formatEventDateTime('2026-08-26T15:30:45.000Z', 'America/Santiago');
  assert.equal(out, '26-08-2026 11:30:45');
  assert.equal(formatEventDateTime(null, 'America/Santiago'), '');
  assert.equal(formatEventDateTime('not-a-date', 'America/Santiago'), '');
});

test('neutralizeFormulaInjection neutraliza = + - @ tab y CR, deja intacto texto normal', () => {
  assert.equal(neutralizeFormulaInjection('=1+1'), "'=1+1");
  assert.equal(neutralizeFormulaInjection('+SUM(A1)'), "'+SUM(A1)");
  assert.equal(neutralizeFormulaInjection('-1'), "'-1");
  assert.equal(neutralizeFormulaInjection('@cmd'), "'@cmd");
  assert.equal(neutralizeFormulaInjection('\tmalicious'), "'\tmalicious");
  assert.equal(neutralizeFormulaInjection('Juan Pérez'), 'Juan Pérez');
  assert.equal(neutralizeFormulaInjection(''), '');
  assert.equal(neutralizeFormulaInjection(null), '');
  assert.equal(neutralizeFormulaInjection(undefined), '');
});

test('sanitizeFilename produce un nombre seguro, nunca vacío, con longitud acotada', () => {
  assert.equal(sanitizeFilename('Fiesta / Año 2026 "especial"'), 'Fiesta Ano 2026 especial');
  assert.equal(sanitizeFilename(''), 'evento');
  assert.equal(sanitizeFilename(null), 'evento');
  assert.equal(sanitizeFilename('a'.repeat(200)).length, 80);
  assert.doesNotMatch(sanitizeFilename('émojis 🎉🎊 y símbolos ¡!¿?'), /[^\w \-]/);
});

test('checkAnalyticsLimits: dentro de todos los límites -> ok', async () => {
  const fakeSupabase = {
    from() {
      return { select: () => ({ eq: () => Promise.resolve({ count: 10, error: null }) }) };
    },
  };
  const result = await checkAnalyticsLimits(fakeSupabase, 'ev-1');
  assert.deepEqual(result, { ok: true });
});

test('checkAnalyticsLimits: orders excede su límite -> rechaza con el motivo exacto, orden fijo (orders primero)', async () => {
  const fakeSupabase = {
    from(table) {
      return {
        select: () => ({
          eq: () => Promise.resolve({
            count: table === 'event_orders' ? ANALYTICS_LIMITS.MAX_ORDERS + 1 : 5,
            error: null,
          }),
        }),
      };
    },
  };
  const result = await checkAnalyticsLimits(fakeSupabase, 'ev-1');
  assert.equal(result.ok, false);
  assert.equal(result.limit, 'orders');
  assert.equal(result.count, ANALYTICS_LIMITS.MAX_ORDERS + 1);
  assert.equal(result.max, ANALYTICS_LIMITS.MAX_ORDERS);
});

test('checkAnalyticsLimits: exactamente en el límite de cada tabla no rechaza — solo > límite rechaza', async () => {
  const maxByTable = {
    event_orders: ANALYTICS_LIMITS.MAX_ORDERS,
    event_tickets: ANALYTICS_LIMITS.MAX_TICKETS,
    event_checkins: ANALYTICS_LIMITS.MAX_CHECKINS,
    event_staff: ANALYTICS_LIMITS.MAX_STAFF,
  };
  const fakeSupabase = {
    from(table) {
      return { select: () => ({ eq: () => Promise.resolve({ count: maxByTable[table], error: null }) }) };
    },
  };
  const result = await checkAnalyticsLimits(fakeSupabase, 'ev-1');
  assert.equal(result.ok, true);
});

test('checkAnalyticsLimits: staff excede su límite propio (500), independiente de los otros tres', async () => {
  const fakeSupabase = {
    from(table) {
      return {
        select: () => ({
          eq: () => Promise.resolve({
            count: table === 'event_staff' ? ANALYTICS_LIMITS.MAX_STAFF + 1 : 5,
            error: null,
          }),
        }),
      };
    },
  };
  const result = await checkAnalyticsLimits(fakeSupabase, 'ev-1');
  assert.equal(result.ok, false);
  assert.equal(result.limit, 'staff');
  assert.equal(result.max, 500);
});

// ---- EVENT-8: aforo (events.capacity), nunca colapsado con "capacity" ----
// ("suma de quantity_total configurado", ya certificado en EVENT-5).

test('EVENT-8 · event_capacity es un campo DISTINTO de capacity (suma de tipos) — nunca se pisan entre sí', () => {
  const data = {
    event: baseEvent({ capacity: 10 }),
    ticketTypes: [{ id: 'tt1', name: 'General', status: 'active', quantity_total: 100, quantity_sold: 2, quantity_reserved: 0 }],
    orders: [], orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.operational.event_capacity, 10, 'aforo real del evento');
  assert.equal(s.operational.capacity, 100, 'capacidad configurada en tipos — sin tocar, contrato EVENT-5 intacto');
});

test('EVENT-8 · event_capacity es null cuando el evento no lo definió ("sin aforo definido", nunca 0 ni inventado)', () => {
  const data = {
    event: baseEvent({ capacity: null }),
    ticketTypes: [],
    orders: [], orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.operational.event_capacity, null);
});

test('EVENT-8 · event_capacity es null cuando el campo directamente no viene en la fila (undefined -> null, nunca undefined en el JSON)', () => {
  const data = {
    event: baseEvent(),
    ticketTypes: [],
    orders: [], orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.operational.event_capacity, null);
});

test('EVENT-8 · available_to_sell suma solo tipos ACTIVOS (total-sold-reserved), nunca capacity-sold', () => {
  const data = {
    event: baseEvent({ capacity: 100 }), // aforo con margen sin asignar a ningún tipo — no debe filtrarse a available_to_sell
    ticketTypes: [
      { id: 'tt1', name: 'General', status: 'active', quantity_total: 10, quantity_sold: 6, quantity_reserved: 1 },
      { id: 'tt2', name: 'VIP', status: 'active', quantity_total: 5, quantity_sold: 5, quantity_reserved: 0 },
    ],
    orders: [], orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  // General: 10-6-1=3 disponibles; VIP: 5-5-0=0 disponibles. Total: 3.
  // NUNCA 100-11=89 (eso ignoraría el aforo sin asignar a ningún tipo).
  assert.equal(s.operational.available_to_sell, 3);
});

test('EVENT-8 · available_to_sell excluye tipos ocultos — no son vendibles aunque tengan cupo libre', () => {
  const data = {
    event: baseEvent({ capacity: null }),
    ticketTypes: [
      { id: 'tt1', name: 'General', status: 'active', quantity_total: 10, quantity_sold: 10, quantity_reserved: 0 },
      { id: 'tt2', name: 'Backstage', status: 'hidden', quantity_total: 50, quantity_sold: 0, quantity_reserved: 0 },
    ],
    orders: [], orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.operational.available_to_sell, 0, 'General agotado; Backstage oculto no cuenta como vendible');
});

test('EVENT-8 · available_to_sell nunca queda negativo cuando sold+reserved excede total por algún dato transitorio', () => {
  const data = {
    event: baseEvent(),
    ticketTypes: [{ id: 'tt1', name: 'General', status: 'active', quantity_total: 5, quantity_sold: 5, quantity_reserved: 1 }],
    orders: [], orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.operational.available_to_sell, 0);
});

test('EVENT-8 · by_ticket_type incluye "available" por tipo, calculado igual que el agregado', () => {
  const data = {
    event: baseEvent(),
    ticketTypes: [
      { id: 'tt1', name: 'General', status: 'active', quantity_total: 10, quantity_sold: 4, quantity_reserved: 2 },
    ],
    orders: [], orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.analytics.by_ticket_type[0].available, 4);
  assert.equal(s.analytics.by_ticket_type[0].status, 'active');
});
