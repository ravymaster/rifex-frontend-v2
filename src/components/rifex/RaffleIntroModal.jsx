// src/components/rifex/RaffleIntroModal.jsx
import React from "react";

export default function RaffleIntroModal({ open, onClose, raffle }) {
  if (!open || !raffle) return null;
  const clp = (cents = 0) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })
      .format((cents || 0) / 100);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "92%", maxWidth: 560,
        padding: 20, position: "relative", boxShadow: "0 20px 50px rgba(0,0,0,.2)"
      }}>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: "absolute", right: -10, top: -10, width: 32, height: 32,
            borderRadius: "999px", background: "#ef4444", color: "#fff", border: "none",
            cursor: "pointer", fontWeight: 800
          }}
        >
          ✕
        </button>

        <div style={{ display: "inline-flex", gap: 8, alignItems: "center",
          border: "1px solid #e5e7eb", borderRadius: 999, padding: "6px 10px", color: "#475569", marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, background:"#18A957", borderRadius: "999px" }} />
          {raffle.theme || "Mixto"}
        </div>

        <h2 style={{ margin: "6px 0 12px", fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
          {raffle.title}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
          border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div>
            <div style={{ fontSize:12, color:"#64748b" }}>Premio</div>
            <div style={{ fontSize:18, fontWeight:800 }}>{clp(raffle.prize_amount_cents)}</div>
          </div>
          <div>
            <div style={{ fontSize:12, color:"#64748b" }}>Valor del número</div>
            <div style={{ fontSize:18, fontWeight:800 }}>{clp(raffle.price_cents)}</div>
          </div>
          <div>
            <div style={{ fontSize:12, color:"#64748b" }}>Termina</div>
            <div style={{ fontSize:16, fontWeight:700 }}>
              {raffle.end_date ? new Date(raffle.end_date).toLocaleDateString("es-CL") : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, color:"#64748b" }}>Estado</div>
            <div style={{ fontSize:16, fontWeight:700 }}>{raffle.status || "activa"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
