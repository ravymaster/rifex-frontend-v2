// tests/warpConnector.test.mjs
// Connector de Warp para Rifex (V1, solo lectura): contrato Discovery,
// esquemas cerrados, validación adversarial, capa de datos de solo lectura,
// ausencia de Rifas y protecciones del adaptador HTTP.
// Los datos de estas pruebas son ficticios y se inyectan como fuente; las
// pruebas con datos reales de DEV se hacen contra el servidor desplegado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRifexConnector, CAPABILITY_IDS, compact } from '../src/lib/warp/rifexConnector.js';
import { listServices } from '../src/lib/warp/rifexServices.js';
import {
  normalizePaging,
  normalizeQuery,
  isValidSlug,
  toPublicOrganizerName,
  toSummary,
  toClp,
  MAX_PAGE_SIZE,
} from '../src/lib/warp/publicCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const { validateArguments } = await import(path.join(ROOT, 'node_modules/@warp-ai/connector/src/schema.js'));

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const FORBIDDEN_FIELD_RE = /^(id|uuid|organizer_id|creator_id|user_id|email|.*_email|phone|telefono|rut|purchase.*|payment.*|order.*|mp_.*|access_.*|participants?|contributions?|buyer.*|staff|check_?in.*|scan_count|plan|raffle.*|rifa.*)$/i;

// Fuente ficticia con la misma forma que la capa real (ya normalizada).
const fake = {
  listServices,
  async listEvents({ page = 1, pageSize = 5 } = {}) {
    return {
      items: [{ slug: 'noche-de-jazz', title: 'Noche de Jazz', summary: 'Música en vivo.', cover_image_url: null, starts_at: '2026-12-12T21:00:00-03:00', ends_at: null, timezone: 'America/Santiago', venue_name: 'Sala Central', price_from_clp: 8000, price_to_clp: 12000, url: 'https://rifex.pro/eventos/noche-de-jazz' }],
      page, pageSize, total: 1, totalPages: 1,
    };
  },
  async readEvent({ slug }) {
    if (slug !== 'noche-de-jazz') return { ok: false, reason: 'not_found' };
    return { ok: true, event: { slug, title: 'Noche de Jazz', description: 'Ñandú y acentos: canción.', starts_at: '2026-12-12T21:00:00-03:00', ends_at: null, timezone: 'America/Santiago', venue_name: 'Sala Central', address: null, capacity: 100, terms_text: null, cover_image_url: null, gallery_urls: [], sales_open: true, ticket_types: [{ name: 'General', price_clp: 8000, available: 42, max_per_order: 6, sales_start_at: null, sales_end_at: null }], organizer: { name: 'Club Norte' }, url: 'https://rifex.pro/eventos/noche-de-jazz' } };
  },
  async listCampaigns({ page = 1, pageSize = 5 } = {}) {
    return { items: [{ slug: 'techo-para-la-sede', title: 'Techo para la sede', summary: null, cover_image_url: null, status: 'active', start_at: null, end_at: null, goal_clp: 500000, raised_clp: 120000, contributor_count: 18, organizer: null, url: 'https://rifex.pro/colectas/techo-para-la-sede' }], page, pageSize, total: 1, totalPages: 1 };
  },
  async readCampaign({ slug }) {
    if (slug !== 'techo-para-la-sede') return { ok: false, reason: 'not_found' };
    return { ok: true, campaign: { slug, title: 'Techo para la sede', status: 'active', raised_clp: 120000, contributor_count: 18, goal_clp: 500000, gallery_urls: [], description: 'Ayúdanos.', url: 'https://rifex.pro/colectas/techo-para-la-sede' } };
  },
  async listRegistrations({ page = 1, pageSize = 5 } = {}) {
    return { items: [{ slug: 'taller-de-ceramica', title: 'Taller de cerámica', starts_at: '2026-12-01T10:00:00-03:00', modality: 'presencial', capacity: 20, available_slots: 7, status: 'active', organizer_name: 'Taller Arcilla', url: 'https://rifex.pro/inscripcion/taller-de-ceramica' }], page, pageSize, total: 1, totalPages: 1 };
  },
  async readRegistration({ slug }) {
    if (slug !== 'taller-de-ceramica') return { ok: false, reason: 'not_found' };
    return { ok: true, registration: { slug, title: 'Taller de cerámica', starts_at: '2026-12-01T10:00:00-03:00', modality: 'presencial', capacity: 20, available_slots: 7, status: 'active', instructions: 'Traer delantal.', url: 'https://rifex.pro/inscripcion/taller-de-ceramica' } };
  },
};

const connector = createRifexConnector(fake);
const manifest = connector.getManifest();
const http = connector.createCapabilityRouteHandler();
const call = async (id, qs = '') => {
  const res = await http(new Request(`http://x/api/warp/capabilities/${id}${qs}`), { params: { capabilityId: id } });
  return { status: res.status, body: await res.json() };
};

function walkSchemaFields(schema, visit, pathName = '$') {
  if (schema?.type === 'object') {
    for (const [k, child] of Object.entries(schema.properties || {})) {
      visit(k, `${pathName}.${k}`);
      walkSchemaFields(child, visit, `${pathName}.${k}`);
    }
  } else if (schema?.type === 'array') walkSchemaFields(schema.items, visit, `${pathName}[]`);
}

// ---------------------------------------------------------------------
// Contrato Discovery
// ---------------------------------------------------------------------
test('DISCOVERY 1: manifiesto warp.discovery_manifest.v1 con las 7 capacidades exactas', () => {
  assert.equal(manifest.contract, 'warp.discovery_manifest.v1');
  assert.equal(manifest.protocolVersion, '1.0');
  assert.deepEqual(manifest.platform, { type: 'external', id: 'rifex', name: 'Rifex', version: '1.0', locale: 'es-CL' });
  assert.deepEqual(manifest.connector, { id: '@warp-ai/connector', version: '0.4.0' });
  assert.deepEqual(manifest.capabilities.map((c) => c.id), [...CAPABILITY_IDS]);
});

test('DISCOVERY 2: todas de lectura, sin efectos, públicas, riesgo bajo, GET', () => {
  for (const c of manifest.capabilities) {
    assert.equal(c.operationType, 'read', c.id);
    assert.equal(c.sideEffects, false, c.id);
    assert.equal(c.confirmationRequired, false, c.id);
    assert.equal(c.authentication, 'public', c.id);
    assert.equal(c.risk, 'low', c.id);
    assert.equal(c.invocation.method, 'GET', c.id);
    assert.equal(c.invocation.path, `/api/warp/capabilities/${c.id}`, c.id);
  }
});

test('DISCOVERY 3: sin Rifas, rutas privadas, secretos ni ids en el manifiesto', () => {
  const json = JSON.stringify(manifest);
  assert.doesNotMatch(json, /raffle|\/c\/|acceso-compartido|\/api\/chat|\/api\/rifas|\/api\/raffles/i);
  assert.doesNotMatch(json.replace(/Rifas no se ofrece mediante el asistente/g, ''), /\brifas?\b/i);
  assert.doesNotMatch(json, /supabase|service_role|SUPABASE|secret|password|api[_-]?key|Bearer|\.env/i);
  assert.doesNotMatch(json, UUID_RE);
});

test('DISCOVERY 4: ningún campo de salida es identificador interno ni dato privado', () => {
  for (const c of manifest.capabilities) {
    walkSchemaFields(c.outputSchema, (name, p) => assert.doesNotMatch(name, FORBIDDEN_FIELD_RE, `${c.id} ${p}`));
  }
  // El servicio se identifica con un valor fijo del enum, nunca con un id de la base.
  const svc = manifest.capabilities[0].outputSchema.properties.items.items.properties.service;
  assert.deepEqual(svc.enum, ['events', 'campaigns', 'registrations', 'qr_meter']);
});

test('DISCOVERY 5: el SDK rechaza al registrar cualquier capacidad con forma de escritura', () => {
  const c = createRifexConnector(fake);
  for (const extra of [{ operationType: 'write' }, { sideEffects: true }, { confirmationRequired: true }, { mutating: true }]) {
    assert.throws(() => c.capability({ id: 'rifex.event.create', description: 'Intento de escritura de prueba.', inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false }, outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false }, handler: async () => ({}), ...extra }), /read-only/);
  }
});

test('DISCOVERY 6: las fechas declaran format date-time (RFC 3339) y ninguna x-timezone global', () => {
  const DATE_FIELDS = new Set(['starts_at', 'ends_at', 'start_at', 'end_at', 'sales_start_at', 'sales_end_at']);
  let dates = 0;
  const visit = (schema) => {
    if (schema?.type === 'object') {
      for (const [k, child] of Object.entries(schema.properties || {})) {
        if (DATE_FIELDS.has(k)) {
          dates += 1;
          assert.equal(child.format, 'date-time', k);
          assert.equal(child['x-timezone'], undefined, k);
        }
        visit(child);
      }
    } else if (schema?.type === 'array') visit(schema.items);
  };
  for (const c of manifest.capabilities) visit(c.outputSchema);
  assert.ok(dates >= 14, `campos de fecha declarados: ${dates}`);
  assert.doesNotMatch(JSON.stringify(manifest), /x-timezone/);
  // Los valores que entrega la base (con offset) cumplen RFC 3339; sin offset, no.
  const schema = { type: 'object', properties: { d: { type: 'string', format: 'date-time' } }, required: ['d'], additionalProperties: false };
  assert.equal(validateArguments({ d: '2026-12-21T02:00:00+00:00' }, schema).ok, true);
  assert.equal(validateArguments({ d: '2026-12-21T02:00:00.123+00:00' }, schema).ok, true);
  assert.equal(validateArguments({ d: '2026-12-21T02:00:00' }, schema).ok, false);
});

// ---------------------------------------------------------------------
// Invocación y validación adversarial
// ---------------------------------------------------------------------
test('INVOCACIÓN 1: capacidades válidas responden success con su contrato', async () => {
  for (const [id, qs] of [['rifex.services.list', ''], ['rifex.events.list', '?page=1&pageSize=5'], ['rifex.event.read', '?slug=noche-de-jazz'], ['rifex.campaigns.list', ''], ['rifex.campaign.read', '?slug=techo-para-la-sede'], ['rifex.registrations.list', '?modality=presencial'], ['rifex.registration.read', '?slug=taller-de-ceramica']]) {
    const r = await call(id, qs);
    assert.equal(r.status, 200, id);
    assert.equal(r.body.success, true, id);
    const cap = manifest.capabilities.find((c) => c.id === id);
    const v = validateArguments(r.body.data, cap.outputSchema);
    assert.ok(v.ok, `${id}: ${JSON.stringify(v.errors)}`);
  }
});

test('INVOCACIÓN 2: inexistente → ok=false not_found (sin revelar más)', async () => {
  for (const id of ['rifex.event.read', 'rifex.campaign.read', 'rifex.registration.read']) {
    const r = await call(id, '?slug=no-existe');
    assert.deepEqual(r.body, { success: true, data: { ok: false, reason: 'not_found' } }, id);
  }
});

test('INVOCACIÓN 3: capacidades inexistentes, Rifas y mutaciones → CAPABILITY_NOT_FOUND', async () => {
  for (const id of ['rifex.raffles.list', 'rifex.raffle.read', 'raffles.list', 'rifex.event.create', 'rifex.registration.register', 'rifex.checkout.start', 'rifex.qr_meter.read', '../discovery', '']) {
    const r = await call(id);
    assert.equal(r.status, 404, id);
    assert.equal(r.body.error.code, 'CAPABILITY_NOT_FOUND', id);
  }
});

test('INVOCACIÓN 4: parámetros extra, tipos incorrectos, enum y obligatorios → INVALID_ARGUMENTS', async () => {
  const cases = [
    ['rifex.events.list', '?select=*'],
    ['rifex.events.list', '?organizer_id=1'],
    ['rifex.events.list', '?page=abc'],
    ['rifex.events.list', '?pageSize=1.5'],
    ['rifex.registrations.list', '?modality=Presencial'],
    ['rifex.registrations.list', '?modality=presencial%27%20or%201=1'],
    ['rifex.event.read', ''],
    ['rifex.event.read', '?slug='],
    ['rifex.services.list', '?fields=email'],
    ['rifex.campaign.read', '?slug=x&include=contributions'],
  ];
  for (const [id, qs] of cases) {
    const r = await call(id, qs);
    assert.equal(r.status, 400, `${id}${qs}`);
    assert.equal(r.body.error.code, 'INVALID_ARGUMENTS', `${id}${qs}`);
    for (const d of r.body.error.details || []) assert.doesNotMatch(JSON.stringify(d), /or 1=1|\*/, 'el detalle no refleja la entrada');
  }
});

test('INVOCACIÓN 5: un fallo interno nunca expone su mensaje', async () => {
  const boom = createRifexConnector({ ...fake, listEvents: async () => { throw new Error('relation "events" password=hunter2 at db.internal'); } });
  const h = boom.createCapabilityRouteHandler();
  const res = await h(new Request('http://x/api/warp/capabilities/rifex.events.list'), { params: { capabilityId: 'rifex.events.list' } });
  const body = await res.text();
  assert.equal(res.status, 500);
  assert.match(body, /HANDLER_FAILED/);
  assert.doesNotMatch(body, /hunter2|relation|db\.internal/);
});

test('INVOCACIÓN 6: compact omite nulos para cumplir los esquemas cerrados', () => {
  assert.deepEqual(compact({ a: 1, b: null, c: { d: undefined, e: [null, { f: null, g: 2 }] } }), { a: 1, c: { e: [null, { g: 2 }] } });
});

// ---------------------------------------------------------------------
// Normalización de entradas (límites que el SDK no valida)
// ---------------------------------------------------------------------
test('ENTRADAS 1: paginación acotada (máximo 20, mínimo 1, por defecto 5)', () => {
  assert.equal(MAX_PAGE_SIZE, 20);
  assert.deepEqual(normalizePaging({}), { page: 1, pageSize: 5, from: 0, to: 4 });
  assert.deepEqual(normalizePaging({ page: 3, pageSize: 10 }), { page: 3, pageSize: 10, from: 20, to: 29 });
  assert.equal(normalizePaging({ pageSize: 1000 }).pageSize, 20);
  assert.equal(normalizePaging({ pageSize: 0 }).pageSize, 5);
  assert.equal(normalizePaging({ page: -4 }).page, 1);
  assert.equal(normalizePaging({ page: 10_000_000 }).page, 500);
  assert.equal(normalizePaging({ page: '2' }).page, 1);
});

test('ENTRADAS 2: búsqueda sin comodines, control ni inyección, máximo 60', () => {
  assert.equal(normalizeQuery('  Peña   del Sur  '), 'Peña del Sur');
  assert.equal(normalizeQuery('%_*(),;\\'), null);
  assert.equal(normalizeQuery("jazz%' or 1=1--"), "jazz ' or 1 1--");
  assert.equal(normalizeQuery('a'.repeat(200)).length, 60);
  assert.equal(normalizeQuery('título\u0000‮'), 'título');
  assert.equal(normalizeQuery(42), null);
  assert.equal(normalizeQuery('ñandú ¿qué? ¡sí!'), 'ñandú ¿qué? ¡sí!');
});

test('ENTRADAS 3: slugs manipulados se rechazan sin consultar', () => {
  for (const bad of ['', 'A-B', 'a b', "a'b", 'a/../b', 'a%20b', '-a', 'a-', 'a_b', 'E5E735B1-7C3D-4871-82BE-368EDD796E25', 'x'.repeat(101), null, 7]) {
    assert.equal(isValidSlug(bad), false, String(bad));
  }
  assert.equal(isValidSlug('noche-de-jazz-2026'), true);
  // Las lecturas buscan solo por slug: un UUID nunca abre una iniciativa por su id interno.
  const src = code('src/lib/warp/publicCatalog.js');
  assert.equal((src.match(/\.eq\('slug', slug\)/g) || []).length, 3);
  assert.doesNotMatch(src, /\.eq\('id',|idOrSlugColumn/);
});

test('ENTRADAS 4: nombre del organizador, resumen y montos', () => {
  assert.equal(toPublicOrganizerName('persona@correo.test'), null);
  assert.equal(toPublicOrganizerName('+56 9 1234 5678'), null);
  assert.equal(toPublicOrganizerName('12.345.678-9'), null);
  assert.equal(toPublicOrganizerName('  Club   Norte '), 'Club Norte');
  assert.equal(toSummary('a'.repeat(500)).length, 200);
  assert.equal(toSummary('  línea\n\nsiguiente '), 'línea siguiente');
  assert.equal(toSummary(null), null);
  assert.equal(toClp(799950), 7999.5 > 0 ? 8000 : 0);
  assert.equal(toClp(null), null);
});

// ---------------------------------------------------------------------
// Capa de datos: solo lectura, solo campos públicos, sin Rifas
// ---------------------------------------------------------------------
test('DATOS 1: la capa pública solo lee (sin escrituras, RPC ni comodines)', () => {
  const src = code('src/lib/warp/publicCatalog.js');
  assert.doesNotMatch(src, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(src, /select\(\s*['"`]\*['"`]/);
  const tables = [...src.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(tables)].sort(), ['colecta_contributions', 'colectas', 'event_ticket_types', 'events', 'merchant_gateways', 'registration_activities', 'registration_participants', 'users_profile']);
});

test('DATOS 2: tablas sensibles solo con las columnas mínimas', () => {
  const src = code('src/lib/warp/publicCatalog.js');
  assert.match(src, /from\('merchant_gateways'\)\s*\n\s*\.select\('revoked_at, expires_at'\)/);
  assert.match(src, /from\('colecta_contributions'\)\.select\('colecta_id,amount_cents'\)/);
  assert.match(src, /from\('registration_participants'\)\.select\('activity_id'\)/);
  assert.match(src, /from\('users_profile'\)\.select\('user_id, nombre'\)/);
});

test('DATOS 3: solo iniciativas públicas por estado', () => {
  const src = code('src/lib/warp/publicCatalog.js');
  assert.equal((src.match(/\.eq\('status', 'published'\)/g) || []).length, 2, 'eventos publicados (listado y detalle)');
  assert.match(src, /from\('colectas'\)[\s\S]*?\.eq\('status', 'active'\)/);
  assert.match(src, /\.in\('status', \['active', 'closed'\]\)/);
  assert.equal((src.match(/registration_activities'\)[\s\S]{0,260}?\.eq\('status', 'active'\)/g) || []).length, 2);
});

test('DATOS 4: el Connector no toca Rifas, pagos ni otras rutas', () => {
  for (const p of ['src/lib/warp/publicCatalog.js', 'src/lib/warp/rifexConnector.js', 'src/lib/warp/rifexServices.js', 'src/lib/warp/pagesRoute.js', 'src/pages/api/v1/discovery.js', 'src/pages/api/warp/capabilities/[capabilityId].js', 'src/pages/api/warp/health.js']) {
    const src = code(p).replace(/Rifas no se ofrece mediante el asistente/g, '');
    assert.doesNotMatch(src, /raffle|rifas?\b|tickets'|raffleShareAccess|checkout|mercadopago|paymentReconcile|webhook/i, p);
    assert.doesNotMatch(src, /NEXT_PUBLIC_[A-Z_]*WARP|WARP_CONNECTOR_API_KEY/, p);
  }
});

test('DATOS 5: servicios curados sin Rifas, con reglas comerciales vigentes', () => {
  const s = listServices();
  assert.deepEqual(s.items.map((i) => i.service), ['events', 'campaigns', 'registrations', 'qr_meter']);
  assert.doesNotMatch(JSON.stringify(s), /\brifas?\b|raffle/i);
  const byId = Object.fromEntries(s.items.map((i) => [i.service, i]));
  assert.equal(byId.events.requires_mercado_pago, true);
  assert.equal(byId.campaigns.requires_mercado_pago, true);
  assert.equal(byId.registrations.requires_mercado_pago, false);
  assert.equal(byId.qr_meter.requires_mercado_pago, false);
  assert.match(s.commission_note, /7%/);
  for (const i of s.items) assert.equal(i.uses_qr, true, i.service);
});

// ---------------------------------------------------------------------
// Adaptador HTTP
// ---------------------------------------------------------------------
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';
const { createPagesRoute, MAX_URL_LENGTH } = await import('../src/lib/warp/pagesRoute.js');

function fakeRes() {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (b) => { r.body = JSON.stringify(b); return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}
const allow = async () => ({ allowed: true, retryAfterSeconds: 1 });

test('ADAPTADOR 1: solo GET, límite de URL y límite de intentos', async () => {
  const route = createPagesRoute(() => http, { scope: 't', rateLimit: allow });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const res = fakeRes();
    await route({ method, url: '/api/warp/capabilities/rifex.events.list', query: { capabilityId: 'rifex.events.list' }, headers: {}, socket: {} }, res);
    assert.equal(res.statusCode, 405, method);
    assert.equal(res.headers.allow, 'GET');
  }
  const long = fakeRes();
  await route({ method: 'GET', url: `/api/warp/capabilities/rifex.events.list?query=${'a'.repeat(MAX_URL_LENGTH)}`, query: { capabilityId: 'rifex.events.list' }, headers: {}, socket: {} }, long);
  assert.equal(long.statusCode, 414);
  const limited = createPagesRoute(() => http, { scope: 't', rateLimit: async () => ({ allowed: false, retryAfterSeconds: 30 }) });
  const rl = fakeRes();
  await limited({ method: 'GET', url: '/api/warp/capabilities/rifex.events.list', query: { capabilityId: 'rifex.events.list' }, headers: {}, socket: {} }, rl);
  assert.equal(rl.statusCode, 429);
  assert.equal(rl.headers['retry-after'], '30');
});

test('ADAPTADOR 2: respuesta del SDK, no-store, noindex y X-Request-Id', async () => {
  const route = createPagesRoute(() => http, { scope: 't', rateLimit: allow });
  const res = fakeRes();
  await route({ method: 'GET', url: '/api/warp/capabilities/rifex.event.read?slug=noche-de-jazz', query: { capabilityId: 'rifex.event.read' }, headers: {}, socket: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).data.event.slug, 'noche-de-jazz');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
  assert.match(res.headers['x-request-id'], /^[0-9a-f]{16}$/);
});

test('ADAPTADOR 3: tiempo máximo y logs sin argumentos ni IP', async () => {
  const logs = [];
  const orig = console.info;
  console.info = (m) => logs.push(m);
  try {
    const slow = createPagesRoute(() => () => new Promise(() => {}), { scope: 't', rateLimit: allow, timeoutMs: 30 });
    const res = fakeRes();
    await slow({ method: 'GET', url: '/api/warp/capabilities/rifex.events.list?query=secreto-de-prueba', query: { capabilityId: 'rifex.events.list' }, headers: { 'x-real-ip': '203.0.113.9' }, socket: {} }, res);
    assert.equal(res.statusCode, 504);
  } finally {
    console.info = orig;
  }
  assert.equal(logs.length, 1);
  const entry = JSON.parse(logs[0]);
  assert.deepEqual(Object.keys(entry).sort(), ['capability', 'ms', 'requestId', 'scope', 'status']);
  assert.doesNotMatch(logs[0], /secreto-de-prueba|203\.0\.113\.9/);
});
