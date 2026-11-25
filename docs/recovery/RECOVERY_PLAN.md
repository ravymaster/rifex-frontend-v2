# Rifex Recovery Plan

This document records the approved Alignment A3/A4 recovery decomposition. It is a plan, not an implementation.

Architecture Design AD2 adds target design for recovery units. Architecture Design AD3 closes design with R4 Sprint Readiness `GO`, and AD4 materializes the closing record and R4 packet. The units now have design documentation, but no implementation is authorized or completed.

## Baseline

| Item | Status |
|---|---|
| HEAD | `bbaf8a02d2ff3681186e8f84317ce1c7cdd064ee` (R4 implementation, `fix: restore checkout page build`) |
| Baseline decision | C |
| Recovery decision | B |
| Functional diffs | Preserved recovery/hardening line |
| Functional behavior | UNVERIFIED |

Preserved diffs:

- `src/lib/mailer.js`
- `src/pages/api/admin/reconcile-payments.js`
- `src/pages/api/checkout/webhook.js`

## R4 - Build Baseline

| Item | Status |
|---|---|
| Failure | `npm run build` failed at `/checkout` (CONFIRMED, RESOLVED) |
| Cause | CONFIRMED: API handler located as page route |
| Evidence | `/checkout` prerender produced React error #31 and `TypeError: t.status is not a function` |
| Relation to recovery diffs | UNRELATED TO RECOVERY DIFFS |
| Criterion | `npm run build` succeeds — CONFIRMED, 25/25 pages generated |
| Implementation | IMPLEMENTED at HEAD `bbaf8a0` (`fix: restore checkout page build`) |
| R4 decision | A: replace `/checkout` handler conflict with a valid React page |
| Sprint status | CLOSED - GO |

| Physical File | Public Route | Classification |
|---|---|---|
| `src/pages/checkout/index.js` | `/checkout` | React page or controlled redirect pending |
| `src/pages/api/checkout/index.js` | `/api/checkout` | Legacy/compatibility API |
| `src/pages/api/checkout/mp.js` | `/api/checkout/mp` | Current canonical candidate |
| `src/pages/api/checkout/confirm.js` | `/api/checkout/confirm` | Query without independent mutating authority |
| `src/pages/api/checkout/webhook.js` | `/api/checkout/webhook` | Primary Mercado Pago evidence entrypoint |

R4 does not remove `/api/checkout` without caller review. `next build` is the R4 gate. This documentation correction changes no routes.

R4 is constrained by `docs/sprints/R4_BUILD_BASELINE_SPRINT_PACKET.md`. It must not modify checkout APIs, payment state, database schema, mailer, webhook, reconciliation, fees, OAuth, `.gitignore` or the PostgreSQL backup.

## DB Recovery Contract

Clean install reproducibility is `PARTIAL`.

Required reproducible objects:

| Object | Need |
|---|---|
| `email_logs` | Required for R1 audit/dedup |
| `webhook_events` | Required shared event log for R2/R3 |
| `payments.live_mode` | Required before R2/R3 certification |
| `payments.mp_payment_id` | Required as text with unique behavior |
| `purchase_id` | Required link between payments and purchases |
| ticket/purchase states | CONTRADICTORY and must be normalized |

The PostgreSQL backup is sensitive evidence. It does not replace versioned migrations and is not an absolute authority.

## R1 - Mailer Recovery Unit

Scope: `src/lib/mailer.js`, `email_logs`, `message_key`, dedup, retries, templates, metadata and Resend.

Proposed certification requirements:

- JS contract remains backward compatible.
- Audit DB failure degrades without blocking email send.
- Dedup uses `message_key` and a documented time window.
- Retry policy is deterministic and tested with Resend mock.
- Stored email content is minimized.
- PII retention is explicit.
- Rollback path is returning to HEAD mailer.
- Gate requires syntax, unit tests, integration tests with mocks, and DB contract reproducibility.

## R2 - Webhook Recovery Unit

Scope: `src/pages/api/checkout/webhook.js`, HMAC, replay, idempotency, `webhook_events`, `live_mode`, purchase/ticket transitions and mailer calls.

Proposed certification requirements:

- HMAC canonicalization is documented.
- Missing/invalid signature fails closed.
- Replay protection is persisted or testable.
- Payload logging moves after signature validation, or pre-validation logging is limited to non-sensitive metadata.
- Live/sandbox behavior is explicit.
- State transitions avoid double sale under duplicate delivery.
- Rollback path is returning to HEAD webhook.

## R3 - Technical Reconciliation Recovery Unit

Scope: `src/pages/api/admin/reconcile-payments.js`, admin auth, payment reconciliation, provider lookup, live/sandbox, logging and mailer calls.

Technical reconciliation must be separated from commercial fees policy.

Proposed certification requirements:

- Admin authentication is documented and tested.
- Provider calls have timeout and retry policy.
- Repeated execution is idempotent.
- Partial failures are observable.
- `webhook_events` contract is shared with R2.
- Rollback path is returning to HEAD reconciliation.

## Fees

Fees are a separate future decision. Current defaults are experimental implementation evidence, not confirmed commercial policy.

Fees must not block R3 technical certification unless explicitly adopted. A future decision must define percentages, units, rounding, persistence, display, ownership and legal/commercial approval.

```text
TECHNICAL PAYMENT RECONCILIATION
!=
COMMERCIAL FEES POLICY
```

Technical reconciliation does not invent a Rifex fee. Provider fee is only a technical observation. Plan resolution is server-side, amounts use integer minor units, percentages and rounding remain DEFERRED, defaults are not authority, and emails must not show experimental fee calculations.

## Sequence

```text
R4
-> DB Recovery Contract
-> R1
-> R2
-> R3 Technical
-> Fees Policy
-> Release Audits
-> Separate Commits
```

This sequence is approved as planning input only. Architecture Audit and Architecture Design documentation are closed with GO. R4 is implemented and closed (`bbaf8a0`). DB Recovery Contract is the next eligible unit, but no further recovery unit is authorized for implementation.

## Design Links

| Unit | Target Design |
|---|---|
| R4 | `docs/architecture/ARCHITECTURE_DECISIONS.md`, AD-19 |
| R4 Sprint Packet | `docs/sprints/R4_BUILD_BASELINE_SPRINT_PACKET.md` |
| DB Recovery Contract | `docs/database/DB_RECOVERY_CONTRACT.md` |
| R1 Mailer | `docs/integrations/MAIL_DESIGN.md` |
| R2 Webhook | `docs/integrations/PAYMENT_PROVIDER_DESIGN.md`, `docs/architecture/TRANSACTION_AND_IDEMPOTENCY_DESIGN.md`, `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md` |
| R3 Technical Reconciliation | `docs/integrations/PAYMENT_PROVIDER_DESIGN.md`, `docs/architecture/TRANSACTION_AND_IDEMPOTENCY_DESIGN.md`, `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md` |
| Fees Policy | `docs/architecture/ARCHITECTURE_DECISIONS.md`, AD-14 |
| Tests | `docs/testing/TEST_ARCHITECTURE.md` |
