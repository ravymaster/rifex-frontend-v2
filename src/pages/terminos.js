// pages/terminos.js
// STAGE 2 REPAIR — /terminos es ahora exclusivamente el documento
// corporativo público de Rifex (Eventos, entradas digitales, Campañas,
// plataforma). Las condiciones históricas/específicas de Rifas
// (Comprador, Creador, Condiciones de Rifex-Rifas) se movieron
// verbatim a /terminos-rifas — mismo texto, mismos anchors — para que
// crear-rifa.jsx, rifas/[id].jsx y BuyerForm.jsx sigan apuntando a la
// aceptación contractual real sin ninguna referencia rota. #privacidad
// y #cookies se conservan aquí sin cambios porque ConsentBanner.jsx y
// registro/continuar.jsx dependen de esos anchors exactos.
import Layout from "@/components/Layout";

export default function Terminos() {
  return (
    <>
      <main style={{maxWidth:900, margin:"0 auto", padding:"24px 16px"}}>
        <h1 style={{marginBottom:8}}>Términos y Condiciones</h1>
        <p style={{color:"#6B7280"}}>Última actualización: 01/09/2026</p>

        <hr style={{margin:"16px 0"}}/>

        <nav style={{margin:"12px 0 24px"}}>
          <a href="#rifex">Qué es Rifex</a>{" · "}
          <a href="#cuentas">Cuentas</a>{" · "}
          <a href="#plataforma">Eventos y Campañas</a>{" · "}
          <a href="#pagos">Pagos y comisión</a>{" · "}
          <a href="#responsabilidades">Responsabilidades</a>{" · "}
          <a href="#reembolsos">Reembolsos</a>{" · "}
          <a href="/uso-aceptable">Uso aceptable</a>{" · "}
          <a href="/seguridad">Seguridad</a>{" · "}
          <a href="/cumplimiento">Cumplimiento</a>{" · "}
          <a href="/privacidad">Privacidad</a>{" · "}
          <a href="/cookies">Cookies</a>{" · "}
          <a href="#suspension">Suspensión</a>{" · "}
          <a href="#contacto">Contacto</a>{" · "}
          <a href="#cambios">Modificaciones</a>
        </nav>

        <section id="rifex">
          <h2>Qué es Rifex</h2>
          <p>
            Rifex (rifex.pro) es una plataforma tecnológica que permite a organizadores publicar eventos con
            entradas digitales y campañas de recaudación, y a usuarios comprar entradas o realizar aportes. Rifex
            no es organizador de los eventos ni beneficiario de las campañas — esa responsabilidad es de cada
            organizador.
          </p>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="cuentas">
          <h2>Cuentas y usuarios</h2>
          <ol>
            <li><strong>Registro.</strong> Para crear una iniciativa es necesario completar un registro: nombre (persona natural o empresa/organización), RUT válido, teléfono de contacto, declaración de ser mayor de 18 años, y la aceptación de estos Términos y de la Política de Privacidad.</li>
            <li><strong>Cuenta y acceso.</strong> Mantén tus credenciales seguras; Rifex puede suspender el acceso ante una violación de estas condiciones.</li>
            <li><strong>Veracidad de los datos.</strong> Eres responsable de que los datos que declares sean veraces y estén actualizados.</li>
          </ol>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="plataforma">
          <h2>Eventos, entradas digitales y Campañas de recaudación</h2>
          <ol>
            <li><strong>Qué es un Evento en Rifex.</strong> Un organizador publica un evento con uno o más tipos de entrada digital, cada una con su propio cupo. Cada entrada se emite como un código QR de un solo uso para el control de acceso.</li>
            <li><strong>Qué es una Campaña en Rifex.</strong> Un organizador publica una campaña de recaudación y quienes aportan reciben confirmación de su aporte; el detalle operativo está en la <a href="/politica-campanas">Política de Campañas</a>.</li>
            <li><strong>Más detalle por producto.</strong> <a href="/politica-eventos">Política de Eventos</a> y <a href="/politica-campanas">Política de Campañas</a>.</li>
          </ol>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="pagos">
          <h2>Pagos y comisión</h2>
          <ol>
            <li><strong>Procesamiento.</strong> Los pagos se procesan mediante el proveedor de pagos conectado por el organizador (Mercado Pago). Los fondos se acreditan directo en la cuenta del organizador, descontada la comisión de Rifex.</li>
            <li><strong>Comisión.</strong> Rifex cobra una comisión única del 7% sobre cada entrada vendida o aporte exitoso, descontada automáticamente por el proveedor de pagos al momento del pago. No hay planes, suscripciones ni cobro por publicar — ver <a href="/planes">Comisión</a>.</li>
            <li><strong>Tarifas del proveedor.</strong> El proveedor de pagos puede aplicar sus propias tarifas de procesamiento o retiro, independientes de la comisión de Rifex.</li>
          </ol>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="responsabilidades">
          <h2>Responsabilidades</h2>
          <ol>
            <li><strong>Del organizador.</strong> Describir con veracidad su evento o campaña, cumplir la normativa aplicable, y respetar las condiciones publicadas antes y después de recibir pagos.</li>
            <li><strong>Del usuario, comprador o aportante.</strong> Ser mayor de 18 años, proporcionar datos veraces, y no usar medios de pago ajenos sin autorización.</li>
            <li><strong>De la plataforma.</strong> Rifex provee la infraestructura técnica; no es responsable por el contenido, la ejecución o el cumplimiento de cada evento o campaña individual más allá de los controles descritos en <a href="/seguridad">Seguridad</a> y <a href="/cumplimiento">Cumplimiento</a>. En la medida permitida por la normativa aplicable, Rifex no será responsable por daños indirectos o lucro cesante.</li>
          </ol>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="reembolsos">
          <h2>Cancelaciones, reembolsos y disputas</h2>
          <p>
            Ver la <a href="/reembolsos">Política de Reembolsos</a> para el detalle real de qué es posible hoy en
            la plataforma — Rifex no inventa mecanismos que el sistema no soporta. Ante un cargo duplicado o un
            error de cobro, contacta primero al proveedor de pagos y notifica a Rifex. Ante un incumplimiento de un
            organizador, puedes <a href="/reportar">reportarlo</a>.
          </p>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="suspension">
          <h2>Suspensión</h2>
          <p>
            Un incumplimiento verificado de estos Términos, de la <a href="/uso-aceptable">Política de Uso
            Aceptable</a> o de la normativa aplicable puede derivar en la suspensión de una cuenta y el bloqueo
            para crear nuevas iniciativas, de forma proporcional a la gravedad. Rifex no determina por sí sola si
            un incumplimiento constituye un delito — eso corresponde exclusivamente a la autoridad competente.
          </p>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="contacto">
          <h2>Contacto</h2>
          <p>
            <a href="mailto:contacto@rifex.pro">contacto@rifex.pro</a> — también puedes escribirnos desde{" "}
            <a href="/contacto">Contacto</a>.
          </p>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="cambios">
          <h2>Modificaciones de las condiciones</h2>
          <p>
            Rifex puede actualizar estos Términos para reflejar cambios en la plataforma, sus proveedores y los
            requisitos aplicables en los países donde se encuentre disponible. La fecha de la versión vigente se
            indica al comienzo de esta página.
          </p>
        </section>

      </main>
    </>
  );
}

Terminos.getLayout = (page) => (
  <Layout
    title="Términos y Condiciones — Rifex"
    description="Conoce las condiciones de uso de Rifex para organizadores y usuarios de eventos, entradas digitales y campañas de recaudación en línea."
    canonicalPath="/terminos"
  >
    {page}
  </Layout>
);
