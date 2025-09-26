import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import styles from "@/styles/reset-password.module.css";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";

export default function ResetPassword() {
  const router = useRouter();

  // Detecta si venimos desde el link de recuperación de Supabase
  const isRecovery = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.location.hash.includes("type=recovery");
  }, []);

  // ---- estados para pedir correo ----
  const [email, setEmail] = useState(router.query?.email?.toString() || "");
  const [sendLoading, setSendLoading] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const [sendErr, setSendErr] = useState("");

  // ---- hCaptcha (solo en modo "solicitar correo") ----
  const captchaRef = useRef(null);
  const sitekey = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY;

  useEffect(() => {
    if (!isRecovery) {
      // cargamos hcaptcha solo cuando mostramos el formulario de envío
      if (document.getElementById("hcaptcha-script")) return;
      const s = document.createElement("script");
      s.id = "hcaptcha-script";
      s.src = "https://js.hcaptcha.com/1/api.js";
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
    }
  }, [isRecovery]);

  // ---- estados para cambiar contraseña ----
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeErr, setChangeErr] = useState("");
  const [changeMsg, setChangeMsg] = useState("");

  async function onSendEmail(e) {
    e.preventDefault();
    setSendErr("");
    setSendMsg("");

    if (!email.trim()) {
      setSendErr("Ingresa tu email.");
      return;
    }

    // hCaptcha obligatorio
    const token = window.hcaptcha?.getResponse();
    if (!token) {
      setSendErr("Completa el captcha.");
      return;
    }

    setSendLoading(true);
    try {
      // Verificar token en backend
      const vr = await fetch("/api/verify-captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const vj = await vr.json().catch(() => ({ ok: false }));
      if (!vj.ok) {
        setSendErr("Captcha inválido.");
        return;
      }

      const origin =
        (typeof window !== "undefined" && window.location.origin) ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        "http://localhost:3000";

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/reset-password`, // vuelve a esta misma página
      });
      if (error) throw error;
      setSendMsg(
        "Te enviamos un correo con el enlace para restablecer tu contraseña."
      );
    } catch (err) {
      setSendErr(
        err?.message || "No se pudo enviar el correo. Intenta nuevamente."
      );
    } finally {
      setSendLoading(false);
      try {
        window.hcaptcha?.reset();
      } catch {}
    }
  }

  async function onChangePassword(e) {
    e.preventDefault();
    setChangeErr("");
    setChangeMsg("");

    if (!pass1 || !pass2) {
      setChangeErr("Completa ambos campos.");
      return;
    }
    if (pass1 !== pass2) {
      setChangeErr("Las contraseñas no coinciden.");
      return;
    }
    if (pass1.length < 8) {
      setChangeErr("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setChangeLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;

      setChangeMsg("Contraseña actualizada correctamente. Redirigiendo al panel…");
      setTimeout(() => router.push("/panel"), 900);
    } catch (err) {
      setChangeErr(
        err?.message ||
          "No se pudo actualizar la contraseña. Abre el enlace más reciente desde tu correo."
      );
    } finally {
      setChangeLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Restablecer contraseña — Rifex</title>
      </Head>

      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.inner}>
            {/* Panel de marca */}
            <aside className={styles.brandPanel}>
              <div className={styles.brandBox}>
                <img src="/rifex-logo.png" alt="Rifex" className={styles.logo} />
                <h2 className={styles.brandTitle}>Rifex</h2>
                <p className={styles.brandText}>
                  Seguridad primero: restablece tu contraseña en pocos pasos.
                </p>
              </div>
            </aside>

            {/* Panel funcional */}
            <section className={styles.formPanel}>
              {isRecovery ? (
                <>
                  <h1 className={styles.formTitle}>Definir nueva contraseña</h1>
                  <p className={styles.formSub}>
                    Ingresa y confirma tu nueva contraseña.
                  </p>

                  <form onSubmit={onChangePassword}>
                    <label className="label" htmlFor="pass1">
                      Nueva contraseña
                    </label>
                    <input
                      id="pass1"
                      className="input"
                      type="password"
                      placeholder="Mínimo 8 caracteres"
                      value={pass1}
                      onChange={(e) => setPass1(e.target.value)}
                      required
                    />
                    <label
                      className="label"
                      htmlFor="pass2"
                      style={{ marginTop: 10 }}
                    >
                      Confirmar contraseña
                    </label>
                    <input
                      id="pass2"
                      className="input"
                      type="password"
                      placeholder="Repite la contraseña"
                      value={pass2}
                      onChange={(e) => setPass2(e.target.value)}
                      required
                    />

                    {changeErr && <p className={styles.err}>{changeErr}</p>}
                    {changeMsg && <p className={styles.msg}>{changeMsg}</p>}

                    <div className={styles.actions}>
                      <button
                        className={`btn ${styles.btnPrimary}`}
                        type="submit"
                        disabled={changeLoading}
                      >
                        {changeLoading ? "Actualizando…" : "Cambiar contraseña"}
                      </button>
                      <a className={`btn ${styles.btnSecondary}`} href="/login">
                        Volver a iniciar sesión
                      </a>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h1 className={styles.formTitle}>Restablecer contraseña</h1>
                  <p className={styles.formSub}>
                    Te enviaremos un enlace a tu correo para crear una nueva
                    contraseña.
                  </p>

                  <form onSubmit={onSendEmail}>
                    <label className="label" htmlFor="email">
                      Email
                    </label>
                    <input
                      id="email"
                      className="input"
                      type="email"
                      placeholder="tucorreo@dominio.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />

                    {/* hCaptcha */}
                    <div className={styles.captchaWrap}>
                      <div
                        className="h-captcha"
                        data-sitekey={sitekey}
                        ref={captchaRef}
                      />
                    </div>

                    {sendErr && <p className={styles.err}>{sendErr}</p>}
                    {sendMsg && <p className={styles.msg}>{sendMsg}</p>}

                    <div className={styles.actions}>
                      <button
                        className={`btn ${styles.btnPrimary}`}
                        type="submit"
                        disabled={sendLoading}
                      >
                        {sendLoading ? "Enviando…" : "Enviar enlace"}
                      </button>
                      <a className={`btn ${styles.btnSecondary}`} href="/login">
                        Volver a iniciar sesión
                      </a>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        </section>
      </main>
    </>
  );
}

