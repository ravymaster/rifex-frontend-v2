# Architecture Design AD3 Report

## Purpose

This report records Architecture Design AD3: closing evidence for Architecture Design and readiness of the future R4 Build Baseline Sprint. It is documentation only.

## Sources

- `README.md`
- `docs/WOP.md`
- `docs/CURRENT_STATE.md`
- `docs/ROADMAP.md`
- `docs/architecture/ARCHITECTURE_TARGET.md`
- `docs/architecture/ARCHITECTURE_DECISIONS.md`
- `docs/architecture/TARGET_FLOWS.md`
- `docs/architecture/TRANSACTION_AND_IDEMPOTENCY_DESIGN.md`
- `docs/security/IDENTITY_AUTHORIZATION_DESIGN.md`
- `docs/database/DB_RECOVERY_CONTRACT.md`
- `docs/integrations/PAYMENT_PROVIDER_DESIGN.md`
- `docs/integrations/MAIL_DESIGN.md`
- `docs/testing/TEST_ARCHITECTURE.md`
- `docs/recovery/RECOVERY_PLAN.md`
- Git status and static route/caller inspection

## Git State

| Item | Status |
|---|---|
| Branch | `main` |
| HEAD | `b46ef9d424a89baedd56183a47d2a29741996160` |
| origin/main | `b46ef9d424a89baedd56183a47d2a29741996160` |
| Staged files | empty |
| Expected functional diffs | `src/lib/mailer.js`, `src/pages/api/admin/reconcile-payments.js`, `src/pages/api/checkout/webhook.js` |
| Backup | present and ignored |

## Design Completeness

| Area | Evidence | Result |
|---|---|---|
| AD-01 to AD-19 | materialized in Architecture Design documents | COMPLETE FOR DESIGN |
| Target boundaries | UI, API routes, services, domain rules, ports, adapters and persistence | COMPLETE FOR DESIGN |
| Recovery sequencing | R4 -> DB -> R1 -> R2 -> R3 Technical -> Fees Policy | COMPLETE FOR DESIGN |
| Functional verification | not executed during AD3 | UNVERIFIED |
| Production readiness | not certified | NOT EVIDENCED |

## Traceability

| Area | Decisions | Status |
|---|---|---|
| Domain and layers | AD-01, AD-06, AD-18 | traced |
| States | AD-02 | traced with deferrals |
| Identity, authorization and ownership | AD-03, AD-04, AD-05 | traced |
| DB reproducibility | AD-07, AD-08 | traced without executable SQL |
| Payment authority and idempotency | AD-09, AD-10, AD-11 | traced |
| Mail, PII and logs | AD-12, AD-13 | traced |
| Fees | AD-14 | deferred as commercial policy |
| Legacy, errors, tests and routing | AD-15, AD-16, AD-17, AD-19 | traced |

## Deferrals

| Deferral | Blocks R4 | Later gate |
|---|---|---|
| Final admin role model | No | R3/admin security |
| Exact SQL and migrations | No | DB Recovery |
| Token storage/cipher detail | No | MP/OAuth hardening |
| PII retention period | No | security/release policy |
| Commercial fees policy | No | Fees Policy |
| Exact test dependency versions | No | test implementation |
| Legacy caller migration | No | legacy cleanup |

## R4 Caller Audit

| Route | File | Evidence | R4 Impact |
|---|---|---|---|
| `/checkout` | `src/pages/checkout/index.js` | physical page route contains API handler content | primary build blocker |
| `/checkout/success` | `src/pages/checkout/success.jsx` | calls `/api/checkout/confirm` | preserve |
| `/checkout/pending` | `src/pages/checkout/pending.jsx` | return page | preserve |
| `/checkout/failure` | `src/pages/checkout/failure.jsx` | return page | preserve |
| `/api/checkout/mp` | `src/pages/api/checkout/mp.js` | active caller from raffle detail and panel MP check | do not modify in R4 |
| `/api/checkout` | `src/pages/api/checkout/index.js` | legacy/compat API | do not remove without separate caller decision |
| `/api/checkout/confirm` | `src/pages/api/checkout/confirm.js` | used by return flows | do not modify in R4 |
| `/api/checkout/webhook` | `src/pages/api/checkout/webhook.js` | Mercado Pago notification URL | pre-existing diff, do not modify in R4 |

## R4 Decision

PROPOSED R4 DECISION: A

R4 should keep `/checkout` as a valid React page. Deleting it is not justified because unknown external callers can exist, and redirecting without route context has no canonical destination. This decision fixes the build blocker without changing payment, DB, mail, webhook or reconciliation logic.

## Allowlist

| Category | Files |
|---|---|
| R4 allowed file | `src/pages/checkout/index.js` |
| R4 prohibited functional diffs | `src/lib/mailer.js`, `src/pages/api/admin/reconcile-payments.js`, `src/pages/api/checkout/webhook.js` |
| R4 prohibited areas | checkout APIs, DB, migrations, `.gitignore`, backup, fees, OAuth, mailer, webhook, reconciliation |

## Acceptance Criteria

| Criterion | Required Result |
|---|---|
| `/checkout` route | valid React page or controlled frontend behavior |
| Build | `npm run build` succeeds |
| Existing checkout APIs | preserved |
| Three recovery/hardening diffs | intact |
| Secrets | none introduced |
| Staging | none unless later authorized |

## Test Plan

R4 must run static route/caller checks, inspect the single changed file, execute `npm run build`, scan changed files for secrets, and perform final Git integrity checks. Live provider calls, production deployment and DB migrations are outside R4.

## Rollback

Before commit, rollback is selective restoration of `src/pages/checkout/index.js`. After commit, rollback is reverting the R4 commit. Rollback must not revert the three pre-existing recovery/hardening diffs.

## Release Boundary

R4 is a build-baseline recovery unit only. It does not certify payments, database state, production readiness, mail delivery, webhook correctness, reconciliation correctness or fees.

## Gates

| Gate | Status |
|---|---|
| ARCHITECTURE DESIGN CLOSING GATE | GO |
| ARCHITECTURE DESIGN AD3 | GO |
| R4 SPRINT READINESS | GO |
| SPRINT | NOT YET OPEN / NOT AUTHORIZED |

## Limits

AD3 did not implement R4, did not run build, did not create tests, did not create migrations, did not inspect the backup, did not stage, did not commit, did not push and did not open Sprint.

## Integrity

Working tree was preserved with only the three expected functional diffs. The backup remained ignored and outside Git baseline. Functional behavior remains `UNVERIFIED`.