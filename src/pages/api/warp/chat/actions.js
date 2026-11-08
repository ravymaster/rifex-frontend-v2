// src/pages/api/warp/chat/actions.js
// Piloto local: acciones del asistente ("Ver más", "Actualizar", selección),
// resueltas por Warp sin llamar al modelo. Sin RIFEX_WARP_PILOT=on responde 404.
import { createWarpReadActionRouteHandler } from '@warp-ai/assistant';
import { createPilotPostRoute } from '@/lib/warp/assistantPilot';

export const config = { api: { bodyParser: false } };

export default createPilotPostRoute(createWarpReadActionRouteHandler);
