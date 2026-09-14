// src/pages/rifas.jsx
// RIFEX V4 — DECISIÓN DE PRODUCTO RESUELTA (Rodrigo, 2026-08-31): el
// catálogo público general de rifas queda eliminado. Ya no debe existir
// una página pública que liste/explore todas las iniciativas con premio.
// /rifas redirige de forma segura a /login (preservando `next` cuando el
// mecanismo existente de sanitización lo permite) — el módulo Rifas en sí
// (creación, panel, /rifas/[id]) permanece intacto y sin cambios.
// PUBLIC SURFACE FINAL CLEANUP — el redirect antes ocurría solo client-side
// (useEffect + router.replace), por lo que un request sin JS (curl, muchas
// herramientas de auditoría) recibía 200 con una página en blanco en vez de
// un redirect real. Se convierte a getServerSideProps para que cualquier
// cliente, con o sin JS, reciba el mismo 307 real — mismo destino, misma
// lógica de sanitización de `next`, sin agregar ni quitar función.
export async function getServerSideProps({ query, res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const raw = (query?.next || '').toString();
  const next = raw.startsWith('/') ? raw : '/panel';
  return {
    redirect: { destination: `/login?next=${encodeURIComponent(next)}`, permanent: false },
  };
}

export default function RifasRedirect() {
  return null;
}
