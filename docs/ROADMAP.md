# Rifex Roadmap

This roadmap is a sequence of gates. It is not a Sprint and contains no invented dates.

| Step | Objective | Precondition | Evidence Required | Exit Criteria | Current Status | Authorized |
|---:|---|---|---|---|---|---|
| 1 | Alignment Closing Gate | A5 docs complete | Current state and recovery plan | ALIGNMENT CLOSED - GO | GO | Yes |
| 2 | Architecture Audit | Explicit user authorization | Current architecture and risks | Audit report | NEXT ELIGIBLE | No |
| 3 | Architecture Design | Architecture Audit complete | Target decisions | Approved design | NOT OPEN | No |
| 4 | Future Sprint R4 | Design approved | `/checkout` build failure reproduced | Build baseline fixed and audited | NOT AUTHORIZED | No |
| 5 | DB Recovery | Design approved | Migration contracts | Clean install reproducible | NOT AUTHORIZED | No |
| 6 | R1 Mailer | DB contract ready or degraded mode approved | Tests/mocks | Mailer gate GO | NOT AUTHORIZED | No |
| 7 | R2 Webhook | R1/DB prerequisites | HMAC/idempotency tests | Webhook gate GO | NOT AUTHORIZED | No |
| 8 | R3 Technical | R2/shared DB ready | Reconciliation tests | R3 technical gate GO | NOT AUTHORIZED | No |
| 9 | Fees Policy | Explicit commercial decision | Fee contract | Policy accepted | UNKNOWN | No |
| 10 | Release Audits | Each unit complete | Tests/build/Git evidence | GO before commit/push | PENDING | No |
