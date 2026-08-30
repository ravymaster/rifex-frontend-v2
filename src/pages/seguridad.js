// src/pages/seguridad.js
// Corrección canónica (2026-08-27) — página pública que explica de
// forma veraz las medidas de seguridad y confianza de Rifex. Nunca usa
// "Anti-Trust", "biometría verificada", "100% seguro", "sin fraude" ni
// afirmaciones legales absolutas, y nunca detalla nada que facilite
// evadir los controles descritos.
import Head from "next/head";
import Layout from "@/components/Layout";

export default function Seguridad() {
  return (
    <>
      <Head><title>Seguridad y confianza en Rifex</title></Head>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ marginBottom: 8 }}>Seguridad y confianza en Rifex</h1>
        <p style={{ color: "#6B7280" }}>
          Estas son las medidas reales que usamos hoy para proteger a compradores y creadores. Las iremos
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
            Antes de poder crear una rifa, colecta o evento, todo creador debe completar un registro: nombre (de
            persona natural o de una empresa/organización), RUT válido, teléfono de contacto, declaración de ser
            mayor de 18 años, y la aceptación de nuestros Términos y Política de Privacidad.
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
          <h2>Cuenta receptora conectada y verificación de titularidad</h2>
          <p>
            Todo creador debe conectar la cuenta de Mercado Pago donde recibirá el dinero de sus iniciativas — los
            pagos van directo a esa cuenta, Rifex nunca los intermedia. Cuando la información entregada por Mercado
            Pago lo permite, Rifex verifica la consistencia entre los datos del creador y la titularidad de la
            cuenta receptora mediante su proveedor de pagos, antes de dejarlo operar sin restricciones.
          </p>
        </section>

        <section>
          <h2>Pagos directos</h2>
          <p>
            Los pagos de compradores y aportantes se procesan a través de Mercado Pago y se acreditan directo en la
            cuenta del creador — Rifex nunca retiene el dinero de una venta aprobada más allá de su comisión.
          </p>
        </section>

        <section>
          <h2>Documentación según riesgo</h2>
          <p>
            En casos puntuales, Rifex puede pedir a un creador que verifique su identidad con un documento —
            revisado siempre por una persona, de forma privada, y almacenado en un espacio protegido, nunca público.
            Esto es hoy una revisión excepcional, no un paso obligatorio para todos los creadores.
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
            Pedimos a los creadores que dejen evidencia del sorteo y de la entrega del premio — esa evidencia queda
            protegida y puede usarse para resolver una disputa o una denuncia.
          </p>
        </section>

        <section>
          <h2>Protección de datos</h2>
          <p>
            Tus datos privados (RUT, teléfono, domicilio, documentos) nunca se muestran públicamente ni se entregan
            automáticamente a otros usuarios. Se usan únicamente para operar la plataforma, prevenir fraude y
            cumplir obligaciones legales. Más detalle en nuestra <a href="/terminos#privacidad">Política de Privacidad</a>.
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

Seguridad.getLayout = (page) => <Layout>{page}</Layout>;
