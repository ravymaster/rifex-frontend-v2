// tests/warpSiteDiscovery.test.mjs
// Warp Discovery (@warp-ai/discovery 0.1.0, modo serve) sobre el Connector
// 0.4.0 de Rifex: site.navigation.list y site.content.read con el mapa
// aprobado. Sin IA, sin red y sin base de datos: se llama al mismo handler
// HTTP que sirve /api/warp/capabilities/[capabilityId].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRifexConnector, CAPABILITY_IDS, SITE_DISCOVERY_IDS, SITE_MAP_ORIGIN } from '../src/lib/warp/rifexConnector.js';
import { readHelp } from '../src/lib/warp/rifexHelp.js';
import { PAGE_CONTEXTS } from '../src/lib/warp/pageContexts.js';

const ORIGIN = 'https://rifex.pro';
const MAP_PATH = 'src/lib/warp/site-map.json';
const siteMap = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// Fuente ficticia solo para las 9 de Rifex (no se usan aquí salvo help.read).
const fake = { readHelp };
const connector = createRifexConnector(fake);
const http = connector.createCapabilityRouteHandler();
const call = async (id, qs = '', headers = {}) => {
  const res = await http(new Request(`http://x/api/warp/capabilities/${id}${qs}`, { headers }), { params: { capabilityId: id } });
  return { status: res.status, body: await res.json() };
};
const nav = (qs) => call('site.navigation.list', qs);
const doc = (qs) => call('site.content.read', qs);

test('SITE 0: mapa PROD aprobado sin editar (huella del build de warp-discover), 15 de navegación y 10 documentos', () => {
  const sha = createHash('sha256').update(readFileSync(MAP_PATH)).digest('hex');
  assert.equal(sha, 'a43596aa1d6212b6ffb02400a2af1e9e40bd99f887c3c73f71288490a60371e1');
  assert.equal(siteMap.mapHash, 'dd5a534cf05b8944eea11cf6f44c394ee937c5ff9648e31043b0022d7795111b');
  assert.equal(siteMap.origin, ORIGIN);
  assert.equal(siteMap.navigation.length, 15);
  assert.equal(siteMap.content.length, 10);
  assert.ok([...siteMap.navigation, ...siteMap.content].every((e) => e.status === 'published'));
  // El mapa vive fuera de public/ y el origen es fijo.
  assert.ok(!MAP_PATH.startsWith('public/'));
  assert.equal(SITE_MAP_ORIGIN, ORIGIN);
});

test('SITE 1: Discovery con exactamente 11 capacidades; las 2 nuevas son Nivel 1, públicas, de lectura, riesgo bajo y sin confirmación', () => {
  const m = connector.getManifest();
  assert.deepEqual(m.capabilities.map((c) => c.id), [...CAPABILITY_IDS, ...SITE_DISCOVERY_IDS]);
  assert.equal(m.capabilities.length, 11);
  for (const id of SITE_DISCOVERY_IDS) {
    const c = m.capabilities.find((x) => x.id === id);
    assert.deepEqual(
      [c.operationType, c.sideEffects, c.confirmationRequired, c.authentication, c.risk, c.invocation.method],
      ['read', false, false, 'public', 'low', 'GET'],
      id
    );
  }
});

test('SITE 2 (FAQ): action=read&area=support incluye /preguntas-frecuentes y su contenido se lee por id', async () => {
  const r = await nav('?action=read&area=support');
  assert.equal(r.status, 200);
  const faq = r.body.data.items.find((i) => i.id === 'support-preguntas-frecuentes');
  assert.equal(faq.url, `${ORIGIN}/preguntas-frecuentes`);
  assert.equal(faq.content_id, 'content-preguntas-frecuentes');
  assert.equal(faq.requires_session, false);
  const d = await doc('?id=content-preguntas-frecuentes');
  assert.equal(d.status, 200);
  assert.equal(d.body.data.url, `${ORIGIN}/preguntas-frecuentes`);
  assert.ok(d.body.data.sections.length > 0);
});

test('SITE 3 (Términos): enlace /terminos', async () => {
  const r = await nav('?id=legal-terminos');
  assert.deepEqual(r.body.data.items.map((i) => i.url), [`${ORIGIN}/terminos`]);
});

test('SITE 4 (contenido de Términos): lectura por id con título, URL, updated_at y secciones paginadas', async () => {
  const d = (await doc('?id=content-terminos')).body.data;
  assert.equal(d.title, 'Términos y Condiciones');
  assert.equal(d.url, `${ORIGIN}/terminos`);
  assert.equal(d.updated_at, '2026-09-01');
  assert.ok(d.sections.length >= 1 && d.sections.length <= 6);
  assert.equal(d.page, 1);
  assert.ok(d.pages >= 2);
  const p2 = (await doc('?id=content-terminos&page=2')).body.data;
  assert.equal(p2.page, 2);
});

test('SITE 5 (mayoría de edad): citas textuales verificadas en Términos, Privacidad y Seguridad, con aviso de no asesoría legal', async () => {
  for (const id of ['content-terminos', 'content-privacidad', 'content-seguridad']) {
    let found = 0;
    const first = (await doc(`?id=${id}`)).body.data;
    assert.match(first.notice, /no constituye asesoría legal/);
    for (const f of first.key_facts || []) {
      assert.match(f.quote, /mayor de 18 años/i);
      found++;
    }
    assert.ok(found >= 1, id);
    // La cita existe literalmente en la sección declarada del mapa.
    const entry = siteMap.content.find((c) => c.id === id);
    for (const k of entry.keyFacts) {
      const sec = entry.sections.find((s) => s.id === k.sectionId);
      assert.ok(sec && sec.text.includes(k.quote), `${id} ${k.id}`);
    }
  }
});

test('SITE 6 (login y registro): sign_in → solo /login; register → solo /register', async () => {
  assert.deepEqual((await nav('?action=sign_in')).body.data.items.map((i) => i.url), [`${ORIGIN}/login`]);
  assert.deepEqual((await nav('?action=register')).body.data.items.map((i) => i.url), [`${ORIGIN}/register`]);
});

test('SITE 7 (recuperación): no hay ruta aprobada en el mapa → items vacío y una nota', async () => {
  const r = (await nav('?action=recover_account')).body.data;
  assert.deepEqual(r.items, []);
  assert.ok(typeof r.note === 'string' && r.note.length > 0);
  assert.ok(!siteMap.navigation.some((e) => e.href === '/reset-password'));
  // Pendiente: no se publica en el mapa v2 ni aparece en ninguna respuesta.
  assert.doesNotMatch(JSON.stringify(siteMap), /reset-password/);
  assert.doesNotMatch(JSON.stringify((await nav('')).body), /reset-password/);
});

test('SITE 8 (Mis iniciativas): ruta correcta, requiere sesión y aviso; nunca responde a sign_in', async () => {
  const [item] = (await nav('?id=account-mis-iniciativas')).body.data.items;
  assert.equal(item.url, `${ORIGIN}/mis-iniciativas`);
  assert.equal(item.requires_session, true);
  assert.match(item.notice, /Requiere iniciar sesión/);
  const signIn = (await nav('?action=sign_in')).body.data.items;
  assert.ok(!signIn.some((i) => i.id === 'account-mis-iniciativas'));
});

test('SITE 9 (Bancos & Pagos): rifex.help.read sin regresión', async () => {
  const r = await call('rifex.help.read', '?topic=banks-payments');
  assert.equal(r.status, 200);
  const expected = JSON.parse(JSON.stringify(readHelp({ topic: 'banks-payments' })));
  assert.equal(r.body.data.title, expected.title);
  assert.equal(r.body.data.summary, expected.summary);
  assert.deepEqual(r.body.data.steps, expected.steps);
  assert.match(r.body.data.url, /\/panel\/bancos$/);
  assert.equal(r.body.data.requires_session, true);
});

test('SITE 10 (duplicado): /soluciones/eventos no aparece en el mapa ni en ninguna respuesta', async () => {
  const all = JSON.stringify(siteMap);
  assert.doesNotMatch(all, /soluciones\/eventos/);
  const actions = ['browse', 'read', 'sign_in', 'register', 'recover_account', 'create', 'configure', 'contact', 'logout'];
  for (const a of actions) assert.doesNotMatch(JSON.stringify((await nav(`?action=${a}`)).body), /soluciones/);
  assert.doesNotMatch(JSON.stringify((await nav('')).body), /soluciones/);
  for (const c of siteMap.content) assert.doesNotMatch(JSON.stringify((await doc(`?id=${c.id}`)).body), /soluciones\/eventos/);
});

test('SITE 11 (/eventos): destino preferido, una sola vez, navegación principal pública de browse y sin contenido duplicado', async () => {
  const hrefs = siteMap.navigation.map((e) => e.href);
  assert.equal(hrefs.filter((h) => h === '/eventos').length, 1);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(!siteMap.content.some((c) => c.href === '/eventos'));
  const e = siteMap.navigation.find((x) => x.href === '/eventos');
  assert.deepEqual([e.id, e.area, e.access, e.action, e.contentId], ['nav-eventos', 'primary_navigation', 'public', 'browse', null]);
  // Sin argumentos: 15 ítems, /eventos una vez, sin /soluciones/eventos ni /reset-password.
  const all = (await nav('')).body.data.items;
  assert.equal(all.length, 15);
  assert.equal(all.filter((i) => i.url === `${ORIGIN}/eventos`).length, 1);
  assert.ok(!all.some((i) => /\/soluciones\/eventos|\/reset-password/.test(i.url)));
  // browse: /eventos una sola vez, primero (destino preferido) y sin sesión.
  const browse = (await nav('?action=browse')).body.data.items;
  assert.equal(browse.filter((i) => i.url === `${ORIGIN}/eventos`).length, 1);
  assert.deepEqual(browse[0], { id: 'nav-eventos', label: 'Eventos', url: `${ORIGIN}/eventos`, area: 'primary_navigation', action: 'browse', requires_session: false });
  assert.ok(!browse.some((i) => /soluciones/.test(i.url)));
});

test('SITE 12 (Reembolsos): solo lectura e informativo; no existe acción de devolución', async () => {
  const [item] = (await nav('?id=legal-reembolsos')).body.data.items;
  assert.equal(item.action, 'read');
  assert.equal(item.content_id, 'content-reembolsos');
  const d = (await doc('?id=content-reembolsos')).body.data;
  assert.equal(d.url, `${ORIGIN}/reembolsos`);
  const m = connector.getManifest();
  assert.ok(m.capabilities.every((c) => c.operationType === 'read' && c.sideEffects === false));
  assert.ok(!m.capabilities.some((c) => /refund|reembols|devoluc/i.test(c.id)));
});

test('SITE 13 (URL arbitraria): site.content.read rechaza URLs, ids desconocidos y argumentos extra con 400', async () => {
  for (const qs of ['?id=https://evil.example', '?id=/terminos', '?id=content-admin', '?url=https://evil.example', '?id=content-terminos&href=/admin', '']) {
    const r = await doc(qs);
    assert.equal(r.status, 400, qs);
    assert.equal(r.body.success, false);
    assert.equal(r.body.error.code, 'INVALID_ARGUMENTS', qs);
  }
  for (const qs of ['?action=delete', '?area=administrative', '?id=nav-admin']) {
    assert.equal((await nav(qs)).status, 400, qs);
  }
  // Solo GET: la ruta de Next (pagesRoute) responde 405 a cualquier otro método.
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';
  const { createPagesRoute } = await import('../src/lib/warp/pagesRoute.js');
  const route = createPagesRoute(() => http, { scope: 't', rateLimit: async () => ({ allowed: true, retryAfterSeconds: 1 }) });
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const res = { statusCode: 200, headers: {} };
    res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
    res.status = (s) => { res.statusCode = s; return res; };
    res.json = () => res;
    res.send = () => res;
    await route({ method, url: '/api/warp/capabilities/site.content.read?id=content-terminos', query: { capabilityId: 'site.content.read' }, headers: {}, socket: {} }, res);
    assert.equal(res.statusCode, 405, method);
  }
});

test('SITE 14: ninguna ruta del mapa ni de las respuestas expone admin, Rifas, pagos privados, órdenes, callbacks, tokens o datos personales', async () => {
  const FORBIDDEN = /\/admin|\/panel(?!\/bancos)|\/rifas?\b|\/checkout|\/auth\/callback|\/api\/|token|\/orders?\b|\/pago|@[a-z0-9-]+\.[a-z]{2,}/i;
  for (const e of [...siteMap.navigation, ...siteMap.content]) assert.doesNotMatch(e.href, FORBIDDEN, e.href);
  assert.ok(siteMap.navigation.every((e) => e.access !== 'administrative' && e.area !== 'administrative'));
  const body = JSON.stringify((await nav('')).body);
  for (const u of body.match(/https?:\/\/[^"]+/g) || []) {
    assert.ok(u.startsWith(`${ORIGIN}/`), u);
    assert.doesNotMatch(u, FORBIDDEN, u);
  }
  // Solo la cuenta propia requiere sesión; ninguna ruta concede permisos.
  assert.deepEqual(siteMap.navigation.filter((e) => e.access !== 'public').map((e) => e.href), ['/mis-iniciativas']);
});

test('SITE 15: el origen de los enlaces es fijo, nunca el Host de la petición', async () => {
  const r = await nav('?action=sign_in', { host: 'evil.example', 'x-forwarded-host': 'evil.example' });
  assert.deepEqual(r.body.data.items.map((i) => i.url), [`${ORIGIN}/login`]);
});

test('SITE 16: los 22 contextos de página siguen intactos', () => {
  assert.equal(Object.keys(PAGE_CONTEXTS).length, 22);
});

test('SITE 17: solo se importa el modo serve (sin crawler ni red) y el mapa no está en public/', () => {
  const src = readFileSync('src/lib/warp/rifexConnector.js', 'utf8');
  assert.match(src, /from '@warp-ai\/discovery\/serve'/);
  assert.doesNotMatch(src, /from '@warp-ai\/discovery'(?!\/)/);
  assert.match(src, /import approvedSiteMap from '\.\/site-map\.json' with \{ type: 'json' \};/);
  assert.throws(() => readFileSync('public/site-map.json'));
});
