// src/lib/medidorQrVisitor.js
// MEDIDOR QR V1 — visitor_key opaco de navegador (localStorage), mismo
// criterio anti-duplicación que Inscripciones/Eventos: nunca ligado a
// identidad real, deliberadamente NO robusto contra localStorage
// limpiado/incógnito — la autoridad real de "ya respondió" es el
// UNIQUE(medidor_qr_id, visitor_key) del lado servidor, esto es solo
// el token que el cliente envía en cada request.
const STORAGE_KEY = 'rifex_medidor_qr_visitor_key';

function randomKey() {
  const a = crypto.randomUUID().replace(/-/g, '');
  const b = crypto.randomUUID().replace(/-/g, '');
  return `${a}${b}`;
}

export function getOrCreateVisitorKey() {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 16 && existing.length <= 128) return existing;
    const fresh = randomKey();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // localStorage indisponible (modo incógnito estricto, storage
    // lleno, etc.) — se genera una key efímera solo para esta carga de
    // página, nunca se rompe la respuesta por esto.
    return randomKey();
  }
}
