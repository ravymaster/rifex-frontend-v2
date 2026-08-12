# Rifex Recovery Plan

This document records the approved Alignment A3/A4 recovery decomposition. It is a plan, not an implementation.

## Baseline

| Item | Status |
|---|---|
| HEAD | `029973d457652387e7f158092ef925145178f7c2` |
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
| Failure | `npm run build` failed at `/checkout` |
| Cause | CONFIRMED: API handler located as page route |
| Evidence | `/checkout` prerender produced React error #31 and `TypeError: t.status is not a function` |
| Relation to recovery diffs | UNRELATED TO RECOVERY DIFFS |
| Future criterion | `npm run build` succeeds |
| Implementation | NOT IMPLEMENTED |

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

This sequence is approved as planning input only. Architecture Audit documentation is closed and provides input for a future Architecture Design, but Architecture Design is not open and no recovery unit is authorized for implementation.
