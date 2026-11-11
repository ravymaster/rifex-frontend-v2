// src/lib/warp/pilotLinks.js
// Política de enlaces del asistente en la página piloto (Assistant 0.7.4).
// La página piloto solo existe en Rifex DEV, así que la lista nombra
// exactamente su dominio: es interno (muestra la ruta) y es el único dominio
// enlazable. Sin comodines; cualquier otro dominio, http:, javascript:,
// data: o file: queda como texto. El dominio de la propia página siempre es
// interno (comportamiento del paquete). Cambiar esta lista es una decisión
// explícita por ambiente.
export const PILOT_LINK_HOSTS = Object.freeze(['rifex-frontend-main.vercel.app']);

export const PILOT_LINK_POLICY = Object.freeze({
  internalHosts: [...PILOT_LINK_HOSTS],
  allowedHosts: [...PILOT_LINK_HOSTS],
});
