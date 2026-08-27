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
- **`age_verified`/`identity_verified`/`phone_verified` no existen como columnas** — TRUST-2 los devuelve como constantes `false` desde `getIdentityStatus`, precisamente para que ningún código de esta fase pueda escribirlos por error. TRUST-3+ agregará las columnas reales cuando exista una verificación documental de verdad.
- **Exclusiones cumplidas**: sin subida de documentos, sin OCR, sin biometría, sin `identity_verified` real — solo RUT y edad declarados.
- **Bug real encontrado adversarialmente y corregido en la misma sesión**: `upsertIdentityRut` usaba `.update()`, que falla en silencio (0 filas afectadas, sin error) si el usuario todavía no tiene fila en `trust_onboarding` (por ejemplo, si llama la API de RUT antes que la de onboarding) — el cliente recibía `200 OK` sin que se guardara nada. Corregido a `.upsert()` con `onConflict: 'user_id'`, mismo patrón que `upsertOnboardingFields`. Regresión agregada a `tests/trustIdentityGate.test.mjs`.
- **Pruebas**: 36 pruebas reales (`npm run test:trust-identity`), incluidas RUT con/sin puntos/guion/espacios, K mayúscula/minúscula, dígito verificador 0, año bisiesto (29-feb-2000), cumple 18 exactamente hoy, cumplirá 18 recién mañana, menor de edad, país distinto de Chile (RUT no exigido), intento adversarial de forzar `age_verified`/`identity_verified`/`user_id` vía el endpoint de RUT (sin efecto).
- **Verificación en vivo en `rifex-dev`** con fixtures desechables `@example.com` (creadas y borradas con `service_role`, cero residuos confirmados): `403 identity_incomplete` real al crear una rifa con RUT pendiente (aislado del gate de país/onboarding); RUT inválido rechazado; RUT válido con distintos formatos de entrada normaliza al mismo valor; `creator_eligible` pasa a `true` solo tras declarar el RUT; declarar después una fecha de nacimiento de menor de edad revierte `creator_eligible` a `false` con el motivo `age_requirement_not_met`, sin afectar `complete` de TRUST-1 (separación de estados correcta); **conflicto real de unicidad de RUT entre dos cuentas distintas confirmado contra el índice único de Postgres** (`409 rut_conflict`, sin revelar de quién es el RUT ya declarado). Security Advisor sin hallazgos nuevos tras la migración.
- **Seguridad**: RLS default-deny heredado sin cambios; RUT nunca expuesto completo en ninguna respuesta (solo enmascarado); `service_role` nunca en el cliente; sin grants nuevos a `PUBLIC`/`anon`/`authenticated`.
- **Definition of Done**: un usuario puede declarar su RUT (validado en formato) y su fecha de nacimiento implica 18+, ambos evaluados server-side — pero sigue sin existir `identity_verified` documental real, que es exclusivamente TRUST-3.
- **Riesgos**: bajos, ya mitigados — ver el bug de upsert arriba.
- **Autorización**: cubierta íntegramente por el mandato de la misión "TRUST-2 EN DEV" (auditoría, código, migración, aplicar en DEV, fixtures, push, deploy DEV — todo pre-autorizado explícitamente, sin checkpoint intermedio).
- **Estimación relativa**: completada.

## TRUST-3 — Documentos privados y revisión manual

- **Alcance**: subida de documento de identidad, *storage* privado con URLs firmadas, cola de revisión manual, panel mínimo para `trust_reviewer`.
- **Exclusiones**: OCR/KYC automatizado (eso es TRUST-8); motor de riesgo real (TRUST-7).
- **Dependencias**: TRUST-1, TRUST-2.
- **Datos**: tabla de evidencia de verificación (ver `TRUST_UNIFIED_ONBOARDING.md`).
- **APIs**: subida de documento, endpoints de revisión.
- **UX**: `/trust/verificar`, panel mínimo de revisión.
- **Seguridad**: defensas de archivo (formato, tamaño, re-encode, EXIF, malware, ver `TRUST_AGE_IDENTITY_VERIFICATION.md`).
- **Pruebas**: acceso IDOR a documentos ajenos debe fallar; un `trust_reviewer` no puede aprobar su propia cuenta.
- **Definition of Done**: un organizador real puede subir un documento, un humano lo revisa, y solo tras aprobación puede publicar.
- **Riesgos**: primer punto donde Rifex maneja datos de identidad reales — mayor superficie de privacidad de todo el roadmap hasta este punto.
- **Autorización necesaria**: explícita, idealmente con revisión legal de `TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md` ya hecha por un abogado real.
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
