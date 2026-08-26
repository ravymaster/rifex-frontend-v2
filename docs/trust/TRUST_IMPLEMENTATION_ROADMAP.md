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

- **Alcance**: tabla de onboarding universal (datos públicos/privados mínimos), estados del flujo (`TRUST_UNIFIED_ONBOARDING.md`), chequeo server-side en cada endpoint sensible existente hoy (creación de rifa/colecta/evento).
- **Exclusiones**: verificación documental real (eso es TRUST-2/3); motor de riesgo; panel de administración.
- **Dependencias**: ninguna técnica — es la base de todo lo demás.
- **Datos**: nueva tabla de onboarding universal, extensión de `users_profile` o tabla separada (a decidir en el diseño técnico detallado, no fijado aquí).
- **APIs**: endpoint de registro universal (`/api/onboarding/*`, mismo patrón que `/api/onboarding/country` ya existente).
- **UX**: `/registro/continuar`.
- **Seguridad**: RLS default-deny desde el día uno, mismo patrón que Eventos.
- **Pruebas**: unitarias de la lógica de estados + pruebas de que un endpoint sensible realmente rechaza a un usuario con onboarding incompleto (server-side, no solo frontend).
- **Definition of Done**: ningún endpoint de creación de iniciativa es alcanzable sin onboarding universal completo, verificado con pruebas reales (mismo rigor que EVENT-6).
- **Riesgos**: romper el flujo de creación de rifas/colectas/eventos existente si no se migra con cuidado a los usuarios ya registrados sin onboarding universal.
- **Autorización necesaria**: explícita de Rodrigo, con plan de migración de usuarios existentes.
- **Estimación relativa**: media.

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
