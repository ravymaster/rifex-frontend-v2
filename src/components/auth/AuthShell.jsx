// src/components/auth/AuthShell.jsx
// AUTH UX 2026 — envoltorio visual compartido entre /login y /register.
// Solo presentación (layout, panel de marca, tarjeta del formulario):
// ningún componente de Auth (OAuth, captcha, sesión) vive acá — cada
// página sigue siendo dueña completa de su propia lógica y su <form>.
import styles from '@/styles/authShell.module.css';

export default function AuthShell({
  brandTitle = 'Rifex',
  brandText = 'Eventos, entradas digitales y campañas de recaudación desde una sola plataforma.',
  children,
}) {
  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.inner}>
          <aside className={styles.brandPanel}>
            <div className={styles.brandBox}>
              <img src="/rifex-logo.png" alt="Rifex" className={styles.logo} />
              <h2 className={styles.brandTitle}>{brandTitle}</h2>
              <p className={styles.brandText}>{brandText}</p>
              <div className={styles.dots}>
                <span className={styles.dot} data-variant="blue" />
                <span className={styles.dot} data-variant="teal" />
                <span className={styles.dot} data-variant="green" />
              </div>
            </div>
          </aside>

          <section className={styles.formPanel}>{children}</section>
        </div>
      </section>
    </main>
  );
}
