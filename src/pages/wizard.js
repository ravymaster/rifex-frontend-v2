// src/pages/wizard.js
// UX/CRO-1: guía pública "Cómo funciona" — reemplaza temporalmente el
// enlace de /rifas en el nav. No introduce conceptos técnicos, solo el
// paso a paso en lenguaje simple.
// PUBLIC SURFACE FINAL CLEANUP — el navItem "Campañas" del navbar apuntaba
// directo a /crear-colecta (auth boundary): un visitante anónimo que
// exploraba el sitio recibía un login wall sin ninguna explicación, ya
// que no existe (ni existió) un catálogo público de campañas equivalente
// al de /eventos. Esta página ya contenía el explicador completo de
// campañas (paso a paso + CTA real) — el navItem ahora apunta acá con
// ?modo=colecta para preseleccionar esa vista, en vez de crear una
// landing nueva que duplicaría este contenido ya certificado.
// STAGE 2 FINAL — metadata migrada a las props de Layout (mismo patrón
// que el resto de las páginas certificadas; evita el bug real de
// colisión de key de Next 14.2.32 entre el <Head> propio de esta página
// y el de Layout).
// ÚLTIMO BLOQUEO PRE-PROD — la superficie pública ahora representa
// exclusivamente Eventos + Campañas (Rifas sigue existiendo como
// producto autenticado vía Mis iniciativas/crear-rifa.jsx; esta página
// nunca formó parte de esa arquitectura y no la modifica).
// RIFEX PRODUCT LANDINGS V1 — se agrega un tercer modo, Inscripciones,
// ya que dejó de ser "Próximamente" desde INSCRIPCIONES V1. Rifas
// deliberadamente NO se agrega — sigue siendo PRIVATE_AUTHENTICATED,
// nunca parte de la superficie pública de "Cómo funciona".
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import styles from '@/styles/wizard.module.css';

const EVENTO_STEPS = [
  'Crea tu cuenta.',
  'Habilita tu cuenta cuando corresponda.',
  'Crea tu evento.',
  'Completa la información del evento.',
  'Define uno o más tipos de entrada y sus cupos.',
  'Publica y comparte el evento.',
  'Los asistentes compran sus entradas.',
  'Cada entrada se emite con su código QR.',
  'El staff puede validar las entradas mediante el scanner/check-in de Rifex.',
];

const COLECTA_STEPS = [
  'Crea tu cuenta.',
  'Habilita tu cuenta cuando corresponda.',
  'Crea tu campaña.',
  'Completa título, descripción e información necesaria.',
  'Agrega imágenes cuando corresponda.',
  'Publica y comparte tu campaña.',
  'Las personas pueden realizar aportes.',
  'Los pagos se procesan mediante el proveedor conectado y se acreditan en la cuenta del organizador.',
];

const INSCRIPCION_STEPS = [
  'Crea tu cuenta.',
  'Crea tu actividad gratuita — no necesitas conectar Mercado Pago.',
  'Define fecha, lugar o modalidad, y cupos (hasta 50 en el plan gratuito).',
  'Publica y comparte el link público de tu actividad.',
  'Las personas se inscriben y reciben su código QR de confirmación.',
  'El día de tu actividad, controla el acceso escaneando cada QR.',
  'Descarga tu lista de asistentes en Excel cuando quieras.',
];

export default function Wizard() {
  const router = useRouter();
  const [mode, setMode] = useState(null); // null | 'evento' | 'colecta' | 'inscripcion'

  useEffect(() => {
    const modo = (router.query?.modo || '').toString();
    if (modo === 'evento' || modo === 'colecta' || modo === 'inscripcion') setMode(modo);
  }, [router.query?.modo]);

  return (
    <>
      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <h1 className={styles.title}>Cómo funciona Rifex</h1>
            <p className={styles.sub}>
              Crea un evento, inicia una campaña o recibe inscripciones gratuitas de forma simple.
            </p>
          </header>

          <div className={styles.selector}>
            <button
              type="button"
              className={`${styles.selectorBtn} ${mode === 'evento' ? styles.selectorBtnActive : ''}`}
              onClick={() => setMode('evento')}
              aria-pressed={mode === 'evento'}
            >
              <span className={styles.selectorIcon} aria-hidden="true">🎟️</span>
              Quiero crear un evento
            </button>
            <button
              type="button"
              className={`${styles.selectorBtn} ${mode === 'colecta' ? styles.selectorBtnActive : ''}`}
              onClick={() => setMode('colecta')}
              aria-pressed={mode === 'colecta'}
            >
              <span className={styles.selectorIcon} aria-hidden="true">🤝</span>
              Quiero crear una campaña
            </button>
            <button
              type="button"
              className={`${styles.selectorBtn} ${mode === 'inscripcion' ? styles.selectorBtnActive : ''}`}
              onClick={() => setMode('inscripcion')}
              aria-pressed={mode === 'inscripcion'}
            >
              <span className={styles.selectorIcon} aria-hidden="true">📋</span>
              Quiero recibir inscripciones
            </button>
          </div>

          {mode === 'evento' && (
            <div className={styles.flow}>
              <h2 className={styles.flowTitle}>Así funciona un evento en Rifex</h2>
              <ol className={styles.steps}>
                {EVENTO_STEPS.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <a href="/crear-evento" className={styles.cta}>Crear mi evento</a>
            </div>
          )}

          {mode === 'colecta' && (
            <div className={styles.flow}>
              <h2 className={styles.flowTitle}>Así funciona una campaña en Rifex</h2>
              <ol className={styles.steps}>
                {COLECTA_STEPS.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <a href="/crear-colecta" className={styles.cta}>Crear mi campaña</a>
            </div>
          )}

          {mode === 'inscripcion' && (
            <div className={styles.flow}>
              <h2 className={styles.flowTitle}>Así funciona Inscripciones en Rifex</h2>
              <ol className={styles.steps}>
                {INSCRIPCION_STEPS.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <a href="/crear-inscripcion" className={styles.cta}>Crear mi actividad</a>
            </div>
          )}

          {!mode && (
            <p className={styles.hint}>Elige una opción arriba para ver el paso a paso.</p>
          )}
        </div>
      </section>
    </>
  );
}

Wizard.getLayout = (page) => (
  <Layout
    title="Cómo funciona Rifex"
    description="Crea un evento con entradas digitales o inicia una campaña de recaudación en Rifex de forma simple."
    canonicalPath="/wizard"
  >
    {page}
  </Layout>
);
