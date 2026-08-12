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
| ARCHITECTURE DESIGN DOCUMENTATION READY | YES |
| ARCHITECTURE DESIGN | OPEN |
| SPRINT | NOT AUTHORIZED |

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

Rifex has closed `ALIGNMENT` and `ARCHITECTURE AUDIT`. Architecture Design AD2 is documented with `GO` and documentation ready `YES`. Architecture Design remains open; it does not certify production readiness, does not adopt working tree functional diffs, does not implement recovery units, and does not authorize Sprint.

## Baseline Decision

```text
PROPOSED BASELINE DECISION: C
```

Decision C is the documentary baseline decision approved during Alignment A1 and carried forward through the A2 checkpoint. HEAD `c3bef35bb7a80621fd55d34537be518f11494063` is the Architecture Design AD2 starting checkpoint. The three pre-existing functional diffs are a candidate recovery/hardening line and are still not certified. The PostgreSQL backup is sensitive evidence outside the Git baseline. Functional execution of this decision remains pending, and the working tree does not constitute a certified functional baseline.

| Layer | Status |
|---|---|
| HEAD `c3bef35` | CONFIRMED Architecture Design AD2 starting checkpoint |
| Working tree functional diffs | CONFIRMED candidate recovery/hardening line, UNVERIFIED |
| PostgreSQL backup | CONFIRMED sensitive evidence outside Git baseline |
| A2 documents | CONFIRMED documentation materialization |
| Architecture Audit documents | CONFIRMED documentation materialization |
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
| Architecture Design | OPEN for documentation only |
| Sprint | NOT AUTHORIZED |

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
- Do not stage, commit, or push during Architecture Design AD2.

## Stage Change Process

A later stage can open only when the current gate is reported and the user authorizes the next stage. Sprint cannot open during AD2 and remains `NOT AUTHORIZED`.
