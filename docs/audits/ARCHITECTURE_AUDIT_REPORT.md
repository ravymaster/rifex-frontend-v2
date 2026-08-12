# Rifex Architecture Audit Report

This report materializes Architecture Audit AA1, AA2 and AA3. It records current architecture only. It does not open Architecture Design and does not authorize Sprint.

## Scope

Architecture Audit reconstructed the current Rifex system, critical flows, authority boundaries, data contracts, recovery readiness, risks and design inputs.

## Sources

- Repository HEAD `029973d457652387e7f158092ef925145178f7c2`
- Current working tree recovery/hardening diffs:
  - `src/lib/mailer.js`
  - `src/pages/api/admin/reconcile-payments.js`
  - `src/pages/api/checkout/webhook.js`
- Alignment documentation in `README.md` and `docs`
- Code under `src/pages`, `src/pages/api`, `src/lib`, `src/components`, `src/hooks`
- Database evidence in `db`, `sql`, docs and classified backup evidence

No backup rows, personal data or secret values are exposed here.

## Git State Audited

| Item | Status |
|---|---|
| Branch | `main` |
| HEAD | `029973d457652387e7f158092ef925145178f7c2` |
| origin/main local | `029973d457652387e7f158092ef925145178f7c2` |
| Staged | Empty |
| Working tree | Three recovery/hardening diffs only |
| Functional verification | UNVERIFIED |
| Architecture Audit AA1 | GO |
| Architecture Audit AA2 | GO |
| Architecture Audit AA3 | GO |
| Architecture Audit Documentation Ready | YES |
| Architecture Audit | CLOSED - GO |
| Next Eligible Stage | Architecture Design |
| Architecture Design | NOT YET OPEN |
| Sprint | NOT AUTHORIZED |

## Quality Evaluations

| Area | Evaluation |
|---|---|
| CURRENT LAYERING QUALITY | WEAK |
| DEPENDENCY DIRECTION QUALITY | WEAK |
| BUSINESS RULE OWNERSHIP | FRAGMENTED |
| DOMAIN ARCHITECTURE QUALITY | WEAK |
| IDENTITY AND AUTHORIZATION ARCHITECTURE | CRITICAL |
| PERSISTENCE ARCHITECTURE | WEAK |
| PAYMENT ARCHITECTURE | WEAK |
| FRONTEND ARCHITECTURE | PARTIAL |
| BACKEND ARCHITECTURE | WEAK |
| CONFIGURATION AND OPERATIONS | PARTIAL |
| TESTABILITY | WEAK |
| STATE AUTHORITY | CRITICAL |
| TRANSACTION AND CONCURRENCY | CRITICAL |
| ERROR CONTRACT QUALITY | WEAK |
| LEGACY BOUNDARY | FRAGMENTED |

## Current Architecture

Rifex is a Next.js Pages Router application. The real runtime shape is route-centric:

- UI pages and components live in `src/pages` and `src/components`.
- API routes live in `src/pages/api`.
- Supabase clients exist in `src/lib`, but many API routes instantiate clients inline.
- Mercado Pago, Resend and hCaptcha are called directly from API routes or `src/lib`.
- Domain rules are embedded in UI pages, API routes and database state.

## Capas Reales

| Layer | Existence | Notes |
|---|---|---|
| UI | CONFIRMED explicit | Pages and components |
| Presentation | CONFIRMED implicit | UI composition and CSS modules |
| API | CONFIRMED explicit | Next.js API routes |
| Application | IMPLICIT | Orchestration inside handlers |
| Domain | IMPLICIT | Rules in UI/API/DB |
| Infrastructure | IMPLICIT | Provider calls inline |
| Persistence | CONFIRMED but not bounded | Supabase direct access |
| Integration | CONFIRMED but coupled | MP, Resend, hCaptcha |
| Configuration | CONFIRMED | Env vars, package scripts, Next config |

## Dependency Direction

Observed dependencies are UI -> API, UI -> Supabase, API -> Supabase, API -> Mercado Pago, API -> Resend/mailer, lib -> providers and modules -> environment variables. Direction is not cleanly layered; UI depends on DB details and API routes contain business rules, persistence and integration code.

## Business Rule Ownership

Business rules are fragmented:

- Raffle creation and ticket generation live in `src/pages/api/rifas/index.js`.
- Ticket selection and legacy mapping live in `src/pages/rifas/[id].jsx`.
- Reservation lives in `src/pages/api/checkout/mp.js` and legacy `src/pages/api/checkout/index.js`.
- Ticket sale is duplicated across confirm, webhook and reconciliation.
- Winner selection lives in `src/pages/api/raffles/winner.js`.
- Fees exist as terms/docs/env and working tree reconciliation logic, without final commercial authority.

## Domain

The domain is implicit. Observable entities include `raffles`, `tickets`, `purchases`, `payments`, `merchant_gateways`, `mp_accounts`, `mp_oauth_state`, `raffle_results`, `email_logs`, `webhook_events`, `rifas` and `rifa_tickets`.

Ticket, purchase and payment states remain CONTRADICTORY.

## Identity And Authorization

Identity and authorization are CRITICAL. Some routes use Supabase cookies or bearer tokens, while other mutating routes trust client-controlled headers such as `x-user-id` and `x-user-email`. Several service-role routes bypass RLS and do not demonstrate ownership checks.

## Persistence

Persistence is WEAK. Supabase queries are dispersed across UI, API routes and libraries. There is no confirmed persistence gateway. Clean-install DB reproducibility remains PARTIAL because recovery requirements such as `email_logs`, `webhook_events` and `payments.live_mode` are not demonstrated as baseline migrations.

## Payments

Payment architecture is WEAK. Checkout, confirm, webhook and reconciliation duplicate payment and ticket transition responsibilities. Mercado Pago is the intended external authority for payment status, but internal writers are fragmented. Working tree improves HMAC/live-mode handling but is still UNVERIFIED.

## Integrations

| Provider | Current Boundary | Risk |
|---|---|---|
| Mercado Pago | Multiple API routes and helper | Provider coupling |
| Resend | `src/lib/mailer.js` plus direct email endpoint | Duplicate authority and PII risk |
| Supabase | Browser/server/admin/inline clients | Service-role sprawl |
| hCaptcha | Dedicated verification route | UNVERIFIED |
| Replicate | Scripts/tooling dependency | Runtime role UNVERIFIED |

## Frontend

Frontend architecture is PARTIAL. UI composition is present and reusable, but `src/pages/rifas/[id].jsx` mixes data loading, legacy mapping, payment return handling, winner triggering, selection and checkout calls.

Confirmed defect: `src/pages/checkout/index.js` is an API handler interpreted as a React page, causing the known `/checkout` build failure.

## Backend

Backend architecture is WEAK. API routes are cohesive by URL surface but many are multi-responsibility handlers. Auth, validation, persistence, provider calls, logging and business transitions are route-local.

## Operations

Configuration and operations are PARTIAL. Scripts are limited to `dev`, `build` and `start`; no test script is declared. `next.config.mjs` defines standalone output and a canonical redirect. Health checks, release checks and observability contracts are not consolidated.

## Testability

Testability is WEAK. Provider calls and DB access are tightly coupled to handlers. There is no evidenced test suite. Build previously failed at `/checkout` and was not repeated during AA3.

## Legacy

Legacy boundary is FRAGMENTED. `raffles/tickets` and `rifas/rifa_tickets` coexist. Compat views and mappers remain active evidence and cannot be removed without Architecture Design.

## Recovery Units

| Unit | Status |
|---|---|
| R4 Build Baseline | Requires Architecture Design before implementation |
| DB Recovery Contract | Requires reproducible contracts |
| R1 Mailer | Requires mail/PII/DB decisions |
| R2 Webhook | Requires payment authority, HMAC, replay and DB decisions |
| R3 Technical Reconciliation | Requires admin auth, idempotency and fee separation |
| Fees Policy | Requires explicit commercial decision |

## Preservation Matrix

| Component | Classification |
|---|---|
| Pages Router structure | Preserve |
| `getSupabaseServer` | Preserve |
| `api/panel/raffles` bearer pattern | Refine |
| Merchant MP cookie routes | Refine |
| OAuth PKCE state flow | Refine |
| `checkout/mp` | Isolate |
| `checkout/webhook` | Isolate |
| `admin/reconcile-payments` | Isolate |
| `mailer.js` | Refine |
| Legacy checkout/index | Isolate |
| Misplaced checkout pages under API | Replace/relocate candidate |
| Dev endpoints | Isolate |
| Legacy compat mappers | Refine |

## Critical Risks

- Client-controlled identity headers in mutating flows.
- Public winner creation via `ensure=1`.
- Fragmented payment sale authority.
- Critical state contradictions.
- Non-atomic multi-query mutations.
- `/checkout` build/routing defect.
- Dev mutating endpoint with service-role behavior.

## Moderate Risks

- Service-role sprawl.
- Error contract inconsistency.
- MP token storage without encryption evidence.
- PII and payload logging policy unresolved.
- Fees mixed into technical reconciliation.
- Parallel `mp_accounts` and `merchant_gateways`.

## Minor Risks

- Encoding/mojibake in user-facing text.
- Legacy naming increases cognitive load.
- Tooling scripts are outside a formal lifecycle.

## Gates

| Gate | Result |
|---|---|
| ARCHITECTURE AUDIT AA1 | GO |
| ARCHITECTURE AUDIT AA2 | GO |
| ARCHITECTURE AUDIT AA3 | GO |
| ARCHITECTURE AUDIT DOCUMENTATION READY | YES |
| ARCHITECTURE AUDIT CLOSING GATE | GO |
| ARCHITECTURE AUDIT | CLOSED - GO |
| NEXT ELIGIBLE STAGE | ARCHITECTURE DESIGN |
| ARCHITECTURE DESIGN | NOT YET OPEN |
| SPRINT | NOT AUTHORIZED |

## Limitations

- No new build was executed during AA1-AA3; Alignment A3 build failed at `/checkout`.
- No tests were executed.
- No services were called.
- No migrations were created or executed.
- No backup content was inspected in AA3.
- Functional behavior remains UNVERIFIED.

## Integrity

Architecture Audit is closed as documentation and analysis. Architecture Design is the next eligible stage but is NOT YET OPEN. Sprint remains NOT AUTHORIZED.
