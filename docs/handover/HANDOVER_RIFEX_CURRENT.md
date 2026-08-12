# Rifex Current Handover

## Identidad

- Product: Rifex.
- Repository: `C:\proyectos\rifexv1.1\rifex-frontend-main`.
- Remote: `https://github.com/ravymaster/rifex-frontend-v2.git`.
- Main branch: `main`.
- Observable purpose: Next.js frontend and API surface for raffle creation, ticket selection, Mercado Pago checkout, payment confirmation, webhook handling, creator panel operations, seller Mercado Pago OAuth, email notifications and winner selection.
- Stack: Next.js 14 Pages Router, React 18, Supabase, Mercado Pago SDK/REST, Resend, hCaptcha, CSS Modules/local styles.

## Estado Oficial

```text
ALIGNMENT: CLOSED — GO
ARCHITECTURE AUDIT: CLOSED — GO
ARCHITECTURE DESIGN: CLOSED — GO
R4 SPRINT READINESS: GO
NEXT ELIGIBLE STAGE: SPRINT R4
SPRINT R4: NOT YET OPEN
OTHER SPRINTS: NOT AUTHORIZED
```

## Checkpoint Principal

```text
main:
19e28994a32660755ac7a6e2b70ae9f4a50f98b4

commit message:
docs: close Rifex architecture design
```

## Recovery Preservado

```text
branch:
recovery/rifex-hardening-preserved

commit:
1c23702f401f8c501077ecfd265a213245e62a63

status:
PRESERVED — UNVERIFIED — NOT ADOPTED
```

Files preserved on the recovery branch:

- `src/lib/mailer.js`
- `src/pages/api/admin/reconcile-payments.js`
- `src/pages/api/checkout/webhook.js`

These changes are not in `main`. Do not mix them with R4. They must be recovered later as R1/R2/R3 work, through selective and certified adoption. Do not perform a general merge of `recovery/rifex-hardening-preserved`.

## Backup

- File name: `db_cluster-10-11-2025@05-41-59.backup.gz`.
- Local state: present.
- Git state: ignored.
- Classification: sensitive.
- Baseline: outside Git.
- Rule: do not inspect, move or delete without a specific mission.

No backup content or data is included in this handover.

## Estado Tecnico

- General functionality: `UNVERIFIED`.
- Production readiness: not certified.
- DB reproducibility: `PARTIAL`.
- Remote database state: `UNKNOWN`.
- Build state: currently failed in the last documented build attempt.
- Build failure: `/checkout`.
- Confirmed cause: API handler located as a `/checkout` Pages Router page route.
- Authorization risks: still open.
- Canonical states: contradictory across evidence sources.
- Legacy: frozen behind compatibility boundaries.

## Primer Proximo Paso

```text
SPRINT R4 — Build Baseline Recovery
```

- Packet: `docs/sprints/R4_BUILD_BASELINE_SPRINT_PACKET.md`.
- Single objective: restore build baseline by fixing the `/checkout` page/API conflict.
- Decision: `A — VALID REACT PAGE`.
- Exclusive future allowlist: `src/pages/checkout/index.js`.
- Future commit message: `fix: restore checkout page build`.
- R4 is not open yet.

## Instrucciones Para Reanudar

The next AI must read, in this order:

1. `README.md`
2. `docs/WOP.md`
3. `docs/ENGINEERING_PROCESS.md`
4. `docs/CURRENT_STATE.md`
5. `docs/handover/HANDOVER_RIFEX_CURRENT.md`
6. `docs/sprints/R4_BUILD_BASELINE_SPRINT_PACKET.md`
7. `docs/architecture/ARCHITECTURE_TARGET.md`
8. `docs/architecture/ARCHITECTURE_DECISIONS.md`

Then verify:

- branch `main`;
- HEAD;
- `origin/main`;
- clean working tree;
- recovery branch;
- ignored backup.

Only then may it ask for authorization to open R4.

## Prohibiciones De Reanudacion

- Do not use conversational memory as source of truth.
- Do not mix recovery branch with R4.
- Do not open DB/R1/R2/R3.
- Do not modify checkout APIs.
- Do not open another Sprint.
- Do not declare functionality verified.
- Do not touch the backup.
- Do not install dependencies before the corresponding gate.

## Recovery Sequence

```text
R4
→ DB Recovery Contract
→ R1
→ R2
→ R3 Technical
→ Fees Policy
→ Release Audits
→ Separate Commits
```

## Primer Prompt Sugerido

```text
Lee el handover y el R4 Sprint Packet.
Reconstruye Git.
No programes todavía.
Confirma si R4 puede abrirse exactamente desde el checkpoint documentado.
```