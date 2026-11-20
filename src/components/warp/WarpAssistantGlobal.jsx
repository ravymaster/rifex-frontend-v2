// src/components/warp/WarpAssistantGlobal.jsx
// Botón flotante del asistente de Warp en todas las páginas visuales de
// Rifex (montado una sola vez en _app.js; la conversación se mantiene al
// navegar). Reglas de privacidad y visuales: src/lib/warp/assistantGlobal.js.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  ASSISTANT_STYLE_OVERRIDES,
  buildAssistantConfig,
  computeBottomOffset,
  createAssistantFetch,
  FIELD_REVEAL_DELAY_MS,
  isEditableField,
  isKeyboardOpen,
  MOBILE_QUERY,
  shouldHideLauncher,
  readAssistantStatus,
  shouldMountAssistant,
} from '@/lib/warp/assistantGlobal';
import { pageContextFor } from '@/lib/warp/pageContexts';

const BOTTOM_BAR_SELECTOR = '[data-rifex-bottom-bar]';

function adoptOverrides(host) {
  const root = host?.shadowRoot;
  if (!root || typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in root)) return;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(ASSISTANT_STYLE_OVERRIDES);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}

// Eleva el botón sobre las barras fijas inferiores de Rifex (banner DEV,
// consentimiento, aviso de seguridad). Solo mide su posición.
function watchBottomBars() {
  const html = document.documentElement;
  let frame = 0;
  const update = () => {
    frame = 0;
    const rects = [...document.querySelectorAll(BOTTOM_BAR_SELECTOR)].map((el) => el.getBoundingClientRect());
    html.style.setProperty('--rifex-assistant-bottom', `${computeBottomOffset(rects, window.innerHeight)}px`);
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  update();
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    if (frame) window.cancelAnimationFrame(frame);
    html.style.removeProperty('--rifex-assistant-bottom');
  };
}

// Solo en móvil: oculta el botón mientras se edita un campo de la página o
// el teclado virtual está abierto; nunca si el foco está en el asistente.
// Solo usa el tipo del elemento enfocado y la altura del viewport.
function hideWhileEditing(host) {
  let timer = 0;
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const viewport = window.visualViewport;
  const evaluate = () => {
    const active = document.activeElement;
    const hide = shouldHideLauncher({
      mobile: mobileQuery.matches,
      pageFieldFocused: active !== host && isEditableField(active),
      keyboardOpen: viewport ? isKeyboardOpen(window.innerHeight, viewport.height) : false,
      focusInAssistant: active === host,
      panelOpen: Boolean(host.shadowRoot?.querySelector('.panel.open')),
    });
    if (hide) {
      host.style.visibility = 'hidden';
      host.style.pointerEvents = 'none';
    } else {
      host.style.removeProperty('visibility');
      host.style.removeProperty('pointer-events');
    }
  };
  const onFocusIn = () => {
    window.clearTimeout(timer);
    evaluate();
  };
  const onLater = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(evaluate, FIELD_REVEAL_DELAY_MS);
  };
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onLater);
  viewport?.addEventListener('resize', onLater);
  mobileQuery.addEventListener?.('change', evaluate);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onLater);
    viewport?.removeEventListener('resize', onLater);
    mobileQuery.removeEventListener?.('change', evaluate);
    host.style.removeProperty('visibility');
    host.style.removeProperty('pointer-events');
  };
}

// Al abrir el panel desde el botón (mouse o Enter), el paquete reconstruye su
// HTML y el foco se pierde; se lleva al campo de mensaje del propio widget
// para que el recorrido con teclado continúe ahí. Solo toca su shadow root.
function focusComposerOnOpen(host) {
  const root = host.shadowRoot;
  if (!root) return () => {};
  const onClick = (event) => {
    const target = event.composedPath?.()[0] || event.target;
    if (!target?.closest?.('.launcher')) return;
    window.setTimeout(() => {
      if (root.querySelector('.panel.open')) root.querySelector('form.compose textarea')?.focus();
    }, 0);
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

export default function WarpAssistantGlobal() {
  const { pathname } = useRouter();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readAssistantStatus(window.fetch.bind(window)).then((on) => {
      if (!cancelled) setEnabled(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = enabled && shouldMountAssistant(pathname);
  const widgetRef = useRef(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (!active) return undefined;
    let widget = null;
    let stopWatching = null;
    let stopHiding = null;
    let stopFocus = null;
    let cancelled = false;
    const html = document.documentElement;
    import('@warp-ai/assistant')
      .then(({ createWarpWidgetGlobal }) => {
        if (cancelled) return;
        widget = createWarpWidgetGlobal();
        // Contexto inicial: la plantilla de la ruta actual (nunca la URL real).
        widget.init(buildAssistantConfig(createAssistantFetch(window.fetch.bind(window)), pageContextFor(pathnameRef.current)));
        widgetRef.current = widget;
        const hosts = document.querySelectorAll('warp-floating-widget');
        const host = hosts[hosts.length - 1];
        adoptOverrides(host);
        if (host) {
          stopHiding = hideWhileEditing(host);
          stopFocus = focusComposerOnOpen(host);
        }
        stopWatching = watchBottomBars();
        html.classList.add('rifex-assistant-active');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      html.classList.remove('rifex-assistant-active');
      if (stopWatching) stopWatching();
      if (stopHiding) stopHiding();
      if (stopFocus) stopFocus();
      widgetRef.current = null;
      if (widget) widget.destroy();
    };
  }, [active]);

  // Navegación interna: misma conversación, nuevo contexto (o ninguno si la
  // ruta no está en la tabla).
  useEffect(() => {
    widgetRef.current?.setPageContext?.(pageContextFor(pathname));
  }, [pathname]);

  return null;
}
