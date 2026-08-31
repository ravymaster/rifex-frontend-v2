// src/pages/confianza.js
// RIFEX V4 A4 — centro público de confianza. Solo navega hacia las páginas
// reales ya construidas; no repite terminología de rifas como identidad
// corporativa.
import Layout from "@/components/Layout";

const links = [
  { href: "/seguridad", title: "Seguridad", text: "Cómo validamos al organizador y contrastamos su cuenta receptora." },
  { href: "/privacidad", title: "Privacidad", text: "Qué datos usamos, para qué y cómo ejercer tus derechos." },
  { href: "/uso-aceptable", title: "Uso aceptable", text: "Qué está prohibido en Rifex y qué medidas pueden aplicarse." },
  { href: "/reportar", title: "Reportar", text: "Reporta una iniciativa o un creador sin necesidad de iniciar sesión." },
  { href: "/cumplimiento", title: "Cumplimiento", text: "Seguimiento y escalación posteriores al cierre de una iniciativa." },
  { href: "/preguntas-frecuentes", title: "Preguntas frecuentes", text: "Respuestas a las dudas más comunes sobre Rifex." },
];

export default function Confianza() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Centro de confianza</h1>
      <p style={{ color: "#6B7280", marginBottom: 24 }}>
        Rifex verifica la identidad del organizador, contrasta la titularidad de su cuenta de pago conectada y
        procesa los pagos mediante ese proveedor. Estos son los controles y canales disponibles hoy.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            style={{
              display: "block", padding: 18, borderRadius: 14, border: "1px solid #E5E7EB",
              textDecoration: "none", color: "inherit",
            }}
          >
            <strong style={{ display: "block", marginBottom: 6, color: "#0F172A" }}>{l.title}</strong>
            <span style={{ fontSize: 13.5, color: "#6B7280" }}>{l.text}</span>
          </a>
        ))}
      </div>
    </main>
  );
}

Confianza.getLayout = (page) => (
  <Layout
    title="Centro de confianza — Rifex"
    description="Seguridad, privacidad, uso aceptable y reportes: los controles de confianza de Rifex en un solo lugar."
    canonicalPath="/confianza"
  >
    {page}
  </Layout>
);
