# INSCRIPCIONES V1 FREE — Producto

**Fecha**: 2026-09-04 · **Estado**: **PROD, en vivo en `rifex.pro`**. Certificado en DEV, promovido a PROD tras autorización explícita de Rodrigo ("GO A PROD"), aplicado y verificado en vivo (creación real sin Mercado Pago, inscripción, QR, scanner PASA/YA REGISTRADO, Excel — ver `INSCRIPCIONES_V1_ARCHITECTURE.md`, sección "PROD promotion").

## Qué es

Un vertical nativo de Rifex para actividades **gratuitas** (talleres, cursos, capacitaciones, actividades comunitarias) que necesitan: recibir participantes, controlar cupo, compartir una página pública, emitir confirmación individual por QR, controlar asistencia con scanner, ver inscritos, exportar a Excel.

## Qué NO es

**Inscripciones ≠ Eventos.** La distinción de producto es categórica, no una variante:

- **Inscripciones**: actividad SIN cobro al participante. Nunca usa Mercado Pago del organizador, `marketplace_fee`, comisión del 7%, Payment Engine, preferencia de pago, webhook de pago ni conciliación de pagos.
- **Eventos**: actividad CON venta de entradas/cobro. Si un caso necesita cobrar por participar, es Eventos — nunca se construye "Inscripciones pagada" como variante transaccional.

## V1 — Plan FREE

- Hasta **50 inscritos** por actividad.
- Máximo **1 inscripción FREE nueva por mes calendario** por cuenta (ej.: crear una el 18 de septiembre permite crear la siguiente recién desde el 1 de octubre — nunca rolling 30 días).
- **$0**. Sin Mercado Pago del organizador. Sin comisión Rifex. Sin onboarding financiero.

## Explícitamente prohibido en V1

PLUS/GOLD no son comprables. No hay gateway de pago, ni checkout, ni precios inventados, ni exhibición pública de planes Plus/Gold, ni activación de monetización de ningún tipo. Ver `INSCRIPCIONES_FUTURE_BILLING.md` para el punto de integración futuro — documentado, no implementado.

## Onboarding — regla crítica

Inscripciones vive **fuera** del onboarding financiero progresivo. Nunca usa `assertCreatorEligible` (RUT/Mercado Pago) ni `resolveCreationGate`. El creador necesita únicamente: sesión válida + onboarding general de Rifex (`assertOnboardingComplete`, `src/lib/trustOnboardingGate.js`). Un usuario **sin Mercado Pago conectado** puede crear y operar una inscripción gratuita — demostrado con pruebas adversariales reales contra `rifex-dev`, y confirmado en vivo en PROD (creación real por Rodrigo sin conexión de Mercado Pago).

Flujo real: Registro/Login → onboarding general → Mis iniciativas → Inscripciones → Crear inscripción.

## Flujo del organizador

1. `/crear-inscripcion` (autenticado, onboarding general completo): completa nombre, descripción, fecha/hora, modalidad (presencial/online/híbrida), lugar/dirección, información para inscritos.
2. Guarda como borrador (`status=draft`) — cupo mensual FREE ya consumido en este paso (sección "Anti-abuso" abajo).
3. Publica (`status=active`) — la actividad queda visible en `/inscripcion/[id]`.
4. Comparte el link. Ve inscritos, descarga Excel, opera el scanner desde `/panel/inscripciones/[id]`.
5. Cierra inscripciones o archiva cuando corresponda.

## Flujo del participante

1. Abre `/inscripcion/[id]` (público, sin login).
2. Completa nombre, email, teléfono (opcional).
3. Recibe confirmación en pantalla + **un solo email** con el QR de acceso.
4. Muestra el QR (`/i/[token]`) en el acceso — el organizador lo escanea con el scanner de `/panel/inscripciones/[id]/scanner`.

**Nota real de PROD**: el correo de confirmación puede caer en spam en algunos proveedores (observado con Hotmail/Outlook durante la prueba funcional en PROD) — es un tema de reputación de envío del dominio, no un defecto del producto. El participante siempre puede ver su QR inmediatamente en pantalla tras inscribirse (botón "Ver mi código QR"), sin depender del correo.

## Capacidad — autoridad única

`src/lib/registrationPlans.js` es la única fuente de los números: FREE=50, PLUS=200, GOLD=2000 (PLUS/GOLD modelados, no activables). El backend decide la capacidad real (la RPC `create_free_registration_activity` hardcodea `'free'`/`50`, sin aceptar esos valores como parámetro); el frontend solo la presenta.

## Anti-abuso del cupo FREE

El cupo mensual se registra en un ledger insert-only (`registration_free_usage`, `UNIQUE (organizer_id, period_key)`) — nunca se borra, nunca se resetea al eliminar/cerrar/archivar una actividad (no existe ningún camino de código que lo modifique fuera de la creación). Concurrencia real demostrada contra `rifex-dev`: dos intentos simultáneos de crear una actividad FREE en el mismo mes → exactamente una tiene éxito, la otra recibe `free_quota_already_used`.

## Estados de actividad

`draft` (sin inscripciones) → `active` (acepta mientras haya cupo) → `closed` (no acepta nuevas) → `archived` (histórico). Un cambio de estado nunca altera el consumo mensual FREE ya registrado.

## Check-in — sin restricción de fecha

El scanner/check-in valida QR/actividad/ownership/duplicado, pero **no valida la fecha de la actividad** — un participante puede ser marcado como asistente en cualquier momento después de inscribirse, independientemente de la fecha configurada para la actividad. Decisión de diseño V1: mantener el check-in simple, sin ventanas temporales de validez.

## Fuera de alcance de V1

Checkout Plus/Gold, precios, suscripciones, Mercado Pago del organizador, `marketplace_fee`, comisión 7%, Warp AI/IA, formularios dinámicos/campos custom, adjuntos, recordatorios automáticos, WhatsApp/SMS, certificados, múltiples sesiones por actividad, asientos, pago de participantes, códigos promocionales, integraciones sociales, auto-publicación, integraciones de calendario, Argentina, cualquier vertical adicional nueva.
