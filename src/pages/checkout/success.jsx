// src/pages/checkout/success.jsx
import { useEffect, useState } from "react";
import { markGreeted } from "@/lib/greetOnce";

function getParams() {
  const u = new URL(typeof window !== "undefined" ? window.location.href : "http://x");
  const payment_id =
    u.searchParams.get("payment_id") ||
    u.searchParams.get("collection_id");
  const status =
    u.searchParams.get("status") ||
    u.searchParams.get("collection_status");
  const preference_id = u.searchParams.get("preference_id");
  return { payment_id, status, preference_id };
}

export default function Success() {
  const [state, setState] = useState("loading"); // loading | ok | error
  const [resp, setResp] = useState(null);

  const doConfirm = async () => {
    try {
      const { payment_id, status, preference_id } = getParams();
      if (!preference_id) {
        setState("error");
        setResp({ error: "Missing preference_id in URL" });
        return;
      }

      const r = await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: payment_id ? String(payment_id) : null,
          status: status || "approved",
          preference_id,
        }),
      });

      const j = await r.json();
      setResp(j);
      setState(r.ok ? "ok" : "error");

      if (r.ok && j.raffleId) {
        // 👇 guardamos marca para mostrar banner en la rifa
        markGreeted(j.raffleId);
      }

      console.log("CONFIRM RESPONSE:", j);
    } catch (e) {
      console.error("CONFIRM ERROR:", e);
      setResp({ error: String(e) });
      setState("error");
    }
  };

  useEffect(() => {
    doConfirm();
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>¡Pago acreditado!</h1>
      <p>Validando y registrando tu compra…</p>

      {state === "loading" && <p>⏳ Procesando…</p>}
      {state === "ok" && <p>✅ Listo. Tus números quedaron marcados como vendidos.</p>}
      {state === "error" && (
        <div style={{ marginTop: 12 }}>
          <p>⚠️ No pudimos confirmar automáticamente. Puedes reintentarlo:</p>
          <button
            onClick={doConfirm}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Reintentar confirmación
          </button>
          {resp?.error && (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "#f7f7f7",
                padding: 10,
                borderRadius: 6,
                marginTop: 10,
              }}
            >
              {String(resp.error)}
            </pre>
          )}
        </div>
      )}

      {state === "ok" && resp?.raffleId && (
        <a
          href={`/rifas/${resp.raffleId}`}
          style={{ display: "inline-block", marginTop: 16 }}
        >
          Ver mi rifa
        </a>
      )}
    </div>
  );
}

