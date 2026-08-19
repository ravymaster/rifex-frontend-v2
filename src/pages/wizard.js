// src/pages/wizard.js
// UX/CRO-1: guía pública "Cómo funciona" — reemplaza temporalmente el
// enlace de /rifas en el nav. No introduce conceptos técnicos, solo el
// paso a paso en lenguaje simple.
import Head from 'next/head';
import { useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/wizard.module.css';

const RIFA_STEPS = [
  'Crea tu cuenta.',
  'Elige tu país.',
  'Conecta el medio de pago disponible.',
  'Pulsa Crear rifa.',
  'Escribe título y descripción.',
  'Agrega el premio y fotografías.',
  'Define el precio de cada número.',
  'Define la cantidad de números.',
  'Define la fecha de término.',
  'Revisa y publica.',
  'Comparte el enlace.',
  'Los participantes seleccionan un número y pagan.',
  'Rifex registra automáticamente las ventas.',
  'Realiza el sorteo cuando corresponda.',
  'Entrega el premio al ganador.',
];

const COLECTA_STEPS = [
  'Crea tu cuenta.',
  'Elige tu país.',
  'Conecta el medio de pago disponible.',
  'Pulsa Crear campaña.',
  'Escribe título y descripción.',
  'Agrega portada/fotografías.',
  'Define la meta.',
  'Define fechas.',
  'Revisa y publica.',
  'Comparte enlace o QR.',
  'Las personas eligen cuánto aportar.',
  'Los aportes llegan mediante el proveedor de pagos.',
  'Rifex actualiza automáticamente lo recaudado.',
];

export default function Wizard() {
  const [mode, setMode] = useState(null); // null | 'rifa' | 'colecta'

  return (
    <>
      <Head>
        <title>Cómo funciona Rifex</title>
        <meta
          name="description"
          content="Crear una rifa o iniciar una campaña en Rifex es más simple de lo que parece."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <h1 className={styles.title}>Cómo funciona Rifex</h1>
            <p className={styles.sub}>
              Crear una rifa o iniciar una campaña es más simple de lo que parece.
            </p>
          </header>

          <div className={styles.selector}>
            <button
              type="button"
              className={`${styles.selectorBtn} ${mode === 'rifa' ? styles.selectorBtnActive : ''}`}
              onClick={() => setMode('rifa')}
              aria-pressed={mode === 'rifa'}
            >
              <span className={styles.selectorIcon} aria-hidden="true">🎟️</span>
              Quiero crear una rifa
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

          {mode === 'rifa' && (
            <div className={styles.flow}>
              <h2 className={styles.flowTitle}>Así funciona una rifa en Rifex</h2>
              <ol className={styles.steps}>
                {RIFA_STEPS.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <a href="/crear-rifa" className={styles.cta}>Crear mi rifa</a>
            </div>
          )}

          {mode === 'colecta' && (
            <div className={styles.flow}>
              <h2 className={styles.flowTitle}>Así funciona una campaña en Rifex</h2>
              <ol className={styles.steps}>
                {COLECTA_STEPS.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <a href="/crear-colecta" className={styles.cta}>Crear una campaña</a>
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

Wizard.getLayout = (page) => <Layout>{page}</Layout>;
