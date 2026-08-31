// pages/terminos.js
import Layout from "@/components/Layout";

export default function Terminos() {
  return (
    <>
      <main style={{maxWidth:900, margin:"0 auto", padding:"24px 16px"}}>
        <h1 style={{marginBottom:8}}>Términos y Condiciones</h1>
        <p style={{color:"#6B7280"}}>Última actualización: 15/08/2026</p>

        <hr style={{margin:"16px 0"}}/>

        <nav style={{margin:"12px 0 24px"}}>
          <a href="#comprador">Comprador</a>{" · "}
          <a href="#creador">Creador</a>{" · "}
          <a href="#rifex">Condiciones de Rifex</a>{" · "}
          <a href="/privacidad">Privacidad</a>{" · "}
          <a href="/cookies">Cookies</a>{" · "}
          <a href="/uso-aceptable">Uso aceptable</a>{" · "}
          <a href="/reglas-iniciativas-premio">Anexo iniciativas con premio</a>
        </nav>

        <section id="comprador">
          <h2>Términos del Comprador</h2>
          <ol>
            <li><strong>Qué es Rifex.</strong> Rifex (rifex.pro) conecta a <em>creadores</em> con <em>compradores</em> para rifas. Salvo indicación expresa, Rifex no es propietario del premio ni el organizador.</li>
            <li><strong>Requisitos.</strong> Mayor de 18 años; datos veraces; no usar medios de pago ajenos sin autorización.</li>
            <li><strong>Estados de números.</strong> Disponible, Reservado, Vendido. Si hay colisión, prevalece el pago aprobado primero por la pasarela.</li>
            <li><strong>Pagos.</strong> Se procesan con pasarelas (p. ej., Mercado Pago) y aplican sus comisiones/condiciones. Rifex cobra una comisión del 7% sobre cada número vendido, descontada automáticamente por la pasarela al momento del pago.</li>
            <li><strong>Premio y sorteo.</strong> Definidos por el creador y visibles en la ficha; debe publicar evidencia del sorteo. Rifex no custodia ni transfiere directamente el dinero del premio — los pagos de los compradores se acreditan directo en la cuenta del creador conectada al proveedor de pagos, descontada la comisión de Rifex.</li>
            <li><strong>Entrega del premio.</strong> Dinero: transferencia. Físico: a convenir / retiro / envío pagado / envío incluido (según rifa).</li>
            <li><strong>Reembolsos y disputas.</strong> Cargo duplicado o error: gestionar con pasarela y notificar a Rifex. Incumplimiento del creador: abre ticket con evidencia; Rifex puede sancionar al creador, sin garantizar reembolso fuera de lo exigido por ley/pasarela.</li>
            <li><strong>Limitaciones.</strong> Participar en rifas implica aleatoriedad. Rifex no garantiza resultados ni cumplimiento de terceros, salvo en rifas marcadas como depósito por Rifex.</li>
            <li><strong>Datos personales.</strong> Se usan para confirmar compras, notificaciones y gestión, según la <a href="#privacidad">Política de Privacidad</a>.</li>
            <li><strong>Contacto.</strong> <a href="mailto:contacto@rifex.pro">contacto@rifex.pro</a></li>
          </ol>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="creador">
          <h2>Términos del Creador</h2>
          <p style={{background:"#FEF3C7", border:"1px solid #FDE68A", color:"#92400E", borderRadius:8, padding:"10px 14px", fontWeight:700}}>
            PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD.
          </p>
          <ol>
            <li><strong>Responsabilidades.</strong> Describir claramente premio, precio, cupos, fechas, reglas y modalidad de entrega/pago; cumplir normativa; publicar evidencia de sorteo y entrega/pago. El creador es el único responsable de la veracidad de lo que declara y de que su iniciativa cumpla la ley chilena aplicable.</li>
            <li><strong>Existencia, propiedad y autorización del premio.</strong> El creador declara que el premio existe, que le pertenece o que cuenta con autorización expresa de su propietario para ofrecerlo, y que puede entregarlo en las condiciones anunciadas.</li>
            <li><strong>Comisión y flujo de pago.</strong> No hay planes ni suscripciones: cualquier creador puede publicar rifas ilimitadas conectando su propia cuenta de Mercado Pago. Rifex cobra un 7% de comisión sobre cada número vendido, descontado automáticamente en cada pago aprobado; el resto se acredita directo en la cuenta del creador, más la comisión propia de la pasarela.</li>
            <li><strong>Conservación y entrega del premio.</strong> El creador debe conservar el premio en condiciones adecuadas hasta la entrega y cumplir el mecanismo de entrega anunciado en la ficha (retiro, envío, transferencia). Cuando un premio físico requiera envío, retiro o entrega presencial, el creador deberá informar previamente la modalidad aplicable y, cuando exista un costo de envío, quién será responsable de asumirlo. Si el premio requiere transferencia de dominio, inscripción, documentación, gastos notariales u otros trámites para su entrega, estos costos y la responsabilidad de pagarlos deben informarse expresamente en las condiciones de la rifa antes de su publicación. No podrán imponerse al ganador cobros adicionales que no hayan sido informados previamente. El creador es responsable de que la descripción del premio, sus condiciones de entrega y los gastos asociados sean completos, claros y veraces. Rifex exige transparencia previa; esto no determina por sí solo quién debe pagar por ley.</li>
            <li><strong>Cumplimiento de bases y fechas.</strong> Las fechas y reglas publicadas (cierre de venta, sorteo, plazo de entrega) son vinculantes para el creador; cualquier cambio debe informarse a los participantes antes de que ocurra.</li>
            <li><strong>Contacto con el ganador.</strong> El creador debe contactar al ganador dentro de un plazo razonable tras el sorteo y dejar evidencia de ese contacto.</li>
            <li><strong>Evidencia protegida.</strong> La evidencia de sorteo, entrega y comunicación con ganadores/participantes que el creador suba a Rifex se conserva de forma protegida y puede usarse para resolver disputas o denuncias.</li>
            <li><strong>Obligación de responder.</strong> El creador debe responder los requerimientos de Rifex sobre una iniciativa dentro del plazo que se le indique; la falta de respuesta puede tratarse como incumplimiento.</li>
            <li><strong>Prohibiciones.</strong> Premios ilícitos/restringidos, publicidad engañosa, infracción de marcas/copyright, manipulación del sorteo.</li>
            <li><strong>Auditoría.</strong> Rifex puede solicitar comprobantes; la falta puede implicar suspensión.</li>
            <li><strong>Consecuencias por incumplimiento, suspensión y bloqueo de nuevas iniciativas.</strong> Un incumplimiento verificado puede derivar en suspensión de la cuenta y bloqueo para crear nuevas iniciativas, de forma proporcional a la gravedad y sin perjuicio de otras medidas de este documento. Rifex no califica automáticamente un incumplimiento como delito — eso corresponde exclusivamente a la autoridad competente.</li>
            <li><strong>Fraude y chargebacks.</strong> Rifex puede pausar una iniciativa, cancelar transacciones y bloquear cuentas. Rifex no custodia los fondos de las ventas — no puede "retener" dinero que nunca recibe; el proveedor de pagos conectado es quien procesa cargos, contracargos y disputas de pago según sus propias políticas.</li>
            <li><strong>Historial y preservación de evidencia.</strong> Rifex mantiene un historial de las iniciativas y decisiones asociadas a cada cuenta, y preserva la evidencia relevante mientras exista una razón legítima para conservarla (auditoría, disputa, obligación legal).</li>
            <li><strong>Cooperación con autoridades.</strong> Ante una solicitud válida de una autoridad competente, Rifex puede cooperar entregando la información e información que corresponda conforme a la ley.</li>
            <li><strong>Derechos de participantes y ganadores.</strong> Quienes compran un número o resultan ganadores tienen derecho a la información veraz de la iniciativa, al premio anunciado en las condiciones publicadas, y a presentar una denuncia si detectan un incumplimiento.</li>
            <li><strong>Datos de compradores.</strong> Usar solo para gestionar la rifa; prohibido spam o cesión sin base legal. El teléfono de contacto que el creador entrega a Rifex se usa únicamente para comunicaciones operativas, de seguridad, de entrega de premios y de resolución de disputas relacionadas con sus iniciativas — Rifex nunca entrega automáticamente el RUT, teléfono, domicilio ni documentos de un creador a terceros ni a otros usuarios.</li>
            <li><strong>Impuestos.</strong> A cargo del creador.</li>
          </ol>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="rifex">
          <h2>Condiciones de Uso de Rifex</h2>
          <ol>
            <li><strong>Cuenta y acceso.</strong> Mantén credenciales seguras; Rifex puede suspender ante violaciones.</li>
            <li><strong>Servicio.</strong> Infraestructura técnica para rifas, pagos, paneles y comunicaciones; puede cambiar o interrumpirse por mantenimiento o fuerza mayor.</li>
            <li><strong>Tarifas vigentes.</strong> Comisión única del 7% por número vendido (ver sección de Comisión y flujo de pago en los Términos del Creador). Puede actualizarse con aviso razonable.</li>
            <li><strong>Propiedad intelectual.</strong> Software y marcas de Rifex; contenido de rifas pertenece al creador; Rifex obtiene licencia para mostrarlo en la plataforma.</li>
            <li><strong>Limitación de responsabilidad.</strong> Sin responsabilidad por daños indirectos o lucro cesante; tope: comisiones pagadas a Rifex en los últimos 3 meses, cuando legalmente aplique.</li>
            <li><strong>Ley y jurisdicción.</strong> Chile; tribunales del domicilio de Rifex, salvo normas imperativas de consumo.</li>
            <li><strong>Cambios.</strong> Publicaremos fecha de actualización y avisos relevantes.</li>
            <li><strong>Contacto.</strong> <a href="mailto:contacto@rifex.pro">contacto@rifex.pro</a></li>
          </ol>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="privacidad">
          <h2>Política de Privacidad (resumen)</h2>
          <ul>
            <li><strong>Responsable:</strong> Rifex (rifex.pro).</li>
            <li><strong>Datos:</strong> correo, nombre opcional, IP, logs, datos de compra, contenidos de rifas.</li>
            <li><strong>Finalidades:</strong> gestionar rifas, pagos, comunicaciones, seguridad/fraude y soporte.</li>
            <li><strong>Base legal:</strong> contrato, interés legítimo, cumplimiento legal y/o consentimiento.</li>
            <li><strong>Terceros:</strong> pasarelas, hosting, email, analítica agregada.</li>
            <li><strong>Conservación:</strong> mientras exista la cuenta/rifa y plazos legales.</li>
            <li><strong>Derechos:</strong> acceso, rectificación, cancelación, oposición, portabilidad y limitación.</li>
          </ul>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="cookies">
          <h2>Política de Cookies (resumen)</h2>
          <ul>
            <li>Usamos cookies esenciales (sesión/seguridad) y analíticas/publicitarias opcionales.</li>
            <li>La pasarela puede usar cookies/almacenamiento para completar pagos.</li>
            <li>
              Usamos Meta Pixel (Facebook) como tecnología de medición y publicidad para entender cómo se usa
              Rifex. Solo se activa si aceptas el aviso de consentimiento que aparece al entrar al sitio — podés
              rechazarlo, y tu elección se recuerda para tus próximas visitas.
            </li>
            <li>Puedes limitar cookies no esenciales desde tu navegador.</li>
          </ul>
        </section>
      </main>
    </>
  );
}

Terminos.getLayout = (page) => (
  <Layout
    title="Términos y Condiciones — Rifex"
    description="Términos y condiciones de uso de Rifex para compradores, aportantes y creadores de eventos, campañas e iniciativas."
    canonicalPath="/terminos"
  >
    {page}
  </Layout>
);
