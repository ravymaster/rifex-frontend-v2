// POST /api/internal/dev-keepalive — keepalive de Supabase DEV.
// Solo existe en Rifex DEV y con el secreto del keepalive configurado;
// en cualquier otro caso responde 404. Ver src/lib/devKeepalive.js y
// docs/DEV_KEEPALIVE.md.
import { createDevKeepaliveRoute } from '@/lib/devKeepalive';

export default createDevKeepaliveRoute();
