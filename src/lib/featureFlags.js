// src/lib/featureFlags.js
// Config mínima y pura de features de Rifex (A2-B). Solo lectura — no hay
// DB ni panel editable todavía. Mismo principio que countryPolicy.js: una
// única fuente de verdad, sin imports server-only, importable desde
// cliente y servidor por igual.
export const FEATURE_FLAGS = {
  raffles: { label: "Rifas", status: "on" },
  fundraising: { label: "Campañas", status: "on" },
  events: { label: "Eventos", status: "off" },
  ai: { label: "IA", status: "off" },
  highValueRaffles: { label: "Rifas alto valor", status: "review" },
};
