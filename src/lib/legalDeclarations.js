// src/lib/legalDeclarations.js
// Registro reusable de declaraciones legales del creador (18+, propiedad
// del premio). DRAW-1 las usa para Rifa; la tabla es genérica por
// entity_type/entity_id para poder reusarse con Campañas/Colecta después
// sin duplicar estructura.
import * as SB from "./supabaseAdmin";

const supabaseAdmin = SB.default || SB.supabaseAdmin;

export const DECLARATION_TYPES = { AGE_18: "age_18", PRIZE_OWNERSHIP: "prize_ownership" };
export const POLICY_VERSION = "v1.0";

export async function recordDeclarations({ userId, entityType, entityId, types, policyVersion = POLICY_VERSION }) {
  if (!userId || !entityType || !entityId || !Array.isArray(types) || !types.length) {
    return { ok: false, error: "missing_params" };
  }
  const rows = types.map((declaration_type) => ({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    declaration_type,
    policy_version: policyVersion,
  }));
  const { error } = await supabaseAdmin.from("legal_declarations").insert(rows);
  if (error) throw error;
  return { ok: true };
}
