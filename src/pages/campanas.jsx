// src/pages/campanas.jsx
// RIFEX PRODUCT LANDINGS V1 — landing comercial de Campañas (Colectas).
// PSCG: PUBLIC_INDEXABLE. Ruta nueva — /campanas no existía antes de
// esta misión (verificado, no asumido). Reemplaza el destino del navItem
// "Campañas" del navbar público, que antes apuntaba a
// /wizard?modo=colecta (ver src/components/Layout.jsx). Todo lo descrito
// abajo es real y verificado (crear-colecta.jsx, colectas/[id].jsx,
// checkout/colecta.js, colectaStatus.js) — sin garantías de recaudación,
// sin inventar declaraciones/checkboxes que no existen en el formulario.
import Head from 'next/head';
import Layout from '@/components/Layout';
import {
  ProductPage,
  ProductHero,
  ProductFeatureGrid,
  ProductSteps,
  ProductUseCases,
  ProductOperational,
  ProductSecurity,
  ProductFaq,
  ProductFinalCta,
} from '@/components/product/ProductSections';
import { buildServiceJsonLd, buildFaqJsonLd } from '@/lib/productJsonLd';
import { canonicalUrl } from '@/lib/publicMetadata';

const ACCENT = '#18A957'; // --trebol

const FEATURES = [
  { icon: '📝', title: 'Cuenta tu causa', desc: 'Título, descripción de hasta 5.000 caracteres y una meta de recaudación opcional — puedes dejarla libre si prefieres aportes sin un monto objetivo.' },
  { icon: '🖼️', title: 'Fotos y galería', desc: 'Una foto principal más hasta 10 fotos adicionales para mostrar el contexto real de tu campaña.' },
  { icon: '⏳', title: 'Duración definida', desc: 'Elige 15, 30 o 60 días de duración — al vencer, la campaña se marca automáticamente como finalizada.' },
  { icon: '💵', title: 'Montos sugeridos o libres', desc: 'Quien aporta puede elegir un monto sugerido o escribir el monto que prefiera.' },
  { icon: '🔗', title: 'Comparte con un link', desc: 'Cada campaña tiene su propia página pública con un botón para copiar el link al instante.' },
  { icon: '📱', title: 'QR descargable', desc: 'Descarga el código QR de tu campaña para compartirlo en volantes, redes o en persona.' },
  { icon: '📈', title: 'Progreso en vivo', desc: 'La página pública muestra lo recaudado, la meta (si definiste una) y los días restantes.' },
  { icon: '💳', title: 'Pagos a tu cuenta', desc: 'Los aportes se procesan por Mercado Pago y se acreditan en tu propia cuenta conectada.' },
];

const STEPS = [
  { title: 'Crea tu cuenta', desc: 'Regístrate en Rifex y conecta tu cuenta de Mercado Pago para poder recibir aportes.' },
  { title: 'Crea tu campaña', desc: 'Agrega título, descripción, fotos y, si quieres, una meta de recaudación.' },
  { title: 'Publica y comparte', desc: 'Comparte el link o el QR de tu campaña donde quieras.' },
  { title: 'Recibe aportes', desc: 'Cualquier persona puede aportar sin crear una cuenta, con un monto sugerido o libre.' },
  { title: 'Sigue tu recaudación', desc: 'Revisa en cualquier momento cuánto llevas recaudado y cuántos días te quedan.' },
];

const USE_CASES = [
  { icon: '❤️', title: 'Causas personales' },
  { icon: '💡', title: 'Proyectos' },
  { icon: '🏘️', title: 'Comunidades' },
  { icon: '⚽', title: 'Clubes' },
  { icon: '🏢', title: 'Organizaciones' },
  { icon: '🤲', title: 'Actividades solidarias' },
];

const OPERATIONAL = [
  { icon: '🔗', title: 'Enlace', desc: 'Cada campaña tiene una URL propia, lista para compartir donde quieras.' },
  { icon: '📱', title: 'QR', desc: 'Descarga el código QR de tu campaña en un clic desde tu panel.' },
  { icon: '📣', title: 'Redes / difusión', desc: 'Comparte tu campaña en tus redes — revisa nuestra guía de difusión para hacerlo con claridad.' },
];

const SECURITY = [
  'Los aportes se procesan mediante tu propia cuenta de Mercado Pago conectada — Rifex nunca retiene tus fondos.',
  'Quien aporta no necesita crear una cuenta en Rifex — solo su nombre y correo para recibir la confirmación.',
  'Quien crea una campaña es responsable de la información que publica en ella.',
  'Rifex no garantiza que una campaña alcance su meta de recaudación.',
];

const FAQ = [
  { q: '¿Necesito Mercado Pago para recibir aportes?', a: 'Sí. Los aportes se acreditan directamente en tu propia cuenta de Mercado Pago conectada a Rifex.' },
  { q: '¿Es obligatorio poner una meta de recaudación?', a: 'No. Puedes dejar la meta vacía y recibir aportes libres, sin una barra de progreso hacia un objetivo.' },
  { q: '¿Cuánto dura una campaña?', a: 'Eliges 15, 30 o 60 días al crearla. Al vencer ese plazo, la campaña se marca automáticamente como finalizada.' },
  { q: '¿Quién puede aportar?', a: 'Cualquier persona, sin necesidad de tener una cuenta en Rifex — solo indica su nombre y correo.' },
  { q: '¿Cómo comparto mi campaña?', a: 'Desde tu panel puedes copiar el link público o descargar el código QR de tu campaña.' },
];

export default function CampanasLanding() {
  const url = canonicalUrl('/campanas');
  const serviceJsonLd = buildServiceJsonLd({
    name: 'Rifex Campañas',
    description: 'Crea una campaña de recaudación, compártela con un link o QR y recibe aportes directamente en tu cuenta.',
    url,
  });
  const faqJsonLd = buildFaqJsonLd(FAQ);

  return (
    <Layout
      title="Campañas de recaudación con link y QR — Rifex"
      description="Crea una campaña, cuenta tu causa, comparte un link o QR y recibe aportes libres o sugeridos directamente en tu cuenta de Mercado Pago."
      canonicalPath="/campanas"
    >
      <Head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      </Head>
      <ProductPage accent={ACCENT}>
        <ProductHero
          eyebrow="RIFEX · CAMPAÑAS"
          title="Comparte tu causa y recibe aportes"
          subtitle="Crea una campaña, cuenta tu historia con fotos, comparte un link o QR y recibe aportes libres o sugeridos, sin que quien aporta necesite una cuenta."
          primaryCta={{ label: 'Crear una campaña', href: '/crear-colecta' }}
          chips={[
            { value: '60 días', label: 'Duración máxima' },
            { value: '10', label: 'Fotos de galería' },
            { value: '$0', label: 'Aporte sin cuenta' },
          ]}
        />
        <ProductFeatureGrid
          title="Todo lo que puedes hacer"
          subtitle="Desde contar tu causa hasta seguir tu recaudación en tiempo real."
          items={FEATURES}
        />
        <ProductSteps title="Así funciona" steps={STEPS} />
        <ProductUseCases
          title="Pensado para..."
          subtitle="Cualquier causa que necesite reunir aportes de forma simple y transparente."
          items={USE_CASES}
        />
        <ProductOperational title="Comparte tu campaña donde quieras" items={OPERATIONAL} />
        <ProductSecurity title="Confianza y control" items={SECURITY} />
        <ProductFaq title="Preguntas frecuentes" items={FAQ} />
        <ProductFinalCta
          title="Tu causa merece ser contada"
          subtitle="Crea tu campaña en minutos y empieza a compartirla hoy mismo."
          cta={{ label: 'Crear una campaña', href: '/crear-colecta' }}
        />
      </ProductPage>
    </Layout>
  );
}
