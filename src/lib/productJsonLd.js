// src/lib/productJsonLd.js
// RIFEX PRODUCT LANDINGS V1 — JSON-LD builders for the 3 public product
// landings (Eventos, Campañas, Inscripciones). Never used on the private
// Rifas landing (PSCG PRIVATE_AUTHENTICATED pages carry no public
// structured data — see PUBLIC_SURFACE_CLASSIFICATION_GUARD.md).
//
// Same caution as src/pages/index.js's existing Organization/WebSite
// JSON-LD: only verifiable facts, never invented ratings/reviews/
// certifications/guarantees.
// Import relativo (no '@/lib/...') a propósito: este módulo se importa
// directamente en tests/productLandingsV1.test.mjs vía node:test, que no
// resuelve el alias '@/' (solo Next.js/webpack lo hace) — mismo criterio
// ya usado por los demás módulos de src/lib que SÍ son importados en
// tests reales, nunca solo leídos como texto.
import { SITE_URL } from './publicMetadata.js';

export function buildServiceJsonLd({ name, description, url }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description,
    url,
    provider: {
      '@type': 'Organization',
      name: 'Rifex',
      url: SITE_URL,
    },
  };
}

// Only call this with the exact question/answer pairs actually rendered
// in the page's visible <details>/<summary> FAQ — PSCG forbids JSON-LD
// content that isn't real rendered HTML.
export function buildFaqJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}
