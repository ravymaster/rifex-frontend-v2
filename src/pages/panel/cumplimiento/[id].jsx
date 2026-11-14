// src/pages/panel/cumplimiento/[id].jsx
// CUMPLIMIENTO-4 — detalle del caso + respuesta del creador. Reusa
// /api/panel/cumplimiento/[id] (GET ya existente de CUMPLIMIENTO-1,
// POST nuevo de CUMPLIMIENTO-4) — mismo chequeo de ownership por
// Bearer + auth.getUser() que el resto del panel, sin token de
// invitado (el creador siempre tiene cuenta Rifex).
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";

const STATUS_LABEL = {
  pending_delivery: "Pendiente de entrega",
  creator_reported_delivered: "Entrega informada",
  fulfillment_confirmed: "Confirmado",
  delivery_pending: "Entrega pendiente",
  under_review: "En revisión",
  unconfirmed: "Sin confirmación",
};
const CREATOR_RESPONSE_LABEL = { yes: "Ya entregué el premio", coordinating: "Estamos coordinando la entrega", not_yet: "Todavía no lo entrego" };

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" });
  } catch {
    return "—";
  }
}

export default function PanelCumplimientoDetalle() {
  const router = useRouter();
  const { id } = router.query;
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: sessData } = await supabase.auth.getSession();
      const sess = sessData?.session;
      if (!sess) {
        router.push(`/login?next=/panel/cumplimiento/${id}`);
        return;
      }
      if (cancelled) return;
      setSession(sess);
      try {
        const res = await fetch(`/api/panel/cumplimiento/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${sess.access_token}` } });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setError("not_found");
        } else {
          setData(json.case);
        }
      } catch {
        if (!cancelled) setError("not_found");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  async function respond(value) {
    if (!session || submitting || data?.creator_response === value) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/panel/cumplimiento/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ response: value }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setSubmitError("No pudimos registrar tu respuesta. Prueba de nuevo.");
        return;
      }
      setData(json.case);
    } catch {
      setSubmitError("No pudimos registrar tu respuesta. Prueba de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Layout noindex title="Cumplimiento — Rifex">
        <p style={{ maxWidth: 720, margin: "0 auto" }}>Cargando…</p>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout noindex title="Cumplimiento — Rifex">
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1>Caso no encontrado</h1>
          <p style={{ color: "#6B7280" }}>Este caso no existe o no te pertenece.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout noindex title="Cumplimiento — Rifex">
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>{data.raffle_title}</h1>
        <p style={{ color: "#6B7280", margin: "0 0 20px" }}>
          Estado actual: <b>{STATUS_LABEL[data.status] || data.status}</b>
        </p>

        <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Información del caso</h2>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 8, columnGap: 12, fontSize: 14 }}>
            <dt style={{ color: "#6B7280" }}>Número ganador</dt>
            <dd style={{ margin: 0 }}>{data.winner_ticket_number}</dd>
            <dt style={{ color: "#6B7280" }}>Ganador determinado</dt>
            <dd style={{ margin: 0 }}>{fmtDate(data.winner_determined_at)}</dd>
            <dt style={{ color: "#6B7280" }}>Respuesta del ganador</dt>
            <dd style={{ margin: 0 }}>{data.winner_response === "yes" ? "Recibió el premio" : data.winner_response === "not_yet" ? "Todavía no lo recibe" : "Sin respuesta todavía"}</dd>
          </dl>
        </div>

        <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>¿Ya entregaste el premio?</h2>

          {data.creator_response ? (
            <p style={{ margin: 0, color: "#111827" }}>
              Tu última respuesta: <b>{CREATOR_RESPONSE_LABEL[data.creator_response] || data.creator_response}</b>
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: data.creator_response ? 12 : 0 }}>
            <button
              type="button"
              disabled={submitting}
              onClick={() => respond("yes")}
              style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#18a957", color: "#fff", fontWeight: 700, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
            >
              Sí, ya entregué el premio
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => respond("coordinating")}
              style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", color: "#111827", fontWeight: 700, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
            >
              Estamos coordinando la entrega
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => respond("not_yet")}
              style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", color: "#111827", fontWeight: 700, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
            >
              Todavía no lo entrego
            </button>
          </div>
          {submitError && <p style={{ color: "#B91C1C", fontSize: 13, marginTop: 10 }}>{submitError}</p>}
        </div>
      </div>
    </Layout>
  );
}
