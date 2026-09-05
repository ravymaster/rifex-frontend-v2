// src/pages/admin/cumplimiento/index.jsx
// CUMPLIMIENTO-5 — listado de casos de cumplimiento dentro del /admin
// existente. MISMA autorización que /admin (adminAuth.resolveAdmin vía
// /api/admin/cumplimiento) -- esta página nunca decide autoridad por sí
// sola, solo refleja lo que el endpoint responde. Subruta del panel
// admin ya existente, no un sistema administrativo separado.
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import { STATUS_LABEL, ADMIN_REVIEW_STATUS_LABEL, ESCALATION_REASON_LABEL, fmtDate, ageInDays } from "@/lib/adminFulfillmentLabels";

const card = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16 };
const grid = { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" };
const section = { maxWidth: 1080, margin: "28px auto 0", textAlign: "left", padding: "0 16px" };
const sectionTitle = { fontSize: 16, fontWeight: 800, marginBottom: 12 };
const tableWrap = { overflowX: "auto", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16 };
const th = { textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#6B7280", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #F3F4F6" };

function Kpi({ label, value }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export default function AdminCumplimientoList() {
  const router = useRouter();
  const [state, setState] = useState("checking");
  const [data, setData] = useState(null);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    (async () => {
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData?.session?.access_token;
      if (!token) {
        router.replace(`/login?next=${encodeURIComponent("/admin/cumplimiento")}`);
        return;
      }
      try {
        const res = await fetch("/api/admin/cumplimiento", { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => ({ ok: false }));
        if (!(res.ok && json?.ok)) {
          setState(res.status === 401 || res.status === 403 ? "denied" : "error");
          return;
        }
        setData(json);
        setState("ok");
      } catch (e) {
        console.error("[admin/cumplimiento] error", e);
        setErrMsg("No se pudo cargar el listado.");
        setState("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Head><title>Cumplimiento — Admin Rifex</title></Head>
      <main style={{ padding: "40px 16px 80px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 16px" }}>
          <Link href="/admin" style={{ fontSize: 13, color: "#6B7280" }}>← Volver al panel admin</Link>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>Cumplimiento</h1>
          <p style={{ color: "#6B7280", marginTop: 4 }}>
            Casos de cumplimiento de entrega detectados automáticamente por el sistema. Esta mesa sirve para observar
            y revisar antecedentes — no determina fraude ni culpabilidad.
          </p>
        </div>

        {state === "checking" && <p style={{ textAlign: "center", marginTop: 40 }}>Verificando acceso…</p>}
        {state === "denied" && (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <h2 style={{ color: "#b91c1c" }}>Acceso denegado</h2>
            <p style={{ color: "#6B7280" }}>Tu cuenta no tiene autorización para administrar Rifex.</p>
          </div>
        )}
        {state === "error" && (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <p style={{ color: "#b91c1c" }}>{errMsg || "No se pudo cargar el listado."}</p>
          </div>
        )}

        {state === "ok" && data && (
          <>
            <section style={section}>
              <div style={grid}>
                <Kpi label="Requieren revisión" value={data.summary.requires_review} />
                <Kpi label="Entregas pendientes" value={data.summary.delivery_pending} />
                <Kpi label="Cumplimientos confirmados" value={data.summary.confirmed} />
                <Kpi label="Sin confirmación" value={data.summary.unconfirmed} />
              </div>
            </section>

            <section style={{ ...section, marginBottom: 40 }}>
              <div style={sectionTitle}>Casos ({data.cases.length})</div>
              <div style={tableWrap}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Rifa</th>
                      <th style={th}>Ganador</th>
                      <th style={th}>Estado</th>
                      <th style={th}>Motivo de revisión</th>
                      <th style={th}>Revisión admin</th>
                      <th style={th}>Ganador determinado</th>
                      <th style={th}>Antigüedad</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cases.length === 0 && (
                      <tr><td style={td} colSpan={8}>No hay casos de cumplimiento registrados todavía.</td></tr>
                    )}
                    {data.cases.map((c) => (
                      <tr key={c.raffle_id}>
                        <td style={td}>{c.raffle_title}</td>
                        <td style={td}>{c.winner_buyer_email || "—"}</td>
                        <td style={td}>{STATUS_LABEL[c.status] || c.status}</td>
                        <td style={{ ...td, maxWidth: 260, whiteSpace: "normal" }}>
                          {c.escalation_reason ? ESCALATION_REASON_LABEL[c.escalation_reason] || c.escalation_reason : "—"}
                        </td>
                        <td style={td}>{c.escalated_at ? (ADMIN_REVIEW_STATUS_LABEL[c.admin_review_status] ?? ADMIN_REVIEW_STATUS_LABEL[null]) : "—"}</td>
                        <td style={td}>{fmtDate(c.winner_determined_at)}</td>
                        <td style={td}>{ageInDays(c.winner_determined_at)} días</td>
                        <td style={td}>
                          <Link href={`/admin/cumplimiento/${c.raffle_id}`} style={{ fontWeight: 700 }}>Ver caso</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

AdminCumplimientoList.getLayout = (page) => <Layout noindex>{page}</Layout>;
