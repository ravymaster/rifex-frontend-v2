// src/pages/register.js
import Head from 'next/head';
import styles from '@/styles/register.module.css';
import Layout from '@/components/Layout';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient';

export default function Register() {
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [confirm, setConfirm] = useState('');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState('');
  const [err, setErr]         = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');

    if (password !== confirm) {
      setErr('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);

    const { data, error } = await supabaseBrowser.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });

    setLoading(false);

    if (error) {
      setErr(error.message || 'No se pudo crear la cuenta');
      return;
    }

    // Si en Supabase tienes desactivada la confirmación por email, tendrás sesión altiro
    if (data.session && data.user) {
      // Crear/actualizar perfil (no es fatal si falla)
      const { error: upErr } = await supabaseBrowser
        .from('users_profile')
        .upsert({ user_id: data.user.id, nombre: name });

      if (upErr) {
        setErr('Cuenta creada, pero no se pudo guardar el perfil: ' + upErr.message);
      }

      setMsg('¡Cuenta creada!');
      window.location.href = '/panel'; // redirige donde quieras
      return;
    }

    // Si la confirmación de email está activada en Supabase:
    setMsg('Revisa tu correo para confirmar la cuenta.');
    // opcional: window.location.href = '/login';
  }

  return (
    <>
      <Head>
        <title>Crear cuenta — Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.inner}>
            {/* Panel marca (izquierda en desktop / arriba en mobile) */}
            <aside className={styles.brandPanel}>
              <div className={styles.brandBox}>
                <img src="/logo-rifex.svg" alt="Rifex" className={styles.logo} />
                <h2 className={styles.brandTitle}>Rifex</h2>
                <p className={styles.brandText}>
                  Crea rifas en minutos, comparte el enlace y cobra online. Simple, rápido y seguro.
                </p>
                <div className={styles.dots}>
                  <span className={styles.dot} data-variant="blue" />
                  <span className={styles.dot} data-variant="teal" />
                  <span className={styles.dot} data-variant="green" />
                </div>
              </div>
            </aside>

            {/* Panel formulario (derecha en desktop / abajo en mobile) */}
            <section className={styles.formPanel}>
              <h1 className={styles.formTitle}>Crear cuenta</h1>
              <p className={styles.formSub}>Regístrate para crear y administrar tus rifas.</p>

              <form onSubmit={onSubmit}>
                <label className="label" htmlFor="name">Nombre</label>
                <input
                  id="name"
                  className="input"
                  placeholder="Tu nombre"
                  autoComplete="name"
                  value={name}
                  onChange={(e)=>setName(e.target.value)}
                  required
                />

                <label className="label" htmlFor="email" style={{ marginTop: 12 }}>Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  placeholder="tucorreo@dominio.com"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e)=>setEmail(e.target.value)}
                  required
                />

                <label className="label" htmlFor="password" style={{ marginTop: 12 }}>Contraseña</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e)=>setPass(e.target.value)}
                  required
                />

                <label className="label" htmlFor="confirm" style={{ marginTop: 12 }}>Confirmar contraseña</label>
                <input
                  id="confirm"
                  className="input"
                  type="password"
                  placeholder="Repite tu contraseña"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e)=>setConfirm(e.target.value)}
                  required
                />

                {err && <p style={{ color: '#b91c1c', marginTop: 10 }}>{err}</p>}
                {msg && <p style={{ color: '#065f46', marginTop: 10 }}>{msg}</p>}

                <div className={styles.actions}>
                  <button className={`btn ${styles.btnPrimary}`} type="submit" disabled={loading}>
                    {loading ? 'Creando...' : 'Crear cuenta'}
                  </button>
                  <a className={`btn ${styles.btnSecondary}`} href="/login">Iniciar sesión</a>
                </div>
              </form>
            </section>
          </div>
        </section>
      </main>
    </>
  );
}

// Mantén el Layout si lo usas en el sitio
Register.getLayout = (page) => <Layout>{page}</Layout>;


