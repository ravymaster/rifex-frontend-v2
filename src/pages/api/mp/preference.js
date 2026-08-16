// src/pages/api/mp/preference.js
//
// Ruta legacy deshabilitada. Aceptaba el monto a cobrar (amountCLP) y la
// comisión (rifexFeeCLP) directo del cliente, sin verificarlos contra el
// precio real de la rifa ni requerir sesión — cualquiera podía pagar lo que
// quisiera por un número, o poner la comisión de Rifex en 0. También leía
// de la tabla legacy `rifas` en vez de `raffles`. Su único llamador
// (src/components/Grid.js) ya está huérfano (no lo importa ninguna página),
// pero al ser una ruta de API sigue siendo pública por URL directa aunque
// nada la enlace, así que hay que responder algo, no solo dejar de usarla.
// El checkout real y seguro es /api/checkout/mp.
export default async function handler(req, res) {
  return res.status(410).json({
    ok: false,
    error: "endpoint_disabled",
    message: "Usa /api/checkout/mp para crear la preferencia de pago.",
  });
}
