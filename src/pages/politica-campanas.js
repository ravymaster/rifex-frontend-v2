// src/pages/politica-campanas.js
// STAGE 2 REPAIR — la advertencia jurídica visible se retiró de esta
// página pública; el ítem sigue vivo en
// docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt.
import Layout from "@/components/Layout";

export default function PoliticaCampanas() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Política de Campañas</h1>
      <p style={{ color: "#6B7280", marginBottom: 16 }}>Versión 1.0 · Publicada 01/09/2026</p>

      <section>
        <h2>Identificación del organizador</h2>
        <p>Cada campaña muestra a su organizador registrado en Rifex.</p>
      </section>

      <section>
        <h2>Finalidad y aportes</h2>
        <p>
          El organizador declara la finalidad de la campaña. Los aportes son voluntarios y, salvo que se indique
          expresamente lo contrario en la campaña, no generan contraprestación.
        </p>
      </section>

      <section>
        <h2>Pagos directos</h2>
        <p>
          Los aportes se procesan mediante el proveedor de pagos conectado del organizador y se acreditan directo en
          su cuenta, descontada la comisión de Rifex. Rifex no custodia los aportes.
        </p>
      </section>

      <section>
        <h2>Cambios, pausa y cierre</h2>
        <p>El organizador puede pausar o cerrar su campaña. Un cambio material de su finalidad debe informarse a quienes ya aportaron.</p>
      </section>

      <section>
        <h2>Uso de los aportes</h2>
        <p>
          El uso de los aportes recibidos es responsabilidad del organizador. Rifex no fiscaliza materialmente el
          destino de cada aporte — puede revisar denuncias y aplicar medidas dentro de sus capacidades reales ante
          información engañosa comprobada.
        </p>
      </section>

      <section>
        <h2>Reportes</h2>
        <p>Cualquier persona puede <a href="/reportar">reportar</a> una campaña con información engañosa o incumplimiento.</p>
      </section>
    </main>
  );
}

PoliticaCampanas.getLayout = (page) => (
  <Layout
    title="Política de Campañas — Rifex"
    description="Cómo funcionan las campañas de recaudación en Rifex: aportes, pagos directos y responsabilidades del organizador."
    canonicalPath="/politica-campanas"
  >
    {page}
  </Layout>
);
