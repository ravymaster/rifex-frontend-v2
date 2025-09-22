export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok:false, error:"Missing token" });

    const form = new URLSearchParams();
    form.append("response", token);
    form.append("secret", process.env.HCAPTCHA_SECRET);

    const r = await fetch("https://hcaptcha.com/siteverify", {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const j = await r.json();

    if (!j.success) return res.status(401).json({ ok:false, error:"Captcha failed" });
    return res.status(200).json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || "Server error" });
  }
}
