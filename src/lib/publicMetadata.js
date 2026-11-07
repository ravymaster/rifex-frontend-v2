// src/lib/publicMetadata.js
// RIFEX V4 A1 — infraestructura mínima y reutilizable de metadata pública
// (canonical/Open Graph/Twitter). Puro, sin red, sin dependencias nuevas.
// Nunca entrega HTML diferente a rastreadores vs personas — solo centraliza
// los valores que cada página ya decide mostrar.
export const SITE_URL = "https://rifex.pro";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/images/og/default-og.png`;

// path debe empezar con "/". Devuelve una URL absoluta canónica, sin query
// ni hash (el canonical de una página nunca debe variar por parámetros
// de tracking o de estado de UI).
export function canonicalUrl(path = "/") {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${clean}`;
}
