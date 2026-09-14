// src/lib/raffleLabels.js
// RIFEX RAFFLE EXPERIENCE 2026 — nunca mostrar valores internos crudos
// (active/closed/draft/money/physical) directamente en la UI pública.
// Mapeo puro, sin lógica de negocio: si el valor no está en el mapa,
// se devuelve tal cual para no ocultar un estado real desconocido.

const STATUS_LABELS = {
  draft: "Borrador",
  active: "Activa",
  closed: "Finalizada",
};

const PRIZE_TYPE_LABELS = {
  money: "Premio en dinero",
  physical: "Premio físico",
};

export function humanRaffleStatus(status) {
  if (!status) return "Activa";
  return STATUS_LABELS[status] || status;
}

export function humanPrizeType(prizeType) {
  if (!prizeType) return "";
  return PRIZE_TYPE_LABELS[prizeType] || prizeType;
}
