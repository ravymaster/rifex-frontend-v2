// src/pages/soluciones/rifas.jsx
// RIFEX PRODUCT LANDINGS V1 — landing de Rifas para usuarios ya
// autenticados. PSCG: PRIVATE_AUTHENTICATED, boundary ssr_redirect desde
// el primer commit (mismo patrón que mis-iniciativas.jsx/difusion.jsx —
// getServerSideProps con destino literal fijo, nunca ctx.query). /rifas
// (LEGACY_REMOVED, src/pages/rifas.js) sigue siendo el redirect histórico
// del antiguo catálogo público y NO se toca — esta es una ruta nueva y
// distinta, nunca enlazada desde navegación pública/footer/wizard/
// sitemap. Solo describe funciones reales y verificadas (crear-rifa.jsx,
// rifas/[id].jsx, panel/index.js, drawWinner.js, api/rifas/[id]/extend.js)
// — cero contenido inventado, cero garantía de venta.
import Head from 'next/head';
import Layout from '@/components/Layout';
import { getSupabaseServer } from '@/lib/supabaseServer';
import {
  ProductPage,
  ProductHero,
  ProductFeatureGrid,
  ProductSteps,
  ProductOperational,
  ProductSecurity,
  ProductFaq,
  ProductFinalCta,
} from '@/components/product/ProductSections';

const ACCENT = '#F59E0B'; // ámbar — distingue visualmente el único producto privado

export async function getServerSideProps(ctx) {
  const s = getSupabaseServer(ctx.req, ctx.res);
  let user = null;
  try {
    const { data } = await s.auth.getUser();
    user = data?.user || null;
  } catch (_) {
    user = null;
  }
  if (!user) {
    return { redirect: { destination: '/login?next=/soluciones/rifas', permanent: false } };
  }
  return { props: {} };
}

const FEATURES = [
  { icon: '📝', title: 'Configura tu rifa', desc: 'Título, premio (dinero o un premio físico con fotos), precio por número, cantidad total de números y fecha y hora del sorteo.' },
  { icon: '🔢', title: 'Venta de números', desc: 'Quien compra elige sus números desde tu página pública — no necesita crear una cuenta en Rifex.' },
  { icon: '📅', title: 'Sorteo programado', desc: 'El sorteo se realiza automáticamente en la fecha configurada, o puedes realizarlo tú mismo una vez cerradas las ventas.' },
  { icon: '➕', title: 'Extensión de fecha', desc: 'Si definiste un límite de extensiones al crear la rifa, puedes mover la fecha del sorteo dentro de ese límite.' },
  { icon: '🏆', title: 'Ganador automático', desc: 'El sorteo elige un número entre los efectivamente vendidos, y notifica por correo tanto al ganador como a ti.' },
  { icon: '💳', title: 'Pagos a tu cuenta', desc: 'Los compradores pagan con Mercado Pago y el dinero se acredita en tu propia cuenta conectada.' },
];

const STEPS = [
  { title: 'Crea tu rifa', desc: 'Define el premio, el precio y la cantidad de números, y la fecha del sorteo.' },
  { title: 'Publica y comparte', desc: 'Tu rifa queda disponible en su propia página — compártela con quien quieras.' },
  { title: 'Vende tus números', desc: 'Las ventas se cierran automáticamente poco antes del sorteo.' },
  { title: 'Se realiza el sorteo', desc: 'Automático en la fecha programada, o manual una vez cerradas las ventas.' },
  { title: 'Se notifica al ganador', desc: 'El ganador y tú reciben la confirmación por correo.' },
];

const OPERATIONAL = [
  { icon: '📅', title: 'Sorteo en fecha exacta', desc: 'Un proceso automático realiza el sorteo apenas se cumple la fecha configurada.' },
  { icon: '➕', title: 'Extensión con límite', desc: 'Puedes extender la fecha del sorteo hasta el límite de extensiones que definiste al crear la rifa.' },
  { icon: '📥', title: 'QR de tu rifa', desc: 'Descarga el código QR de tu rifa desde el panel para compartirlo fuera de internet.' },
];

const SECURITY = [
  'Debes declarar tu mayoría de edad y la veracidad del premio antes de poder crear una rifa.',
  'El ganador se determina entre los números efectivamente vendidos, nunca entre números sin vender.',
  'Una vez que la rifa tiene su primer número vendido, el premio y las condiciones de entrega quedan bloqueados y ya no se pueden modificar.',
  'El sorteo queda registrado una sola vez — un intento repetido nunca vuelve a sortear la misma rifa.',
];

const FAQ = [
  { q: '¿Necesito Mercado Pago para vender números?', a: 'Sí. Los pagos de tus compradores se acreditan directamente en tu propia cuenta de Mercado Pago conectada a Rifex.' },
  { q: '¿Puedo cambiar la fecha del sorteo?', a: 'Sí, si al crear la rifa definiste un límite de extensiones mayor a 0 y todavía no se ha realizado el sorteo.' },
  { q: '¿Cómo se elige al ganador?', a: 'De forma aleatoria, entre los números que fueron efectivamente comprados y pagados.' },
  { q: '¿Puedo modificar el premio después de crear la rifa?', a: 'Solo hasta que se venda el primer número. Después de eso, el premio y las condiciones de entrega quedan bloqueados.' },
];

export default function RifasLanding() {
  return (
    <Layout
      title="Rifas — Rifex"
      description="Crea tu rifa, vende números y realiza el sorteo desde Rifex."
      noindex
      noarchive
    >
      <Head>
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </Head>
      <ProductPage accent={ACCENT}>
        <ProductHero
          eyebrow="RIFEX · RIFAS"
          title="Crea tu rifa, vende números y sortea un ganador"
          subtitle="Configura el premio, el precio por número y la fecha del sorteo. Rifex se encarga de la venta, el cierre y la elección del ganador."
          primaryCta={{ label: 'Crear una rifa', href: '/crear-rifa' }}
          chips={[
            { value: '3', label: 'Extensiones de fecha máximo' },
            { value: '7%', label: 'Comisión de servicio' },
          ]}
        />
        <ProductFeatureGrid
          title="Todo lo que puedes hacer"
          subtitle="Desde la configuración inicial hasta la notificación del ganador."
          items={FEATURES}
        />
        <ProductSteps title="Así funciona" steps={STEPS} />
        <ProductOperational title="Lo que hace especial el sorteo de Rifex" items={OPERATIONAL} />
        <ProductSecurity title="Confianza y control" items={SECURITY} />
        <ProductFaq title="Preguntas frecuentes" items={FAQ} />
        <ProductFinalCta
          title="Tu próxima rifa, lista para vender números"
          subtitle="Configura tu rifa en minutos."
          cta={{ label: 'Crear una rifa', href: '/crear-rifa' }}
          note="Las políticas de redes sociales y plataformas publicitarias pueden aplicar restricciones a determinados tipos de promociones. Revisa nuestra guía de difusión antes de publicar."
          noteLink={{ label: 'Ver guía de difusión →', href: '/difusion' }}
        />
      </ProductPage>
    </Layout>
  );
}
