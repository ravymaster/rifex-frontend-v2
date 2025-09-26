// src/pages/panel/bancos.js
import Head from "next/head";
import Layout from "@/components/Layout";
import styles from "@/styles/bancos.module.css";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";

// ---------- Cliente browser para operaciones del formulario ----------
const supabaseBrowser = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

// ---------- SSR: protege la página y precarga datos ----------
export async function getServerSideProps(ctx) {
  const supabase = createServerSupabaseClient(ctx);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent("/panel/bancos");
    return {
      redirect: { destination: `/login?next=${next}`, permanent: false },
    };
  }

  // Precarga datos bancarios
  const { data: bank } = await supabase
    .from("bank_accounts")
    .select(
      "holder_name, tax_id, bank_name, account_type, account_number, payout_email"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    props: {
      user: { id: user.id, email: user.email || null },
      bank: bank || null,
    },
  };
}

export default function Bancos({ user, bank }) {
  // ---- form state (precargado desde SSR) ----
  const [holderName, setHolderName] = useState(bank?.holder_name || "");
  const [taxId, setTaxId] = useState(bank?.tax_id || "");
  const [bankName, setBankName] = useState(bank?.bank_name || "");
  const [accountType, setAccountType] = useState(bank?.account_type || "corriente");
  const [accountNumber, setAccountNumber] = useState(bank?.account_number || "");
  const [payoutEmail, setPayoutEmail] = useState(bank?.payout_email || "");

  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ---- proveedores ----
  const [mpConnected, setMpConnected] = useState(false);
  const [mpStatus, setMpStatus] = useState(null);
  const [checkingMp, setCheckingMp] = useState(true);

  // Flow (placeholder hasta integrar)
  const flowConnected = true;

  // Link para iniciar OAuth MP con parámetros útiles
  const mpConnectHref = useMemo(() => {
    const base = "/api/mp/oauth/start";
    const params = new URLSearchParams();
    if (user?.email) params.set("email", user.email);
    if (user?.id) params.set("uid", user.id);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [user]);

  // Estado de conexión a MP (usa uid explícito; evita depender de cookies)
  useEffect(() => {
    (async () => {
      setCheckingMp(true);
      try {
        const res = await fetch(`/api/mp/status?uid=${encodeURIComponent(user.id)}`, {
          headers: { "Cache-Control": "no-store" },
        });
        const j = await res.json();
        setMpConnected(!!j?.connected);
        setMpStatus(j || null);
      } catch {
        setMpConnected(false);
        setMpStatus(null);
      } finally {
        setCheckingMp(false);
      }
    })();
  }, [user?.id]);

  // Guardar datos bancarios
  const onSave = async (e) => {
    e?.preventDefault?.();
    setErrorMsg("");
    setSavedOk(false);

    if (!user?.id) {
      setErrorMsg("Debes iniciar sesión.");
      return;
    }
    if (!holderName.trim()) return setErrorMsg("Ingresa el nombre del titular.");
    if (!payoutEmail.trim())
      return setErrorMsg("Ingresa el email de liquidaciones.");

    setSaving(true);
    try {
      const supabase = supabaseBrowser();
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
      setTimeout(() => setSavedOk(false), 1800);
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
              <p className={styles.sub}>
                Configura tus datos bancarios y conecta proveedores de pago.
              </p>
            </div>
          </header>

          <div className={styles.grid}>
            {/* Datos bancarios */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Datos bancarios</h2>
              <p className={styles.cardSub}>Se usarán para tus retiros.</p>

              <form onSubmit={onSave}>
                <label className="label">Titular</label>
                <input
                  className="input"
                  placeholder="Nombre del titular"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                />

                <label className="label" style={{ marginTop: 10 }}>
                  ID fiscal
                </label>
                <input
                  className="input"
                  placeholder="RUT / DNI / CUIT"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                />

                <label className="label" style={{ marginTop: 10 }}>
                  Banco
                </label>
                <input
                  className="input"
                  placeholder="Nombre de banco"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />

                <label className="label" style={{ marginTop: 10 }}>
                  Tipo de cuenta
                </label>
                <select
                  className="input"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                >
                  <option value="corriente">Cuenta Corriente</option>
                  <option value="vista">Cuenta Vista</option>
                  <option value="ahorro">Cuenta de Ahorro</option>
                </select>

                <label className="label" style={{ marginTop: 10 }}>
                  Número de cuenta
                </label>
                <input
                  className="input"
                  placeholder="0000 0000 0000"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />

                <label className="label" style={{ marginTop: 10 }}>
                  Email para liquidaciones
                </label>
                <input
                  className="input"
                  type="email"
                  placeholder="tucorreo@dominio.com"
                  value={payoutEmail}
                  onChange={(e) => setPayoutEmail(e.target.value)}
                />

                {errorMsg ? (
                  <p style={{ color: "#b91c1c", marginTop: 10 }}>{errorMsg}</p>
                ) : null}
                {savedOk ? (
                  <p style={{ color: "#065f46", marginTop: 10 }}>
                    Guardado correctamente.
                  </p>
                ) : null}

                <div className={styles.actions}>
                  <button className="btn btn-primary" disabled={saving}>
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      // Si prefieres: volver a cargar desde BD
                      setHolderName(bank?.holder_name || "");
                      setTaxId(bank?.tax_id || "");
                      setBankName(bank?.bank_name || "");
                      setAccountType(bank?.account_type || "corriente");
                      setAccountNumber(bank?.account_number || "");
                      setPayoutEmail(bank?.payout_email || "");
                      setErrorMsg("");
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </section>

            {/* Integraciones de pago */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Proveedores de pago</h2>
              <p className={styles.cardSub}>
                Conecta tu cuenta para recibir pagos automáticamente.
              </p>

              <div className={styles.providers}>
                {/* Mercado Pago */}
                <div className={styles.providerCard}>
                  <div className={styles.providerHead}>
                    <div className={styles.providerInfo}>
                      <div className={styles.providerLogo}>MP</div>
                      <div>
                        <div className={styles.providerName}>Mercado Pago</div>
                        <div className={styles.providerDesc}>
                          Pagos rápidos en CLP.
                        </div>
                      </div>
                    </div>
                    <span
                      className={styles.status}
                      data-state={mpConnected ? "ok" : "off"}
                      title={
                        checkingMp
                          ? "Verificando…"
                          : mpConnected
                          ? "Conectado"
                          : mpStatus?.reason || "No conectado"
                      }
                    >
                      {checkingMp ? "Verificando…" : mpConnected ? "Conectado" : "No conectado"}
                    </span>
                  </div>

                  <div className={styles.providerActions}>
                    {mpConnected ? (
                      <>
                        <a className={styles.btnManage} href="/panel/mercado-pago">
                          Gestionar
                        </a>
                        <button className={styles.btnDanger} disabled>
                          Desconectar
                        </button>
                      </>
                    ) : (
                      <a className={styles.btnConnect} href={mpConnectHref}>
                        Conectar
                      </a>
                    )}
                  </div>
                </div>

                {/* Flow (placeholder de momento) */}
                <div className={styles.providerCard}>
                  <div className={styles.providerHead}>
                    <div className={styles.providerInfo}>
                      <div className={styles.providerLogo}>F</div>
                      <div>
                        <div className={styles.providerName}>Flow</div>
                        <div className={styles.providerDesc}>
                          Pagos locales y link de pago.
                        </div>
                      </div>
                    </div>
                    <span
                      className={styles.status}
                      data-state={flowConnected ? "ok" : "off"}
                    >
                      {flowConnected ? "Conectado" : "No conectado"}
                    </span>
                  </div>

                  <div className={styles.providerActions}>
                    {flowConnected ? (
                      <>
                        <a className={styles.btnManage} href="/panel/flow">
                          Gestionar
                        </a>
                        <button className={styles.btnDanger} disabled>
                          Desconectar
                        </button>
                      </>
                    ) : (
                      <a className={styles.btnConnect} href="/panel/flow">
                        Conectar
                      </a>
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

