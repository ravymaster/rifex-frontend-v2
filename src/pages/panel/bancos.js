// src/pages/panel/bancos.js
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import styles from "@/styles/bancos.module.css";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import { getSupabaseServer } from "@/lib/supabaseServer";

/**
 * SSR: no redirige si no hay sesión (evita loops).
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

  return {
    props: {
      ssrUser: user
        ? {
            id: user.id,
            email: user.email || null,
          }
        : null,
    },
  };
}

// Country Gate (G2): únicos dos valores de ?mp= que este sprint necesita
// mostrar. El resto de los valores históricos (?mp=connected, error, etc.)
// queda tal como estaba — fuera de alcance, no se tocan acá.
const COUNTRY_GATE_MP_MESSAGES = {
  needs_onboarding: "Antes de conectar Mercado Pago, dinos en qué país operarás con Rifex.",
  country_not_available:
    "Rifex todavía no está disponible para crear y recaudar en tu país. Estamos preparando su lanzamiento.",
};

export default function Bancos({ ssrUser }) {
  const router = useRouter();
  const countryGateMsg = COUNTRY_GATE_MP_MESSAGES[router.query?.mp] || null;

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

  // ------- MP status -------
  const [mpConnected, setMpConnected] = useState(false);
  const [mpIdentityMatch, setMpIdentityMatch] = useState(null);
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
      setMpIdentityMatch(j?.identity_match || null);
    } catch {
      setMpConnected(false);
      setMpIdentityMatch(null);
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
                Conecta tu cuenta de Mercado Pago y revisa tus ganancias.
              </p>
            </div>
          </header>

          {countryGateMsg && (
            <div
              style={{
                background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E",
                borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontWeight: 600,
              }}
            >
              {countryGateMsg}
            </div>
          )}

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

                {mpConnected && mpIdentityMatch === "matched" && (
                  <p style={{ color: "#166534", fontWeight: 700, marginTop: 10 }}>
                    ✅ Cuenta de Mercado Pago validada.
                  </p>
                )}
                {mpConnected && (mpIdentityMatch === "mismatch" || mpIdentityMatch === "needs_review") && (
                  <p style={{ color: "#991b1b", fontWeight: 700, marginTop: 10 }}>
                    No pudimos validar tu cuenta de Mercado Pago. Los datos del titular no coinciden con los
                    registrados en Rifex. Revisa tus datos o conecta una cuenta que te pertenezca.
                  </p>
                )}
                {mpConnected && mpIdentityMatch === "unavailable" && (
                  <p style={{ color: "#92400E", fontWeight: 600, marginTop: 10 }}>
                    No pudimos confirmar automáticamente la titularidad con Mercado Pago. Tu cuenta puede quedar
                    sujeta a una revisión adicional.
                  </p>
                )}
                {mpConnected && mpIdentityMatch === "checking" && (
                  <p style={{ color: "var(--gris)", marginTop: 10 }}>Validando tu cuenta de Mercado Pago…</p>
                )}
              </div>
            </section>
        </div>
      </section>
    </>
  );
}

Bancos.getLayout = (page) => <Layout>{page}</Layout>;




