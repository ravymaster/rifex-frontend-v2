# Rifex Current State

> **2026-08-24 notice:** the snapshot below (HEAD `1aa97cd`, branch `main`, R4-era) is historical and stale — it predates Rifex 2.0 (PROD certification), the DRAW automatic-draw scheduler, and the entire Events initiative (EVENT-1/2/3, done; EVENT-4, next). For the current state, read **`docs/WOP.md`, section "RIFEX CURRENT STATE (2026-08-24 — Santiago → Antofagasta notebook handoff)"** first — it is now the canonical status document. This file is preserved unedited below for historical continuity of the R4/DB-recovery narrative.
>
> **2026-08-25 addendum (final):** EVENT-4 (Staff + Scanner + Check-in) is **DONE and CERTIFIED — 100/100 manual acceptance by Rodrigo, on a real phone**: real camera, real QR read off a screen, `PASA` stayed visible with no automatic disappearance, the scanner only resumed when he tapped "Siguiente escaneo," second scan of the same QR correctly showed "NO PASA — YA UTILIZADA" with the real check-in hour. Full specification at `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md` (canonical). The first real-phone attempt found a genuine bug (an auto-reset timer let the camera silently re-scan and re-submit the same ticket, overwriting `PASA`) — fixed at commit `c32713e`, re-deployed, re-tested, confirmed. All `EVENT-4 TEST` fixture data has been deleted from `rifex-dev` (identified and removed by exact ID). The `rifex-dev` database password **still needs rotation** — deferred to a following session by explicit user decision; never reuse the credential exposed earlier on 2026-08-25. See `docs/WOP.md`, "EVENT-4 checkpoint" and "final manual acceptance", for full detail. NEXT is EVENT-5, not scoped, not authorized.
>
> **2026-08-26 addendum — EVENT-5 (Analytics + XLSX export) CERTIFIED:** organizer-only analytics dashboard + 5-sheet Excel export (`exceljs` 4.4.0). Two corrections applied before coding, both backed by real code citations: `approved_unfulfilled` orders are real money already charged by Mercado Pago (included in gross/commission totals, excluded only from "fulfilled"), and a `void` ticket can carry a non-null `used_at` (`void_event_ticket` never guards or clears it — surfaced as its own explicit category, never hidden). A real performance bug (repeated `Intl.DateTimeFormat` construction) was found and fixed, cutting max-load generation from ~29s to ~15s — confirmed to fit `maxDuration=300s` (Vercel's current default with Fluid Compute on every plan, verified against current docs, not assumed). A real controlled fixture was created directly in `rifex-dev` via real RPCs/endpoints; 24 real HTTP tests ran against the live `rifex-frontend-main` deployment. **Rodrigo manually accepted EVENT-5 functionally** (dashboard correct, XLSX downloaded from real DEV, opened correctly, figures matching). A separate independent visual audit of that downloaded file then found real layout defects (overlapping/clipped buyer name-email and staff email-role columns, unformatted CLP amounts, raw technical headers) — all fixed with real evidence (commit `0f9ab01`): widened columns + `wrapText` safety net, `numFmt: '"$"#,##0'` on money cells (values stay numeric), headers renamed to reader-facing labels, "Ingresadas" → "Ingresadas válidas". 31/31 automated tests PASS, `npm run build` PASS, EVENT-4 regression unaffected, and the fix was reconfirmed on a file re-downloaded from the redeployed live endpoint. See `docs/events/EVENT5_ANALYTICS_XLSX.md` and `docs/WOP.md`, "EVENT-5 checkpoint", for full detail. The `rifex-dev` fixture was not deleted. **EVENT-6 remains NOT AUTHORIZED.**
>
> **2026-08-26 addendum — EVENT-6 Fase 1 (autonomous security/regression audit of EVENT-1..5) DONE:** adversarial audit against real Vercel DEV and real `rifex-dev` — auth/IDOR matrix, RLS/grants/Security Advisor, invariants, real concurrency (10 simultaneous ticket issuances → exactly 3; 15 simultaneous check-ins on the same QR → exactly 1 pass), adversarial inputs, and regression. 30/31 real tests PASS (the one "failure" was a wrong test expectation, not a defect — a nonexistent event correctly returns 403, never 404, avoiding existence disclosure). Two real, low-risk Security Advisor findings fixed as defense-in-depth, neither exploitable when found (verified live before fixing): mutable `search_path` on 6 non-DEFINER RPCs, and a missing explicit `revoke insert/update/delete` on `events`/`event_ticket_types` (live-tested against a real published event's real ID — 0 rows were ever affected by the anonymous write attempt even before the fix). Zero application code changed — only an additive migration, `db/migrations/2026-08-26_event6_hardening_search_path_and_revoke.sql`. Full matrix and evidence: `docs/events/EVENT6_SECURITY_AUDIT.md`. Fixture created and fully deleted (verified 0 residual rows); the real EVENT-5 fixture was left untouched. **Verdict: GO for EVENT-1..5 as they stand in DEV — PROD promotion remains a business decision reserved for Rodrigo. EVENT-7 remains NOT AUTHORIZED.**
>
> **2026-08-26 addendum — EVENT-6 Fase 2 (audit of the 16 inherited Rifas/Auth WARN findings) DONE — CRITICAL finding fixed:** `create_tickets_for_raffle`, a legacy unversioned `SECURITY DEFINER` function with zero ownership check and `EXECUTE` granted to `PUBLIC`, let a completely anonymous request mint real tickets in any raffle — demonstrated live and fixed in `rifex-dev` (`revoke execute`, verified: post-fix the same attack returns `401`). **This function predates the DEV/PROD fork and is likely equally exploitable in PROD right now — flagged as urgent for Rodrigo, independent of any Events promotion decision**, since this session has no PROD access. Of the other 15 inherited WARN findings: 8 are genuine false positives (4 trigger functions, live-tested — PostgREST never exposes `RETURNS trigger` functions as RPC endpoints, `404` on every attempt), 6 fixed as defense-in-depth (5× mutable `search_path` on low-risk `SECURITY INVOKER` functions, 2× an unnecessary grant on functions where a live IDOR attempt was actually blocked by RLS itself, not exploitable), 1 left as a documented pending administrative Auth setting. Security Advisor: 22 → 16 → **1** (purely administrative). Zero `src/` files changed. A full PROD promotion package (commits, pending migrations, env var names, rollback plan, Rodrigo's manual actions) was prepared but **not executed** — see `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md`. **EVENT-7 remains NOT AUTHORIZED.**
>
> **2026-08-26 addendum — Rifex Trust canonical design DONE (documentation only):** a full transversal Trust system (onboarding, identity/age verification, creator/organization verification, per-initiative review, fraud prevention, administration, reports/suspension/appeal, reputation from real operations, post-transaction evidence, data protection, future country expansion) was designed across 12 documents in `docs/trust/`, plus a complete notebook→desktop handoff (`docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md`). Zero code, zero implementation. Grounded in real, dated legal research: Ley 19.628 (vigente) and Ley 21.719 (published 13-dec-2024, full force 1-dec-2026). **Most material finding**: Chilean raffles/public collections are legally games of chance/restricted activities, in principle authorized only to non-profit legal entities (Ley 10.262/1952) — Rifex's individual-creator model sits in a real, currently-tensioned legal gray zone, requires a Chilean lawyer, flagged as top priority in `docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md`. The critical `create_tickets_for_raffle` vulnerability from EVENT-6 Fase 2 remains unverified/unfixed in PROD — the handoff marks it explicitly as executable only from the Santiago desktop PC, with the exact safe procedure. See `docs/WOP.md` for the full summary. **EVENT-7 and Trust implementation (TRUST-1 onward) remain NOT AUTHORIZED.**
>
> **2026-08-26 addendum — TRUST-1 (onboarding universal) DONE in DEV, Rodrigo authorized the full sequence:** implemented `trust_onboarding` (new table, RLS default-deny total, no client access at all — stricter than `users_profile`), `src/lib/trustOnboardingPolicy.js`/`trustOnboardingGate.js`, `GET/POST /api/onboarding/trust/*`, `/registro/continuar`, and a server-side gate wired into 13 real sensitive endpoints across Rifas/Colectas/Eventos. 29 real tests pass, including an adversarial test proving the client can never smuggle `onboarding_completed_at` through the API. Migration `db/migrations/2026-08-26e_trust1_onboarding.sql` applied to `rifex-dev` and verified (RLS enabled, zero grants to anon/authenticated/PUBLIC). Live-tested against real `rifex-frontend-main` with two disposable `@example.com` fixtures (deleted after, zero residual rows): real `403 onboarding_incomplete` confirmed on `/api/rifas`, `/api/events`, `/api/colectas` while incomplete; resumable/idempotent completion confirmed; the `onboarding_completed_at`/`user_id` injection attempt confirmed ineffective. Security Advisor re-run: only the pre-existing administrative `auth_leaked_password_protection` WARN, no new finding. Regression clean (`test:event-analytics` 31/31, `test:scanner-controller` 4/4, `npm run build`) before and after the migration. Commit `6333044` pushed to `origin/develop`; `rifex-frontend-main` auto-deployed (`dpl_HNT2giXgFCAdwpSmqtLN2kgM4QSy`, ~2 min after the push, aliased to the develop branch). PROD and `main` untouched. **TRUST-2 onward remains design-only, not authorized.**
>
> **Separate, later 2026-08-25 addendum — PRE-LAUNCH-FIX-3, RESOLVED:** a real Supabase Security Advisor alert (`rls_disabled_in_public`, CRITICAL) for `public.raffle_date_extensions` — unrelated to Events, an omission from the original DRAW-1 migration — was found, demonstrated (an anonymous key could `INSERT` into it with zero error), and fixed in **both** `rifex-dev` and PROD (`wrdkdfuiwlujfxxijpao`) with a single versioned `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (`db/migrations/2026-08-25c_prelaunch_fix3_raffle_date_extensions_rls.sql`), identical to the already-certified `legal_declarations` pattern. PROD's Security Advisor now reports zero ERROR-level issues.
>
> **2026-08-26 — P0 UNRESOLVED, outside this repo's/agent's reach:** `rifex.pro` is down with `ERR_SSL_PROTOCOL_ERROR`. Root cause fully diagnosed: **the domain registration itself has expired at the registrar (Hostinger)** — confirmed via two independent public DNS resolvers showing live nameservers as `ns1/ns2.dns-expired.com` (not Vercel's), and a plain-HTTP fetch of the resolved IP returning Hostinger's own page titled "Your domain is expired." Vercel's project/domain assignment (`rifex-frontend-v2` ↔ `rifex.pro`) was always correct and needs no change. **No code, deploy, database, or Vercel-side fix applies** — this requires Rodrigo (or whoever holds the Hostinger account) to renew the domain registration directly with Hostinger. The live Vercel deployment itself, `rifex-dev`, and the PRE-LAUNCH-FIX-3 RLS correction are all confirmed unaffected. See `docs/WOP.md`, "P0 — rifex.pro domain expired", for full detail.

> **2026-08-27 addendum — TRUST-2 (identidad básica declarada: RUT chileno + edad 18+) DONE in DEV, autonomous mission, pre-authorized end-to-end:** extended the SAME `trust_onboarding` row TRUST-1 uses with `rut_normalized`/`rut_declared_at` (never a new table — inherits RLS default-deny total automatically); Chilean RUT modulo-11 check-digit validation + masking in `src/lib/trustIdentityPolicy.js`; superset gate `assertCreatorEligible` (`src/lib/trustIdentityGate.js`) replaced `assertOnboardingComplete` across the same 12 sensitive endpoints TRUST-1 protected — now also requires declared 18+ and, for Chile only, a format-valid declared RUT. `age_verified`/`identity_verified`/`phone_verified` are literal `false` from the API — no column exists, nothing in TRUST-2 can write them. A real bug was found adversarially in DEV (`upsertIdentityRut` used `.update()`, silently no-op when the user had no row yet — fixed to `.upsert()`) and a regression test added. Live-tested in `rifex-dev` with two rounds of disposable `@example.com` fixtures (deleted after, zero residual rows): isolated `403 identity_incomplete`/`age_requirement_not_met` confirmed, and — critically — a real `409 rut_conflict` confirmed against Postgres's actual unique index when a second account tried to declare an already-taken RUT. Security Advisor: no new finding. 36 new tests + full regression + build clean. Commit `5fa5bd4` pushed to `origin/develop`; `rifex-frontend-main` auto-deployed. A new Events backlog item was recorded (`docs/events/EVENTS_BACKLOG.md` — downloadable per-event promotional QR) as documentation only, not scoped, not part of EVENT-7. PROD and `main` untouched. **Human UI testing of TRUST-1/TRUST-2 is scheduled for this weekend with Rodrigo rested. TRUST-3 onward remains design-only, not authorized.**
>
> **2026-08-27 addendum — TRUST-3A (private document verification, manual review, persons only) DONE in DEV, autonomous mission, pre-authorized end-to-end:** new `trust_identity_verifications`/`trust_identity_documents`/`trust_identity_audit_log` (append-only, DB trigger rejects application UPDATE/DELETE) + a new private Storage bucket `trust-documents` (`public:false`, zero policies reference it — confirmed default-deny live against real anon/authenticated calls). Real defensive image pipeline with `sharp` (magic bytes, pixel/dimension limits, full re-encode, EXIF stripped, SHA-256 dedup). Review queue reuses the existing `resolveAdmin` primitive — no new role system invented. `identity_verified`/`age_verified` are now real `trust_onboarding` columns, writable only by an administrative approval requiring two explicit human confirmations (no OCR exists). Activation of mandatory identity verification for creators stays off (`isIdentityVerificationRequiredForCreators() === false`) — a pending business decision. Organizations explicitly excluded, reserved for TRUST-4. Two real bugs found adversarially and fixed same-session: `start.js` queried a nonexistent `trust_onboarding.country_code` column (silently rejecting every real person as an organization), and the audit-log immutability trigger blocked the legitimate cascade delete when removing any user with TRUST-3A history (fixed with a follow-up migration decoupling that FK). Live-tested in `rifex-dev` with four disposable `@example.com` fixtures and synthetic labeled-fake document images (deleted after, zero residual rows across all tables + `auth.users` + `storage.objects`): full happy path, correction/resubmit cycle, terminal rejection, concurrent double-decision correctly blocked, self-review blocked, direct anonymous/non-owner Storage access confirmed blocked against real Storage, adversarial file inputs all rejected correctly. Security Advisor: no new finding. 43 new tests + full regression (143/143) + build clean. Commit `f2f018b` pushed to `origin/develop`; `rifex-frontend-main` auto-deployed. **No automatic retention/purge job exists yet — documents remain in Storage indefinitely, a real acknowledged gap.** PROD and `main` untouched. **Human UI testing of TRUST-1/TRUST-2/TRUST-3A is scheduled for this weekend with Rodrigo rested. TRUST-3B/TRUST-4 onward remain design-only, not authorized.**
>
> **2026-08-27/28 addendum — corrección canónica hacia adelante: Mercado Pago como control principal, onboarding simplificado. DONE in DEV, autonomous overnight mission (Rodrigo asleep, system-permission-only, no manual testing requested).** No commits or migrations reverted — purely additive/corrective. `birth_date` eliminated entirely (confirmed 0 real rows before dropping) — replaced by a versioned boolean declaration (`adult_declared`, never `age_verified`). The `account_type` selector replaced by `person_name`/`organization_name` (exactly one filled, derived server-side, never trusted from the client) — `legal_name` dropped (also confirmed 0 real rows). Phone simplified to a Chile-specific 9-digit widget. Mercado Pago becomes the primary control that closes onboarding: `merchant_gateways` gained `mp_identity_match` + a real unique index preventing one Mercado Pago account from enabling two Rifex accounts; `assertCreatorEligible` now also requires, for Chile, a connected Mercado Pago account whose owner matches the declared RUT (or `unavailable`, which never blocks). Mercado Pago audit (`docs/trust/MP_IDENTITY_MATCH_AUDIT.md`): could not confirm empirically whether `GET /users/me` returns identification for Chile — official docs blocked every automated fetch, no Mercado Pago credentials configured in this environment — the match code was written defensively, never inventing a match. TRUST-3A remains an exceptional fallback, never the default flow. Live-tested in `rifex-dev` with two disposable `@example.com` fixtures (deleted after, zero residual rows): isolated `403 mp_not_connected`, simulated `matched`/`mismatch`/`unavailable`/`disconnected` states all produced correct gate behavior, the real Postgres unique constraint on `mp_user_id` fired correctly. Security Advisor: no new finding. 15 new tests + full regression (174/174) + build clean. Commit `0cc59dc` pushed to `origin/develop`; `rifex-frontend-main` auto-deployed. Also added: `/seguridad` public page (footer-linked), `docs/trust/META_ANTIFRAUD_STATEMENT.md`, a substantially expanded "Términos del Creador" (marked pending Chilean-lawyer review before PROD), and a recorded 2FA decision (optional for creators, should be mandatory for admins before production, not implemented). PROD and `main` untouched. **Real limitation: Mercado Pago's actual `/users/me` behavior for Chile was never confirmed live — needs real credentials to verify.**
>
> **2026-08-29 addendum — adversarial audit (read-only, no fixes applied):** found a real, demonstrated **CRITICAL fail-open** — `assertCreatorEligible` treats `mp_identity_match=NULL` (a reachable state: `oauth/callback.js` sets `status='connected'` before a separate, failure-swallowing call resolves the match) exactly like `'matched'`, while `getIdentityStatus` correctly reports not-eligible for the same data. Reproduced with an isolated local test, now permanent in `tests/trustIdentityGate.test.mjs`. Also found: the `unavailable` policy conflicts with this audit's requested behavior (should route to review, currently approves silently — a product decision pending Rodrigo, not a bug); the OAuth callback logs a PKCE secret + email in an edge case; a post-publish `mismatch` doesn't pause checkout; the 3 `upload-photo.js` endpoints aren't gated. Full detail in `docs/trust/TRUST_MP_ADVERSARIAL_AUDIT_2026-08.md`. Verdict: **GO CON CONDICIONES** — the critical finding should be fixed before real-account human testing. 175/175 tests pass. No code/migrations/DEV data changed.
>
> **2026-08-30 addendum — RIFEX FULL PROD RELEASE, all 4 stages executed, CODE AND SCHEMA NOW LIVE ON PROD:** the fail-open above was fixed (`2d86d3c`) before this promotion. `main`/PROD are no longer at `3f3d6c4` (EVENTS V1 baseline) — `origin/main` is now `5c15624`, deployed to Vercel PROD and aliased to `rifex.pro`. This promotes, in full and in their certified final state: Trust (TRUST-1/2/3A/3B, MP-identity-match, fail-closed throughout, TRUST-3A off by default), Country Gate + Payment Engine infra (Chile parity preserved via exact-fallback, Argentina `enabled: false` in every environment including PROD), the `assertCreatorEligible` gate wired into Rifas/Colectas/Events (Events changes strictly limited to the gate insertion, zero business-logic regression), and RIFEX Closure Pass (physical-prize transfer transparency, Temática removed from the UI, `/cumplimiento` roadmap page, footer link, updated Términos). PROD database migrations were reconciled against real PROD state (not assumed) — 2 of 11 release migrations were already effective from a prior out-of-band fix and were deliberately skipped rather than blindly reapplied; the other 9 applied with zero row loss. Full detail: `docs/releases/RIFEX_FULL_PROD_RELEASE_2026-08-30.md` and `docs/WOP.md`, "RIFEX FULL PROD RELEASE (2026-08-30)". **Rifex Cumplimiento is a public roadmap page only — no automatic backend engine exists.** No real payments, no Mercado Pago disconnects, and no PROD user Trust status were touched by this release process itself.

This document is the current documentation snapshot of observable repository state after Architecture Design AD4 documentation materialization.

## Repository

| Item | Value |
|---|---|
| Repository | `/home/desktop/rifex-frontend-v2` (Linux); historical Windows path `C:\proyectos\rifexv1.1\rifex-frontend-main` no longer current |
| Branch | `main` |
| HEAD | `1aa97cd43e63649d2d17255a42ee71600e631315` |
| HEAD message | fix: clear all credential fields on MP disconnect, not just half |
| R4 implementation commit | `bbaf8a02d2ff3681186e8f84317ce1c7cdd064ee` (fix: restore checkout page build), ancestor of HEAD |
| Upstream | `origin/main`, matches local HEAD |
| Functional certification | PARTIAL — Mercado Pago direct-collection checkout `CONFIRMED FUNCTIONAL` in production 2026-08-15 (real seller, real buyer, real webhook); other flows remain UNVERIFIED. See Implemented Flows below |

## Separated State Categories

### HEAD

HEAD `1aa97cd43e63649d2d17255a42ee71600e631315` (`fix: clear all credential fields on MP disconnect, not just half`) is the confirmed current checkpoint. In order preceding it: `7e8e6b7` (`fix: log Mercado Pago webhook events to webhook_events table`), `448c1ed`/`0287179` (orphaned checkout-return page cleanup), `4373375`/`7e96cda`/`af221e7`/`1fc064a` (documentation reconciliation), `bbaf8a0` (`fix: restore checkout page build`, the R4 implementation commit), the Architecture Design closing checkpoint (`19e2899`), and the prior resume-handover checkpoint (`48013ce`). See `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the full narrative including the production incident and its recovery, which happened in the working tree/live infrastructure and is not itself a commit.

### WORKING TREE FUNCTIONAL DIFFS — CORRECTED

This section previously claimed `src/lib/mailer.js`, `src/pages/api/admin/reconcile-payments.js` and `src/pages/api/checkout/webhook.js` were pre-existing uncommitted functional diffs. `git diff --stat` against HEAD for those three files is empty — they are ordinary committed files in `main`, not a working-tree diff. That claim was already stale before this session began; it is corrected here, not newly true. The three files remain additionally preserved, unmodified in that respect, on branch `recovery/rifex-hardening-preserved` (`1c23702f...`), which is a separate historical artifact, not the source of the confusion.

### SUPABASE PROJECT CHANGE AND PRODUCTION INCIDENT (2026-08-14/15)

The original production Supabase project (`huoepoxuqaodfgbtbalb`) was deleted by the user directly in Supabase, outside this repository. This was `CONFIRMED` mid-session: `huoepoxuqaodfgbtbalb.supabase.co` stopped resolving, and `rifex.pro/api/rifas` returned `{"ok":false,"error":"TypeError: fetch failed"}` — production was live and broken, since Vercel's environment variables still pointed at the deleted project.

A new Supabase project (`wrdkdfuiwlujfxxijpao`) had already been provisioned earlier the same session for local sandbox testing, using `db/restore/001_schema_supabase_clean.sql` (schema-only, extracted from the original project's `pg_dump` backup, with roles/grants/`auth`/`storage` schema definitions stripped — see that file's header for the full extraction methodology). Recovery consisted of: purging every sandbox/test row from that project (raffles, tickets, purchases, payments, `webhook_events`, `merchant_gateways`, and one test auth user), then updating Vercel's production `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` to point at it. Production was confirmed restored: `rifex.pro/api/rifas` returns `{"ok":true,"items":[]}`, genuinely empty, no legacy or sandbox data.

`CONFIRMED RISK, not yet resolved`: production and local development now share the same Supabase project. There is no dedicated sandbox project. This is convenient for the moment but means local testing can pollute production data (already happened once, corrected) and there is no isolated environment for future local iteration. Not fixed in this pass — flagged for the next Architecture Audit or Sprint to address.

`db/restore/001_schema_supabase_clean.sql` is untracked in git as of HEAD `1aa97cd` and should be committed — it is no longer a disposable sandbox artifact, it is the schema-provisioning record for the database currently backing production.

Mercado Pago production credentials in Vercel were checked and found unaffected by this incident (never pointed at anything but the real account); no changes were made to them.

### LOCAL PACKAGE MANAGER ARTIFACT

`package.json`/`package-lock.json` carry an undocumented diff adding `"allowScripts": {"sharp@0.34.3": true}`. `CONFIRMED EXPLAINED, NO IMPACT`: not present in any prior commit on any branch; produced by npm 11's native-postinstall-script approval gate when installing `sharp` for the first time on this machine. Full evidence in `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md`.

### DOCUMENTATION CHANGES

A2 created or updated baseline documentation. AA3 created Architecture Audit documentation and updated authoritative status documents.
AD2 materialized target Architecture Design documents. AD4 materializes the AD3 closing report and future R4 Sprint packet. These documents do not implement recovery units.

- `README.md`
- `docs/WOP.md`
- `docs/ENGINEERING_PROCESS.md`
- `docs/CURRENT_STATE.md`
- `docs/WHY.md`
- `docs/ROADMAP.md`
- `docs/architecture/ARCHITECTURE_CURRENT.md`
- `docs/domain/DOMAIN_MODEL.md`
- `docs/security/SECURITY_CURRENT.md`
- `docs/database/DATABASE_CURRENT.md`
- `docs/audits/ARCHITECTURE_AUDIT_REPORT.md`
- `docs/architecture/ENDPOINT_AUTHORITY_LEDGER.md`
- `docs/architecture/DATA_CONTRACT_LEDGER.md`
- `docs/architecture/ARCHITECTURE_DESIGN_INPUTS.md`
- `docs/audits/ARCHITECTURE_DESIGN_AD3_REPORT.md`
- `docs/sprints/R4_BUILD_BASELINE_SPRINT_PACKET.md`
- `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md`
- `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md`

### SENSITIVE UNTRACKED/IGNORED ARTIFACT

`db_cluster-10-11-2025@05-41-59.backup.gz` is a PostgreSQL gzip backup with schema and data evidence. It is sensitive evidence outside the Git baseline.

## Documentation State

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
| DB RECOVERY | DONE — informal, incident-driven, 2026-08-14/15 (see SUPABASE PROJECT CHANGE AND PRODUCTION INCIDENT above) |
| MERCADO PAGO DIRECT CHECKOUT | CONFIRMED FUNCTIONAL IN PRODUCTION (2026-08-15) |
| ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION | OPEN - AUTHORIZED (2026-08-15) |


## Next Eligible Stage

```text
SPRINT R4: CLOSED — GO
DB RECOVERY: DONE (informal, incident-driven)
NEXT ELIGIBLE STAGE: ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION
ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION: OPEN - AUTHORIZED
OTHER SPRINTS: NOT AUTHORIZED
```
## Recovery State

| Unit | Status |
|---|---|
| R4 Build Baseline | CLOSED - GO; implemented and pushed at `bbaf8a0`; `npm run build` passes, 25/25 pages, `/checkout` prerenders statically |
| DB Recovery | DONE — informal/incident-driven, not via packet; new Supabase project (`wrdkdfuiwlujfxxijpao`) provisioned from `db/restore/001_schema_supabase_clean.sql`, production repointed, confirmed empty and functional |
| Mercado Pago direct checkout | CONFIRMED FUNCTIONAL — real seller, real buyer, real webhook, in production, 2026-08-15 |
| `webhook_events` logging | FIXED (`7e8e6b7`), CONFIRMED with a real webhook |
| `mp/disconnect.js` field clearing | FIXED (`1aa97cd`), CONFIRMED against all 13 columns |
| Mercado Pago split payments (1:N) | NOT AVAILABLE; requires Mercado Pago commercial-team engagement, not a Sprint |
| R1 Mailer | DESIGNED; certification PARTIAL; implementation NOT AUTHORIZED |
| R2 Webhook | DESIGNED; certification PARTIAL; base receiving/logging now CONFIRMED functional in production; full R2 certification still NOT AUTHORIZED as a Sprint |
| R3 Technical Reconciliation | DESIGNED; certification PARTIAL; implementation NOT AUTHORIZED; known `since`-filter bug in `reconcile-payments.js` still unfixed |
| Fees Policy | SEPARATE; commercial policy UNKNOWN; direct-collection model works without it; split-payment model requires Mercado Pago commercial approval; subscription/plan-based alternative discussed but NOT IMPLEMENTED |

Approved recovery sequence (historical target, partially superseded by the informal DB recovery above):

```text
R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy -> Release Audits -> Separate Commits
```

Original build failure cause: CONFIRMED API handler located as `/checkout` page route, unrelated to the three recovery diffs. RESOLVED by R4 (`bbaf8a0`): `src/pages/checkout/index.js` is now a valid React page; the three recovery diffs and all checkout APIs were untouched.

## Implemented Flows

| Flow | Presence | Functional Verification |
|---|---|---|
| Authentication/registration | CONFIRMED | CONFIRMED — real account registered and confirmed in production 2026-08-15 |
| Raffles CRUD/listing | CONFIRMED | CONFIRMED — creation verified in production |
| Ticket selection/reservation | CONFIRMED | CONFIRMED — 3-minute hold with auto-release observed repeatedly |
| Mercado Pago checkout | CONFIRMED | CONFIRMED — direct-collection flow, real seller and buyer, production, 2026-08-15 |
| Confirmation/webhook | CONFIRMED | CONFIRMED — both the browser-return path and the real Mercado Pago webhook verified |
| Email notifications | CONFIRMED | CONFIRMED — `emailed_buyer`/`emailed_creator` observed `true` after a real approved payment |
| Creator panel | CONFIRMED | UNVERIFIED beyond basic listing/metrics observed in production |
| Seller MP OAuth | CONFIRMED | CONFIRMED in production only; sandbox testing of this flow is BLOCKED (no sandbox OAuth Client ID — see Critical Risks) |
| Mercado Pago split payments (marketplace_fee, 1:N) | CONFIRMED present in code (disabled) | CONFIRMED NOT IMPLEMENTED / NOT AVAILABLE; requires Mercado Pago commercial engagement |
| Admin reconciliation | CONFIRMED | UNVERIFIED; known `since`-filter bug, unfixed |
| Winner selection | CONFIRMED | UNVERIFIED |

## Security State

| Area | Status |
|---|---|
| Supabase auth | CONFIRMED present |
| Service role usage | CONFIRMED |
| Temporary identity headers | CONFIRMED risk |
| Admin token route | CONFIRMED |
| Webhook HMAC strictness | CONFIRMED in working tree only |
| Live/sandbox separation | CONFIRMED in working tree only |
| Security certification | NOT EVIDENCED |

## Database State

| Area | Status |
|---|---|
| Core tables | CONFIRMED present in the current project (`wrdkdfuiwlujfxxijpao`); schema applied from `db/restore/001_schema_supabase_clean.sql`, extracted from the original project's backup |
| Legacy tables (`rifas`/`rifa_tickets`, bridged via `raffles_compat`/`tickets_compat`) | CONFIRMED present in schema; not exercised by any test performed this session |
| `email_logs` | CONFIRMED in schema |
| `webhook_events` | CONFIRMED in schema, and CONFIRMED functional — a real Mercado Pago webhook was received and logged in production 2026-08-15, after fixing the missing insert (`7e8e6b7`) |
| `payments.live_mode` | CONFIRMED present in schema and CONFIRMED populated correctly by real webhook data |
| DB remote state | CONFIRMED — new project `wrdkdfuiwlujfxxijpao`, currently empty of legacy/historical data by design (see SUPABASE PROJECT CHANGE above), containing one real raffle from Production Validation testing (`372a033b-...`, titled "prueba real", created by a real test account `javieraburgos2025@gmail.com`) that has not been cleaned up |
| Canonical states | UNKNOWN whether still CONTRADICTORY — the contradictory-states finding was made against the now-deleted original project; the new project was restored from the same schema and presumably carries the same structure, but this has not been re-verified |

## Execution Environment Audit Findings

Full report: `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md`. Performed on a freshly cloned Linux copy of the repository; documentation only, no code modified, no Sprint opened.

| Finding | Status |
|---|---|
| `docs/dotenv.example` referenced by `.gitignore` and `scripts/run-dev.sh` but absent from repository | CONFIRMED; onboarding gap, `run-dev.sh` fails the copy silently (`\|\| true`) and starts `npm run dev` with no env configured |
| `.gitignore` has redundant/malformed `.env*` entries, including a stray non-functional `-e "\n.env*\n"` line | CONFIRMED; cosmetic, no functional impact |
| `scripts/kick.js` and `scripts/nop.js` are UTF-16LE/CRLF, unreferenced anywhere | CONFIRMED; dead artifacts, no functional impact |
| `/checkout` build/render failure | RECONFIRMED with fresh evidence on Linux; identical root cause already scoped by R4; not a Windows/Linux portability issue |
| No hardcoded Windows paths, `process.platform` checks, or source CRLF found under `src/` | CONFIRMED; no portability defect identified |

## R2/R3 Marketplace Payment Testimony

Full report: `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md`. A user testimony about a historical production payment failure (marketplace/OAuth seller flow) was compared against the three preserved recovery diffs. None of the three files address marketplace/`application_fee` transaction creation; a plausible (`INFERRED`, not `CONFIRMED`) root cause was found instead in already-merged `main` code (`src/pages/api/checkout/mp.js`, comment about `marketplace_fee` requiring Marketplace Partner certification). One concrete, `CONFIRMED` bug was found in `reconcile-payments.js`: a discarded `since` query filter referencing a nonexistent `payments.updated_at` column. Not fixed by this audit; input for a future R2/R3 Architecture Audit.

## Critical Risks

- Production and local development currently share the same Supabase project (`wrdkdfuiwlujfxxijpao`) — no dedicated sandbox exists. Already caused one accidental cross-contamination (test data appeared in production after DB recovery; cleaned up same session).
- The original production Supabase project was deleted outside this repository with no advance notice; the PostgreSQL backup file is now the only surviving evidence of its historical data, and it was not fully restored (schema only — no rows).
- One test raffle ("prueba real", `372a033b-...`, created by test account `javieraburgos2025@gmail.com`) remains in the current production database from Production Validation testing on 2026-08-15 — not cleaned up, low-severity but real.
- Mercado Pago OAuth-connected-seller flow cannot be tested in sandbox as currently configured (no sandbox Client ID for OAuth) — only verified working in real production. Any future change to this flow can only be verified live, with real accounts and real (small) money.
- Mercado Pago split payments (marketplace_fee, 1:N) require direct commercial engagement with Mercado Pago, not a code path; monetization design (subscription/plan vs. split fee) remains an open business decision.
- Sensitive PostgreSQL backup present in repository directory, corresponding to a now-deleted project.
- Authorization relies on temporary headers in some routes.
- Working tree requires DB objects not consolidated in baseline docs.
- Payment authority, idempotency, mail, legacy, PII retention, fees and winner eligibility remain open or deferred until implementation/testing or explicit policy.

## Next Gates

| Gate | Status |
|---|---|
| Alignment closing gate | GO |
| Architecture Audit closing gate | GO |
| Architecture Audit documentation ready | YES |
| Architecture Design | CLOSED - GO |
| R4 Sprint Readiness | GO |
| Sprint R4 | CLOSED - GO |
| DB Recovery | DONE — informal, incident-driven, 2026-08-14/15 |
| Mercado Pago direct checkout | CONFIRMED FUNCTIONAL in production |
| Architecture Audit — Frontend/Logic Separation | OPEN - AUTHORIZED (2026-08-15) |
| Sprint | R4 closed; others not yet open / not authorized |
## Resume Handover

| Item | Status |
|---|---|
| Main working tree | At HEAD `1aa97cd43e63649d2d17255a42ee71600e631315`; clean except the local-only `allowScripts` artifact and `db/restore/001_schema_supabase_clean.sql` (untracked, should be committed) |
| Recovery branch | `recovery/rifex-hardening-preserved` |
| Recovery commit | `1c23702f401f8c501077ecfd265a213245e62a63` |
| Recovery status | PRESERVED — UNVERIFIED — NOT ADOPTED; moot for `mailer.js`/`reconcile-payments.js`/`webhook.js` specifically, since those three files are already in `main` regardless (see WORKING TREE FUNCTIONAL DIFFS — CORRECTED above) |
| Recovery relation to main | outside `main`; no merge performed |
| R4 | CLOSED - GO; commit `bbaf8a0`, ancestor of HEAD |
| DB Recovery | DONE — informal, incident-driven; see SUPABASE PROJECT CHANGE AND PRODUCTION INCIDENT above |
| Production Validation | CONFIRMED 2026-08-15 — real Mercado Pago checkout end-to-end in production |
| Next eligible / open stage | Architecture Audit — Frontend/Logic Separation; OPEN - AUTHORIZED |
| Handover | `docs/handover/HANDOVER_RIFEX_CURRENT.md` |

`package.json`/`package-lock.json` still carry the local-only `allowScripts` artifact (see `LOCAL PACKAGE MANAGER ARTIFACT` above) and remain not intended to be committed. `db/restore/001_schema_supabase_clean.sql` should be committed — it now documents the schema of the live production database, not just a sandbox convenience.

The preserved recovery branch contains `src/lib/mailer.js`, `src/pages/api/admin/reconcile-payments.js` and `src/pages/api/checkout/webhook.js` — already present in `main` regardless of that branch's status; do not merge the branch itself without explicit authorization and selective R1/R2/R3 certification, since the branch may carry other differences beyond those three files that were not audited this session.
