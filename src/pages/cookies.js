// src/pages/cookies.js
// RIFEX V4 A5 — inventario técnico real de cookies/almacenamiento (código
// verificado: src/lib/consent.js, src/lib/metaPixel.js,
// src/components/ConsentBanner.jsx) separado explícitamente de la
// clasificación jurídica de qué exactamente requiere consentimiento, que
// queda LEGAL_REVIEW_REQUIRED.
import { useEffect } from "react";
import Layout from "@/components/Layout";
import { setStoredConsent } from "@/lib/consent";

const legalBanner = {
  background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E",
  borderRadius: 8, padding: "10px 14px", fontWeight: 700, marginBottom: 16,
};

export default function Cookies() {
  useEffect(() => {
    function openPrefs() {
      const el = document.getElementById("rf-cookie-prefs-anchor");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
    window.addEventListener("rifex:open-cookie-preferences", openPrefs);
    return () => window.removeEventListener("rifex:open-cookie-preferences", openPrefs);
  }, []);

  function setConsent(value) {
    setStoredConsent(value);
    window.location.reload();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Cookies y tecnologías similares</h1>
      <p style={{ color: "#6B7280", marginBottom: 16 }}>Versión 1.0 · Publicada 31/08/2026</p>

      <p style={legalBanner}>
        INVENTARIO TÉCNICO (verificado contra el código real) — CLASIFICACIÓN JURÍDICA PENDIENTE DE REVISIÓN. Esta
        página describe con exactitud qué tecnologías existen hoy en Rifex y cuándo se activan; qué exactamente
        requiere consentimiento explícito bajo la ley chilena vigente queda pendiente de confirmación por un abogado.
      </p>

      <section>
        <h2>Estrictamente necesarias</h2>
        <p>
          Cookies/tokens de sesión de Supabase Auth, usados para mantener tu sesión iniciada y proteger el acceso a
          tu cuenta. No se pueden desactivar sin perder la capacidad de iniciar sesión.
        </p>
      </section>

      <section>
        <h2>Preferencias</h2>
        <p>
          Tu elección de consentimiento de marketing se guarda en el almacenamiento local de tu navegador
          (localStorage), no en una cookie de servidor.
        </p>
      </section>

      <section>
        <h2>Medición y publicidad (Meta Pixel)</h2>
        <p>
          Usamos Meta Pixel para entender cómo se usa Rifex. <strong>Nunca se inicializa hasta que aceptas</strong> el
          aviso de cookies — "Rechazar" es igual de accesible que "Aceptar" y tu elección se recuerda entre visitas.
          Ningún evento de Meta Pixel en Rifex envía tu email, nombre, teléfono, RUT ni datos de pago.
        </p>
        <div id="rf-cookie-prefs-anchor" style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setConsent("granted")}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #18A957", background: "#18A957", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            Aceptar medición y publicidad
          </button>
          <button
            type="button"
            onClick={() => setConsent("denied")}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", fontWeight: 700, cursor: "pointer" }}
          >
            Rechazar
          </button>
        </div>
      </section>

      <section>
        <h2>Cómo cambiar tu elección</h2>
        <p>
          Puedes volver a esta página en cualquier momento desde el enlace "Preferencias de cookies" en el pie de
          cualquier página de Rifex, o desde la configuración de tu navegador.
        </p>
      </section>
    </main>
  );
}

Cookies.getLayout = (page) => (
  <Layout
    title="Cookies — Rifex"
    description="Qué cookies y tecnologías de medición usa Rifex, cuándo se activan y cómo cambiar tu elección."
    canonicalPath="/cookies"
  >
    {page}
  </Layout>
);
