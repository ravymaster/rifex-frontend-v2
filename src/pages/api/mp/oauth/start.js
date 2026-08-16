// src/pages/api/mp/oauth/start.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const config = { runtime: "nodejs" };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// base URL (prod o preview) según headers
function resolveBaseUrl(req) {
  const cfg = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (cfg) return cfg;
  const proto = (req.headers["x-forwarded-proto"] || "https") + "://";
  const host = req.headers.host || "localhost:3000";
  return `${proto}${host}`;
}

// PKCE helpers
function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function genPkce() {
  const verifier = base64url(crypto.randomBytes(48)); // ~64 chars
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}
function genStateId() {
  return base64url(crypto.randomBytes(24));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.writeHead(405, { "Cache-Control": "no-store" }).end("method_not_allowed");
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const clientId = process.env.MP_CLIENT_ID;
    if (!clientId) {
      return res.writeHead(302, { Location: "/panel/bancos?mp=missing_creds" }).end();
    }

    // Identidad verificada por sesión (cookie): antes se aceptaba ?uid= sin
    // validar nada, lo que permitía asociar la cuenta de Mercado Pago de
    // CUALQUIERA (uid ajeno + autorización propia) al usuario elegido por
    // quien arma el link — un secuestro directo de los ingresos de la rifa.
    const s = getSupabaseServer(req, res);
    const { data: { user } = {} } = await s.auth.getUser();
    if (!user) {
      return res.writeHead(302, { Location: "/login?next=/panel/bancos" }).end();
    }
    const uid = user.id;
    const creatorEmail = (user.email || "").toString().trim().toLowerCase() || null;

    // Limpieza best-effort de states viejos (> 60 min)
    try {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await supabase.from("mp_oauth_state").delete().lt("created_at", cutoff);
    } catch {}

    // PKCE + state
    const { verifier, challenge } = genPkce();
    const state = genStateId();

    const base = resolveBaseUrl(req);
    const redirectUri = `${base}/api/mp/oauth/callback`;

    // Guardar state en DB (lo leerá el callback)
    const { error: insErr } = await supabase.from("mp_oauth_state").insert({
      id: state,
      code_verifier: verifier,
      creator_email: creatorEmail,
      uid,
      created_at: new Date().toISOString(),
    });
    if (insErr) {
      console.error("[mp/oauth/start] state insert error:", insErr);
      return res.writeHead(302, { Location: "/panel/bancos?mp=error_state" }).end();
    }

    // Cookie de respaldo con el code_verifier
    res.setHeader("Set-Cookie", [
      `mp_pkce=${verifier}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    ]);

    // Armar URL de autorización de MP
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      platform_id: "mp",
      // scope: "offline_access", // descomenta si tu app lo requiere
    });

    const authUrl = `https://auth.mercadopago.com/authorization?${params.toString()}`;
    return res.writeHead(302, { Location: authUrl }).end();
  } catch (e) {
    console.error("[mp/oauth/start] fatal:", e?.message || e);
    return res.writeHead(302, {
      Location: `/panel/bancos?mp=error&reason=${encodeURIComponent(e?.message || "start_failed")}`,
    }).end();
  }
}


