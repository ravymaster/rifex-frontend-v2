// src/pages/warp-conversacional.jsx
// WARP CONVERSACIONAL — landing comercial (Sprint 1). PSCG: PUBLIC_INDEXABLE.
// Misma anatomía y sistema visual que las demás landings (ProductSections).
// - Demostración real: el asistente visible en Rifex usa Warp. Las preguntas
//   sugeridas abren el asistente y dejan la pregunta escrita; nunca se envían
//   solas (src/lib/warp/assistantPrefill.js).
// - Solicitud de piloto: formulario público, envío con sesión
//   (src/components/warp/WarpPilotRequestForm.jsx).
// - No expone arquitectura sensible, umbrales, claves ni variables.
// - Contenido en HTML semántico y estático para que Discovery de Rifex pueda
//   leerlo cuando se reescanee (ver docs/warp/WARP_CONVERSACIONAL_SPRINT_1.md).
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import Layout from '@/components/Layout';
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
import WarpPilotRequestForm from '@/components/warp/WarpPilotRequestForm';
import { requestAssistantPrefill, SUGGESTED_QUESTIONS } from '@/lib/warp/assistantPrefill';
import { buildServiceJsonLd, buildFaqJsonLd } from '@/lib/productJsonLd';
import { canonicalUrl } from '@/lib/publicMetadata';
import landing from '@/styles/productLanding.module.css';
import styles from '@/styles/warpConversacional.module.css';

const ACCENT = '#4f8ef7';

export const PAGE_TITLE = 'Asistente de IA para tu sitio web | Rifex';
export const PAGE_DESCRIPTION = 'Asistente de inteligencia artificial para sitios web que conoce la información autorizada de tu negocio, orienta a tus visitantes y mantiene controlados el consumo y los costos. Piloto asistido.';

export const WHAT_IT_DOES = [
  { icon: '📚', title: 'Responde información autorizada', desc: 'Contesta solo con la información que tu negocio aprobó publicar, no con suposiciones.' },
  { icon: '🧭', title: 'Orienta a tus visitantes', desc: 'Guía hacia las páginas, productos o servicios correctos de tu sitio.' },
  { icon: '🚦', title: 'Trabaja con límites', desc: 'Cada conversación tiene límites de uso para evitar abusos.' },
  { icon: '💰', title: 'Controla el presupuesto', desc: 'El consumo tiene un presupuesto definido; el exceso se bloquea salvo que lo autorices.' },
  { icon: '🔒', title: 'Cada cliente, aislado', desc: 'La información y el uso de cada sitio se mantienen separados de los demás.' },
];

export const FEATURES = [
  { icon: '📝', title: 'Contenido', desc: 'Responde con el contenido autorizado de tu sitio: servicios, políticas y preguntas frecuentes.' },
  { icon: '🗺️', title: 'Navegación', desc: 'Entrega enlaces directos a las páginas de tu propio sitio.' },
  { icon: '🛍️', title: 'Catálogos', desc: 'Presenta productos, servicios o actividades publicados.' },
  { icon: '📅', title: 'Disponibilidad', desc: 'Informa disponibilidad cuando tu sitio ofrece esa capacidad de forma segura.' },
  { icon: '⚖️', title: 'Comparación', desc: 'Ayuda a comparar opciones con la información publicada.' },
  { icon: '📨', title: 'Derivación a formularios', desc: 'Lleva a tus formularios de contacto, cotización o inscripción.' },
  { icon: '🛡️', title: 'Límites y seguridad', desc: 'Límites de uso, presupuesto controlado y apagado inmediato si lo necesitas.' },
];

export const STEPS = [
  { title: 'Revisamos tu sitio', desc: 'Verificamos la compatibilidad técnica y el contenido disponible.' },
  { title: 'Definimos la información autorizada', desc: 'Acordamos qué puede responder el asistente y qué no.' },
  { title: 'Instalamos', desc: 'Agregamos el asistente a tu sitio con instalación asistida.' },
  { title: 'Probamos', desc: 'Revisamos respuestas, enlaces y límites antes de abrirlo al público.' },
  { title: 'Activamos y monitoreamos', desc: 'Lo encendemos en tu dominio verificado y seguimos su uso y su consumo.' },
];

export const SECURITY = [
  'Presupuesto controlado: el asistente trabaja dentro de un presupuesto acordado.',
  'Límites de consumo por visitante y por sitio para evitar abusos.',
  'Token Guard: protección del consumo de la inteligencia artificial.',
  'Aislamiento: la información y el uso de cada cliente se mantienen separados.',
  'Apagado: el asistente se puede desactivar en cualquier momento.',
  'Registros minimizados: guardamos solo lo necesario para operar y proteger el servicio.',
];

export const COMPATIBILITY = [
  { icon: '⚛️', title: 'Next.js / React', desc: 'Integración directa.' },
  { icon: '🧩', title: 'WordPress', desc: 'Con instalación asistida.' },
  { icon: '🐘', title: 'PHP y sitios tradicionales', desc: 'Integración mediante un fragmento del sitio.' },
  { icon: '🧪', title: 'Plataformas personalizadas', desc: 'Bajo evaluación técnica.' },
];

export const PILOT_PLAN = {
  installation: '$79.990 CLP',
  monthly: '$29.990 CLP',
  note: 'Precio de lanzamiento sujeto a revisión de compatibilidad.',
  includes: [
    'Instalación asistida en tu sitio.',
    'Ajustes iniciales de la información autorizada.',
    'Presupuesto de consumo limitado.',
    'El exceso de consumo se bloquea salvo que lo autorices.',
    'Sin permanencia durante el piloto.',
  ],
};

export const LIMITS = [
  'Comienza en modo de solo lectura: informa, orienta y deriva.',
  'No compra, no reserva ni modifica datos sin una integración adicional acordada.',
  'La activación queda sujeta a la verificación del dominio.',
];

export const FAQ = [
  { q: '¿Qué es el Asistente de IA?', a: 'Es un asistente de inteligencia artificial para sitios web que responde con la información autorizada de tu negocio y orienta a tus visitantes, con consumo y costos controlados.' },
  { q: '¿El asistente de Rifex es una demostración real?', a: 'Sí. El asistente que ves en Rifex funciona con Warp. Puedes probarlo con las preguntas sugeridas de esta página.' },
  { q: '¿Cuánto cuesta el piloto?', a: 'Instalación de $79.990 CLP y mensualidad de $29.990 CLP. Es un precio de lanzamiento sujeto a revisión de compatibilidad.' },
  { q: '¿Me cobran al enviar la solicitud?', a: 'No. Enviar la solicitud no genera cobros ni activa nada. Primero revisamos la compatibilidad de tu sitio y te enviamos la propuesta.' },
  { q: '¿Hay permanencia?', a: 'No. Durante el piloto no hay permanencia.' },
  { q: '¿Qué pasa si se supera el presupuesto?', a: 'El exceso de consumo se bloquea, salvo que autorices ampliarlo.' },
  { q: '¿Puede comprar, reservar o cambiar datos de mi sitio?', a: 'No. Comienza en solo lectura. Cualquier acción adicional requiere una integración acordada.' },
  { q: '¿Funciona con WordPress?', a: 'Sí, con instalación asistida. También con Next.js/React, PHP y sitios tradicionales; las plataformas personalizadas se evalúan caso a caso.' },
  { q: '¿Necesito una cuenta de Rifex?', a: 'Sí, para enviar la solicitud de piloto. Así puedes seguir su estado en «Mis solicitudes de Warp».' },
];

function DemoSection() {
  const [notice, setNotice] = useState('');
  const onAsk = (question) => {
    const ok = requestAssistantPrefill(question);
    setNotice(ok
      ? `Dejamos la pregunta «${question}» escrita en el asistente. Revísala y envíala cuando quieras.`
      : 'El asistente no está disponible en este momento. Inténtalo más tarde.');
  };
  return (
    <section id="demostracion" className={landing.section} aria-labelledby="demo-title">
      <div className={landing.sectionHead}>
        <h2 id="demo-title" className={landing.sectionTitle}>Pruébalo aquí mismo</h2>
        <p className={landing.sectionSubtitle}>
          El asistente que ves en Rifex funciona con Warp. Elige una pregunta: la dejaremos escrita en el asistente y tú decides si la envías.
        </p>
      </div>
      <div className={styles.demoGrid}>
        {SUGGESTED_QUESTIONS.map((q) => (
          <button key={q} type="button" className={styles.demoButton} onClick={() => onAsk(q)}>
            {q}
          </button>
        ))}
      </div>
      <p className={styles.demoNotice} role="status" aria-live="polite">{notice}</p>
    </section>
  );
}

function PilotPlanSection() {
  return (
    <section id="plan-piloto" className={landing.section} aria-labelledby="plan-title">
      <div className={landing.sectionHead}>
        <h2 id="plan-title" className={landing.sectionTitle}>Plan piloto</h2>
        <p className={landing.sectionSubtitle}>{PILOT_PLAN.note}</p>
      </div>
      <div className={styles.planCard}>
        <div className={styles.planPrices}>
          <div>
            <p className={styles.planLabel}>Instalación</p>
            <p className={styles.planPrice}>{PILOT_PLAN.installation}</p>
          </div>
          <div>
            <p className={styles.planLabel}>Mensualidad</p>
            <p className={styles.planPrice}>{PILOT_PLAN.monthly}</p>
          </div>
        </div>
        <ul className={styles.planList}>
          {PILOT_PLAN.includes.map((it) => <li key={it}>{it}</li>)}
        </ul>
        <p className={styles.planBadge}>{PILOT_PLAN.note}</p>
        <a href="#solicitar" className={landing.btnPrimary}>Solicitar piloto</a>
      </div>
    </section>
  );
}

export default function WarpConversacionalLanding() {
  const url = canonicalUrl('/warp-conversacional');
  const serviceJsonLd = buildServiceJsonLd({ name: 'Asistente de IA para tu sitio web', description: PAGE_DESCRIPTION, url });
  const faqJsonLd = buildFaqJsonLd(FAQ);

  return (
    <Layout title={PAGE_TITLE} description={PAGE_DESCRIPTION} canonicalPath="/warp-conversacional">
      <Head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      </Head>
      <ProductPage accent={ACCENT}>
        <ProductHero
          eyebrow="RIFEX · ASISTENTE DE IA · PILOTO ASISTIDO"
          title="Asistente de IA para tu sitio web"
          subtitle="Convierte tu sitio web en un asistente que realmente conoce tu negocio: responde con la información autorizada, orienta a tus visitantes y mantiene controlados el consumo y los costos."
          primaryCta={{ label: 'Ver demostración', href: '#demostracion' }}
          secondaryCta={{ label: 'Solicitar piloto', href: '#solicitar' }}
          chips={[
            { value: 'Piloto', label: 'Asistido' },
            { value: 'Lectura', label: 'Modo inicial' },
            { value: '0', label: 'Permanencia en el piloto' },
          ]}
        />
        <ProductFeatureGrid title="Qué hace" subtitle="Un asistente para tu sitio que responde con lo que tu negocio autoriza." items={WHAT_IT_DOES} />
        <DemoSection />
        <ProductFeatureGrid title="Funciones" subtitle="Lo que puede hacer en tu sitio." items={FEATURES} />
        <ProductSteps title="Cómo funciona" steps={STEPS} />
        <ProductSecurity title="Seguridad y control" items={SECURITY} />
        <ProductUseCases title="Compatibilidad" subtitle="Funciona con la mayoría de los sitios web." items={COMPATIBILITY} />
        <PilotPlanSection />
        <ProductSecurity title="Límites del piloto" items={LIMITS} />
        <ProductFaq title="Preguntas frecuentes" items={FAQ} />

        <section id="solicitar" className={landing.section} aria-labelledby="solicitar-title">
          <div className={landing.sectionHead}>
            <h2 id="solicitar-title" className={landing.sectionTitle}>Solicitar piloto</h2>
            <p className={landing.sectionSubtitle}>
              Cuéntanos sobre tu sitio. Revisaremos la compatibilidad y te contactaremos. Enviar la solicitud no genera cobros.
            </p>
          </div>
          <WarpPilotRequestForm />
        </section>

        <ProductFinalCta
          title="¿Quieres un asistente que conozca tu negocio?"
          subtitle="Solicita el piloto asistido. Revisamos tu sitio antes de cualquier cobro."
          cta={{ label: 'Solicitar piloto', href: '#solicitar' }}
          note="¿Tienes dudas?"
          noteLink={{ label: 'Escríbenos →', href: '/contacto' }}
        />
        <p className={styles.related}>
          También en Rifex: <Link href="/eventos">Eventos</Link> · <Link href="/campanas">Campañas</Link> · <Link href="/inscripciones">Inscripciones</Link> · <Link href="/medidor-qr">Medidor QR</Link> · <Link href="/terminos">Términos</Link>
        </p>
      </ProductPage>
    </Layout>
  );
}
