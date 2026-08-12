# Rifex Roadmap

This roadmap is a sequence of gates. It is not a Sprint and contains no invented dates.

| Step | Objective | Precondition | Evidence Required | Exit Criteria | Current Status | Authorized |
|---:|---|---|---|---|---|---|
| 1 | Alignment Closing Gate | A5 docs complete | Current state and recovery plan | ALIGNMENT CLOSED - GO | GO | Yes |
| 2 | Architecture Audit | Explicit user authorization | Current architecture and risks | Audit report | CLOSED - GO | Yes |
| 3 | Architecture Design | Architecture Audit complete | AD1 decisions and AD2 documents | Documentation ready, release audit passed | IN PROGRESS | Yes for documentation only |
| 4 | Architecture Design release audit | AD2 materialized | Docs, consistency, Git integrity | Architecture Design documentation ready | PENDING | No |
| 5 | Future Sprint R4 | Design approved and release audited | `/checkout` build failure reproduced | Build baseline fixed and audited | NOT AUTHORIZED | No |
| 6 | DB Recovery | Design approved and release audited | Migration contracts | Clean install reproducible | NOT AUTHORIZED | No |
| 7 | R1 Mailer | DB contract ready or degraded mode approved | Tests/mocks | Mailer gate GO | NOT AUTHORIZED | No |
| 8 | R2 Webhook | R1/DB prerequisites | HMAC/idempotency tests | Webhook gate GO | NOT AUTHORIZED | No |
| 9 | R3 Technical | R2/shared DB ready | Reconciliation tests | R3 technical gate GO | NOT AUTHORIZED | No |
| 10 | Fees Policy | Explicit commercial decision | Fee contract | Policy accepted | UNKNOWN | No |
| 11 | Release Audits | Each unit complete | Tests/build/Git evidence | GO before commit/push | PENDING | No |

The recovery sequence remains:

```text
R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy -> Release Audits -> Separate Commits
```

Sprint remains `NOT AUTHORIZED`.
