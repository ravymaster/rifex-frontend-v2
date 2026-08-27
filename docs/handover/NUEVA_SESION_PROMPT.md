Repositorio: rifex-frontend-v2 (Rifex, plataforma de rifas/campañas/eventos).
Remote: https://github.com/ravymaster/rifex-frontend-v2.git.

> 2026-08-24: este prompt fue actualizado para el handoff Santiago → Antofagasta
> tras EVENT-3. La rama activa de trabajo es `develop` (no `main` — `main` es
> PROD, congelado respecto de Eventos). El texto verbatim de abajo es el mismo
> guardado en `docs/WOP.md`, sección "RIFEX CURRENT STATE" → "Reentry Prompt" —
> mantenerlos idénticos si se edita alguno.
>
> 2026-08-26 (actualización más reciente) — TRUST-1 (onboarding
> universal) **completo en código, migración local sin aplicar**: tabla
> nueva `trust_onboarding` (RLS default-deny total, sin acceso de
> cliente en absoluto), `src/lib/trustOnboardingPolicy.js`/
> `trustOnboardingGate.js`, endpoints `GET/POST /api/onboarding/trust/*`,
> página `/registro/continuar`, y bloqueo server-side agregado a 13
> endpoints sensibles reales de Rifas/Colectas/Eventos. 29 pruebas reales
> pasan, incluida una prueba adversarial que confirma que el cliente
> nunca puede colar `onboarding_completed_at` por la API. Regresión
> completa limpia. Migración `db/migrations/2026-08-26e_trust1_
> onboarding.sql` escrita y revisada, **no aplicada** — pendiente de
> autorizaciones explícitas y separadas de Rodrigo (aplicar en
> `rifex-dev`, fixtures si son indispensables, push, deploy DEV).
> Desplegar el código sin la migración rompe la creación/publicación
> para todos (falla cerrada por diseño) — deben ir juntos. **TRUST-2 en
> adelante sigue sin autorizar.**
>
> 2026-08-26 (actualización anterior) — Diseño completo de **Rifex
> Trust** entregado (12 documentos en `docs/trust/`, cero código, cero
> implementación) + handoff completo notebook→escritorio
> (`docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md`). Hallazgo
> legal más relevante: las rifas/colectas de personas naturales chilenas
> existen en una zona gris real bajo la Ley 10.262 (juegos de azar,
> normalmente solo autorizables a personas jurídicas sin fines de lucro)
> — requiere abogado, es prioridad 1 en
> `docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md`. La vulnerabilidad crítica
> de `create_tickets_for_raffle` (EVENT-6 Fase 2) sigue **pendiente de
> verificar/corregir en PROD, exclusivamente desde el PC de escritorio en
> Santiago** — ver el handoff, sección 5, con el procedimiento seguro
> exacto. Ningún código, SQL, Supabase ni Vercel fue tocado en esta
> sesión — solo documentación. EVENT-7 y la implementación de Trust
> (TRUST-1 en adelante) siguen NO AUTORIZADOS.
>
> 2026-08-26 (actualización anterior) — EVENT-6 Fase 2 (auditoría de
> los 16 WARN heredados de Rifas/Auth) **COMPLETADA — hallazgo CRÍTICO
> real corregido**: `create_tickets_for_raffle`, función legacy sin
> migración versionada, `SECURITY DEFINER`, sin ningún chequeo de
> ownership, con `EXECUTE` otorgado a `PUBLIC`, permitía a CUALQUIER
> visitante anónimo mintear tickets reales en cualquier rifa ajena —
> demostrado en vivo (5 tickets insertados en una rifa de prueba ajena
> con solo la clave `anon` pública) y corregido en `rifex-dev`
> (verificado: el mismo ataque post-fix devuelve `401`, 0 tickets).
> **Esta función es anterior al fork DEV/PROD — es muy probable que la
> misma vulnerabilidad exista en PROD ahora mismo** — marcado como
> urgente para Rodrigo, independiente de la decisión de promoción de
> Eventos (esta sesión no tiene acceso a PROD). De los otros 15 WARN
> heredados: 8 son falsos positivos genuinos (4 funciones trigger,
> probadas en vivo — PostgREST nunca expone funciones `RETURNS trigger`
> como RPC, `404` en las 4), 6 corregidos como defensa en profundidad (5
> con `search_path` mutable de bajo riesgo, 2 con un grant innecesario
> donde un intento real de IDOR fue bloqueado por RLS misma, no
> explotable), 1 dejado como pendiente administrativo de Auth. Security
> Advisor: 22 → 16 → **1** (puramente administrativo). Cero archivos de
> `src/` modificados. Paquete completo de promoción a PROD preparado
> (commits, migraciones pendientes, variables, plan de rollback,
> acciones de Rodrigo) pero **no ejecutado** — ver
> `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md`. **EVENT-7 sigue NO
> AUTORIZADO.**
>
> 2026-08-26 (actualización anterior) — EVENT-6 Fase 1 (auditoría
> autónoma de seguridad/regresión de EVENT-1..5) **COMPLETADA**: matriz
> auth/IDOR, RLS/grants/Security Advisor, invariantes, concurrencia real
> (10 emisiones simultáneas → exactamente 3 tickets; 15 check-ins
> simultáneos al mismo QR → exactamente 1 pass), entradas adversariales y
> regresión, todo contra el deployment real de Vercel DEV y `rifex-dev`
> reales. 30/31 pruebas PASS (la única "falla" fue una expectativa de
> test incorrecta, no un defecto). Dos hallazgos reales de bajo riesgo
> del Security Advisor corregidos como defensa en profundidad —
> verificado en vivo que ninguno era explotable antes del fix
> (`search_path` mutable en 6 RPCs no-DEFINER; falta de `revoke`
> explícito en `events`/`event_ticket_types`, probado con un intento de
> escritura anónima real contra un evento real que ya afectaba 0 filas
> antes de corregir). Cero código de aplicación modificado — solo una
> migración aditiva. Ver `docs/events/EVENT6_SECURITY_AUDIT.md`. Fixture
> creado y eliminado por completo (0 filas residuales verificadas); el
> fixture real de EVENT-5 quedó intacto. **Veredicto: GO para EVENT-1..5
> en DEV — la promoción a PROD sigue siendo decisión de Rodrigo.
> EVENT-7 NO AUTORIZADO.**
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
> 2026-08-26 (actualización final) — EVENT-5 **CERTIFICADO**. Verificado
> en vivo contra el deployment real de Vercel DEV (`rifex-frontend-main`)
> y `rifex-dev`: fixture real creado vía RPCs y endpoints HTTP reales
> (incluyendo un `approved_unfulfilled` real por el camino de pago tardío
> ya certificado en EVENT-2), 17/17 pruebas HTTP reales PASS
> (autorización, cifras). **Rodrigo aceptó EVENT-5 manualmente y en
> forma funcional**: dashboard correcto, XLSX descargado de DEV real,
> archivo abrió bien, cifras coincidentes. Una auditoría visual
> independiente del archivo descargado encontró defectos reales
> (columnas de comprador/staff superpuestas o cortadas, montos CLP sin
> formato, encabezados técnicos crudos) — corregidos con evidencia real
> (commit `0f9ab01`): anchos + `wrapText`, formato `$` en montos (sin
> alterar el valor numérico), encabezados renombrados, "Ingresadas" →
> "Ingresadas válidas". 31/31 tests + build + regresión EVENT-4 PASS,
> reconfirmado en un archivo real re-descargado del deployment
> redesplegado. `maxDuration` real confirmado en 300s (Fluid Compute,
> default de Vercel en todo plan). El fixture de `rifex-dev` no se
> eliminó. **EVENT-6 sigue NO AUTORIZADO.**
>
> 2026-08-26 — EVENT-5 (analytics + reporte Excel) **IMPLEMENTADO** —
> dashboard organizer-only + export XLSX de 5 hojas (`exceljs` 4.4.0, única
> dependencia instalada), corrigiendo dos errores del diseño inicial antes
> de programar: `approved_unfulfilled` es dinero real ya cobrado por
> Mercado Pago (incluido en "aprobada total"/comisión, excluido solo de
> "cumplida"), y un ticket `void` puede tener `used_at` no nulo
> (`void_event_ticket` nunca lo protege ni lo limpia — categoría propia
> "Anuladas usadas antes de anularse", nunca oculta). 25/25 tests reales
> PASS (`npm run test:event-analytics`), `npm run build` PASS, regresión
> EVENT-4 (`test:scanner-controller`) 4/4 PASS sin cambios. Hallazgo de
> rendimiento real encontrado y corregido en la propia sesión: la prueba
> de estrés a los 4 límites máximos (20.000/20.000/20.000/500) tardaba
> ~29-30s por reconstruir `Intl.DateTimeFormat` en cada celda; cacheado
> por timezone, baja a ~15s reales. Sin migración nueva — puramente
> aditivo sobre el esquema EVENT-1/2/3/4 ya existente. **Nota**: en su
> momento esto quedó pendiente de confirmación real en navegador — ver el
> addendum más arriba ("actualización final"), que registra la
> certificación real completa (aceptación de Rodrigo + fixes visuales).
> Este bloque queda solo como historial de la primera implementación.
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
Verifica: git fetch, HEAD real de develop (debe incluir EVENT-5 sobre EVENT-4/c32713e, o un descendiente), origin/main (c944bb3 o su descendiente — si cambió, alerta antes de seguir), git status.
Reconstruye el estado real de EVENT-1/EVENT-2/EVENT-3/EVENT-4/EVENT-5 a partir del repo, no de esta instrucción.
Confirma que EVENT-4 y EVENT-5 están DONE y CERTIFICADOS, y que EVENT-6 Fases 1 y 2 (auditoría autónoma) están COMPLETADAS con veredicto GO — revisa si el hallazgo crítico de create_tickets_for_raffle ya fue verificado/corregido en PROD (acción urgente, solo desde el PC de escritorio en Santiago, ver docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md). Confirma también que el diseño de Rifex Trust (docs/trust/) está completo pero sin implementar — NEXT es EVENT-7, todavía sin alcance ni autorización.
Confirma si la rotación de la contraseña de rifex-dev ya se hizo (WOP, Risks/pending y "NEXT (exact)").
No modifiques código todavía.
Entrégame un REENTRY REPORT (branch, HEAD, origin/develop, origin/main, git status, resumen EVENT-1/2/3/4/5, riesgos pendientes, NEXT) y detente ahí.
```
