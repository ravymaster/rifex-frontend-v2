import Head from 'next/head';
import styles from '@/styles/register.module.css';
import Layout from '@/components/Layout';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

/* ========= RUT helpers (Chile) ========= */
function cleanRut(rut){ return String(rut||'').replace(/[^0-9kK]/g,'').toUpperCase(); }
function rutIsValid(rut){
  const r=cleanRut(rut); if(r.length<8) return false;
  const body=r.slice(0,-1), dv=r.slice(-1); let sum=0, mul=2;
  for(let i=body.length-1;i>=0;i--){ sum+=parseInt(body[i],10)*mul; mul=mul===7?2:mul+1; }
  const res=11-(sum%11); const dvCalc=res===11?'0':res===10?'K':String(res);
  return dvCalc===dv;
}
function formatRut(r){ const r2=cleanRut(r); const b=r2.slice(0,-1), dv=r2.slice(-1); return b? b.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+'-'+dv : r2; }

/* ========= Password policy ========= */
const PW_RULES = { minLen: 8, upper: /[A-Z]/, digit: /\d/, symbol: /[^A-Za-z0-9]/ };
function hasSequential(pw) {
  const s = pw.toLowerCase();
  const badSeqs = ["12345678","23456789","01234567","abcdef","qwerty","password"];
  if (badSeqs.some(seq => s.includes(seq))) return true;
  let run = 1;
  for (let i = 1; i < s.length; i++) {
    if (s.charCodeAt(i) === s.charCodeAt(i-1) + 1) run++;
    else run = 1;
    if (run >= 5) return true;
  }
  if (/(.)\1{3,}/.test(s)) return true;
  return false;
}
function passwordIssues(pw, email="", name="") {
  const issues = [];
  if (!pw || pw.length < PW_RULES.minLen) issues.push("Mínimo 8 caracteres");
  if (!PW_RULES.upper.test(pw)) issues.push("Al menos 1 mayúscula");
  if (!PW_RULES.digit.test(pw)) issues.push("Al menos 1 número");
  if (!PW_RULES.symbol.test(pw)) issues.push("Al menos 1 símbolo");
  if (hasSequential(pw)) issues.push("Evita secuencias (p.ej. 12345678) o repeticiones");
  const lowered = pw.toLowerCase();
  if (email && lowered.includes(String(email).split("@")[0].toLowerCase())) issues.push("No uses tu email en la clave");
  if (name && lowered.includes(String(name).toLowerCase())) issues.push("No uses tu nombre en la clave");
  return issues;
}

/* ========= Google button ========= */
function GoogleButton({ label = "Continuar con Google", className = "" }) {
  async function signInGoogle() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/panel`,
        queryParams: { prompt: "select_account" }
      },
    });
  }
  return (
    <button type="button" onClick={signInGoogle}
      className={className}
      style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,
              borderRadius:12,border:"1px solid #e5e7eb",background:"#fff",
              padding:"10px 14px",fontWeight:900}}>
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width="18" height="18"/>
      {label}
    </button>
  );
}

export default function Register(){
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [pass,setPass]=useState('');
  const [confirm,setConfirm]=useState('');
  const [rut,setRut]=useState('');
  const [pwIssues,setPwIssues]=useState([]);

  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');

  const captchaRef = useRef(null);
  const sitekey = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY;

  // inyectar script hCaptcha una vez
  useEffect(() => {
    if (document.getElementById("hcaptcha-script")) return;
    const s = document.createElement("script");
    s.id = "hcaptcha-script";
    s.src = "https://js.hcaptcha.com/1/api.js";
    s.async = true; s.defer = true;
    document.body.appendChild(s);
  }, []);

  async function onSubmit(e){
    e.preventDefault(); setErr(''); setMsg('');

    const issues = passwordIssues(pass, email, name);
    if (issues.length) { setErr("Contraseña insegura: " + issues[0]); return; }
    if (pass !== confirm) { setErr("Las contraseñas no coinciden"); return; }
    if (!rutIsValid(rut)) { setErr("El RUT no es válido. Ej: 14.182.309-4"); return; }

    setLoading(true);
    try {
      // Captcha (👉 sin pasar el div; usa el único widget de la página)
      const token = window.hcaptcha?.getResponse();
      if (!token) { setErr("Completa el captcha."); return; }
      const r = await fetch("/api/verify-captcha", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const j = await r.json().catch(()=>({ok:false}));
      if (!j.ok) { setErr("Captcha inválido."); return; }

      // Registro (solo metadata; NO upsert profile aquí)
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: { full_name: name, rut_beneficiario: cleanRut(rut) },
          emailRedirectTo: `${origin}/panel`
        }
      });

      if (error) { setErr(error.message || "No se pudo crear la cuenta"); return; }

      setMsg("Cuenta creada. Revisa tu correo y confirma para continuar.");
    } catch (e) {
      console.error("[register]", e);
      setErr(e?.message || "No se pudo crear la cuenta. Intenta nuevamente.");
    } finally {
      setLoading(false);
      try { window.hcaptcha?.reset(); } catch {}
    }
  }

  return (
    <>
      <Head><title>Crear cuenta — Rifex</title></Head>
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.inner}>
            {/* Panel marca */}
            <aside className={styles.brandPanel}>
              <div className={styles.brandBox}>
                <img src="/rifex-logo.png" alt="Rifex" className={styles.logo} />
                <h2 className={styles.brandTitle}>Rifex</h2>
                <p className={styles.brandText}>Crea rifas en minutos, comparte el enlace y cobra online. Simple, rápido y seguro.</p>
                <div className={styles.dots}>
                  <span className={styles.dot} data-variant="blue" />
                  <span className={styles.dot} data-variant="teal" />
                  <span className={styles.dot} data-variant="green" />
                </div>
              </div>
            </aside>

            {/* Formulario */}
            <section className={styles.formPanel}>
              <h1 className={styles.formTitle}>Crear cuenta</h1>
              <p className={styles.formSub}>Regístrate para crear y administrar tus rifas.</p>

              <form onSubmit={onSubmit}>
                <label className="label" htmlFor="name">Nombre</label>
                <input id="name" className="input" placeholder="Tu nombre" value={name} onChange={(e)=>setName(e.target.value)} required />

                <label className="label" htmlFor="email" style={{ marginTop:10 }}>Email</label>
                <input id="email" className="input" type="email" placeholder="tucorreo@dominio.com" value={email} onChange={(e)=>setEmail(e.target.value)} required />

                <label className="label" htmlFor="rut" style={{ marginTop:10 }}>RUT beneficiario</label>
                <input id="rut" className="input" placeholder="14.182.309-4" value={formatRut(rut)} onChange={(e)=>setRut(e.target.value)} required />
                <p className={styles.hint}>Validaremos tu cuenta con este RUT.</p>

                <label className="label" htmlFor="pass" style={{ marginTop:10 }}>Contraseña</label>
                <input
                  id="pass" className="input" type="password"
                  placeholder="Mínimo 8, con mayúscula, número y símbolo"
                  value={pass}
                  onChange={(e)=>{ const v=e.target.value; setPass(v); setPwIssues(passwordIssues(v,email,name)); }}
                  required
                />
                <p className={styles.hint}>Mínimo 8 caracteres, incluye <b>una mayúscula</b>, <b>un número</b> y <b>un símbolo</b>.</p>

                <label className="label" htmlFor="confirm" style={{ marginTop:10 }}>Repetir contraseña</label>
                <input id="confirm" className="input" type="password" placeholder="Repite tu contraseña" value={confirm} onChange={(e)=>setConfirm(e.target.value)} required />

                {/* hCaptcha */}
                <div className={styles.captchaWrap}>
                  <div className="h-captcha" data-sitekey={sitekey} ref={captchaRef} />
                </div>

                {pwIssues.length > 0 && (
                  <ul className={styles.pwChecklist}>
                    <li className={/Mínimo/.test(pwIssues.join(" "))?styles.bad:styles.ok}>Mínimo 8 caracteres</li>
                    <li className={/mayúscula/.test(pwIssues.join(" "))?styles.bad:styles.ok}>1 mayúscula</li>
                    <li className={/número/.test(pwIssues.join(" "))?styles.bad:styles.ok}>1 número</li>
                    <li className={/símbolo/.test(pwIssues.join(" "))?styles.bad:styles.ok}>1 símbolo</li>
                    <li className={/secuencias|repeticiones/.test(pwIssues.join(" "))?styles.bad:styles.ok}>Sin secuencias</li>
                  </ul>
                )}

                {err && <p className={styles.err}>{err}</p>}
                {msg && <p className={styles.msg}>{msg}</p>}

                <div className={styles.actions}>
                  <button className={`btn ${styles.btnPrimary}`} type="submit" disabled={loading}>
                    {loading ? 'Creando…' : 'Crear cuenta'}
                  </button>
                  <a className={`btn ${styles.btnSecondary}`} href="/login">Iniciar sesión</a>
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

Register.getLayout = (page) => <Layout>{page}</Layout>;



