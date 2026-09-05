// src/pages/panel/cumplimiento/index.jsx
// CUMPLIMIENTO-4 — panel mínimo: lista de casos de cumplimiento del
// creador. Sin mega-dashboard (explícitamente fuera de alcance) — solo
// lo necesario para que el creador vea sus casos y entre a responder.
// Reusa /api/panel/cumplimiento (GET, CUMPLIMIENTO-1), sin cambios.
import Link from "next/link";
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

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" });
  } catch {
    return "—";
  }
}

export default function PanelCumplimiento() {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) {
        router.push("/login?next=/panel/cumplimiento");
        return;
      }
      try {
        const res = await fetch("/api/panel/cumplimiento", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error || "No se pudieron cargar tus casos");
        setItems(body.cases || []);
      } catch (e) {
        setError(e.message || "No se pudieron cargar tus casos");
        setItems([]);
      }
    })();
  }, [router]);

  return (
    <Layout noindex title="Cumplimiento — Rifex">
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "0 0 20px" }}>Cumplimiento de entregas</h1>

        {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
        {items === null && <p>Cargando…</p>}
        {items && items.length === 0 && <p style={{ color: "#94a3b8" }}>Todavía no tienes casos de cumplimiento. Se crearán automáticamente cuando una de tus rifas tenga un ganador.</p>}

        <div style={{ display: "grid", gap: 12 }}>
          {(items || []).map((c) => (
            <Link
              key={c.raffle_id}
              href={`/panel/cumplimiento/${c.raffle_id}`}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 14, padding: "14px 18px", textDecoration: "none", color: "inherit" }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>{c.raffle_title}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Ganador determinado: {fmtDate(c.winner_determined_at)}</div>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#f1f5f9", color: "#475569" }}>
                {STATUS_LABEL[c.status] || c.status}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
