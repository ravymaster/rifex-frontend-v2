// src/pages/admin/index.jsx
// Puerta admin (A1) + centro operativo read-only (A2 + A2-B). La página
// nunca decide autoridad por sí sola: siempre pregunta a /api/admin/me y
// refleja lo que responde. Todo lo demás es solo lectura — sin acciones
// destructivas, sin edición manual de estados, sin ejecutar C5R desde acá.
// CUMPLIMIENTO-5 agregó la sección "Cumplimiento" (resumen + enlace a
// /admin/cumplimiento) -- MISMO panel, MISMA autorización, sin rediseño.
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import { COUNTRY_CODES, COUNTRY_POLICY } from "@/lib/countryPolicy";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

function clp(cents) {
  if (cents == null) return "—";
  return Math.round(Number(cents || 0) / 100).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

const card = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16 };
const grid = { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" };
const section = { maxWidth: 960, margin: "28px auto 0", textAlign: "left", padding: "0 16px" };
const sectionTitle = { fontSize: 16, fontWeight: 800, marginBottom: 12 };
const tableWrap = { overflowX: "auto", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16 };
const th = { textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#6B7280", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #F3F4F6", whiteSpace: "nowrap" };
const warnBox = {
  background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E",
  borderRadius: 12, padding: "12px 16px", fontSize: 13, marginBottom: 12,
};
const okBox = {
  background: "#DCFCE7", border: "1px solid #BBF7D0", color: "#166534",
  borderRadius: 12, padding: "12px 16px", fontSize: 13,
};

function Kpi({ label, value, sub }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const STATUS_LABEL = { active: "Activa", closed: "Cerrada", deleted: "Eliminada", draft: "Borrador", finished: "Finalizada" };
const FLAG_LABEL = { on: "ON", off: "OFF", review: "REVIEW" };
const FLAG_COLOR = { on: "#166534", off: "#6B7280", review: "#92400E" };

export default function AdminHome() {
  const router = useRouter();
  const [state, setState] = useState("checking"); // checking | denied | ok
  const [email, setEmail] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [overview, setOverview] = useState(null);
  const [cumplimiento, setCumplimiento] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [accessToken, setAccessToken] = useState(null);

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [reconcileBusy, setReconcileBusy] = useState({});
  const [reconcileResult, setReconcileResult] = useState({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        router.replace(`/login?next=${encodeURIComponent("/admin")}`);
        return;
      }
      setAccessToken(token);

      try {
        const r = await fetch("/api/admin/me", { headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json().catch(() => ({ ok: false }));
        if (!(r.ok && j?.ok && j?.admin)) {
          setState("denied");
          return;
        }
        setEmail(j.email || null);
        setState("ok");

        const [mr, or_, cr] = await Promise.all([
          fetch("/api/admin/metrics", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/admin/overview", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/admin/cumplimiento", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const [mj, oj, cj] = await Promise.all([
          mr.json().catch(() => ({ ok: false })),
          or_.json().catch(() => ({ ok: false })),
          cr.json().catch(() => ({ ok: false })),
        ]);
        if (mr.ok && mj?.ok) setMetrics(mj);
        if (or_.ok && oj?.ok) setOverview(oj);
        if (cr.ok && cj?.ok) setCumplimiento(cj);
        if (!(mr.ok && mj?.ok) || !(or_.ok && oj?.ok)) setErrMsg("Algunas métricas no se pudieron cargar.");
      } catch (e) {
        console.error("[admin] error validando autoridad / cargando datos", e);
        setState("denied");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(e) {
    e?.preventDefault?.();
    const query = q.trim();
    if (query.length < 2) { setSearchErr("Escribe al menos 2 caracteres."); return; }
    setSearching(true);
    setSearchErr("");
    setSearchResults(null);
    try {
      const r = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (r.ok && j?.ok) setSearchResults(j);
      else setSearchErr(j?.error === "query_too_short" ? "Escribe al menos 2 caracteres." : "No se pudo buscar.");
    } catch (err) {
      console.error("[admin] search error", err);
      setSearchErr("No se pudo buscar.");
    } finally {
      setSearching(false);
    }
  }

  async function runReconcile(product, id) {
    setReconcileBusy((s) => ({ ...s, [id]: true }));
    try {
      const r = await fetch("/api/admin/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ product, id }),
      });
      const j = await r.json().catch(() => ({ ok: false }));
      setReconcileResult((s) => ({ ...s, [id]: j }));
    } catch (err) {
      console.error("[admin] reconcile error", err);
      setReconcileResult((s) => ({ ...s, [id]: { ok: false, error: "network_error" } }));
    } finally {
      setReconcileBusy((s) => ({ ...s, [id]: false }));
    }
  }

  const gapRaffles = metrics?.data_gaps?.raffles_approved_without_fee || 0;
  const gapCampaigns = metrics?.data_gaps?.campaigns_approved_without_fee || 0;
  const pendingStale = overview?.alerts?.pending_stale?.items || [];
  const reconcileErrors = overview?.alerts?.reconcile_errors?.items || [];
  const mpDisconnected = overview?.alerts?.mp_disconnected || 0;
  const hasAlerts = gapRaffles > 0 || gapCampaigns > 0 || pendingStale.length > 0 || reconcileErrors.length > 0 || mpDisconnected > 0;

  return (
    <>
      <Head><title>Admin — Rifex</title></Head>
      <main style={{ padding: "60px 16px 80px", textAlign: "center" }}>
        {state === "checking" && <p>Verificando acceso…</p>}

        {state === "denied" && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#b91c1c" }}>Acceso denegado</h1>
            <p style={{ color: "#6B7280", marginTop: 8 }}>Tu cuenta no tiene autorización para administrar Rifex.</p>
          </div>
        )}

        {state === "ok" && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>Panel Admin</h1>
            <p style={{ color: "#6B7280", marginTop: 8 }}>Acceso confirmado{email ? ` — ${email}` : ""}.</p>
            {errMsg && <p style={{ color: "#b91c1c", marginTop: 16 }}>{errMsg}</p>}

            {/* ---- Búsqueda operativa ---- */}
            <section style={section}>
              <div style={sectionTitle}>Búsqueda operativa</div>
              <form onSubmit={runSearch} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input"
                  placeholder="payment_id, ID de rifa/campaña/contribution/purchase, email o título"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  style={{ flex: 1, minWidth: 240, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--borde, #E5E7EB)" }}
                />
                <button className="btn" type="submit" disabled={searching} style={{ padding: "10px 16px", borderRadius: 10, fontWeight: 700 }}>
                  {searching ? "Buscando…" : "Buscar"}
                </button>
              </form>
              {searchErr && <p style={{ color: "#b91c1c", marginTop: 8, fontSize: 13 }}>{searchErr}</p>}

              {searchResults && (
                <div style={{ marginTop: 16 }}>
                  {searchResults.raffles.length === 0 && searchResults.campaigns.length === 0 && searchResults.payments.length === 0 && (
                    <p style={{ fontSize: 13, color: "#6B7280" }}>Sin resultados para "{searchResults.query}".</p>
                  )}

                  {searchResults.raffles.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Rifas</div>
                      <div style={tableWrap}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <tbody>
                            {searchResults.raffles.map((r) => (
                              <tr key={r.id}>
                                <td style={td}>{r.title}</td>
                                <td style={td}>{r.creator_email || "—"}</td>
                                <td style={td}>{STATUS_LABEL[r.status] || r.status}</td>
                                <td style={td}>{fmtDate(r.created_at)}</td>
                                <td style={td}><a href={r.public_url} target="_blank" rel="noreferrer">Ver</a></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {searchResults.campaigns.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Campañas</div>
                      <div style={tableWrap}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <tbody>
                            {searchResults.campaigns.map((c) => (
                              <tr key={c.id}>
                                <td style={td}>{c.title}</td>
                                <td style={td}>{STATUS_LABEL[c.status] || c.status}</td>
                                <td style={td}>{fmtDate(c.created_at)}</td>
                                <td style={td}><a href={c.public_url} target="_blank" rel="noreferrer">Ver</a></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {searchResults.payments.length > 0 && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Pagos / aportes</div>
                      {searchResults.payments.map((p) => (
                        <div key={p.id} style={{ ...card, marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                            <div>
                              <strong>{p.product === "raffle" ? "Rifa" : "Campaña"}</strong>
                              {p.title ? ` — ${p.title}` : ""}{" "}
                              {p.public_url && <a href={p.public_url} target="_blank" rel="noreferrer">(ver)</a>}
                            </div>
                            <div style={{ fontSize: 13, color: "#6B7280" }}>{fmtDate(p.created_at)}</div>
                          </div>
                          <div style={{ fontSize: 13, marginTop: 8, display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))" }}>
                            <div>Creador: {p.creator_email || "—"}</div>
                            <div>Comprador/aportante: {p.counterpart_email || "—"}</div>
                            <div>Monto: {clp(p.amount_cents)}</div>
                            <div>Fee Rifex: {clp(p.fee_cents)}</div>
                            <div>Estado: {p.status}</div>
                            <div>Payment ID: {p.mp_payment_id || "—"}</div>
                          </div>

                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280" }}>Webhooks relacionados</div>
                            {p.webhook_events.length === 0 && <div style={{ fontSize: 12, color: "#6B7280" }}>Sin eventos registrados.</div>}
                            {p.webhook_events.map((w, i) => (
                              <div key={i} style={{ fontSize: 12 }}>
                                {w.event_type} — {fmtDate(w.received_at)}{w.reason ? ` — ${w.reason}` : ""}
                              </div>
                            ))}
                            {!p.reconcile_trace_supported && (
                              <div style={{ fontSize: 12, color: "#92400E", marginTop: 4 }}>
                                Rifas no registra traza de reconciliación en webhook_events hoy — limitación conocida, no simulada.
                              </div>
                            )}
                          </div>

                          <div style={{ marginTop: 10 }}>
                            <button
                              className="btn"
                              onClick={() => runReconcile(p.product, p.id)}
                              disabled={reconcileBusy[p.id]}
                              style={{ padding: "8px 14px", borderRadius: 10, fontWeight: 700, fontSize: 13 }}
                            >
                              {reconcileBusy[p.id] ? "Reconciliando…" : "Reconciliar"}
                            </button>
                            {reconcileResult[p.id] && (
                              <span style={{ marginLeft: 10, fontSize: 12, color: reconcileResult[p.id].ok ? "#166534" : "#b91c1c" }}>
                                {JSON.stringify(reconcileResult[p.id])}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ---- Métricas financieras ---- */}
            {metrics && (
              <section style={section}>
                <div style={sectionTitle}>Recaudación</div>
                <div style={grid}>
                  <Kpi
                    label="Total recaudado en Chile"
                    value={clp(metrics.raised_cl_cents)}
                    sub={`Rifas ${clp(metrics.breakdown.raffles.raised_cents)} · Campañas ${clp(metrics.breakdown.campaigns.raised_cents)}`}
                  />
                  <Kpi
                    label="Ingresos Rifex en Chile"
                    value={<span style={{ color: "#18A957" }}>{clp(metrics.rifex_revenue_cl_cents)}</span>}
                    sub={`Rifas ${clp(metrics.breakdown.raffles.fee_cents)} · Campañas ${clp(metrics.breakdown.campaigns.fee_cents)}`}
                  />
                </div>
              </section>
            )}

            {/* ---- Operación ---- */}
            {overview && (
              <section style={section}>
                <div style={sectionTitle}>Operación</div>
                <div style={grid}>
                  <Kpi label="Usuarios totales" value={overview.counts.users_total ?? "—"} />
                  <Kpi label="Creadores con actividad" value={overview.counts.creators_active} />
                  <Kpi label="Rifas activas" value={overview.counts.raffles_active} />
                  <Kpi label="Campañas activas" value={overview.counts.campaigns_active} />
                  <Kpi label="Cuentas MP conectadas" value={overview.counts.mp_connected} />
                  <Kpi label="Pagos approved" value={overview.counts.payments_approved} />
                  <Kpi label="Pagos pending" value={overview.counts.payments_pending} />
                  <Kpi label="Pagos rejected" value={overview.counts.payments_rejected} />
                </div>
              </section>
            )}

            {/* ---- Cumplimiento (CUMPLIMIENTO-5) ---- */}
            {cumplimiento && (
              <section style={section}>
                <div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Cumplimiento</span>
                  <Link href="/admin/cumplimiento" style={{ fontSize: 13, fontWeight: 700 }}>
                    Ver casos →
                  </Link>
                </div>
                <div style={grid}>
                  <Kpi label="Requieren revisión" value={cumplimiento.summary.requires_review} />
                  <Kpi label="Entregas pendientes" value={cumplimiento.summary.delivery_pending} />
                  <Kpi label="Cumplimientos confirmados" value={cumplimiento.summary.confirmed} />
                  <Kpi label="Sin confirmación" value={cumplimiento.summary.unconfirmed} />
                </div>
              </section>
            )}

            {/* ---- Salud / alertas ---- */}
            <section style={section}>
              <div style={sectionTitle}>Salud / alertas</div>
              {!hasAlerts && <div style={okBox}>Sin alertas operativas pendientes.</div>}
              {gapRaffles + gapCampaigns > 0 && (
                <div style={warnBox}>
                  Ingresos Rifex incompleto: {gapRaffles} pago(s) de rifa y {gapCampaigns} aporte(s) de campaña
                  aprobados sin comisión registrada — excluidos de la suma, no estimados.
                </div>
              )}
              {pendingStale.length > 0 && (
                <div style={warnBox}>
                  {pendingStale.length} operación(es) pending hace más de {overview.alerts.pending_stale.threshold_hours}h:{" "}
                  {pendingStale.map((p) => `${p.product} ${p.mp_payment_id || "(sin payment_id)"}`).join(", ")}
                </div>
              )}
              {reconcileErrors.length > 0 && (
                <div style={warnBox}>
                  {reconcileErrors.length} error(es) de reconciliación reciente en Campañas:{" "}
                  {reconcileErrors.map((e) => `${e.reason} (${e.payment_id})`).join(", ")}.{" "}
                  {overview.alerts.reconcile_errors.note}
                </div>
              )}
              {mpDisconnected > 0 && (
                <div style={warnBox}>{mpDisconnected} cuenta(s) de Mercado Pago desconectada(s).</div>
              )}
            </section>

            {/* ---- Actividad reciente ---- */}
            {overview && (
              <section style={section}>
                <div style={sectionTitle}>Actividad reciente</div>
                <div style={tableWrap}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={th}>Tipo</th>
                        <th style={th}>Título</th>
                        <th style={th}>Creador</th>
                        <th style={th}>Estado</th>
                        <th style={th}>Fecha</th>
                        <th style={th}>Enlace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recent_activity.length === 0 && (
                        <tr><td style={td} colSpan={6}>Sin actividad registrada.</td></tr>
                      )}
                      {overview.recent_activity.map((a, i) => (
                        <tr key={i}>
                          <td style={td}>{a.type === "raffle" ? "Rifa" : "Campaña"}</td>
                          <td style={td}>{a.title}</td>
                          <td style={td}>{a.creator_email || "—"}</td>
                          <td style={td}>{STATUS_LABEL[a.status] || a.status}</td>
                          <td style={td}>{fmtDate(a.created_at)}</td>
                          <td style={td}><a href={a.public_url} target="_blank" rel="noreferrer">Ver</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ---- Pagos recientes ---- */}
            {overview && (
              <section style={section}>
                <div style={sectionTitle}>Pagos recientes</div>
                <div style={tableWrap}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={th}>Producto</th>
                        <th style={th}>Monto</th>
                        <th style={th}>Fee Rifex</th>
                        <th style={th}>Estado</th>
                        <th style={th}>Payment ID</th>
                        <th style={th}>Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recent_payments.length === 0 && (
                        <tr><td style={td} colSpan={6}>Sin pagos registrados.</td></tr>
                      )}
                      {overview.recent_payments.map((p, i) => (
                        <tr key={i}>
                          <td style={td}>{p.product}{p.title ? ` — ${p.title}` : ""}</td>
                          <td style={td}>{clp(p.amount_cents)}</td>
                          <td style={td}>{clp(p.fee_cents)}</td>
                          <td style={td}>{p.status}</td>
                          <td style={td}>{p.mp_payment_id || "—"}</td>
                          <td style={td}>{fmtDate(p.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ---- Country status ---- */}
            <section style={section}>
              <div style={sectionTitle}>Country Status</div>
              <div style={tableWrap}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {COUNTRY_CODES.map((code) => {
                      const c = COUNTRY_POLICY[code];
                      return (
                        <tr key={code}>
                          <td style={td}>{c.flag} {c.label}</td>
                          <td style={{ ...td, color: c.enabled ? "#166534" : "#6B7280", fontWeight: 700 }}>
                            {c.enabled ? "Operativo" : "Próximamente"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ---- Feature status ---- */}
            <section style={{ ...section, marginBottom: 0 }}>
              <div style={sectionTitle}>Feature Status</div>
              <div style={tableWrap}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {Object.entries(FEATURE_FLAGS).map(([key, f]) => (
                      <tr key={key}>
                        <td style={td}>{f.label}</td>
                        <td style={{ ...td, color: FLAG_COLOR[f.status], fontWeight: 700 }}>{FLAG_LABEL[f.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}

AdminHome.getLayout = (page) => <Layout>{page}</Layout>;
