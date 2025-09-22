import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import styles from '@/styles/login.module.css';

/* Botón Google */
function GoogleButton({ label = 'Continuar con Google', className = '' }) {
  async function signInGoogle() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/panel`, queryParams: { prompt: 'select_account' } },
    });
  }
  return (
    <button
      type="button"
      onClick={signInGoogle}
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff',
        padding: '10px 14px', fontWeight: 900, cursor: 'pointer'
      }}
    >
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width="18" height="18" />
      {label}
    </button>
  );
}

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const captchaRef = useRef(null);
  const sitekey = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY;

  useEffect(() => {
    if (document.getElementById('hcaptcha-script')) return;
    const s = document.createElement('script');
    s.id = 'hcaptcha-script';
    s.src = 'https://js.hcaptcha.com/1/api.js';
    s.async = true; s.defer = true;
    document.body.appendChild(s);
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      // hCaptcha → usar getResponse() sin argumentos (un único widget)
      const token = window.hcaptcha?.getResponse();
      if (!token) { setErr('Completa el captcha.'); return; }
      const r = await fetch('/api/verify-captcha', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const j = await r.json().catch(()=>({ok:false}));
      if (!j.ok) { setErr('Captcha inválido.'); return; }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('email') && msg.includes('confirm')) {
          setErr('Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.');
        } else {
          setErr(error.message || 'No se pudo iniciar sesión.');
        }
        return;
      }

      // Ok → al panel
      router.push('/panel');
    } catch (e) {
      console.error('[login]', e);
      setErr('Error iniciando sesión. Intenta de nuevo.');
    } finally {
      setLoading(false);
      try { window.hcaptcha?.reset(); } catch {}
    }
  }

  return (
    <>
      <Head><title>Iniciar sesión — Rifex</title></Head>
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.inner}>
            {/* Panel marca */}
            <aside className={styles.brandPanel}>
              <div className={styles.brandBox}>
                <img src="/rifex-logo.png" alt="Rifex" className={styles.logo} />
                <h2 className={styles.brandTitle}>Rifex</h2>
                <p className={styles.brandText}>Crea rifas en minutos, comparte el enlace y cobra online.</p>
                <div className={styles.dots}>
                  <span className={styles.dot} data-variant="blue" />
                  <span className={styles.dot} data-variant="teal" />
                  <span className={styles.dot} data-variant="green" />
                </div>
              </div>
            </aside>

            {/* Formulario */}
            <section className={styles.formPanel}>
              <h1 className={styles.formTitle}>Iniciar sesión</h1>
              <p className={styles.formSub}>Accede para crear y administrar tus rifas.</p>

              <form onSubmit={onSubmit}>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" className="input" type="email" placeholder="tucorreo@dominio.com"
                       value={email} onChange={(e)=>setEmail(e.target.value)} required />
                <label className="label" htmlFor="pass" style={{ marginTop: 10 }}>Contraseña</label>
                <input id="pass" className="input" type="password" placeholder="Tu contraseña"
                       value={pass} onChange={(e)=>setPass(e.target.value)} required />

                <div className={styles.captchaWrap}>
                  <div className="h-captcha" data-sitekey={sitekey} ref={captchaRef} />
                </div>

                {err && <p className={styles.err}>{err}</p>}

                <div className={styles.actions}>
                  <button className={`btn ${styles.btnPrimary}`} type="submit" disabled={loading}>
                    {loading ? 'Entrando…' : 'Entrar'}
                  </button>
                  <a className={`btn ${styles.btnSecondary}`} href="/register">Crear cuenta</a>
                </div>
              </form>

              <div className={styles.oauthArea}>
                <div className={styles.hr}><span>o</span></div>
                <GoogleButton label="Continuar con Google" className={styles.oauthBtn} />
              </div>
            </section>
          </div>
        </section>
      </main>
    </>
  );
}


