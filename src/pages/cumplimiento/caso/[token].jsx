// src/pages/cumplimiento/caso/[token].jsx
// CUMPLIMIENTO-3 — vista pública, solo lectura, del caso de cumplimiento
// para el ganador invitado (sin cuenta Rifex). Mismo patrón que
// /eventos/orden/[token] (EVENT-3): token opaco en la URL, fetch
// client-side al endpoint tokenizado, sin auth.getUser(). Estrictamente
// de solo lectura en esta fase — sin acciones de confirmación de
// recepción todavía (eso es CUMPLIMIENTO-4). Nunca expone PII de
// terceros, tokens internos, ni metadata de auditoría.
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
  creator_reported_delivered: { title: "El creador informó que ya entregó el premio", body: "Cuando el sistema de confirmación esté disponible, se te pedirá que confirmes la recepción." },
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

      <p style={{ color: "#9CA3AF", fontSize: 12.5, marginTop: 20 }}>
        Esta información corresponde a las condiciones publicadas por el creador antes de que la rifa comenzara a
        vender — no cambia si la rifa se edita después. Rifex Cumplimiento todavía está en preparación; esta
        página solo muestra el estado actual, sin acciones disponibles todavía.
      </p>
    </main>
  );
}

CasoCumplimiento.getLayout = (page) => <Layout>{page}</Layout>;
