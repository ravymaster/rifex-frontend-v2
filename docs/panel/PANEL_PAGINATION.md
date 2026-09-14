# RIFEX PANEL SCALABILITY — SERVER-SIDE PAGINATION (2026-09-05)

**Estado**: DEV only, `origin/develop`. No promovido a PROD.

## Objetivo

Corrige escalabilidad visual y de consultas en los paneles privados de Eventos e Inscripciones, sin agregar producto nuevo: los listados de iniciativas (`/panel/inscripciones`, `/panel/eventos`) y el listado de participantes de una inscripción (`/panel/inscripciones/[id]`) crecían indefinidamente (sin `limit`/`offset`/`count`), y los contadores "Asistieron"/"Pendientes" se calculaban filtrando el array completo recibido — correcto solo porque ese array traía todas las filas.

## Auditoría real antes de implementar

| Superficie | Query antes | Limit antes | Count antes | Riesgo de escala |
|---|---|---|---|---|
| `/panel/inscripciones` (`GET /api/inscripciones/mine`) | `.select(...).eq('organizer_id', user.id).order('created_at', desc)` | Ninguno | Ninguno (`items.length` implícito) | Alto — además, para los contadores por tarjeta, descargaba TODAS las filas de `registration_participants` de TODAS las actividades del organizador solo para contarlas en JS |
| `/panel/eventos` (`GET /api/events/mine`) | `.select(...).eq('organizer_id', ...).order('created_at', desc)` | Ninguno | Ninguno | Alto |
| `/panel/inscripciones/[id]` — participantes (`GET /api/inscripciones/[id]/participants`) | `.select(...).eq('activity_id', id).order('registered_at', asc)` | Ninguno (hoy tope 50 por plan FREE, pero Plus/Gold ya modelan 200/2000) | Ninguno propio — el total real de "Inscritos" ya venía de un `count` exacto en `GET /api/inscripciones/[id]`, pero "Asistieron"/"Pendientes" se calculaban en el cliente filtrando el array completo | Crítico si algún día se activa Plus/Gold |
| `/panel/eventos/[id]` — compradores/asistentes | — | — | — | **N/A — hallazgo real de la auditoría**: no existe ninguna tabla por fila de compradores/tickets/asistentes en esta página hoy. Solo muestra agregados (`orders-summary.js`, `analytics/index.js`) — vendidas/reservadas/recaudación/check-ins totales y desgloses por tipo de entrada/fecha/hora. No se inventó una tabla nueva para paginar algo que no existía (mandato: "NO agrega producto nuevo") |

## Patrón de paginación

Paginación tradicional real, nunca infinite scroll ni carga-y-oculta: botones "← Anterior" / números de página en ventana compacta / "Siguiente →", implementados en `src/components/panel/PaginationControls.jsx` (renderiza `null` si `totalPages <= 1`). La ventana de números nunca crece con `totalPages` — siempre muestra como máximo primera, última, actual±1 y elipsis, verificado hasta 80 páginas (2.000 filas / 25).

## Page sizes

- **Listados de iniciativas** (`/panel/inscripciones`, `/panel/eventos`): **12**. Justificación: son listas de una sola columna (`display: grid`, `maxWidth: 900px`); 12 tarjetas llenan una pantalla completa sin scroll excesivo en móvil ni desktop, y es una cifra redonda consistente con el resto del panel.
- **Participantes de una actividad**: **25** (mandatado explícitamente).

## Estrategia de conteo (sin descargar filas solo para contar)

`src/lib/panelPagination.js` centraliza:
- `parsePage(raw)` — sanea `?page=`: cualquier valor no-entero-positivo-razonable cae a `1` (nunca error 400 por esto; nunca NaN/negativo/float propagado a un `.range()`); un overflow absurdo se clampea a `1_000_000`.
- `resolvePagination(page, pageSize, total)` — calcula `totalPages` (mínimo 1 aunque `total=0`), clampea la página pedida a `totalPages` (page > totalPages cae a la última página real, nunca a un offset fuera de rango) y devuelve el `from`/`to` exactos para `.range()`.

Cada endpoint hace un `count: 'exact', head: true` real (cero filas descargadas solo para contar) antes de pedir la página con `.range()`. Para los contadores por tarjeta de `/api/inscripciones/mine` (`registered_count`/`checked_in_count`), el enfoque anterior descargaba TODAS las filas de `registration_participants` de TODAS las actividades del organizador — reemplazado por 2 counts exactos (`head: true`) por cada una de las ≤12 actividades de la página actual: acotado por `PAGE_SIZE`, nunca por el volumen real de inscritos. Para `/api/inscripciones/[id]/participants`, `summary.registered/checked_in/pending` vienen de 2 counts exactos sobre la tabla completa de la actividad, independientes de qué página de participantes se esté viendo.

Punto de extensión futuro (búsqueda por nombre/email/teléfono o por título de actividad, sección 11 del mandato) documentado con un comentario en cada endpoint, en el lugar exacto donde se agregaría un `.ilike(...)`/`.or(...)` — **no implementado**, para no ampliar el alcance de esta misión.

## Cambios de API (backward-compatible dentro de este repo)

Los 3 endpoints (`/api/inscripciones/mine`, `/api/events/mine`, `/api/inscripciones/[id]/participants`) ahora devuelven:

```json
{
  "ok": true,
  "items": [ /* solo la página pedida */ ],
  "pagination": { "page": 1, "pageSize": 12, "total": 37, "totalPages": 4 },
  "summary": { "registered": 42, "checked_in": 10, "pending": 32 }
}
```

(`summary` solo en `participants.js`.) Se auditó primero que cada endpoint tiene exactamente UN consumidor real (su propia página de panel) — se actualizaron ambos en el mismo cambio, sin necesidad de mantener el shape anterior para nadie más.

## Excel — sin cambios

`GET /api/inscripciones/[id]/export.js` es un endpoint completamente separado de `participants.js`, que nunca tuvo límite — sigue consultando el dataset completo de la actividad sin `.range()` ni `?page=`. No se tocó.

## Seguridad

Ownership sigue siendo autoridad exclusiva de cada endpoint (`organizer_id`/`activity.organizer_id` comparado server-side antes de cualquier count/range) — el boundary SSR de cada página panel sigue siendo autenticación, nunca autorización, sin cambios de esta misión. Ningún `page`/`id` adversarial puede exponer datos de otro organizador: la paginación solo acota CUÁNTAS filas propias se devuelven, nunca DE QUIÉN.

## Mobile

`PaginationControls` usa `flexWrap: 'wrap'` y una ventana compacta de números — verificado que nunca desborda horizontalmente incluso con 80 páginas reales (2.000 filas / 25).

## Tests

`tests/panelPagination.test.mjs` (23 tests): matemática pura de paginación (incluye el stress lógico de 50/200/2000 simulados — sin huecos, sin duplicados, cobertura exacta, cada página pide como máximo `PAGE_SIZE` filas) + verificación estructural de que los endpoints/páginas reales usan `.range()`/`count: 'exact', head: true`/`PaginationControls`, que el Excel sigue sin límite, que el ownership sigue intacto, y que el boundary SSR no se tocó.

## Deuda real / fuera de alcance

- `/panel/eventos/[id]` no tiene tabla de compradores/asistentes por fila — no se inventó una para esta misión. Si en el futuro se agrega esa UI, deberá nacer paginada desde el primer commit, usando el mismo `PaginationControls`/`panelPagination.js` ya construidos acá.
- Búsqueda (`?q=`) documentada como punto de extensión, no implementada.
- `orders-summary.js` (Eventos) sigue descargando el conjunto completo de órdenes/tipos de entrada/tickets emitidos de un evento para sumarlos en JS — es un endpoint de agregados (nunca envía filas individuales al cliente), fuera del alcance explícito de esta misión (que es sobre listados paginables, no sobre cada query de agregación existente en el código).
