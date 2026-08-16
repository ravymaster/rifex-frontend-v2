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

  // ------- form state (NO TOCAR) -------
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
  const [mpBusy, setMpBusy] = useState(false);

  const mpConnectHref = useMemo(() => {
    const base = "/api/mp/oauth/start";
    const params = new URLSearchParams();
    if (user?.email) params.set("email", user.email);
    if (user?.id) params.set("uid", user.id);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [user]);

  async function refreshMpStatus() {
    try {
      const { data: sres } = await supabase.auth.getSession();
      const token = sres?.session?.access_token;
      if (!token) {
        setMpConnected(false);
        return;
      }
      const r = await fetch("/api/mp/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      setMpConnected(!!j?.connected);
    } catch {
      setMpConnected(false);
    }
  }

  useEffect(() => {
    (async () => {
      setCheckingMp(true);
      try {
        if (!user?.id) {
          setMpConnected(false);
          return;
        }
        await refreshMpStatus();
      } finally {
        setCheckingMp(false);
      }
    })();
  }, [user?.id]);

  // ------- Ganancias -------
  const [earnings, setEarnings] = useState(null);
  const [loadingEarnings, setLoadingEarnings] = useState(true);
  const clp = (cents) => Math.round((cents || 0) / 100).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

  useEffect(() => {
    (async () => {
      if (!user?.id) {
        setLoadingEarnings(false);
        return;
      }
      setLoadingEarnings(true);
      try {
        const { data: sres } = await supabase.auth.getSession();
        const token = sres?.session?.access_token;
        if (!token) return;
        const r = await fetch("/api/panel/earnings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json();
        if (j.ok) setEarnings(j);
      } catch {
        setEarnings(null);
      } finally {
        setLoadingEarnings(false);
      }
    })();
  }, [user?.id]);

  // ------- Save (NO TOCAR) -------
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

          <section className={styles.card} style={{ marginBottom: 16 }}>
            <h2 className={styles.cardTitle}>Ganancias</h2>
            <p className={styles.cardSub}>Lo que has vendido, tu comisión y lo que te queda neto.</p>

            {loadingEarnings ? (
              <p>Cargando…</p>
            ) : !earnings || earnings.totals.sales_count === 0 ? (
              <p style={{ color: "var(--gris)" }}>Todavía no tienes ventas aprobadas.</p>
            ) : (
              <>
                <div className={styles.statsGrid}>
                  <div className={styles.statTile}>
                    <div className={styles.statLabel}>Vendido (bruto)</div>
                    <div className={styles.statValue}>{clp(earnings.totals.gross_cents)}</div>
                  </div>
                  <div className={styles.statTile}>
                    <div className={styles.statLabel}>Comisión Rifex</div>
                    <div className={styles.statValue}>{clp(earnings.totals.fee_cents)}</div>
                  </div>
                  <div className={styles.statTile}>
                    <div className={styles.statLabel}>Neto recibido</div>
                    <div className={styles.statValue} data-tone="accent">{clp(earnings.totals.net_cents)}</div>
                  </div>
                </div>

                {earnings.recent?.length > 0 && (
                  <div className={styles.earningsList}>
                    {earnings.recent.map((s, i) => (
                      <div key={i} className={styles.earningsRow}>
                        <div>
                          <div className={styles.earningsRowTitle}>{s.raffle_title}</div>
                          <div className={styles.earningsRowSub}>
                            N.º {s.numbers.join(", ")} · {new Date(s.created_at).toLocaleDateString("es-CL")}
                          </div>
                        </div>
                        <div className={styles.earningsRowNet}>+{clp(s.net_cents)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <div className={styles.grid}>
            {/* Datos bancarios (NO TOCAR) */}
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
                        <div className={styles.providerDesc}>Pagos rápidos en CLP.</div>
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

                  <div className={styles.providerActions} style={{ gap: 8 }}>
                    {/* Botón Conectar: habilitado SOLO si NO está conectado */}
                    <a
                      className={styles.btnConnect}
                      href={mpConnected ? undefined : mpConnectHref}
                      aria-disabled={mpConnected || mpBusy}
                      onClick={(e) => {
                        if (mpConnected || mpBusy) e.preventDefault();
                      }}
                    >
                      Conectar
                    </a>

                    {/* Botón Desconectar: habilitado SOLO si SÍ está conectado */}
                    <button
                      className={styles.btnDanger}
                      disabled={!mpConnected || mpBusy}
                      onClick={async () => {
                        if (!user?.id) return alert("Debes iniciar sesión.");
                        if (!confirm("¿Seguro que deseas desconectar tu cuenta de Mercado Pago?")) return;
                        try {
                          setMpBusy(true);
                          const { data: sres } = await supabase.auth.getSession();
                          const token = sres?.session?.access_token;
                          if (!token) throw new Error("Debes iniciar sesión.");
                          const r = await fetch("/api/mp/disconnect", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${token}`,
                            },
                          });
                          const j = await r.json();
                          if (!j.ok) throw new Error(j.error || "No se pudo desconectar");

                          await refreshMpStatus();
                          alert("Cuenta de Mercado Pago desconectada. Puedes volver a conectar cuando quieras.");
                        } catch (err) {
                          alert(err.message || "Error al desconectar.");
                        } finally {
                          setMpBusy(false);
                        }
                      }}
                    >
                      {mpBusy ? "Desconectando…" : "Desconectar"}
                    </button>
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




