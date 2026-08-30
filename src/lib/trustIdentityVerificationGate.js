// src/lib/trustIdentityVerificationGate.js
// TRUST-3A — autoridad server-side real de la verificación documental de
// identidad: casos, documentos, transiciones, Storage privado y
// auditoría. Mismo patrón que trustIdentityGate.js/trustOnboardingGate.js
// — la decisión pura vive en trustIdentityVerificationPolicy.js, acá se
// resuelve contra las tablas reales y Supabase Storage, siempre con
// service_role, nunca confiado a lo que el cliente afirme.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import {
  VERIFICATION_STATUS,
  canTransition,
  canUploadDocument,
  REQUIRED_SIDES,
  accountTypeSupportsVerification,
} from './trustIdentityVerificationPolicy.js';
import { processDocumentImage, InvalidDocumentImageError } from './trustIdentityDocumentProcessing.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BUCKET = 'trust-documents';
const SIGNED_URL_TTL_SECONDS = 120;
const CASE_COLUMNS =
  'user_id, country_code, verification_type, status, reason_code, policy_version, reviewer_id, submitted_at, reviewed_at, approved_at, expires_at, revoked_at, created_at, updated_at';

async function logAudit({ userId, actorId, actorRole, action, fromStatus, toStatus, reasonCode, metadata }) {
  const { error } = await supabase.from('trust_identity_audit_log').insert({
    user_id: userId,
    actor_id: actorId ?? null,
    actor_role: actorRole,
    action,
    from_status: fromStatus ?? null,
    to_status: toStatus ?? null,
    reason_code: reasonCode ?? null,
    metadata: metadata ?? null,
  });
  if (error) {
    // El historial es importante pero no debe tumbar la operación real
    // que ya se completó (mismo criterio de "no bloquear por logging"
    // usado en el resto del proyecto) — se registra en consola para
    // detectar el problema, nunca se silencia del todo.
    console.error('[trustIdentityVerificationGate] error escribiendo audit log:', error.message);
  }
}

export async function getVerificationCase(userId) {
  const { data, error } = await supabase
    .from('trust_identity_verifications')
    .select(CASE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[trustIdentityVerificationGate] error leyendo caso:', error.message);
    return null;
  }
  return data;
}

/**
 * Documentos vigentes (no superseded) del usuario, sin storage_key ni
 * hash — solo lo necesario para que la UI del titular muestre qué lados
 * ya tiene cargados.
 */
export async function listUserDocuments(userId) {
  const { data, error } = await supabase
    .from('trust_identity_documents')
    .select('id, side, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'uploaded')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[trustIdentityVerificationGate] error listando documentos:', error.message);
    return [];
  }
  return data;
}

/**
 * Inicia (o devuelve, si ya existe) el caso de verificación del usuario.
 * Rechaza cuentas de organización explícitamente — TRUST-3A es solo
 * personas naturales (ver mandato de esta fase).
 */
export async function startVerification(userId, { accountType, countryCode }) {
  if (!accountTypeSupportsVerification(accountType)) {
    return { ok: false, reason: 'organization_not_supported_yet' };
  }

  const existing = await getVerificationCase(userId);
  if (existing) return { ok: true, case: existing };

  const { data, error } = await supabase
    .from('trust_identity_verifications')
    .insert({ user_id: userId, country_code: countryCode ?? null, status: VERIFICATION_STATUS.DRAFT })
    .select(CASE_COLUMNS)
    .single();
  if (error) {
    // Carrera: otra request ya creó la fila entre el select y el insert.
    if (error.code === '23505') {
      const raced = await getVerificationCase(userId);
      if (raced) return { ok: true, case: raced };
    }
    throw error;
  }

  await logAudit({
    userId,
    actorId: userId,
    actorRole: 'user',
    action: 'case_started',
    fromStatus: VERIFICATION_STATUS.NOT_STARTED,
    toStatus: VERIFICATION_STATUS.DRAFT,
  });

  return { ok: true, case: data };
}

/**
 * Sube (o reemplaza) un lado del documento. El lado anterior no
 * enviado se marca 'superseded', nunca se sobreescribe ni se borra —
 * el rastro completo queda en trust_identity_documents.
 */
export async function uploadDocumentSide(userId, side, rawBuffer) {
  if (!REQUIRED_SIDES.includes(side)) {
    return { ok: false, reason: 'invalid_side' };
  }

  const verificationCase = await getVerificationCase(userId);
  if (!verificationCase || !canUploadDocument(verificationCase.status)) {
    return { ok: false, reason: 'upload_not_allowed_in_current_status' };
  }

  let processed;
  try {
    processed = await processDocumentImage(rawBuffer);
  } catch (err) {
    if (err instanceof InvalidDocumentImageError) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }

  // Detección controlada de duplicados: si el usuario vuelve a subir
  // exactamente el mismo archivo ya vigente para ese lado, no crea una
  // fila nueva — simplemente confirma la existente (idempotente).
  const { data: existingSame } = await supabase
    .from('trust_identity_documents')
    .select('id, side, status, created_at')
    .eq('user_id', userId)
    .eq('side', side)
    .eq('status', 'uploaded')
    .eq('sha256_hash', processed.sha256)
    .maybeSingle();
  if (existingSame) {
    return { ok: true, document: existingSame, duplicate: true };
  }

  // Nombre de storage aleatorio, no predecible — nunca deriva del
  // nombre de archivo original ni de una ruta que el cliente controle.
  const storageKey = `${userId}/${randomUUID()}.jpg`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storageKey, processed.buffer, { contentType: processed.mimeType, upsert: false });
  if (upErr) throw upErr;

  const { data: inserted, error: insErr } = await supabase
    .from('trust_identity_documents')
    .insert({
      user_id: userId,
      side,
      storage_bucket: BUCKET,
      storage_key: storageKey,
      mime_type: processed.mimeType,
      byte_size: processed.byteSize,
      sha256_hash: processed.sha256,
      status: 'uploaded',
    })
    .select('id, side, status, created_at')
    .single();

  if (insErr) {
    // Limpieza: el objeto ya se subió a Storage, pero la fila que lo
    // registra falló — nunca dejar un archivo huérfano sin rastro en la
    // base. Best-effort: si el remove también falla, queda un objeto
    // huérfano sin fila, detectable por un job de limpieza futuro, pero
    // nunca una fila que apunte a algo inexistente.
    await supabase.storage.from(BUCKET).remove([storageKey]).catch(() => {});
    throw insErr;
  }

  // Marca cualquier otro documento vigente del MISMO lado como
  // reemplazado — nunca se borra, solo cambia de estado.
  await supabase
    .from('trust_identity_documents')
    .update({ status: 'superseded' })
    .eq('user_id', userId)
    .eq('side', side)
    .eq('status', 'uploaded')
    .neq('id', inserted.id);

  if (verificationCase.status === VERIFICATION_STATUS.NOT_STARTED) {
    // No debería ocurrir (uploadDocumentSide ya exige canUploadDocument),
    // defensa en profundidad únicamente.
  }

  await logAudit({
    userId,
    actorId: userId,
    actorRole: 'user',
    action: 'document_uploaded',
    metadata: { side, document_id: inserted.id },
  });

  return { ok: true, document: inserted, duplicate: false };
}

/**
 * Envía el caso a revisión. Exige ambos lados vigentes (front y back),
 * cada uno con al menos un documento 'uploaded' real — nunca confía en
 * lo que el cliente afirme haber subido.
 */
export async function submitVerification(userId) {
  const verificationCase = await getVerificationCase(userId);
  if (!verificationCase || !canTransition(verificationCase.status, 'submit')) {
    return { ok: false, reason: 'submit_not_allowed_in_current_status' };
  }

  const docs = await listUserDocuments(userId);
  const sidesPresent = new Set(docs.map((d) => d.side));
  const missing = REQUIRED_SIDES.filter((s) => !sidesPresent.has(s));
  if (missing.length > 0) {
    return { ok: false, reason: 'missing_documents', missing };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('trust_identity_verifications')
    .update({ status: VERIFICATION_STATUS.SUBMITTED, submitted_at: now, reason_code: null })
    .eq('user_id', userId)
    .in('status', [VERIFICATION_STATUS.DRAFT, VERIFICATION_STATUS.CORRECTION_REQUIRED])
    .select(CASE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: 'submit_not_allowed_in_current_status' };

  await logAudit({
    userId,
    actorId: userId,
    actorRole: 'user',
    action: 'submitted',
    fromStatus: verificationCase.status,
    toStatus: VERIFICATION_STATUS.SUBMITTED,
  });

  return { ok: true, case: data };
}

// ---- Superficie administrativa (resolveAdmin siempre ya validado por
// el caller antes de llegar acá — estas funciones asumen un adminId ya
// autenticado y autorizado). ----

export async function listReviewQueue({ limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('trust_identity_verifications')
    .select('user_id, country_code, status, submitted_at, reviewer_id')
    .in('status', [VERIFICATION_STATUS.SUBMITTED, VERIFICATION_STATUS.UNDER_REVIEW])
    .order('submitted_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}

/**
 * Abre un caso para revisión: si está 'submitted', lo reclama
 * atómicamente (pasa a 'under_review'); si ya está 'under_review' (por
 * cualquier revisor), igual permite verlo — la exclusión real contra
 * decisiones concurrentes vive en recordDecision, no acá. Devuelve los
 * datos declarados (nombre legal, fecha de nacimiento, RUT) que el
 * revisor necesita comparar contra el documento, y URLs firmadas de
 * corta duración para ver la evidencia — generadas recién acá, nunca
 * persistidas.
 */
export async function openCaseForReview(userId, adminId) {
  const current = await getVerificationCase(userId);
  if (!current) return { ok: false, reason: 'case_not_found' };
  if (![VERIFICATION_STATUS.SUBMITTED, VERIFICATION_STATUS.UNDER_REVIEW].includes(current.status)) {
    return { ok: false, reason: 'case_not_reviewable' };
  }

  let caseRow = current;
  if (current.status === VERIFICATION_STATUS.SUBMITTED) {
    const { data, error } = await supabase
      .from('trust_identity_verifications')
      .update({ status: VERIFICATION_STATUS.UNDER_REVIEW, reviewer_id: adminId })
      .eq('user_id', userId)
      .eq('status', VERIFICATION_STATUS.SUBMITTED)
      .select(CASE_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      caseRow = data;
      await logAudit({
        userId,
        actorId: adminId,
        actorRole: 'admin',
        action: 'review_opened',
        fromStatus: VERIFICATION_STATUS.SUBMITTED,
        toStatus: VERIFICATION_STATUS.UNDER_REVIEW,
      });
    } else {
      // Otro admin lo reclamó en el instante entre el select y el
      // update — releemos el estado real, nunca asumimos.
      caseRow = await getVerificationCase(userId);
    }
  }

  const { data: onboarding } = await supabase
    .from('trust_onboarding')
    .select('person_name, organization_name, rut_normalized, account_type')
    .eq('user_id', userId)
    .maybeSingle();

  const docs = await listUserDocuments(userId);
  const evidence = [];
  for (const doc of docs) {
    const { data: full } = await supabase
      .from('trust_identity_documents')
      .select('storage_bucket, storage_key')
      .eq('id', doc.id)
      .single();
    const { data: signed, error: signErr } = await supabase.storage
      .from(full.storage_bucket)
      .createSignedUrl(full.storage_key, SIGNED_URL_TTL_SECONDS);
    if (signErr) {
      console.error('[trustIdentityVerificationGate] error firmando URL:', signErr.message);
      continue;
    }
    evidence.push({ id: doc.id, side: doc.side, created_at: doc.created_at, signed_url: signed.signedUrl });
  }

  return {
    ok: true,
    case: caseRow,
    declared: onboarding
      ? {
          // Un solo nombre real (persona u organización) — el revisor
          // ya no ve una fecha de nacimiento (eliminada por completo,
          // corrección canónica 2026-08-27): la confirmación de 18+ que
          // exige recordDecision (confirmedAgeAdult) se basa en lo que
          // el revisor VE en el documento mismo, nunca en un dato
          // declarado que ya no existe.
          declared_name: onboarding.person_name || onboarding.organization_name || null,
          rut_normalized: onboarding.rut_normalized,
          account_type: onboarding.account_type,
        }
      : null,
    evidence,
  };
}

/**
 * Registra la decisión administrativa. La propia UPDATE atómica
 * (WHERE status='under_review') es lo que impide una doble decisión
 * concurrente: si dos revisores intentan decidir el mismo caso a la
 * vez, solo uno encuentra la fila en 'under_review' y gana; el otro
 * recibe case_not_under_review y debe refrescar.
 *
 * approve: fija identity_verified/age_verified en trust_onboarding —
 * ÚNICO lugar de todo el código que puede escribir esos campos. Exige
 * que el revisor haya confirmado explícitamente (confirmedDataMatches/
 * confirmedAgeAdult) la coherencia mínima — sin OCR, esa confirmación
 * humana ES la verificación real.
 */
export async function recordDecision(userId, adminId, { action, reasonCode, comment, confirmedDataMatches, confirmedAgeAdult }) {
  if (userId === adminId) {
    return { ok: false, reason: 'cannot_review_own_case' };
  }
  if (!['approve', 'request_correction', 'reject'].includes(action)) {
    return { ok: false, reason: 'invalid_action' };
  }

  const now = new Date().toISOString();
  const nextStatusValue =
    action === 'approve' ? VERIFICATION_STATUS.APPROVED
    : action === 'reject' ? VERIFICATION_STATUS.REJECTED
    : VERIFICATION_STATUS.CORRECTION_REQUIRED;

  if (action === 'approve' && !(confirmedDataMatches === true && confirmedAgeAdult === true)) {
    return { ok: false, reason: 'confirmation_required' };
  }

  const patch = {
    status: nextStatusValue,
    reviewer_id: adminId,
    reviewed_at: now,
    reason_code: reasonCode ?? null,
  };
  if (action === 'approve') patch.approved_at = now;

  const { data: updated, error } = await supabase
    .from('trust_identity_verifications')
    .update(patch)
    .eq('user_id', userId)
    .eq('status', VERIFICATION_STATUS.UNDER_REVIEW)
    .select(CASE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!updated) return { ok: false, reason: 'case_not_under_review' };

  await logAudit({
    userId,
    actorId: adminId,
    actorRole: 'admin',
    action,
    fromStatus: VERIFICATION_STATUS.UNDER_REVIEW,
    toStatus: nextStatusValue,
    reasonCode: reasonCode ?? null,
    metadata: comment ? { comment: String(comment).slice(0, 500) } : null,
  });

  if (action === 'approve') {
    const expiresAt = new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString(); // provisional — ver docs, política real de vigencia pendiente
    await supabase
      .from('trust_onboarding')
      .update({
        identity_verified: true,
        age_verified: true,
        identity_verified_at: now,
        identity_verified_method: 'manual_document_review',
        identity_verified_by: adminId,
        identity_verification_expires_at: expiresAt,
      })
      .eq('user_id', userId);

    await supabase.from('trust_identity_verifications').update({ expires_at: expiresAt }).eq('user_id', userId);
  }

  return { ok: true, case: updated };
}

/**
 * Revoca una verificación previamente aprobada (por ejemplo, fraude
 * descubierto después). Limpia identity_verified/age_verified — la
 * cuenta, sus pagos e iniciativas existentes NO se tocan acá.
 */
export async function revokeVerification(userId, adminId, { reasonCode, comment }) {
  if (userId === adminId) {
    return { ok: false, reason: 'cannot_review_own_case' };
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('trust_identity_verifications')
    .update({ status: VERIFICATION_STATUS.REVOKED, revoked_at: now, reviewer_id: adminId, reviewed_at: now, reason_code: reasonCode ?? null })
    .eq('user_id', userId)
    .eq('status', VERIFICATION_STATUS.APPROVED)
    .select(CASE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!updated) return { ok: false, reason: 'case_not_approved' };

  await supabase
    .from('trust_onboarding')
    .update({ identity_verified: false, age_verified: false })
    .eq('user_id', userId);

  await logAudit({
    userId,
    actorId: adminId,
    actorRole: 'admin',
    action: 'revoked',
    fromStatus: VERIFICATION_STATUS.APPROVED,
    toStatus: VERIFICATION_STATUS.REVOKED,
    reasonCode: reasonCode ?? null,
    metadata: comment ? { comment: String(comment).slice(0, 500) } : null,
  });

  return { ok: true, case: updated };
}
