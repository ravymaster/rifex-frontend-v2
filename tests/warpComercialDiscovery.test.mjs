// tests/warpComercialDiscovery.test.mjs
// Warp Conversacional — Sprint 2: contrato conversacional en Discovery de
// Rifex DEV (catálogo rifex.services.list, ayuda warp-requests y mapa).
// Sin red ni modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { listServices, SERVICES_VERSION } = await import('../src/lib/warp/rifexServices.js');
const { readHelp, HELP_TOPICS } = await import('../src/lib/warp/rifexHelp.js');
const { createRifexConnector } = await import('../src/lib/warp/rifexConnector.js');
const siteMap = JSON.parse(read('src/lib/warp/site-map.json'));

function withOrigin(origin, fn) {
  const prev = process.env.NEXT_PUBLIC_BASE_URL;
  process.env.NEXT_PUBLIC_BASE_URL = origin;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_BASE_URL = prev;
  }
}
const warp = () => listServices().items.find((i) => i.service === 'warp_conversational');

test('CONTRATO 1: Asistente de IA (alias Warp Conversacional) está una sola vez en el catálogo público de servicios', () => {
  const s = listServices();
  assert.equal(SERVICES_VERSION, '2026-11-24b');
  assert.ok(warp(), 'existe');
  assert.equal(warp().name, 'Asistente de IA');
  assert.deepEqual(warp().aliases, ['Warp Conversacional']);
  assert.equal(s.items.filter((i) => i.service === 'warp_conversational' || /asistente de ia|warp/i.test(i.name)).length, 1, 'sin ficha duplicada');
  assert.equal(s.items.length, 5);
});

test('CONTRATO 2: respuestas obligatorias presentes y textuales', () => {
  const w = warp();
  const all = JSON.stringify(w);
  for (const fact of [
    '$79.990 CLP', '$29.990 CLP', 'Precio de lanzamiento sujeto a revisión de compatibilidad', 'Sin permanencia durante el piloto',
    'modo de solo lectura', 'no compra, no reserva ni modifica datos', 'el exceso se bloquea salvo que lo autorices',
    'revisión de compatibilidad', 'verificación del dominio', 'WordPress mediante instalación asistida', 'Next.js/React',
    'PHP o sitios tradicionales', 'plataformas personalizadas se evalúan caso a caso', 'Instalación asistida',
    'ajustes iniciales de la información autorizada', 'Enviar la solicitud no genera cobros', 'necesitas una cuenta de Rifex',
    'revisamos tu sitio, definimos la información autorizada, instalamos, probamos y activamos y monitoreamos',
  ]) assert.ok(all.includes(fact), fact);
});

test('CONTRATO 3: precio y condiciones coinciden con la landing aprobada (sin divergencias)', () => {
  const page = read('src/pages/warp-conversacional.jsx');
  for (const s of ["installation: '$79.990 CLP'", "monthly: '$29.990 CLP'", "'Precio de lanzamiento sujeto a revisión de compatibilidad.'", "'Sin permanencia durante el piloto.'", "'El exceso de consumo se bloquea salvo que lo autorices.'", "'Comienza en modo de solo lectura: informa, orienta y deriva.'", "'La activación queda sujeta a la verificación del dominio.'"]) {
    assert.ok(page.includes(s), `la landing sigue diciendo ${s}`);
  }
});

test('CONTRATO 4: no inventa descuentos, prueba gratis, plazos, instalación automática, garantías ni acciones', () => {
  const all = JSON.stringify(warp()).toLowerCase();
  for (const bad of [/descuento/, /gratis|gratuit/, /prueba sin costo/, /\b\d+\s*(días|horas|semanas)\b/, /instalación automática|se instala sola/, /garantizad/, /compatibilidad total/, /reserva por ti|compra por ti|envía (el formulario|la solicitud) por ti/]) {
    assert.doesNotMatch(all, bad, String(bad));
  }
  const desc = createRifexConnector().getManifest().capabilities.find((c) => c.id === 'rifex.services.list').description;
  assert.match(desc, /sin inventar descuentos, prueba gratuita, plazos, instalación automática ni compatibilidad garantizada/);
  assert.match(desc, /el asistente nunca lo envía ni crea solicitudes/);
});

test('ENLACES 1: enlaces del origen configurado (DEV), exclusivos a /warp-conversacional#solicitar; sin localhost, Railway, Supabase, PROD ni /admin', () => {
  const w = withOrigin('https://rifex-frontend-main.vercel.app', () => warp());
  assert.equal(w.url, 'https://rifex-frontend-main.vercel.app/warp-conversacional');
  assert.equal(w.create_url, 'https://rifex-frontend-main.vercel.app/warp-conversacional#solicitar');
  const all = JSON.stringify(withOrigin('https://rifex-frontend-main.vercel.app', () => listServices()));
  assert.doesNotMatch(all, /localhost|railway|supabase\.co|rifex\.pro|\/admin|\/panel\/warp/);
  assert.match(read('src/lib/warp/rifexServices.js'), /import \{ publicOrigin \} from '\.\/publicOrigin\.js';/);
});

test('PRIVACIDAD 1: el catálogo no expone solicitudes, notas, correos, teléfonos, ids, Supabase, variables ni Token Guard', () => {
  const all = JSON.stringify(listServices());
  assert.doesNotMatch(all, /internal_notes|warp_pilot|@[a-z0-9-]+\.[a-z]{2,}|\+?56\s?9|[0-9a-f]{8}-[0-9a-f]{4}-|SUPABASE|_SECRET|WARP_AI|token guard|umbral/i);
});

test('AYUDA 1: tema warp-requests orienta a Mis solicitudes del Asistente de IA (con sesión) sin ver ni tocar solicitudes', () => {
  assert.ok(HELP_TOPICS.includes('warp-requests'));
  const h = withOrigin('https://rifex-frontend-main.vercel.app', () => readHelp({ topic: 'warp-requests' }));
  assert.equal(h.title, 'Mis solicitudes del Asistente de IA');
  assert.ok(h.steps.includes('Toca «Mis solicitudes del Asistente de IA».'), 'mismo texto que el botón de Mis iniciativas');
  assert.equal(h.url, 'https://rifex-frontend-main.vercel.app/panel/warp');
  assert.equal(h.requires_session, true);
  assert.match(h.safety_notice, /no puede ver tus solicitudes ni crearlas, cambiarlas o cancelarlas/);
  assert.doesNotMatch(JSON.stringify(h), /internal_notes|admin|52A2|renacar/i);
  const desc = createRifexConnector().getManifest().capabilities.find((c) => c.id === 'rifex.help.read').description;
  assert.match(desc, /warp-requests \(Mis solicitudes del Asistente de IA/);
});

test('CAPACIDADES 1: siguen siendo exactamente 11, todas de lectura pública y sin efectos', () => {
  const caps = createRifexConnector().getManifest().capabilities;
  assert.equal(caps.length, 11);
  for (const c of caps) {
    assert.deepEqual([c.operationType, c.sideEffects, c.confirmationRequired, c.authentication, c.invocation.method], ['read', false, false, 'public', 'GET'], c.id);
  }
  assert.ok(!caps.some((c) => /pilot|solicitud|request\.create|warp_pilot/i.test(c.id)), 'sin capacidad para crear solicitudes');
});

test('MAPA 1: si incluye Warp, solo la landing pública y el enlace de cuenta, sin rutas admin ni contenido privado', () => {
  const entries = [...siteMap.navigation, ...siteMap.content];
  const warpEntries = entries.filter((e) => /warp/.test(e.href || ''));
  for (const e of warpEntries) {
    assert.ok(['/warp-conversacional', '/panel/warp'].includes(e.href), e.href);
    if (e.href === '/panel/warp') assert.equal(e.access, 'account');
    if (e.href === '/warp-conversacional') assert.equal(e.access, 'public');
  }
  assert.ok(!entries.some((e) => /\/admin|\/api\/|piloto-warp/.test(e.href || '')), 'sin rutas admin, API ni piloto');
  assert.doesNotMatch(JSON.stringify(siteMap), /internal_notes|warp_pilot_requests|52A21745/);
  assert.ok(siteMap.navigation.every((e) => !/^https?:/.test(e.href)), 'rutas relativas (el origen lo pone Rifex)');
});

test('ENTREGA 1: la capacidad existente rifex.services.list devuelve la ficha del Asistente de IA (precios, descripción y enlace) por HTTP', async () => {
  const prev = process.env.NEXT_PUBLIC_BASE_URL;
  process.env.NEXT_PUBLIC_BASE_URL = 'https://rifex-frontend-main.vercel.app';
  let res;
  try {
    const http = createRifexConnector().createCapabilityRouteHandler();
    const r = await http(new Request('http://x/api/warp/capabilities/rifex.services.list'), { params: { capabilityId: 'rifex.services.list' } });
    res = { status: r.status, body: await r.json() };
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_BASE_URL = prev;
  }
  assert.equal(res.status, 200);
  const items = res.body.data?.items || res.body.result?.items || res.body.items;
  assert.ok(Array.isArray(items), 'items en la respuesta');
  const fichas = items.filter((i) => i.service === 'warp_conversational');
  assert.equal(fichas.length, 1, 'una sola ficha');
  const f = fichas[0];
  assert.equal(f.name, 'Asistente de IA');
  assert.deepEqual(f.aliases, ['Warp Conversacional']);
  assert.match(f.summary, /^Asistente de inteligencia artificial para sitios web/);
  assert.match(f.pricing, /instalación \$79\.990 CLP y mensualidad \$29\.990 CLP/);
  assert.equal(f.create_url, 'https://rifex-frontend-main.vercel.app/warp-conversacional#solicitar');
});
