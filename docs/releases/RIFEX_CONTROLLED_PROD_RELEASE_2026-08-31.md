# RIFEX CONTROLLED PROD RELEASE — 2026-08-31

**Estado: COMPLETO — DESPLEGADO A PROD. `main` = `5145d91`, Vercel PROD sirviendo ese SHA en `rifex.pro`.**

Misión de dos fases (auditoría de solo lectura, luego escritura), cada una autorizada por separado por Rodrigo. Promovió exactamente 4 bloques certificados de `develop` a `main`/PROD, excluyendo explícitamente Difundir iniciativa, TXT V4, MP QUALITY 100, nuevas políticas, Argentina, Stripe real, y cualquier otro trabajo no certificado en `develop`.

## Baseline confirmado

- `origin/main` antes del release: `e7311c1` — ya adelantado desde el `3f3d6c4` documentado en `RIFEX_FULL_PROD_RELEASE_2026-08-30.md` por una etapa posterior no reflejada en `docs/WOP.md` (promovió Trust identity-verification UI/endpoints, un onboarding/bancos anterior, `/trust/verificar`, `/panel/admin/trust/*`, `/seguridad`, `/cumplimiento` estático, columnas país AR2). Ese archivo es exclusivo de `main`, nunca fue mergeado a `develop`.
- `origin/develop` contenía los 4 bloques certificados a promover: Cumplimiento V1 (`59b1aa1`+), Onboarding/Bancos-MP, Events Capacity/Live Attendance (`a9956a2`), Home V1 (`4d59450`).
- La comparación de rango de commits (`git log origin/main..origin/develop`, 60+ commits) resultó ruidosa/engañosa — muchos ya efectivos en `main` bajo otro hash. La comparación de contenido de árbol (`git diff --name-status origin/main..origin/develop`) dio la superficie real y mínima: 75 archivos, de los cuales 65 fueron clasificados como pertenecientes a los 4 bloques certificados.

## Estrategia de promoción

Worktree efímero desde `origin/main` (`git worktree add ... origin/main -b release/rifex-prod-2026-08-30-v2`) — nunca un merge de `develop`, nunca el rango crudo de 60+ commits. Cada bloque promovido con `git checkout origin/develop -- <lista exacta de archivos clasificados>`, un commit por bloque:

1. `ae811c5` — Cumplimiento V1 (C1/C3/C4/C5)
2. `4bbf132` — Onboarding + Bancos/MP
3. `097b0fd` — Events Capacity, Ticket Types & Live Attendance (EVENT-8)
4. `560db7a` — Home V1
5. `5145d91` — `package.json` (solo scripts de test de los 2 primeros bloques)

Ningún archivo fuera de la lista clasificada fue tocado — confirmado por autoaudit final: `git diff --name-status e7311c1..HEAD` produjo exactamente 65 archivos, sin `DevBanner.jsx`/`captchaGate.js`/`_app.js` (wiring DEV)/`login.jsx`/`register.jsx`, sin `webhook.js`. Los 2 archivos exclusivos de `main` (`db/migrations/2026-08-26d5_ar2_country_columns_reconstructed.sql`, `docs/releases/RIFEX_FULL_PROD_RELEASE_2026-08-30.md`) permanecieron intactos por construcción — la estrategia de checkout exacto nunca los referenció ni los pudo borrar.

## Migraciones PROD (5, orden estricto)

Cada una precedida por re-chequeo de drift en vivo (confirmando que el efecto seguía pendiente) y seguida de una verificación de esquema dirigida:

1. `2026-08-30_cumplimiento1_foundation.sql`
2. `2026-08-30_cumplimiento3_communications_and_winner_access.sql`
3. `2026-08-30_cumplimiento4_timeline_and_escalation.sql`
4. `2026-08-30_cumplimiento5_admin_review.sql`
5. `2026-08-30_event8_capacity_live_attendance.sql`

No existe una migración "Cumplimiento-2" — no se inventó ninguna. Las 5 son aditivas por diseño: verificado por grep directo de DDL (`create table|alter table|create index|create trigger`) que cada una toca únicamente sus propios objetos nuevos, nunca `raffles`/`tickets`/`payments`/RLS existente/grants existentes.

## Verificación de integridad post-migración

- RLS habilitado en las 3 tablas nuevas de Cumplimiento y en `events`/`event_ticket_types` (sin cambio).
- Cero grants a `anon`/`authenticated`/`public` en las tablas nuevas.
- Las 6 funciones RPC financieras/de inventario preexistentes confirmadas presentes, sin alteración.
- Conteos de filas financieras intactos antes/después: `raffles`=7, `tickets`=420, `payments`=4.
- El único evento histórico real de PROD recibió `capacity=NULL` — nunca un valor inventado (confirmado también en el smoke post-deploy: `46387a87-00a8-428c-a55b-65b4c4397436`, "RIFEX EVENTS FINANCIAL CERT").
- Compatibilidad código-esquema: el código PROD entonces desplegado (`e7311c1`) siguió respondiendo `200` en `/`, `/eventos`, `/api/rifas` tras aplicar las 5 migraciones — las migraciones aditivas no rompieron el código aún no promovido.

## Tests y build sobre el HEAD exacto a promover

`npm test`: 427 tests, 426 pass, 1 fail — `tests/eventAnalyticsWorkbook.test.mjs`, el caso "20.000/20.000/20.000/500" de `writeBuffer`, excediendo el techo de 20s (reproducido dos veces, 36249ms y 29297ms — mismo flaky de timing bajo carga máxima ya documentado en `docs/events/EVENT5_ANALYTICS_XLSX.md`, no una regresión). `npm run build`: limpio, dos corridas independientes, 54 páginas estáticas generadas ambas veces, incluyendo `/` (Home V1, 6.34 kB) y `/admin/cumplimiento`.

## Promoción Git y despliegue

`git push origin HEAD:main` desde el release branch, HEAD confirmado `5145d91` inmediatamente antes del push, `origin/main` reconfirmado `e7311c1` (sin drift), `git log HEAD..origin/main` vacío (fast-forward válido). Resultado: `e7311c1..5145d91`, fast-forward limpio, sin merge, sin force push.

Desplegado vía la integración GitHub → Vercel ya existente (sin `vercel deploy` manual). Deployment `dpl_CkdCuwLXgLmCMDhjsf2qctE5Vk6V`, proyecto `rifex-frontend-v2`, `target: production`, `status: READY`, creado ~3 min después del push, alias confirmados `rifex.pro` y `www.rifex.pro`.

## Smoke PROD (`rifex.pro`)

Verificado con contenido HTTP real, no solo el estado READY del deployment:

- Hero de Home V1 (copy exacto "Crea eventos, vende entradas digitales y administra campañas de recaudación..."), clases `capCard`/`capabilities`, `<title>` exacto "Rifex — Eventos, entradas y recaudación en línea", imagen del hero real sirviendo `200 image/png` desde `/_next/image`.
- Nav sin "Rifas" (Eventos/Campañas/Cómo funciona/Precios/Seguridad presentes) — Rifas removido solo de Home, no del producto.
- 18 rutas públicas/paneles verificadas en `200`: `/`, `/planes`, `/login`, `/register`, `/onboarding/pais`, `/panel/bancos`, `/eventos`, `/crear-evento`, `/panel/eventos`, `/cumplimiento`, `/rifas`, `/crear-rifa`, `/crear-colecta`, `/wizard`, `/seguridad`, `/mis-iniciativas`, `/terminos`, `/preguntas-frecuentes`.
- Evento histórico real (`capacity=NULL`) verificado en `200` sin mensaje falso de "agotado"/"aforo".
- `/panel/eventos/[id]/scanner` y `/panel/eventos/[id]` responden `200` (shell no autenticado, sin error 500).
- `/api/events/[id]/check-in` responde `401` sin autenticación — correcto, no un error de servidor.
- `/api/rifas`, `/api/events` (listados de solo lectura) responden `200`.

## Restricciones respetadas

Ningún pago real, ninguna preferencia MP real, ningún webhook simulado, ninguna aprobación manual de pago, ningún reembolso, ninguna alteración de orden/ticket real, ningún fixture creado en PROD, ningún email de prueba enviado, ningún cron de Cumplimiento invocado manualmente, ningún check-in real ejecutado durante la verificación de este release.

## No-bloqueantes conocidos, registrados

- Flaky de timing XLSX bajo carga máxima 20k/20k/20k/500 (preexistente, documentado arriba).
- `/cumplimiento` es contenido roadmap ("Próximamente") mientras el motor real de Cumplimiento ya existe en PROD desde este release — un gap de semántica, no un defecto funcional. Diferido explícitamente a una futura misión PUBLIC TRUST/POLICIES, no corregido oportunistamente aquí.
- `merchant_gateways` con grants amplios a anon/authenticated, mitigado por RLS (preexistente, no relacionado a este release).
- MP Quality 89/100 (preexistente).
- Difusión/redes V4 no implementado.
- Revisión legal/de políticas por abogado chileno sigue pendiente.

## Tag

`v2.2-rifex-prod` creado sobre `5145d91`.
