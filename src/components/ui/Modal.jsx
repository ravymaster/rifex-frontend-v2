// src/components/ui/Modal.jsx
import { useEffect } from "react";

export default function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.45)",
      display:"grid", placeItems:"center", zIndex:1000
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width:"min(520px, 92vw)", background:"#fff", borderRadius:12,
          boxShadow:"0 10px 30px rgba(0,0,0,.2)", padding:"18px 16px"
        }}
      >
        {title && <h3 style={{ margin:"0 0 10px", fontSize:18 }}>{title}</h3>}
        <div>{children}</div>
        <div style={{ marginTop:14, textAlign:"right" }}>
          <button onClick={onClose} style={{
            padding:"8px 12px", borderRadius:8, border:"1px solid #d9d9d9", background:"#f7f7f7", cursor:"pointer"
          }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
