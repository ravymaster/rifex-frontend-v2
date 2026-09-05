// src/lib/legalDeclarations.js
// Constantes de declaraciones legales del creador (18+, propiedad del
// premio). El registro efectivo ocurre de forma atómica junto con la
// creación de la rifa (ver RPC create_raffle_with_declarations, DRAW-1B) —
// legal_declarations es una tabla genérica por entity_type/entity_id,
// reusable con Campañas/Colecta después sin duplicar estructura.
export const DECLARATION_TYPES = { AGE_18: "age_18", PRIZE_OWNERSHIP: "prize_ownership" };
export const POLICY_VERSION = "v1.0";
