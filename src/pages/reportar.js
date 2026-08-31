// src/pages/reportar.js
// RIFEX V4 A5 — formulario público de reportes, sin login requerido.
import { useState } from "react";
import Layout from "@/components/Layout";

export default function Reportar() {
  const [form, setForm] = useState({ url: "", reason: "", description: "", email: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setStatus("sending");
    try {
      const r = await fetch("/api/reportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error("failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
        <h1>Reporte enviado</h1>
        <p style={{ color: "#6B7280" }}>
          Gracias por avisarnos. Revisaremos la evidencia disponible antes de tomar una decisión — no podemos
          garantizar un plazo de respuesta específico.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Reportar una iniciativa o creador</h1>
      <p style={{ color: "#6B7280", marginBottom: 20 }}>
        Cualquier persona puede reportar sin iniciar sesión. Cada denuncia se revisa contra la evidencia disponible
        antes de tomar una decisión — no compartimos tus datos con el creador reportado.
      </p>

      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <label className="label">URL o identificador de la iniciativa (opcional)</label>
        <input className="input" value={form.url} onChange={(e) => update("url", e.target.value)} placeholder="https://rifex.pro/rifas/..." />

        <label className="label">Motivo</label>
        <input className="input" required value={form.reason} onChange={(e) => update("reason", e.target.value)} placeholder="Ej: premio no entregado" />

        <label className="label">Descripción</label>
        <textarea className="input" required rows={6} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Cuéntanos qué ocurrió, con el mayor detalle posible" />

        <label className="label">Tu correo (opcional, para poder contactarte)</label>
        <input className="input" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="tucorreo@dominio.com" />

        <button className="btn btn-primary" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Enviando…" : "Enviar reporte"}
        </button>
        {status === "error" && (
          <p style={{ color: "#B91C1C" }}>No pudimos enviar tu reporte. Intenta de nuevo o escribe a contacto@rifex.pro.</p>
        )}
      </form>
    </main>
  );
}

Reportar.getLayout = (page) => (
  <Layout
    title="Reportar — Rifex"
    description="Reporta una iniciativa o un creador que incumple lo anunciado en Rifex, sin necesidad de iniciar sesión."
    canonicalPath="/reportar"
  >
    {page}
  </Layout>
);
