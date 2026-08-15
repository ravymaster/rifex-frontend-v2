// src/pages/crear-rifa.jsx
import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import Layout from "@/components/Layout";
import styles from "@/styles/crearRifa.module.css";

const THEMES = [
  { id: "mixto", label: "Mixto", icon: "🔀" },
  { id: "universo", label: "Universo", icon: "🌌" },
  { id: "mitologia", label: "Mitología", icon: "🏛️" },
  { id: "dinosaurios", label: "Dinosaurios", icon: "🦕" },
  { id: "videojuegos", label: "Videojuegos", icon: "🎮" },
  { id: "flora-fauna", label: "Flora y Fauna", icon: "🌿" },
  { id: "comidas", label: "Comidas", icon: "🍔" },
  { id: "deportes", label: "Deportes", icon: "⚽" },
  { id: "viajes", label: "Viajes", icon: "✈️" },
];

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadPrizePhotos(files, token) {
  const urls = [];
  for (const file of files) {
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      throw new Error(`Formato no permitido: ${file.name}`);
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error(`${file.name} pesa más de 5MB.`);
    }
    const dataBase64 = await fileToBase64(file);
    const res = await fetch("/api/rifas/upload-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }),
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.error || `No se pudo subir ${file.name}`);
    urls.push(data.url);
  }
  return urls;
}

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

    const { data: sres } = await supabase.auth.getSession();
    const token = sres?.session?.access_token;
    if (!token) {
      alert("Debes iniciar sesión para crear una rifa.");
      router.push("/login");
      return;
    }

    try {
      let photos = [];
      if (prizeType === "physical" && prizePhotos?.length) {
        photos = await uploadPrizePhotos(Array.from(prizePhotos).slice(0, 3), token);
      }

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

      const res = await fetch("/api/rifas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
      alert(err?.message || "No se pudo crear la rifa.");
    }
  }

  return (
    <>
      <Head><title>Crear rifa — Rifex</title></Head>
      <div className={styles.page}>
        <div className="container">
          <div className={styles.formCard}>
            <h1 className={styles.title}>Crear rifa</h1>
            <p className={styles.sub}>Completa los datos. Al guardar, se crearán automáticamente los tickets <strong>1..N</strong>.</p>

            <form onSubmit={onSubmit}>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Datos básicos</div>
                <div className={styles.field} style={{ marginBottom: 12 }}>
                  <input
                    className="rf-pill"
                    placeholder="Título *"
                    value={title}
                    onChange={e=>setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.fieldGrid} style={{ marginBottom: 12 }}>
                  <input className="rf-pill" placeholder="Precio (CLP) *" inputMode="numeric" value={priceClp} onChange={e=>setPriceClp(e.target.value)} required />
                  <input className="rf-pill" placeholder="Cupos / Total de números *" inputMode="numeric" value={totalNumbers} onChange={e=>setTotalNumbers(e.target.value)} required />
                </div>
                <textarea className="rf-pill" rows={4} placeholder="Descripción (opcional)" value={description} onChange={e=>setDescription(e.target.value)} />
              </div>

              {/* Plan + Temática */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Plan y temática</div>
                <div className="rf-toggle" style={{ marginBottom: 16 }}>
                  <button type="button" className={`rf-toggle-btn${plan==="free" ? " active" : ""}`} onClick={()=>setPlan("free")}>Gratis</button>
                  <button type="button" className={`rf-toggle-btn${plan==="pro" ? " active" : ""}`} onClick={()=>setPlan("pro")}>Pro</button>
                </div>

                <div className={styles.themeGrid}>
                  {THEMES.map(t => {
                    const locked = t.id !== "mixto" && proLocked;
                    return (
                      <button
                        type="button"
                        key={t.id}
                        className={styles.themeCard}
                        data-active={theme === t.id}
                        data-locked={locked}
                        onClick={() => !locked && setTheme(t.id)}
                        aria-pressed={theme === t.id}
                      >
                        <div className={styles.themeIcon}>{t.icon}</div>
                        <div className={styles.themeLabel}>{t.label}</div>
                        {locked && <span className={styles.themeLockBadge}>🔒</span>}
                      </button>
                    );
                  })}
                </div>
                <p className={styles.fieldLabel} style={{ fontWeight: 400, color: "var(--gris)" }}>
                  Con plan Gratis solo puedes usar la temática Mixto. Pasa a Pro para desbloquear el resto.
                </p>
              </div>

              {/* Premio */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Tipo de premio</div>
                <div className="rf-toggle" style={{ marginBottom: 16 }}>
                  <button type="button" className={`rf-toggle-btn${prizeType==="money" ? " active" : ""}`} onClick={()=>setPrizeType("money")}>Dinero</button>
                  <button type="button" className={`rf-toggle-btn${prizeType==="physical" ? " active" : ""}`} onClick={()=>setPrizeType("physical")}>Físico</button>
                </div>

                {prizeType==="money" && (
                  <>
                    <div className={styles.field} style={{ marginBottom: 12 }}>
                      <span className={styles.fieldLabel}>Monto del premio (CLP)</span>
                      <input className="rf-pill" type="number" min="0" step="1000" placeholder="Ej: 1000000" value={prizeAmount} onChange={e=>setPrizeAmount(e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>Método de pago del premio</span>
                      <select className="rf-pill" value={payoutMethod} onChange={e=>setPayoutMethod(e.target.value)}>
                        <option value="rifex_transfer">Depósito por Rifex (Plan Gratis)</option>
                        <option value="creator_direct" disabled={proLocked}>Transferencia directa del creador (Pro)</option>
                      </select>
                    </div>
                  </>
                )}

                {prizeType==="physical" && (
                  <>
                    <div className={styles.field} style={{ marginBottom: 12 }}>
                      <span className={styles.fieldLabel}>Fotos del premio (hasta 3)</span>
                      <input type="file" accept="image/*" multiple onChange={e=>setPrizePhotos(Array.from(e.target.files||[]))} />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>Método de entrega</span>
                      <select className="rf-pill" value={deliveryMethod} onChange={e=>setDeliveryMethod(e.target.value)}>
                        <option value="a_convenir">A convenir</option>
                        <option value="retira_en_tienda">Retiro en punto</option>
                        <option value="envio_pagado">Envío pagado por el ganador</option>
                        <option value="envio_incluido">Envío incluido por el creador</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              {/* Fechas + estado */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Fechas y estado</div>
                <div className={styles.fieldGrid} style={{ marginBottom: 12 }}>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Inicio</span>
                    <input className="rf-pill" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Término</span>
                    <input className="rf-pill" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Estado</span>
                  <select className="rf-pill" value={status} onChange={e=>setStatus(e.target.value)}>
                    <option value="draft">Borrador</option>
                    <option value="active">Activa</option>
                    <option value="closed">Cerrada</option>
                  </select>
                </div>
              </div>

              {/* Términos */}
              <div className={styles.section}>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={okBuyer} onChange={e=>setOkBuyer(e.target.checked)} />
                  Acepto los <a href="/terminos#comprador" target="_blank" rel="noreferrer">Términos del comprador</a>
                </label>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={okCreator} onChange={e=>setOkCreator(e.target.checked)} />
                  Acepto los <a href="/terminos#creador" target="_blank" rel="noreferrer">Términos del creador</a> y las <a href="/terminos#rifex" target="_blank" rel="noreferrer">Condiciones de Rifex</a>
                </label>
              </div>

              <div className={styles.section} style={{ display: "flex", gap: 12 }}>
                <button
                  type="submit"
                  className={styles.btnCreate}
                  style={{
                    background: "linear-gradient(135deg, var(--ultramar), var(--trebol))",
                    boxShadow: "0 6px 14px rgba(24,169,87,.22)"
                  }}
                >
                  Crear rifa
                </button>

                <a
                  href="/panel"
                  className={styles.btnCreate}
                  style={{ background:"#fff", color:"var(--ultramar)", border:"1px solid #E5E7EB" }}
                >
                  Cancelar
                </a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

CrearRifaPage.getLayout = (page) => <Layout>{page}</Layout>;
