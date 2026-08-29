# Rifex WOP

WOP defines the working operating protocol for Rifex. Its purpose is to keep the repository as the source of truth and prevent future work from assuming a state that has not been evidenced.

## RIFEX CURRENT STATE (2026-08-29 — EVENTS V1 PROD RELEASE)

This section supersedes everything below it for anything about current PROD state, Events status, or the branch/HEAD picture. Older content is preserved unedited as historical record.

**Git baseline**: `origin/main` = `3e871f8`, deployed and aliased to `rifex.pro`. `origin/develop` remains ahead (includes TRUST-1/2/3A, not promoted). `release/events-v1` is the branch used to build this release (9 commits cherry-picked from `develop` onto `origin/main`, avoiding the TRUST-1 retrofit that landed on those same Events files after they were built).

**PROD Events status:**

| Piece | Status |
|---|---|
| EVENT-1 (events, event_ticket_types) | PROD |
| EVENT-2 (checkout, orders) | PROD |
| EVENT-3 (tickets, QR) | PROD |
| EVENT-4 (staff, scanner, check-in) | PROD |
| EVENT-5 (analytics, XLSX) | PROD |
| EVENT-6 Fase 1 (Events-specific hardening: search_path + revoke on events/event_ticket_types) | PROD |
| EVENT-6 Fase 2 (Rifas-domain hardening, unrelated to Events) | Partially applied — `create_tickets_for_raffle` fixed surgically in PROD; the other two Rifas migrations remain on `develop` only, out of scope for this release |
| EVENT-7 | NOT AUTHORIZED |

**Migrations applied to PROD** (in order): `2026-08-23c_event1_foundation`, `2026-08-24_event2_checkout_orders`, `2026-08-25_event3_tickets_qr`, `2026-08-25b_event4_staff_scanner_checkin`, `2026-08-26_event6_hardening_search_path_and_revoke`. Schema verified live: 7 tables + 6 core RPCs, RLS enabled on all 7, correct grants (service_role only on the RPCs, SELECT-only for anon/authenticated on events/event_ticket_types).

**Deployment**: Vercel `rifex-frontend-v2`, deployment `dpl_4g6U5pESx7XFZH1bFqLjjMcNzAUr`, target `production`, aliased `rifex.pro`. No new env vars required — Events reuses existing Supabase/MP/Resend credentials already present in PROD.

**Real PROD verification performed**: a throwaway QA account created → real event created via the live API → ticket type created → published → verified on the public listing, public detail page, and organizer panel — all via `rifex.pro`, not a DB backdoor. Checkout gate tested live: correctly returned `organizer_not_connected` (the QA account has no Mercado Pago connected), proving the pre-payment safety gate works. All QA fixtures (event, ticket type, profile, auth user) deleted after verification — confirmed zero residual data, zero orders/tickets/staff/checkins ever existed for them.

**Financial certification status: PENDING — NON-BLOCKING.** No real Mercado Pago payment has been exercised against PROD Events yet (no organizer with MP connected was used for the smoke, deliberately — this session does not have and will not create real MP credentials). The checkout → Preference → webhook → ticket → QR → check-in → analytics → XLSX circuit is certified with real evidence from DEV (EVENT-2/3/4/5/6 test batteries, including live concurrency tests: 10 simultaneous issuances → exactly 3, 15 simultaneous check-ins → exactly 1 pass) but has not been re-run against PROD with real money. This is accepted as a follow-up item, not a blocker for the release.

**Trust status: DEV ONLY / NOT CERTIFIED PROD.** TRUST-1/2/3A and the Mercado Pago identity-match onboarding correction exist only on `origin/develop`. Confirmed absent from PROD by construction (the cherry-pick set predates TRUST-1's retrofit of the Events files) and by live smoke (`/trust/verificar` and `/registro/continuar` both return 404 on `rifex.pro`).

**Known limitations (not blockers)**: automatic Mercado Pago refunds are not implemented (same accepted V1 limitation as Rifas/Colectas); XLSX export performance at the extreme stress case (20k rows × 3 sheets + 500) exceeds a 20s test threshold in this environment, unconfirmed against the real Vercel PROD plan — not expected to matter at realistic event sizes; the two Rifas-domain EVENT-6 Fase 2 migrations remain unapplied to PROD, tracked separately.

## Current Documentary State

| Gate | Status |
|---|---|
| PRE-ALIGNMENT AUDIT | GO |
| ALIGNMENT A1 | GO |
| ALIGNMENT A2 | GO |
| CHECKPOINT A2 | GO |
| ALIGNMENT A3 | GO |
| ALIGNMENT A4 | GO |
| ALIGNMENT A5 | GO |
| ALIGNMENT | CLOSED - GO |
| ARCHITECTURE AUDIT AA1 | GO |
| ARCHITECTURE AUDIT AA2 | GO |
| ARCHITECTURE AUDIT AA3 | GO |
| ARCHITECTURE AUDIT DOCUMENTATION READY | YES |
| ARCHITECTURE AUDIT | CLOSED - GO |
| ARCHITECTURE DESIGN AD1 | GO |
| ARCHITECTURE DESIGN AD1 ADVERSARIAL REVIEW | GO |
| ARCHITECTURE DESIGN AD1 CORRECTION | GO |
| ARCHITECTURE DESIGN AD2 | GO |
| ARCHITECTURE DESIGN AD3 | GO |
| ARCHITECTURE DESIGN CLOSING GATE | GO |
| ARCHITECTURE DESIGN DOCUMENTATION READY | YES |
| ARCHITECTURE DESIGN | CLOSED - GO |
| R4 SPRINT READINESS | GO |
| SPRINT R4 | CLOSED - GO |
| SPRINT | R4 CLOSED; OTHER SPRINTS NOT YET OPEN / NOT AUTHORIZED |
| DB RECOVERY | DONE — 2026-08-14/15, informal/incident-driven, not via a Sprint packet (see Current Stage below) |
| MERCADO PAGO DIRECT CHECKOUT | CONFIRMED FUNCTIONAL IN PRODUCTION |
| ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION | OPEN - AUTHORIZED (2026-08-15) |


## Next Eligible Stage

```text
SPRINT R4: CLOSED — GO
DB RECOVERY: DONE (informal, incident-driven)
NEXT ELIGIBLE STAGE: ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION
ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION: OPEN - AUTHORIZED
OTHER SPRINTS: NOT AUTHORIZED
```
## Official Project States

| State | Meaning |
|---|---|
| BEGIN | New project initialization |
| ALIGNMENT | Reconstruction of an existing project before changing behavior |
| ARCHITECTURE AUDIT | Analysis of real architecture; no implementation |
| ARCHITECTURE DESIGN | Future architecture design; no implementation |
| SPRINT | Authorized implementation cycle |
| RELEASE AUDIT | Verification before commit/push |
| PAUSED | Work intentionally stopped |
| PRODUCTION | Production operation state |
| MAINTENANCE | Controlled maintenance |
| LEGACY | Legacy state or component |

## Current Stage

Rifex has closed `ALIGNMENT`, `ARCHITECTURE AUDIT` and `ARCHITECTURE DESIGN`. Architecture Design AD3 is documented with `GO`, Architecture Design Closing Gate is `GO`, R4 Sprint Readiness is `GO`, and Sprint R4 (Build Baseline Recovery) is `CLOSED - GO`: implemented, Release Audit confirmed GO, committed and pushed at HEAD `bbaf8a0` (`fix: restore checkout page build`).

**DB Recovery — done, but not through the formal Sprint packet process.** On 2026-08-14/15, the user disclosed that the original production Supabase project (`huoepoxuqaodfgbtbalb`) had been deleted directly in Supabase (not through this repository). This was discovered mid-session, confirmed live (`rifex.pro/api/rifas` returning `TypeError: fetch failed`), and constituted an active production incident, not a planned Sprint. Recovery was executed through direct, explicitly authorized, turn-by-turn user instruction rather than a pre-written packet: Vercel's production `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` were repointed to a new Supabase project (`wrdkdfuiwlujfxxijpao`, already provisioned earlier the same session for local sandbox testing via `db/restore/001_schema_supabase_clean.sql`), all sandbox/test rows were purged from it first, and production was confirmed restored to a genuinely empty, functional state. This is recorded as `DONE`, not as a closed Sprint — the WOP's Git Rules and Stage Change Process were not fully followed (no packet, no isolated Sprint commit boundary) because incident response took priority over ceremony. See `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the full evidence trail.

Two code fixes were also implemented and pushed the same session, each independently verified against real data before commit: `webhook_events` was never written to despite the table, its unique index and its `event_id` builder already existing (`7e8e6b7`); `mp/disconnect.js` only cleared 8 of 13 credential columns, leaving a live `mp_refresh_token` behind after "disconnecting" (`1aa97cd`). Both were found live, not from static review.

**Production Validation, 2026-08-15.** After DB recovery, a real end-to-end purchase was completed on `rifex.pro`: a newly registered real Rifex account created a real raffle, the user's own real Mercado Pago account was connected as the seller via OAuth (no environment mismatch — this only reproduces cleanly in real production, not in sandbox, see Critical Risks), and a different real Mercado Pago account completed payment. Ticket sold, purchase approved, payment recorded, a real Mercado Pago webhook was received and logged, buyer/creator emails sent. This is the first `CONFIRMED FUNCTIONAL` evidence for the Mercado Pago checkout flow in this repository's documented history.

This does not certify every flow, does not adopt the three preserved recovery/hardening diffs (which, correction: are already part of `main` at HEAD — see Baseline Decision below), does not implement Mercado Pago split payments (requires direct engagement with Mercado Pago's commercial team, not a code or certification path — see `docs/handover/HANDOVER_RIFEX_CURRENT.md`), and does not by itself authorize the newly opened Architecture Audit beyond its stated scope (frontend/logic separation, in preparation for a UI/UX redesign — explicitly authorized by the user on 2026-08-15).

## Baseline Decision

```text
PROPOSED BASELINE DECISION: C
```

Decision C is the documentary baseline decision approved during Alignment A1 and carried forward through the A2 checkpoint. HEAD `1aa97cd43e63649d2d17255a42ee71600e631315` is the current confirmed HEAD (`fix: clear all credential fields on MP disconnect, not just half`). `bbaf8a02d2ff3681186e8f84317ce1c7cdd064ee` (`fix: restore checkout page build`), the R4 implementation commit, is an ancestor of HEAD. Previous citations (`b46ef9d`, `48013ce`, `bbaf8a0`, `1fc064a`) each lagged the real HEAD because the commit that closed a gate did not bump its own self-citation — a recurring pattern in this repository; see `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md` for the first reconciliation (`STALE, NOT CORRUPTED`, no diverged history). Correction to a separate stale claim: `mailer.js`, `reconcile-payments.js` and `webhook.js` are **not** an outstanding working-tree diff — `git diff --stat` against HEAD for those three files is empty; they are ordinary committed files in `main`. That claim was already stale before this session began. The PostgreSQL backup corresponds to the original Supabase project, which has since been deleted (see Current Stage) — it is now the only surviving evidence of that project's data, and remains sensitive evidence outside the Git baseline. R4 build-success is confirmed; beyond that, the Mercado Pago checkout flow is now `CONFIRMED FUNCTIONAL` in production (see Current Stage, Production Validation) — a materially stronger claim than "build-success only," scoped specifically to that flow.

| Layer | Status |
|---|---|
| HEAD `1aa97cd` | CONFIRMED current HEAD (fix: clear all credential fields on MP disconnect, not just half) |
| R4 implementation commit `bbaf8a0` | CONFIRMED ancestor of HEAD (fix: restore checkout page build) |
| `webhook_events` fix `7e8e6b7` | CONFIRMED; verified live with a real Mercado Pago webhook in production |
| `mp/disconnect.js` fix `1aa97cd` | CONFIRMED; verified by seeding all 13 credential columns and confirming full clear |
| Supabase project | CONFIRMED changed: original (`huoepoxuqaodfgbtbalb`) deleted by the user outside this repo; current baseline is `wrdkdfuiwlujfxxijpao`, used by **both** production and local dev — architecture gap, not target state |
| PostgreSQL backup | CONFIRMED sensitive evidence outside Git baseline; corresponds to the deleted project, not the current one |
| A2 documents | CONFIRMED documentation materialization |
| Architecture Audit documents | CONFIRMED documentation materialization |
| Architecture Design AD3 report | CONFIRMED documentation materialization |
| R4 Sprint packet | CLOSED - GO; implemented at `bbaf8a0`, `npm run build` passes |
| Production Validation | CONFIRMED 2026-08-15; real seller, real buyer, real webhook — see Current Stage |
| Recovery decision | B: split recovery into R4, DB, R1, R2, R3 Technical and Fees Policy; DB unit executed informally (incident-driven), R1/R2/R3/Fees Policy still not authorized |

## Recovery Sequence

```text
R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy -> Release Audits -> Separate Commits
```

This sequence is approved as a recovery plan, not as implementation. Recovery changes must not be implemented before Architecture Design and an explicitly authorized Sprint.

## Alignment Closing Criteria

Alignment may close when product identity, Git baseline, working tree ownership, current architecture, domain, database, security, known risks and recovery plan are documented with no unresolved integrity uncertainty.

Condition to open Architecture Design: Architecture Audit must be closed with `GO`, the current dirty working tree must remain explained, and the user must explicitly authorize Architecture Design.

## Known Working Tree

`src/lib/mailer.js`, `src/pages/api/admin/reconcile-payments.js` and `src/pages/api/checkout/webhook.js` were previously described here as "pre-existing functional diffs." Correction: they are ordinary committed files in `main` at HEAD, with no working-tree diff (`git diff --stat` against HEAD is empty). That description was already stale before this session began.

Sensitive artifact:

- `db_cluster-10-11-2025@05-41-59.backup.gz` — corresponds to the original Supabase project (`huoepoxuqaodfgbtbalb`), deleted 2026-08-14/15. It is now the only surviving evidence of that project's data. Still outside the Git baseline; do not inspect, move or delete without a specific mission.

New untracked artifact:

- `db/restore/001_schema_supabase_clean.sql` — the schema-provisioning script actually used to build the current Supabase project (`wrdkdfuiwlujfxxijpao`), now serving both production and local dev. Untracked as of HEAD `1aa97cd`; should be committed, since it is no longer just a sandbox artifact.

## Blockers And Limits

| Item | Classification |
|---|---|
| Functional verification | PARTIAL — Mercado Pago direct-collection checkout CONFIRMED FUNCTIONAL in production (2026-08-15); other flows remain UNVERIFIED |
| DB remote state | CONFIRMED (new project `wrdkdfuiwlujfxxijpao`, schema applied, empty of legacy data, currently serving both production and local dev) |
| Canonical ticket/purchase/payment states | CONTRADICTORY claim inherited from prior audits of the now-deleted original project; not re-verified against the new project's data model, which was restored from the same schema and is presumed to carry the same contradiction until checked |
| Mercado Pago split payments (1:N) | NOT AVAILABLE; requires direct engagement with Mercado Pago's commercial team, not a code change or self-service certification |
| Sandbox testing of Mercado Pago OAuth-connected-seller flow | BLOCKED as currently configured — the app has no sandbox-specific OAuth Client ID/Secret, so any OAuth-connected token comes back tied to the production Client ID (`APP_USR-` prefix, not `TEST-`), causing an environment mismatch when paired with a sandbox buyer. Only verified working in real production |
| Architecture Audit | CLOSED - GO |
| Architecture Design | CLOSED - GO |
| R4 Sprint Readiness | GO |
| Sprint R4 | CLOSED - GO |
| DB Recovery | DONE — informal, incident-driven, 2026-08-14/15 |
| Architecture Audit — Frontend/Logic Separation | OPEN - AUTHORIZED (2026-08-15) |
| Sprint | R4 CLOSED; OTHERS NOT YET OPEN / NOT AUTHORIZED |

## Rules For AI Agents

- Use the repository as source of truth.
- Distinguish facts, inferences, and proposals.
- Use `CONFIRMED`, `INFERRED`, `PROPOSED`, `UNKNOWN`, `UNVERIFIED`, `NOT IMPLEMENTED`, `NOT EVIDENCED`, `CONTRADICTORY`, and `BLOCKED`.
- Do not present code presence as functional verification.
- Do not mix HEAD with working tree diffs.
- Do not treat the backup as Git baseline.
- Do not expose secrets, personal data, or backup rows.
- Preserve user and previous-agent work unless explicitly authorized.

## Gate Values

| Gate | Meaning |
|---|---|
| GO | Evidence satisfies the stated gate |
| PARTIAL | Most work is complete but documented gaps remain |
| NO GO | Integrity, scope, or evidence failed |

## Git Rules

- No Sprint is complete without Release Audit.
- Closed work requires commit, push, HEAD verified, and clean working tree.
- Dirty working trees must be explained by category.
- Do not use destructive Git commands without explicit authorization.
- Do not stage, commit, or push during Architecture Design documentation materialization unless explicitly authorized.

## Stage Change Process

A later stage can open only when the current gate is reported and the user authorizes the next stage. Sprint R4 was explicitly authorized, implemented, release-audited GO, committed and pushed. DB Recovery was subsequently executed informally — not through this process — in direct response to a production incident (see Current Stage); it is `DONE`, not `CLOSED - GO` in the packet sense, and that distinction is preserved deliberately rather than retrofitted. The user has since explicitly authorized the next formal stage: `ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION` (2026-08-15), scoped to mapping business logic vs. presentation ahead of a UI/UX redesign — no redesign implementation is authorized yet.

## Resume Handover

| Item | Status |
|---|---|
| Recovery preservation | GO |
| Recovery branch | `recovery/rifex-hardening-preserved` |
| Recovery commit | `1c23702f401f8c501077ecfd265a213245e62a63` |
| Handover | `docs/handover/HANDOVER_RIFEX_CURRENT.md` |
| R4 | CLOSED - GO at ancestor `bbaf8a0` |
| DB Recovery | DONE (informal, incident-driven, 2026-08-14/15) |
| Production Validation | CONFIRMED 2026-08-15 — see Current Stage |
| Next eligible / open stage | Architecture Audit — Frontend/Logic Separation; OPEN - AUTHORIZED |

Recovery preservation keeps the R1/R2/R3 hardening work on its own branch, recoverable without adopting it into `main` — that decision is unaffected by today's events, since the branch's three files are already present in `main` at HEAD regardless (see Baseline Decision correction). DB Recovery is done, but through incident response rather than the packet process; R1/R2/R3/Fees Policy remain `NOT AUTHORIZED`. The currently open stage is the Architecture Audit into frontend/logic separation, authorized 2026-08-15, in preparation for — but not itself authorizing — a UI/UX redesign. See `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the full narrative.
