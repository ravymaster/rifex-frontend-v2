// src/pages/perfil.js
import Head from 'next/head';
import Layout from '@/components/Layout';
import styles from '@/styles/perfil.module.css';

export default function Perfil() {
  return (
    <>
      <Head>
        <title>Perfil — Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <h1 className={styles.title}>Perfil</h1>
            <p className={styles.sub}>Gestiona tu información personal y seguridad.</p>
          </header>

          <div className={styles.grid}>
            {/* Datos básicos */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Datos</h2>
              <div className={styles.avatarRow}>
                <div className={styles.avatar}>R</div>
                <div className={styles.avatarActions}>
                  <button className="btn btn-ghost">Cambiar foto</button>
                  <button className="btn btn-ghost">Eliminar</button>
                </div>
              </div>

              <label className="label">Nombre</label>
              <input className="input" placeholder="Tu nombre" />

              <label className="label" style={{ marginTop: 10 }}>Email</label>
              <input className="input" type="email" placeholder="tucorreo@dominio.com" />
              
              <div className={styles.actions}>
                <button className="btn btn-primary">Guardar cambios</button>
              </div>
            </section>

            {/* Seguridad */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Seguridad</h2>
              <label className="label">Contraseña actual</label>
              <input className="input" type="password" placeholder="••••••••" />

              <label className="label" style={{ marginTop: 10 }}>Nueva contraseña</label>
              <input className="input" type="password" placeholder="Mínimo 8 caracteres" />

              <label className="label" style={{ marginTop: 10 }}>Confirmar nueva</label>
              <input className="input" type="password" placeholder="Repite la contraseña" />

              <div className={styles.actions}>
                <button className="btn btn-primary">Actualizar contraseña</button>
                <button className="btn btn-ghost">Cancelar</button>
              </div>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}

Perfil.getLayout = (page) => <Layout>{page}</Layout>;
