// tests/warpHelpMenu.test.mjs
// `rifex.help.read` (Nivel 1): guía del menú interno real, por tema cerrado.
// Inventario atado al código del menú (Layout.jsx y /mis-iniciativas),
// contrato cerrado, enlaces por ambiente y límites: nunca datos de la persona,
// nunca acciones, nunca administración ni Rifas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRifexConnector } from '../src/lib/warp/rifexConnector.js';
import { readHelp, HELP_TOPICS, HELP_TOPIC_PATHS, HELP_FIELDS } from '../src/lib/warp/rifexHelp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const pageExists = (route) => ['.js', '.jsx', '/index.js', '/index.jsx'].some((s) => fs.existsSync(path.join(ROOT, `src/pages${route}${s}`)));

const withBaseUrl = (value, fn) => {
  const prev = process.env.NEXT_PUBLIC_BASE_URL;
  process.env.NEXT_PUBLIC_BASE_URL = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_BASE_URL = prev;
  }
};

const connector = createRifexConnector();
const cap = connector.getManifest().capabilities.find((c) => c.id === 'rifex.help.read');
const http = connector.createCapabilityRouteHandler();
const call = async (qs) => {
  const res = await http(new Request(`http://x/api/warp/capabilities/rifex.help.read${qs}`), { params: { capabilityId: 'rifex.help.read' } });
  return { status: res.status, body: await res.json() };
};

test('AYUDA 1: el inventario coincide con el menú real de la cuenta, el móvil y Mis iniciativas', () => {
  const layout = read('src/components/Layout.jsx');
  const items = [...layout.slice(layout.indexOf('const accountItems = ['), layout.indexOf('];', layout.indexOf('const accountItems = ['))).matchAll(/label: '([^']+)',\s*href: '([^']+)'/g)].map((m) => [m[1].trim(), m[2]]);
  assert.deepEqual(items, [['Mis iniciativas', '/mis-iniciativas'], ['Difusión', '/difusion'], ['Bancos & Pagos', '/panel/bancos'], ['Perfil', '/perfil']]);
  // Cada opción del menú de cuenta tiene su tema, con la misma ruta.
  const byPath = Object.fromEntries(Object.entries(HELP_TOPIC_PATHS).map(([k, v]) => [v, k]));
  for (const [, href] of items) assert.ok(byPath[href], `tema para ${href}`);
  // «Cerrar sesión» existe en el menú de escritorio y en el móvil.
  assert.equal((layout.match(/Cerrar sesión/g) || []).length >= 2, true);
  assert.ok(HELP_TOPICS.includes('logout'));
  // Paneles por módulo: los mismos destinos que las tarjetas de /mis-iniciativas (sin Rifas).
  const mis = read('src/pages/mis-iniciativas.jsx');
  for (const [topic, href] of [['events', '/panel/eventos'], ['campaigns', '/crear-colecta'], ['registrations', '/panel/inscripciones'], ['qr-meter', '/panel/medidor-qr']]) {
    assert.equal(HELP_TOPIC_PATHS[topic], href, topic);
    assert.ok(mis.includes(`href: '${href}'`), `${href} en Mis iniciativas`);
  }
  // Soporte: el Contacto del pie.
  assert.match(layout, /<Link href="\/contacto">Contacto<\/Link>/);
  for (const p of Object.values(HELP_TOPIC_PATHS).filter(Boolean)) assert.ok(pageExists(p), `existe ${p}`);
});

test('AYUDA 2: temas cerrados; sin administración, Rifas, tokens ni rutas privadas', () => {
  assert.deepEqual([...HELP_TOPICS], ['account-panel', 'profile', 'profile-edit', 'profile-fields', 'banks-payments', 'mp-connect', 'collect-vs-pay', 'payment-methods', 'payment-security', 'mp-required', 'mp-not-required', 'events', 'campaigns', 'registrations', 'qr-meter', 'promotion', 'support', 'logout']);
  assert.deepEqual(cap.inputSchema, { type: 'object', properties: { topic: { type: 'string', enum: [...HELP_TOPICS], description: 'Tema exacto del menú, de la lista cerrada.' } }, required: ['topic'], additionalProperties: false });
  const all = JSON.stringify(HELP_TOPIC_PATHS) + JSON.stringify(HELP_TOPICS.map((t) => readHelp({ topic: t })));
  assert.doesNotMatch(all, /\badmin\b|\/admin|\/panel"|rifa|raffle|token|webhook|\[id\]|\/api\//i);
  assert.equal(readHelp({ topic: '/panel/bancos' }), null);
  assert.equal(readHelp({ topic: '__proto__' }), null);
  assert.equal(readHelp({}), null);
});

test('AYUDA 3: contrato de lectura pública con salida cerrada a los campos autorizados', async () => {
  assert.equal(cap.operationType, 'read');
  assert.equal(cap.sideEffects, false);
  assert.equal(cap.authentication, 'public');
  assert.equal(cap.risk, 'low');
  assert.equal(cap.invocation.method, 'GET');
  assert.equal(cap.outputSchema.additionalProperties, false);
  assert.deepEqual(Object.keys(cap.outputSchema.properties), [...HELP_FIELDS]);
  for (const topic of HELP_TOPICS) {
    const r = await call(`?topic=${topic}`);
    assert.equal(r.status, 200, topic);
    for (const k of Object.keys(r.body.data)) assert.ok(HELP_FIELDS.includes(k), `${topic}: ${k}`);
    assert.ok(r.body.data.steps.length >= 1, topic);
    assert.equal(typeof r.body.data.requires_session, 'boolean');
  }
  assert.equal((await call('?topic=support')).body.data.requires_session, false);
  assert.equal((await call('?topic=profile')).body.data.requires_session, true);
  assert.equal((await call('?topic=logout')).body.data.url, undefined, 'cerrar sesión no tiene enlace');
});

test('AYUDA 4: argumentos fuera de la lista, rutas libres o extra → 400', async () => {
  for (const qs of ['', '?topic=', '?topic=Profile', '?topic=%2Fpanel%2Fbancos', '?topic=https%3A%2F%2Fevil.example', '?topic=admin', '?topic=raffles', '?topic=profile&userId=1', '?path=%2Fperfil']) {
    const r = await call(qs);
    assert.equal(r.status, 400, qs);
    assert.equal(r.body.error.code, 'INVALID_ARGUMENTS', qs);
  }
});

test('AYUDA 5: enlaces según el ambiente configurado (DEV y simulación PROD)', () => {
  withBaseUrl('https://rifex-frontend-main.vercel.app', () => {
    assert.equal(readHelp({ topic: 'banks-payments' }).url, 'https://rifex-frontend-main.vercel.app/panel/bancos');
    assert.equal(readHelp({ topic: 'account-panel' }).url, 'https://rifex-frontend-main.vercel.app/mis-iniciativas');
    assert.equal(readHelp({ topic: 'profile' }).url, 'https://rifex-frontend-main.vercel.app/perfil');
    assert.equal(readHelp({ topic: 'events' }).url, 'https://rifex-frontend-main.vercel.app/panel/eventos');
  });
  withBaseUrl('https://rifex.pro', () => {
    assert.equal(readHelp({ topic: 'banks-payments' }).url, 'https://rifex.pro/panel/bancos');
    assert.equal(readHelp({ topic: 'support' }).url, 'https://rifex.pro/contacto');
  });
});

test('AYUDA 6: límites de Nivel 1: no ve datos, no actúa, protege credenciales', () => {
  assert.match(cap.description, /no ve ni puede afirmar/);
  assert.match(cap.description, /no actúa por ella, no cierra sesión y no muestra datos de otras cuentas/);
  assert.match(cap.description, /dónde revisarlo la propia persona/);
  const bank = readHelp({ topic: 'banks-payments' });
  for (const w of [/Nunca compartas tu clave de Mercado Pago/, /datos bancarios/, /no puede ver si tu cuenta está conectada/]) assert.match(bank.safety_notice, w);
  assert.match(readHelp({ topic: 'logout' }).summary, /no puede cerrar tu sesión/);
  assert.match(readHelp({ topic: 'profile' }).safety_notice, /no puede ver ni cambiar tu perfil/);
  for (const t of ['account-panel', 'events', 'campaigns', 'registrations', 'qr-meter']) {
    assert.match(readHelp({ topic: t }).safety_notice, /no puede ver tus datos/, t);
  }
  // Fuente estática: sin base, sesión, red ni escrituras.
  const src = code('src/lib/warp/rifexHelp.js');
  assert.doesNotMatch(src, /supabase|getSession|getUser|fetch\(|from\(|\.rpc\(|insert|update\(|delete|cookie|localStorage|process\.env/i);
  assert.doesNotMatch(JSON.stringify(HELP_TOPICS.map((t) => readHelp({ topic: t }))), /\d{5,}|@[a-z]/i, 'sin números largos ni correos');
});

const getTopic = (topic) => withBaseUrl('https://rifex-frontend-main.vercel.app', () => readHelp({ topic }));
const DEV = 'https://rifex-frontend-main.vercel.app';

test('AYUDA 7: regresiones de preguntas (tema que corresponde y respuesta sin afirmar datos)', async () => {
  const { pageContextFor } = await import('../src/lib/warp/pageContexts.js');
  // «Ya estoy en Bancos y Pagos, ¿qué hago?»: contexto genérico + guía de la sección.
  assert.deepEqual(pageContextFor('/panel/bancos'), { pageId: 'banks-payments', module: 'account', area: 'account', guidance: 'payments-settings' });
  const bank = getTopic('banks-payments');
  assert.match(bank.summary, /«Ganancias»/);
  assert.match(bank.summary, /«Proveedores de pago»/);
  assert.equal(bank.url, `${DEV}/panel/bancos`);
  // «¿Dónde conecto Mercado Pago?»
  const mp = getTopic('mp-connect');
  assert.equal(mp.url, `${DEV}/panel/bancos`);
  assert.ok(mp.steps.some((x) => /pulsa «Conectar»/.test(x)));
  assert.ok(mp.steps.some((x) => /«Verificar cuenta»/.test(x)));
  // «¿Puedo conectar directamente mi banco?»
  assert.match(getTopic('payment-methods').summary, /no se conecta una cuenta bancaria directamente en Rifex/);
  // «¿Qué tarjeta tengo guardada?»: nada afirma ver tarjetas; el pago ocurre en Mercado Pago.
  const methods = getTopic('payment-methods');
  assert.match(methods.summary, /en la página de Mercado Pago/);
  assert.match(methods.safety_notice, /no puede ver/);
  for (const t of HELP_TOPICS) assert.doesNotMatch(JSON.stringify(getTopic(t)), /tu tarjeta (es|termina)|tienes guardad|tu saldo es|tu cuenta bancaria es/i, t);
  // «¿Dónde cambio mis datos?»
  const edit = getTopic('profile-edit');
  assert.equal(edit.url, `${DEV}/perfil`);
  assert.ok(edit.steps.some((x) => /«Editar perfil»/.test(x) && /«Guardar»/.test(x)));
  // «¿Mi Perfil está completo?»: no lo sabe; indica revisarlo.
  const fields = getTopic('profile-fields');
  assert.match(fields.safety_notice, /no puede ver tu perfil ni saber si está completo/);
  assert.ok(fields.steps.some((x) => /revisa tú mismo/.test(x)));
  // «¿Dónde veo mis campañas?»
  const camp = getTopic('campaigns');
  assert.equal(camp.url, `${DEV}/crear-colecta`);
  assert.ok(camp.steps.some((x) => /«Ir a mis campañas»/.test(x)));
  // «Cierra mi sesión»: no actúa y no entrega una ruta como si fuera un enlace.
  const out = getTopic('logout');
  assert.equal(out.url, null);
  assert.match(out.summary, /no puede cerrar tu sesión/);
  assert.doesNotMatch(JSON.stringify(out), /\/logout|\/signout|signOut|\/api\//i);
  for (const t of HELP_TOPICS) assert.doesNotMatch(String(getTopic(t).url || ''), /logout|signout|\/api\/|callback|oauth|\?/i, t);
});

test('AYUDA 8: cada afirmación de pagos y perfil está respaldada por el código de Rifex', () => {
  const bancos = read('src/pages/panel/bancos.js');
  for (const x of ['Ganancias', 'Proveedores de pago', 'Conectar', 'Verificar cuenta', 'Desconectar', 'Crear cuenta en Mercado Pago', 'No disponible en tu país', 'Tu cuenta ya está lista para crear iniciativas.', 'Cuenta de Mercado Pago validada.', 'dinos en qué país operarás']) {
    assert.ok(bancos.includes(x), `Bancos & Pagos dice «${x}»`);
  }
  // El pago se completa en Mercado Pago (preference + init_point), sin medios fijados por Rifex.
  const mp = read('src/pages/api/checkout/mp.js');
  assert.match(mp, /new Preference\(mpClient\)/);
  assert.match(mp, /init_point/);
  assert.doesNotMatch(mp, /payment_methods|excluded_payment_types/);
  // Comisión 7% descontada por Mercado Pago (FAQ público) y acreditación al organizador (Seguridad).
  assert.match(read('src/pages/preguntas-frecuentes.js'), /comisión única del 7%[\s\S]*descontada automáticamente por\s+Mercado Pago/);
  assert.match(read('src/pages/seguridad.js'), /se acreditan en la cuenta del\s+organizador/);
  // Perfil: nombre hasta 80, «Sobre mí» hasta 280 (servidor), ambos opcionales; foto PNG, JPG o WebP.
  const upd = read('src/pages/api/profile/update.js');
  assert.match(upd, /const MAX_BIO_LEN = 280;/);
  assert.match(upd, /nombre\.trim\(\)\.slice\(0, 80\) \|\| null/);
  assert.match(upd, /bio\.trim\(\)\.slice\(0, MAX_BIO_LEN\) \|\| null/);
  assert.match(read('src/components/rifex/ProfileView.jsx'), /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(getTopic('profile-fields').summary, /hasta 80 caracteres[\s\S]*hasta 280 caracteres/);
  // Módulos con y sin Mercado Pago (fuente de servicios).
  const svc = read('src/lib/warp/rifexServices.js');
  assert.match(svc, /service: 'events'[\s\S]*?requires_mercado_pago: true/);
  assert.match(svc, /service: 'campaigns'[\s\S]*?requires_mercado_pago: true/);
  assert.match(svc, /service: 'registrations'[\s\S]*?requires_mercado_pago: false/);
  assert.match(svc, /service: 'qr_meter'[\s\S]*?requires_mercado_pago: false/);
  assert.match(getTopic('mp-not-required').summary, /Inscripciones[\s\S]*Medidor QR/);
  assert.doesNotMatch(getTopic('mp-not-required').summary + getTopic('mp-required').summary, /rifa/i);
});
