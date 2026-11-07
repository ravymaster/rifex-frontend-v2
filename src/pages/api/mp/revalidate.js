// src/pages/api/mp/revalidate.js
// ONBOARDING+BANCOS/MP — thin route: resuelve identidad + rate limit,
// delega toda la lógica real en src/lib/mpRevalidate.js (testeable
// directamente, sin reimplementar nada acá). Ver ese archivo para el
// detalle de por qué existe y qué garantías da.
import { createClient } from "@supabase/supabase-js";
import { enforceRateLimit, resolveClientIp } from "@/lib/rateLimit";
import { revalidateMpConnection } from "@/lib/mpRevalidate";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  // Identidad SIEMPRE resuelta desde el Bearer token -- nunca desde un
  // user_id/gateway_id que el cliente pudiera mandar. Un usuario jamás
  // puede revalidar la conexión de otro (no hay ningún parámetro de
  // "a quién" en esta request en absoluto).
  const authz = req.headers.authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "missing_auth" });

  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: "invalid_auth" });
  const userId = ures.user.id;

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `mp-revalidate:${userId}:${ip}`, maxHits: 10, windowSeconds: 60 })) return;

  try {
    const { status, reason } = await revalidateMpConnection(userId);
    return res.status(200).json({ ok: true, status, reason });
  } catch (e) {
    console.error("[api/mp/revalidate] error:", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
