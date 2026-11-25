// src/lib/warp/pilotLinks.js
// Política de enlaces del asistente de Warp en Rifex PROD (Assistant 0.7.5).
// La lista nombra exactamente el dominio canónico de producción: es interno
// (muestra la ruta) y es el único dominio enlazable. Sin comodines; cualquier
// otro dominio (incluido el de DEV), http:, javascript:, data: o file: queda
// como texto. El dominio de la propia página siempre es interno
// (comportamiento del paquete). Cambiar esta lista es una decisión explícita
// por ambiente: en DEV es rifex-frontend-main.vercel.app.
export const PILOT_LINK_HOSTS = Object.freeze(['rifex.pro']);

export const PILOT_LINK_POLICY = Object.freeze({
  internalHosts: [...PILOT_LINK_HOSTS],
  allowedHosts: [...PILOT_LINK_HOSTS],
});
