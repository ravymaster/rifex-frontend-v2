// src/pages/api/mp/oauth/callback.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
      (req.headers.origin ? String(req.headers.origin) : "");

    const clientId = process.env.MP_CLIENT_ID;
    const clientSecret = process.env.MP_CLIENT_SECRET;
    const redirectUri = `${base}/api/mp/oauth/callback`;

    const code = (req.query.code || "").toString();
    const state = (req.query.state || "").toString();

    if (!clientId || !clientSecret) {
      return res.status(500).send("Missing MP_CLIENT_ID/MP_CLIENT_SECRET");
    }
    if (!code || !state) {
      return res.status(400).send("Missing code/state");
    }

    // Recuperar el code_verifier (y metadata) guardado para este state
    const { data: st, error: stErr } = await supabase
      .from("mp_oauth_state")
      .select("id, code_verifier, creator_email, uid")
      .eq("id", state)
      .maybeSingle();

    if (stErr || !st?.code_verifier) {
      return res.status(400).send("Invalid state");
    }
    const codeVerifier = st.code_verifier;

    // Intercambio del code por tokens
    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("[mp oauth] token error:", tokenRes.status, t);
      return res.status(500).send("oauth_token_error");
    }
    const tok = await tokenRes.json();

    // tok => { access_token, refresh_token, user_id, public_key, token_type, expires_in, scope, live_mode }
    const {
      access_token,
      refresh_token,
      user_id,
      public_key,
      token_type,
      scope,
      live_mode,
      expires_in,
    } = tok || {};

    // Obtener info de la cuenta (nickname, email, etc.) → útil para mostrar “Conectado”
    let nickname = null;
    let mpEmail = null;
    try {
      const meRes = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const me = await meRes.json();
      nickname = me?.nickname || null;
      mpEmail = me?.email || null;
    } catch (e) {
      console.warn("[mp oauth] users/me failed:", e?.message || e);
    }

    // Guardar / actualizar cuenta conectada
    const nowIso = new Date().toISOString();
    await supabase.from("mp_accounts").upsert(
      {
        mp_user_id: String(user_id),
        access_token,
        refresh_token: refresh_token || null,
        public_key: public_key || null,
        token_type: token_type || null,
        scope: scope || null,
        live_mode: !!live_mode,
        nickname,
        email: mpEmail, // email de la cuenta de MP
        linked_email: st.creator_email || null, // email del creador en Rifex (si lo pasaste en /start?email=)
        linked_uid: st.uid || null, // uid del creador (si lo pasaste)
        updated_at: nowIso,
        created_at: nowIso,
        expires_in: Number.isFinite(expires_in) ? expires_in : null,
      },
      { onConflict: "mp_user_id" }
    );

    // Limpieza del state usado
    await supabase.from("mp_oauth_state").delete().eq("id", state);

    // Redirige al panel con estado de conexión
    return res.redirect(`${base}/panel/bancos?mp=connected`);
  } catch (e) {
    console.error("[mp oauth callback] error:", e);
    return res.status(500).send("oauth_callback_error");
  }
}
