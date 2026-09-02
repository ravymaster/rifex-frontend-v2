// src/pages/seguridad.js
// Corrección canónica (2026-08-27) — página pública que explica de
// forma veraz las medidas de seguridad y confianza de Rifex. Nunca usa
// "Anti-Trust", "biometría verificada", "100% seguro", "sin fraude" ni
// afirmaciones legales absolutas, y nunca detalla nada que facilite
// evadir los controles descritos.
import Layout from "@/components/Layout";

export default function Seguridad() {
  return (
    <>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ marginBottom: 8 }}>Seguridad y confianza en Rifex</h1>
        <p style={{ color: "#6B7280" }}>
          Estas son las medidas reales que usamos hoy para proteger a usuarios y organizadores. Las iremos
          actualizando a medida que sigamos mejorando la plataforma.
        </p>

        <hr style={{ margin: "16px 0" }} />

        <section>
          <h2>Autenticación</h2>
          <p>
            Para crear una cuenta puedes usar tu correo o tu cuenta de Google. Toda sesión queda protegida por la
            infraestructura de autenticación de Supabase, el mismo estándar que usan miles de aplicaciones.
          </p>
        </section>

        <section>
          <h2>Registro obligatorio antes de crear iniciativas</h2>
          <p>
            Antes de poder crear un evento, una campaña u otra iniciativa, todo creador debe completar un registro:
            nombre (de persona natural o de una empresa/organización), RUT válido, teléfono de contacto, declaración
            de ser mayor de 18 años, y la aceptación de nuestros Términos y Política de Privacidad.
          </p>
        </section>

        <section>
          <h2>Validación formal del RUT</h2>
          <p>
            El RUT que declara cada creador se valida server-side contra su dígito verificador real — nunca se
            acepta un RUT con formato incorrecto.
          </p>
        </section>

        <section>
          <h2>Declaración de mayoría de edad</h2>
          <p>
            Todo creador debe declarar expresamente que es mayor de 18 años antes de poder operar en Rifex.
          </p>
        </section>

        <section>
          <h2>Verificación del organizador y la cuenta receptora</h2>
          <p>
            Rifex aplica controles de registro, validación de identidad y titularidad de cuentas antes de habilitar
            determinadas operaciones. Algunas operaciones pueden requerir comprobaciones adicionales antes de
            quedar habilitadas.
          </p>
          <p>
            Los resultados de estas verificaciones son privados y no se muestran a otros usuarios.
          </p>
        </section>

        <section>
          <h2>Pagos</h2>
          <p>
            Los pagos se procesan mediante el proveedor de pagos conectado y se acreditan en la cuenta del
            organizador. Rifex aplica su comisión de servicio mediante la integración con el proveedor.
          </p>
        </section>

        <section>
          <h2>Denuncias</h2>
          <p>
            Cualquier persona puede reportar a Rifex una iniciativa o un creador que incumple lo anunciado. Cada
            denuncia se revisa contra la evidencia disponible antes de tomar una decisión.
          </p>
        </section>

        <section>
          <h2>Evidencia posterior a la transacción</h2>
          <p>
            Rifex mantiene determinados registros o evidencias asociados a operaciones cuando son necesarios para
            soporte, reportes o revisiones.
          </p>
        </section>

        <section>
          <h2>Protección de datos</h2>
          <p>
            Tus datos privados (RUT, teléfono, domicilio, documentos) nunca se muestran públicamente ni se entregan
            automáticamente a otros usuarios. Se usan únicamente para proteger la operación, reducir usos indebidos
            y cumplir las obligaciones aplicables. Más detalle en nuestra <a href="/privacidad">Política de
            Privacidad</a>.
          </p>
        </section>

        <section>
          <h2>Medidas ante incumplimientos</h2>
          <p>
            Un incumplimiento verificado puede derivar en suspensión de una cuenta y bloqueo para crear nuevas
            iniciativas. Rifex no determina por sí sola si un incumplimiento constituye un delito — eso corresponde
            exclusivamente a la autoridad competente, con la que Rifex coopera ante una solicitud válida.
          </p>
        </section>

        <p style={{ color: "#6B7280", marginTop: 24, fontSize: 13 }}>
          Última actualización: 27/08/2026. Consulta también nuestros <a href="/terminos">Términos y Condiciones</a>.
        </p>
      </main>
    </>
  );
}

Seguridad.getLayout = (page) => (
  <Layout
    title="Seguridad y verificación de organizadores — Rifex"
    description="Rifex aplica controles de registro, validación de identidad y titularidad de cuentas antes de habilitar determinadas operaciones."
    canonicalPath="/seguridad"
  >
    {page}
  </Layout>
);
