// tests/warpAssistantGlobal.test.mjs
// Asistente de Warp en todas las páginas visuales: montaje único en _app,
// exclusiones técnicas, encendido desde el servidor, privacidad (sin contexto
// de página, sin cookies ni sesión hacia Warp) y ajustes visuales.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { createWarpChatRouteHandler } from '@warp-ai/assistant';
import {
  ASSISTANT_ENDPOINTS,
  ASSISTANT_STYLE_OVERRIDES,
  EXCLUDED_PATHS,
  MAX_BOTTOM_OFFSET,
  buildAssistantConfig,
  computeBottomOffset,
  createAssistantFetch,
  readAssistantStatus,
  shouldMountAssistant,
  isEditableField,
  FIELD_REVEAL_DELAY_MS,
  isKeyboardOpen,
  MOBILE_QUERY,
  shouldHideLauncher,
} from '../src/lib/warp/assistantGlobal.js';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';
const { createPilotPostRoute, assistantStatus, createAssistantStatusRoute } = await import('../src/lib/warp/assistantPilot.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const allow = async () => ({ allowed: true, retryAfterSeconds: 1 });

// Todas las páginas visuales del Pages Router, como rutas.
function pageRoutes() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (rel !== 'src/pages/api') walk(rel);
      } else if (/\.(js|jsx)$/.test(entry.name) && !entry.name.startsWith('_')) {
        const route = rel.replace(/^src\/pages/, '').replace(/\.(js|jsx)$/, '').replace(/\/index$/, '') || '/';
        out.push(route);
      }
    }
  };
  walk('src/pages');
  return out.sort();
}

test('GLOBAL 1: montado una sola vez en _app, fuera del layout de cada página', () => {
  const app = code('src/pages/_app.js');
  assert.match(app, /import WarpAssistantGlobal from '@\/components\/warp\/WarpAssistantGlobal';/);
  assert.equal(app.match(/<WarpAssistantGlobal \/>/g)?.length, 1);
  assert.ok(app.indexOf('<WarpAssistantGlobal />') > app.indexOf('getLayout(<Component'), 'fuera de getLayout: aplica a toda página');
  // Ninguna página lo monta por su cuenta (no hay listas manuales por página).
  for (const route of pageRoutes()) {
    const file = ['.js', '.jsx', '/index.js', '/index.jsx'].map((s) => `src/pages${route === '/' ? '/index' : route}${s}`).find((f) => fs.existsSync(path.join(ROOT, f)));
    if (file) assert.doesNotMatch(read(file), /WarpAssistantGlobal/, file);
  }
});

test('GLOBAL 2: aparece en todas las páginas visuales salvo el callback técnico y el piloto', () => {
  assert.deepEqual([...EXCLUDED_PATHS], ['/auth/callback', '/piloto-warp']);
  const routes = pageRoutes();
  assert.ok(routes.length > 60, `rutas: ${routes.length}`);
  const excluded = routes.filter((r) => !shouldMountAssistant(r));
  assert.deepEqual(excluded, ['/auth/callback', '/piloto-warp']);
  for (const r of ['/', '/eventos/[id]', '/colectas/[id]', '/inscripcion/[id]', '/m/[slug]', '/contacto', '/login', '/register',
    '/onboarding/pais', '/panel', '/crear-evento', '/checkout', '/rifas/[id]/checkout', '/eventos/pago/exito', '/eventos/orden/[token]',
    '/panel/eventos/[id]/scanner', '/panel/inscripciones/[id]/scanner', '/admin', '/admin/cumplimiento', '/404']) {
    assert.ok(routes.includes(r), `existe ${r}`);
    assert.equal(shouldMountAssistant(r), true, r);
  }
  for (const bad of ['', 'admin', undefined, null]) assert.equal(shouldMountAssistant(bad), false);
});

test('GLOBAL 3: encendido solo desde el servidor; la ruta de estado expone solo un booleano', async () => {
  assert.deepEqual(assistantStatus({ enabled: () => true, readConfig: () => ({ apiUrl: 'https://x', apiKey: 'k' }) }), { enabled: true });
  assert.deepEqual(assistantStatus({ enabled: () => false, readConfig: () => ({ apiUrl: 'https://x', apiKey: 'k' }) }), { enabled: false });
  assert.deepEqual(assistantStatus({ enabled: () => true, readConfig: () => null }), { enabled: false });
  assert.match(read('src/pages/api/warp/assistant.js'), /export default createAssistantStatusRoute\(\);/);
  const handler = createAssistantStatusRoute();
  const mk = () => { const r = { headers: {}, statusCode: 0 }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.status = (s) => { r.statusCode = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
  assert.doesNotMatch(JSON.stringify(assistantStatus({ enabled: () => true, readConfig: () => ({ apiUrl: 'https://warp.example', apiKey: 'clave-x' }) })), /warp\.example|clave-x/);
  const post = mk();
  handler({ method: 'POST' }, post);
  assert.equal(post.statusCode, 405);
  const prev = process.env.RIFEX_WARP_PILOT;
  delete process.env.RIFEX_WARP_PILOT;
  const get = mk();
  handler({ method: 'GET' }, get);
  if (prev !== undefined) process.env.RIFEX_WARP_PILOT = prev;
  assert.equal(get.statusCode, 200);
  assert.deepEqual(get.body, { enabled: false });
  assert.equal(get.headers['cache-control'], 'no-store');
});

test('GLOBAL 4: el widget habla solo con el chat de Rifex, sin cookies, referer ni cabeceras extra', async () => {
  const calls = [];
  const f = createAssistantFetch(async (url, opts) => { calls.push({ url, opts }); return new Response('{}'); });
  await f(ASSISTANT_ENDPOINTS.chat, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'sb=1', authorization: 'Bearer x' }, body: '{"message":"hola"}' });
  await f(ASSISTANT_ENDPOINTS.actions, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(calls.length, 2);
  for (const { opts } of calls) {
    assert.equal(opts.credentials, 'omit');
    assert.equal(opts.referrerPolicy, 'no-referrer');
    assert.equal(opts.mode, 'same-origin');
    assert.deepEqual(Object.keys(opts.headers), ['content-type']);
  }
  for (const bad of ['https://evil.com/api/warp/chat', '/api/warp/chat?x=1', '/api/auth', 'https://warp.example/api/v1/chat', '/api/warp/assistant']) {
    await assert.rejects(f(bad, { method: 'POST' }), /not_allowed/, bad);
  }
  assert.equal(calls.length, 2);
});

test('GLOBAL 5: si el estado falla, está apagado o responde algo raro, no se monta', async () => {
  assert.equal(await readAssistantStatus(async () => { throw new Error('red'); }), false);
  assert.equal(await readAssistantStatus(async () => new Response('x', { status: 404 })), false);
  assert.equal(await readAssistantStatus(async () => new Response('no-json')), false);
  assert.equal(await readAssistantStatus(async () => Response.json({ enabled: 'true' })), false);
  assert.equal(await readAssistantStatus(async () => Response.json({ enabled: false })), false);
  const seen = [];
  assert.equal(await readAssistantStatus(async (url, opts) => { seen.push([url, opts.credentials]); return Response.json({ enabled: true }); }), true);
  assert.deepEqual(seen, [['/api/warp/assistant', 'omit']]);
});

test('GLOBAL 6: sin contexto de página: no lee DOM, formularios, cookies, sesión, almacenamiento ni URL', () => {
  const cfg = buildAssistantConfig(() => {});
  assert.deepEqual(Object.keys(cfg).sort(), ['actionsEndpoint', 'endpoint', 'fetchImpl', 'launcherLabel', 'links', 'subtitle', 'title']);
  assert.deepEqual(cfg.links, { internalHosts: ['rifex-frontend-main.vercel.app'], allowedHosts: ['rifex-frontend-main.vercel.app'] });
  for (const p of ['src/components/warp/WarpAssistantGlobal.jsx', 'src/lib/warp/assistantGlobal.js']) {
    // Única excepción: el campo de mensaje del propio widget (su shadow root), nunca de la página.
    const src = code(p).replace("root.querySelector('form.compose textarea')", '');
    assert.doesNotMatch(src, /document\.cookie|localStorage|sessionStorage|indexedDB|supabase|getSession|getUser|\.auth\.|app_metadata/i, p);
    assert.doesNotMatch(src, /innerText|textContent|innerHTML|outerHTML|\.value\b|FormData|elements\[|<form|querySelector(All)?\([^)]*(input|textarea|select|form)|getElementsBy|\.forms\b/, p);
    assert.doesNotMatch(src, /location\.(href|search|hash)|document\.title|document\.referrer|navigator\./, p);
    assert.doesNotMatch(src, /WARP_AI_API_KEY|railway|NEXT_PUBLIC_[A-Z_]*WARP/i, p);
  }
  // Las únicas consultas al DOM: el propio widget y la geometría de las barras inferiores marcadas.
  const comp = code('src/components/warp/WarpAssistantGlobal.jsx');
  const selectors = [...comp.matchAll(/querySelector(?:All)?\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(selectors, ['BOTTOM_BAR_SELECTOR', "'.panel.open'", "'.panel.open'", "'form.compose textarea'", "'warp-floating-widget'"]);
  assert.match(comp, /root\.querySelector\('form\.compose textarea'\)\?\.focus\(\)/, 'el foco va al campo del propio widget');
  assert.match(comp, /host\.shadowRoot\?\.querySelector\('\.panel\.open'\)/, 'solo su propio panel');
  assert.match(comp, /const BOTTOM_BAR_SELECTOR = '\[data-rifex-bottom-bar\]';/);
  assert.match(comp, /getBoundingClientRect\(\)/);
  assert.doesNotMatch(comp, /sendMessage|\.send\(|client\./, 'nunca envía mensajes por su cuenta');
});

test('GLOBAL 7: el servidor reenvía a Warp solo mensaje y conversación, nunca cookies ni cabeceras del navegador', async () => {
  const fake = `prueba-${Math.random().toString(36).slice(2)}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rifex-global-'));
  let outbound = null;
  const route = createPilotPostRoute(
    (cfg) => createWarpChatRouteHandler({ ...cfg, fetchImpl: async (url, init) => { outbound = { url, init }; return Response.json({ conversationId: 'c1', message: 'ok' }); } }),
    {},
    { rateLimit: allow, enabled: () => true, readConfig: () => ({ apiUrl: 'https://warp.example', apiKey: fake }) },
  );
  const req = Readable.from([Buffer.from(JSON.stringify({ message: 'hola', conversationId: 'c1', page: '/checkout', email: 'a@b.cl' }))]);
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json', cookie: 'sb-access-token=secreto; mp=1', authorization: 'Bearer usuario', referer: 'https://rifex/checkout', 'x-forwarded-for': '203.0.113.9' };
  const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(s) { this.statusCode = s; return this; }, send(b) { this.body = b; return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
  await route(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(outbound.url, 'https://warp.example/api/v1/chat');
  assert.deepEqual(Object.keys(outbound.init.headers).sort(), ['authorization', 'content-type']);
  assert.equal(outbound.init.headers.authorization, `Bearer ${fake}`);
  assert.deepEqual(JSON.parse(outbound.init.body), { message: 'hola', conversationId: 'c1' });
  assert.doesNotMatch(JSON.stringify(outbound), /secreto|usuario|203\.0\.113\.9|checkout|a@b\.cl/);
  assert.ok(!String(res.body).includes(fake));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('GLOBAL 8: ajustes visuales coherentes con el paquete instalado y con las capas de Rifex', () => {
  const pkg = read('node_modules/@warp-ai/assistant/src/floatingWidget.js');
  assert.match(read('node_modules/@warp-ai/assistant/package.json'), /"version": "0\.7\.4"/);
  for (const sel of ['.warp-widget {', '.bottom-right {', '.panel {', '.expanded .panel {', '.launcher {', '.panel.open {', 'form.compose button {', 'header button {']) {
    assert.ok(pkg.includes(sel), `el paquete define ${sel}`);
  }
  assert.ok(pkg.includes('this.attachShadow({ mode: "open" })'), 'shadow root abierto (hoja adoptada)');
  assert.ok(pkg.includes('@media (max-width: 520px)'));
  assert.match(ASSISTANT_STYLE_OVERRIDES, /\.warp-widget \{ z-index: 30;/);
  // Por debajo de la cabecera (40), modales (50+), banners y overlays de pago.
  assert.match(read('src/components/Layout.jsx'), /\.rf-header \{\s*position: sticky;\s*top: 0;\s*z-index: 40;/);
  for (const [p, re] of [['src/components/ui/Modal.jsx', /zIndex:\s*1000/], ['src/components/ConsentBanner.jsx', /zIndex: 1000/], ['src/components/TrustPopup.jsx', /z-index: 999/], ['src/styles/checkoutV2.module.css', /z-index: 4000/]]) {
    assert.match(read(p), re, p);
  }
  assert.match(ASSISTANT_STYLE_OVERRIDES, /\.launcher \{ width: 48px; min-height: 48px; height: 48px;/, 'botón circular compacto');
  assert.match(ASSISTANT_STYLE_OVERRIDES, /@media \(max-width: 520px\)[\s\S]*\.launcher \{ width: 48px; \}/, 'compacto también en móvil');
  assert.match(ASSISTANT_STYLE_OVERRIDES, /\.launcher strong \{ position: absolute; width: 1px;/, 'texto accesible, no visible');
  assert.ok(pkg.includes('aria-label="${escapeAttribute(this.config.launcherLabel)}"'), 'el botón conserva su nombre accesible');
  assert.match(ASSISTANT_STYLE_OVERRIDES, /:focus-visible/, 'foco visible con teclado');
});

test('GLOBAL 9: se eleva sobre barras fijas inferiores visibles, con tope', () => {
  const vh = 800;
  assert.equal(computeBottomOffset([], vh), 0);
  assert.equal(computeBottomOffset([{ top: 778, bottom: 800, height: 22 }], vh), 22);
  assert.equal(computeBottomOffset([{ top: 778, bottom: 800, height: 22 }, { top: 700, bottom: 800, height: 100 }], vh), 100);
  assert.equal(computeBottomOffset([{ top: 100, bottom: 200, height: 100 }], vh), 0, 'no anclada abajo');
  assert.equal(computeBottomOffset([{ top: 900, bottom: 950, height: 50 }], vh), 0, 'fuera de pantalla');
  assert.equal(computeBottomOffset([{ top: 0, bottom: 800, height: 0 }], vh), 0, 'oculta');
  assert.equal(computeBottomOffset([{ top: 100, bottom: 800, height: 700 }], vh), MAX_BOTTOM_OFFSET);
  for (const p of ['src/components/DevBanner.jsx', 'src/components/ConsentBanner.jsx', 'src/components/TrustPopup.jsx']) {
    assert.match(read(p), /data-rifex-bottom-bar/, p);
  }
  const css = read('src/styles/globals.css');
  assert.match(css, /html\.rifex-assistant-active \.rf-foot \{ padding-bottom: var\(--rifex-assistant-reserve\); \}/);
  assert.match(css, /html\.rifex-assistant-active body:not\(:has\(\.rf-foot\)\) \{ padding-bottom: var\(--rifex-assistant-reserve\); \}/);
});

test('GLOBAL 10: sin Warp, Rifex sigue igual: carga diferida, errores silenciosos y apagado limpio', () => {
  const comp = code('src/components/warp/WarpAssistantGlobal.jsx');
  assert.match(comp, /import\('@warp-ai\/assistant'\)/, 'el paquete se carga solo si está encendido');
  assert.doesNotMatch(comp, /^import .*@warp-ai\/assistant/m);
  assert.match(comp, /\.catch\(\(\) => \{\}\)/);
  assert.match(comp, /widget\.destroy\(\)/);
  assert.match(comp, /classList\.remove\('rifex-assistant-active'\)/);
  assert.match(comp, /return null;\s*\}\s*$/);
  const app = code('src/pages/_app.js');
  assert.doesNotMatch(app, /@warp-ai\/assistant|assistantPilot|getInitialProps/);
});

test('GLOBAL 11: solo en móvil se oculta al editar un campo de la página o con teclado abierto (nunca en el asistente)', () => {
  const el = (tagName, extra = {}) => ({ tagName, ...extra });
  for (const f of [el('INPUT'), el('INPUT', { type: 'email' }), el('INPUT', { type: 'tel' }), el('INPUT', { type: 'password' }), el('TEXTAREA'), el('SELECT'), el('DIV', { isContentEditable: true })]) {
    assert.equal(isEditableField(f), true, JSON.stringify(f));
  }
  for (const f of [null, {}, el('BUTTON'), el('A'), el('INPUT', { type: 'submit' }), el('INPUT', { type: 'checkbox' }), el('INPUT', { type: 'radio' }), el('DIV'), el('WARP-FLOATING-WIDGET')]) {
    assert.equal(isEditableField(f), false, JSON.stringify(f));
  }
  const base = { mobile: true, pageFieldFocused: false, keyboardOpen: false, focusInAssistant: false, panelOpen: false };
  // Escritorio: siempre visible, aunque se escriba en un formulario.
  assert.equal(shouldHideLauncher({ ...base, mobile: false, pageFieldFocused: true, keyboardOpen: true }), false);
  // Móvil: se oculta con un campo de la página enfocado o el teclado abierto.
  assert.equal(shouldHideLauncher({ ...base, pageFieldFocused: true }), true);
  assert.equal(shouldHideLauncher({ ...base, keyboardOpen: true }), true);
  // Nunca mientras se escribe en el propio asistente o con su panel abierto.
  assert.equal(shouldHideLauncher({ ...base, keyboardOpen: true, focusInAssistant: true }), false);
  assert.equal(shouldHideLauncher({ ...base, pageFieldFocused: true, panelOpen: true }), false);
  // Reaparece al salir del campo.
  assert.equal(shouldHideLauncher(base), false);
  assert.equal(MOBILE_QUERY, '(max-width: 520px)');
  assert.equal(isKeyboardOpen(800, 780), false);
  assert.equal(isKeyboardOpen(800, 450), true);
  assert.equal(isKeyboardOpen(800, 0), false);
  assert.ok(FIELD_REVEAL_DELAY_MS >= 300, 'reaparece con retraso: nunca intercepta el clic de envío');
  const comp = code('src/components/warp/WarpAssistantGlobal.jsx');
  assert.match(comp, /window\.matchMedia\(MOBILE_QUERY\)/);
  assert.match(comp, /pageFieldFocused: active !== host && isEditableField\(active\)/);
  assert.match(comp, /focusInAssistant: active === host/);
  assert.match(comp, /removeEventListener\('focusin', onFocusIn\)/);
});

test('GLOBAL 12: al abrir con el botón el foco pasa al campo de mensaje del widget', () => {
  const pkg = read('node_modules/@warp-ai/assistant/src/floatingWidget.js');
  assert.ok(pkg.includes('<form class="compose">') && pkg.includes('<textarea maxlength='), 'el paquete tiene form.compose textarea');
  assert.ok(pkg.includes('<button class="launcher" type="button"'), 'botón .launcher');
  const comp = code('src/components/warp/WarpAssistantGlobal.jsx');
  assert.match(comp, /root\.addEventListener\('click', onClick\)/);
  assert.match(comp, /root\.removeEventListener\('click', onClick\)/);
  assert.match(comp, /target\?\.closest\?\.\('\.launcher'\)/);
});
