# Alignment A3/A4 Report

This report preserves the evidence and decisions from Alignment A3 and A4. It contains no secrets and no backup rows.

## Purpose

| Phase | Purpose |
|---|---|
| A3 | Certify whether the recovery/hardening line can be adopted |
| A4 | Decompose recovery into independent certification units |

## Git State Inspected

| Item | Value |
|---|---|
| HEAD | `6d0409b7f874adc1278be6808bc4c69753057758` |
| origin/main local | `6d0409b7f874adc1278be6808bc4c69753057758` |
| Working tree | Three functional diffs only |
| Staged | Empty |

Files audited:

- `src/lib/mailer.js`
- `src/pages/api/admin/reconcile-payments.js`
- `src/pages/api/checkout/webhook.js`

## Local Validation Evidence

| Validation | Result |
|---|---|
| `node --check src/lib/mailer.js` | PASS |
| `node --check src/pages/api/admin/reconcile-payments.js` | PASS |
| `node --check src/pages/api/checkout/webhook.js` | PASS |
| `npm run build` | FAIL at `/checkout` |

Build failure:

```text
React error #31
TypeError: t.status is not a function
```

Cause classification: CONFIRMED. `/checkout` is implemented as an API handler under a page route, so Next attempts to prerender a non-component.

Relationship to recovery diffs: UNRELATED TO RECOVERY DIFFS.

## Certifications

| Area | Result |
|---|---|
| MAILER CERTIFICATION | PARTIAL |
| WEBHOOK CERTIFICATION | PARTIAL |
| RECONCILIATION CERTIFICATION | PARTIAL |
| FEES CONTRACT | PARTIAL |
| CLEAN INSTALL DB REPRODUCIBILITY | PARTIAL |

## Approved Decisions

```text
RECOVERY DECISION: B
```

```text
RECOVERY SEQUENCE:
R4 -> DB Recovery Contract -> R1 Mailer -> R2 Webhook -> R3 Technical Reconciliation -> Fees Policy
```

```text
FEES TREATMENT: SEPARATE
PAYLOAD LOGGING: MOVE_AFTER_VALIDATION
MAIL CONTENT STORAGE: MINIMIZE
```

These decisions are documented, not implemented.

## Critical Risks

- Missing reproducible DB contracts for `email_logs`, `webhook_events` and `payments.live_mode`.
- Build failure at `/checkout`.
- Webhook strict HMAC can reject real events if secret/header setup is incorrect.
- Payload and email content logging can persist sensitive data if not minimized.

## Limits

- No external services were called.
- No emails were sent.
- No payments were generated.
- No migrations or tests were created.
- No recovery diff was adopted.

## Gates

| Gate | Result |
|---|---|
| ALIGNMENT A3 | GO |
| ALIGNMENT A4 | GO |
