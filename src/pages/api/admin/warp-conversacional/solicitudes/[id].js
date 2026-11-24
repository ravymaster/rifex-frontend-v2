// GET /api/admin/warp-conversacional/solicitudes/[id] — detalle e historial.
// PATCH — cambio de estado y notas internas. Solo admins (resolveAdmin).
// Ver src/lib/warpPilotServer.js.
import { createAdminPilotDetailRoute } from '@/lib/warpPilotServer';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

export default createAdminPilotDetailRoute();
