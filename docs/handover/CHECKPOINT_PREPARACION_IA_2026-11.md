# Checkpoint — preparación de Rifex para Warp IA (2026-11)

Estado: **DEV certificado; PROD pendiente de promoción autorizada.** Aún no hay integración de IA.

## Orden de lectura para retomar
1. `docs/WOP.md`: entradas "CAMPOS PÚBLICOS DE RIFAS (2026-11-06)" y "SUPERFICIE PÚBLICA Y PREPARACIÓN PARA IA (2026-11)".
2. Este checkpoint.
3. `src/lib/publicRaffleFields.js`, `src/lib/publicInitiativeFields.js` y `src/lib/raffleExposure.js`.
4. `tests/publicRaffleFields.test.mjs` y `tests/publicSurfaceReadiness.test.mjs`.

## Módulos revisados
Rifas, Eventos (incluidos los tipos de entrada), Inscripciones, Campañas y Medidor QR. Cada lectura pública usa una **lista cerrada de campos**, tanto en la consulta como en la respuesta. Los permisos de la base limitan a los roles de cliente a esas mismas columnas. El dueño autenticado y los procesos del servidor conservan su acceso.

## Superficie pública autorizada para una futura IA
- Información institucional y servicios de Rifex.
- Eventos, Campañas e Inscripciones públicos: título, descripción, fechas, lugar, precios, requisitos, estado y disponibilidad pública.
- Medidor QR público: pregunta, opciones, estado y fechas.
- Información pública mínima del organizador: nombre, avatar y descripción.

## Excluido
Rifas en PROD; correos y teléfonos; identificadores internos; datos de participantes; respuestas y resultados del Medidor QR; pagos y Mercado Pago; webhooks; administración; check-in; información privada de organizadores; secretos; y cualquier mutación.

## Rutas históricas de Rifas
Existe un control de exposición pública del lado del servidor, **apagado por defecto**, con tres modos exactos en la variable privada del servidor `RIFEX_RAFFLES_PUBLIC`: `on` (directo), `gated` (confirmación previa) y `off`. Ausente, vacía o con cualquier otro valor, queda deshabilitado. DEV se configura con `on`; para PROD se prevé `gated`.
- Deshabilitado, las rutas públicas de Rifas responden **410 Gone** con una página neutra, sin metadata ni redirecciones, y los perfiles públicos dejan de listar rifas.
- **La respuesta es idéntica para personas y crawlers:** no se detecta el user-agent ni se aplica cloaking.
- La gestión del creador, los pagos, los webhooks, la conciliación y el sorteo interno no cambian.
- Verificado en DEV con los dos estados.
- **Enlace neutral (2026-11-08):** los enlaces compartibles son `/c/<token>`; la ficha, el checkout y el chat leen solo por API, y los roles de cliente no acceden directamente a las tablas de Rifas. Detalle en "ENLACE NEUTRAL Y LECTURAS POR API (2026-11-08)" de `docs/WOP.md`.
- **Modo `gated` (2026-11-07):** confirmación humana previa con autorización temporal por Rifa (30 días), configuración prevista para PROD junto con `RIFEX_RAFFLES_GATE_SECRET`. Sin secreto válido equivale a `off`. Detalle en la entrada "RIFAS COMPARTIBLES CON CONFIRMACIÓN (2026-11-07)" de `docs/WOP.md`.

## Pruebas
Suite completa: 1371 tests, 1357 pass, 0 fail. Build OK. Smoke en DEV de listados, detalles, slugs, inexistentes, vista móvil, permisos por rol, rechazo de consultas a columnas no públicas, y la matriz de exposición de Rifas con cinco user-agents.

## Migraciones DEV
`db/migrations/2026-11-06b_initiatives_public_column_grants.sql`, aplicada en DEV después del deploy del código. Tiene reversión en `db/rollback/` y verificación de solo lectura en `db/checks/`.

## Contratos propuestos (sin implementar)
`rifex.services.list`, `rifex.events.list`, `rifex.event.read`, `rifex.campaigns.list`, `rifex.campaign.read`, `rifex.registrations.list`, `rifex.registration.read` y `rifex.qr_meter.read`. Todos de solo lectura, con lista cerrada de campos, identificados por slug y sin acceso del modelo a la base. La especificación detallada se mantiene fuera del repositorio.

## Pendiente
- Promoción selectiva a PROD (código primero, permisos después), con autorización explícita.
- Configurar PROD en modo `gated`, con autorización explícita, y aplicar las migraciones `2026-11-08a` (antes del código) y `2026-11-08b` (después).
- Warp IA: las Rifas, `/c/`, `/rifas/` y las APIs de Rifas quedan fuera de Discovery y del Connector.
- Adaptaciones para los contratos: listados públicos, mapeo de campos y lectura del Medidor QR.
- Revisión de función de creación de Rifas en DEV.
