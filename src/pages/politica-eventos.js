// src/pages/politica-eventos.js
// RIFEX V4 A5 — refleja el Events V1 real (EVENT-1..8): organizador,
// entradas, QR de un solo uso, capacidad/aforo. No inventa un flujo de
// reembolso automatizado que el código no tiene — ver /reembolsos.
import Layout from "@/components/Layout";

const legalBanner = {
  background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E",
  borderRadius: 8, padding: "10px 14px", fontWeight: 700, marginBottom: 16,
};

export default function PoliticaEventos() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Política de Eventos</h1>
      <p style={{ color: "#6B7280", marginBottom: 16 }}>Versión 1.0 · Publicada 31/08/2026</p>

      <p style={legalBanner}>PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD.</p>

      <section>
        <h2>Responsabilidad del organizador</h2>
        <p>
          El organizador define y responde por su evento: fecha, horario, ubicación o modalidad, condiciones,
          restricciones de edad y accesibilidad cuando corresponda.
        </p>
      </section>

      <section>
        <h2>Entradas y precio</h2>
        <p>
          Cada evento define sus propios tipos de entrada, precio total, cupo (aforo) y cargos. El total de cupos
          comprometidos entre todos los tipos de entrada nunca puede superar la capacidad del evento — Rifex lo
          valida automáticamente al crear y al editar cada tipo de entrada.
        </p>
      </section>

      <section>
        <h2>Entrada digital (QR)</h2>
        <p>
          Cada entrada se emite como un código QR único. Un QR admite un solo check-in válido: una vez validado en
          el ingreso, un segundo intento con el mismo QR es rechazado automáticamente. La duplicación, alteración o
          reventa no autorizada de una entrada está prohibida.
        </p>
      </section>

      <section>
        <h2>Cambios, cancelación o reprogramación</h2>
        <p>
          El organizador es responsable de comunicar cualquier cambio a los compradores. Ver{" "}
          <a href="/reembolsos">Cancelaciones y devoluciones</a> para el tratamiento de pagos ante estos casos.
        </p>
      </section>

      <section>
        <h2>Rol de Rifex</h2>
        <p>
          Rifex provee la infraestructura tecnológica para publicar el evento, vender entradas, emitir QR y validar
          el acceso. Rifex no organiza el evento ni es responsable de su ejecución — esa responsabilidad es del
          organizador.
        </p>
      </section>
    </main>
  );
}

PoliticaEventos.getLayout = (page) => (
  <Layout
    title="Política de Eventos — Rifex"
    description="Responsabilidades del organizador, entradas digitales, control de acceso por QR y cambios de un evento en Rifex."
    canonicalPath="/politica-eventos"
  >
    {page}
  </Layout>
);
