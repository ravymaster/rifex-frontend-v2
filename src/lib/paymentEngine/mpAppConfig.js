// src/lib/paymentEngine/mpAppConfig.js
// Configuración de la app de Mercado Pago SEPARADA por país. CL sigue
// leyendo exactamente las mismas env vars de siempre — cero renombres,
// cero cambio de comportamiento. AR lee env vars propias y nuevas, hoy sin
// configurar en ningún entorno: por diseño, hasta que se carguen
// credenciales test reales, getMpAppConfig('AR') no tiene clientId y
// cualquier llamador debe fallar cerrado.
//
// Este módulo SÍ lee process.env (a diferencia del resto del núcleo puro
// de paymentEngine/) porque su único trabajo es resolver secretos
// server-side — nunca los expone, nunca los loguea. Server-only.
function getMpAppConfig(country) {
  if (country === "CL") {
    return {
      country: "CL",
      clientId: process.env.MP_CLIENT_ID || null,
      clientSecret: process.env.MP_CLIENT_SECRET || null,
      webhookSecret: process.env.MP_WEBHOOK_SECRET || null,
      platformAccessToken: process.env.MP_ACCESS_TOKEN || null,
    };
  }
  if (country === "AR") {
    return {
      country: "AR",
      clientId: process.env.MP_CLIENT_ID_AR || null,
      clientSecret: process.env.MP_CLIENT_SECRET_AR || null,
      webhookSecret: process.env.MP_WEBHOOK_SECRET_AR || null,
      platformAccessToken: process.env.MP_ACCESS_TOKEN_AR || null,
    };
  }
  return null; // país sin app de MP prevista todavía
}

function isMpAppReady(country) {
  const cfg = getMpAppConfig(country);
  return !!(cfg && cfg.clientId);
}

module.exports = { getMpAppConfig, isMpAppReady };
