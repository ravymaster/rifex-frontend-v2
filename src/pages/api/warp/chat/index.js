// src/pages/api/warp/chat/index.js
// Piloto local: proxy del chat del asistente de Warp (src/lib/warp/assistantPilot.js).
// La key de Warp vive solo en el servidor. Sin RIFEX_WARP_PILOT=on responde 404.
import { createWarpChatRouteHandler } from '@warp-ai/assistant';
import { createPilotPostRoute } from '@/lib/warp/assistantPilot';

export const config = { api: { bodyParser: false } };

// Tiempo de espera de salida hacia Warp: una respuesta con lecturas puede
// tardar más que el valor por defecto del paquete.
export default createPilotPostRoute(createWarpChatRouteHandler, { timeoutMs: 120_000 });
