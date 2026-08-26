# Rifex Current State

> **2026-08-24 notice:** the snapshot below (HEAD `1aa97cd`, branch `main`, R4-era) is historical and stale — it predates Rifex 2.0 (PROD certification), the DRAW automatic-draw scheduler, and the entire Events initiative (EVENT-1/2/3, done; EVENT-4, next). For the current state, read **`docs/WOP.md`, section "RIFEX CURRENT STATE (2026-08-24 — Santiago → Antofagasta notebook handoff)"** first — it is now the canonical status document. This file is preserved unedited below for historical continuity of the R4/DB-recovery narrative.
>
> **2026-08-25 addendum (final):** EVENT-4 (Staff + Scanner + Check-in) is **DONE and CERTIFIED — 100/100 manual acceptance by Rodrigo, on a real phone**: real camera, real QR read off a screen, `PASA` stayed visible with no automatic disappearance, the scanner only resumed when he tapped "Siguiente escaneo," second scan of the same QR correctly showed "NO PASA — YA UTILIZADA" with the real check-in hour. Full specification at `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md` (canonical). The first real-phone attempt found a genuine bug (an auto-reset timer let the camera silently re-scan and re-submit the same ticket, overwriting `PASA`) — fixed at commit `c32713e`, re-deployed, re-tested, confirmed. All `EVENT-4 TEST` fixture data has been deleted from `rifex-dev` (identified and removed by exact ID). The `rifex-dev` database password **still needs rotation** — deferred to a following session by explicit user decision; never reuse the credential exposed earlier on 2026-08-25. See `docs/WOP.md`, "EVENT-4 checkpoint" and "final manual acceptance", for full detail. NEXT is EVENT-5, not scoped, not authorized.
>
> **Separate, later 2026-08-25 addendum — PRE-LAUNCH-FIX-3, RESOLVED:** a real Supabase Security Advisor alert (`rls_disabled_in_public`, CRITICAL) for `public.raffle_date_extensions` — unrelated to Events, an omission from the original DRAW-1 migration — was found, demonstrated (an anonymous key could `INSERT` into it with zero error), and fixed in **both** `rifex-dev` and PROD (`wrdkdfuiwlujfxxijpao`) with a single versioned `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (`db/migrations/2026-08-25c_prelaunch_fix3_raffle_date_extensions_rls.sql`), identical to the already-certified `legal_declarations` pattern. PROD's Security Advisor now reports zero ERROR-level issues.
>
> **2026-08-26 — P0 UNRESOLVED, outside this repo's/agent's reach:** `rifex.pro` is down with `ERR_SSL_PROTOCOL_ERROR`. Root cause fully diagnosed: **the domain registration itself has expired at the registrar (Hostinger)** — confirmed via two independent public DNS resolvers showing live nameservers as `ns1/ns2.dns-expired.com` (not Vercel's), and a plain-HTTP fetch of the resolved IP returning Hostinger's own page titled "Your domain is expired." Vercel's project/domain assignment (`rifex-frontend-v2` ↔ `rifex.pro`) was always correct and needs no change. **No code, deploy, database, or Vercel-side fix applies** — this requires Rodrigo (or whoever holds the Hostinger account) to renew the domain registration directly with Hostinger. The live Vercel deployment itself, `rifex-dev`, and the PRE-LAUNCH-FIX-3 RLS correction are all confirmed unaffected. See `docs/WOP.md`, "P0 — rifex.pro domain expired", for full detail.

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
