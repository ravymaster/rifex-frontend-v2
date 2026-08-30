// src/pages/cumplimiento/caso/[token].jsx
// CUMPLIMIENTO-3/4 — vista pública del caso de cumplimiento para el
// ganador invitado (sin cuenta Rifex), con las dos respuestas activas
// desde CUMPLIMIENTO-4. Mismo patrón que /eventos/orden/[token]
// (EVENT-3): token opaco en la URL, fetch client-side al endpoint
// tokenizado, sin auth.getUser() -- el token ES la identidad. Nunca
// expone PII de terceros, tokens internos, correos de revisión interna
// ni metadata de auditoría. Nunca usa lenguaje de fraude/denuncia/
// estafa/incumplimiento -- solo "recibiste" / "todavía no".
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";

const DELIVERY_METHOD_LABELS = {
  retira_en_tienda: "Retiro / entrega presencial",
  envio_incluido: "Envío incluido por el creador",
  envio_pagado: "Envío a cargo del ganador",
  a_convenir: "A convenir con el creador",
};
const TRANSFER_OWNER_LABELS = { creator: "el creador de la rifa", winner: "vos (el ganador)" };

const STATUS_COPY = {
  pending_delivery: { title: "Pendiente de entrega", body: "Todavía no hay confirmaciones registradas. El creador se pondrá en contacto para coordinar." },
  creator_reported_delivered: { title: "El creador informó que ya entregó el premio", body: "Confirmá abajo si ya lo recibiste." },
  fulfillment_confirmed: { title: "Cumplimiento confirmado", body: "Se confirmó la entrega del premio." },
  delivery_pending: { title: "Entrega pendiente", body: "La entrega todavía no se ha confirmado." },
  under_review: { title: "En revisión", body: "Hay una discrepancia registrada sobre la entrega — está en revisión." },
  unconfirmed: { title: "Sin confirmación", body: "No se registraron confirmaciones durante el período de seguimiento." },
};

function fmtDate(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" });
  } catch {
    return "-";
  }
}

export default function CasoCumplimiento() {
  const router = useRouter();
  const { token } = router.query;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cumplimiento/caso/${encodeURIComponent(token)}`);
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
  }, [token]);

  async function respond(value) {
    // Guarda contra doble submit: mientras hay un envío en curso, o si
    // ya se registró exactamente esa misma respuesta, no se reenvía.
    if (submitting || data?.winner_response === value) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/cumplimiento/caso/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: value }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setSubmitError("No pudimos registrar tu respuesta. Probá de nuevo.");
        return;
      }
      setData(json.case);
    } catch {
      setSubmitError("No pudimos registrar tu respuesta. Probá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px" }}>
        <p>Cargando…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px" }}>
        <h1>Enlace no válido</h1>
        <p style={{ color: "#6B7280" }}>
          Este enlace no es válido o expiró. Si creés que esto es un error, contactá al creador de la rifa.
        </p>
      </main>
    );
  }

  const statusCopy = STATUS_COPY[data.status] || STATUS_COPY.pending_delivery;
  const deliveryLabel = data.delivery_method ? DELIVERY_METHOD_LABELS[data.delivery_method] || data.delivery_method : null;
  const transferOwnerLabel = data.transfer_expenses_owner ? TRANSFER_OWNER_LABELS[data.transfer_expenses_owner] || data.transfer_expenses_owner : null;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "#EFF6FF",
          border: "1px solid #BFDBFE",
          color: "#1E3A8A",
          borderRadius: 999,
          padding: "6px 12px",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        🏆 Tu premio — {data.raffle_title}
      </div>

      <h1 style={{ margin: "12px 0 4px" }}>{statusCopy.title}</h1>
      {statusCopy.body && <p style={{ color: "#6B7280", margin: "0 0 16px" }}>{statusCopy.body}</p>}

      <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px", marginTop: 12 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Información del premio</h2>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 8, columnGap: 12, fontSize: 14 }}>
          <dt style={{ color: "#6B7280" }}>Tipo de premio</dt>
          <dd style={{ margin: 0 }}>{data.prize_type === "physical" ? "Premio físico" : "Dinero en efectivo"}</dd>

          {deliveryLabel && (
            <>
              <dt style={{ color: "#6B7280" }}>Modalidad de entrega</dt>
              <dd style={{ margin: 0 }}>{deliveryLabel}</dd>
            </>
          )}

          {data.requires_transfer_procedures && (
            <>
              <dt style={{ color: "#6B7280" }}>Gastos de transferencia/trámites</dt>
              <dd style={{ margin: 0 }}>A cargo de {transferOwnerLabel}</dd>
              {data.transfer_conditions && (
                <>
                  <dt style={{ color: "#6B7280" }}>Condiciones declaradas</dt>
                  <dd style={{ margin: 0 }}>{data.transfer_conditions}</dd>
                </>
              )}
            </>
          )}

          <dt style={{ color: "#6B7280" }}>Ganador determinado</dt>
          <dd style={{ margin: 0 }}>{fmtDate(data.winner_determined_at)}</dd>
        </dl>
      </div>

      <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px", marginTop: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>¿Recibiste tu premio?</h2>

        {data.winner_response ? (
          <p style={{ margin: 0, color: "#111827" }}>
            {data.winner_response === "yes"
              ? "Registramos que recibiste tu premio. ¡Gracias por confirmar!"
              : "Registramos que todavía no lo recibiste. Te avisaremos sobre los próximos pasos."}
          </p>
        ) : (
          <>
            <p style={{ color: "#6B7280", margin: "0 0 12px", fontSize: 14 }}>
              Contanos el estado actual de la entrega. Podés cambiar tu respuesta más adelante si la situación
              cambia.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => respond("yes")}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "#18a957",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                Sí, recibí mi premio
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => respond("not_yet")}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid #D1D5DB",
                  background: "#fff",
                  color: "#111827",
                  fontWeight: 700,
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                Todavía no lo recibo
              </button>
            </div>
            {submitError && (
              <p style={{ color: "#B91C1C", fontSize: 13, marginTop: 10 }}>{submitError}</p>
            )}
          </>
        )}
      </div>

      <p style={{ color: "#9CA3AF", fontSize: 12.5, marginTop: 20 }}>
        Esta información corresponde a las condiciones publicadas por el creador antes de que la rifa comenzara a
        vender — no cambia si la rifa se edita después.
      </p>
    </main>
  );
}

CasoCumplimiento.getLayout = (page) => <Layout>{page}</Layout>;
