# Test Architecture

This document defines target test architecture. It installs nothing and creates no tests.

## Stack Roles

| Tool/Level | Role |
|---|---|
| Vitest | domain rules, application services and mappers |
| Route-handler contract tests | API method/input/output/error contracts |
| Supabase persistence integration | migrations, constraints and query/write modules |
| Mercado Pago fake | preference, lookup, webhook and OAuth scenarios |
| Resend fake | mail send, timeout, retry and provider IDs |
| Concurrency/idempotency tests | duplicate webhooks, reserve races, reconcile replay, winner creation |
| Migration checks | clean install and rollback validation |
| next build | R4 build baseline gate |
| Playwright | selective browser e2e for checkout and critical UI flows |
| Fixtures | deterministic raffles, tickets, purchases, payments and gateways |
| Isolation | no live provider calls, no external services in normal CI |
| CI future | run gates by recovery unit before release audit |
| Artifacts | logs, coverage, screenshots when applicable, build output |

Exact dependency versions are DEFERRED.

## Recovery Gates

| Gate | Required Evidence |
|---|---|
| R4 | next build passes; /checkout is valid page or controlled redirect; callers preserved/migrated |
| DB Recovery | clean install, migrations, constraints, canonical states and legacy mappers validated |
| R1 | mail unit tests, Resend fake, durable dedup, retry and PII minimization |
| R2 | HMAC fail-closed, webhook replay/idempotency, live/sandbox, payment transition |
| R3 | admin auth, reconcile lookup, shared ApplyPaymentEvidence, fee separation |

Determinism is required for all unit and route tests. Provider fakes replace external calls.

## R4 Build Baseline Test Packet

R4 must verify the build baseline without live providers.

| Check | Required |
|---|---|
| Git integrity before edit | branch `main`, expected HEAD/origin, staged empty, only three pre-existing recovery diffs |
| Scope check | only `src/pages/checkout/index.js` may change unless a release audit explicitly rejects that minimum scope |
| Static route check | `/checkout` is a React page; checkout APIs remain API routes |
| Caller preservation | `/api/checkout/mp`, `/api/checkout/confirm`, `/api/checkout/webhook`, `/checkout/success`, `/checkout/pending`, `/checkout/failure` remain callable by their existing paths |
| Build gate | `npm run build` succeeds |
| Secret scan | no secrets introduced in changed files |
| Final Git check | no staged files unless explicitly authorized; three recovery/hardening diffs still intact |

R4 does not require live Mercado Pago, live Resend, database migrations or production deployment.