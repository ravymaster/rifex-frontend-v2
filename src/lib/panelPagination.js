// src/lib/panelPagination.js
// RIFEX PANEL SCALABILITY (2026-09-05) — única fuente de verdad para
// parsear/sanear `?page=` en los endpoints de listados privados
// (Mis Inscripciones, Mis Eventos, participantes de una inscripción).
// Fail-safe: cualquier valor que no sea un entero positivo razonable
// cae a la página 1 — nunca un error 400 por esto, nunca NaN/negativo/
// float propagado a un `.range()` de Supabase.
export function parsePage(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 1_000_000) return 1_000_000; // overflow razonable, nunca Infinity/NaN aguas abajo
  return n;
}

// Dado un total real y un pageSize fijo, calcula totalPages (mínimo 1
// incluso con total=0, para que la UI nunca divida por cero) y clampea
// la página pedida a ese rango — page > totalPages cae a la última
// página real, nunca a un offset fuera de rango.
export function resolvePagination(page, pageSize, total) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const offset = (clampedPage - 1) * pageSize;
  return {
    page: clampedPage,
    pageSize,
    total: total || 0,
    totalPages,
    from: offset,
    to: offset + pageSize - 1,
  };
}
