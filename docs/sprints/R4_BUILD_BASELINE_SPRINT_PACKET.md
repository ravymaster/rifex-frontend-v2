# R4 Build Baseline Sprint Packet

## Identity

```text
SPRINT ID:
R4

NAME:
Build Baseline Recovery

STATUS:
READY — NOT YET OPEN
```

R4 is ready for a future explicitly authorized Sprint. This packet does not open Sprint and does not implement R4.

## Objective

Restore the build baseline by resolving the `/checkout` page/API route conflict while preserving checkout APIs and the three pre-existing recovery/hardening diffs.

## Current Evidence

| Evidence | Status |
|---|---|
| Previous build failure | CONFIRMED at `/checkout` during Alignment A3 |
| Cause | `src/pages/checkout/index.js` is a Pages Router page route containing API handler code |
| Active checkout API candidate | `/api/checkout/mp` |
| Legacy checkout API | `/api/checkout` |
| Payment webhook | `/api/checkout/webhook` |
| Functional verification | UNVERIFIED |

## R4 Decision

R4 DECISION:
A — VALID REACT PAGE

PROPOSED R4 DECISION: A

Implement `/checkout` as a valid React page. It does not use `req` or `res`, does not contain API logic, does not create or confirm payments, does not call external services, offers a safe exit for direct access, preserves success/pending/failure routes, and does not expand UX. Do not delete it and do not redirect it to a route that needs raffle context unless later evidence proves a safe target.

## Scope

| Scope Item | Status |
|---|---|
| `src/pages/checkout/index.js` | ALLOWED |
| `src/pages/checkout/success.jsx` | PRESERVE; not in default edit scope |
| `src/pages/checkout/pending.jsx` | PRESERVE; not in default edit scope |
| `src/pages/checkout/failure.jsx` | PRESERVE; not in default edit scope |
| checkout APIs | PRESERVE |
| DB/migrations | OUT OF SCOPE |
| payments, webhook, reconcile, mailer | OUT OF SCOPE |
| fees and OAuth | OUT OF SCOPE |

## Explicit Prohibitions

- Do not modify `src/lib/mailer.js`.
- Do not modify `src/pages/api/admin/reconcile-payments.js`.
- Do not modify `src/pages/api/checkout/webhook.js`.
- Do not modify checkout API routes.
- Do not modify DB schema, migrations, `.gitignore` or the PostgreSQL backup.
- Do not install dependencies.
- Do not create tests unless a future Sprint prompt explicitly authorizes them.
- Do not call live Mercado Pago, Resend or Supabase production services.

## Caller Contract

| Route | File | Contract |
|---|---|---|
| `/checkout` | `src/pages/checkout/index.js` | must be a valid React page |
| `/checkout/success` | `src/pages/checkout/success.jsx` | preserve return page |
| `/checkout/pending` | `src/pages/checkout/pending.jsx` | preserve return page |
| `/checkout/failure` | `src/pages/checkout/failure.jsx` | preserve return page |
| `/api/checkout/mp` | `src/pages/api/checkout/mp.js` | preserve active preference API |
| `/api/checkout` | `src/pages/api/checkout/index.js` | preserve legacy/compat API |
| `/api/checkout/confirm` | `src/pages/api/checkout/confirm.js` | preserve confirmation endpoint |
| `/api/checkout/webhook` | `src/pages/api/checkout/webhook.js` | preserve webhook endpoint |

## Implementation Plan

| Step | Action | Acceptance |
|---|---|---|
| 1 | Verify Git integrity before edits | branch, HEAD/origin, staged and expected diffs match |
| 2 | Replace API-handler content in `src/pages/checkout/index.js` with valid React page behavior | file exports a React component |
| 3 | Preserve user-facing route compatibility | `/checkout` remains public and safe |
| 4 | Do not touch checkout APIs or recovery diffs | diff contains only allowed file |
| 5 | Run build gate | `npm run build` succeeds |
| 6 | Run final static checks | callers and routes preserved |
| 7 | Run secret scan on changed file | no secrets |
| 8 | Report release evidence | R4 implementation remains uncommitted until release audit/authorization |

## Acceptance Criteria

| Criterion | Required |
|---|---|
| Build baseline | `npm run build` passes |
| `/checkout` prerender | no React error #31; no `t.status is not a function` |
| Route boundary | `/checkout` is page; `/api/checkout*` remain APIs |
| Functional blast radius | no payment, DB, mail, webhook or reconcile changes |
| Existing diffs | three recovery/hardening diffs remain intact |
| Backup | remains present and ignored |
| Staging | empty unless later explicitly authorized |

## Test Plan

Required during future R4 Sprint:

- `git status --short`
- `git rev-parse HEAD`
- static inspection of `src/pages/checkout/index.js`
- route/caller grep for `/checkout` and `/api/checkout`
- `npm run build`
- secret scan limited to changed files
- final `git status --short`

Optional only if future authorization allows:

- local dev smoke for `/checkout`
- browser smoke for `/checkout/success`, `/checkout/pending`, `/checkout/failure`

## Rollback

Rollback before commit: restore only `src/pages/checkout/index.js` to its pre-R4 content.
Rollback after commit: revert the R4 commit.
Rollback must not affect the three pre-existing recovery/hardening diffs.

## Commit Boundary

Future R4 should produce one commit only after Release Audit approval.

```text
fix: restore checkout page build
```

## Release Audit Packet

The release audit after R4 must confirm:

| Item | Expected |
|---|---|
| Diff scope | only authorized file changed |
| Build | passed |
| Checkout APIs | unchanged |
| Secrets | none |
| Staged files | empty unless commit phase is authorized |
| Working tree explanation | three pre-existing recovery/hardening diffs preserved |

## Gates

| Gate | Status |
|---|---|
| ARCHITECTURE DESIGN CLOSING GATE | GO |
| ARCHITECTURE DESIGN AD3 | GO |
| R4 SPRINT READINESS | GO |
| SPRINT | NOT YET OPEN / NOT AUTHORIZED |

## Limits

This packet is an executable contract for a future Sprint. It is not implementation, not a release audit, not production certification and not authorization to open Sprint.