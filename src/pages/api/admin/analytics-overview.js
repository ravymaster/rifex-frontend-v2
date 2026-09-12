// src/pages/api/admin/analytics-overview.js
// Segunda mitad del mandato de analítica: métricas por módulo
// (Rifas/Campañas/Eventos/Inscripciones/Medidor QR) + visitas/interacción
// propias. Mismo criterio "cero cifras inventadas" que
// src/pages/api/admin/metrics.js:
//
// - Conteos de entidades: leídos DIRECTO de la tabla de cada módulo
//   (raffles/colectas/events/registration_activities/medidores_qr).
// - Visitas/interacción: leídas DIRECTO de analytics_events, agrupadas
//   en memoria (volumen esperado bajo, mismo criterio de límite duro que
//   src/lib/eventAnalytics.js#ANALYTICS_LIMITS).
// - "Pagos aprobados"/conversión: leídos DIRECTO de las tablas de pago ya
//   autoritativas (payments/colecta_contributions/event_orders) — NUNCA
//   de analytics_events, que ni siquiera admite el event_type
//   "payment_approved" (ver db/migrations/2026-09-12_admin_analytics_v1.sql).
// - Medidor QR: NUNCA se le pide nada a analytics_events — su propia
//   instrumentación (medidor_qr_visits/responses/destination_clicks +
//   medidores_qr.scan_count) ya es la autoridad, desde 2026-09-08.
import { createClient } from "@supabase/supabase-js";
import { resolveAdmin } from "@/lib/adminAuth";
import { ANALYTICS_MODULES, ANALYTICS_EVENT_TYPES } from "@/lib/analyticsEvents";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Mismo criterio de tope duro que src/lib/eventAnalytics.js: un dashboard
// admin no necesita agregar sin límite, y evita una query descontrolada
// si algún módulo crece mucho antes de que exista una RPC de agregación.
const MAX_ANALYTICS_ROWS = 20000;
const DAY_MS = 86400000;

function resolveRange(query) {
  const now = new Date();
  let from;
  if (query.from) {
    const d = new Date(query.from);
    if (!isNaN(d.getTime())) from = d;
  }
  if (!from) {
    if (query.range === "today") {
      from = new Date(now);
      from.setUTCHours(0, 0, 0, 0);
    } else if (query.range === "7d") {
      from = new Date(now.getTime() - 7 * DAY_MS);
    } else {
      from = new Date(now.getTime() - 30 * DAY_MS); // default: 30d
    }
  }
  let to = now;
  if (query.to) {
    const d = new Date(query.to);
    if (!isNaN(d.getTime())) to = d;
  }
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

async function countRows(table, filters = {}) {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function countRowsInRange(table, dateCol, fromIso, toIso, filters = {}) {
  let q = supabase.from(table).select("id", { count: "exact", head: true }).gte(dateCol, fromIso).lte(dateCol, toIso);
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function entityCounts(table, statusCol, activeValues) {
  const [total, active] = await Promise.all([
    countRows(table),
    Promise.all(activeValues.map((v) => countRows(table, { [statusCol]: v }))).then((arr) => arr.reduce((a, b) => a + b, 0)),
  ]);
  return { total, active };
}

async function analyticsForModule(mod, fromIso, toIso) {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("entity_id,event_type,visitor_id")
    .eq("module", mod)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .limit(MAX_ANALYTICS_ROWS);
  if (error) throw error;

  const rows = data || [];
  const byEventType = Object.fromEntries(ANALYTICS_EVENT_TYPES.map((t) => [t, 0]));
  const visitors = new Set();
  const pageViewsByEntity = new Map();

  for (const r of rows) {
    if (byEventType[r.event_type] != null) byEventType[r.event_type] += 1;
    if (r.visitor_id) visitors.add(r.visitor_id);
    if (r.event_type === "page_view" && r.entity_id) {
      pageViewsByEntity.set(r.entity_id, (pageViewsByEntity.get(r.entity_id) || 0) + 1);
    }
  }

  return {
    events_by_type: byEventType,
    unique_visitors: visitors.size,
    truncated: rows.length >= MAX_ANALYTICS_ROWS,
    page_views_by_entity: pageViewsByEntity,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const auth = await resolveAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const { fromIso, toIso } = resolveRange(req.query || {});
  const requestedModule = typeof req.query.module === "string" ? req.query.module : null;

  try {
    const modules = {};

    // ---- Rifas ----
    if (!requestedModule || requestedModule === "raffle") {
      const [entities, newInRange, analytics, approvedPayments] = await Promise.all([
        entityCounts("raffles", "status", ["active"]),
        countRowsInRange("raffles", "created_at", fromIso, toIso),
        analyticsForModule("raffle", fromIso, toIso),
        supabase.from("payments").select("amount_cents").eq("status", "approved").gte("created_at", fromIso).lte("created_at", toIso),
      ]);
      if (approvedPayments.error) throw approvedPayments.error;
      modules.raffle = {
        entities: { total: entities.total, active: entities.active, new_in_range: newInRange },
        analytics: { events_by_type: analytics.events_by_type, unique_visitors: analytics.unique_visitors, truncated: analytics.truncated },
        payments_approved_in_range: {
          count: (approvedPayments.data || []).length,
          amount_cents: (approvedPayments.data || []).reduce((s, p) => s + Number(p.amount_cents || 0), 0),
        },
        top_entities: [...analytics.page_views_by_entity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([entity_id, page_views]) => ({ entity_id, page_views })),
      };
    }

    // ---- Campañas ----
    if (!requestedModule || requestedModule === "campaign") {
      const [entities, newInRange, analytics, approvedContribs] = await Promise.all([
        entityCounts("colectas", "status", ["active"]),
        countRowsInRange("colectas", "created_at", fromIso, toIso),
        analyticsForModule("campaign", fromIso, toIso),
        supabase.from("colecta_contributions").select("amount_cents").eq("status", "approved").gte("created_at", fromIso).lte("created_at", toIso),
      ]);
      if (approvedContribs.error) throw approvedContribs.error;
      modules.campaign = {
        entities: { total: entities.total, active: entities.active, new_in_range: newInRange },
        analytics: { events_by_type: analytics.events_by_type, unique_visitors: analytics.unique_visitors, truncated: analytics.truncated },
        payments_approved_in_range: {
          count: (approvedContribs.data || []).length,
          amount_cents: (approvedContribs.data || []).reduce((s, c) => s + Number(c.amount_cents || 0), 0),
        },
        top_entities: [...analytics.page_views_by_entity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([entity_id, page_views]) => ({ entity_id, page_views })),
      };
    }

    // ---- Eventos ----
    if (!requestedModule || requestedModule === "event") {
      const [entities, newInRange, analytics, paidOrders] = await Promise.all([
        entityCounts("events", "status", ["published"]),
        countRowsInRange("events", "created_at", fromIso, toIso),
        analyticsForModule("event", fromIso, toIso),
        supabase.from("event_orders").select("total_cents").eq("status", "paid").gte("created_at", fromIso).lte("created_at", toIso),
      ]);
      if (paidOrders.error) throw paidOrders.error;
      modules.event = {
        entities: { total: entities.total, active: entities.active, new_in_range: newInRange },
        analytics: { events_by_type: analytics.events_by_type, unique_visitors: analytics.unique_visitors, truncated: analytics.truncated },
        payments_approved_in_range: {
          count: (paidOrders.data || []).length,
          amount_cents: (paidOrders.data || []).reduce((s, o) => s + Number(o.total_cents || 0), 0),
        },
        top_entities: [...analytics.page_views_by_entity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([entity_id, page_views]) => ({ entity_id, page_views })),
      };
    }

    // ---- Inscripciones (sin pagos: módulo gratuito por diseño) ----
    if (!requestedModule || requestedModule === "registration") {
      const [entities, newInRange, analytics, registrationsInRange] = await Promise.all([
        entityCounts("registration_activities", "status", ["active"]),
        countRowsInRange("registration_activities", "created_at", fromIso, toIso),
        analyticsForModule("registration", fromIso, toIso),
        countRowsInRange("registration_participants", "registered_at", fromIso, toIso),
      ]);
      modules.registration = {
        entities: { total: entities.total, active: entities.active, new_in_range: newInRange },
        analytics: { events_by_type: analytics.events_by_type, unique_visitors: analytics.unique_visitors, truncated: analytics.truncated },
        registrations_in_range: registrationsInRange,
        top_entities: [...analytics.page_views_by_entity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([entity_id, page_views]) => ({ entity_id, page_views })),
      };
    }

    // ---- Medidor QR (nunca lee analytics_events: instrumentación propia ya existente) ----
    if (!requestedModule || requestedModule === "medidor_qr") {
      const [entities, newInRange, visitsInRange, responsesInRange, clicksInRange, scanSumRes] = await Promise.all([
        entityCounts("medidores_qr", "status", ["active"]),
        countRowsInRange("medidores_qr", "created_at", fromIso, toIso),
        countRowsInRange("medidor_qr_visits", "created_at", fromIso, toIso),
        countRowsInRange("medidor_qr_responses", "created_at", fromIso, toIso),
        countRowsInRange("medidor_qr_destination_clicks", "created_at", fromIso, toIso),
        supabase.from("medidores_qr").select("scan_count"),
      ]);
      if (scanSumRes.error) throw scanSumRes.error;
      modules.medidor_qr = {
        entities: { total: entities.total, active: entities.active, new_in_range: newInRange },
        scan_count_total: (scanSumRes.data || []).reduce((s, m) => s + Number(m.scan_count || 0), 0),
        visits_in_range: visitsInRange,
        responses_in_range: responsesInRange,
        destination_clicks_in_range: clicksInRange,
      };
    }

    return res.status(200).json({
      ok: true,
      range: { from: fromIso, to: toIso },
      available_modules: ANALYTICS_MODULES,
      modules,
    });
  } catch (e) {
    console.error("[api/admin/analytics-overview] error", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
