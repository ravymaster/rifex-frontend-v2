# Architecture Decisions

Architecture Design AD2 materializes the corrected AD1 decisions. These decisions replace AD1 original conceptually. They do not implement behavior, open Sprint, or certify production readiness.

| ID | State | Contexto | Decision | Deferrals | Rejected Alternatives | Gate |
|---|---|---|---|---|---|---|
| AD-01 | DECIDED | Current rules are spread across UI, API routes and provider calls; audit evidence shows route-centric code, so explicit boundaries are needed to recover safely. | Introduce incremental target layers: UI, API routes, application services, domain rules, concrete ports, adapters and persistence modules. | None material. | Big Bang rewrite; generic architecture imposed everywhere; Warp Core requirement. | Architecture Design |
| AD-02 | DECIDED WITH DEFERRALS | Ticket, purchase, payment and raffle states differ across code, docs and DB evidence; canonical states are necessary before DB recovery. | Canonical states separate durable states from transitions and processing outcomes. Tickets: available, held, sold. | Raffle archived/cancelled/reopened; winner eligibility policy; close-early policy. | Treating release/reconciled/ignored_sandbox as durable financial states. | DB Recovery Contract |
| AD-03 | DECIDED WITH DEFERRALS | Supabase auth coexists with client-controlled headers and query identities; server-validated identity is required to prevent impersonation. | User/creator identity comes from Supabase session or JWT validated server-side. Query/header identities are never authority. | Final admin role model. | Trusting x-user-id, x-user-email, uid/email query, sellerUid body/query. | Security |
| AD-04 | DECIDED | Mutating endpoints have inconsistent guards in the endpoint ledger; each mutation needs explicit auth/authz/ownership. | Every mutating endpoint must declare auth, authorization, ownership and fail-closed behavior. | None. | Route-local implicit authorization. | Sprint readiness |
| AD-05 | DECIDED | Raffle, merchant and winner mutations show fragmented ownership checks; persisted ownership must become the decision source. | Ownership is checked server-side against persisted raffle, merchant, purchase or admin authority. | MP account replacement policy. | Client-provided owner identity. | Security |
| AD-06 | DECIDED | Supabase access is scattered across UI, routes and libs; concrete modules are needed for testable recovery without generic ceremony. | Use concrete query/write modules and application-owned writes; no mandatory generic repositories. | SQL/module names. | Scattered Supabase calls as permanent pattern. | Architecture Design |
| AD-07 | DECIDED | Recovery diffs require objects not proven by baseline migrations; reproducible DB state must come from versioned migrations, not backup. | DB baseline must be reproducible via versioned migrations; backup is evidence, not baseline. | Exact SQL. | Backup as authority; remote DB as undocumented source. | DB Recovery |
| AD-08 | DECIDED WITH DEFERRALS | Critical flows perform multi-step writes; operation-level guarantees are needed before implementation chooses SQL mechanisms. | Critical operations get guarantee-level designs using transaction/RPC, constraints, locks, conditional updates, idempotency or compensation as appropriate. | Per-operation SQL mechanism. | Multi-query critical writes without contracts. | Recovery |
| AD-09 | DECIDED | Confirm, webhook and reconcile can all affect payment/ticket state today; a single internal authority is necessary to avoid divergent sales. | ApplyPaymentEvidence is the single internal payment authority. MP is evidence source; webhook/reconcile/confirm are entrypoints. | None. | Webhook as domain authority; confirm and reconcile as independent writers. | R2/R3 |
| AD-10 | DECIDED | Mercado Pago events and retries can repeat in different ways; separated identities are needed to prevent repeated side effects. | Idempotency identities are separate: payment, event, command, email and winner. Use logical effectively-once transitions. | Exact provider event fallback. | One key for all replay classes; physical exactly-once promise. | R2/R3 |
| AD-11 | DECIDED WITH DEFERRALS | Mercado Pago calls are route-local across checkout, OAuth, webhook and reconciliation; a concrete port isolates provider behavior. | PaymentProviderPort covers preference, lookup, webhook verification and OAuth; token storage/cipher detail deferred. | Token encryption/storage detail. | Provider SDK calls in domain or many routes. | Payment/OAuth |
| AD-12 | DECIDED | Mail is currently invoked from multiple flows and the working tree adds audit/dedup; one notification boundary is needed without overpromising delivery. | Mail uses MailPort and NotificationService with best-effort delivery and durable deduplication when available. | Exact degradation policy. | Exactly-once email promise; route-local mail side effects. | R1 |
| AD-13 | DECIDED WITH DEFERRALS | Webhook and mail audit evidence can include sensitive material; logging must be minimized before recovery certification. | Payload logging moves after validation; mail content storage is minimized; retention period deferred. | Exact retention period. | Persisting raw invalid payloads or full email bodies by default. | Security |
| AD-14 | DECIDED WITH DEFERRALS | Working tree reconciliation includes fee defaults but no approved business policy; technical payment repair must not invent commercial fees. | Technical reconciliation does not apply Rifex fee; provider fee may be observed; commercial fee policy deferred. | Percentages, rounding, legal/business policy. | Defaults as commercial authority. | Fees Policy |
| AD-15 | DECIDED | Modern and legacy tables/routes coexist; a compatibility boundary is necessary to avoid silent domain contamination. | Legacy is frozen behind compatibility boundaries with explicit mappers and no silent aliases. | Removal timing. | Deleting legacy without evidence; new legacy writes/features. | Legacy |
| AD-16 | DECIDED | API, webhook, OAuth and UI errors use mixed shapes; stable contracts are needed for clients, retries and release audits. | Error contracts are defined by surface: JSON API, webhook, OAuth redirect and UI. | Final UI copy. | Mixed ad hoc errors forever. | Tests |
| AD-17 | DECIDED WITH DEFERRALS | The repository has no evidenced test suite beyond build script availability; recovery needs tests mapped to risk. | Test levels are defined: Vitest units, route contract tests, Supabase integration, provider fakes, concurrency, migrations, next build, selective Playwright. | Exact dependency versions. | No tests; Playwright-only; unit-only. | Sprint readiness |
| AD-18 | DECIDED | Recovery units have dependencies and prior build failure blocks baseline confidence; order must preserve auditability. | Recovery sequence is R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy -> Release Audits -> Separate Commits. | Sprint task sizing. | Starting with payment hardening before build/DB gates. | Design close |
| AD-19 | DECIDED | Next.js filesystem routing shows `/checkout` page/API conflict and checkout APIs coexist; R4 needs explicit route boundaries. | R4 route contract: /checkout is a page, /api/checkout is legacy API, /api/checkout/mp is candidate canonical API. | Caller migration decision. | Documenting /api/checkout/index as public route; deleting routes without evidence. | R4 |

## Consequences And Risks

| ID | Consequences | Dependencies | Risk Addressed | Residual Risk | Future Evidence |
|---|---|---|---|---|---|
| AD-01 | Future work has explicit boundaries without replacing the stack. | AD-02, AD-06 | Fragmented rule ownership. | OPEN UNTIL IMPLEMENTED/TESTED. | Service extraction diffs and tests. |
| AD-02 | DB recovery can normalize states without silent aliases. | AD-07, AD-15 | Contradictory states. | OPEN UNTIL MIGRATED/TESTED. | Migrations, mappers and state tests. |
| AD-03 | Mutations require server identity context. | AD-04, AD-05 | Impersonation. | OPEN UNTIL IMPLEMENTED/TESTED. | Route auth tests. |
| AD-04 | Endpoint mutation policy becomes auditable. | AD-03, AD-05 | Unauthorized mutation. | OPEN UNTIL IMPLEMENTED/TESTED. | Endpoint policy tests. |
| AD-05 | Horizontal access risk is reduced by design. | AD-03, AD-06 | Ownership bypass. | OPEN UNTIL IMPLEMENTED/TESTED. | Ownership fixtures. |
| AD-06 | Persistence contracts can be tested. | AD-07 | Contract drift. | OPEN UNTIL IMPLEMENTED/TESTED. | Module diffs. |
| AD-07 | Clean install becomes a gate. | AD-02, AD-06 | Partial DB reproducibility. | OPEN UNTIL IMPLEMENTED/TESTED. | Migration audit. |
| AD-08 | Partial writes and races become explicit design risks. | AD-06, AD-07 | Races and partial writes. | OPEN UNTIL IMPLEMENTED/TESTED. | Concurrency tests. |
| AD-09 | Payment transitions have one owner. | AD-10, AD-11 | Double sale/divergent state. | OPEN UNTIL IMPLEMENTED/TESTED. | Payment command tests. |
| AD-10 | Duplicate delivery can be reasoned about. | AD-07, AD-09 | Repeated side effects. | OPEN UNTIL IMPLEMENTED/TESTED. | Replay tests. |
| AD-11 | MP coupling is isolated. | AD-09, AD-10 | Provider coupling. | OPEN UNTIL IMPLEMENTED/TESTED. | Adapter fakes. |
| AD-12 | Duplicate/lost mail risks become visible. | AD-13 | Duplicate mail and PII. | OPEN UNTIL IMPLEMENTED/TESTED. | Resend fake tests. |
| AD-13 | Sensitive data risk is constrained by design. | AD-12 | PII exposure. | OPEN UNTIL IMPLEMENTED/TESTED. | Log redaction tests. |
| AD-14 | R3 can proceed technically without inventing fees. | AD-09 | Incorrect payout/communication. | DEFERRED. | Approved fee policy. |
| AD-15 | Recovery can proceed while preserving compatibility. | AD-02, AD-07 | Domain contamination. | OPEN UNTIL IMPLEMENTED. | Caller telemetry. |
| AD-16 | Callers can test stable codes. | AD-17 | Unsafe retries/client ambiguity. | OPEN UNTIL IMPLEMENTED/TESTED. | Route contract tests. |
| AD-17 | Recovery gates become certifiable. | All recovery units. | Uncertified recovery. | OPEN UNTIL IMPLEMENTED. | Test suite and CI artifacts. |
| AD-18 | Work order is auditable. | AD-07, AD-19 | Unsafe sequencing. | OPEN UNTIL EXECUTED. | Release audit results. |
| AD-19 | Build baseline has an explicit target. | AD-18 | Build failure. | OPEN UNTIL IMPLEMENTED/TESTED. | next build pass. |

## AD-14 Fees Detail

```text
TECHNICAL PAYMENT RECONCILIATION
!=
COMMERCIAL FEES POLICY
```

- Technical reconciliation does not invent or apply a Rifex fee.
- Provider fee can be observed as technical provider evidence.
- Plan is resolved server-side.
- Amounts use integer minor units.
- Percentages and rounding are DEFERRED.
- Current defaults are experimental implementation evidence only and are not authority.
- Emails must not show experimental fee calculations.
- Without an approved commercial policy, a Rifex fee cannot be applied.

## AD-16 Error Contract Detail

JSON API target shape:

```json
{
  "ok": false,
  "code": "stable_code",
  "message": "safe_message",
  "correlation_id": "id",
  "retryable": false,
  "details": {}
}
```

`details` is included only when safe.

| Category | Conceptual HTTP |
|---|---|
| validation | 400/422 |
| authentication | 401 |
| authorization | 403 |
| ownership | 403 |
| conflict | 409 |
| not_found | 404 |
| provider | 502/503 |
| rate_limited | 429 |
| retryable_infrastructure | 502/503 |
| internal | 500 |

| Surface | Contract |
|---|---|
| JSON API | Stable `ok`, `code`, `message`, `correlation_id`, `retryable` and safe `details`. |
| Webhook | Minimal response, invalid signature fail-closed, duplicates acknowledged without repeated side effects, internal details hidden. |
| OAuth redirects | Controlled redirects with stable code and no secrets in URL. |
| UI | Translates stable codes and does not interpret internal exceptions. |

These contracts are design targets and are not implemented by AD2.

## AD-19 R4 Route Table

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
