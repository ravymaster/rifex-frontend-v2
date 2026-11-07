// pages/preguntas-frecuentes.js
// ETAPA 2 (identidad pública) — reescrita alrededor de la identidad
// corporativa pública actual (Eventos/Entradas/Campañas). El contenido
// específico de Rifas no se publica aquí — sigue disponible dentro del
// área autenticada y en /reglas-iniciativas-premio (anexo específico).
import Head from "next/head";
import Layout from "@/components/Layout";

export default function PreguntasFrecuentes() {
  return (
    <>
      <Head><title>Preguntas frecuentes — Rifex</title></Head>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ marginBottom: 8 }}>Preguntas frecuentes</h1>
        <p style={{ color: "#6B7280" }}>
          Respuestas rápidas sobre cómo funciona Rifex. Para más detalle legal, revisa los{" "}
          <a href="/terminos">Términos y Condiciones</a>.
        </p>

        <hr style={{ margin: "16px 0" }} />

        <section>
          <h2>¿Qué es Rifex?</h2>
          <p>
            Rifex es una plataforma para crear eventos con entradas digitales y campañas de recaudación en línea,
            cobrando pagos directo a la cuenta del organizador.
          </p>
        </section>

        <hr style={{ margin: "24px 0" }} />

        <section>
          <h2>¿Cómo creo un evento y vendo entradas?</h2>
          <p>
            Desde <a href="/crear-evento">Crear evento</a> defines el evento, uno o más tipos de entrada y su
            cupo. Cada entrada vendida se emite como un código QR de un solo uso. Más detalle en la{" "}
            <a href="/politica-eventos">Política de Eventos</a>.
          </p>
        </section>

        <hr style={{ margin: "24px 0" }} />

        <section>
          <h2>¿Cómo funciona el control de acceso (QR / check-in)?</h2>
          <p>
            El día del evento, el staff del organizador escanea el código QR de cada entrada desde el panel de
            Rifex. Cada QR es de un solo uso: si ya fue escaneado, un segundo intento se marca como inválido.
          </p>
        </section>

        <hr style={{ margin: "24px 0" }} />

        <section>
          <h2>¿Cómo creo una campaña de recaudación?</h2>
          <p>
            Desde <a href="/crear-colecta">Crear campaña</a> defines el objetivo y compartes tu enlace para
            recibir aportes. Más detalle en la <a href="/politica-campanas">Política de Campañas</a>.
          </p>
        </section>

        <hr style={{ margin: "24px 0" }} />

        <section>
          <h2>¿Cuánto cobra Rifex?</h2>
          <p>
            Una comisión única del 7% sobre cada entrada vendida o aporte exitoso, descontada automáticamente por
            Mercado Pago al momento del pago — no hay planes ni suscripciones. Más detalle en{" "}
            <a href="/planes">Comisión</a>.
          </p>
        </section>

        <hr style={{ margin: "24px 0" }} />

        <section>
          <h2>¿Cómo se procesan los pagos?</h2>
          <p>
            Los pagos se procesan mediante Mercado Pago y los fondos se acreditan en la cuenta del organizador
            conectada al proveedor de pagos. Rifex aplica su comisión de servicio mediante la integración con el
            proveedor. Más detalle en{" "}
            <a href="/seguridad">Seguridad</a>.
          </p>
        </section>

        <hr style={{ margin: "24px 0" }} />

        <section>
          <h2>Tengo un problema con una iniciativa o un pago</h2>
          <p>
            Puedes <a href="/reportar">reportar una iniciativa o comportamiento</a> sin necesidad de iniciar
            sesión, o escribirnos desde <a href="/contacto">Contacto</a>.
          </p>
        </section>
      </main>
    </>
  );
}

PreguntasFrecuentes.getLayout = (page) => (
  <Layout
    title="Preguntas frecuentes — Rifex"
    description="Respuestas rápidas sobre cómo funciona Rifex: eventos, entradas digitales, campañas de recaudación, pagos, comisión y reportes."
    canonicalPath="/preguntas-frecuentes"
  >
    {page}
  </Layout>
);
