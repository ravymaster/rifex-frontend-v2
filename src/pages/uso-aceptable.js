// src/pages/uso-aceptable.js
// RIFEX V4 A5 — Política de Uso Aceptable. Consecuencias descritas dentro
// de las capacidades reales de Rifex (nunca "retención de fondos", que el
// código no soporta — ver terminos.js y la corrección aplicada ahí).
// ETAPA 2 (identidad pública) — la advertencia jurídica visible se retiró
// de esta página pública; el ítem sigue vivo en
// docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt para revisión de abogado.
import Layout from "@/components/Layout";

export default function UsoAceptable() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Uso Aceptable</h1>
      <p style={{ color: "#6B7280", marginBottom: 16 }}>Versión 1.0 · Publicada 31/08/2026</p>

      <section>
        <h2>Prohibido en Rifex</h2>
        <ul>
          <li>Fraude, suplantación de identidad e información falsa.</li>
          <li>Premios o compensaciones inexistentes o sin autorización de su propietario.</li>
          <li>Bienes o servicios ilegales o restringidos.</li>
          <li>Uso de fondos de origen ilícito o lavado de activos.</li>
          <li>Vulneración de propiedad intelectual de terceros.</li>
          <li>Contenido de odio, violencia, explotación o abuso.</li>
          <li>Spam, etiquetado masivo y automatización no autorizada.</li>
          <li>Manipulación de resultados o evidencias de una iniciativa.</li>
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

      <p style={{ color: "#6B7280", marginTop: 24, fontSize: 13 }}>
        Rifex actualiza periódicamente sus políticas para reflejar mejoras en la plataforma y los requisitos
        aplicables en los países donde opera.
      </p>
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
