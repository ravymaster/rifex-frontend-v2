# Rifex Roadmap

This roadmap is a sequence of gates. It is not a Sprint and contains no invented dates.

| Step | Objective | Precondition | Evidence Required | Exit Criteria | Current Status | Authorized |
|---:|---|---|---|---|---|---|
| 1 | Alignment Closing Gate | A5 docs complete | Current state and recovery plan | ALIGNMENT CLOSED - GO | GO | Yes |
| 2 | Architecture Audit | Explicit user authorization | Current architecture and risks | Audit report | CLOSED - GO | Yes |
| 3 | Architecture Design | Architecture Audit complete | AD1 decisions, AD2 documents and AD3 closing evidence | Architecture Design Closing Gate GO | CLOSED - GO | Yes; completed |
| 4 | Architecture Design closing documentation | AD3 GO | AD3 report, R4 packet, Git integrity | AD4 documentation materialized | GO | Yes; documentation only |
| 5 | Future Sprint R4 | Explicit user authorization after AD4 | `/checkout` build failure reproduced; R4 packet ready | Build baseline fixed and audited | READY - NOT YET OPEN | No |
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

R4 Sprint Readiness is `GO`, but Sprint remains `NOT YET OPEN / NOT AUTHORIZED`.
