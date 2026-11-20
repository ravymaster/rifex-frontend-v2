// src/lib/paymentEngine/statusNormalizer.js
// Traduce el status crudo de un proveedor al status neutral de Rifex.
// El set neutral es exactamente el que ya exige la constraint real de DB
// (colecta_contributions_status_check: pending | approved | rejected) —
// no se inventan estados nuevos que la DB no acepte.
//
// Mapeo fiel al que ya usa colectaReconcile.js::computeColectaTransition,
// extraído acá sin cambiar ese archivo.
const MP_STATUS_MAP = {
  approved: "approved",
  rejected: "rejected",
  cancelled: "rejected",
  charged_back: "rejected",
  pending: "pending",
  in_process: "pending",
  authorized: "pending",
  in_mediation: "pending",
  refunded: "rejected",
};

function normalizeProviderStatus(provider, rawStatus) {
  if (provider === "mercado_pago") {
    const key = String(rawStatus || "").toLowerCase();
    // Cualquier status desconocido de MP se trata como 'pending', nunca como
    // 'approved' — fail-safe: mejor reconciliar de más que acreditar de más.
    return MP_STATUS_MAP[key] || "pending";
  }
  throw new Error(`normalizeProviderStatus: proveedor no soportado "${provider}"`);
}

module.exports = { normalizeProviderStatus, MP_STATUS_MAP };
