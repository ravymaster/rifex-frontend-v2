// src/lib/registrationFreeQuota.js
// INSCRIPCIONES V1 — cálculo puro del "período" de la cuota mensual
// FREE (1 inscripción gratis por MES CALENDARIO por cuenta, nunca
// rolling 30 días — ver sección 11 del mandato). Criterio único y
// documentado: mes calendario en UTC, formato "YYYY-MM". Sin I/O, para
// que sea testeable con un `now` inyectado y para que la API y
// cualquier futura UI usen exactamente el mismo cálculo que la fila que
// termina en registration_free_usage.period_key.
//
// La autoridad real de "ya se usó este período" es el UNIQUE
// (organizer_id, period_key) en registration_free_usage — este módulo
// solo calcula qué string de período corresponde a un instante dado,
// nunca decide si el cupo está disponible.

export function currentFreePeriodKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Primer instante (UTC) del próximo mes calendario después de `now` —
// usado únicamente para el mensaje "podrás crear otra gratis a partir
// del [fecha]" (sección 13 del mandato). Nunca se usa para decidir
// elegibilidad — eso lo decide exclusivamente el UNIQUE constraint.
export function nextFreePeriodStartsAt(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}
