# INSCRIPCIONES — Facturación futura Plus/Gold (documentado, NO implementado)

**Estado**: diseño puro. Ningún checkout, ningún gateway de pago, ningún endpoint de compra, ningún botón "Upgrade", ningún atajo de administrador, ningún parámetro de query/body que active esto existe en el repo a la fecha de este documento (2026-09-04). Este archivo existe para que una futura misión no tenga que reconstruir Inscripciones, Participantes, QR, Scanner, Check-in, Excel, página pública ni panel — solo debe conectar la facturación.

## Modelo de planes

Definido en `src/lib/registrationPlans.js` — única autoridad de capacidades:

| Plan | Capacidad | Pago |
|---|---|---|
| FREE | 50 | Ninguno — 1 por mes calendario por cuenta |
| PLUS | 200 | **Pago único por actividad** (no suscripción) |
| GOLD | 2000 | **Pago único por actividad** (no suscripción) |

`REGISTRATION_PLANS.plus.publiclyAvailable` y `.gold.publiclyAvailable` son `false` en V1 — ese flag, no un checkout, es lo que hoy le dice a cualquier futura UI que no debe mostrar esos planes. Cambiar ese flag a `true` es una decisión de producto explícita para la misión que active la venta, no un efecto secundario de tocar otra cosa.

## Por qué PLUS/GOLD son categóricamente distintos de "Inscripciones pagada"

PLUS/GOLD cobran al **organizador** por más capacidad de software de Rifex — nunca al participante por inscribirse. Esto nunca se confunde con una "Inscripción pagada": si algún caso necesitara cobrar al participante, ese caso es Eventos, no una variante de Inscripciones. El día que se implemente PLUS/GOLD, el participante sigue inscribiéndose gratis exactamente igual que en FREE — lo único que cambia es cuántos cupos tiene la actividad.

## Por qué es estructuralmente imposible activar PLUS/GOLD hoy

No es una validación que se pueda evadir — es la ausencia total de un camino de escritura:

1. La única función SQL capaz de insertar una fila en `registration_activities` es `create_free_registration_activity`, y su firma **no tiene parámetros** `p_plan`/`p_capacity` — los valores `'free'`/`50` están hardcodeados dentro del cuerpo de la función. No existe `create_plus_registration_activity` ni `create_gold_registration_activity`.
2. Ningún endpoint de `/api/inscripciones/**` lee `plan` ni `capacity` del body de ninguna request (verificado por grep en el self-audit de la misión V1 — cero ocurrencias de `body.plan`/`body.capacity`).
3. `registration_activities.plan`/`.capacity` solo se escriben en el INSERT inicial de esa RPC — no hay ningún UPDATE de esos campos en ningún endpoint de esta misión.

Esto es una garantía más fuerte que "el servidor valida y rechaza": no hay ningún parámetro que un cliente comprometido pueda siquiera intentar enviar para obtener 200 o 2000 cupos.

## Punto de integración futuro — "RIFEX INSCRIPTIONS BILLING"

Cuando una misión futura implemente esto, el contrato mínimo es:

1. **Cobrar al organizador** por el plan elegido (Plus o Gold), pago único por actividad — mecanismo de cobro fuera del alcance de este documento (podría reusar Payment Engine, podría ser un flujo nuevo; decisión de esa misión).
2. **Confirmar el pago server-side** (webhook o polling, con la misma disciplina anti-forgery ya establecida en Eventos: nunca confiar en un `status=approved` que mande el cliente).
3. **Emitir un entitlement** — concepto nuevo, no implementado todavía. Forma mínima sugerida (no vinculante): tabla `registration_entitlements` con `activity_id`, `plan`, `purchase_reference`, `status`, `granted_at` — un registro insert-only, auditable, análogo al ledger `registration_free_usage` ya existente.
4. **Crear o elevar una actividad con la capacidad correspondiente** — probablemente una nueva RPC `create_plus_registration_activity`/`create_gold_registration_activity` (o una función genérica parametrizada, decisión de esa misión) que solo pueda ejecutarse tras verificar el entitlement emitido en el paso 3 — nunca aceptando `plan`/`capacity` directo de un body sin ese entitlement de por medio.
5. **Preservar exactamente el resto del flujo sin cambios**: inscripción de participantes, duplicados, QR, scanner, check-in, Excel, página pública, panel — ninguno de esos debería necesitar tocarse; todos ya operan sobre `registration_activities.capacity` como un entero genérico, sin asumir en ningún punto que vale 50.

## Qué NO se decide en este documento

Precio de Plus/Gold, proveedor de pago, si Plus/Gold aparecen en `/inscripciones` como planes visibles antes o después de comprarse, si existe un flujo de "upgrade" de una actividad FREE ya creada a Plus/Gold, y si el límite de "1 FREE por mes" sigue aplicando a organizadores que ya compraron Plus/Gold — todas son decisiones de producto explícitas para la misión que implemente esto, no supuestos de este documento.
