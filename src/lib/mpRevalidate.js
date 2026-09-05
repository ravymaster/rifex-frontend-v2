// ONBOARDING+BANCOS/MP — revalida una conexión de Mercado Pago YA
// EXISTENTE sin desconectar ni volver a ejecutar OAuth. Corrige el bug
// real observado: una cuenta conectada desde antes de que existiera
// mp_identity_match queda "conectada" pero nunca validada, y hasta
// ahora la única forma de forzar la validación era desconectar y
// reconectar. Este módulo reutiliza el access_token ya guardado para
// volver a consultar GET /users/me y aplica exactamente la misma regla
// TRUST-3B ya certificada (src/lib/mpIdentityMatchGate.js) -- nunca
// reimplementada acá. Separado de la ruta API (src/pages/api/mp/
// revalidate.js) para que la lógica real sea testeable directamente,
// mismo criterio que el resto de la suite (ej. adminFulfillmentReview.js).
//
// Nunca crea una segunda fila merchant_gateway (siempre UPDATE sobre la
// fila existente vía resolveMpIdentityMatch/revocación), nunca envía el
// token al navegador, nunca lo imprime en logs ni en la respuesta.
import { createClient } from "@supabase/supabase-js";
import { resolveMpIdentityMatch } from "./mpIdentityMatchGate.js";
import { MP_MATCH_STATUS } from "./mpIdentityMatchPolicy.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function safeErrorMessage(err) {
  if (!err) return null;
  const s = typeof err === "string" ? err : err?.message || String(err);
  return String(s).slice(0, 300);
}

// Inyectable únicamente para tests (nunca usado por el código real en
// producción) -- permite certificar los tres caminos (200/401-403/
// fallo transitorio) sin depender de la red real de Mercado Pago.
export async function revalidateMpConnection(userId, { fetchUsersMe } = {}) {
  const doFetch =
    fetchUsersMe ||
    (async (accessToken) => {
      const res = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { status: res.status, ok: res.ok, json: res.ok ? await res.json().catch(() => null) : null };
    });

  const { data: gw, error: gwErr } = await supabase
    .from("merchant_gateways")
    .select("access_token, mp_access_token, mp_user_id, status, revoked_at, expires_at")
    .eq("user_id", userId)
    .eq("provider", "mp")
    .maybeSingle();
  if (gwErr) throw gwErr;

  const isConnected =
    gw && !gw.revoked_at && gw.status === "connected" && (!gw.expires_at || new Date(gw.expires_at).getTime() > Date.now());

  if (!isConnected) {
    // No hay nada que revalidar sin volver a conectar -- nunca se
    // intenta llamar a Mercado Pago con un token que ya sabemos
    // ausente/expirado/revocado localmente.
    return { status: "not_connected", reason: null };
  }

  const accessToken = gw.access_token || gw.mp_access_token || null;
  if (!accessToken) {
    return { status: "not_connected", reason: null };
  }

  let usersMeResponse = null;
  let tokenInvalid = false;

  try {
    const me = await doFetch(accessToken);
    if (me.status === 401 || me.status === 403) {
      tokenInvalid = true;
    } else if (me.ok) {
      usersMeResponse = me.json || null;
    }
    // Cualquier otro status no-ok (500, 429, etc.) queda como
    // usersMeResponse=null -- se resuelve como 'unavailable' más abajo,
    // mismo criterio que ya usa el callback de OAuth cuando /users/me
    // no responde bien.
  } catch (e) {
    console.warn("[mpRevalidate] users/me fetch error:", safeErrorMessage(e));
    // fetch lanzó (red caída, DNS, etc.) -- también resuelve a 'unavailable'.
  }

  if (tokenInvalid) {
    // La cuenta dejó de autorizar a Rifex (token expirado/revocado del
    // lado de Mercado Pago) -- se refleja acá mismo para que
    // /api/mp/status deje de reportarla como conectada (mismo criterio
    // que ya usa esa ruta: revoked_at/status). Nunca se interpreta como
    // "mismatch" -- es una categoría de fallo completamente distinta
    // (credencial muerta, no identidad discrepante), y nunca se
    // reintenta OAuth automáticamente acá.
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("merchant_gateways")
      .update({
        revoked_at: now,
        status: "not_connected",
        mp_identity_match: MP_MATCH_STATUS.NOT_CONNECTED,
        mp_identity_matched_at: now,
        mp_identity_match_reason: "token_revoked_or_expired",
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("provider", "mp");
    if (updErr) console.error("[mpRevalidate] error marcando token inválido:", safeErrorMessage(updErr));
    return { status: "reconnect_required", reason: "token_revoked_or_expired" };
  }

  // Éxito o fallo transitorio: en ambos casos se delega en la MISMA
  // función ya certificada (TRUST-3B) que usa el callback de OAuth --
  // usersMeResponse=null produce 'unavailable' exactamente igual que
  // cuando el callback no pudo leer /users/me, sin duplicar lógica.
  const { status, reason } = await resolveMpIdentityMatch({ userId, mpUserId: gw.mp_user_id, usersMeResponse });
  return { status, reason: reason || null };
}
