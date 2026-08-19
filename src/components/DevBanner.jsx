// src/components/DevBanner.jsx
// Señal visual discreta pero inequívoca de que esto es el entorno DEV. Solo
// se monta cuando isDevStage() === true (ver src/lib/environmentPolicy.js) —
// nunca aparece en producción.
export default function DevBanner() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#7c3aed",
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.5,
        textAlign: "center",
        padding: "4px 8px",
        pointerEvents: "none",
      }}
    >
      DEV — entorno de desarrollo, no productivo
    </div>
  );
}
