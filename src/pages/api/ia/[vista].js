// GET /api/ia/{clientes|recargas|consumo} — panel «Warp IA». Solo admins
// (resolveAdmin). Lee la API de operación de Warp desde el servidor; no
// guarda, no duplica saldos y no procesa cobros. Ver src/lib/warpIaPanel.js.
import { resolveAdmin } from '@/lib/adminAuth';
import { WARP_IA_VIEWS, fetchWarpIaView } from '@/lib/warpIaPanel';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const auth = await resolveAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  const vista = String(req.query.vista || '');
  if (!Object.prototype.hasOwnProperty.call(WARP_IA_VIEWS, vista)) return res.status(404).json({ ok: false, error: 'not_found' });
  const out = await fetchWarpIaView(vista);
  return res.status(200).json({ ok: true, vista, ...out, fetched_at: new Date().toISOString() });
}
