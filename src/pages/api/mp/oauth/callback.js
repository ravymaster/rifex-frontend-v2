// src/pages/api/mp/oauth/callback.js
import { createClient } from "@supabase/supabase-js";
import { getMpAppConfig } from "@/lib/paymentEngine/mpAppConfig";
import { resolveMpIdentityMatch } from "@/lib/mpIdentityMatchGate";

const supabaseSR = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function resolveBaseUrl(req) {
  const cfg = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (cfg) return cfg;
  const proto = (req.headers["x-forwarded-proto"] || "https") + "://";
  const host = req.headers.host || "localhost:3000";
  return `${proto}${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("method_not_allowed");

  try {
    const code = String(req.query?.code || "");
    const state = String(req.query?.state || "");
    if (!code || !state) return res.status(400).send("missing_code_or_state");

    // 1) Recuperar PKCE + metadatos del state guardado en DB
    const { data: st, error: stErr } = await supabaseSR
      .from("mp_oauth_state")
      .select("id, code_verifier, creator_email, uid, country")
      .eq("id", state)
      .maybeSingle();

    if (stErr || !st) {
      console.error("[mp/oauth/callback] state not found:", stErr);
      return res.redirect("/panel/bancos?mp=error_state");
    }
    if (!st.uid) {
      console.warn("[mp/oauth/callback] missing uid in state. state:", st);
      return res.redirect("/panel/bancos?mp=missing_uid");
    }

    // AR2: misma app de MP resuelta en start.js, guardada en el state — no
    // se vuelve a inferir país acá. `st.country` puede venir null solo en
    // un state legado (creado antes de este deploy) — se trata como CL
    // para conservar el comportamiento existente sin interrupciones.
    const country = st.country || "CL";
    const mpAppConfig = getMpAppConfig(country);
    if (!mpAppConfig || !mpAppConfig.clientId) {
      return res.redirect("/panel/bancos?mp=country_config_missing");
    }
    const clientId = mpAppConfig.clientId;
    const clientSecret = mpAppConfig.clientSecret; // opcional si usas PKCE

    const redirectUri = `${resolveBaseUrl(req)}/api/mp/oauth/callback`;

    // 2) Intercambio code -> tokens (MP requiere x-www-form-urlencoded)
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: st.code_verifier,
    });
    if (clientSecret) body.set("client_secret", clientSecret);

    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const tok = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      console.error("[mp/oauth/callback] token error:", tokenRes.status, tok);
      const reason = encodeURIComponent(tok?.error_description || tok?.message || "token_error");
      return res.redirect(`/panel/bancos?mp=token_error&reason=${reason}`);
    }

    // Respuesta típica: { access_token, refresh_token, user_id, scope, live_mode, expires_in }
    const access_token = tok?.access_token || null;
    const refresh_token = tok?.refresh_token || null;
    const mp_user_id = tok?.user_id != null ? String(tok.user_id) : null;
    const live_mode = !!tok?.live_mode;
    const expires_in = Number(tok?.expires_in || 0);

    if (!access_token) {
      console.error("[mp/oauth/callback] missing access_token");
      return res.redirect("/panel/bancos?mp=token_error&reason=missing_access_token");
    }

    // 3) Complemento: email y public_key del owner (best effort). Se
    // conserva el objeto `me` completo en memoria (nunca en logs, nunca
    // persistido tal cual) para intentar la coincidencia de identidad
    // con Mercado Pago más abajo (Fase 5) — ver
    // src/lib/mpIdentityMatchGate.js, extractMpRutFromUsersMe.
    let linked_email = st.creator_email || null;
    let mp_public_key = null;
    let usersMeResponse = null;
    try {
      const meR = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const me = await meR.json().catch(() => null);
      if (meR.ok && me) {
        linked_email = linked_email || me?.email || null;
        mp_public_key = me?.public_key || null;
        usersMeResponse = me;
      } else {
        console.warn("[mp/oauth/callback] users/me not ok, status:", meR.status);
      }
    } catch (e) {
      console.warn("[mp/oauth/callback] users/me error:", e?.message || "fetch_failed");
    }

    // 4) Calcular expires_at
    const now = Date.now();
    const expires_at = expires_in ? new Date(now + expires_in * 1000).toISOString() : null;

    // 5) Guardar vínculo en merchant_gateways — escribe ambos access_token y mp_access_token
    const upsertRow = {
      user_id: String(st.uid),
      provider: "mp",
      country,
      mp_user_id,
      linked_email,
      mp_public_key,
      access_token,           // 👈 compat con /api/mp/status
      mp_access_token: access_token,
      mp_refresh_token: refresh_token,
      live_mode,
      status: "connected",
      scope: tok?.scope || null,
      updated_at: new Date(now).toISOString(),
      expires_at,
      revoked_at: null,
    };

    const { error: upErr } = await supabaseSR
      .from("merchant_gateways")
      .upsert(upsertRow, { onConflict: "user_id,provider" });

    if (upErr) {
      console.error("[mp/oauth/callback] upsert merchant_gateways error:", upErr);
      const reason = encodeURIComponent(upErr.message || String(upErr));
      return res.redirect(`/panel/bancos?mp=upsert_error&reason=${reason}`);
    }

    // 5b) Corrección canónica — Mercado Pago como control principal:
    // intenta la coincidencia de identidad ahora que la conexión quedó
    // guardada. Nunca bloquea el flujo si falla — el estado real queda
    // reflejado en mp_identity_match, y assertCreatorEligible (Fase 6)
    // es quien decide si eso permite continuar.
    try {
      await resolveMpIdentityMatch({ userId: String(st.uid), mpUserId: mp_user_id, usersMeResponse });
    } catch (e) {
      console.error("[mp/oauth/callback] resolveMpIdentityMatch error:", e?.message || "match_failed");
    }

    // 6) Limpieza del state
    try {
      await supabaseSR.from("mp_oauth_state").delete().eq("id", state);
    } catch {}

    return res.redirect("/panel/bancos?mp=connected");
  } catch (e) {
    console.error("[mp/oauth/callback] fatal:", e);
    const reason = encodeURIComponent(e?.message || String(e));
    return res.redirect(`/panel/bancos?mp=error&reason=${reason}`);
  }
}



