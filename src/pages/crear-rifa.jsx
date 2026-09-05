// src/pages/crear-rifa.jsx
import { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import { resolveCreationGate } from "@/lib/creationGate";
import Layout from "@/components/Layout";
import styles from "@/styles/crearRifa.module.css";

// AUTH UX 2026 — auth boundary real: sin esto, el formulario completo de
// creación (título, precio, cupos, premio, checkboxes legales) se
// renderizaba en el HTML inicial para cualquier anónimo o crawler.
// PROGRESSIVE ONBOARDING — extiende ese boundary de "solo sesión" a
// elegibilidad real de creador (assertCreatorEligible, vía
// resolveCreationGate): antes, un usuario con sesión pero sin
// onboarding/RUT/Mercado Pago igual veía el formulario completo montado
// en el navegador durante una fracción de segundo, hasta que el
// useEffect de abajo (ahora eliminado) resolvía el chequeo y redirigía.
// La autoridad que bloquea la creación en sí siempre fue server-side
// (POST /api/rifas) — esto cierra el acceso a la página, no cambia esa
// lógica.
export async function getServerSideProps(ctx) {
  return resolveCreationGate(ctx, "/crear-rifa");
}

// RIFEX CLOSURE PASS (2026-08-29): la sección "Temática" se eliminó del
// formulario — auditoría previa confirmó que theme persiste y se lee
// correctamente, pero no controla el set de íconos de los números (eso
// lo resuelve src/hooks/useIconsMap.js con un orden global fijo,
// totalmente independiente de este campo) ni ninguna otra lógica real.
// Toda rifa nueva se crea con theme='mixto' fijo — mismo default que ya
// tenía la columna — para no romper los badges que sí leen theme en
// /rifas y en RaffleIntroModal, ni las rifas históricas con otros
// valores.
const DEFAULT_THEME = "mixto";

// RIFEX CLOSURE PASS (2026-08-29): "a_convenir" deja de ofrecerse en el
// selector para rifas NUEVAS — las condiciones económicas de entrega
// deben conocerse antes de participar. Rifas históricas con
// delivery_method='a_convenir' siguen leyéndose y funcionando igual,
// nunca se migran.
const DELIVERY_METHODS = [
  { id: "retira_en_tienda", label: "Retiro / entrega presencial" },
  { id: "envio_incluido", label: "Envío pagado por el creador" },
  { id: "envio_pagado", label: "Envío pagado por el ganador" },
];

const TRANSFER_EXPENSES_OWNERS = [
  { id: "creator", label: "Creador" },
  { id: "winner", label: "Ganador" },
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

  // PROGRESSIVE ONBOARDING — el chequeo de sesión + onboarding + Trust +
  // Mercado Pago ahora ocurre server-side, antes de que este componente
  // exista siquiera (ver getServerSideProps/resolveCreationGate arriba).
  // El useEffect que antes hacía este mismo chequeo client-side (después
  // de que el formulario ya estaba montado) se eliminó — quedaba
  // estrictamente subsumido por el gate real.

  // Básicos
  const [title, setTitle] = useState("");
  const [priceClp, setPriceClp] = useState("");
  const [totalNumbers, setTotalNumbers] = useState("");
  const [description, setDescription] = useState("");

  // Premio — el único método de pago del premio es transferencia directa
  // del creador (DRAW-UX-FINAL: se retiró "Depósito por Rifex").
  const [prizeType, setPrizeType] = useState("money"); // money | physical
  const [prizeAmount, setPrizeAmount] = useState("");  // CLP
  const PAYOUT_METHOD = "creator_direct";
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [prizePhotos, setPrizePhotos] = useState([]); // File[]

  // RIFEX CLOSURE PASS (2026-08-29): transparencia de premios físicos que
  // requieren transferencia/trámites (ej. vehículo, propiedad). Progressive
  // disclosure: nada de esto se pide si prizeType !== 'physical', y los
  // campos de condiciones solo aparecen si requiresTransfer === true.
  const [requiresTransfer, setRequiresTransfer] = useState(false);
  const [transferOwner, setTransferOwner] = useState("");
  const [transferConditions, setTransferConditions] = useState("");

  // Fechas/estado — "Término" ya no se pide por separado: DRAW-UX-FINAL
  // unificó esa decisión en "Fecha y hora del sorteo" (abajo), que ahora es
  // obligatoria. end_date se deriva automáticamente de la fecha del sorteo
  // al enviar, para que las rifas legacy que sí leen end_date (listados,
  // panel, perfil público) sigan funcionando exactamente igual.
  const [startDate, setStartDate] = useState("");
  const [status, setStatus] = useState("active"); // draft | active | closed

  // DRAW-UX-FINAL: fecha/hora del sorteo — obligatoria para toda rifa
  // nueva (ninguna rifa nueva puede quedar con draw_at=NULL; las rifas
  // legacy ya existentes no se tocan). El creador solo entrega hora "de
  // pared"; la zona horaria la resuelve el backend desde su país real,
  // nunca desde el cliente.
  const [drawDate, setDrawDate] = useState("");
  const [drawTime, setDrawTime] = useState("");
  const [extensionLimit, setExtensionLimit] = useState("0"); // "0".."3"

  // Términos
  const [okBuyer, setOkBuyer] = useState(false);
  const [okCreator, setOkCreator] = useState(false);
  const [okAge, setOkAge] = useState(false);
  const [okPrize, setOkPrize] = useState(false);

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
    if (!okAge) {
      alert("Debes declarar que tienes 18 años o más.");
      return;
    }
    if (!okPrize) {
      alert("Debes declarar que la información del premio es real.");
      return;
    }
    if (prizeType === "money" && !prizeAmount) {
      alert("Indica el monto del premio en CLP.");
      return;
    }
    if (prizeType === "physical" && !deliveryMethod) {
      alert("Indica cómo se entregará el premio.");
      return;
    }
    if (prizeType === "physical" && requiresTransfer) {
      if (!transferOwner) {
        alert("Indica quién asume los gastos de transferencia y trámites.");
        return;
      }
      if (!transferConditions.trim()) {
        alert("Indica las condiciones de transferencia.");
        return;
      }
    }
    if (!drawDate || !drawTime) {
      alert("Indica la fecha y hora del sorteo.");
      return;
    }
    {
      // Chequeo blando en el navegador (referencia, no autoritativo — el
      // backend valida la anticipación mínima real en la timezone del país).
      const approx = new Date(`${drawDate}T${drawTime}`);
      if (!Number.isNaN(approx.getTime()) && approx.getTime() < Date.now() + 10 * 60000) {
        alert("El sorteo debe ser al menos 10 minutos en el futuro.");
        return;
      }
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

        plan: "free",
        theme: DEFAULT_THEME,
        prize_type: prizeType,
        prize_amount_cents: prizeType === "money" ? Math.round(Number(prizeAmount || 0) * 100) : null,
        payout_method: prizeType === "money" ? PAYOUT_METHOD : null,
        delivery_method: prizeType === "physical" ? deliveryMethod : null,
        prize_photos: prizeType === "physical" ? photos : null,
        requires_transfer_procedures: prizeType === "physical" ? requiresTransfer : false,
        transfer_expenses_owner: prizeType === "physical" && requiresTransfer ? transferOwner : null,
        transfer_conditions: prizeType === "physical" && requiresTransfer ? transferConditions.trim() : null,

        start_date: startDate || null,
        // end_date se deriva de la fecha del sorteo (compat V1 — ver arriba).
        end_date: drawDate || null,
        status,

        draw_date: drawDate || null,
        draw_time: drawTime || null,
        extension_limit: Number(extensionLimit) || 0,
        age_confirmed: okAge,
        prize_declaration_confirmed: okPrize,
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
      if (!res.ok || !data?.ok) throw new Error(data?.message || data?.error || "Error");

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

              {/* Premio */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Tipo de premio</div>
                <div className="rf-toggle" style={{ marginBottom: 16 }}>
                  <button
                    type="button"
                    className={`rf-toggle-btn${prizeType==="money" ? " active" : ""}`}
                    onClick={() => {
                      setPrizeType("money");
                      // Cambiar a Dinero limpia cualquier condición física
                      // que se hubiera empezado a llenar — nunca se envía
                      // un estado mixto/residual al servidor.
                      setDeliveryMethod("");
                      setRequiresTransfer(false);
                      setTransferOwner("");
                      setTransferConditions("");
                      setPrizePhotos([]);
                    }}
                  >
                    Dinero
                  </button>
                  <button type="button" className={`rf-toggle-btn${prizeType==="physical" ? " active" : ""}`} onClick={()=>setPrizeType("physical")}>Físico</button>
                </div>

                {prizeType==="money" && (
                  <div className={styles.field} style={{ marginBottom: 12 }}>
                    <span className={styles.fieldLabel}>Monto del premio (CLP)</span>
                    <input className="rf-pill" type="number" min="0" step="1000" placeholder="Ej: 1000000" value={prizeAmount} onChange={e=>setPrizeAmount(e.target.value)} />
                  </div>
                )}

                {prizeType==="physical" && (
                  <>
                    <div className={styles.field} style={{ marginBottom: 16 }}>
                      <span className={styles.fieldLabel}>Fotos del premio (hasta 3)</span>
                      <input type="file" accept="image/*" multiple onChange={e=>setPrizePhotos(Array.from(e.target.files||[]))} />
                    </div>

                    {/* RIFEX CLOSURE PASS: entrega — obligatoria, sin "a
                        convenir" para rifas nuevas. Segmented control en
                        vez de <select> para que las 3 opciones económicas
                        sean visibles de inmediato. */}
                    <div className={styles.field} style={{ marginBottom: 16 }}>
                      <span className={styles.fieldLabel}>Entrega del premio *</span>
                      <div className={styles.radioGroup}>
                        {DELIVERY_METHODS.map((m) => (
                          <label key={m.id} className={styles.radioOption} data-active={deliveryMethod === m.id}>
                            <input
                              type="radio"
                              name="delivery_method"
                              value={m.id}
                              checked={deliveryMethod === m.id}
                              onChange={() => setDeliveryMethod(m.id)}
                            />
                            <span>{m.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* RIFEX CLOSURE PASS: transferencia/trámites — progressive
                        disclosure real, nada se pide hasta elegir "Sí". */}
                    <div className={styles.field} style={{ marginBottom: requiresTransfer ? 12 : 0 }}>
                      <span className={styles.fieldLabel}>¿El premio requiere transferencia o trámites?</span>
                      <div className={styles.radioGroup}>
                        <label className={styles.radioOption} data-active={!requiresTransfer}>
                          <input type="radio" name="requires_transfer" checked={!requiresTransfer} onChange={() => { setRequiresTransfer(false); setTransferOwner(""); setTransferConditions(""); }} />
                          <span>No</span>
                        </label>
                        <label className={styles.radioOption} data-active={requiresTransfer}>
                          <input type="radio" name="requires_transfer" checked={requiresTransfer} onChange={() => setRequiresTransfer(true)} />
                          <span>Sí</span>
                        </label>
                      </div>
                    </div>

                    {requiresTransfer && (
                      <>
                        <div className={styles.field} style={{ marginBottom: 12 }}>
                          <span className={styles.fieldLabel}>Gastos de transferencia y trámites *</span>
                          <div className={styles.radioGroup}>
                            {TRANSFER_EXPENSES_OWNERS.map((o) => (
                              <label key={o.id} className={styles.radioOption} data-active={transferOwner === o.id}>
                                <input
                                  type="radio"
                                  name="transfer_owner"
                                  value={o.id}
                                  checked={transferOwner === o.id}
                                  onChange={() => setTransferOwner(o.id)}
                                />
                                <span>{o.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>Condiciones de transferencia *</span>
                          <textarea
                            className="rf-pill"
                            rows={2}
                            maxLength={280}
                            placeholder="Ej: el ganador paga transferencia e inscripción del vehículo."
                            value={transferConditions}
                            onChange={(e) => setTransferConditions(e.target.value)}
                          />
                          <p className={styles.fieldHelp}>Los gastos y condiciones deben informarse antes de publicar.</p>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Fecha de inicio + estado */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Fecha y estado</div>
                <div className={styles.fieldGrid} style={{ marginBottom: 12 }}>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Inicio</span>
                    <input className="rf-pill" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} />
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
              </div>

              {/* Sorteo */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Sorteo</div>
                <p className={styles.fieldLabel} style={{ fontWeight: 400, color: "var(--gris)", marginBottom: 10 }}>
                  Define cuándo se sortea el ganador. Las ventas se cierran automáticamente 5 minutos antes del sorteo.
                </p>
                <div className={styles.fieldGrid} style={{ marginBottom: 12 }}>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Fecha del sorteo *</span>
                    <input className="rf-pill" type="date" value={drawDate} onChange={e=>setDrawDate(e.target.value)} required />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Hora del sorteo *</span>
                    <input className="rf-pill" type="time" value={drawTime} onChange={e=>setDrawTime(e.target.value)} required />
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "var(--gris)", margin: "-6px 0 12px" }}>
                  Sorteo automático: puede ejecutarse hasta 5 minutos después de la hora indicada.
                </p>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>¿Esta rifa podrá extender su fecha de sorteo?</span>
                  <select className="rf-pill" value={extensionLimit} onChange={e=>setExtensionLimit(e.target.value)}>
                    <option value="0">No</option>
                    <option value="1">Hasta 1 vez</option>
                    <option value="2">Hasta 2 veces</option>
                    <option value="3">Hasta 3 veces</option>
                  </select>
                </div>
              </div>

              {/* Términos */}
              <div className={styles.section}>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={okBuyer} onChange={e=>setOkBuyer(e.target.checked)} />
                  Acepto los <a href="/terminos-rifas#comprador" target="_blank" rel="noreferrer">Términos del comprador</a>
                </label>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={okCreator} onChange={e=>setOkCreator(e.target.checked)} />
                  Acepto los <a href="/terminos-rifas#creador" target="_blank" rel="noreferrer">Términos del creador</a> y las <a href="/terminos-rifas#rifex" target="_blank" rel="noreferrer">Condiciones de Rifex</a>
                </label>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={okAge} onChange={e=>setOkAge(e.target.checked)} />
                  Declaro que tengo 18 años o más. Debes tener 18 años o más para crear una rifa en Rifex.
                </label>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={okPrize} onChange={e=>setOkPrize(e.target.checked)} />
                  Declaro que la información y fotografías del premio son reales y que tengo derecho a ofrecerlo.
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

CrearRifaPage.getLayout = (page) => <Layout noindex>{page}</Layout>;
