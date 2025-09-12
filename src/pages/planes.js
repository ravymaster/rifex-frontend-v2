// src/pages/planes.js
import Head from 'next/head';
import Layout from '@/components/Layout';
import styles from '@/styles/planes.module.css';

export default function Planes() {
  const planes = [
    {
      id: 'free',
      nombre: 'Gratis',
      precio: '$0 / mes',
      desc: 'Perfecto para empezar.',
      features: ['Hasta 2 rifas activas', 'Chat básico', 'Pagos con comisión estándar', 'Soporte por email'],
      cta: { href: '/register', label: 'Empezar' },
      badge: 'Popular',
    },
    {
      id: 'pro',
      nombre: 'Pro',
      precio: '$9.990 / mes',
      desc: 'Para creadores frecuentes.',
      features: ['Rifas ilimitadas', 'Chat por rifa avanzado', 'Menor comisión por pago', 'Prioridad en soporte'],
      cta: { href: '/register', label: 'Probar Pro' },
      highlighted: true,
    },
  ];

  return (
    <>
      <Head>
        <title>Planes — Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <h1 className={styles.title}>Planes</h1>
            <p className={styles.sub}>Elige el plan que mejor se adapte a tu ritmo.</p>
          </header>

          <div className={styles.grid}>
            {planes.map(p => (
              <article key={p.id} className={`${styles.card} ${p.highlighted ? styles.cardHi : ''}`}>
                {p.badge && <div className={styles.badge}>{p.badge}</div>}
                <h2 className={styles.planName}>{p.nombre}</h2>
                <div className={styles.price}>{p.precio}</div>
                <p className={styles.desc}>{p.desc}</p>
                <ul className={styles.features}>
                  {p.features.map((f,i)=> <li key={i}>✔ {f}</li>)}
                </ul>
                <a className={styles.cta} href={p.cta.href}>{p.cta.label}</a>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
Planes.getLayout = (page) => <Layout>{page}</Layout>;
