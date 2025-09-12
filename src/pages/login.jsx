import Head from 'next/head';
import styles from '@/styles/login.module.css';
import Layout from '@/components/Layout';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setLoading(true);

    const { error } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErr(error.message || 'Error al iniciar sesión');
      return;
    }

    setMsg('¡Sesión iniciada!');
    // Redirige donde quieras (panel, home, etc.)
    window.location.href = '/panel';
  }

  return (
    <>
      <Head>
        <title>Iniciar sesión — Rifex</title>
      </Head>

      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.inner}>
            {/* Panel marca (izquierda) */}
            <aside className={styles.brandPanel}>
              <div className={styles.brandBox}>
                <img src="/logo-rifex.svg" alt="Rifex" className={styles.logo} />
                <h2 className={styles.brandTitle}>Rifex</h2>
                <p className={styles.brandText}>
                  Crea rifas en minutos, comparte el enlace y cobra online.
                </p>
                <div className={styles.dots}>
                  <span className={styles.dot} data-variant="blue" />
                  <span className={styles.dot} data-variant="teal" />
                  <span className={styles.dot} data-variant="green" />
                </div>
              </div>
            </aside>

            {/* Panel formulario (derecha) */}
            <section className={styles.formPanel}>
              <h1 className={styles.formTitle}>Iniciar sesión</h1>
              <p className={styles.formSub}>Accede para crear y administrar tus rifas.</p>

              <form onSubmit={onSubmit}>
                <label className="label" htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  placeholder="tucorreo@dominio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <label className="label" htmlFor="password" style={{ marginTop: 12 }}>
                  Contraseña
                </label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                {err && <p style={{ color: '#b91c1c', marginTop: 10 }}>{err}</p>}
                {msg && <p style={{ color: '#065f46', marginTop: 10 }}>{msg}</p>}

                <div className={styles.actions}>
                  <button className={`btn ${styles.btnPrimary}`} type="submit" disabled={loading}>
                    {loading ? 'Entrando...' : 'Entrar'}
                  </button>
                  <a className={`btn ${styles.btnSecondary}`} href="/register">Crear cuenta</a>
                </div>
              </form>
            </section>
          </div>
        </section>
      </main>
    </>
  );
}

// Usa Layout si ya lo tenías activo
Login.getLayout = (page) => <Layout>{page}</Layout>;
