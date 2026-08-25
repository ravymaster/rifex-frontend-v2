Repositorio: rifex-frontend-v2 (Rifex, plataforma de rifas/campañas/eventos).
Remote: https://github.com/ravymaster/rifex-frontend-v2.git.

> 2026-08-24: este prompt fue actualizado para el handoff Santiago → Antofagasta
> tras EVENT-3. La rama activa de trabajo es `develop` (no `main` — `main` es
> PROD, congelado respecto de Eventos). El texto verbatim de abajo es el mismo
> guardado en `docs/WOP.md`, sección "RIFEX CURRENT STATE" → "Reentry Prompt" —
> mantenerlos idénticos si se edita alguno.
>
> 2026-08-25: EVENT-4 sigue **NEXT / no iniciado**. Su especificación completa
> vive en `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md` (canónico, leer antes
> de programar). Pendiente: introspección read-only del esquema vivo de
> `rifex-dev` contra el SQL de EVENT-1/2/3 (todavía no realizada). La
> contraseña de base de datos de `rifex-dev` debe **rotarse** antes de
> cualquier conexión PostgreSQL directa (`psql`/`pg_dump`/`db dump`) — quedó
> expuesta en texto plano por un `--dry-run` el 2026-08-25; nunca reutilizarla.
> Ningún secreto se incluye en este documento ni en el WOP.

```text
Estamos retomando Rifex desde un equipo nuevo (Antofagasta), sesión sin memoria conversacional previa.
No uses memoria de conversación como autoridad — la autoridad es el repo (Git) y docs/WOP.md.
Repo: https://github.com/ravymaster/rifex-frontend-v2.git, branch develop.
Ejecuta el procedimiento "Reentry Notebook Procedure" de docs/WOP.md (sección "RIFEX CURRENT STATE").
Lee en orden: docs/WOP.md (sección RIFEX CURRENT STATE), docs/CURRENT_STATE.md, docs/handover/HANDOVER_RIFEX_CURRENT.md.
Verifica: git fetch, HEAD real de develop (debe ser 725c4f8 o su descendiente), origin/main (c944bb3 o su descendiente — si cambió, alerta antes de seguir), git status.
Reconstruye el estado real de EVENT-1/EVENT-2/EVENT-3 a partir del repo, no de esta instrucción.
Confirma que NEXT = EVENT-4 (Staff + Scanner + Check-in) y que EVENT-4 no está implementado.
No modifiques código todavía.
Entrégame un REENTRY REPORT (branch, HEAD, origin/develop, origin/main, git status, resumen EVENT-1/2/3, riesgos pendientes, NEXT) y detente ahí.
```
