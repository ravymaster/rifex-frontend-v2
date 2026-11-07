# Trust — Roadmap de Implementación

Ninguna etapa de este roadmap fue implementada en esta sesión — es diseño puro, para autorización futura explícita, igual que EVENT-1 requirió su propia autorización antes de programarse.

## TRUST-0 — Investigación y decisiones

- **Alcance**: exactamente lo que esta sesión entregó — diseño, threat model, matriz legal, roadmap. Cero código.
- **Exclusiones**: cualquier implementación.
- **Dependencias**: ninguna.
- **Datos/APIs/UX**: N/A.
- **Seguridad/pruebas**: N/A.
- **Definition of Done**: los 13 documentos de `docs/trust/` existen, son coherentes entre sí, y Rodrigo los revisó — este último paso queda pendiente tras esta sesión.
- **Riesgos**: ninguno técnico — el riesgo es de producto/legal (ver hallazgo de Ley 10.262 en `TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md`).
- **Autorización necesaria**: la que Rodrigo dé para iniciar TRUST-1.
- **Estimación relativa**: completada.

## TRUST-1 — Onboarding universal y estados

**Estado: COMPLETO en `rifex-dev` — migración aplicada, probada en vivo, código empujado a `origin/develop` (commit `6333044`) y desplegado en `rifex-frontend-main`, todo autorizado expresamente por Rodrigo.** Ver el checkpoint completo en `docs/WOP.md`, sección "TRUST-1 checkpoint", para el detalle exacto de archivos, RLS, pruebas en vivo y verificación de despliegue.

- **Alcance real implementado**: tabla `trust_onboarding` (independiente de `users_profile`, RLS default-deny total — decisión final, no la alternativa "extender users_profile" que el roadmap original dejaba abierta, precisamente porque `users_profile` ya permite escritura directa del cliente vía RLS y eso habría dejado `onboarding_completed_at` editable por el cliente); `src/lib/trustOnboardingPolicy.js` (validación pura) + `src/lib/trustOnboardingGate.js` (autoridad server-side, mismo patrón que `countryGate.js`); `GET/POST /api/onboarding/trust/{status,complete}`; página `/registro/continuar`; gate server-side agregado a los 13 endpoints sensibles reales de creación/edición/publicación/administración de Rifas, Colectas y Eventos (lista exacta en el informe de cierre de esta sesión).
- **Exclusiones cumplidas**: sin verificación documental, sin OCR, sin biometría, sin RUT verificado — solo campos declarados.
- **Datos**: tabla nueva, no extiende `users_profile`.
- **Seguridad**: RLS default-deny total (ni siquiera SELECT propio vía PostgREST — todo pasa por las rutas API con `service_role`, más estricto que el patrón de `users_profile`/país).
- **Pruebas**: 29 pruebas reales (`npm test:trust-onboarding`), incluida una prueba adversarial estructural que confirma que ningún campo de estado reservado (`onboarding_completed_at`, `user_id`) puede colarse desde el body del cliente.
- **Compatibilidad con usuarios antiguos**: sin excepción — la ausencia de fila en `trust_onboarding` se trata como incompleto para cualquier cuenta, nueva o antigua, exactamente como exigía el mandato de esta fase.
- **Riesgo de despliegue, ya gestionado**: el código de los 13 endpoints depende de que la tabla `trust_onboarding` exista — la migración se aplicó en `rifex-dev` en la misma secuencia autorizada antes de empujar el código, así que en ningún momento quedó el código en vivo sin la tabla.
- **Verificación en vivo**: dos fixtures desechables `@example.com` (creadas y borradas con `service_role`, cero residuos confirmados) probaron el flujo real contra `rifex-frontend-main` — `403 onboarding_incomplete` real al crear rifas/eventos/colectas con onboarding incompleto, paso libre una vez completo, resumibilidad, idempotencia, y el intento adversarial de inyectar `onboarding_completed_at`/`user_id` confirmado sin efecto. Security Advisor sin hallazgos nuevos tras la migración.
- **Autorización**: Rodrigo autorizó las cuatro acciones (migración en DEV, fixtures, push, deploy DEV) con la palabra "autorizado" tras el checkpoint de Fase 9; todas se ejecutaron y verificaron.
- **Estimación relativa**: completada.

## TRUST-2 — Identidad básica, RUT, teléfono y edad

**Estado: COMPLETO en `rifex-dev`** (2026-08-27, misión "TRUST-2 EN DEV" — autónoma, autorizada de punta a punta por el mandato de esa misión, sin checkpoint intermedio). Migración aplicada, probada en vivo, código empujado a `origin/develop` y desplegado en `rifex-frontend-main`. `origin/main` y PROD intactos.

- **Alcance real implementado**: RUT chileno (`rut_normalized`/`rut_declared_at`, columnas nuevas en la MISMA tabla `trust_onboarding` de TRUST-1 — nunca una tabla aparte, ver razón abajo) con validación de formato y dígito verificador módulo 11 server-side (`src/lib/trustIdentityPolicy.js`), normalización canónica, enmascarado en cualquier respuesta de API, e índice único parcial que impide que dos cuentas declaren el mismo RUT. Requisito de edad 18+ para crear/publicar/recaudar/administrar, calculado siempre server-side desde `birth_date` (ya capturado por TRUST-1 — no se duplicó). Gate superset `assertCreatorEligible` (`src/lib/trustIdentityGate.js`) reemplazó `assertOnboardingComplete` en los mismos 12 endpoints sensibles ya protegidos por TRUST-1 (Rifas/Colectas/Eventos: crear/editar/publicar/staff/tipos de entrada).
- **Por qué se extendió `trust_onboarding` en vez de crear una tabla nueva**: el RUT es identidad básica de la MISMA persona, sobre la MISMA fila que ya tiene TRUST-1 — agregar columnas nuevas hereda automáticamente el RLS default-deny total ya certificado, sin política adicional que escribir ni auditar, y evita un JOIN extra en cada gate.
- **`age_verified`/`identity_verified`/`phone_verified` no existían como columnas al cerrar TRUST-2** — se devolvían como constantes `false` desde `getIdentityStatus`, precisamente para que ningún código de esa fase pudiera escribirlas por error. *(Actualización TRUST-3A: `age_verified`/`identity_verified` ya son columnas reales — el único código que puede escribirlas es la aprobación administrativa manual de `trustIdentityVerificationGate.js`. `phone_verified` sigue sin existir.)*
- **Exclusiones cumplidas**: sin subida de documentos, sin OCR, sin biometría, sin `identity_verified` real — solo RUT y edad declarados.
- **Bug real encontrado adversarialmente y corregido en la misma sesión**: `upsertIdentityRut` usaba `.update()`, que falla en silencio (0 filas afectadas, sin error) si el usuario todavía no tiene fila en `trust_onboarding` (por ejemplo, si llama la API de RUT antes que la de onboarding) — el cliente recibía `200 OK` sin que se guardara nada. Corregido a `.upsert()` con `onConflict: 'user_id'`, mismo patrón que `upsertOnboardingFields`. Regresión agregada a `tests/trustIdentityGate.test.mjs`.
- **Pruebas**: 36 pruebas reales (`npm run test:trust-identity`), incluidas RUT con/sin puntos/guion/espacios, K mayúscula/minúscula, dígito verificador 0, año bisiesto (29-feb-2000), cumple 18 exactamente hoy, cumplirá 18 recién mañana, menor de edad, país distinto de Chile (RUT no exigido), intento adversarial de forzar `age_verified`/`identity_verified`/`user_id` vía el endpoint de RUT (sin efecto).
- **Verificación en vivo en `rifex-dev`** con fixtures desechables `@example.com` (creadas y borradas con `service_role`, cero residuos confirmados): `403 identity_incomplete` real al crear una rifa con RUT pendiente (aislado del gate de país/onboarding); RUT inválido rechazado; RUT válido con distintos formatos de entrada normaliza al mismo valor; `creator_eligible` pasa a `true` solo tras declarar el RUT; declarar después una fecha de nacimiento de menor de edad revierte `creator_eligible` a `false` con el motivo `age_requirement_not_met`, sin afectar `complete` de TRUST-1 (separación de estados correcta); **conflicto real de unicidad de RUT entre dos cuentas distintas confirmado contra el índice único de Postgres** (`409 rut_conflict`, sin revelar de quién es el RUT ya declarado). Security Advisor sin hallazgos nuevos tras la migración.
- **Seguridad**: RLS default-deny heredado sin cambios; RUT nunca expuesto completo en ninguna respuesta (solo enmascarado); `service_role` nunca en el cliente; sin grants nuevos a `PUBLIC`/`anon`/`authenticated`.
- **Definition of Done**: un usuario puede declarar su RUT (validado en formato) y su fecha de nacimiento implica 18+, ambos evaluados server-side — la verificación documental real de `identity_verified` es TRUST-3A, ver esa sección.
- **Riesgos**: bajos, ya mitigados — ver el bug de upsert arriba.
- **Autorización**: cubierta íntegramente por el mandato de la misión "TRUST-2 EN DEV" (auditoría, código, migración, aplicar en DEV, fixtures, push, deploy DEV — todo pre-autorizado explícitamente, sin checkpoint intermedio).
- **Estimación relativa**: completada.

## TRUST-3A — Documentos privados y revisión manual (personas naturales)

**Estado: COMPLETO en `rifex-dev`** (2026-08-27, misión "TRUST-3A EN DEV" — autónoma, pre-autorizada, sin checkpoint intermedio; Rodrigo llegó agotado y pidió explícitamente no ser consultado ese día). Migraciones aplicadas, bucket privado creado y verificado, flujo completo probado en vivo (inicio → carga → envío → corrección → reenvío → aprobación / rechazo), commit empujado y desplegado.

- **Alcance real implementado**: caso de verificación (`trust_identity_verifications`, un caso por usuario, máquina de estados explícita en `src/lib/trustIdentityVerificationPolicy.js`), evidencia documental (`trust_identity_documents`, nunca sobreescrita — reemplazar un lado marca el anterior `superseded`), historial append-only (`trust_identity_audit_log`, con un trigger que rechaza cualquier UPDATE/DELETE de aplicación). Bucket privado `trust-documents` en Supabase Storage (`public: false`, sin ninguna policy de `storage.objects` que lo mencione — RLS default-deny por omisión, exactamente igual que las tablas). Procesamiento defensivo real con `sharp` (`src/lib/trustIdentityDocumentProcessing.js`): magic bytes reales (nunca el Content-Type del cliente), límite explícito de píxeles de entrada, límite de dimensiones, re-encode completo a JPEG (EXIF descartado, orientación normalizada), hash SHA-256 para deduplicación controlada. Cola administrativa (`GET /api/admin/trust/queue`, `GET/POST /api/admin/trust/case/[userId]`) gateada con `resolveAdmin` (`src/lib/adminAuth.js`, `app_metadata.role === 'admin'`) — el mismo primitivo real ya usado por `/api/admin/*`, sin inventar un sistema de roles nuevo. UX del titular en `/trust/verificar` (progreso, previsualización local, motivo de corrección en español, estado enviado/aprobado/rechazado); UX admin mínima en `/panel/admin/trust` (cola) y `/panel/admin/trust/[userId]` (detalle + decisión, con dos confirmaciones explícitas obligatorias antes de aprobar).
- **Alcance de personas y organizaciones, resuelto explícitamente**: `rut_normalized` (TRUST-2) es y sigue siendo exclusivamente el RUN declarado de una persona natural — TRUST-3A nunca lo trata como RUT de una organización. Una cuenta `account_type=organization` recibe "Verificación de organizaciones próximamente" y jamás ve el flujo de cédula personal (`accountTypeSupportsVerification` en la política pura). RUT organizacional, representantes y acreditación de representación quedan reservados para TRUST-4.
- **Efectos de aprobación**: `identity_verified`/`age_verified` (ahora columnas reales en `trust_onboarding`) solo los escribe `recordDecision` (acción `approve`), y solo si el revisor confirmó explícitamente dos casillas — sin OCR, esa confirmación humana ES la verificación real. Rechazo/corrección nunca tocan esos campos, nunca suspenden la cuenta, nunca borran iniciativas ni afectan pagos — solo cambian el estado Trust del caso.
- **Dos niveles, nunca confundidos** (mandato "IMPORTANTE PARA DEV" de esta misión): `creator_eligible_basic` sigue siendo exactamente TRUST-2 (onboarding + 18+ declarado + RUT declarado); `creator_identity_verified` es TRUST-3A real. `isIdentityVerificationRequiredForCreators()` (`trustIdentityVerificationPolicy.js`) sigue en `false` — activar esto es una decisión de negocio explícita y pendiente, no un efecto secundario de haber construido TRUST-3A. `assertCreatorEligible` (TRUST-2) ya lee las columnas reales pero solo las EXIGE si esa constante pasa a `true`.
- **Bug real encontrado adversarialmente y corregido en la misma sesión**: (1) `start.js` seleccionaba `country_code` desde `trust_onboarding` — esa tabla nunca tuvo esa columna (vive en `users_profile`), la consulta fallaba en silencio y **toda persona natural real era rechazada como si fuera una organización**. (2) El trigger de inmutabilidad del audit log bloqueaba el `DELETE` en cascada que Postgres dispara al borrar cualquier `auth.users` con historial — **borrar una cuenta real (fixture, GDPR, lo que sea) era imposible** una vez que tocaba TRUST-3A. Corregido con una segunda migración: el audit log ya no referencia `auth.users` con cascada (el historial sobrevive intencionalmente a la eliminación de la cuenta, que es lo correcto para un registro de auditoría), y `reviewer_id`/`identity_verified_by` pasan a `ON DELETE SET NULL`.
- **Pruebas**: 43 pruebas reales (`npm run test:trust-identity-verification`) — máquina de estados completa, procesamiento de imagen real con `sharp` (JPEG/PNG válidos, texto disfrazado de `.jpg`, PDF real, corrupto, "polyglot" con payload pegado, dimensiones excesivas, EXIF descartado), y el gate mockeado (organización rechazada, upload fuera de estado rechazado, limpieza de Storage si falla el insert, decisión concurrente perdida por UPDATE atómica, auto-aprobación bloqueada, escritura real de `identity_verified`/`age_verified` en aprobación).
- **Verificación en vivo en `rifex-dev`** con fixtures desechables `@example.com` y documentos ficticios generados con `sharp` marcados "DOCUMENTO FICTICIO — SOLO PRUEBA" (borradas después, cero residuos confirmados en las 3 tablas + `auth.users` + `storage.objects`, incluidos los propios registros de auditoría, limpiados como operación DBA explícita que la aplicación nunca puede hacer): flujo feliz completo (inicio → carga ambos lados → envío → cola admin → apertura/reclamo atómico → aprobación con confirmaciones → `identity_verified`/`age_verified` reales en `true`); ciclo de corrección (`correction_required` → reenvío → nueva revisión); rechazo (estado terminal, `identity_verified` nunca se toca); doble decisión concurrente bloqueada por la UPDATE atómica; auto-revisión de un admin sobre su propia cuenta bloqueada (`403 cannot_review_own_case`); acceso anónimo y de otro usuario autenticado al bucket privado confirmado bloqueado **contra Supabase Storage real**, no solo mockeado. Security Advisor: sin hallazgos nuevos.
- **Definition of Done cumplido**: identidad básica declarada (TRUST-2) sigue funcionando igual; RUT se normaliza/valida server-side (sin cambios); mayoría de edad declarada se sigue aplicando; edad e identidad verificadas están separadas de las declaradas Y ahora tienen una vía real de escritura, exclusivamente administrativa; datos privados nunca expuestos (RUT/nombre/nacimiento nunca en API pública, documentos nunca por URL permanente); endpoints sensibles protegidos; ataques directos fallaron todos; RLS y grants verificados (tablas y Storage); fixtures eliminados, cero residuos; tests y build pasan; DEV desplegado.
- **Pendiente explícito, no iniciado en esta fase**: OCR/KYC automatizado, biometría/liveness/face match (TRUST-3B o posterior, si acaso); verificación de organizaciones/RUT tributario/representantes (TRUST-4); canal de apelación real (hoy el rechazo solo muestra un aviso de que existirá más adelante); activación productiva de "identidad verificada obligatoria" (decisión de negocio, no técnica); política definitiva de retención/expiración de documentos (hoy `expires_at` usa un valor provisional de 2 años, sin job de expiración automática ni de purga de Storage); revisión legal formal.
- **Riesgos**: manejo de datos de identidad reales es el mayor salto de superficie de privacidad de todo el roadmap hasta ahora — mitigado con Storage privado real (verificado en vivo, no solo por SQL), URLs firmadas de 120s generadas solo tras autorización, y ningún dato sensible en logs/analytics.
- **Autorización**: cubierta íntegramente por el mandato de la misión "TRUST-3A EN DEV" (auditoría, código, migraciones, bucket, aplicar en DEV, fixtures/documentos ficticios, push, deploy DEV — todo pre-autorizado explícitamente).
- **Estimación relativa**: completada.
- **Estimación relativa**: alta.

## TRUST-4 — Organizaciones

- **Alcance**: cuentas de tipo organización (representante legal, estatutos si aplica), distinción de persona natural vs. jurídica — directamente relevante al hallazgo de Ley 10.262.
- **Exclusiones**: automatización de verificación de personalidad jurídica ante el Ministerio del Interior (fuera del alcance técnico).
- **Dependencias**: TRUST-1 a TRUST-3.
- **Riesgos**: depende de la resolución del hallazgo legal de rifas/colectas (`TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md`, sección 2) — **esta etapa puede cambiar de forma sustancial según lo que determine el abogado**.
- **Autorización necesaria**: explícita, condicionada a la revisión legal previa.
- **Estimación relativa**: media-alta.

## TRUST-5 — Revisión por iniciativa

- **Alcance**: documentos por producto (Rifas/Colectas/Eventos, ver `RIFEX_TRUST_CANONICAL_DESIGN.md`), estado "en revisión" antes de publicar, proporcional al riesgo/monto declarado.
- **Dependencias**: TRUST-1 a TRUST-3.
- **Riesgos**: fricción de UX si se exige revisión completa para iniciativas de bajo riesgo — debe ser proporcional, no uniforme.
- **Autorización necesaria**: explícita.
- **Estimación relativa**: alta.

## TRUST-6 — Denuncias, suspensión y apelación

- **Alcance**: flujo de denuncias, suspensión con doble aprobación, apelación (`TRUST_ROLES_AUTHORIZATION.md`).
- **Dependencias**: TRUST-1 a TRUST-5 (necesita iniciativas reales para tener algo que denunciar).
- **Riesgos**: denuncias maliciosas (amenaza #26), necesita revisión humana disciplinada desde el diseño.
- **Autorización necesaria**: explícita.
- **Estimación relativa**: media.

## TRUST-7 — Motor de riesgo

- **Alcance**: señales explicables, revisión humana obligatoria, sin score numérico público (`RIFEX_TRUST_CANONICAL_DESIGN.md`).
- **Dependencias**: TRUST-1 a TRUST-6 (necesita historial real para tener señales significativas).
- **Riesgos**: falsos positivos (amenaza #25), discriminación algorítmica si las reglas no se auditan con cuidado.
- **Autorización necesaria**: explícita, con revisión de sesgo antes de producción.
- **Estimación relativa**: alta.

## TRUST-8 — Proveedor OCR/KYC opcional

- **Alcance**: integración con un proveedor externo de verificación documental/*liveness* (opción C de `TRUST_AGE_IDENTITY_VERIFICATION.md`), como mejora sobre la revisión manual de TRUST-3, no como reemplazo obligatorio.
- **Dependencias**: TRUST-3.
- **Riesgos**: dependencia externa crítica, manejo de datos biométricos (categoría sensible bajo Ley 21.719) — exige consentimiento explícito y diseño de retención mínima.
- **Autorización necesaria**: explícita, con evaluación de al menos dos proveedores y revisión de sus propias políticas de retención.
- **Estimación relativa**: alta.

## TRUST-9 — Auditoría adversarial y producción

- **Alcance**: exactamente el mismo rigor ya demostrado en `docs/events/EVENT6_SECURITY_AUDIT.md`/`EVENT6_SECURITY_AUDIT_FASE2.md` — pruebas adversariales reales contra un deployment real de Trust en DEV: IDOR, bypass de RLS, escalamiento de roles, fixtures desechables, antes de cualquier promoción a PROD.
- **Dependencias**: todas las etapas anteriores.
- **Definition of Done**: matriz de pruebas con evidencia real, Security Advisor limpio, veredicto GO/NO-GO — mismo formato ya usado en EVENT-6.
- **Autorización necesaria**: explícita, mismo nivel de rigor que la promoción de Eventos.
- **Estimación relativa**: alta.

## Nota sobre estimaciones

Las estimaciones ("baja"/"media"/"alta") son relativas entre etapas, no cifras de tiempo — este roadmap es de alcance y secuencia, no un compromiso de cronograma.
