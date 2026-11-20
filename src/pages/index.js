// src/pages/index.js
// PUBLIC HOME V1 — identidad pública: Eventos / Entradas digitales /
// Campañas de recaudación. Nunca promociona Rifas acá (Rifas sigue
// intacto dentro del área autenticada — ver Layout.jsx footer
// autenticado y /mis-iniciativas).
// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — Inscripciones se
// suma a la identidad pública de Home (eyebrow del hero + card propio en
// CAPABILITIES con link real a /inscripciones): hasta esta misión no
// tenía peso visible acá pese a ser un producto público real desde
// INSCRIPCIONES V1.
//
// RIFEX HOME HERO 2026 (2026-09-09) — el Hero es ahora un asset
// aprobado por el usuario (composición desktop/mobile deliberadamente
// distinta, no un mismo archivo escalado), que ya incluye visualmente
// el headline completo ("Recauda. Vende entradas. Gestiona
// inscripciones. Mide respuestas."), el eyebrow de capacidades, las
// métricas de ejemplo y la fila de capacidades — por eso este archivo
// NUNCA debe volver a agregar ese texto como HTML visible, ni cards
// duplicadas, ni CTAs (decisión de producto final: el Hero ya no
// lleva botones — los accesos viven en Navbar/cards/landings/Mis
// iniciativas). Selección responsive real vía <picture>/<source> —
// dos assets distintos (public/images/hero/hero-rifex-{desktop,
// mobile}.{webp,png}), nunca el mismo archivo escalado — el navegador
// descarga solo el que corresponde, sin JS. Breakpoint: 1024px (ver
// comentario junto al <picture> más abajo). Un <h1> visualmente oculto
// (sr-only) preserva la estructura semántica/SEO sin duplicar el
// mensaje en pantalla.
import Head from 'next/head';
import Link from 'next/link';
import Layout from '@/components/Layout';
import styles from '@/styles/index.module.css';
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
function ClipboardCheckIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 13l2 2 4-4.5" />
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
function QrIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" />
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
  // RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — Inscripciones
  // todavía no figuraba en Home con peso propio. Único card de esta
  // grilla con `href` (las otras son informativas, sin link) — lleva a
  // la landing real /inscripciones (Product Landings V1).
  {
    key: 'inscripciones',
    icon: <ClipboardCheckIcon />,
    title: 'Inscripciones y cupos',
    text: 'Gestiona talleres, cursos y actividades gratuitas con QR y lista de asistentes.',
    detail: 'Gratis · QR',
    href: '/inscripciones',
    accent: '#1E3A8A',
    accentSoft: 'rgba(30, 58, 138, 0.16)',
    accentBorder: 'rgba(30, 58, 138, 0.4)',
  },
  // MEDIDOR QR V1 — mismo criterio que la card de Inscripciones: link
  // real a /medidor-qr. Eventos/Campañas son transaccionales; Inscripciones
  // y Medidor QR son herramientas gratuitas de adquisición (sección 17
  // del mandato) — se representan con el mismo lenguaje visual de card,
  // sin convertir el hero en una fila de botones.
  {
    key: 'medidor-qr',
    icon: <QrIcon />,
    title: 'Medidor QR',
    text: 'Crea una pregunta, genera tu QR gratis y mide el interés real de tu público donde quieras.',
    detail: 'Gratis · 10/mes',
    href: '/medidor-qr',
    accent: '#18A957',
    accentSoft: 'rgba(24, 169, 87, 0.16)',
    accentBorder: 'rgba(24, 169, 87, 0.4)',
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
      {/* HERO — RIFEX HOME HERO 2026: pura imagen, sin CTAs, sin texto
          HTML duplicado (ver comentario del import más arriba). */}
      <section className={styles.hero}>
        {/* h1 real para estructura semántica/SEO — visualmente oculto
            (sr-only), nunca duplicado en pantalla; el mensaje visible
            vive únicamente en el asset. */}
        <h1 className={styles.srOnly}>
          Recauda. Vende entradas. Gestiona inscripciones. Mide respuestas. Todo desde Rifex.pro.
        </h1>

        {/* Breakout deliberado del ancho de `.container` (mismo patrón
            de escape ya certificado en la misión VISUAL-LOCK para otra
            ficha pública del catálogo): el Hero debe aprovechar casi
            todo el ancho de pantalla, nunca quedar limitado a
            max-width:1200px como el resto del contenido de Home. */}
        <div className={styles.heroPictureWrap}>
          {/*
            Breakpoint elegido: 1024px (no 768px). Motivo verificado
            contra la composición real de ambos assets, no por nombre
            de archivo: el asset mobile es un cartel vertical (941×1672)
            con grilla 2×2 de capacidades — a 1024px de ancho (tablet
            landscape) esa proporción produciría un Hero de ~1820px de
            alto, absurdamente largo. El asset desktop es horizontal
            (1672×941) — a 768/820px (tablet portrait) el texto ya
            compuesto para 1672px de ancho quedaría demasiado pequeño
            para leerse. 1024px es el punto donde el asset desktop
            (paisaje) empieza a lucir mejor que forzar el vertical en
            una pantalla ancha, y coincide con el breakpoint "lg"
            convencional del resto del proyecto.
          */}
          <picture>
            <source media="(max-width: 1023px)" type="image/webp" srcSet="/images/hero/hero-rifex-mobile.webp" />
            <source media="(max-width: 1023px)" type="image/png" srcSet="/images/hero/hero-rifex-mobile.png" />
            <source type="image/webp" srcSet="/images/hero/hero-rifex-desktop.webp" />
            <img
              src="/images/hero/hero-rifex-desktop.png"
              alt="Rifex: recauda fondos, vende entradas para eventos, gestiona inscripciones y mide respuestas con Medidor QR — todo desde Rifex.pro"
              width={941}
              height={1672}
              fetchpriority="high"
              className={styles.heroImg}
            />
          </picture>
        </div>

        <div className="container">
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
            {CAPABILITIES.map((c) => {
              const CardTag = c.href ? Link : 'div';
              const cardProps = c.href
                ? { href: c.href, className: styles.capCard, style: { '--accent': c.accent, '--accentSoft': c.accentSoft, '--accentBorder': c.accentBorder } }
                : { className: styles.capCard, style: { '--accent': c.accent, '--accentSoft': c.accentSoft, '--accentBorder': c.accentBorder } };
              return (
                <CardTag key={c.key} {...cardProps}>
                  <div className={styles.capIconBox}>{c.icon}</div>
                  <h3 className={styles.capTitle}>{c.title}</h3>
                  <p className={styles.capText}>{c.text}</p>
                  {c.detail && <span className={styles.capDetail}>{c.detail}</span>}
                </CardTag>
              );
            })}
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
