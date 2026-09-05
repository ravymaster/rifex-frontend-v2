// src/pages/eventos/index.jsx
// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — /eventos consolidado
// como la URL única y definitiva de Eventos: la landing comercial
// (antes en /soluciones/eventos, PRODUCT LANDINGS V1) vive acá.
// /soluciones/eventos pasa a ser un redirect permanente hacia acá (ver
// ese archivo). PSCG: PUBLIC_INDEXABLE, sin cambio de categoría.
// Contenido auditado contra el código real (crear-evento.jsx,
// eventos/[id].jsx, panel/eventos/[id].jsx, panel/eventos/[id]/scanner.jsx,
// eventStaffAuth.js, eventAnalyticsWorkbook.js, platformFee.js) — ninguna
// capacidad inventada.
//
// El catálogo real de eventos publicados (EVENT-1 Fase 11, GET
// /api/events) se retira de esta página por decisión explícita de
// Rodrigo (2026-09-05): todavía no hay eventos publicados en PROD, y
// mostrar un empty-state ahora no aporta valor. Queda documentado para
// integrarse más adelante cuando exista contenido real que listar — no
// se elimina el endpoint ni ninguna lógica de datos, solo esta página
// deja de consumirlo por ahora.
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

const ACCENT = '#23B6C6'; // --turquesa

const FEATURES = [
  { icon: '🎟️', title: 'Tipos de entrada', desc: 'Define varios tipos de entrada, cada uno con su propio precio y cupo — general, VIP, preventa, lo que tu evento necesite.' },
  { icon: '📦', title: 'Aforo del evento', desc: 'Además del cupo de cada tipo de entrada, puedes fijar un aforo máximo total: Rifex nunca deja vender más entradas que ese límite.' },
  { icon: '📱', title: 'Entradas con QR', desc: 'Cada entrada vendida se emite con su propio código QR, entregado por email y en una página de acceso para el comprador.' },
  { icon: '📷', title: 'Scanner de acceso', desc: 'El día del evento, valida cada entrada escaneando su QR con la cámara del celular — sin equipos especiales.' },
  { icon: '👥', title: 'Personal de acceso', desc: 'Agrega a otras personas por su correo para que también puedan escanear entradas en la puerta, sin compartir tu cuenta.' },
  { icon: '📊', title: 'Estadísticas en vivo', desc: 'Vendidas, disponibles, ingresadas y pendientes de ingreso, actualizado en tiempo real desde el panel del evento.' },
  { icon: '📥', title: 'Reporte en Excel', desc: 'Descarga un Excel con el resumen del evento, tus órdenes de venta, el detalle de entradas y el registro de check-ins.' },
  { icon: '💳', title: 'Pagos a tu cuenta', desc: 'Los compradores pagan con Mercado Pago y el dinero se acredita en tu propia cuenta conectada.' },
];

const STEPS = [
  { title: 'Crea tu cuenta', desc: 'Regístrate en Rifex y conecta tu cuenta de Mercado Pago para poder recibir pagos.' },
  { title: 'Crea tu evento', desc: 'Agrega nombre, fecha, lugar y define uno o más tipos de entrada con su precio y cupo.' },
  { title: 'Publica y comparte', desc: 'Tu evento queda disponible en tu página pública — compártela donde quieras.' },
  { title: 'Vende entradas', desc: 'Cada compra emite entradas individuales con su propio código QR, enviadas por email.' },
  { title: 'Controla el acceso', desc: 'El día del evento, escanea cada entrada con el celular — tú o tu personal de acceso.' },
];

const USE_CASES = [
  { icon: '🎉', title: 'Fiestas' },
  { icon: '🤝', title: 'Encuentros' },
  { icon: '🏃', title: 'Actividades deportivas' },
  { icon: '🎭', title: 'Espectáculos' },
  { icon: '📅', title: 'Jornadas' },
  { icon: '🏘️', title: 'Eventos comunitarios' },
];

const OPERATIONAL = [
  { icon: '📱', title: 'QR individual por entrada', desc: 'Un código único por cada entrada, imposible de reutilizar una vez validado.' },
  { icon: '📷', title: 'Check-in con contador en vivo', desc: 'El scanner muestra cuántas personas ya ingresaron sobre el total, en tiempo real.' },
  { icon: '👥', title: 'Staff de acceso', desc: 'Suma personas de confianza para escanear entradas sin darles acceso al resto de tu cuenta.' },
  { icon: '📥', title: 'Excel de 5 hojas', desc: 'Resumen, órdenes de venta, entradas, check-ins y personal de acceso, todo listo para descargar.' },
];

const SECURITY = [
  'Los pagos se procesan mediante tu propia cuenta de Mercado Pago conectada — Rifex nunca retiene tus fondos.',
  'El aforo se valida en el servidor: la suma de entradas de todos los tipos nunca puede superar el límite que definiste.',
  'Cada código QR corresponde a una sola entrada real — el sistema detecta e informa un segundo intento de uso.',
  'La comisión de servicio de Rifex es del 7%, aplicada solo sobre ventas efectivamente cobradas.',
];

const FAQ = [
  { q: '¿Necesito Mercado Pago para vender entradas?', a: 'Sí. Los pagos de tus compradores se acreditan directamente en tu propia cuenta de Mercado Pago conectada a Rifex.' },
  { q: '¿Puedo tener más de un tipo de entrada?', a: 'Sí, puedes crear varios tipos de entrada para un mismo evento, cada uno con su propio nombre, precio y cupo.' },
  { q: '¿Otras personas pueden ayudarme a controlar el acceso?', a: 'Sí. Puedes agregar personal de acceso por su correo para que también puedan escanear entradas el día del evento.' },
  { q: '¿Qué pasa si defino un aforo máximo para el evento?', a: 'Rifex no permitirá que la suma de entradas vendidas de todos los tipos supere ese aforo, sin importar cuánto cupo individual les hayas dado a cada tipo.' },
  { q: '¿Puedo saber cuánta gente asistió realmente?', a: 'Sí, el panel del evento muestra en vivo cuántas entradas fueron ingresadas (check-in) frente al total vendido, y puedes descargarlo en Excel.' },
];

export default function EventosPage() {
  const url = canonicalUrl('/eventos');
  const serviceJsonLd = buildServiceJsonLd({
    name: 'Rifex Eventos',
    description: 'Crea eventos, vende entradas digitales con QR y controla el acceso con scanner desde el celular.',
    url,
  });
  const faqJsonLd = buildFaqJsonLd(FAQ);

  return (
    <Layout
      title="Eventos con entradas digitales y QR — Rifex"
      description="Crea tu evento, vende entradas con distintos precios y cupos, entrega códigos QR individuales y controla el acceso con scanner desde el celular."
      canonicalPath="/eventos"
    >
      <Head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      </Head>
      <ProductPage accent={ACCENT}>
        <ProductHero
          eyebrow="RIFEX · EVENTOS"
          title="Vende entradas y controla el acceso a tu evento"
          subtitle="Crea tu evento, define tipos de entrada, emite códigos QR individuales y valida el ingreso el mismo día desde el celular."
          primaryCta={{ label: 'Crear un evento', href: '/crear-evento' }}
          chips={[
            { value: '100%', label: 'Entradas con QR individual' },
            { value: '7%', label: 'Comisión de servicio' },
            { value: '+1', label: 'Personal de acceso adicional' },
          ]}
        />
        <ProductFeatureGrid
          title="Todo lo que puedes hacer"
          subtitle="Desde la creación del evento hasta el control de acceso el día del evento."
          items={FEATURES}
        />
        <ProductSteps title="Así funciona" steps={STEPS} />
        <ProductUseCases
          title="Pensado para..."
          subtitle="Cualquier actividad que necesite vender entradas y controlar quién ingresa."
          items={USE_CASES}
        />
        <ProductOperational
          title="Lo que hace especial el control de acceso de Rifex"
          items={OPERATIONAL}
        />
        <ProductSecurity title="Confianza y control" items={SECURITY} />
        <ProductFaq title="Preguntas frecuentes" items={FAQ} />
        <ProductFinalCta
          title="Tu próximo evento, listo para vender entradas"
          subtitle="Crea tu evento en minutos y empieza a vender entradas con QR."
          cta={{ label: 'Crear un evento', href: '/crear-evento' }}
        />
      </ProductPage>
    </Layout>
  );
}
