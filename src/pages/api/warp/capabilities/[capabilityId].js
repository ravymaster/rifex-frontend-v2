// src/pages/api/warp/capabilities/[capabilityId].js
// Invocación de capacidades de lectura del Connector de Warp para Rifex.
// Una sola ruta para las capacidades registradas en
// src/lib/warp/rifexConnector.js; cualquier otro id responde
// CAPABILITY_NOT_FOUND. Solo GET, argumentos en la query string.
import { getRifexConnector } from '@/lib/warp/rifexConnector';
import { createPagesRoute } from '@/lib/warp/pagesRoute';

export const config = { api: { bodyParser: false } };

export default createPagesRoute(() => getRifexConnector().createCapabilityRouteHandler(), { scope: 'warp-capability' });
