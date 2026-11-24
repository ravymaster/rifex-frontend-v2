// src/lib/warp/assistantPrefill.js
// Preguntas sugeridas de /warp-conversacional: abren el asistente y dejan la
// pregunta ESCRITA en el campo de mensaje. Nunca la envían: la persona decide
// si la manda. Solo se aceptan las preguntas de esta lista cerrada.
//
// La página dispara un evento del navegador; WarpAssistantGlobal lo escucha,
// fija el borrador del cliente de chat del paquete y abre el panel.

export const ASSISTANT_PREFILL_EVENT = 'rifex:warp-assistant-prefill';

export const SUGGESTED_QUESTIONS = Object.freeze([
  '¿Qué es Rifex?',
  '¿Qué servicios ofrece Rifex?',
  '¿Cómo puedo crear un evento?',
  '¿Dónde están los términos?',
  '¿Cómo puedo contratar Warp Conversacional?',
]);

export function isAllowedPrefill(text) {
  return typeof text === 'string' && SUGGESTED_QUESTIONS.includes(text);
}

// Navegador: pide precargar una pregunta. Devuelve true si el asistente la
// recibió (está encendido y montado en esta página).
export function requestAssistantPrefill(question, target = typeof window !== 'undefined' ? window : null) {
  if (!target || !isAllowedPrefill(question)) return false;
  const detail = { question, handled: false };
  target.dispatchEvent(new CustomEvent(ASSISTANT_PREFILL_EVENT, { detail }));
  return detail.handled === true;
}

// Lado del asistente: escucha el evento y precarga. No llama a send().
export function listenForPrefill(target, { client, widget, focus } = {}) {
  if (!target?.addEventListener || !client || !widget) return () => {};
  const onPrefill = (event) => {
    const question = event?.detail?.question;
    if (!isAllowedPrefill(question)) return;
    client.setDraftText(question);
    widget.open();
    if (event.detail) event.detail.handled = true;
    if (typeof focus === 'function') focus();
  };
  target.addEventListener(ASSISTANT_PREFILL_EVENT, onPrefill);
  return () => target.removeEventListener(ASSISTANT_PREFILL_EVENT, onPrefill);
}
