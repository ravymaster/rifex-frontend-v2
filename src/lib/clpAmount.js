// src/lib/clpAmount.js
// Validación única de montos CLP configurados por usuarios (precios de
// entradas, metas y aportes de Campañas). Rifex opera en pesos chilenos
// enteros: un valor con decimales, notación científica, separadores,
// espacios u otro tipo se RECHAZA, nunca se redondea ni se corrige.
//
// - El servidor valida siempre; el navegador usa la misma función solo para
//   avisar antes de enviar.
// - No usa parseFloat ni Math.round: acepta enteros seguros (number) o una
//   cadena formada solo por dígitos.
// - Convierte a centavos únicamente después de validar.

export const CLP_WHOLE_PESOS_MESSAGE = 'Ingresa el monto en pesos chilenos completos, sin decimales.';

// Las columnas *_cents son integer (int4): 2.147.483.647 centavos.
export const INT4_MAX_PESOS = 21_474_836;

const DIGITS = /^(0|[1-9][0-9]*)$/;

function toSafeInteger(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === 'string') {
    if (!DIGITS.test(value) || value.length > 15) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null; // booleanos, objetos, arrays, null, undefined, bigint
}

function fail(code) {
  return { ok: false, error: code, message: CLP_WHOLE_PESOS_MESSAGE };
}

// Monto en pesos enteros (p. ej. amount_clp, campos de formulario).
// Devuelve { ok, pesos, cents } o { ok: false, error, message }.
export function parseClpPesos(value, { min = 1, max = INT4_MAX_PESOS, error = 'invalid_amount' } = {}) {
  const pesos = toSafeInteger(value);
  if (pesos == null || pesos < 0) return fail(error);
  if (pesos < min || pesos > max) return { ok: false, error, message: rangeMessage(min, max) };
  const cents = pesos * 100;
  if (!Number.isSafeInteger(cents)) return fail(error);
  return { ok: true, pesos, cents };
}

// Monto recibido en centavos por la API (price_cents, goal_cents): debe ser
// un entero seguro y un múltiplo exacto de 100 (pesos completos).
export function parseClpCents(value, { min = 1, max = INT4_MAX_PESOS, error = 'invalid_amount' } = {}) {
  const cents = toSafeInteger(value);
  if (cents == null || cents < 0 || cents % 100 !== 0) return fail(error);
  return parseClpPesos(cents / 100, { min, max, error });
}

// Cantidades (entradas, cupos): entero seguro positivo, sin redondear.
export function parseStrictPositiveInt(value, { max = 1_000_000 } = {}) {
  const n = toSafeInteger(value);
  return n != null && n > 0 && n <= max ? n : null;
}

const fmt = (n) => `$${n.toLocaleString('es-CL')}`;

function rangeMessage(min, max) {
  if (max >= INT4_MAX_PESOS) return `${CLP_WHOLE_PESOS_MESSAGE} El mínimo es ${fmt(min)}.`;
  return `${CLP_WHOLE_PESOS_MESSAGE} Debe estar entre ${fmt(min)} y ${fmt(max)}.`;
}
