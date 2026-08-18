// src/lib/adminAuth.js
// Autoridad admin real (A1). Reusa exactamente el mismo primitivo de
// identidad que ya usa todo el proyecto (Bearer token + auth.getUser()
// contra el service role) — nada nuevo que aprender ni mantener. La
// autoridad es user.app_metadata.role === 'admin': ese campo solo se
// puede escribir vía el Admin API de Supabase (service role), nunca desde
// el cliente, y getUser() lo trae siempre fresco (no cacheado en el JWT),
// así que revocar el role surte efecto de inmediato sin re-login.
//
// Deliberadamente separado de ADMIN_API_TOKEN (reconcile-payments.js,
// reconcile-colecta-payments.js): esa es otra autoridad, ya certificada,
// para jobs de reconciliación financiera — no se toca ni se reemplaza acá.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Nunca devuelve app_metadata completo ni el user object crudo — solo lo
// mínimo que un caller necesita (email, id) para no arriesgar filtrar algo
// sensible que a futuro se guarde ahí.
export async function resolveAdmin(req) {
  const authz = req.headers.authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return { ok: false, status: 401, error: "missing_auth" };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: "invalid_auth" };

  if (data.user.app_metadata?.role !== "admin") {
    return { ok: false, status: 403, error: "forbidden" };
  }

  return { ok: true, admin: { id: data.user.id, email: data.user.email || null } };
}
