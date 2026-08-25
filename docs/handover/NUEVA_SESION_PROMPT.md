Repositorio: rifex-frontend-v2 (Rifex, plataforma de rifas/campañas/eventos).
Remote: https://github.com/ravymaster/rifex-frontend-v2.git.

> 2026-08-24: este prompt fue actualizado para el handoff Santiago → Antofagasta
> tras EVENT-3. La rama activa de trabajo es `develop` (no `main` — `main` es
> PROD, congelado respecto de Eventos). El texto verbatim de abajo es el mismo
> guardado en `docs/WOP.md`, sección "RIFEX CURRENT STATE" → "Reentry Prompt" —
> mantenerlos idénticos si se edita alguno.
>
> 2026-08-25 (actualizado): EVENT-4 está **DONE** — implementado, migrado a
> `rifex-dev`, certificado con 36/36 pruebas automatizadas (incluida
> concurrencia 20x exactly-once). Especificación completa en
> `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md` (canónico). Pendiente real:
> rotar la contraseña de base de datos de `rifex-dev` (quedó expuesta en
> texto plano por un `--dry-run` el 2026-08-25, todavía sin rotar — decisión
> explícita de posponerla, no un olvido) antes de cualquier conexión
> PostgreSQL directa (`psql`/`pg_dump`/`db dump`), y hacer un smoke test real
> del scanner en un teléfono (la cámara no se verificó en navegador esta
> sesión, por una limitación del entorno de pruebas, no del código). El CLI
> de Supabase (`db push`/`db pull`) sigue sin poder usarse en este proyecto —
> ver WOP, Risks/pending ítem 9. Ningún secreto se incluye en este documento
> ni en el WOP. NEXT = EVENT-5, sin alcance ni autorización todavía.

```text
Estamos retomando Rifex desde un equipo nuevo (Antofagasta), sesión sin memoria conversacional previa.
No uses memoria de conversación como autoridad — la autoridad es el repo (Git) y docs/WOP.md.
Repo: https://github.com/ravymaster/rifex-frontend-v2.git, branch develop.
Ejecuta el procedimiento "Reentry Notebook Procedure" de docs/WOP.md (sección "RIFEX CURRENT STATE").
Lee en orden: docs/WOP.md (sección RIFEX CURRENT STATE), docs/CURRENT_STATE.md, docs/handover/HANDOVER_RIFEX_CURRENT.md.
Verifica: git fetch, HEAD real de develop (debe ser la copia de EVENT-4 sobre 725c4f8, o su descendiente), origin/main (c944bb3 o su descendiente — si cambió, alerta antes de seguir), git status.
Reconstruye el estado real de EVENT-1/EVENT-2/EVENT-3/EVENT-4 a partir del repo, no de esta instrucción.
Confirma que EVENT-4 está DONE y que NEXT es EVENT-5, todavía sin alcance ni autorización.
Confirma si la rotación de la contraseña de rifex-dev y el smoke test real de cámara ya se hicieron (WOP, Risks/pending items 8 y 10).
No modifiques código todavía.
Entrégame un REENTRY REPORT (branch, HEAD, origin/develop, origin/main, git status, resumen EVENT-1/2/3/4, riesgos pendientes, NEXT) y detente ahí.
```
