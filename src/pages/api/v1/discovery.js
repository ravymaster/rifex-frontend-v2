// src/pages/api/v1/discovery.js
// Discovery de Rifex para Warp AI (manifiesto `warp.discovery_manifest.v1`).
// Ruta fija exigida por Warp AI Engine. Solo describe las capacidades de
// lectura pública del Connector (src/lib/warp/rifexConnector.js): sin
// claves, rutas privadas, ids internos ni detalles de la base.
import { getRifexConnector } from '@/lib/warp/rifexConnector';
import { createPagesRoute } from '@/lib/warp/pagesRoute';

export const config = { api: { bodyParser: false } };

export default createPagesRoute(() => getRifexConnector().createDiscoveryRouteHandler(), { scope: 'warp-discovery' });
