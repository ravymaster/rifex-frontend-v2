// GET /api/mp/oauth/start
export default async function handler(req, res) {
  try {
    const clientId = process.env.MP_CLIENT_ID;
    if (!clientId) return res.status(500).send("Missing MP_CLIENT_ID");

    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
      `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    const redirectUri = `${base}/api/mp/oauth/callback`;

    // Opcional: recibimos email/uid para “ayudar” a enlazar
    const { email = "", uid = "" } = req.query || {};

    // Metemos email/uid dentro del 'state' (más un nonce simple)
    const stateObj = {
      nonce: Math.random().toString(36).slice(2),
      email,
      uid,
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

    const url = new URL("https://auth.mercadopago.com/authorization");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    return res.redirect(url.toString());
  } catch (e) {
    console.error("oauth/start error", e);
    return res.status(500).send("start_error");
  }
}
