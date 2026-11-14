// src/pages/soluciones/eventos.jsx
// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — decisión de producto
// de Rodrigo: /eventos pasa a ser la URL única y definitiva de Eventos
// (landing comercial + catálogo real, ver src/pages/eventos/index.jsx).
// Esta ruta, creada en PRODUCT LANDINGS V1, queda retirada como landing
// independiente y se convierte en un redirect permanente real
// (getServerSideProps, 308) hacia /eventos — mismo patrón ya certificado
// en src/pages/rifas.js (X-Robots-Tag noindex,nofollow, sin depender de
// JS cliente). PSCG: LEGACY_REMOVED (reemplazo de contenido realmente
// equivalente — a diferencia de /rifas, acá si hay un reemplazo 1:1).
export async function getServerSideProps({ res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return {
    redirect: { destination: '/eventos', permanent: true },
  };
}

export default function SolucionesEventosRedirect() {
  return null;
}
