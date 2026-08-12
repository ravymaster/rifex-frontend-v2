# Rifex Roadmap

This roadmap is a sequence of gates. It is not a Sprint and contains no invented dates.

| Step | Objective | Precondition | Evidence Required | Exit Criteria | Current Status | Authorized |
|---:|---|---|---|---|---|---|
| 1 | Close Alignment documentation | A2 prompt | Docs coherent with repo | A2 gate reported | GO | Yes |
| 2 | Protect backup | Backup present | Git ignore/read-only checks | Backup ignored, present, untracked | GO | Yes for ignore rule |
| 3 | Consolidate DB baseline | A2 docs reviewed | Snapshot/migrations/code/backup compared | Canonical DB doc accepted | PENDING | No implementation |
| 4 | Define canonical states | DB baseline draft | State matrix | Tickets/purchases/payments states resolved | PENDING | No |
| 5 | Resolve recovery/hardening line | DB/states known | Diff audit and tests | Adopt/reject/isolate three diffs | PENDING | No |
| 6 | Close authorization risks | Security doc reviewed | Auth design evidence | Temporary headers addressed by design | PENDING | No |
| 7 | Minimum functional verification | Baseline docs stable | Build/tests/runtime plan | Critical flows verified | PENDING | No |
| 8 | Alignment final gate | Prior steps ready | Final Alignment report | Alignment closed or partial accepted | PENDING | No |
| 9 | Architecture Audit | Alignment authorized | Current architecture evidence | Audit report | NOT OPEN | No |
| 10 | Architecture Design | Audit complete | Target design | Approved design | NOT OPEN | No |
| 11 | Future Sprint | Design approved | Sprint scope | Implemented and tested changes | NOT AUTHORIZED | No |
| 12 | Release Audit | Sprint complete | Test/build/Git evidence | GO before commit/push | PENDING | No |
