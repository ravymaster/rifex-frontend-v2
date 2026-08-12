# Rifex WOP

WOP defines the working operating protocol for Rifex. Its purpose is to keep the repository as the source of truth and prevent future work from assuming a state that has not been evidenced.

## Current Documentary State

| Gate | Status |
|---|---|
| PRE-ALIGNMENT AUDIT | GO |
| ALIGNMENT A1 | GO |
| ALIGNMENT A2 | GO |
| ARCHITECTURE AUDIT | NOT OPEN |
| ARCHITECTURE DESIGN | NOT OPEN |
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

Rifex is in `ALIGNMENT`. A2 materializes baseline documentation only. It does not certify production readiness, does not adopt working tree functional diffs, and does not authorize Sprint.

## Baseline Decision

```text
PROPOSED BASELINE DECISION: C
```

Decision C is the documentary baseline decision approved during Alignment A1. HEAD `6acb929` is the historical reproducible checkpoint. The three pre-existing functional diffs are a candidate recovery/hardening line and are still not certified. The PostgreSQL backup is sensitive evidence outside the Git baseline. Functional execution of this decision remains pending, and the working tree does not constitute a certified functional baseline.

| Layer | Status |
|---|---|
| HEAD `6acb929` | CONFIRMED historical reproducible checkpoint |
| Working tree functional diffs | CONFIRMED candidate recovery/hardening line, UNVERIFIED |
| PostgreSQL backup | CONFIRMED sensitive evidence outside Git baseline |
| A2 documents | CONFIRMED documentation materialization |

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
| Architecture Audit | NOT OPEN |
| Architecture Design | NOT OPEN |
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
- Do not stage, commit, or push during Alignment A2.

## Stage Change Process

A later stage can open only when the current gate is reported and the user authorizes the next stage. Sprint cannot open before Architecture Audit and Architecture Design.
