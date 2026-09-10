// src/pages/medidor-qr.jsx
// MEDIDOR QR V1 — landing comercial. PSCG: PUBLIC_INDEXABLE (misma
// clasificación que /inscripciones/campanas: producto público
// indexable, nunca un directorio de Medidores de usuarios — eso vive en
// /m/[slug], PUBLIC_NOINDEX). Misma anatomía que Eventos/Campañas/
// Inscripciones (ProductSections) — sección 15 del mandato: "diseño
// Rifex 2026, no una página administrativa".
import Head from 'next/head';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import {
  ProductPage,
  ProductHero,
  ProductFeatureGrid,
  ProductSteps,
  ProductUseCases,
  ProductSecurity,
  ProductFaq,
  ProductFinalCta,
} from '@/components/product/ProductSections';
import { buildServiceJsonLd, buildFaqJsonLd } from '@/lib/productJsonLd';
import { canonicalUrl } from '@/lib/publicMetadata';

const ACCENT = '#18A957'; // --trebol

const FEATURES = [
  { icon: '📋', title: '10 plantillas listas', desc: 'Convocatoria, satisfacción, atención al cliente, gastronomía y más — o escribe tu propia pregunta.' },
  { icon: '🔳', title: 'QR al instante', desc: 'Rifex genera tu código QR apenas creas tu Medidor, listo para imprimir.' },
  { icon: '📍', title: 'Ponlo donde quieras', desc: 'Flyers, carteles, vitrinas, mesas, productos, eventos, ferias o pantallas — vos elegís dónde.' },
  { icon: '👆', title: 'Respuesta en un toque', desc: 'Sin login, sin datos personales — la persona responde y listo.' },
  { icon: '📊', title: 'Métricas claras', desc: 'Escaneos, respuestas, conversión y evolución diaria, siempre etiquetados como lo que realmente son.' },
  { icon: '📥', title: 'Exporta a Excel', desc: 'Descarga tus métricas agregadas cuando quieras — nunca datos de personas.' },
];

const STEPS = [
  { title: 'Crea una pregunta', desc: 'Elige una plantilla o escribe la tuya, con entre 2 y 4 respuestas.' },
  { title: 'Genera tu QR', desc: 'Rifex lo crea al instante, listo para descargar.' },
  { title: 'Ponlo donde quieras', desc: 'Flyer, cartel, vitrina, producto, evento — donde ya llega tu público.' },
  { title: 'Recibe respuestas', desc: 'Cada escaneo puede responder en un toque, sin registrarse.' },
  { title: 'Mide los resultados', desc: 'Revisa tu panel privado y descarga tus métricas en Excel.' },
];

const USE_CASES = [
  { icon: '🏪', title: 'Comercio y nuevos productos' },
  { icon: '🍽️', title: 'Restaurantes y gastronomía' },
  { icon: '🎉', title: 'Eventos y ferias' },
  { icon: '🎓', title: 'Talleres, cursos y actividades' },
  { icon: '🤝', title: 'Atención al cliente' },
  { icon: '📣', title: 'Convocatorias con flyer o cartel' },
];

const SECURITY = [
  'Nunca pedimos nombre, correo, teléfono, RUT ni ubicación a quien responde — la respuesta es 100% anónima.',
  'Un mismo navegador no puede inflar las respuestas refrescando la página — el sistema detecta duplicados triviales.',
  'Si agregas un botón de destino opcional, siempre se muestra el dominio real antes de navegar — nunca una redirección automática.',
  'Sin Mercado Pago, sin comisión — hasta 10 Medidores QR gratis por mes, sin datos de pago involucrados.',
];

const FAQ = [
  { q: '¿Cuesta algo usar Medidor QR?', a: 'No. Es gratuito: hasta 10 Medidores QR nuevos por mes por cuenta, sin Mercado Pago ni comisión.' },
  { q: '¿Rifex mide asistencia real?', a: 'No. El Medidor mide escaneos, respuestas e intención declarada — nunca una promesa de asistencia efectiva.' },
  { q: '¿Necesito pedir datos personales a quien responde?', a: 'No. Nunca se pide nombre, correo, teléfono, RUT ni ubicación — la respuesta es anónima.' },
  { q: '¿Rifex diseña mi flyer o cartel?', a: 'No. Vos usás tu propio material — Rifex solo genera el código QR que pegás ahí.' },
  { q: '¿Puedo llevar a los que respondan a otra página?', a: 'Sí, opcionalmente. Podés configurar un botón de destino que se muestra después de responder, siempre con confirmación del dominio real.' },
  { q: '¿Cuántos Medidores QR gratis puedo crear?', a: 'Hasta 10 nuevos por mes calendario por cuenta. Los que ya creaste siguen funcionando normalmente.' },
];

export default function MedidorQrLanding() {
  const [next, setNext] = useState('/crear-medidor-qr');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) setNext(`/login?next=${encodeURIComponent('/crear-medidor-qr')}`);
    })();
  }, []);

  const url = canonicalUrl('/medidor-qr');
  const serviceJsonLd = buildServiceJsonLd({
    name: 'Rifex Medidor QR',
    description: 'Crea una pregunta, genera tu QR y úsalo en flyers, carteles, comercios, eventos o donde quieras para medir la respuesta de tu público.',
    url,
  });
  const faqJsonLd = buildFaqJsonLd(FAQ);

  return (
    <Layout
      title="Medidor QR gratis — Rifex"
      description="Crea una pregunta, genera tu QR gratis y mide la respuesta de tu público donde quieras: flyers, carteles, comercios, eventos y más."
      canonicalPath="/medidor-qr"
    >
      <Head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      </Head>
      <ProductPage accent={ACCENT}>
        <ProductHero
          eyebrow="RIFEX · MEDIDOR QR"
          title="Ponlo donde quieras. Mide la respuesta."
          subtitle="Crea una pregunta, genera tu QR y úsalo en flyers, carteles, locales, vitrinas, productos, eventos o donde quieras. Rifex convierte las respuestas en métricas fáciles de entender."
          primaryCta={{ label: 'Crear Medidor QR gratis', href: next }}
          chips={[
            { value: '10/mes', label: 'Medidores QR gratis' },
            { value: '0', label: 'Datos personales pedidos' },
            { value: '10', label: 'Plantillas listas' },
          ]}
        />
        <ProductFeatureGrid
          title="Todo lo que puedes hacer"
          subtitle="Desde crear tu pregunta hasta descargar tus métricas en Excel."
          items={FEATURES}
        />
        <ProductSteps title="Así funciona" steps={STEPS} />
        <ProductUseCases
          title="Pensado para..."
          subtitle="No está limitado a flyers — usalo donde tu público ya está."
          items={USE_CASES}
        />
        <ProductSecurity title="Confianza y privacidad" items={SECURITY} />
        <ProductFaq title="Preguntas frecuentes" items={FAQ} />
        <ProductFinalCta
          title="Mide el interés real de tu próxima pregunta"
          subtitle="Crea tu Medidor QR gratuito en minutos."
          cta={{ label: 'Crear Medidor QR gratis', href: next }}
          note="¿Necesitas inscripciones con lista de asistentes?"
          noteLink={{ label: 'Ir a Inscripciones →', href: '/inscripciones' }}
        />
      </ProductPage>
    </Layout>
  );
}
