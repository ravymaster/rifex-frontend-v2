// src/lib/medidorQrQuota.js
// MEDIDOR QR V1 — FREE QUOTA ADJUSTMENT (2026-09-09): 10 Medidores QR
// gratis por cuenta/mes calendario (antes 1). Exportado una sola vez
// para que la API de creación y la de consulta de cupo nunca puedan
// desincronizarse entre sí. La autoridad REAL de la cuota sigue
// siendo exclusivamente la RPC create_medidor_qr (mismo valor
// hardcodeado ahí, ver db/migrations/2026-09-09_medidor_qr_free_quota_10.sql)
// — esta constante es solo para mensajes/UI en la capa Node, nunca la
// fuente de verdad.
export const MEDIDOR_QR_FREE_QUOTA_LIMIT = 10;
