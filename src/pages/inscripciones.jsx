// src/pages/inscripciones.jsx
// INSCRIPCIONES V1 — landing comercial. PSCG: PUBLIC_INDEXABLE (misma
// clasificación que /campanas, /soluciones/eventos: producto público,
// indexable, nunca un directorio de actividades de usuarios — eso vive
// en la página individual /inscripcion/[id], PUBLIC_NOINDEX).
//
// RIFEX PRODUCT LANDINGS V1 — evolucionada a la misma anatomía de
// Eventos/Campañas (hero, features, pasos, casos de uso, bloque
// operacional, confianza, FAQ, CTA final), MISMA ruta y clasificación
// que ya tenía. Nunca mostrar en V1: Plus, Gold, "200", "2.000", precios
// futuros, ni "planes próximamente" — el modelo de facturación futura
// vive solo en docs/inscripciones/INSCRIPCIONES_FUTURE_BILLING.md, nunca
// en esta página.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
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

const ACCENT = '#1E3A8A'; // --ultramar

const FEATURES = [
  { icon: '📝', title: 'Crea tu actividad', desc: 'Nombre, fecha, lugar o modalidad, y hasta 50 cupos gratis — sin pago involucrado.' },
  { icon: '🔗', title: 'Página pública', desc: 'Cada actividad tiene su propio link para compartir donde quieras.' },
  { icon: '✅', title: 'Inscripción simple', desc: 'Nombre, email y teléfono opcional — Rifex evita automáticamente inscripciones duplicadas con el mismo correo.' },
  { icon: '📱', title: 'QR individual', desc: 'Cada inscrito recibe su propio código QR de confirmación, disponible al instante.' },
  { icon: '📷', title: 'Scanner de acceso', desc: 'Controla el ingreso escaneando cada QR con la cámara del celular, o ingresando el código manualmente.' },
  { icon: '📊', title: 'Panel en vivo', desc: 'Inscritos, asistieron y pendientes, actualizado en tiempo real.' },
  { icon: '📥', title: 'Descarga tu lista en Excel', desc: 'Nombre, email, teléfono, fecha de inscripción, estado y hora de check-in, listo para descargar.' },
  { icon: '🆓', title: '100% gratis', desc: '1 actividad gratuita por mes calendario, sin Mercado Pago ni comisión.' },
];

const STEPS = [
  { title: 'Crea tu cuenta', desc: 'Regístrate en Rifex — no necesitas conectar Mercado Pago para usar Inscripciones.' },
  { title: 'Crea tu actividad', desc: 'Agrega nombre, fecha, lugar o modalidad y publícala.' },
  { title: 'Comparte el link', desc: 'Envía el link público de tu actividad donde quieras.' },
  { title: 'Recibe inscripciones', desc: 'Cada persona se inscribe y recibe su confirmación con QR individual.' },
  { title: 'Controla el acceso', desc: 'Escanea cada QR el día de tu actividad y descarga tu lista en Excel cuando quieras.' },
];

const USE_CASES = [
  { icon: '🎓', title: 'Talleres' },
  { icon: '📚', title: 'Cursos' },
  { icon: '🧑‍🏫', title: 'Capacitaciones' },
  { icon: '🏘️', title: 'Clubes' },
  { icon: '🏃', title: 'Actividades deportivas' },
  { icon: '🗓️', title: 'Reuniones y jornadas' },
];

const OPERATIONAL = [
  { icon: '📱', title: 'QR individual', desc: 'Un código de confirmación único por cada persona inscrita.' },
  { icon: '📷', title: 'Check-in con scanner', desc: 'Cámara del celular o código manual — ambos validan la misma inscripción real.' },
  { icon: '📥', title: 'Excel de asistentes', desc: 'Nombre, email, teléfono, fecha de inscripción, estado y hora de check-in.' },
];

const SECURITY = [
  'Inscripciones nunca cobra a quien se inscribe ni requiere Mercado Pago del organizador.',
  'Un mismo correo no puede inscribirse dos veces en la misma actividad.',
  'El cupo de 50 inscritos se controla en el servidor — no depende de lo que muestre la pantalla.',
  '1 actividad gratuita por mes calendario por cuenta, protegida contra intentos de crear varias en el mismo mes.',
];

const FAQ = [
  { q: '¿Cuesta algo usar Inscripciones?', a: 'No. Inscripciones es gratuita: hasta 50 inscritos por actividad, sin Mercado Pago ni comisión.' },
  { q: '¿Cuántas actividades gratuitas puedo crear?', a: 'Una actividad gratuita por mes calendario por cuenta.' },
  { q: '¿Necesito conectar Mercado Pago?', a: 'No. Inscripciones funciona sin conectar ningún método de pago, porque nunca cobra a los participantes.' },
  { q: '¿Qué contiene el Excel que descargo?', a: 'Nombre, email, teléfono, fecha de inscripción, estado y hora de check-in de cada persona inscrita.' },
  { q: '¿Necesito cobrar por participar?', a: 'Inscripciones es para actividades gratuitas. Si necesitas vender entradas, revisa Rifex Eventos.' },
];

export default function InscripcionesLanding() {
  const [next, setNext] = useState('/crear-inscripcion');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) setNext(`/login?next=${encodeURIComponent('/crear-inscripcion')}`);
    })();
  }, []);

  const url = canonicalUrl('/inscripciones');
  const serviceJsonLd = buildServiceJsonLd({
    name: 'Rifex Inscripciones',
    description: 'Crea una actividad gratuita, recibe inscripciones con QR individual, controla el acceso con scanner y descarga tu lista en Excel.',
    url,
  });
  const faqJsonLd = buildFaqJsonLd(FAQ);

  return (
    <Layout
      title="Inscripciones gratis con QR — Rifex"
      description="Crea una actividad gratuita, recibe inscripciones, controla el acceso con QR y administra tus asistentes desde Rifex."
      canonicalPath="/inscripciones"
    >
      <Head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      </Head>
      <ProductPage accent={ACCENT}>
        <ProductHero
          eyebrow="RIFEX · INSCRIPCIONES"
          title="Inscripciones gratis, con QR y control de acceso"
          subtitle="Organiza talleres, cursos y actividades. Recibe hasta 50 inscritos, confirma con QR individual y descarga tu lista de asistentes en Excel."
          primaryCta={{ label: 'Crear una inscripción', href: next }}
          chips={[
            { value: '50', label: 'Inscritos gratis por actividad' },
            { value: '$0', label: 'Sin Mercado Pago' },
            { value: '1/mes', label: 'Actividad gratuita por cuenta' },
          ]}
        />
        <ProductFeatureGrid
          title="Todo lo que puedes hacer"
          subtitle="Desde crear tu actividad hasta controlar el acceso el mismo día."
          items={FEATURES}
        />
        <ProductSteps title="Así funciona" steps={STEPS} />
        <ProductUseCases
          title="Pensado para..."
          subtitle="Cualquier actividad gratuita que necesite inscripción previa y control de acceso."
          items={USE_CASES}
        />
        <ProductOperational title="Descarga tu lista en Excel" items={OPERATIONAL} />
        <ProductSecurity title="Confianza y control" items={SECURITY} />
        <ProductFaq title="Preguntas frecuentes" items={FAQ} />
        <ProductFinalCta
          title="Tu próxima actividad, lista para recibir inscritos"
          subtitle="Crea tu actividad gratuita en minutos."
          cta={{ label: 'Crear una inscripción', href: next }}
          note="¿Necesitas cobrar por participar?"
          noteLink={{ label: 'Ir a Eventos →', href: '/soluciones/eventos' }}
        />
      </ProductPage>
    </Layout>
  );
}
