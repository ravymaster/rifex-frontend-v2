// src/pages/crear-rifa.jsx
import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import stylesBtn from "@/styles/crearRifa.module.css"; // <-- CSS Module con .btnCreate

const THEMES = [
  { id: "mixto", label: "Mixto (100 íconos) – Gratis" },
  { id: "universo", label: "Universo – Pro" },
  { id: "mitologia", label: "Mitología – Pro" },
  { id: "dinosaurios", label: "Dinosaurios – Pro" },
  { id: "videojuegos", label: "Videojuegos – Pro" },
  { id: "flora-fauna", label: "Flora y Fauna – Pro" },
  { id: "comidas", label: "Comidas – Pro" },
  { id: "deportes", label: "Deportes – Pro" },
  { id: "viajes", label: "Viajes – Pro" },
];

export default function CrearRifaPage() {
  const router = useRouter();

  // Básicos
  const [title, setTitle] = useState("");
  const [priceClp, setPriceClp] = useState("");
  const [totalNumbers, setTotalNumbers] = useState("");
  const [description, setDescription] = useState("");

  // Plan/temática
  const [plan, setPlan] = useState("free"); // free | pro
  const [theme, setTheme] = useState("mixto");

  // Premio
  const [prizeType, setPrizeType] = useState("money"); // money | physical
  const [prizeAmount, setPrizeAmount] = useState("");  // CLP
  const [payoutMethod, setPayoutMethod] = useState("rifex_transfer"); // rifex_transfer | creator_direct
  const [deliveryMethod, setDeliveryMethod] = useState("a_convenir");
  const [prizePhotos, setPrizePhotos] = useState([]); // File[]

  // Fechas/estado
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("active"); // draft | active | closed

  // Términos
  const [okBuyer, setOkBuyer] = useState(false);
  const [okCreator, setOkCreator] = useState(false);

  const proLocked = plan === "free";

  useEffect(() => {
    if (proLocked && theme !== "mixto") setTheme("mixto");
    if (proLocked && payoutMethod === "creator_direct") setPayoutMethod("rifex_transfer");
  }, [proLocked, theme, payoutMethod]);

  async function onSubmit(e) {
    e.preventDefault();

    if (!title || !priceClp || !totalNumbers) {
      alert("Completa Título, Precio y Cupos.");
      return;
    }
    if (!okBuyer || !okCreator) {
      alert("Debes aceptar los términos.");
      return;
    }
    if (prizeType === "money" && !prizeAmount) {
      alert("Indica el monto del premio en CLP.");
      return;
    }

    const photos = Array.from(prizePhotos || []).slice(0, 3).map(f => f.name);

    const payload = {
      title,
      price_cents: Math.round(Number(priceClp) * 100),
      total_numbers: Number(totalNumbers),
      description: description || null,

      plan,
      theme,
      prize_type: prizeType,
      prize_amount_cents: prizeType === "money" ? Math.round(Number(prizeAmount || 0) * 100) : null,
      payout_method: prizeType === "money" ? payoutMethod : null,
      delivery_method: prizeType === "physical" ? deliveryMethod : null,
      prize_photos: prizeType === "physical" ? photos : null,

      start_date: startDate || null,
      end_date: endDate || null,
      status,
    };

    try {
      // Pasamos quién es el usuario logueado (cabeceras) para asignar creador en la API
      const { data: ures } = await supabase.auth.getUser();
      const user = ures?.user || null;

      const headers = { "Content-Type": "application/json" };
      if (user?.id) headers["x-user-id"] = user.id;
      if (user?.email) headers["x-user-email"] = user.email;

      const res = await fetch("/api/rifas", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Error");

      // Redirige a la rifa creada (API devuelve id en la raíz)
      if (data.id) {
        router.push(`/rifas/${data.id}`);
      } else if (data.data?.id) {
        router.push(`/rifas/${data.data.id}`);
      } else {
        router.push("/panel");
      }
    } catch (err) {
      console.error(err);
      alert("No se pudo crear la rifa.");
    }
  }

  return (
    <>
      <Head><title>Crear rifa — Rifex</title></Head>
      <main style={{maxWidth:900, margin:"0 auto", padding:"24px 16px"}}>
        <h1>Crear rifa</h1>
        <p>Completa los datos. Al guardar, se crearán automáticamente los tickets <strong>1..N</strong>.</p>

        <form onSubmit={onSubmit} style={{display:"grid", gap:16, marginTop:16}}>
          {/* Básicos */}
          <input
            placeholder="Título *"
            value={title}
            onChange={e=>setTitle(e.target.value)}
            required
            style={s.input}
          />
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
            <input placeholder="Precio (CLP) *" inputMode="numeric" value={priceClp} onChange={e=>setPriceClp(e.target.value)} required style={s.input}/>
            <input placeholder="Cupos / Total de números *" inputMode="numeric" value={totalNumbers} onChange={e=>setTotalNumbers(e.target.value)} required style={s.input}/>
          </div>
          <textarea rows={4} placeholder="Descripción (opcional)" value={description} onChange={e=>setDescription(e.target.value)} style={s.input} />

          {/* Plan + Temática */}
          <fieldset style={s.card}>
            <legend style={s.legend}>Plan y temática</legend>
            <div style={s.row}>
              <label><input type="radio" name="plan" value="free" checked={plan==="free"} onChange={()=>setPlan("free")} /> Plan Gratis</label>
              <label><input type="radio" name="plan" value="pro" checked={plan==="pro"} onChange={()=>setPlan("pro")} /> Plan Pro</label>
            </div>
            <label>Temática</label>
            <select value={theme} onChange={e=>setTheme(e.target.value)} style={s.input}>
              {THEMES.map(t=>(
                <option key={t.id} value={t.id} disabled={t.id!=="mixto" && proLocked}>
                  {t.label}{t.id!=="mixto" && proLocked ? " (requiere Pro)" : ""}
                </option>
              ))}
            </select>
            <p style={s.hint}>Gratis: 100 íconos mixtos. Pro: eliges una temática (100 íconos).</p>
          </fieldset>

          {/* Premio */}
          <fieldset style={s.card}>
            <legend style={s.legend}>Tipo de premio</legend>
            <div style={s.row}>
              <label><input type="radio" name="ptype" value="money" checked={prizeType==="money"} onChange={()=>setPrizeType("money")} /> Dinero</label>
              <label><input type="radio" name="ptype" value="physical" checked={prizeType==="physical"} onChange={()=>setPrizeType("physical")} /> Físico</label>
            </div>

            {prizeType==="money" && (
              <div className="money-block">
                <label>Monto del premio (CLP)</label>
                <input type="number" min="0" step="1000" placeholder="Ej: 1000000" value={prizeAmount} onChange={e=>setPrizeAmount(e.target.value)} style={s.input}/>
                <label style={{marginTop:8}}>Método de pago del premio</label>
                <select value={payoutMethod} onChange={e=>setPayoutMethod(e.target.value)} style={s.input}>
                  <option value="rifex_transfer">Depósito por Rifex (Plan Gratis)</option>
                  <option value="creator_direct" disabled={proLocked}>Transferencia directa del creador (Pro)</option>
                </select>
              </div>
            )}

            {prizeType==="physical" && (
              <div className="physical-block">
                <label>Fotos del premio (hasta 3)</label>
                <input type="file" accept="image/*" multiple onChange={e=>setPrizePhotos(Array.from(e.target.files||[]))} />
                <label style={{marginTop:8}}>Método de entrega</label>
                <select value={deliveryMethod} onChange={e=>setDeliveryMethod(e.target.value)} style={s.input}>
                  <option value="a_convenir">A convenir</option>
                  <option value="retira_en_tienda">Retiro en punto</option>
                  <option value="envio_pagado">Envío pagado por el ganador</option>
                  <option value="envio_incluido">Envío incluido por el creador</option>
                </select>
              </div>
            )}
          </fieldset>

          {/* Fechas + estado */}
          <fieldset style={s.card}>
            <legend style={s.legend}>Fechas y estado</legend>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
              <div>
                <label>Inicio</label>
                <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={s.input}/>
              </div>
              <div>
                <label>Término</label>
                <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={s.input}/>
              </div>
            </div>
            <label style={{marginTop:8}}>Estado</label>
            <select value={status} onChange={e=>setStatus(e.target.value)} style={s.input}>
              <option value="draft">Borrador</option>
              <option value="active">Activa</option>
              <option value="closed">Cerrada</option>
            </select>
          </fieldset>

          {/* Términos */}
          <div style={s.card}>
            <label style={{display:"block", marginBottom:6}}>
              <input type="checkbox" checked={okBuyer} onChange={e=>setOkBuyer(e.target.checked)} /> Acepto los <a href="/terminos#comprador" target="_blank" rel="noreferrer">Términos del comprador</a>
            </label>
            <label style={{display:"block"}}>
              <input type="checkbox" checked={okCreator} onChange={e=>setOkCreator(e.target.checked)} /> Acepto los <a href="/terminos#creador" target="_blank" rel="noreferrer">Términos del creador</a> y las <a href="/terminos#rifex" target="_blank" rel="noreferrer">Condiciones de Rifex</a>
            </label>
          </div>

          <div style={{display:"flex", gap:12}}>
            <button
              type="submit"
              className={stylesBtn.btnCreate}
              style={{
                background: "linear-gradient(135deg, var(--ultramar), var(--trebol))",
                boxShadow: "0 6px 14px rgba(24,169,87,.22)"
              }}
            >
              Crear rifa
            </button>

            <a
              href="/panel"
              className={stylesBtn.btnCreate}
              style={{ background:"#fff", color:"var(--ultramar)", border:"1px solid #E5E7EB" }}
            >
              Cancelar
            </a>
          </div>
        </form>
      </main>
    </>
  );
}

const s = {
  input: { width:"100%", padding:"10px 12px", border:"1px solid #E5E7EB", borderRadius:10, background:"#fff" },
  card: { border:"1px solid #E5E7EB", borderRadius:12, padding:12, background:"#fff" },
  legend: { fontWeight:600 },
  row: { display:"flex", gap:16, margin:"6px 0 10px" },
  hint: { fontSize:12, color:"#6B7280", marginTop:6 },
  btn: { display:"inline-flex", alignItems:"center", justifyContent:"center", padding:"10px 14px", border:"1px solid #E5E7EB", borderRadius:10, textDecoration:"none" },
  btnPrimary: { background:"linear-gradient(135deg,#1E3A8A,#18A957)", color:"#fff", border:"none", padding:"10px 14px", borderRadius:10 }
};
