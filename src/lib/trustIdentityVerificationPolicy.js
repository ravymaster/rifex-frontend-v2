// src/lib/trustIdentityVerificationPolicy.js
// TRUST-3A — validación pura y máquina de estados de la verificación
// documental manual de identidad. Sin Supabase, sin I/O, mismo criterio
// que trustOnboardingPolicy.js/trustIdentityPolicy.js.
//
// Alcance: SOLO personas naturales, SOLO cédula chilena, SOLO revisión
// humana. Organizaciones quedan reservadas para TRUST-4 — ver
// accountTypeSupportsVerification.

export const VERIFICATION_STATUS = Object.freeze({
  NOT_STARTED: 'not_started',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  CORRECTION_REQUIRED: 'correction_required',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
});

const S = VERIFICATION_STATUS;

// Estados terminales en el alcance de TRUST-3A: ningún código de esta
// fase los reabre automáticamente (una apelación real es TRUST-3B/4+).
export const TERMINAL_STATUSES = Object.freeze([S.REJECTED, S.EXPIRED, S.REVOKED]);

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

// Máquina de estados explícita — cualquier transición no listada acá se
// rechaza, sin excepción, sin importar quién la pida.
const TRANSITIONS = Object.freeze({
  start: { from: [S.NOT_STARTED], to: S.DRAFT, actor: 'user' },
  submit: { from: [S.DRAFT, S.CORRECTION_REQUIRED], to: S.SUBMITTED, actor: 'user' },
  claim: { from: [S.SUBMITTED], to: S.UNDER_REVIEW, actor: 'admin' },
  approve: { from: [S.UNDER_REVIEW], to: S.APPROVED, actor: 'admin' },
  request_correction: { from: [S.UNDER_REVIEW], to: S.CORRECTION_REQUIRED, actor: 'admin' },
  reject: { from: [S.UNDER_REVIEW], to: S.REJECTED, actor: 'admin' },
  revoke: { from: [S.APPROVED], to: S.REVOKED, actor: 'admin' },
});

export function canTransition(currentStatus, action) {
  const t = TRANSITIONS[action];
  if (!t) return false;
  return t.from.includes(currentStatus);
}

export function nextStatus(action) {
  return TRANSITIONS[action]?.to ?? null;
}

// El usuario puede subir/reemplazar documentos mientras el caso está en
// estos estados — nunca después de enviar, nunca en un estado terminal.
export function canUploadDocument(currentStatus) {
  return currentStatus === S.DRAFT || currentStatus === S.CORRECTION_REQUIRED;
}

export const REQUIRED_SIDES = Object.freeze(['front', 'back']);

// Solo personas naturales en TRUST-3A. Una organización nunca debe ver
// el flujo de "sube tu cédula" bajo un modelo que no le corresponde —
// ver docs/trust/TRUST_AGE_IDENTITY_VERIFICATION.md, sección TRUST-3A.
export function accountTypeSupportsVerification(accountType) {
  return accountType === 'person';
}

// Razones estructuradas — nunca texto libre como única fuente de verdad,
// el comentario humano (si existe) es adicional, nunca reemplaza esto.
export const CORRECTION_REASON_CODES = Object.freeze([
  'image_unreadable',
  'document_expired',
  'name_mismatch',
  'birth_date_mismatch',
  'missing_side',
  'document_type_not_supported',
  'other',
]);

export const REJECTION_REASON_CODES = Object.freeze([
  'document_appears_altered',
  'identity_mismatch',
  'document_type_not_supported',
  'unable_to_verify',
  'other',
]);

export function isValidReasonCode(action, code) {
  if (action === 'request_correction') return CORRECTION_REASON_CODES.includes(code);
  if (action === 'reject') return REJECTION_REASON_CODES.includes(code);
  return false;
}

// ---- Política de activación (Fase 6 / "IMPORTANTE PARA DEV") ----
//
// Dos niveles, nunca confundidos:
//   - creator_eligible_basic  = TRUST-2 (onboarding + 18+ declarado + RUT
//     declarado para Chile) — sigue siendo TODO lo que
//     assertCreatorEligible exige hoy.
//   - creator_identity_verified = TRUST-3 (identity_verified === true,
//     por una aprobación administrativa real).
//
// Esta constante es la ÚNICA fuente de verdad de si crear/publicar/
// recaudar exige además identidad verificada. Por diseño explícito de
// esta misión permanece en `false`: activar esto es una decisión de
// negocio/producto, nunca un efecto secundario de haber construido
// TRUST-3A. Cambiarla a `true` debe ser un cambio deliberado, documentado
// en el mismo commit que lo haga.
export function isIdentityVerificationRequiredForCreators() {
  return false;
}

// ---- Validación de imagen (Fase 3) ----

export const ALLOWED_DOCUMENT_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png']);
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8MB de transporte (igual criterio que upload-photo.js: el cliente ya comprime)
export const MAX_DOCUMENT_DIMENSION = 6000; // px por lado, generoso para una foto de teléfono real
export const MAX_DOCUMENT_INPUT_PIXELS = 40_000_000; // defensa explícita anti decompression-bomb, más estricto que el default de sharp

// Magic bytes reales — nunca se confía en el nombre de archivo ni en el
// Content-Type que mande el cliente para decidir el tipo real.
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function bufferStartsWith(buffer, magic) {
  if (buffer.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buffer[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Detecta el tipo real por magic bytes. Retorna 'image/jpeg' |
 * 'image/png' | null — nunca deriva del nombre de archivo ni del
 * Content-Type declarado por el cliente.
 */
export function detectImageMimeFromMagicBytes(buffer) {
  if (bufferStartsWith(buffer, PNG_MAGIC)) return 'image/png';
  if (bufferStartsWith(buffer, JPEG_MAGIC)) return 'image/jpeg';
  return null;
}
