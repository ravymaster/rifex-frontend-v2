// src/lib/warp/assistantGlobal.js
// Asistente de Warp en todas las páginas visuales de Rifex (montaje global en
// _app.js). Lógica pura, sin React, para poder probarla.
//
// Privacidad (el asistente es solo una guía informativa pública):
//   - El widget envía únicamente lo que la persona escribe, el id de su
//     conversación y, desde 0.7.5, el pageContext fijo de la ruta (tabla
//     cerrada de pageContexts.js por plantilla de ruta). No se leen el DOM,
//     formularios, cookies, sesión, almacenamiento ni la URL real.
//   - El navegador habla solo con las dos rutas del chat de Rifex, sin
//     cookies (`credentials: "omit"`) ni referer; cualquier otra URL se
//     rechaza. El servidor reenvía a Warp solo mensaje + conversationId.
//   - Encendido/apagado: lo decide el servidor (RIFEX_WARP_PILOT, ver
//     assistantPilot.js) mediante GET /api/warp/assistant. Si falla o está
//     apagado, no se monta nada y la página sigue igual.
import { PILOT_LINK_POLICY } from './pilotLinks.js';

export const ASSISTANT_ENDPOINTS = Object.freeze({
  status: '/api/warp/assistant',
  chat: '/api/warp/chat',
  actions: '/api/warp/chat/actions',
});

// Rutas visuales donde NO se monta el botón global:
//   - /auth/callback: callback técnico de inicio de sesión (canjea ?code= y
//     redirige), sin interfaz propia.
//   - /piloto-warp: conserva temporalmente su propio widget de comparación.
// /api/**, webhooks, cron y archivos estáticos no pasan por _app.
export const EXCLUDED_PATHS = Object.freeze(['/auth/callback', '/piloto-warp']);

export function shouldMountAssistant(pathname) {
  const p = String(pathname || '');
  if (!p.startsWith('/')) return false;
  return !EXCLUDED_PATHS.includes(p);
}

// fetch del widget: solo las dos rutas del chat, sin cookies ni referer y
// solo con la cabecera content-type.
export function createAssistantFetch(baseFetch) {
  const allowed = new Set([ASSISTANT_ENDPOINTS.chat, ASSISTANT_ENDPOINTS.actions]);
  return function assistantFetch(url, options = {}) {
    const target = String(url);
    if (!allowed.has(target)) return Promise.reject(new Error('assistant_endpoint_not_allowed'));
    const contentType = options.headers?.['content-type'] || options.headers?.['Content-Type'] || 'application/json';
    return baseFetch(target, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: options.body,
      signal: options.signal,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      mode: 'same-origin',
    });
  };
}

export async function readAssistantStatus(baseFetch) {
  try {
    const res = await baseFetch(ASSISTANT_ENDPOINTS.status, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.enabled === true;
  } catch {
    return false;
  }
}

export function buildAssistantConfig(fetchImpl, pageContext = null) {
  return {
    title: 'Asistente Rifex',
    subtitle: 'Orientación con información pública',
    launcherLabel: 'Asistente',
    endpoint: ASSISTANT_ENDPOINTS.chat,
    actionsEndpoint: ASSISTANT_ENDPOINTS.actions,
    links: { internalHosts: [...PILOT_LINK_POLICY.internalHosts], allowedHosts: [...PILOT_LINK_POLICY.allowedHosts] },
    fetchImpl,
    // 0.7.5: contexto de la página actual desde la tabla cerrada de Rifex
    // (pageContexts.js); null si la ruta no está mapeada.
    pageContext,
  };
}

// Ajustes visuales de Rifex sobre el widget 0.7.4 (hoja adoptada en su shadow
// root; sobrevive a cada render y gana a los estilos del paquete):
//   - z-index 30: por debajo de la cabecera (40), menús, modales (50+),
//     overlays de pago y banners; nunca tapa un diálogo de Rifex.
//   - se eleva sobre las barras fijas inferiores marcadas con
//     data-rifex-bottom-bar (--rifex-assistant-bottom);
//   - el botón es un círculo compacto de 48 px (el texto queda en su
//     aria-label) en escritorio y móvil; el panel abierto en móvil usa el
//     ancho disponible.
// Los selectores dependen de la versión fijada del paquete; las pruebas los
// verifican contra el paquete instalado.
export const ASSISTANT_STYLE_OVERRIDES = `
  .warp-widget { z-index: 30; bottom: calc(20px + var(--rifex-assistant-bottom, 0px)); }
  .bottom-right { right: 20px; }
  .panel { max-height: min(680px, calc(100vh - 120px - var(--rifex-assistant-bottom, 0px))); }
  .expanded .panel { max-height: min(860px, calc(100vh - 90px - var(--rifex-assistant-bottom, 0px))); }
  .launcher { width: 48px; min-height: 48px; height: 48px; padding: 0; justify-content: center; border-radius: 999px; }
  .launcher strong { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .launcher:focus-visible, header button:focus-visible, form.compose button:focus-visible { outline: 3px solid #f59e0b; outline-offset: 2px; }
  @media (max-width: 520px) {
    .warp-widget { left: auto; right: 12px; bottom: calc(12px + var(--rifex-assistant-bottom, 0px)); }
    .launcher { width: 48px; }
    .warp-widget:has(.panel.open) { left: 12px; right: 12px; }
  }
`;

export const MAX_BOTTOM_OFFSET = 240;

// Solo en móvil, mientras la persona edita un campo de la página o el
// teclado virtual está abierto, el botón se oculta para no tapar el envío;
// en escritorio siempre queda visible. Nunca se oculta si se escribe dentro
// del propio asistente. Solo se mira el tipo del elemento enfocado, nunca su
// valor ni su contenido.
export const FIELD_REVEAL_DELAY_MS = 400;
export const MOBILE_QUERY = '(max-width: 520px)';
export const KEYBOARD_MIN_HEIGHT = 150;

export function isKeyboardOpen(layoutHeight, visualHeight) {
  if (!(layoutHeight > 0) || !(visualHeight > 0)) return false;
  return layoutHeight - visualHeight >= KEYBOARD_MIN_HEIGHT;
}

export function shouldHideLauncher({ mobile, pageFieldFocused, keyboardOpen, focusInAssistant, panelOpen }) {
  if (!mobile || focusInAssistant || panelOpen) return false;
  return Boolean(pageFieldFocused || keyboardOpen);
}
export function isEditableField(el) {
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') return !['button', 'submit', 'reset', 'checkbox', 'radio', 'hidden', 'image', 'file', 'range', 'color'].includes(String(el.type || 'text').toLowerCase());
  return el.isContentEditable === true;
}

// Altura ocupada por barras fijas inferiores visibles (solo geometría de
// elementos de Rifex marcados; nunca su contenido).
export function computeBottomOffset(rects, viewportHeight) {
  let offset = 0;
  for (const r of rects) {
    if (!r || !(r.height > 0)) continue;
    if (r.bottom < viewportHeight - 2 || r.top >= viewportHeight) continue;
    offset = Math.max(offset, viewportHeight - r.top);
  }
  return Math.min(MAX_BOTTOM_OFFSET, Math.max(0, Math.round(offset)));
}
