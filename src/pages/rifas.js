// src/pages/rifas.jsx
// RIFEX V4 — DECISIÓN DE PRODUCTO RESUELTA (Rodrigo, 2026-08-31): el
// catálogo público general de rifas queda eliminado. Ya no debe existir
// una página pública que liste/explore todas las iniciativas con premio.
// /rifas redirige de forma segura a /login (preservando `next` cuando el
// mecanismo existente de sanitización lo permite) — el módulo Rifas en sí
// (creación, panel, /rifas/[id]) permanece intacto y sin cambios.
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function RifasRedirect() {
  const router = useRouter();

  useEffect(() => {
    const raw = (router.query?.next || '').toString();
    const next = raw.startsWith('/') ? raw : '/panel';
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [router]);

  return null;
}

// Sin catálogo, sin Layout, sin metadata pública — esta ruta nunca debe
// dominar navegación ni SEO: no está en el sitemap, no se enlaza desde
// navegación pública, y robots.txt la excluye explícitamente.
export async function getServerSideProps({ res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return { props: {} };
}
