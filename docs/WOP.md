# Rifex WOP

WOP defines the working operating protocol for Rifex. Its purpose is to keep the repository as the source of truth and prevent future work from assuming a state that has not been evidenced.

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


## Next Eligible Stage

```text
SPRINT R4: CLOSED — GO
NEXT ELIGIBLE STAGE: DB RECOVERY CONTRACT
DB RECOVERY CONTRACT: NOT AUTHORIZED
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

Rifex has closed `ALIGNMENT`, `ARCHITECTURE AUDIT` and `ARCHITECTURE DESIGN`. Architecture Design AD3 is documented with `GO`, Architecture Design Closing Gate is `GO`, R4 Sprint Readiness is `GO`, and Sprint R4 (Build Baseline Recovery) is now `CLOSED - GO`: implemented, Release Audit confirmed GO, committed and pushed at HEAD `bbaf8a0` (`fix: restore checkout page build`). This does not certify production readiness, does not adopt the three preserved recovery/hardening diffs, does not implement DB/R1/R2/R3/Fees Policy, and does not authorize or open any further Sprint.

## Baseline Decision

```text
PROPOSED BASELINE DECISION: C
```

Decision C is the documentary baseline decision approved during Alignment A1 and carried forward through the A2 checkpoint. HEAD `1fc064a8517389873b7c8c57053cd7ed7f0440d2` is the current confirmed HEAD (`docs: close R4 and reconcile HEAD, execution audit, R2/R3 testimony`). `bbaf8a02d2ff3681186e8f84317ce1c7cdd064ee` (`fix: restore checkout page build`), the R4 implementation commit, is an ancestor of HEAD. Previous citations (`b46ef9d`, then `48013ce`, then `bbaf8a0`) each lagged the real HEAD because the commit that closed a gate did not bump its own self-citation; see `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md` for the first reconciliation (`STALE, NOT CORRUPTED`, no diverged history). The three pre-existing functional diffs are a candidate recovery/hardening line and are still not certified; they were not touched by R4. The PostgreSQL backup is sensitive evidence outside the Git baseline. R4 build-success is confirmed; functional/payment execution of the rest of this decision remains pending, and the working tree does not constitute a certified functional baseline.

| Layer | Status |
|---|---|
| HEAD `1fc064a` | CONFIRMED current HEAD (docs: close R4 and reconcile HEAD, execution audit, R2/R3 testimony) |
| R4 implementation commit `bbaf8a0` | CONFIRMED ancestor of HEAD (fix: restore checkout page build) |
| Working tree functional diffs | CONFIRMED candidate recovery/hardening line, UNVERIFIED |
| PostgreSQL backup | CONFIRMED sensitive evidence outside Git baseline |
| A2 documents | CONFIRMED documentation materialization |
| Architecture Audit documents | CONFIRMED documentation materialization |
| Architecture Design AD3 report | CONFIRMED documentation materialization |
| R4 Sprint packet | CLOSED - GO; implemented at `bbaf8a0`, `npm run build` passes |
| Recovery decision | B: split recovery into R4, DB, R1, R2, R3 Technical and Fees Policy |

## Recovery Sequence

```text
R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy -> Release Audits -> Separate Commits
```

This sequence is approved as a recovery plan, not as implementation. Recovery changes must not be implemented before Architecture Design and an explicitly authorized Sprint.

## Alignment Closing Criteria

Alignment may close when product identity, Git baseline, working tree ownership, current architecture, domain, database, security, known risks and recovery plan are documented with no unresolved integrity uncertainty.

Condition to open Architecture Design: Architecture Audit must be closed with `GO`, the current dirty working tree must remain explained, and the user must explicitly authorize Architecture Design.

## Known Working Tree

Pre-existing functional diffs:

- `src/lib/mailer.js`
- `src/pages/api/admin/reconcile-payments.js`
- `src/pages/api/checkout/webhook.js`

Sensitive artifact:

- `db_cluster-10-11-2025@05-41-59.backup.gz`

## Blockers And Limits

| Item | Classification |
|---|---|
| Functional verification | UNVERIFIED |
| DB remote state | UNKNOWN |
| Canonical ticket/purchase/payment states | CONTRADICTORY |
| Architecture Audit | CLOSED - GO |
| Architecture Design | CLOSED - GO |
| R4 Sprint Readiness | GO |
| Sprint R4 | CLOSED - GO |
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

A later stage can open only when the current gate is reported and the user authorizes the next stage. Sprint R4 was explicitly authorized, implemented, release-audited GO, committed and pushed. The next eligible stage (DB Recovery Contract) remains `NOT AUTHORIZED` until the user explicitly opens it.
## Resume Handover

| Item | Status |
|---|---|
| Recovery preservation | GO |
| Recovery branch | `recovery/rifex-hardening-preserved` |
| Recovery commit | `1c23702f401f8c501077ecfd265a213245e62a63` |
| Handover | `docs/handover/HANDOVER_RIFEX_CURRENT.md` |
| R4 | CLOSED - GO at HEAD `bbaf8a0` |
| Next eligible stage | DB Recovery Contract; NOT AUTHORIZED |

Recovery preservation keeps the hardening work recoverable without adopting it into `main`. R4 is closed. DB Recovery Contract is the next eligible stage, but it is not open until explicitly authorized. The documentation batch previously pending here (HEAD reconciliation, Execution Environment Audit, R2/R3 marketplace payment testimony) was committed and pushed as `1fc064a` (`docs: close R4 and reconcile HEAD, execution audit, R2/R3 testimony`) — see `docs/handover/HANDOVER_RIFEX_CURRENT.md`.
