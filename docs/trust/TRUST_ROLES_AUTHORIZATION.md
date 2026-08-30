# Trust — Roles, Panel de Administración y Matriz de Autorización

> **Actualización — TRUST-3A implementado en `rifex-dev` (2026-08-27),
> simplificación deliberada respecto de la tabla de roles de abajo.** El
> sistema real de Rifex hoy solo tiene UN rol elevado —
> `app_metadata.role === 'admin'` en Supabase Auth (`resolveAdmin`,
> `src/lib/adminAuth.js`), ya usado por `/api/admin/*` — no existen
> `trust_reviewer`/`trust_supervisor`/`support_readonly`/
> `security_auditor` como roles separados. Siguiendo el mandato
> explícito de esta misión ("no inventes un sistema de roles
> incompatible con el existente... deja la interfaz administrativa
> bloqueada detrás de la autorización más fuerte disponible"), la cola
> de revisión de TRUST-3A (`GET/POST /api/admin/trust/*`) queda detrás
> de ese mismo `resolveAdmin` — cualquier `admin` puede revisar,
> aprobar, corregir o rechazar. La granularidad de esta tabla
> (revisor vs. supervisor vs. auditor de solo lectura) sigue siendo
> diseño, no implementada — sería un cambio de infraestructura de roles
> más amplio que el alcance de TRUST-3A. Los invariantes de abajo SÍ se
> cumplen con lo real: nadie puede aprobar su propia cuenta
> (`cannot_review_own_case`, verificado en vivo), y el historial es
> append-only de verdad (trigger de base de datos, no solo convención de
> aplicación — ver `TRUST_IMPLEMENTATION_ROADMAP.md`, sección TRUST-3A).

## Roles propuestos

| Rol | Puede | No puede |
|---|---|---|
| `trust_reviewer` | Revisar documentos/evidencia en cola, aprobar, solicitar corrección, rechazar, dejar notas en el historial | Aprobar su propia cuenta; suspender/revocar sin escalar a `trust_supervisor` para acciones críticas; eliminar evidencia |
| `trust_supervisor` | Todo lo de `trust_reviewer`, más: suspender, revocar, bloquear publicación de una iniciativa, resolver apelaciones, doble-aprobar acciones críticas iniciadas por un `trust_reviewer` | Eliminar evidencia del historial append-only; auto-aprobarse |
| `support_readonly` | Ver el estado de Trust de una cuenta (para atender un ticket de soporte) sin poder modificar nada | Aprobar, rechazar, suspender, ver el documento/imagen subyacente si no es indispensable para el ticket |
| `security_auditor` | Ver el historial completo append-only, incluida la actividad de los otros roles, para auditoría — acceso de solo lectura sobre todo el sistema de Trust | Aprobar, rechazar, suspender — nunca actúa como revisor, solo como auditor independiente |

## Invariantes de autorización (obligatorias, sin excepción)

- **Nadie puede aprobar su propia cuenta** — ni un `trust_reviewer`, ni un `trust_supervisor`, sin importar su rol.
- **Nadie puede eliminar evidencia silenciosamente** — el historial es append-only; "eliminar" una fila nunca es una operación disponible para ningún rol vía la aplicación, solo mediante un procedimiento excepcional fuera de banda, auditado.
- **Doble aprobación para acciones críticas**: suspender una cuenta con historial de operaciones reales, revocar Trust de una organización, o revertir una decisión de `trust_supervisor` requiere una segunda persona con rol `trust_supervisor` — nunca una sola persona actuando sola sobre una acción de alto impacto.
- **Todo cambio de estado queda en el historial append-only**, con quién, cuándo, y la razón — sin excepción, incluidas las acciones automatizadas del motor de riesgo (ver `RIFEX_TRUST_CANONICAL_DESIGN.md`).

## Panel Trust — flujo de trabajo propuesto

1. **Cola priorizada**: las verificaciones/denuncias pendientes se ordenan por señales de riesgo (ver motor de riesgo) y antigüedad — nunca estrictamente FIFO si hay una señal de urgencia real (ej. denuncia sobre una iniciativa con recaudación activa).
2. **Revisión documental**: el `trust_reviewer` ve el resultado de la verificación (y la evidencia mínima indispensable, nunca más de lo necesario) y decide.
3. **Acciones disponibles**: aprobar, solicitar corrección (con un motivo legible que se le muestra al usuario), rechazar (con motivo), escalar a `trust_supervisor`.
4. **Acciones exclusivas de `trust_supervisor`**: suspender, revocar, bloquear publicación de una iniciativa específica sin suspender la cuenta completa.
5. **Denuncias**: entran a una cola separada, pero comparten el mismo historial append-only y las mismas reglas de doble aprobación para acciones críticas.
6. **Apelaciones**: el usuario suspendido/rechazado puede apelar una vez; la apelación la revisa una persona distinta de quien tomó la decisión original, cuando el equipo lo permita (si Rifex opera con muy pocas personas, esto es una limitación real a documentar, no a fingir que se cumple — ver `TRUST_DECISIONS_FOR_RODRIGO.md`).

## Matriz de autorización por acción (extracto — el detalle completo de las tablas/RPCs vive en `RIFEX_TRUST_CANONICAL_DESIGN.md`)

| Acción | anon | Usuario autenticado (onboarding incompleto) | Usuario autenticado (Trust insuficiente) | Usuario autenticado (Trust suficiente) | `trust_reviewer` | `trust_supervisor` | `support_readonly` | `security_auditor` |
|---|---|---|---|---|---|---|---|---|
| Explorar rifas/eventos/colectas públicas | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Comprar boleto / aportar / comprar entrada | No (requiere sesión) | No — primero completar onboarding | Sí (comprar no exige el mismo Trust que crear) | Sí | N/A | N/A | N/A | N/A |
| Crear/publicar una iniciativa | No | No | No | Sí | N/A | N/A | N/A | N/A |
| Ver su propio estado de Trust | No | Sí | Sí | Sí | N/A | N/A | N/A | N/A |
| Ver el estado de Trust de OTRA cuenta | No | No | No | No | Sí (cola de revisión) | Sí | Sí (solo lectura) | Sí (solo lectura) |
| Aprobar/rechazar una verificación | No | No | No | No | Sí (excepto la propia) | Sí (excepto la propia) | No | No |
| Suspender/revocar una cuenta | No | No | No | No | No (debe escalar) | Sí, con doble aprobación | No | No |
| Ver historial append-only completo | No | No | No | No | Solo lo relevante a su cola | Solo lo relevante a su cola | No | Sí, completo |
| Ver la imagen/documento subyacente | No | No | No | No | Solo si es indispensable para la revisión activa | Solo si es indispensable | No | No, salvo auditoría específica autorizada |

Este diseño sigue exactamente el mismo principio ya certificado en Eventos: **default-deny, verificación server-side en cada acción, nunca un rol implícito por la sola presencia de una sesión válida** — mismo criterio que `canViewEventAnalytics`/`canCheckIn` y el mismo patrón de RLS default-deny usado en `event_orders`/`event_tickets`/`event_staff`/`event_checkins` desde EVENT-2/3/4.
