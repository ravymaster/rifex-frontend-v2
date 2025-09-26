// src/pages/api/mp/oauth/start.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Genera code_verifier (43-128 chars) y code_challenge (S256)
function genPkce() {
  const verifier = crypto.randomBytes(48).toString("base64url"); // ~64 chars
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest()
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { verifier, challenge };
}

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
    const clientId = process.env.MP_CLIENT_ID;
    if (!clientId) return res.status(500).send("missing_MP_CLIENT_ID");

    const base = resolveBaseUrl(req);
    const redirectUri = `${base}/api/mp/oauth/callback`;

    // (opcional) email/uid del creador para enlazar luego
    const creatorEmail = (req.query.email || "").toString().trim().toLowerCase();
    const uid = (req.query.uid || "").toString().trim();

    // Limpia states viejos (>30 min) best-effort
    try {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      await supabase.from("mp_oauth_state").delete().lt("created_at", cutoff);
    } catch {}

    // PKCE + state guardados de forma temporal en Supabase
    const { verifier, challenge } = genPkce();
    const state = crypto.randomBytes(16).toString("hex");

    const { error: insErr } = await supabase
      .from("mp_oauth_state")
      .insert({
        id: state,
        code_verifier: verifier,
        creator_email: creatorEmail || null,
        uid: uid || null,
        created_at: new Date().toISOString(),
      });
    if (insErr) {
      console.error("[mp oauth start] state insert error:", insErr);
      return res.status(500).send("oauth_state_insert_error");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      platform_id: "mp", // recomendado para marketplace
      // scope: "offline_access", // descomenta si tu app MP lo requiere
    });

    const authUrl = `https://auth.mercadopago.com/authorization?${params.toString()}`;
    return res.redirect(authUrl);
  } catch (e) {
    console.error("[mp oauth start] error:", e);
    return res.status(500).send("oauth_start_error");
  }
}

