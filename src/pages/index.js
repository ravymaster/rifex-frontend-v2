// src/pages/index.js
// PUBLIC HOME V1 — identidad pública: Eventos / Entradas digitales /
// Campañas de recaudación. Nunca promociona Rifas acá (Rifas sigue
// intacto dentro del área autenticada — ver Layout.jsx accountItems y
// /mis-iniciativas).
//
// AJUSTE VISUAL (photo hero): el visual del hero es ahora
// public/images/hero/rifex-hero-events.png — una fotografía real que ya
// incluye visualmente las tres métricas de ejemplo (Entradas vendidas,
// Ingresos totales, Entrada validada) y el fondo navy de concierto. Por
// eso este archivo NUNCA debe volver a agregar cards HTML duplicadas ni
// una ilustración SVG propia encima: la foto ES el visual completo, no
// solo un fondo decorativo.
import Head from 'next/head';
import Image from 'next/image';
import Layout from '@/components/Layout';
import styles from '@/styles/index.module.css';
import heroPhoto from '../../public/images/hero/rifex-hero-events.png';
import { SITE_URL } from '@/lib/publicMetadata';

// PUBLIC SURFACE FINAL CLEANUP — JSON-LD mínimo, solo en Home (entidad
// canónica, no se repite por página). Contiene únicamente hechos
// verificables desde este repositorio (nombre, URL, logo real en
// public/); nunca legalName no certificado, aggregateRating, review,
// address, teléfono ni sameAs sin verificar — ver sección 12 de la
// misión PUBLIC SURFACE FINAL CLEANUP.
const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Rifex',
  url: SITE_URL,
  logo: `${SITE_URL}/rifex-logo.png`,
};

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Rifex',
  url: SITE_URL,
};

const TRUST_ITEMS = [
  { icon: '🪪', label: 'Titularidad contrastada' },
  { icon: '💳', label: 'Pagos mediante proveedor conectado' },
  { icon: '🎫', label: 'Tickets digitales con QR' },
  { icon: '🚪', label: 'Control de acceso' },
  { icon: '📊', label: 'Soporte y reportes' },
];

// Iconos propios en SVG inline (sin librería nueva) — line-icons livianos,
// stroke="currentColor" para heredar el accent de cada card vía CSS.
const ICON_PROPS = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

function TicketIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" />
      <path d="M13 6v2M13 11v2M13 16v2" />
    </svg>
  );
}
function DeviceCheckIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 12l2.2 2.2L15.5 9.5" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M12 19.2s-7-4.6-7-9.7a4.3 4.3 0 0 1 7-3.3 4.3 4.3 0 0 1 7 3.3c0 5.1-7 9.7-7 9.7Z" />
    </svg>
  );
}
function BarsIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 21V11" />
      <path d="M10.5 21V6" />
      <path d="M17 21v-8" />
      <path d="M3 21h18" />
    </svg>
  );
}

const CAPABILITIES = [
  {
    key: 'entradas',
    icon: <TicketIcon />,
    title: 'Entradas digitales',
    text: 'Vende entradas y genera códigos QR.',
    detail: 'Venta + QR',
    accent: '#23B6C6',
    accentSoft: 'rgba(35, 182, 198, 0.16)',
    accentBorder: 'rgba(35, 182, 198, 0.4)',
  },
  {
    key: 'acceso',
    icon: <DeviceCheckIcon />,
    title: 'Control de acceso',
    text: 'Valida entradas desde el celular.',
    detail: 'Validación móvil',
    accent: '#7c6fe8',
    accentSoft: 'rgba(124, 111, 232, 0.16)',
    accentBorder: 'rgba(124, 111, 232, 0.4)',
  },
  {
    key: 'campanas',
    icon: <HeartIcon />,
    title: 'Campañas de recaudación',
    text: 'Recibe aportes mediante tu proveedor conectado.',
    detail: 'Aportes',
    accent: '#18A957',
    accentSoft: 'rgba(24, 169, 87, 0.16)',
    accentBorder: 'rgba(24, 169, 87, 0.4)',
  },
  {
    key: 'reportes',
    icon: <BarsIcon />,
    title: 'Reportes',
    text: 'Consulta ventas, entradas y actividad de tus iniciativas.',
    detail: 'Actividad',
    accent: '#4f8ef7',
    accentSoft: 'rgba(79, 142, 247, 0.16)',
    accentBorder: 'rgba(79, 142, 247, 0.4)',
  },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <Head>
        <script
          key="ld-organization"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        <script
          key="ld-website"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
        />
      </Head>
      {/* HERO */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}>
              <span>●</span> Eventos · Entradas digitales · Campañas de recaudación
            </span>
            <h1 className={styles.heroTitle}>
              Crea eventos.<br />
              Vende entradas.<br />
              <span className={styles.heroTitleAccent}>Impulsa causas.</span>
            </h1>
            <p className={styles.heroSub}>
              Organiza eventos, controla el acceso y recauda fondos con herramientas simples y seguras.
            </p>
            <div className={styles.heroCtas}>
              <a href="/crear-evento" className={styles.ctaPrimary}>Crear un evento</a>
              <a href="/crear-colecta" className={styles.ctaSecondary}>Crear una campaña</a>
            </div>
          </div>

          {/* Foto real (public/images/hero/rifex-hero-events.png). Ya
              incluye visualmente las métricas de ejemplo — nunca
              duplicarlas como cards HTML acá. En mobile queda en flujo
              normal, después de las CTAs; en desktop (min-width:1024px)
              pasa a position:absolute para fusionarse con el fondo navy
              del Hero (ver .heroPhotoWrap). */}
          <div className={styles.heroPhotoWrap} aria-hidden="true">
            <Image
              src={heroPhoto}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 68vw, 100vw"
              className={styles.heroPhotoImg}
            />
          </div>

          {/* TRUST STRIP */}
          <div className={styles.trust}>
            <div className={styles.trustGrid}>
              {TRUST_ITEMS.map((it) => (
                <div key={it.label} className={styles.trustItem}>
                  <span className={styles.trustIcon} aria-hidden="true">{it.icon}</span>
                  <p className={styles.trustLabel}>{it.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CAPACIDADES */}
      <section className={styles.capabilities}>
        <div className="container">
          <div className={styles.sectionHead}>
            <span className={styles.capEyebrow}>Herramientas para tu iniciativa</span>
            <h2 className={styles.sectionTitle}>Todo lo que necesitas para gestionar tu iniciativa</h2>
            <p className={styles.sectionSub}>Desde vender la primera entrada hasta revisar el último reporte.</p>
          </div>
          <div className={styles.capGrid}>
            {CAPABILITIES.map((c) => (
              <div
                key={c.key}
                className={styles.capCard}
                style={{ '--accent': c.accent, '--accentSoft': c.accentSoft, '--accentBorder': c.accentBorder }}
              >
                <div className={styles.capIconBox}>{c.icon}</div>
                <h3 className={styles.capTitle}>{c.title}</h3>
                <p className={styles.capText}>{c.text}</p>
                {c.detail && <span className={styles.capDetail}>{c.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

Home.getLayout = function getLayout(page) {
  return (
    <Layout
      title="Rifex — Eventos, entradas y recaudación en línea"
      description="Crea eventos, vende entradas digitales y administra campañas de recaudación desde una sola plataforma."
      canonicalPath="/"
    >
      {page}
    </Layout>
  );
};
