// src/pages/admin/cumplimiento/[id].jsx
// CUMPLIMIENTO-5 — expediente de un caso de cumplimiento + mesa de
// revisión administrativa. MISMA autorización que /admin. Nunca
// muestra tokens, hashes, ni credenciales — el endpoint que alimenta
// esta página (/api/admin/cumplimiento/[id]) ya los excluye por
// diseño (ADMIN_CASE_COLUMNS), esta página no intenta leerlos.
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import {
  STATUS_LABEL,
  ADMIN_REVIEW_STATUS_LABEL,
  ESCALATION_REASON_LABEL,
  CREATOR_RESPONSE_LABEL,
  WINNER_RESPONSE_LABEL,
  COMMUNICATION_TYPE_LABEL,
  COMMUNICATION_STATUS_LABEL,
  PRIZE_TYPE_LABEL,
  DELIVERY_METHOD_LABEL,
  TRANSFER_OWNER_LABEL,
  fmtDate,
  buildHumanTimeline,
} from "@/lib/adminFulfillmentLabels";

const card = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "16px 18px" };
const section = { maxWidth: 900, margin: "0 auto 20px" };
const sectionTitle = { fontSize: 15, fontWeight: 800, marginBottom: 10 };
const dl = { margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 8, columnGap: 12, fontSize: 14 };
const dt = { color: "#6B7280" };
const dd = { margin: 0 };
const btn = { padding: "9px 16px", borderRadius: 10, fontWeight: 700, fontSize: 13, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer" };
const btnPrimary = { ...btn, border: "none", background: "#111827", color: "#fff" };

export default function AdminCumplimientoCase() {
  const router = useRouter();
  const { id } = router.query;
  const [token, setToken] = useState(null);
  const [state, setState] = useState("checking");
  const [data, setData] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [noteText, setNoteText] = useState("");
  const [resolveNoteText, setResolveNoteText] = useState("");

  async function load(accessToken) {
    const res = await fetch(`/api/admin/cumplimiento/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!(res.ok && json?.ok)) {
      setState(res.status === 401 || res.status === 403 ? "denied" : res.status === 404 ? "not_found" : "error");
      return;
    }
    setData(json);
    setState("ok");
  }

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: sessData } = await supabase.auth.getSession();
      const accessToken = sessData?.session?.access_token;
      if (!accessToken) {
        router.replace(`/login?next=${encodeURIComponent(`/admin/cumplimiento/${id}`)}`);
        return;
      }
      setToken(accessToken);
      try {
        await load(accessToken);
      } catch (e) {
        console.error("[admin/cumplimiento/[id]] error", e);
        setErrMsg("No se pudo cargar el expediente.");
        setState("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function runAction(payload) {
    if (busy) return;
    setBusy(true);
    setActionErr("");
    try {
      const res = await fetch(`/api/admin/cumplimiento/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!(res.ok && json?.ok)) {
        setActionErr(json?.error || "No se pudo completar la acción.");
        return;
      }
      await load(token);
      setNoteText("");
      setResolveNoteText("");
    } catch (e) {
      console.error("[admin/cumplimiento/[id]] action error", e);
      setActionErr("No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return <main style={{ padding: 60, textAlign: "center" }}>Verificando acceso…</main>;
  if (state === "denied") {
    return (
      <main style={{ padding: 60, textAlign: "center" }}>
        <h2 style={{ color: "#b91c1c" }}>Acceso denegado</h2>
        <p style={{ color: "#6B7280" }}>Tu cuenta no tiene autorización para administrar Rifex.</p>
      </main>
    );
  }
  if (state === "not_found") {
    return (
      <main style={{ padding: 60, textAlign: "center" }}>
        <h2>Caso no encontrado</h2>
      </main>
    );
  }
  if (state === "error" || !data) {
    return (
      <main style={{ padding: 60, textAlign: "center" }}>
        <p style={{ color: "#b91c1c" }}>{errMsg || "No se pudo cargar el expediente."}</p>
      </main>
    );
  }

  const c = data.case;
  const timeline = buildHumanTimeline(c, data.events);
  const notes = (data.events || []).filter((e) => e.event_type === "admin_note_added" || (e.event_type === "admin_review_resolved" && e.metadata?.note));
  const reviewStatus = c.escalated_at ? c.admin_review_status : null;
  const canReview = !!c.escalated_at;

  return (
    <>
      <Head><title>Caso de cumplimiento — Admin Rifex</title></Head>
      <main style={{ padding: "40px 16px 80px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto 20px" }}>
          <Link href="/admin/cumplimiento" style={{ fontSize: 13, color: "#6B7280" }}>← Volver al listado</Link>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>{c.raffle_title}</h1>
          <p style={{ color: "#6B7280", marginTop: 4, fontSize: 13 }}>ID técnico: {c.raffle_id}</p>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ ...card, padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>{STATUS_LABEL[c.status] || c.status}</span>
            {c.escalated_at && (
              <span style={{ ...card, padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>
                {ADMIN_REVIEW_STATUS_LABEL[reviewStatus] ?? ADMIN_REVIEW_STATUS_LABEL[null]}
              </span>
            )}
          </div>
        </div>

        <section style={section}>
          <div style={card}>
            <div style={sectionTitle}>Rifa y premio</div>
            <dl style={dl}>
              <dt style={dt}>Fecha de sorteo</dt><dd style={dd}>{fmtDate(c.winner_determined_at)}</dd>
              <dt style={dt}>Tipo de premio</dt><dd style={dd}>{PRIZE_TYPE_LABEL[c.prize_type] || c.prize_type}</dd>
              {c.delivery_method && (<><dt style={dt}>Modalidad de entrega</dt><dd style={dd}>{DELIVERY_METHOD_LABEL[c.delivery_method] || c.delivery_method}</dd></>)}
              {c.requires_transfer_procedures && (
                <>
                  <dt style={dt}>Gastos de transferencia/trámites</dt>
                  <dd style={dd}>A cargo de {TRANSFER_OWNER_LABEL[c.transfer_expenses_owner] || c.transfer_expenses_owner || "—"}</dd>
                  {c.transfer_conditions && (<><dt style={dt}>Condiciones declaradas</dt><dd style={dd}>{c.transfer_conditions}</dd></>)}
                </>
              )}
            </dl>
          </div>
        </section>

        <section style={section}>
          <div style={card}>
            <div style={sectionTitle}>Creador</div>
            <dl style={dl}>
              <dt style={dt}>Contacto</dt><dd style={dd}>{data.creator_email || "—"}</dd>
              <dt style={dt}>Referencia</dt><dd style={dd}>{c.creator_id}</dd>
            </dl>
          </div>
        </section>

        <section style={section}>
          <div style={card}>
            <div style={sectionTitle}>Ganador</div>
            <dl style={dl}>
              <dt style={dt}>Nombre</dt><dd style={dd}>{c.winner_buyer_name || "—"}</dd>
              <dt style={dt}>Contacto</dt><dd style={dd}>{c.winner_buyer_email || "—"}</dd>
              <dt style={dt}>Número ganador</dt><dd style={dd}>{c.winner_ticket_number}</dd>
            </dl>
          </div>
        </section>

        <section style={section}>
          <div style={card}>
            <div style={sectionTitle}>Respuestas</div>
            <dl style={dl}>
              <dt style={dt}>Ganador</dt>
              <dd style={dd}>
                {c.winner_response ? `${WINNER_RESPONSE_LABEL[c.winner_response] || c.winner_response} — ${fmtDate(c.winner_response_at)}` : "No respondió"}
              </dd>
              <dt style={dt}>Creador</dt>
              <dd style={dd}>
                {c.creator_response ? `${CREATOR_RESPONSE_LABEL[c.creator_response] || c.creator_response} — ${fmtDate(c.creator_response_at)}` : "No respondió"}
              </dd>
            </dl>
          </div>
        </section>

        {c.escalation_reason && (
          <section style={section}>
            <div style={{ ...card, background: "#FEF3C7", border: "1px solid #FDE68A" }}>
              <div style={sectionTitle}>Motivo de revisión</div>
              <p style={{ margin: 0, fontSize: 14, color: "#92400E" }}>{ESCALATION_REASON_LABEL[c.escalation_reason] || c.escalation_reason}</p>
            </div>
          </section>
        )}

        <section style={section}>
          <div style={card}>
            <div style={sectionTitle}>Comunicaciones</div>
            {(data.communications || []).length === 0 && <p style={{ fontSize: 13, color: "#6B7280" }}>Sin comunicaciones registradas.</p>}
            {(data.communications || []).length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                {data.communications.map((comm, i) => (
                  <div key={i} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F3F4F6", padding: "4px 0" }}>
                    <span>{COMMUNICATION_TYPE_LABEL[comm.communication_type] || comm.communication_type}</span>
                    <span style={{ color: "#6B7280" }}>{COMMUNICATION_STATUS_LABEL[comm.status] || comm.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section style={section}>
          <div style={card}>
            <div style={sectionTitle}>Cronología</div>
            <div style={{ display: "grid", gap: 10 }}>
              {timeline.map((item, i) => (
                <div key={i} style={{ fontSize: 13, borderLeft: "2px solid #E5E7EB", paddingLeft: 10 }}>
                  <div style={{ color: "#6B7280", fontSize: 12 }}>{fmtDate(item.at)}</div>
                  <div>{item.text}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {canReview && (
          <section style={section}>
            <div style={card}>
              <div style={sectionTitle}>Revisión administrativa</div>
              <p style={{ fontSize: 13, color: "#6B7280", marginTop: 0 }}>
                Esta mesa sirve para observar, revisar antecedentes y documentar una resolución administrativa
                interna — no determina fraude, estafa ni delito.
              </p>

              {notes.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>Notas internas</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {notes.map((n, i) => (
                      <div key={i} style={{ fontSize: 13, background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ color: "#6B7280", fontSize: 11 }}>{fmtDate(n.created_at)}{n.metadata?.admin_email ? ` — ${n.metadata.admin_email}` : ""}</div>
                        <div>{n.metadata?.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reviewStatus !== "resolved" && reviewStatus !== "closed_without_determination" && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  <button type="button" style={btnPrimary} disabled={busy || reviewStatus === "in_review"} onClick={() => runAction({ action: "start_review" })}>
                    {reviewStatus === "in_review" ? "En revisión" : "Iniciar revisión"}
                  </button>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>Agregar nota interna</div>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Ej: Se revisaron respuestas y comunicaciones. Se solicitó antecedente adicional al creador."
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #D1D5DB", fontFamily: "inherit", fontSize: 13 }}
                />
                <button
                  type="button"
                  style={{ ...btn, marginTop: 8 }}
                  disabled={busy || !noteText.trim()}
                  onClick={() => runAction({ action: "add_note", note: noteText })}
                >
                  Guardar nota
                </button>
              </div>

              {reviewStatus !== "resolved" && reviewStatus !== "closed_without_determination" && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>Resolver revisión</div>
                  <textarea
                    value={resolveNoteText}
                    onChange={(e) => setResolveNoteText(e.target.value)}
                    placeholder="Nota de resolución (opcional)"
                    rows={2}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #D1D5DB", fontFamily: "inherit", fontSize: 13, marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={btnPrimary}
                      disabled={busy}
                      onClick={() => runAction({ action: "resolve", resolution: "resolved", note: resolveNoteText })}
                    >
                      Marcar como resuelto
                    </button>
                    <button
                      type="button"
                      style={btn}
                      disabled={busy}
                      onClick={() => runAction({ action: "resolve", resolution: "closed_without_determination", note: resolveNoteText })}
                    >
                      Cerrar sin determinación
                    </button>
                  </div>
                </div>
              )}

              {actionErr && <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 10 }}>{actionErr}</p>}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

AdminCumplimientoCase.getLayout = (page) => <Layout>{page}</Layout>;
