// GET /api/warp-conversacional/solicitudes — mis solicitudes de piloto.
// POST /api/warp-conversacional/solicitudes — crear una solicitud (con sesión).
// Lógica y seguridad: src/lib/warpPilotServer.js.
import { createPilotRequestsRoute } from '@/lib/warpPilotServer';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

export default createPilotRequestsRoute();
