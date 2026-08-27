// src/lib/trustIdentityPolicy.js
// TRUST-2 — validación pura de identidad básica declarada (RUN/RUT
// chileno) y del requisito de edad para crear/publicar/recaudar. Sin
// Supabase, sin I/O, mismo criterio que trustOnboardingPolicy.js —
// exportado tanto para el cliente (feedback inmediato de formato) como
// para las rutas API (única fuente real, nunca confiada al navegador).
//
// Un RUT con formato y dígito verificador válidos significa únicamente
// "rut_declared_and_format_valid". NUNCA significa: identidad verificada,
// titularidad verificada, mayoría de edad verificada, autorización para
// recaudar, ni aprobación de iniciativa. Ver
// docs/trust/TRUST_AGE_IDENTITY_VERIFICATION.md.
import { isDeclaredAdult } from './trustOnboardingPolicy.js';

export const MIN_CREATOR_AGE = 18;

// Deja solo dígitos y K/k (acepta con o sin puntos/guion/espacios),
// mismo criterio de limpieza que el validador cliente-only ya existente
// en src/pages/register.jsx (rut_beneficiario) — pero ese es un campo no
// autoritativo de otro propósito (beneficiario declarado al registrarse),
// nunca la fuente de identidad de TRUST-2.
export function cleanRut(raw) {
  return String(raw || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

// Algoritmo módulo 11 estándar para el dígito verificador chileno.
function computeCheckDigit(body) {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  if (res === 11) return '0';
  if (res === 10) return 'K';
  return String(res);
}

// Cuerpo de 7 u 8 dígitos + 1 dígito verificador (0-9 o K) — rango real
// de RUN/RUT chilenos vigentes.
export function isValidRut(raw) {
  const r = cleanRut(raw);
  if (r.length < 8 || r.length > 9) return false;
  const body = r.slice(0, -1);
  const dv = r.slice(-1);
  if (!/^[0-9]+$/.test(body)) return false;
  return computeCheckDigit(body) === dv;
}

export function validateRut(value) {
  if (typeof value !== 'string' || !value.trim()) return 'rut_required';
  if (!isValidRut(value)) return 'invalid_rut';
  return null;
}

// Forma canónica de almacenamiento: solo dígitos + K final, sin puntos ni
// guion — "14.182.309-4", "14182309-4" y "14182309 4" normalizan al
// mismo valor, que es también el que usa el índice único.
export function normalizeRut(raw) {
  return cleanRut(raw);
}

// Enmascara para mostrarle al propio titular su RUT ya declarado sin
// repetirlo completo en cada respuesta de la API — conserva los últimos
// 4 caracteres. "141823094" -> "*****3094".
export function maskRut(normalized) {
  if (!normalized || normalized.length < 4) return null;
  const visible = normalized.slice(-4);
  return '*'.repeat(normalized.length - 4) + visible;
}

// V1: solo Chile exige RUT — mismo alcance que COUNTRY_POLICY (único país
// realmente enabled). Si otro país se habilita más adelante, este es el
// único punto a tocar, igual que countryPolicy.js con las capabilities.
export function isRutRequiredForCountry(countryCode) {
  return countryCode === 'CL';
}

// "age_requirement_met_from_declared_data" — un dato derivado de la
// fecha de nacimiento AUTODECLARADA, nunca "age_verified". Reexporta
// isDeclaredAdult con el nombre exacto que usa el contrato de TRUST-2
// para dejar explícita la distinción en cada punto donde se lee.
export function ageRequirementMetFromDeclaredData(birthDateStr) {
  return isDeclaredAdult(birthDateStr);
}
