// src/components/ConsentBanner.jsx
// Consentimiento mínimo de marketing (Meta Pixel). Solo se renderiza
// cuando el usuario todavía no decidió — ver _app.js. "Rechazar" nunca
// carga nada de Meta; "Aceptar" es la única forma de que se inicialice.
export default function ConsentBanner({ onAccept, onReject }) {
  return (
    <div
      role="dialog"
      aria-live="polite"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: "#111111",
        color: "#fff",
        padding: "14px 16px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
        justifyContent: "space-between",
        boxShadow: "0 -4px 16px rgba(0,0,0,.15)",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, maxWidth: 640 }}>
        Usamos tecnologías de medición y publicidad (Meta Pixel) para entender cómo se usa Rifex. Solo se activan
        si aceptas. Podés revisar más en{" "}
        <a href="/cookies" style={{ color: "#fff", textDecoration: "underline" }}>
          nuestra política de cookies
        </a>
        .
      </p>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onReject}
          style={{
            background: "transparent", color: "#fff", border: "1px solid #ffffff55",
            borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer",
          }}
        >
          Rechazar
        </button>
        <button
          type="button"
          onClick={onAccept}
          style={{
            background: "var(--trebol, #18A957)", color: "#fff", border: "none",
            borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer",
          }}
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
