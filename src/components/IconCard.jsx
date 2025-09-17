// components/IconCard.jsx
export default function IconCard({
  src, alt, number,
  status = "available",   // "available" | "reserved" | "sold"
  selected = false,
  onToggle
}) {
  const isSold = status === "sold";
  const isReserved = status === "reserved";

  return (
    <button
      onClick={onToggle}
      disabled={isSold}
      title={isSold ? "Vendido" : isReserved ? "Reservado" : "Disponible"}
      style={{
        position: "relative",
        width: 128, height: 128,
        borderRadius: 24,
        overflow: "hidden",
        border: selected ? "3px solid #00F0FF" : "2px solid rgba(255,255,255,0.08)",
        boxShadow: selected ? "0 0 14px rgba(0,240,255,.45)" : "0 2px 10px rgba(0,0,0,.25)",
        filter: isSold ? "grayscale(1) brightness(.85)" : isReserved ? "saturate(.8)" : "none",
        cursor: isSold ? "not-allowed" : "pointer",
        background: "transparent",
        padding: 0
      }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{ width: "100%", height: "100%", display: "block", borderRadius: 24 }}
      />

      {/* Número abajo-derecha (nuestro “hueco libre”) */}
      <span style={{
        position: "absolute", right: 8, bottom: 8,
        fontWeight: 800, fontSize: 18, color: "#00F0FF",
        textShadow: "0 0 6px rgba(0,0,0,.6)"
      }}>
        {number}
      </span>

      {/* Badge de estado */}
      {isReserved && (
        <span style={{
          position:"absolute", left:8, top:8, fontSize:12, fontWeight:700,
          padding:"2px 6px", borderRadius:12, background:"rgba(255, 215, 0, .9)", color:"#111"
        }}>Reservado</span>
      )}
      {isSold && (
        <span style={{
          position:"absolute", left:8, top:8, fontSize:12, fontWeight:700,
          padding:"2px 6px", borderRadius:12, background:"rgba(255, 77, 77, .95)", color:"#fff"
        }}>Vendido</span>
      )}
    </button>
  );
}

