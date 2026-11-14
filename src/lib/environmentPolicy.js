// src/lib/environmentPolicy.js
// Fuente única de verdad para saber si estamos en DEV. Fail-safe hacia
// producción: SOLO el string exacto 'development' activa relajaciones de
// DEV. Cualquier otro valor (vacío, undefined, 'production', 'dev' — el
// valor legacy que ya existía en Vercel PROD antes de D5 — o un typo)
// se trata como producción. No invertir esta lógica.
const STAGE = process.env.NEXT_PUBLIC_STAGE;

export function getStage() {
  return STAGE || "production";
}

export function isDevStage() {
  return STAGE === "development";
}
