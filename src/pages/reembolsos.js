// src/pages/reembolsos.js
// RIFEX V4 A5/refunds — página prudente. Auditoría read-only del código real
// (Payment Engine, api/events) confirmó: los pagos se acreditan directo en
// la cuenta del organizador vía split de Mercado Pago (application_fee),
// Rifex nunca custodia el monto de la venta; no existe hoy un endpoint ni
// flujo automatizado de cancelación de evento con reembolso masivo. Este
// documento no inventa ese mecanismo — lo marca explícitamente pendiente.
import Layout from "@/components/Layout";

const legalBanner = {
  background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E",
  borderRadius: 8, padding: "10px 14px", fontWeight: 700, marginBottom: 16,
};

export default function Reembolsos() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Cancelaciones y devoluciones</h1>
      <p style={{ color: "#6B7280", marginBottom: 16 }}>Versión 1.0 · Publicada 31/08/2026</p>

      <p style={legalBanner}>
        PENDIENTE DE REVISIÓN LEGAL Y DE PRODUCTO ANTES DE PROD. Rifex es una plataforma tecnológica que no custodia
        el dinero de las ventas ni de los aportes — los pagos se acreditan directo en la cuenta del proveedor
        conectada del organizador, descontada la comisión de Rifex. Rifex no puede iniciar por sí sola una
        devolución de un pago ya acreditado al organizador. Este documento describe lo que hoy es técnicamente
        cierto; no promete un mecanismo de reembolso que la plataforma todavía no automatiza.
      </p>

      <section>
        <h2>Pago rechazado o pendiente</h2>
        <p>
          Si tu pago fue rechazado o quedó pendiente, no se te cobra y no se emite ninguna entrada, ticket ni número.
          Consulta con el proveedor de pagos si el cargo aparece en tu estado de cuenta.
        </p>
      </section>

      <section>
        <h2>Cobro duplicado o error de pago</h2>
        <p>
          Repórtalo con evidencia (comprobante, fecha, monto) a través de <a href="/reportar">Reportar</a> o a{" "}
          <a href="mailto:contacto@rifex.pro">contacto@rifex.pro</a>. Cada caso se revisa individualmente contra la
          evidencia del proveedor de pagos.
        </p>
      </section>

      <section>
        <h2>Evento cancelado o reprogramado</h2>
        <p>
          El organizador es responsable de comunicar y ejecutar cualquier cancelación o reprogramación de su evento.
          Rifex no dispone hoy de un flujo automatizado que cancele masivamente entradas y devuelva pagos — este es
          un mecanismo pendiente de diseño y confirmación de producto. Si un evento fue cancelado y el organizador no
          responde, usa <a href="/reportar">Reportar</a>.
        </p>
      </section>

      <section>
        <h2>Aportes a campañas</h2>
        <p>
          Los aportes son pagos directos al organizador de la campaña. Rifex no gestiona su devolución.
        </p>
      </section>

      <section>
        <h2>Iniciativas con premio</h2>
        <p>
          Ver el <a href="/reglas-iniciativas-premio">anexo de iniciativas con premio</a> para las condiciones
          específicas de esa modalidad.
        </p>
      </section>
    </main>
  );
}

Reembolsos.getLayout = (page) => (
  <Layout
    title="Cancelaciones y devoluciones — Rifex"
    description="Qué hacer ante un pago rechazado, un cobro duplicado o un evento cancelado en Rifex."
    canonicalPath="/reembolsos"
  >
    {page}
  </Layout>
);
