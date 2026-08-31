// src/pages/privacidad.js
// RIFEX V4 A5 — borrador técnico de Política de Privacidad. Estructura y
// contenido técnicamente verdadero según el código real (contraste
// RUT-titularidad, Meta Pixel gateado por consentimiento, proveedores
// reales). Base jurídica exacta bajo Ley 19.628/21.719 queda marcada
// LEGAL_REVIEW_REQUIRED — no se inventa ni se declara "revisado por
// abogado" en este documento.
import Layout from "@/components/Layout";

const legalBanner = {
  background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E",
  borderRadius: 8, padding: "10px 14px", fontWeight: 700, marginBottom: 16,
};

export default function Privacidad() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Política de Privacidad</h1>
      <p style={{ color: "#6B7280", marginBottom: 16 }}>Versión 1.0 · Publicada 31/08/2026 · Responsable del documento: equipo Rifex</p>

      <p style={legalBanner}>
        PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD. Este documento describe técnicamente cómo funciona
        Rifex hoy; la base jurídica exacta bajo la Ley 19.628 vigente y la Ley 21.719 (vigencia desde el 1 de
        diciembre de 2026) requiere confirmación legal antes de considerarse una política final aprobada.
      </p>

      <section>
        <h2>Responsable del tratamiento</h2>
        <p>
          Rifex (rifex.pro). La identidad legal completa del operador (razón social, RUT de empresa, domicilio
          comercial) se publicará aquí una vez confirmada — no se declara mientras no exista esa confirmación.
        </p>
      </section>

      <section>
        <h2>Datos que recopilamos</h2>
        <ul>
          <li>Datos de cuenta: nombre o razón social, correo, RUT, teléfono, IP y actividad técnica de la sesión.</li>
          <li>Datos de iniciativas: eventos, campañas y rifas creadas, entradas emitidas, aportes y compras realizadas.</li>
          <li>Datos de verificación: RUT declarado y el resultado del contraste con la titularidad informada por el proveedor de pagos conectado (nunca el detalle bancario del proveedor).</li>
        </ul>
      </section>

      <section>
        <h2>Contraste de titularidad</h2>
        <p>
          Rifex utiliza los datos de identidad declarados por el organizador y la información de titularidad
          proporcionada por el proveedor de pagos para comprobar su consistencia, prevenir suplantaciones y reducir
          el riesgo de fraude. Si se detecta una diferencia, la cuenta queda pendiente de revisión y no se habilita
          automáticamente para operar. Esta información no se muestra públicamente.
        </p>
      </section>

      <section>
        <h2>Finalidades</h2>
        <ul>
          <li>Operar la plataforma: creación y administración de eventos, campañas e iniciativas.</li>
          <li>Procesar pagos a través de proveedores conectados.</li>
          <li>Prevención de fraude y verificación de identidad/titularidad.</li>
          <li>Soporte, comunicaciones operativas y cumplimiento legal.</li>
        </ul>
      </section>

      <section>
        <h2>Proveedores técnicos y de pagos</h2>
        <p>
          Supabase (base de datos y autenticación), Mercado Pago (procesamiento de pagos en Chile), Vercel (hosting)
          y, cuando el usuario acepta el aviso de cookies, Meta Pixel (medición de marketing). Ver <a href="/cookies">Cookies</a>.
        </p>
      </section>

      <section>
        <h2>Conservación</h2>
        <p>
          Los datos se conservan mientras exista la cuenta o la iniciativa asociada, y por los plazos adicionales que
          exijan obligaciones legales, de auditoría o de resolución de disputas.
        </p>
      </section>

      <section>
        <h2>Tus derechos</h2>
        <p>
          Puedes solicitar acceso, corrección o eliminación de tus datos personales, sujeto a las obligaciones
          legales y de auditoría que Rifex deba conservar. Escribe a <a href="mailto:contacto@rifex.pro">contacto@rifex.pro</a>.
        </p>
      </section>

      <section>
        <h2>Menores de edad</h2>
        <p>
          Rifex requiere que todo creador de una iniciativa declare ser mayor de 18 años. No está dirigido a la
          creación de cuentas por menores de edad.
        </p>
      </section>

      <section>
        <h2>Cookies y analítica</h2>
        <p>Ver la <a href="/cookies">Política de Cookies</a> para el detalle de qué tecnologías usamos y cómo controlarlas.</p>
      </section>

      <section>
        <h2>Incidentes y contacto</h2>
        <p>
          Ante un incidente de seguridad o una consulta de privacidad, escribe a{" "}
          <a href="mailto:contacto@rifex.pro">contacto@rifex.pro</a>.
        </p>
      </section>
    </main>
  );
}

Privacidad.getLayout = (page) => (
  <Layout
    title="Política de Privacidad — Rifex"
    description="Conoce qué datos utiliza Rifex, para qué se emplean y cómo ejercer tus derechos de privacidad."
    canonicalPath="/privacidad"
  >
    {page}
  </Layout>
);
