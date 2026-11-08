// src/lib/warp/rifexConnector.js
// Connector de Warp AI para Rifex (V1, solo lectura), sobre el SDK
// certificado `@warp-ai/connector` 0.4.0 — el mismo patrón ya validado en
// Renacar: Discovery en GET /api/v1/discovery y cada capacidad en
// GET /api/warp/capabilities/:id, con argumentos en la query string.
//
//   - Todas las capacidades son de lectura, `authentication: "public"` y
//     `risk: "low"`; el SDK rechaza al registrar cualquier definición con
//     forma de escritura.
//   - Los handlers solo llaman a la capa de lectura pública de Rifex
//     (src/lib/warp/publicCatalog.js y rifexServices.js): Warp nunca toca la
//     base, nunca recibe secretos y nunca ve ids internos.
//   - Esquemas cerrados (`additionalProperties: false`). Los campos sin valor
//     se omiten de la respuesta (el SDK no admite tipos anulables).
//   - Rifas, Medidor QR (lectura), pagos, checkout, panel y administración
//     quedan fuera.
//   - Autenticación servidor a servidor: mejora futura coordinada entre Warp
//     AI Engine y el SDK; en V1 las capacidades son públicas, como Renacar.
import { createConnector } from '@warp-ai/connector';
import * as catalog from './publicCatalog.js';
import { listServices } from './rifexServices.js';

export const RIFEX_PLATFORM = Object.freeze({ id: 'rifex', name: 'Rifex', version: '1.0', locale: 'es-CL' });
export const CONNECTOR_INFO = Object.freeze({ id: '@warp-ai/connector', version: '0.4.0' });
export const CAPABILITY_IDS = Object.freeze([
  'rifex.services.list',
  'rifex.events.list',
  'rifex.event.read',
  'rifex.campaigns.list',
  'rifex.campaign.read',
  'rifex.registrations.list',
  'rifex.registration.read',
]);

// Quita claves nulas o indefinidas de los objetos (recursivo); los arreglos
// conservan sus elementos.
export function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined) continue;
      out[k] = compact(v);
    }
    return out;
  }
  return value;
}

const str = (extra = {}) => ({ type: 'string', ...extra });
const int = (extra = {}) => ({ type: 'integer', ...extra });
const bool = (extra = {}) => ({ type: 'boolean', ...extra });
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const arr = (items, extra = {}) => ({ type: 'array', items, ...extra });

const pagingInput = {
  page: int({ description: 'Página a mostrar, desde 1. Valores fuera de rango se ajustan a 1.' }),
  pageSize: int({ description: 'Resultados por página: 5 por defecto, máximo 20 (un valor mayor se ajusta a 20).' }),
};
const queryInput = str({ description: 'Búsqueda opcional por título (texto libre, hasta 60 caracteres; se ignoran símbolos especiales).' });
const slugInput = obj({ slug: str({ description: 'Slug público tal como aparece en el listado (letras minúsculas, números y guiones).' }) }, ['slug']);
const pageEnvelope = (itemSchema) =>
  obj(
    {
      items: arr(itemSchema),
      page: int(),
      pageSize: int(),
      total: int({ description: 'Cantidad total de resultados públicos que coinciden con la búsqueda.' }),
      totalPages: int(),
    },
    ['items', 'page', 'pageSize', 'total', 'totalPages']
  );
const readEnvelope = (key, schema) =>
  obj({ ok: bool(), [key]: schema, reason: str({ enum: ['not_found'], 'x-presentation': 'hidden' }) }, ['ok']);

const organizerSchema = obj({ name: str({ title: 'Organizador' }) }, ['name']);
const urlField = str({ title: 'Enlace', description: 'Página pública en Rifex.', 'x-presentation': 'detail' });
// Fechas: `format: "date-time"` (RFC 3339 con zona, validado por el SDK). Sin
// `x-timezone`: cada evento e inscripción declara su propia zona en el campo
// `timezone` (hoy America/Santiago, pero las APIs aceptan otras), así que no
// hay una zona única para todo el sitio.
const dateField = (title) => str({ title, format: 'date-time', description: 'Fecha y hora RFC 3339 con zona.' });

const eventCard = {
  slug: str({ 'x-presentation': 'hidden' }),
  title: str({ 'x-presentation': 'title' }),
  summary: str({ 'x-presentation': 'detail' }),
  cover_image_url: str({ 'x-presentation': 'hidden' }),
  starts_at: dateField('Inicio'),
  ends_at: dateField('Término'),
  timezone: str({ 'x-presentation': 'hidden' }),
  venue_name: str({ title: 'Lugar', 'x-presentation': 'detail' }),
  url: urlField,
};
const eventListItem = obj(
  {
    ...eventCard,
    price_from_clp: int({ title: 'Desde (CLP)', description: 'Precio más bajo entre las entradas activas, en pesos chilenos.' }),
    price_to_clp: int({ title: 'Hasta (CLP)', description: 'Precio más alto entre las entradas activas, en pesos chilenos.' }),
  },
  ['slug', 'title', 'starts_at', 'url']
);
const ticketTypeSchema = obj(
  {
    name: str({ 'x-presentation': 'title' }),
    price_clp: int({ title: 'Precio (CLP)' }),
    available: int({ title: 'Disponibles', description: 'Entradas aún disponibles de este tipo (aproximado; nunca reserva).' }),
    max_per_order: int({ title: 'Máximo por compra' }),
    sales_start_at: dateField('Inicio de venta'),
    sales_end_at: dateField('Fin de venta'),
  },
  ['name', 'available']
);
const eventDetail = obj(
  {
    ...eventCard,
    description: str({ title: 'Descripción' }),
    address: str({ title: 'Dirección', 'x-presentation': 'detail' }),
    capacity: int({ title: 'Aforo total' }),
    terms_text: str({ title: 'Condiciones' }),
    gallery_urls: arr(str(), { 'x-presentation': 'hidden' }),
    sales_open: bool({ title: 'Venta abierta', description: 'Indica si hoy se pueden comprar entradas en Rifex. La compra siempre se hace en la página del evento.' }),
    ticket_types: arr(ticketTypeSchema, { title: 'Tipos de entrada' }),
    organizer: organizerSchema,
  },
  ['slug', 'title', 'starts_at', 'sales_open', 'ticket_types', 'gallery_urls', 'url']
);

const campaignCard = {
  slug: str({ 'x-presentation': 'hidden' }),
  title: str({ 'x-presentation': 'title' }),
  summary: str({ 'x-presentation': 'detail' }),
  cover_image_url: str({ 'x-presentation': 'hidden' }),
  status: str({ enum: ['active', 'finished', 'closed'], title: 'Estado' }),
  start_at: dateField('Inicio'),
  end_at: dateField('Cierre'),
  goal_clp: int({ title: 'Meta (CLP)' }),
  raised_clp: int({ title: 'Recaudado (CLP)', description: 'Total agregado de aportes aprobados.' }),
  contributor_count: int({ title: 'Aportes', description: 'Cantidad agregada de aportes aprobados.' }),
  organizer: organizerSchema,
  url: urlField,
};
const campaignListItem = obj(campaignCard, ['slug', 'title', 'status', 'raised_clp', 'contributor_count', 'url']);
const campaignDetail = obj(
  { ...campaignCard, description: str({ title: 'Descripción' }), gallery_urls: arr(str(), { 'x-presentation': 'hidden' }) },
  ['slug', 'title', 'status', 'raised_clp', 'contributor_count', 'gallery_urls', 'url']
);

const registrationCard = {
  slug: str({ 'x-presentation': 'hidden' }),
  title: str({ 'x-presentation': 'title' }),
  summary: str({ 'x-presentation': 'detail' }),
  cover_image_url: str({ 'x-presentation': 'hidden' }),
  starts_at: dateField('Inicio'),
  ends_at: dateField('Término'),
  timezone: str({ 'x-presentation': 'hidden' }),
  modality: str({ enum: [...catalog.REGISTRATION_MODALITIES], title: 'Modalidad' }),
  venue_name: str({ title: 'Lugar', 'x-presentation': 'detail' }),
  capacity: int({ title: 'Cupos totales' }),
  available_slots: int({ title: 'Cupos disponibles' }),
  status: str({ enum: ['active'], 'x-presentation': 'hidden' }),
  organizer_name: str({ title: 'Organizador' }),
  url: urlField,
};
const registrationListItem = obj(registrationCard, ['slug', 'title', 'starts_at', 'status', 'url']);
const registrationDetail = obj(
  {
    ...registrationCard,
    description: str({ title: 'Descripción' }),
    address: str({ title: 'Dirección', 'x-presentation': 'detail' }),
    instructions: str({ title: 'Indicaciones' }),
  },
  ['slug', 'title', 'starts_at', 'status', 'url']
);

const serviceItem = obj(
  {
    service: str({ enum: ['events', 'campaigns', 'registrations', 'qr_meter'], 'x-presentation': 'hidden' }),
    name: str({ 'x-presentation': 'title' }),
    summary: str({ 'x-presentation': 'detail' }),
    when_to_use: str({ title: 'Cuándo usarlo' }),
    pricing: str({ title: 'Costo' }),
    requires_mercado_pago: bool({ title: 'Requiere Mercado Pago' }),
    mercado_pago_note: str({ title: 'Mercado Pago' }),
    uses_qr: bool({ title: 'Usa QR' }),
    organizer_receives: str({ title: 'Qué recibe el organizador' }),
    url: urlField,
  },
  ['service', 'name', 'summary', 'when_to_use', 'pricing', 'requires_mercado_pago', 'mercado_pago_note', 'uses_qr', 'organizer_receives', 'url']
);

// `source` permite inyectar una capa de datos de prueba en los tests; en
// ejecución real siempre es la capa pública de Rifex.
export function createRifexConnector(source = { ...catalog, listServices }) {
  const connector = createConnector({ platform: { ...RIFEX_PLATFORM }, connector: { ...CONNECTOR_INFO } });
  const common = { risk: 'low', authentication: 'public' };

  connector.capability({
    ...common,
    id: 'rifex.services.list',
    description:
      'Lista los servicios que Rifex ofrece mediante el asistente (Eventos, Campañas, Inscripciones y Medidor QR): para qué sirve cada uno, ' +
      'su costo, si requiere Mercado Pago, si usa QR y qué recibe el organizador. Rifas no se ofrece mediante el asistente.',
    inputSchema: obj({}),
    outputSchema: obj(
      { version: str({ 'x-presentation': 'hidden' }), commission_note: str({ title: 'Comisión' }), items: arr(serviceItem) },
      ['version', 'commission_note', 'items']
    ),
    handler: async () => compact(source.listServices()),
  });

  connector.capability({
    ...common,
    id: 'rifex.events.list',
    description:
      'Lista eventos públicos vigentes (publicados y no terminados), del más próximo al más lejano, con paginación. ' +
      'Incluye rango de precios de las entradas activas. Nunca reserva ni inicia compras.',
    inputSchema: obj({ query: queryInput, ...pagingInput }),
    outputSchema: pageEnvelope(eventListItem),
    handler: async (args) => compact(await source.listEvents(args)),
  });

  connector.capability({
    ...common,
    id: 'rifex.event.read',
    description:
      'Entrega el detalle público de un evento a partir de su slug: fechas, lugar, condiciones, tipos de entrada con precio y disponibilidad ' +
      'aproximada, y si la venta está abierta. Si no existe o no es público responde ok=false con reason=not_found.',
    inputSchema: slugInput,
    outputSchema: readEnvelope('event', eventDetail),
    handler: async (args) => compact(await source.readEvent(args)),
  });

  connector.capability({
    ...common,
    id: 'rifex.campaigns.list',
    description:
      'Lista campañas de recaudación activas, de la más reciente a la más antigua, con paginación. Incluye meta y recaudación agregada; ' +
      'nunca aportes individuales ni datos de quienes aportan.',
    inputSchema: obj({ query: queryInput, ...pagingInput }),
    outputSchema: pageEnvelope(campaignListItem),
    handler: async (args) => compact(await source.listCampaigns(args)),
  });

  connector.capability({
    ...common,
    id: 'rifex.campaign.read',
    description:
      'Entrega el detalle público de una campaña a partir de su slug, con meta, recaudación y cantidad de aportes agregadas. ' +
      'Si no existe o no es pública responde ok=false con reason=not_found.',
    inputSchema: slugInput,
    outputSchema: readEnvelope('campaign', campaignDetail),
    handler: async (args) => compact(await source.readCampaign(args)),
  });

  connector.capability({
    ...common,
    id: 'rifex.registrations.list',
    description:
      'Lista actividades con inscripción abierta y vigentes, de la más próxima a la más lejana, con paginación y filtro opcional de modalidad. ' +
      'Incluye cupos disponibles; nunca datos de inscritos.',
    inputSchema: obj({
      query: queryInput,
      modality: str({ enum: [...catalog.REGISTRATION_MODALITIES], description: 'Modalidad exacta del enum.' }),
      ...pagingInput,
    }),
    outputSchema: pageEnvelope(registrationListItem),
    handler: async (args) => compact(await source.listRegistrations(args)),
  });

  connector.capability({
    ...common,
    id: 'rifex.registration.read',
    description:
      'Entrega el detalle público de una actividad con inscripción a partir de su slug: fechas, modalidad, lugar, indicaciones y cupos. ' +
      'Si no existe o no está abierta responde ok=false con reason=not_found. Nunca inscribe a nadie.',
    inputSchema: slugInput,
    outputSchema: readEnvelope('registration', registrationDetail),
    handler: async (args) => compact(await source.readRegistration(args)),
  });

  return connector;
}

let instance = null;
export function getRifexConnector() {
  if (!instance) instance = createRifexConnector();
  return instance;
}
