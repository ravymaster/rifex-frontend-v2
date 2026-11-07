// src/lib/paymentEngine/money.js
// Dinero siempre en unidades enteras menores (p.ej. centavos de CLP). Nunca
// floats. CommonJS a propósito (no ESM) para poder correr los tests de este
// módulo con `node --test` directo, sin agregar herramientas nuevas al repo.

function isIntegerMinor(n) {
  return Number.isInteger(n) && n >= 0;
}

// Convierte un monto decimal tal como lo entrega un proveedor (p.ej.
// mp.transaction_amount: 1000.5) a unidades enteras menores. Mismo cálculo
// que hoy hacen a mano webhook.js / reconcile-payments.js / colectaReconcile.js
// (Math.round(amount * 100)) — centralizado acá, sin tocar esos archivos.
function toMinorFromDecimal(decimalAmount, minorPerMajor = 100) {
  const n = Number(decimalAmount);
  if (!Number.isFinite(n)) throw new Error("toMinorFromDecimal: monto inválido");
  return Math.round(n * minorPerMajor);
}

function addMinor(...amounts) {
  return amounts.reduce((sum, a) => {
    if (!isIntegerMinor(a)) throw new Error("addMinor: todos los montos deben ser enteros >= 0");
    return sum + a;
  }, 0);
}

module.exports = { isIntegerMinor, toMinorFromDecimal, addMinor };
