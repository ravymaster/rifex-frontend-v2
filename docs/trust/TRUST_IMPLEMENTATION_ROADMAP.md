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

**Estado: código, migración local y pruebas COMPLETOS en el notebook — migración NO aplicada en `rifex-dev`, PENDIENTE de autorización expresa de Rodrigo.** Ver el checkpoint completo en `docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md` (o el informe de la sesión que implementó esto) para el detalle exacto de archivos, RLS y pruebas.

- **Alcance real implementado**: tabla `trust_onboarding` (independiente de `users_profile`, RLS default-deny total — decisión final, no la alternativa "extender users_profile" que el roadmap original dejaba abierta, precisamente porque `users_profile` ya permite escritura directa del cliente vía RLS y eso habría dejado `onboarding_completed_at` editable por el cliente); `src/lib/trustOnboardingPolicy.js` (validación pura) + `src/lib/trustOnboardingGate.js` (autoridad server-side, mismo patrón que `countryGate.js`); `GET/POST /api/onboarding/trust/{status,complete}`; página `/registro/continuar`; gate server-side agregado a los 13 endpoints sensibles reales de creación/edición/publicación/administración de Rifas, Colectas y Eventos (lista exacta en el informe de cierre de esta sesión).
- **Exclusiones cumplidas**: sin verificación documental, sin OCR, sin biometría, sin RUT verificado — solo campos declarados.
- **Datos**: tabla nueva, no extiende `users_profile`.
- **Seguridad**: RLS default-deny total (ni siquiera SELECT propio vía PostgREST — todo pasa por las rutas API con `service_role`, más estricto que el patrón de `users_profile`/país).
- **Pruebas**: 29 pruebas reales (`npm test:trust-onboarding`), incluida una prueba adversarial estructural que confirma que ningún campo de estado reservado (`onboarding_completed_at`, `user_id`) puede colarse desde el body del cliente.
- **Compatibilidad con usuarios antiguos**: sin excepción — la ausencia de fila en `trust_onboarding` se trata como incompleto para cualquier cuenta, nueva o antigua, exactamente como exigía el mandato de esta fase.
- **Riesgo de despliegue real, no teórico**: el código de los 13 endpoints depende de que la tabla `trust_onboarding` exista — si se despliega el código sin aplicar antes la migración en `rifex-dev`, **todo el mundo queda bloqueado para crear/publicar/administrar** (falla cerrada por diseño). La migración y el código deben aplicarse/desplegarse juntos, nunca el código solo.
- **Autorización necesaria**: aplicar la migración en `rifex-dev`, crear fixtures de prueba si son indispensables, push a `origin/develop`, y deploy DEV — cada una por separado, explícita, según el checkpoint de esta sesión.
- **Estimación relativa**: media — completada en el notebook, pendiente solo de las operaciones externas autorizadas.

## TRUST-2 — Identidad básica, RUT, teléfono y edad

- **Alcance**: campos privados (nombre legal, RUT, fecha de nacimiento, teléfono) + validación de formato de RUT (dígito verificador) — sin verificación documental real todavía, solo estructura y validación de forma.
- **Exclusiones**: subida de documentos, revisión humana, OCR.
- **Dependencias**: TRUST-1.
- **Datos**: tabla privada de identidad.
- **Seguridad**: acceso restringido, nunca expuesto en API pública.
- **Pruebas**: validación de RUT con casos reales/inválidos, aislamiento de acceso (IDOR).
- **Definition of Done**: un usuario puede completar estos campos, quedan validados en formato, pero el usuario sigue sin poder publicar hasta TRUST-3.
- **Riesgos**: bajo.
- **Autorización necesaria**: explícita.
- **Estimación relativa**: baja-media.

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
