// src/pages/admin/index.jsx
// Puerta admin (A1) + dos métricas financieras (A2). La página nunca
// decide autoridad por sí sola: siempre pregunta a /api/admin/me y refleja
// lo que responde. Las métricas solo se piden después de tener acceso
// confirmado, y solo se muestran los dos números pedidos — nada de pagos,
// usuarios ni Country Control todavía.
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";

function clp(cents) {
  return Math.round(Number(cents || 0) / 100).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

export default function AdminHome() {
  const router = useRouter();
  const [state, setState] = useState("checking"); // checking | denied | ok
  const [email, setEmail] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [metricsErr, setMetricsErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        router.replace(`/login?next=${encodeURIComponent("/admin")}`);
        return;
      }

      try {
        const r = await fetch("/api/admin/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json().catch(() => ({ ok: false }));
        if (r.ok && j?.ok && j?.admin) {
          setEmail(j.email || null);
          setState("ok");

          try {
            const mr = await fetch("/api/admin/metrics", {
              headers: { Authorization: `Bearer ${token}` },
            });
            const mj = await mr.json().catch(() => ({ ok: false }));
            if (mr.ok && mj?.ok) setMetrics(mj);
            else setMetricsErr("No se pudieron cargar las métricas.");
          } catch (e) {
            console.error("[admin] error cargando métricas", e);
            setMetricsErr("No se pudieron cargar las métricas.");
          }
        } else {
          setState("denied");
        }
      } catch (e) {
        console.error("[admin] error validando autoridad", e);
        setState("denied");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Head><title>Admin — Rifex</title></Head>
      <main style={{ padding: "60px 20px", textAlign: "center" }}>
        {state === "checking" && <p>Verificando acceso…</p>}

        {state === "denied" && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#b91c1c" }}>Acceso denegado</h1>
            <p style={{ color: "#6B7280", marginTop: 8 }}>
              Tu cuenta no tiene autorización para administrar Rifex.
            </p>
          </div>
        )}

        {state === "ok" && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>Panel Admin</h1>
            <p style={{ color: "#6B7280", marginTop: 8 }}>
              Acceso confirmado{email ? ` — ${email}` : ""}.
            </p>

            {metricsErr && <p style={{ color: "#b91c1c", marginTop: 16 }}>{metricsErr}</p>}

            {metrics && (
              <div
                style={{
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  maxWidth: 560,
                  margin: "24px auto 0",
                  textAlign: "left",
                }}
              >
                <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>Total recaudado en Chile</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{clp(metrics.raised_cl_cents)}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    Rifas {clp(metrics.breakdown.raffles.raised_cents)} · Campañas {clp(metrics.breakdown.campaigns.raised_cents)}
                  </div>
                </div>

                <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>Ingresos Rifex en Chile</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--trebol, #18A957)" }}>
                    {clp(metrics.rifex_revenue_cl_cents)}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    Rifas {clp(metrics.breakdown.raffles.fee_cents)} · Campañas {clp(metrics.breakdown.campaigns.fee_cents)}
                  </div>
                </div>
              </div>
            )}

            {metrics &&
              (metrics.data_gaps.raffles_approved_without_fee > 0 ||
                metrics.data_gaps.campaigns_approved_without_fee > 0) && (
                <div
                  style={{
                    maxWidth: 560, margin: "16px auto 0", textAlign: "left",
                    background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E",
                    borderRadius: 12, padding: "12px 16px", fontSize: 13,
                  }}
                >
                  Ingresos Rifex incompleto: {metrics.data_gaps.raffles_approved_without_fee} pago(s) de rifa y{" "}
                  {metrics.data_gaps.campaigns_approved_without_fee} aporte(s) de campaña aprobados no tienen
                  comisión registrada — no se estimaron, quedaron fuera de la suma.
                </div>
              )}
          </div>
        )}
      </main>
    </>
  );
}

AdminHome.getLayout = (page) => <Layout>{page}</Layout>;
