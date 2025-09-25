// src/pages/api/mp/oauth/start.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const clientId = process.env.MP_CLIENT_ID;
    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
      (req.headers.origin ? String(req.headers.origin) : "");
    const redirectUri = `${base}/api/mp/oauth/callback`;

    if (!clientId || !redirectUri) {
      return res.status(500).send("Missing MP_CLIENT_ID or BASE_URL");
    }

    // (opcional) email/uid del creador para enlazar luego
    const creatorEmail = (req.query.email || "").toString().trim().toLowerCase();
    const uid = (req.query.uid || "").toString().trim();

    // PKCE + state guardados de forma temporal en Supabase
    const { verifier, challenge } = genPkce();
    const state = crypto.randomBytes(16).toString("hex");

    await supabase
      .from("mp_oauth_state")
      .insert({
        id: state,
        code_verifier: verifier,
        creator_email: creatorEmail || null,
        uid: uid || null,
        created_at: new Date().toISOString(),
      });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      // En integraciones marketplace suele indicarse el origen:
      platform_id: "mp", // no es obligatorio, pero recomendado
    });

    const authUrl = `https://auth.mercadopago.com/authorization?${params.toString()}`;
    return res.redirect(authUrl);
  } catch (e) {
    console.error("[mp oauth start] error:", e);
    return res.status(500).send("oauth_start_error");
  }
}
