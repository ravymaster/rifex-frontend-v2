// src/pages/cumplimiento.js
// RIFEX V4 A5/Cumplimiento — actualizado tras la promoción real de C1
// (foundation), C3 (comunicaciones/acceso del ganador), C4 (timeline y
// escalación) y C5 (revisión administrativa) a PROD. Describe únicamente
// controles REALMENTE activos — nunca C6 (reputación pública), nunca
// arbitraje legal, nunca garantía material de entrega; el silencio del
// creador o del ganador nunca se interpreta como incumplimiento.
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

const flowStep = {
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#F8FAFC",
  fontWeight: 700,
  fontSize: 14,
  color: "#0F172A",
  textAlign: "center",
};

const arrow = { textAlign: "center", color: "#94A3B8", fontSize: 18, margin: "2px 0" };

const timelineDay = {
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "12px 14px",
  marginBottom: 10,
};

const dayLabel = { fontWeight: 800, color: "#1E3A8A", fontSize: 13, marginBottom: 4 };

const stateChip = {
  display: "inline-block",
  border: "1px solid #E5E7EB",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12.5,
  fontWeight: 600,
  color: "#334155",
  background: "#fff",
  margin: "3px 6px 3px 0",
};

export default function Cumplimiento() {
  return (
    <>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <div style={badgeStyle}>✅ Controles activos</div>
        <h1 style={{ margin: "12px 0 8px" }}>Rifex Cumplimiento</h1>
        <p style={{ color: "#6B7280" }}>
          Esta página describe la capa de seguimiento posterior a una rifa que ya está activa: registro del caso,
          comunicaciones al ganador y al creador, un control por plazos y, cuando corresponde, revisión
          administrativa. La sección "Reputación futura" al final sigue siendo, explícitamente, una función no
          implementada — se distingue del resto de esta página.
        </p>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Qué busca Rifex Cumplimiento</h2>
          <p>
            Rifex Cumplimiento busca ayudar a verificar que, después de finalizar una rifa, el premio sea
            entregado bajo las condiciones que fueron informadas a los participantes antes de participar
            (modalidad de entrega, quién asume el envío, y si corresponde, la transferencia o trámites del
            premio).
          </p>
          <p>
            <strong>Rifex Cumplimiento no reemplaza a los tribunales, no garantiza materialmente la entrega del
            premio, y no realiza arbitraje legal.</strong> Busca registrar confirmaciones, recordar la entrega,
            detectar discrepancias, generar un historial de cumplimiento y aumentar la transparencia entre
            creadores y ganadores.
          </p>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Flujo post-rifa</h2>
          <div style={{ maxWidth: 420, margin: "16px auto", display: "grid", gap: 0 }}>
            {[
              "Rifa finaliza",
              "Ganador definido",
              "Correo al ganador",
              "Correo al creador",
              "Correo a participantes no ganadores",
              "Período de entrega",
              "Rifex Cumplimiento",
              "Confirmación",
              "Estado de cumplimiento",
            ].map((step, i, arr) => (
              <div key={step}>
                <div style={flowStep}>{step}</div>
                {i < arr.length - 1 && <div style={arrow}>↓</div>}
              </div>
            ))}
          </div>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Correos al finalizar la rifa</h2>
          <p style={{ color: "#6B7280", fontSize: 13.5 }}>
            Un solo correo por destinatario en este momento — nunca una secuencia de mensajes para quienes no
            ganaron.
          </p>
          <h3 style={{ fontSize: 15 }}>Al ganador</h3>
          <ul>
            <li>Informar que ganó e identificar el premio.</li>
            <li>Mostrar las condiciones de entrega publicadas (envío/transferencia, si corresponde).</li>
            <li>Explicar que deberá coordinar la entrega con el creador.</li>
            <li>Informar que Rifex más adelante solicitará una confirmación de recepción.</li>
          </ul>
          <h3 style={{ fontSize: 15 }}>Al creador</h3>
          <ul>
            <li>Informar el cierre de la rifa e identificar al ganador.</li>
            <li>Recordar las condiciones de entrega que él mismo publicó.</li>
            <li>Indicar que deberá coordinar la entrega.</li>
            <li>Informar que Rifex más adelante solicitará una confirmación de entrega.</li>
          </ul>
          <h3 style={{ fontSize: 15 }}>A quienes no ganaron</h3>
          <ul>
            <li>Informar el resultado (ganador/número, según la política pública ya vigente).</li>
            <li>Enlace a la rifa ya cerrada.</li>
            <li>Agradecimiento por participar.</li>
          </ul>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Plazos del control automático</h2>
          <div style={timelineDay}>
            <div style={dayLabel}>Día 0</div>
            Rifa finalizada y correos de resultado enviados.
          </div>
          <div style={timelineDay}>
            <div style={dayLabel}>Días 1–9</div>
            Período razonable para que creador y ganador coordinen la entrega. Si el creador informa la entrega
            antes, Rifex podría adelantar la consulta al ganador.
          </div>
          <div style={timelineDay}>
            <div style={dayLabel}>Día 10 — primer control</div>
            Al ganador: <em>&ldquo;¿Recibiste tu premio?&rdquo;</em> (Sí, lo recibí / No, todavía no). Al
            creador: <em>&ldquo;¿Entregaste el premio?&rdquo;</em> (Sí, fue entregado / Todavía estoy
            coordinando / Aún no).
          </div>
          <div style={timelineDay}>
            <div style={dayLabel}>Día 15</div>
            Recordatorio, únicamente a quien no haya respondido todavía.
          </div>
          <div style={timelineDay}>
            <div style={dayLabel}>Día 20</div>
            Cierre de la ronda automática de control. Rifex no envía correos de este tipo indefinidamente.
          </div>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Cómo se decide el resultado</h2>
          <p style={{ color: "#6B7280", fontSize: 13.5 }}>
            El silencio nunca se interpreta como incumplimiento, y ninguna de estas reglas otorga
            automáticamente una sanción.
          </p>
          <ul>
            <li>Ganador confirma que recibió el premio → <strong>cumplimiento confirmado</strong> (la
              confirmación del propio ganador tiene prioridad para acreditar la recepción).</li>
            <li>Creador confirma entrega y ganador confirma recepción → <strong>cumplimiento confirmado</strong>.</li>
            <li>Creador confirma entrega pero el ganador dice que no la recibió → <strong>discrepancia, requiere
              revisión</strong>.</li>
            <li>Creador dice que aún está coordinando o no ha entregado, y el ganador dice que no recibió →
              <strong> entrega pendiente</strong>.</li>
            <li>El ganador no responde pero el creador sí confirmó la entrega → entrega informada por el
              creador, pendiente de confirmación del ganador (nunca se sanciona automáticamente por esto).</li>
            <li>Ninguno de los dos responde → <strong>sin confirmación</strong>.</li>
          </ul>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Estados posibles</h2>
          <div>
            {["Pendiente de entrega", "Entrega informada", "Cumplimiento confirmado", "Entrega pendiente", "En revisión", "Sin confirmación"].map((s) => (
              <span key={s} style={stateChip}>{s}</span>
            ))}
          </div>
          <p style={{ color: "#6B7280", fontSize: 13, marginTop: 10 }}>
            Estos estados existen hoy en el registro interno del caso — nunca se publican junto con datos
            personales de creadores ni ganadores.
          </p>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Qué evidencia registra</h2>
          <p>El registro interno de cada caso incluye:</p>
          <ul>
            <li>Fecha de finalización de la rifa.</li>
            <li>Condiciones del premio vigentes al momento de participar (modalidad de entrega, quién asumía el
              envío, si requería transferencia/trámites y quién los asumía).</li>
            <li>Fecha en que el creador informó la entrega.</li>
            <li>Fecha y respuesta del ganador.</li>
            <li>Estado final del seguimiento y, si corresponde, la revisión administrativa asociada.</li>
          </ul>
          <p style={{ color: "#6B7280", fontSize: 13.5 }}>
            Nunca se publica información personal (PII) de creadores ni ganadores — ni en esta página, ni en
            ningún historial visible públicamente. El registro es interno y solo accesible para revisión
            administrativa.
          </p>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Por qué importan las condiciones informadas al participar</h2>
          <p>
            Las condiciones que un creador publica al momento de crear su rifa (cómo se entrega el premio, quién
            asume el envío, si requiere transferencia o trámites y quién los cubre) son la referencia relevante
            para evaluar la entrega. Por ejemplo: no bastaría con entregar el premio si después se le imponen al
            ganador costos o condiciones que no se habían informado antes de participar.
          </p>
          <p style={{ color: "#6B7280", fontSize: 13.5 }}>
            Esto no implica una acusación automática de fraude — busca dar un marco de referencia claro y
            objetivo para resolver discrepancias.
          </p>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Reputación futura</h2>
          <p>
            Con el tiempo, un historial de premios confirmados podrá ayudar a mostrar señales de cumplimiento de
            un creador. <strong>Hoy no existe ningún puntaje, estrellas, porcentaje ni penalización automática</strong> —
            eso, si se implementa, será una decisión de producto separada y posterior.
          </p>
        </section>

        <hr style={{ margin: "20px 0" }} />

        <section>
          <h2>Rifex Cumplimiento no es lo mismo que Seguridad / Trust</h2>
          <p>
            <strong>Seguridad de Rifex</strong> (ver <a href="/seguridad">nuestra página de Seguridad</a>) ayuda
            a verificar quién es el creador antes de que pueda publicar. <strong>Rifex Cumplimiento</strong>{" "}
            ayuda a registrar si las obligaciones posteriores de una rifa ya finalizada fueron cumplidas. Son dos
            capas distintas, con datos y lógica separados.
          </p>
        </section>

        <p style={{ color: "#6B7280", marginTop: 24, fontSize: 13 }}>
          Última actualización: 31/08/2026. Consulta también nuestros <a href="/terminos">Términos y
          Condiciones</a> y nuestra página de <a href="/seguridad">Seguridad</a>.
        </p>
      </main>
    </>
  );
}

Cumplimiento.getLayout = (page) => (
  <Layout
    title="Rifex Cumplimiento — Seguimiento post-entrega"
    description="Seguimiento y escalación de la entrega de premios en iniciativas con premio, con controles hoy activos."
    canonicalPath="/cumplimiento"
  >
    {page}
  </Layout>
);
