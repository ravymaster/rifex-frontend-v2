// src/pages/cumplimiento.js
// RIFEX V4 A5/Cumplimiento — describe únicamente controles REALMENTE
// activos — nunca C6 (reputación pública), nunca arbitraje legal, nunca
// garantía material de entrega; el silencio nunca se interpreta como
// incumplimiento.
// ETAPA 2 (identidad pública) — neutralizada: el flujo día-a-día, el
// contenido exacto de los correos, la tabla de decisión y los estados
// internos del caso (calendario/inventario operativo) dejaron de
// publicarse aquí — son detalle interno, no comunicación pública. La
// mecánica real sigue intacta en el backend (fulfillmentTimeline.js,
// fulfillmentCaseService.js); esta página solo describe su existencia.
import Layout from "@/components/Layout";

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#EFF6FF",
  border: "1px solid #BFDBFE",
  color: "#1E3A8A",
  borderRadius: 999,
  padding: "6px 12px",
  fontWeight: 700,
  fontSize: 13,
};

export default function Cumplimiento() {
  return (
    <>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <div style={badgeStyle}>✅ Controles activos</div>
        <h1 style={{ margin: "12px 0 8px" }}>Rifex Cumplimiento</h1>
        <p style={{ color: "#6B7280" }}>
          Rifex Cumplimiento incorpora controles de seguimiento, confirmación y revisión posterior para
          determinadas iniciativas realizadas en la plataforma. La sección "Reputación futura" al final sigue
          siendo, explícitamente, una función no implementada — se distingue del resto de esta página.
        </p>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Qué busca Rifex Cumplimiento</h2>
          <p>
            Rifex Cumplimiento busca ayudar a verificar que, tras finalizar una iniciativa con un compromiso de
            entrega, ese compromiso se cumpla bajo las condiciones que fueron informadas antes de participar.
          </p>
          <p>
            <strong>Rifex Cumplimiento no reemplaza a los tribunales, no garantiza materialmente la entrega, y no
            realiza arbitraje legal.</strong> Busca registrar confirmaciones, hacer seguimiento de plazos, detectar
            discrepancias y aumentar la transparencia entre las partes involucradas.
          </p>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Cómo funciona, en términos generales</h2>
          <p>
            Cuando corresponde, Rifex hace un seguimiento por plazos e invita a las partes involucradas a
            confirmar el estado del compromiso. <strong>El silencio nunca se interpreta como incumplimiento</strong>,
            y ninguna respuesta por sí sola genera una sanción automática — una discrepancia puede derivar en una
            revisión administrativa antes de cualquier decisión.
          </p>
          <p style={{ color: "#6B7280", fontSize: 13.5 }}>
            El detalle operativo de este seguimiento (plazos exactos, contenido de las comunicaciones, y el
            registro interno de cada caso) es información interna de Rifex, no una comunicación pública.
          </p>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Qué se registra</h2>
          <p style={{ color: "#6B7280", fontSize: 13.5 }}>
            Rifex mantiene un registro interno del seguimiento de cada caso. <strong>Nunca se publica información
            personal (PII)</strong> de las personas involucradas — ni en esta página, ni en ningún historial visible
            públicamente. El registro es interno y solo accesible para revisión administrativa.
          </p>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Reputación futura</h2>
          <p>
            Con el tiempo, un historial de compromisos confirmados podrá ayudar a mostrar señales de cumplimiento
            de un creador. <strong>Hoy no existe ningún puntaje, estrellas, porcentaje ni penalización automática</strong> —
            eso, si se implementa, será una decisión de producto separada y posterior.
          </p>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Rifex Cumplimiento no es lo mismo que Seguridad / Trust</h2>
          <p>
            <strong>Seguridad de Rifex</strong> (ver <a href="/seguridad">nuestra página de Seguridad</a>) ayuda
            a verificar quién es el creador antes de que pueda publicar. <strong>Rifex Cumplimiento</strong>{" "}
            ayuda a registrar si un compromiso posterior a una iniciativa ya finalizada fue cumplido. Son dos
            capas distintas, con datos y lógica separados.
          </p>
        </section>

        <p style={{ color: "#6B7280", marginTop: 24, fontSize: 13 }}>
          Última actualización: 01/09/2026. Consulta también nuestros <a href="/terminos">Términos y
          Condiciones</a> y nuestra página de <a href="/seguridad">Seguridad</a>.
        </p>
      </main>
    </>
  );
}

Cumplimiento.getLayout = (page) => (
  <Layout
    title="Rifex Cumplimiento — Seguimiento post-entrega"
    description="Rifex Cumplimiento incorpora controles de seguimiento, confirmación y revisión posterior para determinadas iniciativas realizadas en la plataforma."
    canonicalPath="/cumplimiento"
  >
    {page}
  </Layout>
);
