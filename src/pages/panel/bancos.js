// src/pages/panel/bancos.js
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import styles from "@/styles/bancos.module.css";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import { getSupabaseServer } from "@/lib/supabaseServer";

/**
 * SSR: no redirige si no hay sesión (evita loops).
 * Trae el usuario y, si existe, su bank_account.
 */
export async function getServerSideProps(ctx) {
  const s = getSupabaseServer(ctx.req, ctx.res);

  let user = null;
  try {
    const { data } = await s.auth.getUser();
    user = data?.user || null;
  } catch (_) {
    user = null;
  }

  let bank = null;
  if (user?.id) {
    const { data: row } = await s
      .from("bank_accounts")
      .select(
        "holder_name, tax_id, bank_name, account_type, account_number, payout_email"
      )
      .eq("user_id", user.id)
      .maybeSingle();
    bank = row || null;
  }

  return {
    props: {
      ssrUser: user
        ? {
            id: user.id,
            email: user.email || null,
          }
        : null,
      ssrBank: bank || null,
    },
  };
}

export default function Bancos({ ssrUser, ssrBank }) {
  // ------- auth state (hidrata desde SSR y revalida en CSR) -------
  const [user, setUser] = useState(ssrUser);
  const [loadingUser, setLoadingUser] = useState(!ssrUser);

  useEffect(() => {
    if (ssrUser) return; // ya lo tenemos
    (async () => {
      setLoadingUser(true);
      try {
        const { data } = await supabase.auth.getUser();
        setUser(data?.user ? { id: data.user.id, email: data.user.email } : null);
      } finally {
        setLoadingUser(false);
      }
    })();
  }, [ssrUser]);

  // ------- form state -------
  const [holderName, setHolderName] = useState(ssrBank?.holder_name || "");
  const [taxId, setTaxId] = useState(ssrBank?.tax_id || "");
  const [bankName, setBankName] = useState(ssrBank?.bank_name || "");
  const [accountType, setAccountType] = useState(
    ssrBank?.account_type || "corriente"
  );
  const [accountNumber, setAccountNumber] = useState(
    ssrBank?.account_number || ""
  );
  const [payoutEmail, setPayoutEmail] = useState(
    ssrBank?.payout_email || (ssrUser?.email || "")
  );

  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ------- MP status -------
  const [mpConnected, setMpConnected] = useState(false);
  const [checkingMp, setCheckingMp] = useState(true);

  const mpConnectHref = useMemo(() => {
    const base = "/api/mp/oauth/start";
    const params = new URLSearchParams();
    if (user?.email) params.set("email", user.email);
    if (user?.id) params.set("uid", user.id);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [user]);

  useEffect(() => {
    (async () => {
      setCheckingMp(true);
      try {
        if (!user?.id) {
          setMpConnected(false);
          return;
        }
        const r = await fetch(`/api/mp/status?uid=${encodeURIComponent(user.id)}`);
        const j = await r.json();
        setMpConnected(!!j?.connected);
      } catch {
        setMpConnected(false);
      } finally {
        setCheckingMp(false);
      }
    })();
  }, [user?.id]);

  // ------- Save -------
  async function onSave(e) {
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

      // upsert con RLS (user solo puede tocar su fila)
      const { error } = await supabase
        .from("bank_accounts")
        .upsert(row, { onConflict: "user_id" });

      if (error) {
        // Mensaje útil cuando hay política RLS
        if (
          `${error.message}`.toLowerCase().includes("row-level security") ||
          `${error.message}`.toLowerCase().includes("rls")
        ) {
          throw new Error(
            "No tienes permisos para guardar (RLS). Revisa las políticas de 'bank_accounts' para el usuario actual."
          );
        }
        throw error;
      }

      setSavedOk(true);
    } catch (err) {
      setErrorMsg(err?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
      setTimeout(() => setSavedOk(false), 2000);
    }
  }

  const flowConnected = true;

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

              {loadingUser ? (
                <p>Cargando…</p>
              ) : !user ? (
                <p>Debes iniciar sesión para gestionar tus datos.</p>
              ) : (
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
                      onClick={() => window.location.reload()}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
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
                      title={checkingMp ? "Verificando…" : ""}
                    >
                      {mpConnected ? "Conectado" : "No conectado"}
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

                {/* Flow */}
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



