// src/pages/privacidad.js
// STAGE 2 REPAIR — la advertencia jurídica visible y el TODO de
// identidad legal del operador se retiraron de esta página pública;
// ambos siguen vivos en docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt.
// Esto no declara ni implica que hubo revisión legal — solo deja de
// exponer el pendiente interno al público.
import Layout from "@/components/Layout";

export default function Privacidad() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Política de Privacidad</h1>
      <p style={{ color: "#6B7280", marginBottom: 16 }}>Versión 1.0 · Publicada 01/09/2026</p>

      <section>
        <h2>Responsable del tratamiento</h2>
        <p>
          Rifex (rifex.pro). Puedes contactarnos en <a href="mailto:contacto@rifex.pro">contacto@rifex.pro</a>.
        </p>
      </section>

      <section>
        <h2>Datos que recopilamos</h2>
        <ul>
          <li>Datos de cuenta: nombre o razón social, correo, RUT, teléfono, IP y actividad técnica de la sesión.</li>
          <li>Datos de iniciativas: eventos y campañas creadas, entradas emitidas, aportes, compras y otras operaciones realizadas mediante la plataforma.</li>
          <li>Datos de verificación: información de identidad proporcionada por el usuario y resultados derivados de controles de identidad y titularidad (nunca el detalle bancario del proveedor de pagos).</li>
        </ul>
      </section>

      <section>
        <h2>Verificación y seguridad de la cuenta</h2>
        <p>
          Rifex puede aplicar controles de identidad y titularidad para proteger las cuentas, reducir usos
          indebidos y determinar la habilitación de determinadas operaciones. Los resultados de estas
          verificaciones se utilizan para fines operativos y de seguridad y no se muestran públicamente.
        </p>
      </section>

      <section>
        <h2>Finalidades</h2>
        <ul>
          <li>Operar la plataforma: creación y administración de eventos, campañas e iniciativas.</li>
          <li>Procesar pagos a través de proveedores conectados.</li>
          <li>Seguridad, prevención de usos indebidos y controles de identidad y titularidad.</li>
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

      <section>
        <h2>Actualizaciones de esta política</h2>
        <p>
          Rifex puede actualizar esta política para reflejar cambios en la plataforma, sus proveedores y los
          requisitos aplicables en los países donde se encuentre disponible. La fecha de la versión vigente se
          indica al comienzo de esta página.
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
