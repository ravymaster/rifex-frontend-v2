// src/pages/api/warp/health.js
// Health check del Connector de Warp para Rifex: confirma que el Connector
// carga sus capacidades. No consulta la base ni expone configuración.
import { getRifexConnector, RIFEX_PLATFORM, CONNECTOR_INFO } from '@/lib/warp/rifexConnector';
import { createPagesRoute } from '@/lib/warp/pagesRoute';

export const config = { api: { bodyParser: false } };

function healthHandler() {
  return async () => {
    const capabilities = getRifexConnector().listCapabilities().length;
    return new Response(
      JSON.stringify({
        success: true,
        data: { status: 'ok', platform: RIFEX_PLATFORM.id, platformVersion: RIFEX_PLATFORM.version, connector: CONNECTOR_INFO.version, capabilities },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
}

export default createPagesRoute(healthHandler, { scope: 'warp-health' });
