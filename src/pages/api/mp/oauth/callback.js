// src/pages/api/mp/oauth/callback.js
import { createClient } from "@supabase/supabase-js";

const supabaseSR = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,           // service role
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const { code = "", state = "" } = req.query || {};
    if (!code || !state) return res.status(400).send("missing_code_or_state");

    // 1) Recuperar state + code_verifier que guardaste en start.js
    const { data: st, error: stErr } = await supabaseSR
      .from("mp_oauth_state")
      .select("id, code_verifier, creator_email, uid")
      .eq("id", state)
      .maybeSingle();

    if (stErr || !st) {
      console.error("oauth/callback: state not found", stErr);
      return res.redirect("/panel/bancos?mp=error_state");
    }

    const clientId = process.env.MP_CLIENT_ID;
    const clientSecret = process.env.MP_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect("/panel/bancos?mp=missing_creds");
    }

    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
      `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const redirectUri = `${base}/api/mp/oauth/callback`;

    // 2) Intercambiar code -> tokens (con PKCE: code_verifier)
    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,     // MP permite/espera secret para apps confidenciales
        code,
        redirect_uri: redirectUri,
        code_verifier: st.code_verifier, // <— PKCE
      }),
    });

    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      console.error("token error:", txt);
      return res.redirect("/panel/bancos?mp=token_error");
    }

    const tj = await tokenRes.json(); // { access_token, refresh_token, user_id, scope, live_mode, ... }
    const {
      access_token,
      refresh_token = null,
      user_id: mp_user_id,
      live_mode = false,
      scope = "",
    } = tj;

    // 3) (opcional) traer email/public_key del owner de la cuenta MP
    let linked_email = st.creator_email || null;
    let mp_public_key = null;
    try {
      const meRes = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const me = await meRes.json();
      linked_email = linked_email || me?.email || null;
      mp_public_key = me?.public_key || null;
    } catch (_) {}

    // 4) Guardar/actualizar vínculo en merchant_gateways
    if (!st.uid) {
      console.warn("callback: missing uid in state; cannot link to user");
      return res.redirect("/panel/bancos?mp=linked-no-uid");
    }

    const upsertRow = {
      user_id: st.uid,
      provider: "mp",
      mp_user_id: mp_user_id ? String(mp_user_id) : null,
      linked_email,
      linked_uid: st.uid,
      mp_public_key,
      mp_access_token: access_token,
      mp_refresh_token: refresh_token,
      scope: scope || null,
      live_mode: !!live_mode,
      updated_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabaseSR
      .from("merchant_gateways")
      .upsert(upsertRow, { onConflict: "user_id,provider" });

    if (upErr) {
      console.error("upsert merchant_gateways error:", upErr);
      return res.redirect("/panel/bancos?mp=upsert_error");
    }

    // 5) Limpieza: ya no necesitamos el state
    await supabaseSR.from("mp_oauth_state").delete().eq("id", state);

    return res.redirect("/panel/bancos?mp=ok");
  } catch (e) {
    console.error("oauth/callback error", e);
    return res.redirect("/panel/bancos?mp=error");
  }
}

