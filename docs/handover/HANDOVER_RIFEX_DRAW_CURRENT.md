# Rifex — Handover DRAW (sorteo automático) — CLOSED / PROD

## Estado

```text
DRAW — CLOSED / PROD
```

Lifecycle temporal de sorteo (`draw_at`) completo, verificado de punta a punta
en producción: `crear rifa → fecha/hora de sorteo obligatoria → ventas
abiertas → T-5 cierre automático → scheduler cada 5 min → sorteo → ganador
persistido (exactly-once) → notificación`. Rifas legacy (creadas antes de
esta promoción) no participan y quedan sin cambios.

## Cierre — commit y checkpoint

```text
fecha de cierre:     2026-08-22
branch:               main
commit PROD:          3a6ee8dda69286889bf64dffb2895be3417fb3f5 (3a6ee8d)
checkpoint pre-DRAW:  tag pre-draw-fc3f046 -> fc3f046b67a5b63b3ba404334b74e1a9ea6cdf54
origin/main:          igual a 3a6ee8d (0 ahead, 0 behind al momento del cierre)
```

Commits promovidos a `main` (cherry-pick quirúrgico, nunca merge; hashes en
`main` distintos a los de `develop` por ser cherry-pick, mismo contenido):

```text
3a6ee8d  fix(ux): RAW-UX-FINAL-B — quitar "Ver rifas en vivo" del hero y corregir el off-by-one de end_date
42675d2  feat(draw): DRAW-UX-FINAL — sorteo obligatorio, limpieza de UX y ocultar accesos al listado público
1b8cc5e  feat(draw): UX — aviso de sorteo automático (ventana 0-5 min) visible
b041610  fix(draw): DRAW-2C — separación estricta de scheduler DEV/PROD
4553dab  feat(draw): DRAW-2 FINAL — sold-out defiere al scheduler + GitHub Actions
900975c  feat(draw): DRAW-1B hardening + DRAW-2 scheduler automático
b829787  feat(draw): DRAW-1 — lifecycle temporal de rifa + extensiones + reglas de publicación
```

Único conflicto de cherry-pick en las tres promociones (DRAW-PROD y sus dos
follow-ups), siempre en `src/lib/countryPolicy.js`, resuelto de forma
idéntica cada vez: mantener el bloque `AR` de `main` (`enabled: false`,
`capabilities` todas en `false`) y agregar únicamente `defaultTimezone`. No
se promovió lógica de Argentina (`devOnly`, `isDevStage`, capabilities en
`true`) en ningún momento.

**Explícitamente NO promovido a `main` en este cierre** (permanece solo en
`develop`, seguirá ahí hasta que se autorice su propio sprint de
promoción): Payment Engine (P1/P2), Argentina (AR1/AR2), tooling exclusivo
de DEV (`environmentPolicy.js`, bypass de hCaptcha, banner DEV).

## Arquitectura del sorteo automático

### Columnas nuevas en `raffles` (aditivas, todas nullable o con default)

- `draw_at timestamptz` — instante UTC real del sorteo. `NULL` = rifa
  legacy, fuera del lifecycle temporal.
- `sales_end_at timestamptz` — `draw_at` menos el margen T-5. Ventas se
  bloquean automáticamente en `checkout/mp.js` cuando `now() >=
  sales_end_at` (`409 sales_closed`). Rifas con `sales_end_at = NULL`
  conservan el comportamiento legado exacto, sin gate de tiempo.
- `timezone text` — IANA (ej. `America/Santiago`), resuelta **siempre
  server-side** desde `users_profile.country_code` del creador vía
  `COUNTRY_POLICY[...].defaultTimezone` — nunca confiada al cliente.
- `extension_limit integer default 0` / `extensions_used integer default 0`
  — cuántas veces puede posponerse el sorteo y cuántas ya se usaron.

### Tablas nuevas

- `raffle_date_extensions` — historial inmutable de extensiones (nunca se
  sobreescribe, cada extensión agrega una fila).
- `legal_declarations` — declaraciones 18+ y propiedad del premio,
  genérica por `entity_type/entity_id` (raffle hoy, reusable para Colecta
  después). Insertadas de forma **fail-closed**: si la declaración falla,
  la rifa tampoco se crea (misma transacción vía RPC).

### RPCs (`db/migrations/2026-08-19_draw1_temporal_lifecycle.sql`,
`2026-08-20_draw1b_atomic_rpcs.sql`, `2026-08-20b_draw1b_fix_prize_photos_null.sql`)

- `create_raffle_with_declarations(p_raffle, p_user_id, p_declaration_types)`
  — crea la rifa y sus declaraciones legales en una sola transacción.
  Hotfix `2026-08-20b`: `prize_photos` como JSON `null` explícito (lo que
  manda el formulario real para premios en dinero) ya no rompe el insert —
  se verifica `jsonb_typeof` en vez de confiar en `coalesce`.
- `extend_raffle_draw(p_raffle_id, p_user_id, p_new_draw_at,
  p_new_sales_end_at, p_reason)` — extensión atómica con `FOR UPDATE`:
  valida ownership, límite de extensiones, ausencia de ganador previo,
  fecha futura y anticipación mínima (10 min) antes de mutar.

### Ventana operacional del scheduler

`api/cron/draw-scheduler.js`, protegido por `CRON_SECRET` (env var por
proyecto Vercel — **no** lleva sufijo `_DEV`/`_PROD` en el nombre; ese
sufijo solo existe en los GitHub Secrets/Variables, que sí necesitan
distinguir DEV de PROD dentro del mismo repo). Dispara sobre rifas
`draw_at <= now()` (no igualdad exacta) — idempotente/recovery: una
ejecución tardía recupera cualquier sorteo pendiente sin perderlo.

- GitHub Actions `draw-scheduler-prod.yml`: `schedule: */5 * * * *` +
  `workflow_dispatch`. Solo vive activo estando en la rama default
  (`main`) — GitHub ignora `schedule` en cualquier otra rama.
- Ventana real de ejecución del sorteo: **0 a 5 minutos después** de
  `draw_at`, nunca exactamente en el instante — limitación conocida,
  aceptada para este cierre.
- `draw-scheduler-dev.yml`: `workflow_dispatch` únicamente, sin
  `schedule` — DEV nunca dispara solo.

### Separación DEV/PROD (nunca mezclados)

| | DEV | PROD |
|---|---|---|
| GitHub Secret | `CRON_SECRET_DEV` | `CRON_SECRET_PROD` |
| GitHub Variable | `DRAW_SCHEDULER_URL_DEV` | `DRAW_SCHEDULER_URL_PROD` |
| Target | `rifex-frontend-main.vercel.app` | `rifex.pro` |
| Vercel env var `CRON_SECRET` | proyecto `rifex-frontend-main` | proyecto `rifex-frontend-v2` |
| Trigger | manual (`workflow_dispatch`) | automático (`schedule` cada 5 min) + manual |

Cada par (`CRON_SECRET_DEV`, `CRON_SECRET_PROD`) fue generado por separado;
nunca se reutilizó un valor entre ambientes.

### Sorteo manual

`api/rifas/[id]/draw.js` — disparo explícito por el creador, mismo
`drawWinner()` que usa el scheduler y el flujo sold-out, misma garantía
exactly-once (ver abajo).

### Comportamiento sold-out

Centralizado en `src/lib/drawWinner.js`: cuando una rifa se vende
completo, **no** sortea inmediatamente — difiere al scheduler (evita doble
disparo si sold-out y `draw_at` casi coinciden). `trigger_source` /
`triggered_by` quedan auditados en `raffle_results` para saber si el
sorteo vino de sold-out automático, scheduler, o acción manual.

### Exactly-once

`raffle_results.raffle_id` es la única autoridad de "ya tiene ganador".
`drawWinner()` la respeta siempre — ni el scheduler, ni sold-out, ni el
sorteo manual introducen un segundo mecanismo de idempotencia.

### UX obligatoria (DRAW-UX-FINAL / DRAW-UX-FINAL-B)

- Fecha y hora de sorteo son **obligatorias** para toda rifa nueva —
  `crear-rifa.jsx` (`required` + validación de envío) y
  `api/rifas/index.js` (`400 missing_draw_datetime` si falta cualquiera de
  las dos). Ninguna rifa nueva puede quedar con `draw_at = NULL`.
- `end_date` se deriva siempre de `draw_date` (server-side, en
  `api/rifas/index.js`) — ya no existe el campo duplicado "Término".
- Aviso visible bajo la fecha/hora de sorteo, tanto en creación como en la
  página pública: *"Sorteo automático: puede ejecutarse hasta 5 minutos
  después de la hora indicada."*
- "Depósito por Rifex" eliminado del formulario — `payout_method` fijo a
  `creator_direct`.
- Accesos de navegación al listado público (`/rifas`) ocultos en Home
  (CTA "Ver rifas en vivo" y "Ver rifas públicas") y en el Footer (enlace
  "Rifas" bajo Producto) — la ruta `/rifas` y las páginas `/rifas/[id]`
  **siguen activas** por URL directa, solo se ocultó la navegación.
- Fix de presentación: `end_date` (columna `date`) se formatea con
  `formatDateOnly()` (`src/lib/raffleTime.js`) en vez de
  `new Date(...).toLocaleDateString()`, que interpretaba la fecha como
  medianoche UTC y la corría un día atrás en timezones detrás de UTC. Fix
  puramente de presentación — no toca el valor almacenado.

## Comportamiento legacy (rifas creadas antes de esta promoción)

**Las rifas con `draw_at = NULL` NO participan del scheduler automático de
DRAW.** El scheduler las excluye por construcción (filtra
`draw_at <= now()`, que nunca es verdadero para `NULL`). No hubo ni habrá
backfill — nunca se les asignó ni se les asignará un `draw_at` de forma
retroactiva. Sus páginas públicas no muestran el bloque de estado
DRAW (`Sorteo:`, `Ventas abiertas/cerradas`, aviso T-5) porque ese bloque
solo se renderiza si `draw_at` o `extension_limit > 0` existen.

Verificado en el cierre: las 2 rifas PROD preexistentes
(`e5e735b1…` "venta de pasaje a la serena", `372a033b…` "prueba real")
conservan `draw_at = NULL`, `extension_limit = 0`, `extensions_used = 0`
sin ningún cambio de valor.

## Rollback disponible

`git tag pre-draw-fc3f046` apunta a `fc3f046`, el estado de `main` justo
antes de esta promoción. Las migraciones DRAW son 100% aditivas
(`ADD COLUMN IF NOT EXISTS`, tablas nuevas, funciones `create or replace`)
— un rollback de código a `fc3f046` es seguro sin tocar el schema: las
columnas/tablas nuevas simplemente quedan sin uso. No se documenta ni se
ejecuta ningún procedimiento de rollback de base de datos en este cierre
(no fue necesario).

## Limitaciones conocidas

- Ventana de ejecución del scheduler: 0–5 minutos después de `draw_at`,
  nunca exacta. Una temporización más precisa (para `/tv` u otros usos en
  tiempo real) no está resuelta.
- El guardrail de `.claude/settings.json` que bloquea pushes a `main` no
  atrapaba la variante `git push origin HEAD:main` (ni `<sha>:main`, ni
  otro remoto) — cerrado en DRAW-CLOSE con la regla `git push*:main*`.
- `main` local del repo principal puede quedar detrás de `origin/main`
  después de una promoción por cherry-pick, porque `git merge`/
  `git reset --hard` están bloqueados por diseño (protección deliberada,
  no un bug) y no hay ruta segura automatizada para hacer fast-forward sin
  ellos — requiere una sincronización manual puntual.

## Explícitamente NO implementado (fuera de alcance de este cierre)

`/tv`, Trust Engine, emails T-5, Social Rewards, Argentina como país
operativo, Payment Engine multi-país. Nada de esto se documenta como
implementado ni se promovió a `main`.
