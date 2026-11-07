# Target Flows

This document describes future target flows. It is design only and does not state that these flows are implemented or verified.

## CREATE RAFFLE TARGET FLOW

| Field | Design |
|---|---|
| Actor | authenticated creator |
| Identity | Supabase session or JWT validated server-side |
| Entrypoint | raffle creation API route |
| Application service | CreateRaffle |
| Domain rules | validate raffle fields, ticket count and initial state |
| Persistence | create raffle and numbered tickets through write module |
| Transaction | atomic transaction/RPC or equivalent compensation contract |
| Provider | none |
| Idempotency | optional client request key; unique ticket numbers by raffle |
| Ownership | creator id/email from server identity |
| Output | stable JSON result with raffle id |
| Errors | validation, authentication, authorization, conflict, internal |
| Observability | correlation id, safe metadata |
| Side effects | none required |
| Rollback | no partial raffle/tickets after failed creation |
| Test gate | unit, route contract, persistence integration |
| Deferrals | exact SQL implementation |

## PURCHASE TARGET FLOW

| Field | Design |
|---|---|
| Actor | public buyer |
| Identity | buyer contact only; no privileged ownership |
| Entrypoint | POST /api/checkout/mp candidate canonical API |
| Application service | ReserveTicketsAndCreatePurchase |
| Domain rules | only available tickets can become held; purchase becomes pending_payment |
| Persistence | raffle lookup, merchant lookup, purchase write, ticket hold write |
| Transaction | conditional update/lock plus compensation if provider preference fails |
| Provider | Mercado Pago preference creation through PaymentProviderPort |
| Idempotency | purchase intent/idempotency key future; ticket constraints now required |
| Ownership | seller/merchant derived from raffle, never body/query |
| Output | redirect/init point and purchase reference |
| Errors | validation, not found, conflict, provider, internal |
| Observability | safe checkout metadata, no secrets |
| Side effects | provider preference creation |
| Rollback | release holds or mark purchase failed if preference creation cannot complete |
| Test gate | route contract, MP fake, persistence integration, concurrency |
| Deferrals | exact canonical endpoint migration from legacy /api/checkout |

## R4 Checkout Route Contract

| Physical File | Public Route | Classification |
|---|---|---|
| `src/pages/checkout/index.js` | `/checkout` | React page or controlled redirect pending |
| `src/pages/api/checkout/index.js` | `/api/checkout` | Legacy/compatibility API |
| `src/pages/api/checkout/mp.js` | `/api/checkout/mp` | Current canonical candidate |
| `src/pages/api/checkout/confirm.js` | `/api/checkout/confirm` | Query without independent mutating authority |
| `src/pages/api/checkout/webhook.js` | `/api/checkout/webhook` | Primary Mercado Pago evidence entrypoint |

- `/checkout` currently blocks build.
- `/api/checkout` is not removed without caller review.
- `/api/checkout/mp` is the current canonical candidate.
- `next build` is the R4 gate.
- AD2 changes no routes.

## PAYMENT EVIDENCE TARGET FLOW

SINGLE INTERNAL PAYMENT AUTHORITY:
ApplyPaymentEvidence

| Field | Design |
|---|---|
| Actor | Mercado Pago webhook, admin reconcile, or read-only confirm adapter |
| Identity | provider signature/lookup or admin auth for reconcile |
| Entrypoint | webhook primary; reconcile repair; confirm query/read-only |
| Application service | ApplyPaymentEvidence |
| Domain rules | validate provider evidence, live_mode, purchase association and allowed transitions |
| Persistence | payment, purchase, tickets, idempotency/event logs |
| Transaction | atomic application of payment/purchase/ticket transition |
| Provider | Mercado Pago lookup/verification through port |
| Idempotency | payment, event and command identities |
| Ownership | payment must match purchase/raffle/merchant context |
| Output | idempotent result/outcome |
| Errors | invalid signature, mismatch, duplicate, provider, retryable infrastructure |
| Observability | event outcome and correlation id after validation |
| Side effects | notification intent after durable transition |
| Rollback | failed transaction leaves no partial sale; retry/reconcile can repair |
| Test gate | HMAC, replay, duplicate, pending->approved, mismatch and DB failure tests |
| Deferrals | exact provider event fallback when event id absent |

## MERCHANT OAUTH TARGET FLOW

| Field | Design |
|---|---|
| Actor | authenticated creator/seller |
| Identity | server-validated session on start/disconnect; state on callback |
| Entrypoint | OAuth start, callback, disconnect APIs |
| Application service | ConnectMerchantGateway / DisconnectMerchantGateway |
| Domain rules | state single-use, TTL, PKCE, user binding, ownership |
| Persistence | mp_oauth_state and merchant_gateways modules |
| Transaction | state consume + token upsert must be consistent |
| Provider | Mercado Pago OAuth through PaymentProviderPort |
| Idempotency | state identity; merchant user/provider unique key |
| Ownership | gateway belongs to stored user id |
| Output | redirect with stable code or JSON status |
| Errors | authentication, invalid state, provider, conflict, internal |
| Observability | state outcome without tokens |
| Side effects | token exchange/upsert/revoke if supported |
| Rollback | failed callback does not create ambiguous gateway |
| Test gate | OAuth fake, state replay, TTL, ownership |
| Deferrals | token storage/cipher and account replacement policy |

## WINNER TARGET FLOW

| Field | Design |
|---|---|
| Actor | creator owner or admin for creation; public for reading |
| Identity | server-validated creator/admin for mutation |
| Entrypoint | winner API or future service endpoint |
| Application service | CreateWinner / ReadWinner |
| Domain rules | only sold tickets with valid purchase/payment are eligible |
| Persistence | raffle, tickets, purchases, payment evidence, raffle_results |
| Transaction | unique result by raffle_id with lock/transaction |
| Provider | none |
| Idempotency | winner identity = raffle_id |
| Ownership | creator/admin for creation |
| Output | persisted winner result |
| Errors | auth, ownership, conflict, no eligible tickets, internal |
| Observability | audit selection metadata without sensitive data |
| Side effects | optional notification future |
| Rollback | repeated creation returns existing result; no duplicate result |
| Test gate | policy, idempotency, concurrency, randomness audit |
| Deferrals | sold-out requirement, manual close, early close, reopen, void/replacement, exact randomness policy |
