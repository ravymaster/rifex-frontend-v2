Repositorio: rifex-frontend-v2 (Rifex, plataforma de eventos/entradas digitales/campañas — Rifas sigue existiendo como producto autenticado, ya no forma parte del catálogo público).
Remote: https://github.com/ravymaster/rifex-frontend-v2.git.

> 2026-09-03 (actualización más reciente, follow-up) — **blocker
> `/terminos-rifas` resuelto por decisión humana explícita de Rodrigo**:
> se retiró también ahí el banner interno de revisión legal pendiente
> (nunca se declaró revisión ni cumplimiento jurídico, condiciones
> sustantivas intactas y verificadas, deuda real sigue en
> `docs/legal/`). Los dos tests certificados que lo exigían se
> actualizaron. Re-validado: 40/40 + 182/182 + regresión 608/609 (mismo
> flake) + build limpio. Ya no queda ningún blocker abierto de esta
> misión. Detalle: `docs/WOP.md`.
>
> 2026-09-03 — **RIFEX PUBLIC SURFACE
> FINAL CLEANUP, DEV only, misión autónoma.** `origin/develop` avanza
> desde `add98ec`. `origin/main` (PROD) ya no está en `15d7d35` — fue
> promovido por separado a `39b47f5` (tag `v2.5-rifex-prod-auth-crawler`),
> confirmado sin cambios adicionales aquí. Cierra defectos públicos/
> jurídicos/crawler reales tras una auditoría externa conservadora
> (~84/100), sin intentar maximizar artificialmente ningún puntaje.
> 3 defectos P0 confirmados: banner interno "PENDIENTE DE REVISIÓN POR
> ABOGADO CHILENO ANTES DE PROD" visible en `/reglas-iniciativas-premio`
> (corregido) y también en `/terminos-rifas` (encontrado pero **NO
> corregido** — contradice dos tests certificados de STAGE2-REPAIR que
> exigen deliberadamente conservarlo ahí; revertido a baseline, dejado
> como blocker real para decisión explícita de Rodrigo); placeholder
> "Identidad legal completa del operador: pendiente de confirmación."
> en `/contacto` (página pública indexable) — eliminado sin inventar
> identidad. `/rifas`: se mantuvo la decisión de producto ya certificada
> (redirect a `/login`, no 410 — esa recomendación externa no estaba
> preaprobada), pero se corrigió que el redirect era solo client-side;
> ahora es un `getServerSideProps` real (307 verificado con curl sin JS).
> `/campanas` (reportado 404 externamente): causa real era que
> "Campañas" en el navbar apuntaba directo a `/crear-colecta` (auth
> boundary) — un anónimo recibía un login wall sin contexto. Se
> reutilizó el explicador de campañas ya certificado dentro de `/wizard`
> (`?modo=colecta`) en vez de duplicar una landing nueva. Además: JSON-LD
> Organization+WebSite nuevo en Home (solo hechos verificables, sin
> aggregateRating/address/sameAs inventados), 4 headers de seguridad de
> bajo riesgo en `next.config.mjs` (X-Content-Type-Options, Referrer-
> Policy, X-Frame-Options, Permissions-Policy con camera/clipboard-write
> explícitamente permitidos para el scanner QR y compartir colecta —
> CSP explícitamente no tocada), lenguaje de Trust en `/confianza`
> ajustado a la formulación cuidadosa ya aprobada de `/seguridad`, grafo
> público de Rifas verificado correctamente acotado (un solo enlace
> legítimo desde `/reembolsos`), clasificación robots/noindex/sitemap
> completa sin regresiones, no-cloaking verificado en vivo (MD5 idéntico
> Googlebot/Meta/TikTok/normal). 38 tests nuevos en
> `publicSurfaceFinalCleanup.test.mjs` (180/180 junto con
> authUxCrawler+publicAudit), regresión completa 606/607 (mismo flake
> XLSX conocido), build limpio, self-audit sin coincidencias reales.
> Deuda real pendiente: decisión de Rodrigo sobre el banner de
> `/terminos-rifas`; el resto queda como deuda jurídica ya trackeada en
> `docs/legal/`, no resuelta por esta misión. Detalle completo:
> `docs/WOP.md`, "RIFEX PUBLIC SURFACE FINAL CLEANUP (2026-09-03) — DEV
> only, autonomous mission".
>
> 2026-09-02 — **RIFEX AUTH UX 2026 +
> CRAWLER SURFACE CLEANUP, DEV only.** `origin/develop` avanza desde
> `9875ef0`. Modernización visual de Login/Register (copy neutral,
> componente compartido `AuthShell` solo de presentación) + limpieza de
> navbar público (sin "Crear una iniciativa", "Ingresar" en vez de
> "Iniciar sesión", menú central centrado vía grid en desktop) + cierre
> de una fuga real encontrada en auditoría: `/crear-rifa`,
> `/crear-colecta` (destino real del enlace público "Campañas") y
> `/crear-evento` rendereaban sus formularios completos de creación en
> el HTML inicial para cualquier anónimo o crawler, y `/panel`
> rendereaba su shell interno completo — solo había un `useEffect`
> client-side. Corregido con `getServerSideProps` + `getSupabaseServer`
> (infraestructura ya existente) en los 5 puntos afectados; verificado
> en vivo: los 5 devuelven `307` real a `/login?next=...` para
> anónimos. Cero cambios de lógica de Auth, cero cloaking (nada
> bifurca por User-Agent). 21 tests nuevos, 142/142 junto con
> publicAudit, regresión 568/569 (flake XLSX ya conocido), build
> limpio. **`origin/main` (PROD) confirmado sin tocar, sigue en
> `15d7d35`.** Detalle completo: `docs/WOP.md`, "RIFEX AUTH UX 2026 +
> CRAWLER SURFACE CLEANUP (2026-09-02) — DEV only".
>
> 2026-09-01 — **RIFEX STAGE 2: último
> bloqueo público resuelto — CERO bloqueos de identidad pública
> conocidos.** `origin/develop` en `0244d7b`. La revisión humana final
> de STAGE 2 FINAL encontró que `/wizard` ("Cómo funciona") seguía
> exponiendo públicamente el flujo completo de Rifas (crear rifa,
> precio/cantidad de números, sorteo, premio, ganador, CTA "Crear mi
> rifa"). Corregido: `/wizard` ahora representa exclusivamente Eventos
> + Campañas — "Quiero crear un evento" (pasos reales: tipos de
> entrada, QR, scanner/check-in, CTA → `/crear-evento`) y "Quiero crear
> una campaña" (CTA → `/crear-colecta`); metadata sin ninguna mención
> de rifa/sorteo/premio. **Rifas NO se eliminó del producto** —
> `crear-rifa.jsx`, el panel de Rifas y `/mis-iniciativas` (que sigue
> listando Rifas/Campañas/Eventos) quedaron intactos; el cambio es
> exclusivamente de la superficie pública de `/wizard`. 548 tests (1
> flake XLSX pre-existente, no relacionado), build limpio. **PROD
> (`main`) sigue sin tocar**, en `a2d6a60`. **Siguiente paso: promoción
> controlada a PROD, sujeta al GO explícito de Rodrigo/Doris —
> todavía no autorizada.** Detalle completo en `docs/WOP.md`, "RIFEX
> STAGE 2 — ÚLTIMO BLOQUEO PRE-PROD: /wizard (2026-09-01)".
>
> 2026-09-01 — **RIFEX STAGE 2 FINAL:
> ETAPA 2 (identidad pública + políticas) queda funcionalmente
> CERRADA en DEV**, `origin/develop` en `e00da51`. Revisión humana
> (Rodrigo + Doris) completada sobre las misiones anteriores
> (ETAPA 2, STAGE 2 REPAIR) y todos los defectos reales encontrados
> fueron corregidos en esta sesión final: `/terminos` separado de las
> condiciones históricas de Rifas (movidas verbatim a
> `/terminos-rifas`, mismos anchors, sin romper ninguna aceptación
> contractual real), sin resúmenes duplicados de Privacidad/Cookies,
> sin tope de responsabilidad no revisado legalmente; `/seguridad` y
> `/preguntas-frecuentes` con lenguaje neutral y consistente entre sí;
> metadata pública certificada superficie por superficie (título,
> description, canonical, robots, OG) — canonical siempre resuelve a
> `https://rifex.pro` (nunca al dominio Vercel), ninguna description
> filtra Rifas/sorteo/premio; se encontró y corrigió el mismo bug real
> de colisión de `key` de Next 14.2.32 en `/planes` y `/wizard`
> (tenían su propio `<Head>` en paralelo al de `Layout`); Blog
> re-certificado como privado (noindex/nofollow/noarchive, fuera de
> sitemap, fuera de toda navegación). 543 tests (1 flake XLSX
> pre-existente, no relacionado), build limpio. **PROD (`main`) NO fue
> tocado en ningún momento de esta sesión** — sigue en `a2d6a60`.
> **Siguiente paso: promoción controlada a PROD, sujeta al GO
> explícito de Rodrigo/Doris — todavía no autorizada.** Detalle
> completo en `docs/WOP.md`, "RIFEX STAGE 2 FINAL — CIERRE ETAPA 2 /
> PRE-PROD (2026-09-01)". Hallazgo pendiente sin resolver (fuera del
> alcance de esta sesión, no tocado): el cuerpo de `/wizard` incluye
> una guía paso a paso en modo "rifa" con terminología específica de
> Rifas — solo se corrigió su metadata, el contenido del cuerpo queda
> como riesgo a decidir por Rodrigo antes de promover a PROD.
>
> 2026-08-24: este prompt fue actualizado para el handoff Santiago → Antofagasta
> tras EVENT-3. La rama activa de trabajo es `develop` (no `main` — `main` es
> PROD, congelado respecto de Eventos). El texto verbatim de abajo es el mismo
> guardado en `docs/WOP.md`, sección "RIFEX CURRENT STATE" → "Reentry Prompt" —
> mantenerlos idénticos si se edita alguno.
>
> 2026-08-29 (actualización más reciente) — **auditoría adversarial
> autónoma (solo lectura, sin correcciones aplicadas)** de TRUST-1/2/3A
> y del onboarding Mercado Pago. Encontró un **fail-open CRÍTICO real y
> demostrado**: `assertCreatorEligible` trata `mp_identity_match=NULL`
> (un estado alcanzable en la práctica: `oauth/callback.js` fija
> `status='connected'` antes de que una llamada separada, que traga sus
> propios errores, resuelva el match) exactamente igual que `'matched'`
> — mientras `getIdentityStatus` sí reporta correctamente no-elegible
> para el mismo dato. Reproducido con una prueba local aislada, ahora
> permanente en `tests/trustIdentityGate.test.mjs`. También encontrado:
> la política de `unavailable` no dirige a revisión como pide esta
> auditoría (decisión de producto pendiente, no un bug); el callback de
> Mercado Pago loguea un secreto PKCE + email en un caso de borde; un
> `mismatch` posterior a publicar no pausa el checkout; los 3 endpoints
> de subida de fotos no exigen elegibilidad. Detalle completo en
> `docs/trust/TRUST_MP_ADVERSARIAL_AUDIT_2026-08.md`. Veredicto:
> **GO CON CONDICIONES** — el hallazgo crítico debería corregirse antes
> de pruebas humanas con cuentas reales. 175/175 pruebas pasan. Cero
> código de producción, migraciones o datos de DEV modificados —
> misión de auditoría pura.
>
> 2026-08-27/28 (actualización anterior) — corrección canónica
> hacia adelante: **Mercado Pago como control principal, onboarding
> simplificado. COMPLETO en DEV**, misión nocturna autónoma (Rodrigo
> durmiendo, solo permisos del sistema, sin pruebas manuales pedidas).
> No se revirtió ningún commit ni migración — solo aditivo/correctivo.
> Fecha de nacimiento eliminada por completo (confirmado 0 filas reales
> antes de borrar la columna) — reemplazada por `adult_declared`
> (booleano versionado, nunca `age_verified`). El selector
> `account_type` reemplazado por `person_name`/`organization_name`
> (exactamente uno lleno, derivado server-side) — `legal_name`
> eliminado (también 0 filas reales). Teléfono simplificado a un
> widget chileno de 9 dígitos. Mercado Pago pasa a ser el control
> principal que cierra el onboarding: `merchant_gateways` gana
> `mp_identity_match` + un índice único real que impide que una misma
> cuenta de Mercado Pago habilite dos cuentas Rifex activas;
> `assertCreatorEligible` ahora también exige, para Chile, Mercado Pago
> conectado con titular coincidente (o `unavailable`, que nunca
> bloquea). Auditoría real de Mercado Pago
> (`docs/trust/MP_IDENTITY_MATCH_AUDIT.md`): no se pudo confirmar en
> vivo si `/users/me` entrega RUT para Chile — documentación oficial
> bloqueada, sin credenciales de Mercado Pago en este entorno — el
> código quedó defensivo, nunca inventa una coincidencia. TRUST-3A
> sigue como respaldo excepcional, nunca el flujo normal. Probado en
> vivo con dos fixtures desechables `@example.com` (borradas después,
> cero residuos): `403 mp_not_connected` aislado, estados
> `matched`/`mismatch`/`unavailable`/`disconnected` simulados vía
> fixtures produjeron el comportamiento correcto, índice único real de
> `mp_user_id` disparado correctamente. Security Advisor sin hallazgos
> nuevos. 15 pruebas nuevas + regresión completa (174/174) + build
> limpios. Commit `0cc59dc` empujado a `origin/develop`;
> `rifex-frontend-main` re-desplegado automáticamente. También se
> agregó `/seguridad` (página pública, enlazada desde el footer),
> `docs/trust/META_ANTIFRAUD_STATEMENT.md`, "Términos del Creador"
> ampliado sustancialmente (marcado pendiente de revisión por abogado
> chileno antes de PROD), y se registró la decisión de 2FA (opcional
> para creadores, pendiente como obligatorio para admins antes de
> producción). PROD y `main` intactos. **Limitación real: el
> comportamiento verdadero de `/users/me` de Mercado Pago para Chile
> nunca se confirmó en vivo — falta hacerlo con credenciales reales.**
>
> 2026-08-27 (actualización anterior) — TRUST-3A (verificación
> documental de identidad, revisión manual, solo personas naturales)
> **COMPLETO en DEV**, misión autónoma pre-autorizada de punta a punta
> (Rodrigo llegó agotado de un viaje y pidió explícitamente no ser
> consultado ese día). Tablas nuevas `trust_identity_verifications`/
> `trust_identity_documents`/`trust_identity_audit_log` (append-only,
> trigger de base bloquea UPDATE/DELETE de aplicación) + bucket privado
> `trust-documents` (sin ninguna policy que lo mencione — default-deny
> confirmado en vivo contra `anon`/`authenticated` reales, no solo por
> SQL). Pipeline defensivo real con `sharp` (magic bytes, límites de
> píxeles/dimensión, re-encode completo, EXIF descartado, hash SHA-256).
> La cola de revisión reutiliza `resolveAdmin` — sin inventar un sistema
> de roles nuevo. `identity_verified`/`age_verified` ya son columnas
> reales, escribibles solo por una aprobación administrativa con dos
> confirmaciones humanas explícitas (no hay OCR). La activación
> obligatoria de identidad verificada para crear/publicar sigue apagada
> — decisión de negocio pendiente. Organizaciones quedan explícitamente
> fuera, reservadas para TRUST-4. Dos bugs reales encontrados
> adversarialmente y corregidos en la misma sesión: `start.js`
> consultaba una columna `country_code` inexistente en `trust_onboarding`
> (rechazaba a toda persona real como si fuera organización), y el
> trigger de inmutabilidad del audit log bloqueaba el borrado en cascada
> legítimo al eliminar cualquier usuario con historial TRUST-3A
> (corregido con una migración de seguimiento). Probado en vivo con
> cuatro fixtures desechables `@example.com` y documentos ficticios
> marcados "DOCUMENTO FICTICIO — SOLO PRUEBA" (borradas después, cero
> residuos en todas las tablas + `auth.users` + `storage.objects`).
> Security Advisor sin hallazgos nuevos. 43 pruebas nuevas + regresión
> completa (143/143) + build limpios. Commit `f2f018b` empujado a
> `origin/develop`; `rifex-frontend-main` re-desplegado automáticamente.
> **Sin job de retención/purga automática todavía — los documentos
> quedan en Storage indefinidamente, brecha real reconocida.** PROD y
> `main` intactos. **TRUST-3B/TRUST-4 en adelante siguen sin
> autorizar.**
>
> 2026-08-27 (actualización anterior) — TRUST-2 (identidad básica
> declarada: RUT chileno + edad 18+) **COMPLETO en DEV**, misión
> autónoma pre-autorizada de punta a punta (sin checkpoint intermedio,
> a diferencia de TRUST-1 — Rodrigo llegó agotado tras 500 km y pidió
> explícitamente no ser consultado ese día; pruebas humanas de interfaz
> quedan agendadas para el fin de semana). Agrega `rut_normalized`/
> `rut_declared_at` a la MISMA fila `trust_onboarding` de TRUST-1
> (nunca una tabla nueva), validación de RUT con dígito verificador
> módulo 11 y enmascarado en `src/lib/trustIdentityPolicy.js`, gate
> superset `assertCreatorEligible` (`src/lib/trustIdentityGate.js`) que
> reemplazó `assertOnboardingComplete` en los mismos 12 endpoints
> sensibles ya protegidos por TRUST-1 — ahora también exige 18+
> declarado y, solo para Chile, un RUT declarado con formato válido.
> `age_verified`/`identity_verified`/`phone_verified` no existen como
> columnas — siempre `false` desde la API, nada en TRUST-2 puede
> escribirlas. Un bug real (`.update()` en vez de `.upsert()`, fallaba
> en silencio si el usuario no tenía fila previa) se encontró
> adversarialmente en DEV y se corrigió en la misma sesión. Probado en
> vivo con dos rondas de fixtures desechables `@example.com` (borradas
> después, cero residuos): `403 identity_incomplete`/
> `age_requirement_not_met` reales, y un `409 rut_conflict` real contra
> el índice único de Postgres entre dos cuentas distintas. Security
> Advisor sin hallazgos nuevos. 36 pruebas nuevas + regresión completa +
> build limpios. Commit `5fa5bd4` empujado a `origin/develop`;
> `rifex-frontend-main` re-desplegado automáticamente. Se registró un
> nuevo ítem de backlog de Eventos (`docs/events/EVENTS_BACKLOG.md` — QR
> promocional descargable por evento) solo como documentación, sin
> iniciar EVENT-7. PROD y `main` intactos. **TRUST-3 en adelante sigue
> sin autorizar.**
>
> 2026-08-26 (actualización anterior) — TRUST-1 (onboarding
> universal) **COMPLETO en DEV, autorizado y ejecutado de punta a
> punta por Rodrigo**: tabla nueva `trust_onboarding` (RLS default-deny
> total, sin acceso de cliente en absoluto), `src/lib/
> trustOnboardingPolicy.js`/`trustOnboardingGate.js`, endpoints
> `GET/POST /api/onboarding/trust/*`, página `/registro/continuar`, y
> bloqueo server-side agregado a 13 endpoints sensibles reales de
> Rifas/Colectas/Eventos. 29 pruebas reales pasan, incluida una prueba
> adversarial que confirma que el cliente nunca puede colar
> `onboarding_completed_at` por la API. Migración `db/migrations/
> 2026-08-26e_trust1_onboarding.sql` **aplicada en `rifex-dev`** y
> verificada (RLS activo, cero grants a anon/authenticated/PUBLIC).
> Probada en vivo con dos fixtures desechables `@example.com` (borradas
> después, cero residuos): `403 onboarding_incomplete` real confirmado
> en rifas/eventos/colectas con onboarding incompleto, y paso libre del
> gate una vez completo. Security Advisor sin hallazgos nuevos.
> Regresión completa limpia. Commit `6333044` empujado a
> `origin/develop`; `rifex-frontend-main` re-desplegado automáticamente
> (`dpl_HNT2giXgFCAdwpSmqtLN2kgM4QSy`). PROD y `main` intactos.
> **TRUST-2 en adelante sigue sin autorizar.**
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
Confirma que EVENT-4 y EVENT-5 están DONE y CERTIFICADOS, y que EVENT-6 Fases 1 y 2 (auditoría autónoma) están COMPLETADAS con veredicto GO — revisa si el hallazgo crítico de create_tickets_for_raffle ya fue verificado/corregido en PROD (acción urgente, solo desde el PC de escritorio en Santiago, ver docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md). Confirma también que Rifex Trust TRUST-1, TRUST-2, TRUST-3A, y la corrección canónica de Mercado Pago como control principal (onboarding sin fecha de nacimiento, con persona/organización derivado, y con coincidencia RUT↔Mercado Pago) están COMPLETOS en rifex-dev (código, migraciones aplicadas, bucket privado, pruebas en vivo, deploy) — TRUST-3B/TRUST-4 en adelante (OCR, biometría, organizaciones, apelaciones, retención) sigue siendo diseño puro, sin implementar. Verifica con credenciales reales de Mercado Pago si /users/me realmente entrega identificación para Chile (docs/trust/MP_IDENTITY_MATCH_AUDIT.md) — nunca se confirmó en vivo. Confirma si ya se hicieron las pruebas humanas de interfaz de todo lo anterior, agendadas para el fin de semana del 2026-08-27 en adelante. NEXT es EVENT-7, todavía sin alcance ni autorización.
Confirma si la rotación de la contraseña de rifex-dev ya se hizo (WOP, Risks/pending y "NEXT (exact)").
No modifiques código todavía.
Entrégame un REENTRY REPORT (branch, HEAD, origin/develop, origin/main, git status, resumen EVENT-1/2/3/4/5, riesgos pendientes, NEXT) y detente ahí.
```
