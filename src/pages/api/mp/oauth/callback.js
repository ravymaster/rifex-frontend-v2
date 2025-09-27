// src/pages/api/mp/oauth/callback.js
import { createClient } from "@supabase/supabase-js";

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

    // 1) Recuperar PKCE + metadatos
    const { data: st, error: stErr } = await supabaseSR
      .from("mp_oauth_state")
      .select("id, code_verifier, creator_email, uid")
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

    const clientId = process.env.MP_CLIENT_ID;
    const clientSecret = process.env.MP_CLIENT_SECRET || null; // opcional
    if (!clientId) {
      return res.redirect("/panel/bancos?mp=missing_creds");
    }

    const redirectUri = `${resolveBaseUrl(req)}/api/mp/oauth/callback`;

    // 2) Intercambio code -> tokens (PKCE; client_secret opcional)
    const tokenBody = {
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: st.code_verifier,
    };
    if (clientSecret) tokenBody.client_secret = clientSecret;

    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(tokenBody),
    });

    const tok = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      console.error("[mp/oauth/callback] token error:", tok);
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

    // 3) Complemento: email y public_key del owner
    let linked_email = st.creator_email || null;
    let mp_public_key = null;
    try {
      const meR = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const me = await meR.json();
      if (meR.ok) {
        linked_email = linked_email || me?.email || null;
        mp_public_key = me?.public_key || null;
      } else {
        console.warn("[mp/oauth/callback] users/me not ok:", me);
      }
    } catch (e) {
      console.warn("[mp/oauth/callback] users/me error:", e?.message || e);
    }

    // 4) Calcular expires_at (si viene expires_in) — tu tabla YA tiene esta col
    const now = Date.now();
    const expires_at = expires_in ? new Date(now + expires_in * 1000).toISOString() : null;

    // 5) Guardar vínculo en merchant_gateways — USAR columnas mp_*
    const upsertRow = {
      user_id: String(st.uid),
      provider: "mp",
      mp_user_id,
      linked_email,
      mp_public_key,
      mp_access_token: access_token,
      mp_refresh_token: refresh_token,
      live_mode,
      status: "connected",
      scope: tok?.scope || null,
      updated_at: new Date(now).toISOString(),
      expires_at,
    };

    const { error: upErr } = await supabaseSR
      .from("merchant_gateways")
      .upsert(upsertRow, { onConflict: "user_id,provider" });

    if (upErr) {
      console.error("[mp/oauth/callback] upsert merchant_gateways error:", upErr);
      const reason = encodeURIComponent(upErr.message || String(upErr));
      return res.redirect(`/panel/bancos?mp=upsert_error&reason=${reason}`);
    }

    // 6) Limpieza del state
    try {
      await supabaseSR.from("mp_oauth_state").delete().eq("id", state);
    } catch {}

    return res.redirect("/panel/bancos?mp=ok");
  } catch (e) {
    console.error("[mp/oauth/callback] fatal:", e);
    const reason = encodeURIComponent(e?.message || String(e));
    return res.redirect(`/panel/bancos?mp=error&reason=${reason}`);
  }
}




