# Rifex Trust — Diseño Canónico

Documento maestro del sistema Rifex Trust. Referencia el resto de `docs/trust/` para el detalle de cada área; este documento consolida el objetivo, los documentos por producto, el motor de riesgo y la arquitectura propuesta.

> **Actualización — TRUST-1 implementado (código + migración local + pruebas), pendiente de autorización para aplicar en `rifex-dev`.** El resto de este documento (TRUST-2 en adelante: identidad, RUT, documentos, organizaciones, motor de riesgo, panel de administración) sigue siendo diseño puro, no implementado. Ver `docs/trust/TRUST_IMPLEMENTATION_ROADMAP.md`, sección TRUST-1, para el detalle real de lo ya construido.

---

## 1. Objetivo (Fase 2)

Rifex Trust es un sistema transversal de:
- Onboarding obligatorio.
- Identidad.
- Mayoría de edad.
- Verificación de creadores.
- Verificación de organizaciones.
- Revisión por iniciativa.
- Prevención de fraude.
- Administración.
- Denuncias.
- Suspensión.
- Apelación.
- Reputación basada en operaciones reales (no en documentos, ver `TRUST_POST_TRANSACTION_EVIDENCE.md`).
- Evidencia posterior.
- Protección de datos.
- Expansión futura por países.

Sirve transversalmente a Rifas/Sorteos, Colectas, Eventos, y (conceptualmente, sin implementar) futuras Reservas con abono y otras iniciativas transaccionales.

**Postura**: Trust debe ser estricto — la percepción objetivo es *"Rifex es una plataforma seria: para recaudar debes demostrar quién eres y acreditar lo que publicas"* — pero nunca a costa de pedir documentos innecesarios o almacenar información sensible sin necesidad real. Cada campo de dato en todo `docs/trust/` está justificado contra los principios de finalidad y proporcionalidad de `TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md`.

Diseñado para el marco legal chileno vigente (Ley 19.628) y para la Ley 21.719 desde su entrada en vigencia (1 de diciembre de 2026) — ver la matriz legal para el detalle y las advertencias de "requiere abogado" que aplican.

---

## 2. Documentos requeridos por producto (Fase 6)

### Rifas/Sorteos

| Documento/evidencia | Finalidad | Qué demuestra | Qué NO demuestra | Obligatoriedad |
|---|---|---|---|---|
| Identidad del creador | Base de todo Trust | Quién es la persona detrás de la rifa | Que el premio existe | Siempre (TRUST-2/3) |
| Mayoría de edad | Requisito legal/de producto | 18+ verificado | — | Siempre |
| Fundamentos/autorizaciones aplicables | Responder al hallazgo de Ley 10.262 | Que el creador fue informado del marco regulatorio real (no que Rifex lo resuelve por él) | Autorización legal real ante el Ministerio del Interior — Rifex no la sustituye | A definir tras revisión legal (ver `TRUST_DECISIONS_FOR_RODRIGO.md`) |
| Evidencia del premio (existencia/propiedad) | Prevenir premio inexistente | Que el premio declarado existe y, razonablemente, le pertenece a quien lo ofrece | Titularidad legal perfecta (una foto no es un título de dominio) | Proporcional al valor declarado |
| Bases del sorteo | Transparencia | Reglas claras, plazos, mecanismo | — | Siempre, público |
| Alcance/fecha | Planificación, límites de venta | — | — | Siempre |
| Mecanismo de sorteo | Ya certificado técnicamente (DRAW-1/1B/2) | Aleatoriedad verificable | — | Siempre |
| Evidencia de entrega | Cierre del ciclo de confianza | Que el premio efectivamente llegó al ganador | — | Siempre, ver `TRUST_POST_TRANSACTION_EVIDENCE.md` |

### Colectas

| Documento/evidencia | Finalidad | Obligatoriedad |
|---|---|---|
| Identidad del creador | Base de Trust | Siempre |
| Identidad del beneficiario (si es distinto del creador) | Evitar colecta falsa a nombre de un tercero | Cuando el beneficiario no es el propio creador |
| Relación creador/beneficiario | Contexto de legitimidad | Cuando aplica |
| Consentimiento para uso de imágenes/datos de terceros (ej. fotos de un menor beneficiario, con consentimiento de su tutor) | Cumplimiento de Ley 21.719 sobre menores | Siempre que involucre a un tercero, especialmente menores |
| Finalidad declarada de la colecta | Transparencia | Siempre, público |
| Evidencia de la situación (ej. certificado médico para colecta de salud) | Proporcional al tipo — nunca antecedentes penales ni certificado de nacimiento por defecto, ver `TRUST_AGE_IDENTITY_VERIFICATION.md` | Proporcional |
| Actualización/rendición final | Cierre del ciclo de confianza | Siempre, ver `TRUST_POST_TRANSACTION_EVIDENCE.md` |

### Eventos

| Documento/evidencia | Finalidad | Obligatoriedad |
|---|---|---|
| Identidad del organizador | Base de Trust | Siempre |
| Recinto/modalidad | Transparencia, prevención de evento inexistente | Siempre, público |
| Fecha/capacidad | Planificación | Siempre |
| Condiciones de cancelación | Protección del comprador | Siempre, público |
| Documentación proporcional al riesgo (capacidad, monto recaudado) | Prevención de fraude en eventos masivos | Proporcional |
| Confirmación de realización | Cierre del ciclo de confianza | Siempre, ver `TRUST_POST_TRANSACTION_EVIDENCE.md` |
| Política de reembolsos | Protección del comprador | Siempre, público |

### Reservas futuras — solo compatibilidad conceptual, NO implementar

Prestador, recinto/servicio, autorización, cancelaciones, disputas — el mismo patrón (identidad → evidencia de la iniciativa → revisión proporcional al riesgo → evidencia posterior) debería extenderse sin rediseñar desde cero, pero **esta sesión no diseña Reservas**, solo confirma que la arquitectura de abajo no lo bloquearía.

**Nota transversal**: no se recomienda exigir certificado de antecedentes penales por defecto para ningún producto — es una medida excepcional y jurídicamente sensible (dato que revela potencialmente información de la esfera más íntima de la persona), reservada, si acaso, a un caso de revisión manual reforzada ante una señal de riesgo concreta, nunca como requisito estándar de onboarding.

---

## 3. Motor de riesgo (Fase 8)

Motor **basado en reglas y señales explicables**, no un modelo de caja negra.

**Señales de entrada**: antigüedad de la cuenta, nivel de Trust actual, documentos presentados y su resultado, cambios recientes de datos sensibles (email/teléfono/Mercado Pago), montos y velocidad de recaudación, denuncias recibidas, chargebacks, señales de múltiples cuentas (documento/teléfono/dispositivo repetido), historial de operaciones reales (ver `TRUST_POST_TRANSACTION_EVIDENCE.md`), proximidad a eventos con alta recaudación, comportamiento anómalo (ver `TRUST_THREAT_MODEL.md` para el detalle de cada amenaza que alimenta estas señales).

**Salida**: nunca un score numérico público. La salida es un conjunto de **verificaciones comprensibles** ("identidad verificada", "sin denuncias", "primera iniciativa", "monto dentro de lo habitual para su historial") que se traducen en:
- Insignias públicas (calculadas server-side, nunca editables por el cliente — ver amenaza #23).
- Límites operativos internos (ej. monto máximo antes de revisión manual adicional).
- Prioridad en la cola de revisión de Trust.

**Requisitos obligatorios del motor**:
- **Razones legibles**: toda decisión debe poder explicarse en lenguaje simple a un `trust_reviewer` y, cuando corresponda, al usuario afectado.
- **Revisión humana**: el motor nunca suspende ni rechaza de forma final por sí solo — señala, prioriza, y un humano decide (mismo principio que el resto de Trust, ver `TRUST_ROLES_AUTHORIZATION.md`).
- **Apelación**: toda decisión influida por el motor es apelable.
- **Protección contra discriminación**: las reglas no deben basarse en categorías protegidas (origen, sexo, religión, etc. — las mismas categorías sensibles de Ley 21.719 nunca deben ser una señal de riesgo en sí mismas).
- **Versionado**: cada cambio de reglas queda versionado, para poder explicar por qué una decisión de hace 3 meses se tomó con criterios distintos a una de hoy.
- **Auditoría**: cada decisión queda en el historial append-only.
- **Falsos positivos**: mecanismo explícito de corrección (amenaza #25 del threat model).

---

## 4. Arquitectura propuesta (Fase 12) — sin implementar

### Tablas propuestas (nombres indicativos, a confirmar en diseño técnico detallado)

| Tabla | Propósito | Notas |
|---|---|---|
| `trust_profiles` | Datos privados de identidad (nombre legal, RUT, fecha de nacimiento, teléfono, domicilio condicional) | 1:1 con el usuario, nunca pública |
| `trust_verifications` | Evidencia de verificación (documento, método, resultado, expiración, razón de rechazo) | Append-only para el resultado; referencia a *storage* privado solo si es indispensable |
| `trust_organizations` | Cuentas de tipo organización (representante legal) | TRUST-4 |
| `trust_initiative_reviews` | Revisión por iniciativa (rifa/colecta/evento específicos) | Vinculada a la tabla de la iniciativa real (`raffles`/`events`/futura tabla de colectas), nunca duplicando su estado |
| `trust_reports` | Denuncias | Acceso restringido a roles de revisión |
| `trust_history` | Historial append-only de toda decisión de Trust | Nunca editable, nunca borrable vía aplicación |
| `trust_risk_signals` | Señales del motor de riesgo | Ventana de retención corta y explícita, ver `TRUST_DATA_RETENTION_MATRIX.md` |
| `trust_post_transaction_evidence` | Evidencia de entrega/confirmación/rendición | Ver `TRUST_POST_TRANSACTION_EVIDENCE.md` |
| `trust_roles` | Asignación de `trust_reviewer`/`trust_supervisor`/`support_readonly`/`security_auditor` | Gestión propia, nunca auto-asignable |

### Enums propuestos

- `trust_verification_status`: `pending`, `approved`, `rejected`, `expired`.
- `trust_account_status`: `active`, `restricted`, `suspended`, `revoked`.
- `trust_review_outcome`: `approved`, `correction_requested`, `rejected`.
- `trust_role`: `trust_reviewer`, `trust_supervisor`, `support_readonly`, `security_auditor`.

### Relaciones y restricciones

- `trust_verifications.user_id` → referencia al usuario real, nunca duplicando `auth.users`.
- `trust_initiative_reviews` referencia la iniciativa real por `entity_type`/`entity_id` — mismo patrón genérico ya usado por `legal_declarations` (`src/lib/legalDeclarations.js`), reutilizado explícitamente en vez de crear un esquema paralelo por producto.
- Restricción: ninguna fila de `trust_history` puede tener `reviewed_by = target_user_id` (nadie aprueba su propia cuenta) — a nivel de `CHECK` constraint o de RPC, nunca confiado solo al frontend.

### Índices

- `trust_verifications(user_id, status)` — resolución rápida del estado actual de un usuario.
- `trust_history(target_user_id, created_at)` — historial cronológico por cuenta.
- `trust_risk_signals(user_id, created_at)` con expiración — soporta la ventana de retención corta.

### RLS (default-deny, mismo patrón que EVENT-1..6)

- Todas las tablas de Trust: `enable row level security`, sin política de `INSERT`/`UPDATE`/`DELETE` para `anon`/`authenticated` — todo write pasa por RPCs `service_role`, exactamente el patrón ya certificado y auditado en Eventos.
- `SELECT` propio: un usuario puede ver su propio `trust_verifications`/`trust_history`, nunca el de otro — política RLS explícita `using (user_id = auth.uid())`, nunca confiado a un chequeo solo en la API.
- Ningún dato de Trust tiene una política de `SELECT` pública — a diferencia de `events`/`event_ticket_types` (que sí tienen lectura pública legítima), nada en Trust debe ser públicamente legible vía PostgREST directo.

### RPCs propuestas (todas `SECURITY INVOKER` salvo justificación explícita, mismo criterio que Eventos)

- `trust_submit_verification(...)` — el usuario sube su evidencia, queda en `pending`.
- `trust_review_verification(p_verification_id, p_outcome, p_reason, p_reviewer_id)` — **nunca acepta `p_reviewer_id` sin resolverlo server-side desde la sesión verificada** (mismo error que se hubiera cometido si `extend_raffle_draw`/`create_raffle_with_declarations` hubieran sido alcanzables por RPC directa — ver `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md` para la evidencia real de por qué esto importa). Rechaza si `reviewer_id = target_user_id`.
- `trust_suspend_account(...)` — exige dos aprobaciones (`trust_supervisor`) antes de tomar efecto — implementado como un estado "pendiente de segunda aprobación", nunca como una sola llamada que suspende inmediatamente.
- `trust_compute_badges(user_id)` — recalcula las insignias públicas desde el estado real, nunca acepta un valor de insignia como parámetro de entrada.
- Ninguna RPC de Trust debe tener `EXECUTE` otorgado a `anon`/`authenticated`/`PUBLIC` — lección directa de `create_tickets_for_raffle` (ver `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md`): toda escritura de Trust pasa exclusivamente por rutas API server-side con `service_role`, nunca alcanzable por RPC directa desde el cliente.

### APIs

Mismo patrón exacto que Eventos: `src/pages/api/trust/...`, cliente `createClient(url, SUPABASE_SERVICE_ROLE_KEY || ANON_KEY)`, resolución de identidad siempre vía `supabase.auth.getUser(token)` con el Bearer token del request — nunca un `user_id` que el cliente envíe directamente en el body para una operación sensible.

### *Storage* privado y URLs firmadas

- Documentos (si se conservan, ver preferencia de no retención en `TRUST_AGE_IDENTITY_VERIFICATION.md`) van en un bucket privado de Supabase Storage, nunca público.
- Acceso vía URL firmada de corta duración (minutos, no días), generada server-side, nunca un enlace permanente.

### Auditoría append-only

`trust_history` nunca permite `UPDATE`/`DELETE` desde ningún rol de aplicación — solo `INSERT`. Cualquier "corrección" de una decisión pasada se registra como una **nueva fila** que referencia a la anterior, nunca sobrescribiéndola — mismo principio que `event_checkins`/`event_tickets` (nunca se hace `DELETE`, ver EVENT-3/4).

### Estados y transiciones

```text
onboarding: incompleto → completo
verificación: pending → approved | rejected | expired
cuenta: active → restricted → suspended → revoked (y suspended → active si la apelación prospera)
iniciativa: draft → en_revision → aprobada → publicada (→ suspendida si hay una denuncia con mérito)
```

Ninguna transición se salta pasos ni se ejecuta sin pasar por la RPC correspondiente — mismo principio de "toda la decisión y la escritura ocurren dentro de una única función" ya certificado en `check_in_event_ticket` (EVENT-4).

### Concurrencia e idempotencia

Mismo patrón ya certificado y probado bajo carga real en EVENT-6 Fase 1 (15 check-ins simultáneos → exactamente 1 `pass`): cualquier RPC de Trust que cambie un estado crítico (aprobar una verificación, suspender una cuenta) debe usar `FOR UPDATE` sobre la fila relevante y ser idempotente ante reintentos — un doble clic de un `trust_reviewer` nunca debe producir un doble efecto.

### Expiración, revocación, limpieza

- Verificaciones expiran (documento vencido) — job periódico o chequeo *lazy* al momento de usar el estado, a decidir en diseño técnico.
- Revocación de Trust es una transición de estado explícita, nunca un `DELETE`.
- Limpieza de `trust_risk_signals` tras su ventana de retención — job periódico, nunca manual.

### Rate limiting

Reutilizar la infraestructura ya existente y certificada (`src/lib/rateLimit.js`, tabla `rate_limit_hits`) — mismo patrón que todos los endpoints de Eventos, sin inventar un sistema paralelo.

### Logs sin PII

Ningún log de aplicación debe contener RUT, nombre legal, ni ninguna evidencia de identidad — mismo principio ya aplicado en el reporte XLSX de EVENT-5 (nunca `qr_token`/`access_token`/UUIDs completos innecesarios) extendido a Trust: nunca RUT/nombre legal/resultado de verificación en un log de `console.error`.

### Matriz de autorización

Ver `TRUST_ROLES_AUTHORIZATION.md` para la matriz completa.

---

## 5. Invariantes (obligatorias, sin excepción)

- Supabase es la autoridad — igual que todo el resto del sistema.
- `service_role` nunca llega al cliente.
- RLS default-deny en toda tabla de Trust.
- **TRUST STATE != PAYMENT STATE** — el nivel de Trust de un usuario nunca se infiere ni se deriva del estado de sus pagos; son capas independientes, igual que `PAYMENT STATE != FULFILLMENT STATE` ya certificado en EVENT-2/3.
- **TRUST STATE != INITIATIVE STATE** — que un usuario tenga Trust suficiente no significa que su iniciativa específica esté aprobada; son dos revisiones distintas (identidad de la persona vs. legitimidad de lo que publica).
- **Identidad verificada != iniciativa aprobada** — verificar quién es alguien no verifica automáticamente que lo que publica sea legítimo.
- **OCR != aprobación** — un resultado automatizado es una señal para la cola de revisión, nunca una aprobación final por sí solo (salvo que, en una etapa madura y explícitamente autorizada, se decida lo contrario para casos de bajo riesgo — no asumido en este diseño).
- **Google OAuth != onboarding** — una sesión válida de Google nunca implica onboarding universal completo (ver `TRUST_UNIFIED_ONBOARDING.md`).
- **Declarar edad != verificar edad** — un checkbox nunca es equivalente a una verificación real.
- **Documentos siempre privados** — nunca en perfiles públicos, APIs públicas, logs, analytics, exports Excel, ni correos.
- **Evidencia y retención deben coexistir con derechos de eliminación/anonimización** — ver `TRUST_DATA_RETENTION_MATRIX.md` para cómo se resuelve esta tensión caso por caso, nunca de forma genérica.

---

Ver también: `TRUST_UNIFIED_ONBOARDING.md`, `TRUST_AGE_IDENTITY_VERIFICATION.md`, `TRUST_THREAT_MODEL.md`, `TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md`, `TRUST_COUNTRY_COMPLIANCE_PACKS.md`, `TRUST_DATA_RETENTION_MATRIX.md`, `TRUST_ROLES_AUTHORIZATION.md`, `TRUST_POST_TRANSACTION_EVIDENCE.md`, `TRUST_EMAIL_NOTIFICATION_MATRIX.md`, `TRUST_IMPLEMENTATION_ROADMAP.md`, `TRUST_DECISIONS_FOR_RODRIGO.md`.
