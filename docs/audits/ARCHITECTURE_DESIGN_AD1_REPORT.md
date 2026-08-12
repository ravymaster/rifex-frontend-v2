# Architecture Design AD1 Report

## Purpose

This report records the corrected Architecture Design AD1 decisions materialized by AD2. It replaces the original AD1 conceptually and incorporates the adversarial review corrections.

## Sources

- authoritative repository documentation;
- Architecture Audit report and ledgers;
- Architecture Design inputs AD-01 to AD-19;
- original AD1 design;
- AD1 adversarial review;
- HEAD and working tree static evidence;
- Git integrity checks.

## AD1 Original And Adversarial Review

AD1 produced foundational target architecture decisions. The adversarial review accepted the direction but required corrections around canonical states, payment authority, idempotency, OAuth authority, mail guarantees, fees, R4 routing and winner policy.

## Valid Attacks And Corrections

| Area | Correction |
|---|---|
| states | durable states separated from transitions and outcomes |
| payment authority | ApplyPaymentEvidence is the only internal authority |
| idempotency | separate payment, event, command, email and winner identities |
| OAuth | query uid/email are never authority; state is server-side and single-use |
| mail | best-effort delivery with durable dedup when available; no exactly-once promise |
| fees | commercial fee policy deferred |
| R4 | /checkout page and /api/checkout API routes are distinct |
| winner | technical guards decided; commercial eligibility deferred |

## Consolidated Decisions

The consolidated decisions are materialized in `docs/architecture/ARCHITECTURE_DECISIONS.md` and linked target documents.

## Deferrals

- final admin role model;
- exact SQL and migration contents;
- token storage/cipher detail;
- retention period;
- commercial fee policy;
- winner commercial eligibility and randomness policy details;
- exact test dependency versions;
- caller migration plan for legacy checkout route.

## Open Risks

No technical risk is closed by design alone. Authorization, payment authority, idempotency, R4, OAuth, mail, DB reproducibility, legacy and PII remain open until implemented and tested. Fees and winner eligibility contain explicit deferred commercial decisions.

## Target Flows

Target flows are documented in `docs/architecture/TARGET_FLOWS.md` and cover create raffle, purchase, payment evidence, merchant OAuth and winner.

## Gates

| Gate | Status |
|---|---|
| ARCHITECTURE DESIGN AD1 CORRECTION | GO |
| ARCHITECTURE DESIGN AD1 | GO |
| ARCHITECTURE DESIGN AD1 ADVERSARIAL REVIEW | GO |
| ARCHITECTURE DESIGN AD2 | GO |
| ARCHITECTURE DESIGN DOCUMENTATION READY | YES |
| ARCHITECTURE DESIGN | OPEN |
| SPRINT | NOT AUTHORIZED |

## Limits

This report is documentation only. It does not implement, test, build, migrate, stage, commit, push or open Sprint.

## Integrity

AD2 must preserve HEAD/origin, keep staged empty, preserve the three recovery/hardening diffs and keep the PostgreSQL backup ignored and outside Git baseline.
