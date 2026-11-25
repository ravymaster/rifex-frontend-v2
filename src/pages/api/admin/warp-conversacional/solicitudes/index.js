// GET /api/admin/warp-conversacional/solicitudes — listado admin con búsqueda
// y filtro por estado. Solo admins (resolveAdmin). Ver src/lib/warpPilotServer.js.
import { createAdminPilotListRoute } from '@/lib/warpPilotServer';

export default createAdminPilotListRoute();
