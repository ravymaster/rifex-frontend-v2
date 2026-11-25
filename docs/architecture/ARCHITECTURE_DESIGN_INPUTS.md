# Architecture Design Inputs

These inputs are carried from Architecture Audit. They are decision packets that fed Architecture Design AD1. AD2 materializes the corrected decisions in:

- `docs/architecture/ARCHITECTURE_TARGET.md`
- `docs/architecture/ARCHITECTURE_DECISIONS.md`
- `docs/architecture/TARGET_FLOWS.md`
- `docs/architecture/TRANSACTION_AND_IDEMPOTENCY_DESIGN.md`
- `docs/security/IDENTITY_AUTHORIZATION_DESIGN.md`
- `docs/database/DB_RECOVERY_CONTRACT.md`
- `docs/integrations/PAYMENT_PROVIDER_DESIGN.md`
- `docs/integrations/MAIL_DESIGN.md`
- `docs/testing/TEST_ARCHITECTURE.md`

This file remains the Architecture Audit input ledger and is not an implementation document.

## AD-01

| Field | Value |
|---|---|
| ID | AD-01 |
| Title | Domain boundary |
| Problem | Business rules live in UI, API routes and DB state. |
| Evidence | `src/pages/rifas/[id].jsx`, checkout routes, winner route, reconciliation route. |
| Current authority | FRAGMENTED |
| Risk | Divergent rules and unsafe recovery. |
| Restrictions | Do not impose a rewrite or unproven architecture. |
| Allowed options | Extract rules, formalize route contracts, or introduce minimal shared modules. |
| Unauthorized decisions | Final layering or implementation strategy. |
| Dependencies | AD-02, AD-06 |
| Missing information | Priority and tolerance for refactor size. |
| Future criterion | Critical rules have one explicit owner. |
| Affected gate | Architecture Design |

## AD-02

| Field | Value |
|---|---|
| ID | AD-02 |
| Title | Canonical states |
| Problem | Ticket, purchase, payment and raffle states are contradictory. |
| Evidence | `available/free/pending/sold/reserved/paid`, purchase states across checkout/release/confirm/docs. |
| Current authority | CONTRADICTORY |
| Risk | Invalid transitions and stuck records. |
| Restrictions | Legacy cannot be removed without a strategy. |
| Allowed options | State map, compatibility layer, migration, or explicit translation boundary. |
| Unauthorized decisions | Final enum values. |
| Dependencies | AD-07, AD-15 |
| Missing information | Remote DB state. |
| Future criterion | Approved state machine per aggregate. |
| Affected gate | DB Recovery Contract |

## AD-03

| Field | Value |
|---|---|
| ID | AD-03 |
| Title | Identity contract |
| Problem | Supabase Auth coexists with client-controlled headers. |
| Evidence | `x-user-id`, `x-user-email`, bearer token, Supabase cookies. |
| Current authority | FRAGMENTED |
| Risk | User impersonation. |
| Restrictions | No implementation in Architecture Audit. |
| Allowed options | Server-side bearer validation, cookie session validation, or explicit public flow contracts. |
| Unauthorized decisions | Single mechanism selection. |
| Dependencies | AD-04, AD-05 |
| Missing information | Deployment/session requirements. |
| Future criterion | Identity source is defined for every route. |
| Affected gate | Security design |

## AD-04

| Field | Value |
|---|---|
| ID | AD-04 |
| Title | Mutation authorization |
| Problem | Mutating endpoints lack uniform authorization. |
| Evidence | `POST /api/rifas`, `PATCH /api/rifas/[id]`, winner ensure, dev upsert, disconnect. |
| Current authority | Route-local |
| Risk | Unauthorized mutations. |
| Restrictions | No Sprint yet. |
| Allowed options | Endpoint policy matrix, middleware, route-local guards, RLS-backed authorization. |
| Unauthorized decisions | Implementation mechanism. |
| Dependencies | AD-03, AD-05 |
| Missing information | Admin and creator role definitions. |
| Future criterion | Every mutation has auth/authz/ownership proof. |
| Affected gate | Sprint readiness |

## AD-05

| Field | Value |
|---|---|
| ID | AD-05 |
| Title | Ownership |
| Problem | Raffle and merchant ownership checks are inconsistent. |
| Evidence | Panel bearer filter versus PATCH/delete/header-based disconnect. |
| Current authority | PARTIAL |
| Risk | Horizontal access escalation. |
| Restrictions | Preserve existing data. |
| Allowed options | DB/RLS ownership, application ownership checks, or hybrid policy. |
| Unauthorized decisions | Final ownership source. |
| Dependencies | AD-03, AD-06 |
| Missing information | Canonical creator identity. |
| Future criterion | Owner check per object and mutation. |
| Affected gate | Security design |

## AD-06

| Field | Value |
|---|---|
| ID | AD-06 |
| Title | Persistence boundary |
| Problem | Supabase access is scattered across UI, API and lib. |
| Evidence | many `.from(...)` calls across `src/pages`, `src/pages/api`, `src/lib`. |
| Current authority | Each caller. |
| Risk | Contract drift and hard-to-test recovery. |
| Restrictions | Do not impose a generic architecture without evidence. |
| Allowed options | Query helpers, repository/gateway, or route-only persistence rule. |
| Unauthorized decisions | Specific abstraction. |
| Dependencies | AD-07 |
| Missing information | Desired refactor scope. |
| Future criterion | Documented persistence access policy. |
| Affected gate | Architecture Design |

## AD-07

| Field | Value |
|---|---|
| ID | AD-07 |
| Title | Reproducible DB contract |
| Problem | Clean install reproducibility is PARTIAL. |
| Evidence | `email_logs`, `webhook_events`, `payments.live_mode` required by recovery but not baseline migrations. |
| Current authority | Docs, migrations, backup evidence and code. |
| Risk | Recovery line cannot be certified. |
| Restrictions | Backup is evidence, not baseline. |
| Allowed options | Versioned migrations, schema reconciliation, migration audit. |
| Unauthorized decisions | Migration contents. |
| Dependencies | AD-02, AD-06 |
| Missing information | Remote DB authoritative state. |
| Future criterion | Clean install reproduces required objects. |
| Affected gate | DB Recovery Contract |

## AD-08

| Field | Value |
|---|---|
| ID | AD-08 |
| Title | Transaction model |
| Problem | Critical operations are multi-query without explicit transactions. |
| Evidence | create raffle+tickets, checkout reservation, sale, release, winner. |
| Current authority | Application sequence. |
| Risk | Partial writes and races. |
| Restrictions | Current stack is Supabase/Postgres. |
| Allowed options | RPC, constraints, locks, idempotent commands, compensation. |
| Unauthorized decisions | Final transaction mechanism. |
| Dependencies | AD-06, AD-07 |
| Missing information | DB function policy. |
| Future criterion | Critical transitions have atomicity or compensation contract. |
| Affected gate | Recovery implementation |

## AD-09

| Field | Value |
|---|---|
| ID | AD-09 |
| Title | Payment authority |
| Problem | Payment sale authority is duplicated. |
| Evidence | confirm, webhook and reconcile all can update purchase/tickets. |
| Current authority | FRAGMENTED |
| Risk | Double sale or divergent state. |
| Restrictions | Mercado Pago remains current provider. |
| Allowed options | Single sale authority, event processor, reconcile as repair-only. |
| Unauthorized decisions | Final payment command owner. |
| Dependencies | AD-10, AD-11 |
| Missing information | Operational payment policy. |
| Future criterion | One authoritative path for ticket sale. |
| Affected gate | R2/R3 |

## AD-10

| Field | Value |
|---|---|
| ID | AD-10 |
| Title | Idempotency/replay |
| Problem | MP returns and webhooks can repeat. |
| Evidence | unique `mp_payment_id` partial, webhook event logging in working tree, HMAC in working tree. |
| Current authority | PARTIAL |
| Risk | Repeated side effects. |
| Restrictions | No provider calls in design input. |
| Allowed options | event table, unique idempotency keys, processed flags. |
| Unauthorized decisions | Exact key strategy. |
| Dependencies | AD-07, AD-09 |
| Missing information | Verified MP event contract. |
| Future criterion | Replay-safe payment flow. |
| Affected gate | R2/R3 |

## AD-11

| Field | Value |
|---|---|
| ID | AD-11 |
| Title | Mercado Pago boundary |
| Problem | Mercado Pago calls are spread across checkout, OAuth, confirm, webhook and reconcile. |
| Evidence | MP SDK/API calls in multiple API routes. |
| Current authority | Route-local |
| Risk | Provider coupling and inconsistent error handling. |
| Restrictions | No mandatory provider migration. |
| Allowed options | adapter/service module, expanded `mpRest`, per-flow facade. |
| Unauthorized decisions | Boundary implementation. |
| Dependencies | AD-09, AD-10 |
| Missing information | Marketplace/live policy. |
| Future criterion | Explicit MP contract. |
| Affected gate | Payment design |

## AD-12

| Field | Value |
|---|---|
| ID | AD-12 |
| Title | Mail boundary |
| Problem | Email delivery has multiple paths. |
| Evidence | `src/lib/mailer.js`, `api/email/confirm`, dev test email. |
| Current authority | PARTIAL |
| Risk | Duplicate sends and PII exposure. |
| Restrictions | Resend is current provider. |
| Allowed options | central mailer, event-based mail, endpoint isolation. |
| Unauthorized decisions | Final delivery policy. |
| Dependencies | AD-13 |
| Missing information | retention policy. |
| Future criterion | One mail authority with idempotency. |
| Affected gate | R1 |

## AD-13

| Field | Value |
|---|---|
| ID | AD-13 |
| Title | PII/logging |
| Problem | Payload and email body logging may persist sensitive content. |
| Evidence | working tree `email_logs` and `webhook_events`; backup classified sensitive. |
| Current authority | UNKNOWN |
| Risk | Sensitive data retention. |
| Restrictions | Do not expose backup data. |
| Allowed options | metadata-only logging, minimization, retention rules. |
| Unauthorized decisions | retention period and exact fields. |
| Dependencies | AD-12 |
| Missing information | legal/compliance requirements. |
| Future criterion | PII logging policy approved. |
| Affected gate | Security design |

## AD-14

| Field | Value |
|---|---|
| ID | AD-14 |
| Title | Fees separation |
| Problem | Commercial fee policy is not authoritative. |
| Evidence | terms, env defaults and working tree reconciliation fee logic. |
| Current authority | CONTRADICTORY |
| Risk | incorrect payout or communication. |
| Restrictions | No commercial decision in audit. |
| Allowed options | separate policy contract, disabled fees, plan-based contract. |
| Unauthorized decisions | percentages, rounding, ownership, legal approval. |
| Dependencies | AD-09 |
| Missing information | business-approved fee policy. |
| Future criterion | explicit fee decision. |
| Affected gate | Fees Policy |

## AD-15

| Field | Value |
|---|---|
| ID | AD-15 |
| Title | Legacy strategy |
| Problem | `raffles/tickets` and `rifas/rifa_tickets` coexist. |
| Evidence | fallback mappers, compat views, `/api/mp/preference`. |
| Current authority | FRAGMENTED |
| Risk | domain contamination. |
| Restrictions | Do not remove without evidence. |
| Allowed options | preserve compat, migrate, freeze legacy, deprecate after audit. |
| Unauthorized decisions | deletion/removal. |
| Dependencies | AD-02, AD-07 |
| Missing information | production data dependency. |
| Future criterion | legacy boundary documented. |
| Affected gate | Architecture Design |

## AD-16

| Field | Value |
|---|---|
| ID | AD-16 |
| Title | Error contracts |
| Problem | API error shapes and status codes vary. |
| Evidence | `{ok,error}`, `{error}`, redirects, 200 with `ok:false`. |
| Current authority | Route-local |
| Risk | client ambiguity and unsafe retries. |
| Restrictions | preserve caller expectations until migration plan. |
| Allowed options | common taxonomy, adapters, per-flow error map. |
| Unauthorized decisions | final schema. |
| Dependencies | AD-17 |
| Missing information | frontend UX requirements. |
| Future criterion | client-handled error contract. |
| Affected gate | Test and release audits |

## AD-17

| Field | Value |
|---|---|
| ID | AD-17 |
| Title | Test architecture |
| Problem | No test suite is evidenced. |
| Evidence | `package.json` has `dev`, `build`, `start` only. |
| Current authority | ABSENT |
| Risk | recovery cannot be certified safely. |
| Restrictions | no tests created in AA3. |
| Allowed options | unit, integration mocks, route tests, e2e, build gate. |
| Unauthorized decisions | framework and final suite scope. |
| Dependencies | all recovery units. |
| Missing information | CI/deploy constraints. |
| Future criterion | tests mapped to risk. |
| Affected gate | Sprint readiness |

## AD-18

| Field | Value |
|---|---|
| ID | AD-18 |
| Title | Recovery sequencing |
| Problem | Recovery units have dependencies. |
| Evidence | approved sequence R4 -> DB -> R1 -> R2 -> R3 Technical -> Fees Policy. |
| Current authority | documented plan. |
| Risk | unsafe implementation order. |
| Restrictions | no Sprint authorization. |
| Allowed options | preserve sequence, split commits, release audits. |
| Unauthorized decisions | sprint decomposition. |
| Dependencies | AD-07, AD-19 |
| Missing information | user authorization for next stage. |
| Future criterion | design-backed recovery backlog. |
| Affected gate | Architecture Design close |

## AD-19

| Field | Value |
|---|---|
| ID | AD-19 |
| Title | Build routing boundary |
| Problem | `/checkout` build/routing conflict blocks build baseline. |
| Evidence | `src/pages/checkout/index.js` is an API handler interpreted as a React page; A3 build failed. |
| Current authority | Next.js filesystem routing. |
| Risk | build remains blocked. |
| Restrictions | do not correct in AA3. |
| Allowed options | relocate handler, create page component, split route names. |
| Unauthorized decisions | exact file move or code fix. |
| Dependencies | AD-18 |
| Missing information | desired checkout URL contract. |
| Future criterion | build route contract approved. |
| Affected gate | R4 Build Baseline |
