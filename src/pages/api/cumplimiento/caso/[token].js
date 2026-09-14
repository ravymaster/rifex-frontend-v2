// CUMPLIMIENTO-3/4 — recuperación del caso de cumplimiento para el
// ganador invitado (GET) y registro de su respuesta (POST, CUMPLIMIENTO-4).
// Mismo patrón que /api/events/orders/[token] (EVENT-2): rate limit,
// token opaco de alta entropía como único credencial, respuesta
// genérica en cualquier fallo -- nunca revela si el token tiene formato
// plausible, si la rifa existe, ni ninguna otra señal útil para
// enumeración. Sin auth.getUser() -- el ganador no necesariamente tiene
// cuenta Rifex; su identidad es el token en sí.
import { enforceRateLimit, resolveClientIp } from "@/lib/rateLimit";
import { getCaseByAccessToken } from "@/lib/fulfillmentCommunications.js";
import { recordWinnerResponse } from "@/lib/fulfillmentCaseService.js";
import { isValidWinnerResponse, WINNER_RESPONSES } from "@/lib/fulfillmentEvaluation.js";

// Mismo set de columnas públicas que getCaseByAccessToken (CUMPLIMIENTO-3)
// -- el POST nunca debe devolver más superficie que el GET ya expone.
function toPublicCase(fullCase) {
  if (!fullCase) return null;
  const {
    raffle_id,
    raffle_title,
    prize_type,
    prize_amount_cents,
    delivery_method,
    requires_transfer_procedures,
    transfer_expenses_owner,
    transfer_conditions,
    status,
    winner_determined_at,
    raffle_closed_at,
    winner_response,
    winner_response_at,
  } = fullCase;
  return {
    raffle_id,
    raffle_title,
    prize_type,
    prize_amount_cents,
    delivery_method,
    requires_transfer_procedures,
    transfer_expenses_owner,
    transfer_conditions,
    status,
    winner_determined_at,
    raffle_closed_at,
    winner_response,
    winner_response_at,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { token } = req.query || {};
  if (!token || typeof token !== "string" || token.length < 32) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `cumplimiento-caso-lookup:${ip}`, maxHits: 20, windowSeconds: 60 })) return;

  if (req.method === "GET") {
    try {
      const fulfillmentCase = await getCaseByAccessToken(token);
      if (!fulfillmentCase) return res.status(404).json({ ok: false, error: "not_found" });
      return res.status(200).json({ ok: true, case: fulfillmentCase });
    } catch (e) {
      console.error("[api/cumplimiento/caso/[token]] GET error", e?.message || e);
      return res.status(404).json({ ok: false, error: "not_found" });
    }
  }

  // POST -- CUMPLIMIENTO-4: respuesta del ganador ('yes'|'not_yet').
  // Nunca se muestra lenguaje de fraude/denuncia/estafa/incumplimiento
  // acá ni en el frontend que consume este endpoint.
  const { response } = req.body || {};
  if (!isValidWinnerResponse(response) || response == null || !Object.values(WINNER_RESPONSES).includes(response)) {
    return res.status(400).json({ ok: false, error: "invalid_response" });
  }

  try {
    const fulfillmentCase = await getCaseByAccessToken(token);
    if (!fulfillmentCase) return res.status(404).json({ ok: false, error: "not_found" });

    const result = await recordWinnerResponse(fulfillmentCase.raffle_id, response, {
      actorUserId: null,
      metadata: { source: "winner_token_page" },
    });
    if (!result.case) return res.status(404).json({ ok: false, error: "not_found" });

    return res.status(200).json({ ok: true, case: toPublicCase(result.case), noop: !!result.noop });
  } catch (e) {
    console.error("[api/cumplimiento/caso/[token]] POST error", e?.message || e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
