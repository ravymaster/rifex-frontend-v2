// src/pages/wizard.js
// UX/CRO-1: guía pública "Cómo funciona" — reemplaza temporalmente el
// enlace de /rifas en el nav. No introduce conceptos técnicos, solo el
// paso a paso en lenguaje simple.
// STAGE 2 FINAL — metadata migrada a las props de Layout (mismo patrón
// que el resto de las páginas certificadas; evita el bug real de
// colisión de key de Next 14.2.32 entre el <Head> propio de esta página
// y el de Layout).
// ÚLTIMO BLOQUEO PRE-PROD — la superficie pública ahora representa
// exclusivamente Eventos + Campañas (Rifas sigue existiendo como
// producto autenticado vía Mis iniciativas/crear-rifa.jsx; esta página
// nunca formó parte de esa arquitectura y no la modifica).
import { useState } from 'react';
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

export default function Wizard() {
  const [mode, setMode] = useState(null); // null | 'evento' | 'colecta'

  return (
    <>
      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <h1 className={styles.title}>Cómo funciona Rifex</h1>
            <p className={styles.sub}>
              Crea un evento o inicia una campaña de forma simple.
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
