# Architecture Target

This document records the target architecture decided in Architecture Design AD1 and materialized by AD2. It is design documentation only. It is not implemented, not functionally verified, and does not open Sprint.

TARGET ARCHITECTURE DECISION: DECIDED

```text
UI / Pages
-> API Routes
-> Application Services
-> Domain Rules
-> Ports
-> Adapters
-> Persistence / Providers
```

## Principles

- No Big Bang rewrite.
- Next.js Pages Router is preserved.
- Supabase is preserved.
- Mercado Pago is preserved.
- Resend is preserved.
- Warp Core is not required.
- Application services are concrete use-case coordinators.
- Domain rules contain no providers.
- Ports are specific to use cases.
- Persistence modules are concrete query/write modules, not mandatory generic repositories.
- Service role access is encapsulated server-side.
- Boundaries are introduced unit by unit through future authorized Sprints.

## Boundaries

| Boundary | Responsibility | Allowed Dependencies | Prohibited Dependencies |
|---|---|---|---|
| UI / Pages | Render views, gather user intent, call documented APIs. | React, Next pages, public config, API clients. | Business invariants, provider SDKs, service-role keys. |
| API Routes | HTTP method handling, parsing, auth context and response mapping. | request/response, auth/session helpers, application services. | Direct business decisions or provider-specific rules in handlers. |
| Application Services | Use-case authority, orchestration, transactions, idempotency and side effects. | Domain rules, ports, persistence modules. | Raw UI assumptions and provider SDK details. |
| Domain Rules | Invariants, states, guards and pure transitions. | Pure data and constants. | Supabase, Mercado Pago, Resend and HTTP. |
| Ports | Concrete external contracts required by use cases. | DTOs and normalized errors. | Broad provider leakage or generic unused interfaces. |
| Adapters | Mercado Pago, Resend and Supabase implementations. | Provider SDK/REST, env and port DTOs. | Domain decisions. |
| Persistence / Providers | Durable storage and external side effects. | Supabase/Postgres and provider APIs through adapters. | UI logic or hidden business policy. |

## Boundary Contracts

| Boundary | Inputs | Outputs | Errors | Ownership | Test Boundary | Incremental Introduction | Current Architecture Relation |
|---|---|---|---|---|---|---|---|
| UI / Pages | User events, route params, API responses. | UI state, navigation and API requests. | User-safe messages from error codes. | None; never authoritative. | Browser/e2e and component smoke. | Preserve pages while moving rules server-side. | Current UI mixes payment return, winner triggering and mapping. |
| API Routes | HTTP body/query/headers. | JSON, redirects or webhook status. | Stable API/OAuth/webhook errors. | Entrypoint only. | Route contract tests. | Keep routes thin as services appear. | Current routes contain orchestration and persistence. |
| Application Services | Validated command DTOs and auth context. | Domain result DTOs and side-effect intents. | Normalized application errors. | Owns mutation decisions. | Unit and route integration tests. | Extract per recovery unit. | Current authority is fragmented across routes. |
| Domain Rules | Domain objects and command facts. | Transition decisions. | Pure validation/conflict errors. | Owns business invariants. | Pure unit tests. | Start with payment and ticket states. | Current rules are duplicated in UI/API code. |
| Ports | Service commands. | Normalized provider results. | Timeout/retry/provider codes. | Application-owned contracts. | Fake adapter tests. | Introduce per provider call. | Current provider calls are route-local. |
| Adapters | Port DTOs. | Port result DTOs. | Normalized adapter errors. | Provider boundary only. | Fake/contract tests. | Wrap existing calls without migration first. | Current SDK/REST usage is scattered. |
| Persistence / Providers | Queries, writes and provider requests. | Rows, events and provider responses. | Storage/provider errors. | Service role only through server modules. | Integration tests and migration checks. | Add query/write modules by flow. | Current access is scattered and partially inline. |

## Current-To-Target Rule

Current architecture remains route-centric and functionally UNVERIFIED. Target architecture is an approved design direction. Future changes must state which boundary they introduce and must preserve rollback paths.

## PII And Logging Constraints

```text
PAYLOAD LOGGING: MOVE_AFTER_VALIDATION
MAIL CONTENT STORAGE: MINIMIZE
RETENTION PERIOD: DEFERRED
```

Target architecture must not document or persist raw payloads, personal data or complete email bodies unless a later authorized policy explicitly allows it. Tokens and raw sensitive headers remain prohibited in logs.
