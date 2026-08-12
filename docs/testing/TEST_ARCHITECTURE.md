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
