// src/lib/warp/publicCatalog.js
// Capa de lectura pública de Rifex para el Connector de Warp (SOLO SERVIDOR).
// Es la autoridad de Rifex sobre qué se entrega: Warp nunca consulta la base.
//
//   - Solo lectura: ninguna función escribe, reserva ni inicia pagos.
//   - Solo iniciativas públicas: Eventos `published`, Campañas `active`
//     (y `closed` en el detalle), Inscripciones `active`. Borradores,
//     pausadas, canceladas o eliminadas responden como inexistentes.
//   - Listas cerradas: se piden solo columnas de src/lib/publicInitiativeFields.js
//     (más el id del organizador, usado únicamente en el servidor) y cada
//     respuesta se arma campo por campo. Nunca ids internos, correos,
//     teléfonos, participantes, aportes individuales, órdenes, tickets,
//     staff, check-in ni datos de Mercado Pago.
//   - Identificador público: el slug. Montos en CLP enteros. Fechas tal como
//     las guarda la base (RFC 3339 con zona).
//   - Rifas no forman parte de este catálogo.
import { createClient } from '@supabase/supabase-js';
import {
  PUBLIC_EVENT_COLUMNS,
  PUBLIC_TICKET_TYPE_COLUMNS,
  PUBLIC_ACTIVITY_COLUMNS,
  PUBLIC_COLECTA_COLUMNS,
  toSelect,
} from '../publicInitiativeFields.js';
import { deriveEffectiveStatus } from '../colectaStatus.js';

export const DEFAULT_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 20;
export const MAX_PAGE = 500;
export const MAX_QUERY_LENGTH = 60;
export const SUMMARY_LENGTH = 200;
export const REGISTRATION_MODALITIES = Object.freeze(['presencial', 'online', 'hibrida']);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g;
const QUERY_ALLOWED_RE = /[^\p{L}\p{N}\s'.:!?¿¡&-]/gu;

let client = null;
function db() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// Cualquier fallo de la base se reporta como indisponibilidad genérica:
// el mensaje interno nunca sale hacia el llamador.
function unavailable() {
  return new Error('unavailable');
}

async function run(query) {
  const { data, error, count } = await query;
  if (error) throw unavailable();
  return { data, count };
}

// Página de un listado. Pedir una página más allá del final es válido
// ("mostrar más" llega al final): PostgREST responde rango no satisfacible
// (PGRST103) y aquí se devuelve vacía, con el total real.
async function runPage(build, columns, { from, to }) {
  const { data, error, count } = await build(columns, { count: 'exact' }).range(from, to);
  if (!error) return { rows: data || [], total: count || 0 };
  if (error.code !== 'PGRST103') throw unavailable();
  const { count: total } = await run(build('slug', { count: 'exact', head: true }));
  return { rows: [], total: total || 0 };
}

// ---------------------------------------------------------------------
// Normalización de entradas (el SDK valida tipos; los límites viven aquí)
// ---------------------------------------------------------------------
export function isValidSlug(value) {
  return typeof value === 'string' && SLUG_RE.test(value);
}

export function normalizePaging({ page, pageSize } = {}) {
  const p = Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1;
  const s = Number.isInteger(pageSize) && pageSize >= 1 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page: p, pageSize: s, from: (p - 1) * s, to: p * s - 1 };
}

// Búsqueda textual acotada: sin caracteres de control ni comodines; solo
// letras, números, espacios y puntuación básica; máximo 60 caracteres.
export function normalizeQuery(value) {
  if (typeof value !== 'string') return null;
  const q = value.replace(CONTROL_RE, '').replace(QUERY_ALLOWED_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH).trim();
  return q || null;
}

export function toSummary(text) {
  const plain = String(text ?? '').replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return null;
  return plain.length > SUMMARY_LENGTH ? `${plain.slice(0, SUMMARY_LENGTH - 1).trimEnd()}…` : plain;
}

export function toClp(cents) {
  return Number.isFinite(cents) ? Math.round(cents / 100) : null;
}

// Nombre público del organizador: solo el nombre del perfil público,
// descartado si parece correo, RUT o teléfono (7 o más dígitos).
export function toPublicOrganizerName(value) {
  const name = String(value ?? '').replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim();
  if (!name || name.includes('@') || (name.match(/\d/g) || []).length >= 7) return null;
  return name.length > 60 ? `${name.slice(0, 59)}…` : name;
}

function siteUrl(path) {
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || 'https://rifex.pro').replace(/\/+$/, '');
  return `${base}${path}`;
}

function pageResult(items, { page, pageSize }, total) {
  return { items, page, pageSize, total, totalPages: total > 0 ? Math.ceil(total / pageSize) : 0 };
}

// Vigente: termina en el futuro o, sin fecha de término, empieza en el futuro.
function upcomingFilter(nowIso, startColumn = 'starts_at', endColumn = 'ends_at') {
  return `${endColumn}.gte.${nowIso},and(${endColumn}.is.null,${startColumn}.gte.${nowIso})`;
}

async function organizerNames(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await run(db().from('users_profile').select('user_id, nombre').in('user_id', ids));
  return Object.fromEntries((data || []).map((p) => [p.user_id, toPublicOrganizerName(p.nombre)]));
}

// ---------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------
function ticketAvailable(t) {
  return Math.max(0, (t.quantity_total || 0) - (t.quantity_sold || 0) - (t.quantity_reserved || 0));
}

function ticketOnSale(t, nowMs) {
  if (t.sales_start_at && new Date(t.sales_start_at).getTime() > nowMs) return false;
  if (t.sales_end_at && new Date(t.sales_end_at).getTime() <= nowMs) return false;
  return ticketAvailable(t) > 0;
}

export async function listEvents(args = {}) {
  const paging = normalizePaging(args);
  const query = normalizeQuery(args.query);
  const nowIso = new Date().toISOString();
  const build = (columns, opts) => {
    let q = db()
      .from('events')
      .select(columns, opts)
      .eq('status', 'published')
      .not('slug', 'is', null)
      .or(upcomingFilter(nowIso))
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true });
    if (query) q = q.ilike('title', `%${query}%`);
    return q;
  };
  const { rows, total: count } = await runPage(build, 'id,slug,title,description,cover_image_url,starts_at,ends_at,timezone,venue_name', paging);

  const ids = rows.map((r) => r.id);
  const prices = {};
  if (ids.length) {
    const { data: types } = await run(
      db().from('event_ticket_types').select('event_id,price_cents').in('event_id', ids).eq('status', 'active')
    );
    for (const t of types || []) {
      const clp = toClp(t.price_cents);
      if (clp === null) continue;
      const cur = prices[t.event_id] || { min: clp, max: clp };
      prices[t.event_id] = { min: Math.min(cur.min, clp), max: Math.max(cur.max, clp) };
    }
  }

  const items = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    summary: toSummary(r.description),
    cover_image_url: r.cover_image_url || null,
    starts_at: r.starts_at,
    ends_at: r.ends_at || null,
    timezone: r.timezone || null,
    venue_name: r.venue_name || null,
    price_from_clp: prices[r.id]?.min ?? null,
    price_to_clp: prices[r.id]?.max ?? null,
    url: siteUrl(`/eventos/${r.slug}`),
  }));
  return pageResult(items, paging, count || 0);
}

async function isOrganizerMpConnected(organizerId) {
  if (!organizerId) return false;
  const { data } = await run(
    db()
      .from('merchant_gateways')
      .select('revoked_at, expires_at')
      .eq('user_id', organizerId)
      .eq('provider', 'mp')
      .not('access_token', 'is', null)
      .maybeSingle()
  );
  if (!data || data.revoked_at) return false;
  return !(data.expires_at && new Date(data.expires_at).getTime() <= Date.now());
}

export async function readEvent({ slug } = {}) {
  if (!isValidSlug(slug)) return { ok: false, reason: 'not_found' };
  const { data: ev } = await run(
    db().from('events').select(`${toSelect(PUBLIC_EVENT_COLUMNS)},organizer_id`).eq('slug', slug).eq('status', 'published').maybeSingle()
  );
  if (!ev) return { ok: false, reason: 'not_found' };

  const { data: types } = await run(
    db().from('event_ticket_types').select(toSelect(PUBLIC_TICKET_TYPE_COLUMNS)).eq('event_id', ev.id).eq('status', 'active').order('sort_order', { ascending: true })
  );
  const [mpConnected, names] = await Promise.all([isOrganizerMpConnected(ev.organizer_id), organizerNames([ev.organizer_id])]);
  const nowMs = Date.now();
  const ended = new Date(ev.ends_at || ev.starts_at).getTime() <= nowMs;
  const ticketTypes = (types || []).map((t) => ({
    name: t.name,
    price_clp: toClp(t.price_cents),
    available: ticketAvailable(t),
    max_per_order: t.max_per_order ?? null,
    sales_start_at: t.sales_start_at || null,
    sales_end_at: t.sales_end_at || null,
  }));
  const organizerName = names[ev.organizer_id] || null;

  return {
    ok: true,
    event: {
      slug: ev.slug,
      title: ev.title,
      description: ev.description || null,
      starts_at: ev.starts_at,
      ends_at: ev.ends_at || null,
      timezone: ev.timezone || null,
      venue_name: ev.venue_name || null,
      address: ev.address || null,
      capacity: Number.isInteger(ev.capacity) ? ev.capacity : null,
      terms_text: ev.terms_text || null,
      cover_image_url: ev.cover_image_url || null,
      gallery_urls: Array.isArray(ev.gallery_urls) ? ev.gallery_urls : [],
      sales_open: mpConnected && !ended && (types || []).some((t) => ticketOnSale(t, nowMs)),
      ticket_types: ticketTypes,
      organizer: organizerName ? { name: organizerName } : null,
      url: siteUrl(`/eventos/${ev.slug}`),
    },
  };
}

// ---------------------------------------------------------------------
// Campañas
// ---------------------------------------------------------------------
async function contributionTotals(colectaIds) {
  const totals = Object.fromEntries(colectaIds.map((id) => [id, { raised: 0, count: 0 }]));
  if (!colectaIds.length) return totals;
  const { data } = await run(
    db().from('colecta_contributions').select('colecta_id,amount_cents').in('colecta_id', colectaIds).eq('status', 'approved')
  );
  for (const c of data || []) {
    const t = totals[c.colecta_id];
    if (!t) continue;
    t.raised += c.amount_cents || 0;
    t.count += 1;
  }
  return totals;
}

function campaignCard(c, totals, names) {
  return {
    slug: c.slug,
    title: c.title,
    summary: toSummary(c.description),
    cover_image_url: c.cover_image_url || null,
    status: deriveEffectiveStatus(c),
    start_at: c.start_at || null,
    end_at: c.end_at || null,
    goal_clp: toClp(c.goal_cents),
    raised_clp: toClp(totals[c.id]?.raised ?? 0),
    contributor_count: totals[c.id]?.count ?? 0,
    organizer: names[c.creator_id] ? { name: names[c.creator_id] } : null,
    url: siteUrl(`/colectas/${c.slug}`),
  };
}

export async function listCampaigns(args = {}) {
  const paging = normalizePaging(args);
  const query = normalizeQuery(args.query);
  const nowIso = new Date().toISOString();
  const build = (columns, opts) => {
    let q = db()
      .from('colectas')
      .select(columns, opts)
      .eq('status', 'active')
      .not('slug', 'is', null)
      .or(`end_at.is.null,end_at.gt.${nowIso}`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });
    if (query) q = q.ilike('title', `%${query}%`);
    return q;
  };
  const { rows: list, total: count } = await runPage(build, 'id,slug,title,description,cover_image_url,status,goal_cents,start_at,end_at,creator_id', paging);
  const [totals, names] = await Promise.all([contributionTotals(list.map((c) => c.id)), organizerNames(list.map((c) => c.creator_id))]);
  return pageResult(list.map((c) => campaignCard(c, totals, names)), paging, count || 0);
}

export async function readCampaign({ slug } = {}) {
  if (!isValidSlug(slug)) return { ok: false, reason: 'not_found' };
  const { data: c } = await run(
    db().from('colectas').select(`${toSelect(PUBLIC_COLECTA_COLUMNS)},creator_id`).eq('slug', slug).in('status', ['active', 'closed']).maybeSingle()
  );
  if (!c) return { ok: false, reason: 'not_found' };
  const [totals, names] = await Promise.all([contributionTotals([c.id]), organizerNames([c.creator_id])]);
  return {
    ok: true,
    campaign: {
      ...campaignCard(c, totals, names),
      description: c.description || null,
      gallery_urls: Array.isArray(c.gallery_urls) ? c.gallery_urls : [],
    },
  };
}

// ---------------------------------------------------------------------
// Inscripciones
// ---------------------------------------------------------------------
async function registeredCounts(activityIds) {
  const counts = Object.fromEntries(activityIds.map((id) => [id, 0]));
  if (!activityIds.length) return counts;
  const { data } = await run(db().from('registration_participants').select('activity_id').in('activity_id', activityIds));
  for (const p of data || []) if (p.activity_id in counts) counts[p.activity_id] += 1;
  return counts;
}

function registrationCard(a, counts) {
  const capacity = Number.isInteger(a.capacity) ? a.capacity : null;
  return {
    slug: a.slug,
    title: a.title,
    summary: toSummary(a.description),
    cover_image_url: a.cover_image_url || null,
    starts_at: a.starts_at,
    ends_at: a.ends_at || null,
    timezone: a.timezone || null,
    modality: a.modality || null,
    venue_name: a.venue_name || null,
    capacity,
    available_slots: capacity === null ? null : Math.max(0, capacity - (counts[a.id] || 0)),
    status: a.status,
    organizer_name: toPublicOrganizerName(a.organizer_name_snapshot),
    url: siteUrl(`/inscripcion/${a.slug}`),
  };
}

export async function listRegistrations(args = {}) {
  const paging = normalizePaging(args);
  const query = normalizeQuery(args.query);
  const nowIso = new Date().toISOString();
  const build = (columns, opts) => {
    let q = db()
      .from('registration_activities')
      .select(columns, opts)
      .eq('status', 'active')
      .not('slug', 'is', null)
      .or(upcomingFilter(nowIso))
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true });
    if (query) q = q.ilike('title', `%${query}%`);
    if (REGISTRATION_MODALITIES.includes(args.modality)) q = q.eq('modality', args.modality);
    return q;
  };
  const { rows: list, total: count } = await runPage(build, 'id,slug,title,description,cover_image_url,starts_at,ends_at,timezone,modality,venue_name,capacity,status,organizer_name_snapshot', paging);
  const counts = await registeredCounts(list.map((a) => a.id));
  return pageResult(list.map((a) => registrationCard(a, counts)), paging, count || 0);
}

export async function readRegistration({ slug } = {}) {
  if (!isValidSlug(slug)) return { ok: false, reason: 'not_found' };
  const { data: a } = await run(
    db().from('registration_activities').select(toSelect(PUBLIC_ACTIVITY_COLUMNS)).eq('slug', slug).eq('status', 'active').maybeSingle()
  );
  if (!a) return { ok: false, reason: 'not_found' };
  const counts = await registeredCounts([a.id]);
  return {
    ok: true,
    registration: {
      ...registrationCard(a, counts),
      description: a.description || null,
      address: a.address || null,
      instructions: a.instructions || null,
    },
  };
}
