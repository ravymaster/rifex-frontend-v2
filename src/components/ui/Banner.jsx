// src/components/ui/Banner.jsx
export default function Banner({ type = "success", onClose, children }) {
  const palette = {
    success: { bg: "#e6ffed", bd: "#b7eb8f", fg: "#135200" },
    info:    { bg: "#e6f4ff", bd: "#91caff", fg: "#10239e" },
    warn:    { bg: "#fffbe6", bd: "#ffe58f", fg: "#874d00" },
    error:   { bg: "#fff1f0", bd: "#ffa39e", fg: "#a8071a" },
  }[type];

  return (
    <div style={{
      background: palette.bg, border:`1px solid ${palette.bd}`, color:palette.fg,
      padding:"10px 12px", borderRadius:8, marginBottom:12, position:"relative"
    }}>
      <div style={{ paddingRight: 28 }}>{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          title="Cerrar"
          style={{
            position:"absolute", top:6, right:6, border:"none", background:"transparent",
            cursor:"pointer", fontSize:16, color: palette.fg
          }}
        >✕</button>
      )}
    </div>
  );
}
