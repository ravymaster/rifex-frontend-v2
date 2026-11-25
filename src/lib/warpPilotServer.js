// src/lib/warpPilotServer.js
// Warp Conversacional — solicitudes de piloto (SOLO SERVIDOR).
//
// - Identidad siempre desde auth.getUser(token): nunca un user_id del cliente.
// - Usuario: inserta y lee con un cliente Supabase que lleva SU JWT, así que
//   RLS y los permisos por columna se aplican de verdad (nunca service_role
//   para operaciones del usuario).
// - Admin: resolveAdmin (app_metadata.role = 'admin') + service role, solo
//   en el servidor. Es la relación comercial: no crea claves de Warp, no
//   cobra y no activa nada.
// - Las respuestas nunca incluyen internal_notes hacia el usuario.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/rateLimit';
import { resolveAdmin } from '@/lib/adminAuth';
import {
  validatePilotRequest,
  shortRequestId,
  WARP_PILOT_STATUS_LABEL,
  WARP_PILOT_NEXT_STEP,
  WARP_PILOT_STATUSES,
  WARP_PILOT_LIMITS,
  cleanText,
  looksLikeSecret,
} from '@/lib/warpPilotRequest';
import { notifyWarpPilotRequestCreated } from '@/lib/warpPilotMailer';

export const USER_COLUMNS = 'id, company_name, domain, status, created_at, updated_at';
export const ADMIN_LIST_COLUMNS = 'id, user_id, company_name, domain, contact_name, contact_email, site_type, status, created_at, updated_at';
export const ADMIN_DETAIL_COLUMNS = 'id, user_id, company_name, domain, contact_name, contact_email, contact_phone, site_type, objective, authorized_information, estimated_traffic, status, terms_accepted_at, compatibility_accepted_at, internal_notes, created_at, updated_at';
export const CREATE_RATE_LIMIT = Object.freeze({ maxHits: 5, windowSeconds: 3600 });
const ADMIN_PAGE_SIZE = 50;

function env(name) {
  return process.env[name];
}

function serviceClient() {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Cliente con el JWT del usuario: RLS decide qué puede leer y escribir.
function userClient(token) {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function bearerToken(req) {
  const authz = String(req.headers?.authorization || '');
  return authz.startsWith('Bearer ') ? authz.slice(7).trim() || null : null;
}

async function defaultGetUser(token) {
  const { data, error } = await serviceClient().auth.getUser(token);
  return error ? null : data?.user || null;
}

export function toUserView(row) {
  return {
    id: row.id,
    shortId: shortRequestId(row.id),
    company: row.company_name,
    domain: row.domain,
    status: row.status,
    statusLabel: WARP_PILOT_STATUS_LABEL[row.status] || row.status,
    nextStep: WARP_PILOT_NEXT_STEP[row.status] || '',
    createdAt: row.created_at,
  };
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

const defaultDeps = () => ({
  getUser: defaultGetUser,
  rateLimit: enforceRateLimit,
  insert: async (token, row) => userClient(token).from('warp_pilot_requests').insert(row).select(USER_COLUMNS).single(),
  listMine: async (token) => userClient(token).from('warp_pilot_requests').select(USER_COLUMNS).order('created_at', { ascending: false }).limit(50),
  notify: notifyWarpPilotRequestCreated,
  now: () => new Date(),
});

// GET: mis solicitudes. POST: crear una solicitud (requiere sesión).
export function createPilotRequestsRoute(overrides = {}) {
  return async function pilotRequestsRoute(req, res) {
    const deps = { ...defaultDeps(), ...overrides };
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { ok: false, error: 'method_not_allowed' });
    }
    const token = bearerToken(req);
    const user = token ? await deps.getUser(token) : null;
    if (!user) return send(res, 401, { ok: false, error: 'missing_auth' });

    try {
      if (req.method === 'GET') {
        const { data, error } = await deps.listMine(token);
        if (error) return send(res, 500, { ok: false, error: 'server_error' });
        return send(res, 200, { ok: true, requests: (data || []).map(toUserView) });
      }

      if (await deps.rateLimit(req, res, { key: `warp-solicitud:${user.id}`, ...CREATE_RATE_LIMIT })) return undefined;

      const v = validatePilotRequest(req.body);
      if (!v.ok) return send(res, 400, { ok: false, error: v.error, field: v.field || null });

      const at = deps.now().toISOString();
      const row = { ...v.value, user_id: user.id, terms_accepted_at: at, compatibility_accepted_at: at };
      const { data, error } = await deps.insert(token, row);
      if (error) {
        if (error.code === '23505') return send(res, 409, { ok: false, error: 'duplicate_active_request', field: 'domain' });
        return send(res, 500, { ok: false, error: 'server_error' });
      }

      const view = toUserView(data);
      // Los correos nunca bloquean ni cambian el resultado de la solicitud.
      try {
        await deps.notify({ request: { ...v.value, id: data.id, status: data.status, created_at: data.created_at }, accountEmail: user.email || null });
      } catch {
        /* contenido: el correo no es autoridad */
      }
      return send(res, 201, { ok: true, request: view });
    } catch {
      return send(res, 500, { ok: false, error: 'server_error' });
    }
  };
}

// ---------- Admin ----------

// Término de búsqueda seguro para el filtro `or` de PostgREST: se eliminan
// comodines y caracteres con significado sintáctico (coma, paréntesis,
// comillas, barra invertida y asterisco), nunca se escapan. El punto se
// conserva para poder buscar dominios.
export function escapeIlike(value) {
  return String(value).replace(/[\\%_,()"'*]/g, ' ').replace(/\s+/g, ' ').trim();
}

const defaultAdminDeps = () => ({
  resolveAdmin,
  db: serviceClient,
});

export function createAdminPilotListRoute(overrides = {}) {
  return async function adminPilotList(req, res) {
    const deps = { ...defaultAdminDeps(), ...overrides };
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return send(res, 405, { ok: false, error: 'method_not_allowed' });
    }
    const auth = await deps.resolveAdmin(req);
    if (!auth.ok) return send(res, auth.status || 401, { ok: false, error: auth.error || 'forbidden' });
    try {
      const status = String(req.query?.status || '');
      const q = cleanText(req.query?.q).slice(0, 100);
      let query = deps.db().from('warp_pilot_requests').select(ADMIN_LIST_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false }).limit(ADMIN_PAGE_SIZE);
      if (status) {
        if (!WARP_PILOT_STATUSES.includes(status)) return send(res, 400, { ok: false, error: 'invalid_status' });
        query = query.eq('status', status);
      }
      if (q) {
        const term = `%${escapeIlike(q)}%`;
        query = query.or(`company_name.ilike.${term},domain.ilike.${term},contact_email.ilike.${term}`);
      }
      const { data, error, count } = await query;
      if (error) return send(res, 500, { ok: false, error: 'server_error' });
      return send(res, 200, {
        ok: true,
        total: count ?? (data || []).length,
        requests: (data || []).map((r) => ({ ...r, shortId: shortRequestId(r.id), statusLabel: WARP_PILOT_STATUS_LABEL[r.status] || r.status })),
      });
    } catch {
      return send(res, 500, { ok: false, error: 'server_error' });
    }
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAdminPilotDetailRoute(overrides = {}) {
  return async function adminPilotDetail(req, res) {
    const deps = { ...defaultAdminDeps(), ...overrides };
    if (req.method !== 'GET' && req.method !== 'PATCH') {
      res.setHeader('Allow', 'GET, PATCH');
      return send(res, 405, { ok: false, error: 'method_not_allowed' });
    }
    const auth = await deps.resolveAdmin(req);
    if (!auth.ok) return send(res, auth.status || 401, { ok: false, error: auth.error || 'forbidden' });
    const id = String(req.query?.id || '');
    if (!UUID.test(id)) return send(res, 400, { ok: false, error: 'invalid_id' });
    try {
      const db = deps.db();
      const { data: current, error } = await db.from('warp_pilot_requests').select(ADMIN_DETAIL_COLUMNS).eq('id', id).maybeSingle();
      if (error) return send(res, 500, { ok: false, error: 'server_error' });
      if (!current) return send(res, 404, { ok: false, error: 'not_found' });

      if (req.method === 'GET') {
        const { data: history } = await db.from('warp_pilot_request_history').select('from_status, to_status, notes_changed, created_at').eq('request_id', id).order('created_at', { ascending: false }).limit(50);
        return send(res, 200, { ok: true, request: { ...current, shortId: shortRequestId(id), statusLabel: WARP_PILOT_STATUS_LABEL[current.status] }, history: history || [] });
      }

      const body = req.body || {};
      const patch = {};
      if (body.status !== undefined) {
        if (!WARP_PILOT_STATUSES.includes(body.status)) return send(res, 400, { ok: false, error: 'invalid_status' });
        if (body.status !== current.status) patch.status = body.status;
      }
      if (body.internalNotes !== undefined) {
        const notes = cleanText(body.internalNotes, { multiline: true });
        if (notes.length > WARP_PILOT_LIMITS.notes) return send(res, 400, { ok: false, error: 'notes_too_long' });
        if (looksLikeSecret(notes)) return send(res, 400, { ok: false, error: 'secret_detected' });
        if ((notes || null) !== (current.internal_notes || null)) patch.internal_notes = notes || null;
      }
      if (!Object.keys(patch).length) return send(res, 200, { ok: true, unchanged: true });

      const { error: upErr } = await db.from('warp_pilot_requests').update(patch).eq('id', id);
      if (upErr) {
        if (upErr.code === '23505') return send(res, 409, { ok: false, error: 'duplicate_active_request' });
        return send(res, 500, { ok: false, error: 'server_error' });
      }
      await db.from('warp_pilot_request_history').insert({
        request_id: id,
        changed_by: auth.admin?.viaDevDoor ? null : auth.admin?.id || null,
        from_status: current.status,
        to_status: patch.status || current.status,
        notes_changed: 'internal_notes' in patch,
      });
      return send(res, 200, { ok: true, status: patch.status || current.status });
    } catch {
      return send(res, 500, { ok: false, error: 'server_error' });
    }
  };
}
