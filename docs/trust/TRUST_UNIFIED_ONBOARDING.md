# Trust — Onboarding Universal y Gap de Google OAuth

## El gap confirmado en el código real

Verificado contra el código actual (`src/pages/auth/callback.js`, `src/pages/onboarding/pais.jsx`, `src/lib/countryOnboarding.js`, `src/lib/legalDeclarations.js`) — el onboarding real de Rifex hoy consiste en:

1. Login con Google OAuth (o email/password) → sesión de Supabase Auth.
2. Un único paso de onboarding obligatorio: **declarar país operativo** (`/onboarding/pais`, G1).
3. Al crear una rifa, se registran dos declaraciones legales autodeclaradas (`legal_declarations`: `age_18`, `prize_ownership`) — un checkbox, sin verificación.

**Esto confirma exactamente el gap que describe la misión**: Google OAuth autentica una cuenta real de Google, pero no acredita absolutamente nada del resto — ni aceptación de términos de Rifex, ni mayoría de edad, ni identidad legal, ni RUT, ni teléfono, ni domicilio, ni autorización para recaudar. Hoy, entre "iniciar sesión con Google" y "publicar una rifa que recibe dinero real", el único control real es un checkbox de autodeclaración en el momento de crear la rifa — no hay verificación de identidad en ningún punto del flujo actual.

## Estados del flujo (diseño propuesto, no implementado)

```text
sin sesión
  → login (Google OAuth o email/password)
  → sesión creada

sesión válida + onboarding universal incompleto
  → /registro/continuar (recolecta datos públicos/privados mínimos, Fase 3)

sesión válida + onboarding universal completo + Trust insuficiente para la acción intentada
  → /trust/verificar (flujo de verificación, Fase 4)

sesión válida + onboarding completo + Trust suficiente + iniciativa pendiente de revisión
  → estado "en revisión", no puede publicar todavía (Fase 6, revisión por iniciativa)

sesión válida + onboarding completo + Trust suficiente + iniciativa aprobada
  → operación permitida
```

Cada transición se evalúa **de nuevo en cada acción sensible**, no solo una vez al login — un usuario puede completar el onboarding hoy y perder su nivel de Trust más adelante (documento vencido, denuncia con mérito, suspensión) sin que eso rompa su sesión, solo bloquea la siguiente acción sensible.

## El control debe existir en frontend y en servidor — nunca solo ocultar botones

Principio explícito de esta misión, ya coherente con el patrón que Rifex usa en todo EVENT-1 a EVENT-6: **ocultar un botón en la UI no es autorización**. Cada endpoint que permita crear, publicar, recaudar o representar una iniciativa debe, en el servidor, resolver el estado de Trust del usuario autenticado (nunca confiar en un campo que el cliente envíe) antes de ejecutar la operación — el mismo patrón ya certificado en `canViewEventAnalytics`/`canCheckIn` (EVENT-4/EVENT-5), extendido a un chequeo de Trust general. Ver la matriz de autorización completa en `TRUST_ROLES_AUTHORIZATION.md` y las funciones RPC propuestas en `RIFEX_TRUST_CANONICAL_DESIGN.md`.

## Qué NO acredita Google OAuth (lista exhaustiva de la misión, confirmada contra el código real)

Verificado: `auth/callback.js` solo intercambia el `?code=` de OAuth por una sesión de Supabase y redirige — no escribe ningún dato adicional sobre el usuario. Por lo tanto, Google OAuth **no acredita**:

- Aceptación de términos y política de privacidad de Rifex (versionada).
- Mayoría de edad.
- Identidad legal (nombre legal real, más allá del nombre de la cuenta de Google).
- RUT/RUN u otro identificador nacional.
- Teléfono.
- Domicilio.
- Autorización para recaudar dinero de terceros.
- Verificación Trust de ningún nivel.

## Registro universal propuesto

### Datos públicos (visibles en el perfil/página pública de la iniciativa)

| Campo | Finalidad declarada | Obligatorio |
|---|---|---|
| Nombre visible (puede ser distinto del nombre legal) | Identificación pública mínima | Sí |
| Fotografía pública | Confianza visual, opcional | No |
| Descripción | Contexto de quién es el organizador | No |
| País | Coherencia con moneda/medio de pago (ya existe, `country_code`) | Sí |
| Insignias autorizadas (ver `RIFEX_TRUST_CANONICAL_DESIGN.md`, motor de riesgo) | Comunicar el nivel de Trust sin exponer el detalle interno | Automático, no editable por el usuario |

### Datos privados (nunca en perfiles públicos, APIs públicas, logs, analytics, Excel ni correos)

| Campo | Finalidad declarada | Obligatorio para publicar |
|---|---|---|
| Nombre legal | Identidad real detrás de la cuenta | Sí, desde TRUST-2 |
| RUN/RUT o identificador nacional equivalente (expansión futura) | Identidad, prevención de duplicados | Sí, desde TRUST-2 |
| Fecha de nacimiento | Verificación de mayoría de edad | Sí, desde TRUST-2 |
| Nacionalidad | Contexto legal, expansión futura por país | No inicialmente |
| Teléfono | Canal de contacto de seguridad/verificación, señal anti-fraude (número reciclado, VOIP desechable) | Sí, desde TRUST-2 |
| Domicilio | Solo cuando corresponda (ej. organizaciones, envío físico de premios) — **nunca por defecto** | Condicional, nunca universal |
| Representante legal (si la cuenta es una organización) | Identidad legal responsable | Sí para cuentas de organización, ver Fase 6 |
| Aceptación versionada de términos y privacidad | Evidencia de consentimiento informado, con fecha y versión del documento aceptado | Sí, desde el registro |

**Nota de proporcionalidad explícita**: el domicilio completo **no** se recolecta por defecto para un creador de rifa individual — el principio de proporcionalidad (Ley 19.628/21.719, ver `TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md`) no lo justifica para ese caso; sí puede justificarse para una organización que declara una sede física, o para el envío físico de un premio específico, y en ese caso se recolecta puntualmente para ese propósito, no como parte del registro universal.

### Evidencia de verificación (tabla separada, nunca mezclada con el perfil)

| Campo | Descripción |
|---|---|
| Tipo de documento | Cédula, pasaporte, etc. |
| País emisor | Para expansión futura multi-país |
| Vigencia | Fecha de expiración del documento presentado |
| Método usado | Cuál de los 6 métodos de `TRUST_AGE_IDENTITY_VERIFICATION.md` |
| Proveedor o revisor | Qué proveedor externo, o qué `trust_reviewer` humano, procesó la verificación |
| Resultado | Aprobado / rechazado / requiere revisión adicional |
| Fecha | Cuándo se procesó |
| Expiración del resultado | Cuándo debe volver a verificarse (los resultados de Trust no son eternos) |
| Razón de rechazo | Texto explicable, nunca solo un código interno, para poder informarle al usuario qué corregir |
| Referencia privada al archivo (solo si es indispensable conservarlo) | Un puntero a *storage* privado con URL firmada de corta duración — nunca la imagen embebida en la fila, nunca en un bucket público |

Esta tabla vive completamente separada del perfil público y de `users_profile` — es la base de la auditoría de Trust, con su propio régimen de acceso (ver `TRUST_ROLES_AUTHORIZATION.md`) y su propia política de retención (ver `TRUST_DATA_RETENTION_MATRIX.md`).

## `/registro/continuar` — contenido propuesto del paso único de onboarding universal

Un solo formulario, presentado una sola vez, que recolecta exactamente los campos "obligatorios" de la tabla de datos privados de arriba (nombre legal, fecha de nacimiento, teléfono, aceptación de términos versionada) — deliberadamente **no** incluye RUT/verificación documental en este mismo paso: ese es el trabajo de `/trust/verificar` (TRUST-2/TRUST-3), un paso posterior, solo exigido cuando el usuario intenta una acción que realmente lo requiere (crear una iniciativa), nunca a un comprador que solo quiere aportar a una colecta o comprar un boleto.

## Documentos por producto — resumen (detalle completo en `RIFEX_TRUST_CANONICAL_DESIGN.md`, sección "Documentos requeridos por producto")

Cada producto (Rifas/Sorteos, Colectas, Eventos, y Reservas futuras solo a nivel conceptual) exige, además del onboarding universal, evidencia específica de esa iniciativa — nunca reutiliza la verificación de identidad como sustituto de la evidencia de que el premio existe, el beneficiario es real, o el recinto del evento es real. Ver la sección dedicada en el documento canónico.
