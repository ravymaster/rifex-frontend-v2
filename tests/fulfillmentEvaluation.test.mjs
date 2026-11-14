// CUMPLIMIENTO-1 — pruebas puras de evaluateFulfillmentStatus. Sin DB,
// sin red, sin reloj: mismo input siempre produce el mismo output.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFulfillmentStatus,
  FULFILLMENT_STATUSES,
  isValidCreatorResponse,
  isValidWinnerResponse,
} from "../src/lib/fulfillmentEvaluation.js";

test("estado inicial: sin respuestas -> pending_delivery", () => {
  const status = evaluateFulfillmentStatus({ creatorResponse: null, winnerResponse: null });
  assert.equal(status, FULFILLMENT_STATUSES.PENDING_DELIVERY);
});

test("winner YES (sin respuesta del creador) -> fulfillment_confirmed", () => {
  const status = evaluateFulfillmentStatus({ creatorResponse: null, winnerResponse: "yes" });
  assert.equal(status, FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED);
});

test("creator YES + winner YES -> fulfillment_confirmed", () => {
  const status = evaluateFulfillmentStatus({ creatorResponse: "yes", winnerResponse: "yes" });
  assert.equal(status, FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED);
});

test("creator YES + winner NOT_YET -> under_review (discrepancia)", () => {
  const status = evaluateFulfillmentStatus({ creatorResponse: "yes", winnerResponse: "not_yet" });
  assert.equal(status, FULFILLMENT_STATUSES.UNDER_REVIEW);
});

test("creator YES + winner sin responder -> creator_reported_delivered", () => {
  const status = evaluateFulfillmentStatus({ creatorResponse: "yes", winnerResponse: null });
  assert.equal(status, FULFILLMENT_STATUSES.CREATOR_REPORTED_DELIVERED);
});

test("creator COORDINATING + winner NOT_YET -> delivery_pending", () => {
  const status = evaluateFulfillmentStatus({ creatorResponse: "coordinating", winnerResponse: "not_yet" });
  assert.equal(status, FULFILLMENT_STATUSES.DELIVERY_PENDING);
});

test("creator NOT_YET + winner sin responder -> delivery_pending", () => {
  const status = evaluateFulfillmentStatus({ creatorResponse: "not_yet", winnerResponse: null });
  assert.equal(status, FULFILLMENT_STATUSES.DELIVERY_PENDING);
});

test("creator sin responder + winner NOT_YET -> delivery_pending", () => {
  const status = evaluateFulfillmentStatus({ creatorResponse: null, winnerResponse: "not_yet" });
  assert.equal(status, FULFILLMENT_STATUSES.DELIVERY_PENDING);
});

test("no responses + afterDeadline:true -> unconfirmed", () => {
  const status = evaluateFulfillmentStatus({ creatorResponse: null, winnerResponse: null, afterDeadline: true });
  assert.equal(status, FULFILLMENT_STATUSES.UNCONFIRMED);
});

test("creator YES sin respuesta de winner + afterDeadline:true -> unconfirmed (silencio del ganador)", () => {
  const status = evaluateFulfillmentStatus({ creatorResponse: "yes", winnerResponse: null, afterDeadline: true });
  assert.equal(status, FULFILLMENT_STATUSES.UNCONFIRMED);
});

test("evidencia explícita (delivery_pending/under_review) NUNCA se degrada a unconfirmed por afterDeadline", () => {
  const underReview = evaluateFulfillmentStatus({ creatorResponse: "yes", winnerResponse: "not_yet", afterDeadline: true });
  assert.equal(underReview, FULFILLMENT_STATUSES.UNDER_REVIEW);

  const deliveryPending = evaluateFulfillmentStatus({ creatorResponse: "coordinating", winnerResponse: "not_yet", afterDeadline: true });
  assert.equal(deliveryPending, FULFILLMENT_STATUSES.DELIVERY_PENDING);
});

test("transición inválida: valor de respuesta desconocido lanza, nunca produce un estado silencioso", () => {
  assert.throws(() => evaluateFulfillmentStatus({ creatorResponse: "maybe", winnerResponse: null }), /invalid_creator_response/);
  assert.throws(() => evaluateFulfillmentStatus({ creatorResponse: null, winnerResponse: "definitely" }), /invalid_winner_response/);
});

test("isValidCreatorResponse / isValidWinnerResponse: null siempre válido, valores fuera de enum siempre inválidos", () => {
  assert.equal(isValidCreatorResponse(null), true);
  assert.equal(isValidCreatorResponse(undefined), true);
  assert.equal(isValidCreatorResponse("yes"), true);
  assert.equal(isValidCreatorResponse("coordinating"), true);
  assert.equal(isValidCreatorResponse("not_yet"), true);
  assert.equal(isValidCreatorResponse("maybe"), false);

  assert.equal(isValidWinnerResponse(null), true);
  assert.equal(isValidWinnerResponse("yes"), true);
  assert.equal(isValidWinnerResponse("not_yet"), true);
  assert.equal(isValidWinnerResponse("coordinating"), false); // el ganador nunca "coordina", solo el creador
});

test("función pura: mismo input siempre produce el mismo output, sin efectos secundarios", () => {
  const input = { creatorResponse: "yes", winnerResponse: null };
  const a = evaluateFulfillmentStatus(input);
  const b = evaluateFulfillmentStatus(input);
  assert.equal(a, b);
  assert.equal(a, FULFILLMENT_STATUSES.CREATOR_REPORTED_DELIVERED);
});
