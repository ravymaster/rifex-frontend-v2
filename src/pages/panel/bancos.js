// src/pages/panel/bancos.js
// ONBOARDING+BANCOS/MP: este archivo concentra TODA la experiencia
// específica de proveedor de pago -- el onboarding (/registro/continuar)
// ya no menciona Mercado Pago en absoluto, solo enlaza acá. La tarjeta
// de Mercado Pago distingue explícitamente "conectado" de "validado"
// (mp_identity_match==='matched' es el único estado que realmente
// habilita creator eligibility -- ver src/lib/trustIdentityGate.js,
// nunca modificado por este cambio).
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import styles from "@/styles/bancos.module.css";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { sanitizeNextPath } from "@/lib/countryPolicy";

// Enlace oficial de alta de cuenta Mercado Pago Chile (verificado en
// vivo contra mercadopago.cl, no inventado) -- deliberadamente
// DISTINTO del botón "Conectar" (OAuth): crear cuenta y conectar una
// cuenta ya existente son dos acciones distintas.
const MP_SIGNUP_URL = "https://www.mercadopago.cl/hub/registration/landing";

// Clave de sessionStorage usada para sobrevivir el viaje redondo a
// Mercado Pago (OAuth): el usuario sale de Rifex por completo y vuelve
// por /api/mp/oauth/callback, que siempre redirige a
// /panel/bancos?mp=connected -- sin `next` en la URL. Guardarlo acá
// (nunca en el backend, nunca en una tabla nueva) es la forma más
// simple de recordar a dónde volver sin tocar el flujo de OAuth.
const BANCOS_NEXT_STORAGE_KEY = "rifex_bancos_next";

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
  const [mpReason, setMpReason] = useState(null);
  const [mpIdentityMatch, setMpIdentityMatch] = useState(null);
  const [checkingMp, setCheckingMp] = useState(true);
  const [mpBusy, setMpBusy] = useState(false);

  // ------- Verificar cuenta (revalidación de conexión existente) -------
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null); // { status, reason } | null

  // ------- next preservado a través del onboarding + ida/vuelta a MP -------
  const [pendingNext, setPendingNext] = useState(null);
  const [creatorEligible, setCreatorEligible] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const rawNext = router.query?.next;
    if (rawNext) {
      const safe = sanitizeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext, "");
      if (safe) {
        try {
          sessionStorage.setItem(BANCOS_NEXT_STORAGE_KEY, safe);
        } catch {
          // sessionStorage puede fallar (modo privado estricto, cuota) --
          // degradamos a "sin next recordado", nunca rompe la página.
        }
        setPendingNext(safe);
        return;
      }
    }
    try {
      const stored = sessionStorage.getItem(BANCOS_NEXT_STORAGE_KEY);
      if (stored) setPendingNext(stored);
    } catch {
      // idem
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query?.next]);

  async function refreshCreatorEligibility() {
    try {
      const { data: sres } = await supabase.auth.getSession();
      const token = sres?.session?.access_token;
      if (!token) return;
      const r = await fetch("/api/onboarding/trust/status", { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      setCreatorEligible(!!(r.ok && j?.ok && j.onboarding_complete_for_creators));
    } catch {
      setCreatorEligible(false);
    }
  }

  function continueToNext() {
    if (!pendingNext) return;
    try {
      sessionStorage.removeItem(BANCOS_NEXT_STORAGE_KEY);
    } catch {
      // idem
    }
    router.push(pendingNext);
  }

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
      setMpReason(j?.reason || null);
      setMpIdentityMatch(j?.identity_match || null);
    } catch {
      setMpConnected(false);
      setMpReason(null);
      setMpIdentityMatch(null);
    }
  }

  async function runVerifyAccount() {
    if (verifyBusy) return; // guarda contra doble click -- la request en sí también es idempotente del lado servidor
    setVerifyBusy(true);
    setVerifyResult(null);
    try {
      const { data: sres } = await supabase.auth.getSession();
      const token = sres?.session?.access_token;
      if (!token) throw new Error("missing_auth");
      const r = await fetch("/api/mp/revalidate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (!r.ok || !j?.ok) {
        setVerifyResult({ status: "unavailable" });
      } else {
        setVerifyResult({ status: j.status, reason: j.reason });
      }
      await refreshMpStatus();
      await refreshCreatorEligibility();
    } catch {
      setVerifyResult({ status: "unavailable" });
    } finally {
      setVerifyBusy(false);
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
        await refreshCreatorEligibility();
      } finally {
        setCheckingMp(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

          {pendingNext && creatorEligible && (
            <div
              style={{
                background: "#DCFCE7", border: "1px solid #BBF7D0", color: "#166534",
                borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontWeight: 700,
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}
            >
              <span>Tu cuenta ya está lista para crear iniciativas.</span>
              <button
                type="button"
                className={styles.btnConnect}
                onClick={continueToNext}
                style={{ whiteSpace: "nowrap" }}
              >
                Continuar
              </button>
            </div>
          )}

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Proveedores de pago</h2>
              <p className={styles.cardSub}>
                Conecta tu cuenta para recibir pagos automáticamente.
              </p>

              <div className={styles.providers}>
                {/* ---- Mercado Pago ---- */}
                {(() => {
                  const mpNeedsReconnect = !mpConnected && (mpReason === "revoked" || mpReason === "token_expired");
                  const mpPendingValidation =
                    mpConnected &&
                    (!mpIdentityMatch ||
                      mpIdentityMatch === "not_connected" ||
                      mpIdentityMatch === "checking" ||
                      mpIdentityMatch === "disconnected");
                  const mpValidated = mpConnected && mpIdentityMatch === "matched";
                  const mpMismatch = mpConnected && (mpIdentityMatch === "mismatch" || mpIdentityMatch === "needs_review");
                  const mpUnavailable = mpConnected && mpIdentityMatch === "unavailable";

                  const statusLabel = mpConnected ? (mpValidated ? "Validada" : "Conectada") : mpNeedsReconnect ? "Reconexión requerida" : "No conectada";
                  const statusState = mpValidated ? "ok" : mpConnected ? "pending" : "off";

                  return (
                    <div className={styles.providerCard}>
                      <div className={styles.providerHead}>
                        <div className={styles.providerInfo}>
                          <div className={styles.providerLogo}>MP</div>
                          <div>
                            <div className={styles.providerName}>Mercado Pago</div>
                            <div className={styles.providerDesc}>Pagos rápidos en CLP.</div>
                          </div>
                        </div>
                        <span className={styles.status} data-state={statusState} title={checkingMp ? "Verificando…" : ""}>
                          {statusLabel}
                        </span>
                      </div>

                      {/* Texto humano por estado -- nunca solo color, siempre texto explícito. */}
                      {!mpConnected && !mpNeedsReconnect && (
                        <p style={{ color: "var(--gris)", marginTop: 10 }}>No tienes una cuenta de Mercado Pago conectada.</p>
                      )}
                      {mpNeedsReconnect && (
                        <p style={{ color: "#92400E", fontWeight: 600, marginTop: 10 }}>Necesitamos que vuelvas a conectar tu cuenta.</p>
                      )}
                      {mpPendingValidation && (
                        <p style={{ color: "#92400E", fontWeight: 600, marginTop: 10 }}>
                          Tu cuenta está conectada, pero necesitamos validar su titularidad.
                        </p>
                      )}
                      {mpValidated && (
                        <p style={{ color: "#166534", fontWeight: 700, marginTop: 10 }}>✓ Cuenta de Mercado Pago validada.</p>
                      )}
                      {mpMismatch && (
                        <p style={{ color: "#991b1b", fontWeight: 700, marginTop: 10 }}>
                          No pudimos validar que la cuenta receptora corresponda con la identidad registrada en Rifex.
                        </p>
                      )}
                      {mpUnavailable && (
                        <p style={{ color: "#92400E", fontWeight: 600, marginTop: 10 }}>
                          No pudimos verificar tu cuenta en este momento. Inténtalo nuevamente.
                        </p>
                      )}

                      {verifyResult && (
                        <p style={{ color: verifyResult.status === "matched" ? "#166534" : verifyResult.status === "mismatch" || verifyResult.status === "needs_review" ? "#991b1b" : "#92400E", fontWeight: 600, marginTop: 6, fontSize: 13 }}>
                          {verifyResult.status === "matched" && "✓ Cuenta de Mercado Pago validada."}
                          {(verifyResult.status === "mismatch" || verifyResult.status === "needs_review") && "No pudimos validar la titularidad de esta cuenta."}
                          {verifyResult.status === "unavailable" && "No pudimos verificar la cuenta en este momento."}
                          {verifyResult.status === "reconnect_required" && "Necesitamos que vuelvas a conectar tu cuenta."}
                        </p>
                      )}

                      <div className={styles.providerActions} style={{ gap: 8, marginTop: 10 }}>
                        {/* Conectar: solo cuando no hay conexión utilizable (nunca conectada, o requiere reconexión). */}
                        {(!mpConnected) && (
                          <a
                            className={styles.btnConnect}
                            href={mpConnectHref}
                            aria-disabled={mpBusy}
                            onClick={(e) => {
                              if (mpBusy) e.preventDefault();
                            }}
                          >
                            Conectar
                          </a>
                        )}

                        {/* Verificar cuenta: reutiliza la conexión existente, NUNCA desconecta ni vuelve a OAuth. */}
                        {(mpPendingValidation || mpMismatch || mpUnavailable) && (
                          <button type="button" className={styles.btnConnect} disabled={verifyBusy} onClick={runVerifyAccount}>
                            {verifyBusy ? "Verificando…" : "Verificar cuenta"}
                          </button>
                        )}

                        {/* Desconectar: habilitado solo si hay algo conectado. */}
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

                              setVerifyResult(null);
                              await refreshMpStatus();
                              await refreshCreatorEligibility();
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

                      {!mpConnected && (
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--borde, #E5E7EB)" }}>
                          <p style={{ fontWeight: 700, margin: "0 0 4px", fontSize: 14 }}>¿No tienes una cuenta de Mercado Pago?</p>
                          <p style={{ color: "var(--gris)", margin: "0 0 8px", fontSize: 13 }}>
                            Te llevaremos a Mercado Pago para crear tu cuenta. Luego podrás conectarla a Rifex y
                            recibir tus pagos directamente en ella.
                          </p>
                          <a href={MP_SIGNUP_URL} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>
                            Crear cuenta en Mercado Pago →
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ---- Stripe -- solo catálogo visual, sin integración real ---- */}
                <div className={styles.providerCard}>
                  <div className={styles.providerHead}>
                    <div className={styles.providerInfo}>
                      <div className={styles.providerLogo}>ST</div>
                      <div>
                        <div className={styles.providerName}>Stripe</div>
                        <div className={styles.providerDesc}>No disponible en tu país.</div>
                      </div>
                    </div>
                    <span className={styles.status} data-state="off">No disponible</span>
                  </div>
                  <div className={styles.providerActions} style={{ gap: 8, marginTop: 10 }}>
                    <button type="button" className={styles.btnConnect} disabled aria-disabled="true">
                      Próximamente
                    </button>
                  </div>
                </div>
              </div>
            </section>
        </div>
      </section>
    </>
  );
}

Bancos.getLayout = (page) => <Layout>{page}</Layout>;




