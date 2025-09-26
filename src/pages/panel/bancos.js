// src/pages/panel/bancos.js
import Head from "next/head";
import Layout from "@/components/Layout";
import styles from "@/styles/bancos.module.css";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Bancos() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // ---- form state ----
  const [holderName, setHolderName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState("corriente");
  const [accountNumber, setAccountNumber] = useState("");
  const [payoutEmail, setPayoutEmail] = useState("");

  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ---- providers status ----
  const [mpConnected, setMpConnected] = useState(false);
  const [checkingMp, setCheckingMp] = useState(true);

  const flowConnected = true;

  const mpConnectHref = useMemo(() => {
    const base = "/api/mp/oauth/start";
    const params = new URLSearchParams();
    if (user?.email) params.set("email", user.email);
    if (user?.id) params.set("uid", user.id);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [user]);

  // Restaurar sesión en cliente (localStorage)
  useEffect(() => {
    let mounted = true;
    let sub;
    (async () => {
      try {
        setLoadingUser(true);
        const { data } = await supabase.auth.getSession();
        if (mounted) setUser(data?.session?.user || null);
        sub = supabase.auth
          .onAuthStateChange((_evt, session) => {
            if (!mounted) return;
            setUser(session?.user || null);
          }).data?.subscription;
      } finally {
        if (mounted) setLoadingUser(false);
      }
    })();
    return () => {
      mounted = false;
      try { sub?.unsubscribe?.(); } catch {}
    };
  }, []);

  // Cargar datos
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("holder_name, tax_id, bank_name, account_type, account_number, payout_email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!error && data) {
        setHolderName(data.holder_name || "");
        setTaxId(data.tax_id || "");
        setBankName(data.bank_name || "");
        setAccountType(data.account_type || "corriente");
        setAccountNumber(data.account_number || "");
        setPayoutEmail(data.payout_email || "");
      }
    })();
  }, [user?.id]);

  // Estado de conexión MP
  useEffect(() => {
    (async () => {
      setCheckingMp(true);
      try {
        if (!user?.id) {
          setMpConnected(false);
          return;
        }
        const res = await fetch(`/api/mp/status?uid=${encodeURIComponent(user.id)}`);
        const j = await res.json();
        setMpConnected(!!j?.connected);
      } catch {
        setMpConnected(false);
      } finally {
        setCheckingMp(false);
      }
    })();
  }, [user?.id]);

  const onSave = async (e) => {
    e?.preventDefault?.();
    setErrorMsg("");
    setSavedOk(false);

    if (!user?.id) {
      setErrorMsg("Debes iniciar sesión.");
      return;
    }
    if (!holderName.trim()) return setErrorMsg("Ingresa el nombre del titular.");
    if (!payoutEmail.trim()) return setErrorMsg("Ingresa el email de liquidaciones.");

    setSaving(true);
    try {
      const row = {
        user_id: user.id,
        holder_name: holderName.trim(),
        tax_id: taxId.trim() || null,
        bank_name: bankName.trim() || null,
        account_type: accountType || "corriente",
        account_number: accountNumber.trim() || null,
        payout_email: payoutEmail.trim().toLowerCase(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("bank_accounts")
        .upsert(row, { onConflict: "user_id" });

      if (error) throw error;
      setSavedOk(true);
    } catch (err) {
      setErrorMsg(err?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
      setTimeout(() => setSavedOk(false), 2000);
    }
  };

  return (
    <>
      <Head>
        <title>Bancos & Pagos — Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>Bancos & Pagos</h1>
              <p className={styles.sub}>Configura tus datos bancarios y conecta proveedores de pago.</p>
            </div>
          </header>

          <div className={styles.grid}>
            {/* Datos bancarios */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Datos bancarios</h2>
              <p className={styles.cardSub}>Se usarán para tus retiros.</p>

              {loadingUser ? (
                <p>Cargando…</p>
              ) : !user ? (
                <p>Debes iniciar sesión para gestionar tus datos.</p>
              ) : (
                <form onSubmit={onSave}>
                  <label className="label">Titular</label>
                  <input className="input" placeholder="Nombre del titular"
                         value={holderName} onChange={(e) => setHolderName(e.target.value)} />

                  <label className="label" style={{ marginTop: 10 }}>ID fiscal</label>
                  <input className="input" placeholder="RUT / DNI / CUIT"
                         value={taxId} onChange={(e) => setTaxId(e.target.value)} />

                  <label className="label" style={{ marginTop: 10 }}>Banco</label>
                  <input className="input" placeholder="Nombre de banco"
                         value={bankName} onChange={(e) => setBankName(e.target.value)} />

                  <label className="label" style={{ marginTop: 10 }}>Tipo de cuenta</label>
                  <select className="input" value={accountType}
                          onChange={(e) => setAccountType(e.target.value)}>
                    <option value="corriente">Cuenta Corriente</option>
                    <option value="vista">Cuenta Vista</option>
                    <option value="ahorro">Cuenta de Ahorro</option>
                  </select>

                  <label className="label" style={{ marginTop: 10 }}>Número de cuenta</label>
                  <input className="input" placeholder="0000 0000 0000" inputMode="numeric"
                         value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />

                  <label className="label" style={{ marginTop: 10 }}>Email para liquidaciones</label>
                  <input className="input" type="email" placeholder="tucorreo@dominio.com"
                         value={payoutEmail} onChange={(e) => setPayoutEmail(e.target.value)} />

                  {errorMsg ? <p style={{ color: "#b91c1c", marginTop: 10 }}>{errorMsg}</p> : null}
                  {savedOk ? <p style={{ color: "#065f46", marginTop: 10 }}>Guardado correctamente.</p> : null}

                  <div className={styles.actions}>
                    <button className="btn btn-primary" disabled={saving}>
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => {}}>
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* Integraciones */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Proveedores de pago</h2>
              <p className={styles.cardSub}>Conecta tu cuenta para recibir pagos automáticamente.</p>

              <div className={styles.providers}>
                {/* Mercado Pago */}
                <div className={styles.providerCard}>
                  <div className={styles.providerHead}>
                    <div className={styles.providerInfo}>
                      <div className={styles.providerLogo}>MP</div>
                      <div>
                        <div className={styles.providerName}>Mercado Pago</div>
                        <div className={styles.providerDesc}>Pagos rápidos en CLP.</div>
                      </div>
                    </div>
                    <span className={styles.status}
                          data-state={mpConnected ? "ok" : "off"}
                          title={checkingMp ? "Verificando…" : ""}>
                      {mpConnected ? "Conectado" : "No conectado"}
                    </span>
                  </div>

                  <div className={styles.providerActions}>
                    {mpConnected ? (
                      <>
                        <a className={styles.btnManage} href="/panel/mercado-pago">Gestionar</a>
                        <button className={styles.btnDanger} disabled>Desconectar</button>
                      </>
                    ) : (
                      <a className={styles.btnConnect} href={mpConnectHref}>Conectar</a>
                    )}
                  </div>
                </div>

                {/* Flow */}
                <div className={styles.providerCard}>
                  <div className={styles.providerHead}>
                    <div className={styles.providerInfo}>
                      <div className={styles.providerLogo}>F</div>
                      <div>
                        <div className={styles.providerName}>Flow</div>
                        <div className={styles.providerDesc}>Pagos locales y link de pago.</div>
                      </div>
                    </div>
                    <span className={styles.status} data-state={flowConnected ? "ok" : "off"}>
                      {flowConnected ? "Conectado" : "No conectado"}
                    </span>
                  </div>

                  <div className={styles.providerActions}>
                    {flowConnected ? (
                      <>
                        <a className={styles.btnManage} href="/panel/flow">Gestionar</a>
                        <button className={styles.btnDanger} disabled>Desconectar</button>
                      </>
                    ) : (
                      <a className={styles.btnConnect} href="/panel/flow">Conectar</a>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}

Bancos.getLayout = (page) => <Layout>{page}</Layout>;



