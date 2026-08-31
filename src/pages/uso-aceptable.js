// src/pages/uso-aceptable.js
// RIFEX V4 A5 — Política de Uso Aceptable. Consecuencias descritas dentro
// de las capacidades reales de Rifex (nunca "retención de fondos", que el
// código no soporta — ver terminos.js y la corrección aplicada ahí).
import Layout from "@/components/Layout";

const legalBanner = {
  background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E",
  borderRadius: 8, padding: "10px 14px", fontWeight: 700, marginBottom: 16,
};

export default function UsoAceptable() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Uso Aceptable</h1>
      <p style={{ color: "#6B7280", marginBottom: 16 }}>Versión 1.0 · Publicada 31/08/2026</p>

      <p style={legalBanner}>
        PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD.
      </p>

      <section>
        <h2>Prohibido en Rifex</h2>
        <ul>
          <li>Fraude, suplantación de identidad e información falsa.</li>
          <li>Premios inexistentes o sin autorización de su propietario.</li>
          <li>Bienes o servicios ilegales o restringidos.</li>
          <li>Uso de fondos de origen ilícito o lavado de activos.</li>
          <li>Vulneración de propiedad intelectual de terceros.</li>
          <li>Contenido de odio, violencia, explotación o abuso.</li>
          <li>Spam, etiquetado masivo y automatización no autorizada.</li>
          <li>Manipulación de resultados o evidencias de sorteo/entrega.</li>
          <li>Uso de cuentas múltiples para evadir suspensiones.</li>
          <li>Uso de datos de compradores o aportantes fuera de la finalidad informada.</li>
          <li>Cambio material de las condiciones de una iniciativa después de recibir pagos.</li>
        </ul>
      </section>

      <section>
        <h2>Consecuencias</h2>
        <p>Dentro de las capacidades reales de Rifex como plataforma tecnológica, un incumplimiento verificado puede derivar en:</p>
        <ul>
          <li>Revisión de la cuenta y la iniciativa.</li>
          <li>Despublicación de la iniciativa.</li>
          <li>Suspensión de la cuenta y bloqueo de nuevas iniciativas.</li>
          <li>Comunicación al proveedor de pagos o a la autoridad competente cuando corresponda.</li>
        </ul>
        <p>
          Rifex no custodia los fondos de las ventas ni de los aportes — no puede retener dinero que nunca recibe.
          El proveedor de pagos conectado procesa cargos, contracargos y disputas según sus propias políticas.
        </p>
      </section>
    </main>
  );
}

UsoAceptable.getLayout = (page) => (
  <Layout
    title="Uso Aceptable — Rifex"
    description="Qué está prohibido en Rifex y qué medidas pueden aplicarse ante un incumplimiento verificado."
    canonicalPath="/uso-aceptable"
  >
    {page}
  </Layout>
);
