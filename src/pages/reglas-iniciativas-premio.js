// src/pages/reglas-iniciativas-premio.js
// RIFEX V4 A5 — anexo específico de iniciativas con premio (rifas). Aquí sí
// se permite la terminología específica, separada de la identidad
// corporativa global. Revisión jurídica chilena pendiente — seguimiento en
// docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt (punto 6), nunca en esta
// página pública.
// STAGE 2 FINAL — mismo tratamiento que /terminos-rifas: noindex y fuera
// del sitemap, porque es contenido específico de Rifas y Rifas ya no es
// parte del catálogo público. Sigue accesible por enlace directo desde
// /terminos-rifas y /reembolsos — nada se eliminó.
import Layout from "@/components/Layout";

export default function ReglasIniciativasPremio() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Anexo: iniciativas con premio (rifas)</h1>
      <p style={{ color: "#6B7280", marginBottom: 16 }}>Versión 1.0 · Publicada 31/08/2026</p>

      <section>
        <h2>Requisitos del organizador</h2>
        <p>Mayor de 18 años, con identidad registrada y RUT validado en Rifex.</p>
      </section>

      <section>
        <h2>Existencia y propiedad del premio</h2>
        <p>
          El creador declara que el premio existe, que le pertenece o que cuenta con autorización expresa de su
          propietario para ofrecerlo.
        </p>
      </section>

      <section>
        <h2>Precio, cupos y fechas</h2>
        <p>Definidos por el creador y visibles en la ficha antes de la compra. Son vinculantes una vez publicados.</p>
      </section>

      <section>
        <h2>Mecanismo de selección</h2>
        <p>El creador define el mecanismo de sorteo y debe publicar evidencia del resultado.</p>
      </section>

      <section>
        <h2>Entrega del premio</h2>
        <p>
          Dinero: transferencia directa desde el creador, según la modalidad informada en la ficha. Premio físico:
          retiro, envío incluido por el creador o envío pagado por el ganador, según lo indicado en la ficha —
          cualquier trámite o gasto de transferencia adicional debe informarse antes de la compra.
        </p>
      </section>

      <section>
        <h2>Prohibido</h2>
        <p>Cambiar condiciones esenciales después de recibir ventas; imponer al ganador costos no informados previamente.</p>
      </section>

      <section>
        <h2>Reportes y evidencia</h2>
        <p>
          Rifex conserva la evidencia de sorteo y entrega que el creador suba, y puede usarla para resolver una
          disputa o denuncia. Ver <a href="/reportar">Reportar</a>.
        </p>
      </section>
    </main>
  );
}

ReglasIniciativasPremio.getLayout = (page) => (
  <Layout
    title="Reglas de iniciativas con premio — Rifex"
    description="Condiciones específicas aplicables a iniciativas con premio en Rifex."
    noindex
  >
    {page}
  </Layout>
);
