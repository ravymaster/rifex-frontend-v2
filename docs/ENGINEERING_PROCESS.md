# Rifex Engineering Process

Required flow:

```text
README
-> WOP
-> ENGINEERING_PROCESS
-> CURRENT_STATE
-> WHY
-> ROADMAP
-> ARCHITECTURE AUDIT
-> ARCHITECTURE DESIGN
-> SPRINT
-> RELEASE AUDIT
-> COMMIT
-> PUSH
-> HEAD VERIFIED
-> WORKING TREE CLEAN
```

## State Rules

| State | Allowed | Not Allowed |
|---|---|---|
| ALIGNMENT | Reconstruct facts and materialize baseline docs | Functional implementation |
| ARCHITECTURE AUDIT | Analyze current architecture | Future design or code changes |
| ARCHITECTURE DESIGN | Design future architecture | Implementation |
| SPRINT | Implement authorized design | Unscoped changes |
| RELEASE AUDIT | Verify changes before commit | New feature work |

## Evidence Rules

| Claim Type | Requirement |
|---|---|
| Code present | Direct repository evidence |
| Functional behavior | Test/build/runtime/service evidence |
| DB object | Snapshot, migration, SQL, code query, or safe backup evidence |
| Security property | Code/config evidence plus verification where required |
| Proposal | Must be labeled `PROPOSED` |

## Audit, Design, Implementation

| Activity | Purpose |
|---|---|
| Audit | State what exists and what is unknown |
| Design | Define a future target and migration path |
| Implementation | Modify behavior according to authorized design |

Code present is not the same as functioning verified. A route, table query, or UI can be `CONFIRMED present` and still `UNVERIFIED`.

## Minimum Criteria To Open Sprint

- Alignment closed or explicitly accepted as sufficient.
- Architecture Audit completed.
- Architecture Design completed.
- Baseline DB documented.
- Functional diffs either adopted, rejected, or isolated.
- Critical authorization risks have an approved design.
- Tests required for the Sprint are defined.

## Release Audit Criteria

- Scope matched to authorized design.
- Tests/build appropriate to risk.
- No secrets or personal data exposed.
- Git status explained.
- Migration and rollback path documented when relevant.
- Commit/push only after Release Audit is GO.

## Dirty Working Trees

Dirty working trees must be classified:

| Category | Meaning |
|---|---|
| PRE-EXISTING FUNCTIONAL DIFFS | Functional code changes that existed before the current phase |
| DOCUMENTATION CHANGES | Docs created or updated by the current phase |
| BACKUP-PROTECTION CHANGE | Ignore or safety rule for sensitive artifact |
| IGNORED SENSITIVE ARTIFACT | Present but excluded from Git baseline |
| UNEXPECTED CHANGES | Any change outside the authorized scope |

A2 is an intermediate documentation phase and cannot be treated as fully closed engineering work while the general working tree remains dirty.

## Sensitive Artifacts

Sensitive artifacts must not be printed, copied, moved, committed, or destroyed without explicit authorization. Evidence can be recorded at the classification level only.

## Traceability

Every implementation must trace:

```text
decision -> design -> implementation -> tests -> release audit
```
