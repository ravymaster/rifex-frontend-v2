// pages/terminos.js
import Head from "next/head";

export default function Terminos() {
  return (
    <>
      <Head><title>Términos y Condiciones — Rifex</title></Head>
      <main style={{maxWidth:900, margin:"0 auto", padding:"24px 16px"}}>
        <h1 style={{marginBottom:8}}>Términos y Condiciones</h1>
        <p style={{color:"#6B7280"}}>Última actualización: 10/09/2025</p>

        <hr style={{margin:"16px 0"}}/>

        <nav style={{margin:"12px 0 24px"}}>
          <a href="#comprador">Comprador</a>{" · "}
          <a href="#creador">Creador</a>{" · "}
          <a href="#rifex">Condiciones de Rifex</a>{" · "}
          <a href="#privacidad">Privacidad</a>{" · "}
          <a href="#cookies">Cookies</a>
        </nav>

        <section id="comprador">
          <h2>Términos del Comprador</h2>
          <ol>
            <li><strong>Qué es Rifex.</strong> Rifex (rifex.pro) conecta a <em>creadores</em> con <em>compradores</em> para rifas. Salvo indicación expresa, Rifex no es propietario del premio ni el organizador.</li>
            <li><strong>Requisitos.</strong> Mayor de 18 años; datos veraces; no usar medios de pago ajenos sin autorización.</li>
            <li><strong>Estados de números.</strong> Disponible, Reservado, Vendido. Si hay colisión, prevalece el pago aprobado primero por la pasarela.</li>
            <li><strong>Pagos.</strong> Se procesan con pasarelas (p. ej., Mercado Pago) y aplican sus comisiones/condiciones. Rifex puede cobrar cargo de servicio según plan del creador.</li>
            <li><strong>Premio y sorteo.</strong> Definidos por el creador y visibles en la ficha; debe publicar evidencia del sorteo. En “Depósito por Rifex”, Rifex transfiere el premio en dinero en el plazo informado.</li>
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
          <ol>
            <li><strong>Responsabilidades.</strong> Describir claramente premio, precio, cupos, fechas, reglas y modalidad de entrega/pago; cumplir normativa; publicar evidencia de sorteo y entrega/pago.</li>
            <li><strong>Planes y flujo.</strong>
              <ul>
                <li><strong>Gratis:</strong> Rifex cobra y deposita en 3–5 días hábiles; 7% Rifex + pasarela (3–5,5%); 1 rifa limitada.</li>
                <li><strong>Básico:</strong> 3% Rifex + pasarela; 2–3 rifas/mes; transferencias en 48 h hábiles.</li>
                <li><strong>Pro:</strong> 0% Rifex (solo pasarela); rifas ilimitadas; pagos directos en ~24 h según pasarela.</li>
              </ul>
            </li>
            <li><strong>Prohibiciones.</strong> Premios ilícitos/restringidos, publicidad engañosa, infracción de marcas/copyright, manipulación del sorteo.</li>
            <li><strong>Auditoría.</strong> Rifex puede solicitar comprobantes; la falta puede implicar suspensión.</li>
            <li><strong>Fraude y chargebacks.</strong> Rifex puede pausar, retener fondos, cancelar transacciones y bloquear cuentas.</li>
            <li><strong>Datos de compradores.</strong> Usar solo para gestionar la rifa; prohibido spam o cesión sin base legal.</li>
            <li><strong>Impuestos.</strong> A cargo del creador.</li>
          </ol>
        </section>

        <hr style={{margin:"24px 0"}}/>

        <section id="rifex">
          <h2>Condiciones de Uso de Rifex</h2>
          <ol>
            <li><strong>Cuenta y acceso.</strong> Mantén credenciales seguras; Rifex puede suspender ante violaciones.</li>
            <li><strong>Servicio.</strong> Infraestructura técnica para rifas, pagos, paneles y comunicaciones; puede cambiar o interrumpirse por mantenimiento o fuerza mayor.</li>
            <li><strong>Tarifas vigentes.</strong> Ver sección de planes en estos términos (Gratis/Básico/Pro). Pueden actualizarse con aviso razonable.</li>
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
            <li>Usamos cookies esenciales (sesión/seguridad) y analíticas opcionales.</li>
            <li>La pasarela puede usar cookies/almacenamiento para completar pagos.</li>
            <li>Puedes limitar cookies no esenciales desde tu navegador.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
