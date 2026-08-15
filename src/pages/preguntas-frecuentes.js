// pages/preguntas-frecuentes.js
import Head from "next/head";

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
          <h2>¿Cómo creo una rifa?</h2>
          <p>
            Desde <a href="/crear-rifa">Crear rifa</a> completas título, precio por número, cantidad de
            cupos y la información del premio. Al publicarla queda disponible en tu enlace para compartir.
          </p>
        </section>

        <hr style={{ margin: "24px 0" }} />

        <section>
          <h2>¿Cómo compro un número?</h2>
          <p>
            Entra al enlace de la rifa, elige tus números y paga con Mercado Pago. Mientras se confirma
            el pago, el número queda reservado; si el pago no se completa, vuelve a estar disponible.
          </p>
        </section>

        <hr style={{ margin: "24px 0" }} />

        <section>
          <h2>¿Cómo se elige al ganador?</h2>
          <p>
            El creador define el mecanismo de sorteo y debe publicar evidencia, según lo establecido en
            los <a href="/terminos#creador">Términos del Creador</a>.
          </p>
        </section>

        <hr style={{ margin: "24px 0" }} />

        <section>
          <h2>¿Cuánto cobra Rifex?</h2>
          <p>
            Depende del plan del creador (Gratis, Básico o Pro), más la comisión de la pasarela de pago.
            El detalle de cada plan está en los <a href="/terminos#creador">Términos del Creador</a>.
          </p>
        </section>

        <hr style={{ margin: "24px 0" }} />

        <section>
          <h2>Tengo un problema con un pago o una rifa</h2>
          <p>
            Escríbenos desde <a href="/contacto">Contacto</a> o a{" "}
            <a href="mailto:contacto@rifex.pro">contacto@rifex.pro</a> con el detalle de tu caso.
          </p>
        </section>
      </main>
    </>
  );
}
