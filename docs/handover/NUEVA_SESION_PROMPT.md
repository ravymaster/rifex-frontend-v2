Repositorio: rifex-frontend-v2 (Rifex, plataforma de rifas/campañas/eventos).
Remote: https://github.com/ravymaster/rifex-frontend-v2.git.

> 2026-08-24: este prompt fue actualizado para el handoff Santiago → Antofagasta
> tras EVENT-3. La rama activa de trabajo es `develop` (no `main` — `main` es
> PROD, congelado respecto de Eventos). El texto verbatim de abajo es el mismo
> guardado en `docs/WOP.md`, sección "RIFEX CURRENT STATE" → "Reentry Prompt" —
> mantenerlos idénticos si se edita alguno.
>
> 2026-08-25 (final): EVENT-4 está **DONE y CERTIFICADO — 100/100 aceptación
> manual de Rodrigo en un teléfono real**: cámara real, QR real leído desde
> pantalla, PASA persistente (sin desaparecer solo), reanudación únicamente
> por "Siguiente escaneo", segundo escaneo del mismo QR → "NO PASA — YA
> UTILIZADA" con hora real. El primer intento real encontró un bug genuino
> (temporizador de auto-reset dejaba que la cámara re-escaneara y
> re-enviara sola el mismo ticket) — corregido en el commit `c32713e`,
> redesplegado, vuelto a probar, confirmado. Todos los fixtures de
> `EVENT-4 TEST` fueron eliminados de `rifex-dev` (por ID exacto).
> Especificación completa en `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md`
> (canónico). Pendiente real: rotar la contraseña de base de datos de
> `rifex-dev` (quedó expuesta en texto plano por un `--dry-run` el
> 2026-08-25, todavía sin rotar — decisión explícita de posponerla, no un
> olvido) antes de cualquier conexión PostgreSQL directa
> (`psql`/`pg_dump`/`db dump`). El CLI de Supabase (`db push`/`db pull`)
> sigue sin poder usarse en este proyecto — ver WOP, Risks/pending ítem 9.
> Ningún secreto se incluye en este documento ni en el WOP. NEXT = EVENT-5,
> sin alcance ni autorización todavía.
>
> Addendum posterior, mismo día — PRE-LAUNCH-FIX-3, RESUELTO: alerta real
> de Supabase Security Advisor (`rls_disabled_in_public`, CRITICAL) en
> `public.raffle_date_extensions`, ajena a Eventos. Demostrada (INSERT
> anónimo sin error) y corregida en `rifex-dev` **y en PROD**
> (`wrdkdfuiwlujfxxijpao`) con una migración de una sola línea
> (`db/migrations/2026-08-25c_prelaunch_fix3_raffle_date_extensions_rls.sql`),
> mismo patrón ya certificado de `legal_declarations`. Security Advisor de
> PROD ahora reporta cero hallazgos nivel ERROR. Ver WOP, sección
> "PRE-LAUNCH-FIX-3".
>
> 2026-08-26 — P0 SIN RESOLVER, fuera del alcance de este repo/agente:
> `rifex.pro` caído con `ERR_SSL_PROTOCOL_ERROR`. Causa raíz confirmada:
> **el registro del dominio venció en el registrador (Hostinger)** — los
> nameservers reales son `ns1/ns2.dns-expired.com` (no los de Vercel),
> confirmado vía dos resolvers DNS públicos independientes, y la IP
> resuelta sirve la página propia de Hostinger "Your domain is expired."
> La asignación del dominio en Vercel (`rifex-frontend-v2` ↔ `rifex.pro`)
> siempre estuvo correcta, sin necesidad de cambios. **No hay corrección
> posible desde código, deploy, base de datos ni Vercel** — requiere que
> Rodrigo (o quien tenga la cuenta de Hostinger) renueve el dominio
> directamente ahí. El deployment real de Vercel, `rifex-dev` y la
> corrección PRE-LAUNCH-FIX-3 quedan confirmados sin afectar. Ver WOP,
> sección "P0 — rifex.pro domain expired".

```text
Estamos retomando Rifex desde un equipo nuevo (Antofagasta), sesión sin memoria conversacional previa.
No uses memoria de conversación como autoridad — la autoridad es el repo (Git) y docs/WOP.md.
Repo: https://github.com/ravymaster/rifex-frontend-v2.git, branch develop.
Ejecuta el procedimiento "Reentry Notebook Procedure" de docs/WOP.md (sección "RIFEX CURRENT STATE").
Lee en orden: docs/WOP.md (sección RIFEX CURRENT STATE), docs/CURRENT_STATE.md, docs/handover/HANDOVER_RIFEX_CURRENT.md.
Verifica: git fetch, HEAD real de develop (debe incluir el commit c32713e, o un descendiente), origin/main (c944bb3 o su descendiente — si cambió, alerta antes de seguir), git status.
Reconstruye el estado real de EVENT-1/EVENT-2/EVENT-3/EVENT-4 a partir del repo, no de esta instrucción.
Confirma que EVENT-4 está DONE y CERTIFICADO (aceptación manual 100/100) y que NEXT es EVENT-5, todavía sin alcance ni autorización.
Confirma si la rotación de la contraseña de rifex-dev ya se hizo (WOP, Risks/pending ítem 8).
No modifiques código todavía.
Entrégame un REENTRY REPORT (branch, HEAD, origin/develop, origin/main, git status, resumen EVENT-1/2/3/4, riesgos pendientes, NEXT) y detente ahí.
```
