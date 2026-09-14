// src/lib/socialLinks.js
// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — única fuente de
// verdad para los enlaces de redes sociales del footer. Rodrigo dio las
// URLs reales de Facebook/Instagram/TikTok/WhatsApp; YouTube y X quedan
// preparados con valor null hasta tener sus URLs reales — nunca se
// renderiza un ícono sin enlace real (cero href="#", cero placeholders
// falsos). Una misión futura solo necesita cambiar `null` por la URL
// real acá, sin tocar Layout.jsx.
export const SOCIAL_LINKS = {
  facebook: 'https://www.facebook.com/rifexpro/',
  instagram: 'https://www.instagram.com/rifexpro/',
  tiktok: 'https://www.tiktok.com/@rifexpro',
  whatsapp: 'https://wa.me/56959904311',
  youtube: null,
  x: null,
};
