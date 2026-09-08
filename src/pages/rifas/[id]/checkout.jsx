// src/pages/rifas/[id]/checkout.jsx
// RIFEX CHECKOUT UNIFICADO V2 (2026-09-07) — reemplaza los modales
// QuantitySelector/BuyerForm de la ficha pública por una experiencia de
// 2 pantallas ("Tus datos" / "Método de pago"), estilo tienda online.
// Cero cambios de lógica de pagos: el submit real sigue siendo el mismo
// POST /api/checkout/mp ya certificado (misma RPC atómica, mismo HOLD_
// MINUTES, mismo assignRandomAvailableNumbers) — esta página solo
// reorganiza cómo se recolectan los datos antes de ese POST.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { supabaseBrowser as supabase } from "../../../lib/supabaseClient";
import { idOrSlugColumn } from "../../../lib/idOrSlug";
import { humanPrizeType } from "../../../lib/raffleLabels";
import styles from "../../../styles/checkoutV2.module.css";

const TERMS_VERSION = "v1.0";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Chile: el usuario solo escribe los 9 dígitos locales (siempre
// empiezan en 9), mismo criterio ya usado en el resto de Rifex para
// teléfono chileno — el "+56" es fijo en la UI, nunca se pide escribirlo.
const PHONE_CL_RE = /^9[0-9]{8}$/;

const PAYMENT_METHODS = [
  { id: "card", icon: "💳", label: "Tarjeta de crédito o débito" },
  { id: "transfer", icon: "🏦", label: "Transferencia bancaria" },
  { id: "balance", icon: "💰", label: "Saldo en cuenta" },
  { id: "other", icon: "⋯", label: "Otro método de pago" },
];

export default function RaffleCheckout() {
  const router = useRouter();
  const { id, qty: qtyParam } = router.query;

  const [raffle, setRaffle] = useState(null);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [step, setStep] = useState("datos"); // 'datos' | 'pago'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [touched, setTouched] = useState({});
  const [method, setMethod] = useState("card");
  const [redirecting, setRedirecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!router.isReady || !id) return;
    (async () => {
      setLoading(true);
      const col = idOrSlugColumn(id);
      const { data, error } = await supabase.from("raffles").select("*").eq(col, id).limit(1);
      if (error || !Array.isArray(data) || !data.length) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const r = data[0];
      setRaffle(r);
      const [{ count: availableCount }] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .eq("raffle_id", r.id).in("status", ["available", "free"]),
      ]);
      setAvailable(availableCount || 0);
      setLoading(false);
    })();
  }, [router.isReady, id]);

  const quantity = useMemo(() => {
    const n = Number.parseInt(qtyParam, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return available > 0 ? Math.min(n, available) : n;
  }, [qtyParam, available]);

  const titleCap = useMemo(() => {
    if (!raffle?.title) return "";
    const s = String(raffle.title);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [raffle?.title]);

  const unitPriceCLP = useMemo(() => Math.round(Number(raffle?.price_cents || 0) / 100), [raffle?.price_cents]);
  const totalCLP = useMemo(
    () => (unitPriceCLP * quantity).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }),
    [unitPriceCLP, quantity]
  );

  // Mismo aviso compacto de costo adicional ya certificado en la ficha
  // pública (RIFEX CLOSURE PASS) — recalculado acá porque esta página
  // hace su propio fetch de la rifa, nunca porque cambió la regla.
  const extraCostNotices = useMemo(() => {
    if (!raffle || raffle.prize_type !== "physical") return [];
    const notices = [];
    if (raffle.delivery_method === "envio_pagado") notices.push("Envío a cargo del ganador.");
    if (raffle.requires_transfer_procedures && raffle.transfer_expenses_owner === "winner") {
      notices.push("Transferencia/trámites a cargo del ganador.");
    }
    return notices;
  }, [raffle]);

  const prizeThumb = Array.isArray(raffle?.prize_photos) && raffle.prize_photos.length ? raffle.prize_photos[0] : null;

  const errors = useMemo(() => {
    const e = {};
    if (!name.trim() || name.trim().length < 3) e.name = "Ingresa tu nombre completo.";
    if (!EMAIL_RE.test(email.trim())) e.email = "Ingresa un correo válido.";
    if (!PHONE_CL_RE.test(phone.trim())) e.phone = "Ingresa 9 dígitos, empezando en 9.";
    if (!accepted) e.accepted = "Debes aceptar los términos de la rifa.";
    return e;
  }, [name, email, phone, accepted]);

  const datosValid = Object.keys(errors).length === 0;

  function markTouched(field) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  const rawIdForBack = typeof id === "string" ? id : "";

  async function handlePagar() {
    if (!raffle?.id || quantity < 1) return;
    setErrorMsg(null);
    try {
      const payload = {
        // UUID real de la rifa — nunca el slug/uuid crudo de la URL de
        // esta página (que pudo llegar tal cual desde /rifas/[id]).
        raffle_id: raffle.id,
        raffleId: raffle.id,
        quantity,
        buyer_email: email.trim(),
        buyer_name: name.trim(),
        // buyer_phone: campo nuevo de UX (mockup de checkout tienda
        // online). No existe columna de persistencia para esto todavía
        // — checkout/mp.js lo ignora silenciosamente (destructuring por
        // nombre, cero cambio de backend). Si se quiere guardar/usar más
        // adelante, requiere una migración aditiva nueva, a autorizar
        // explícitamente — no se agregó una en esta misión.
        buyer_phone: `+56${phone.trim()}`,
        accepted_terms: accepted,
        terms_version: TERMS_VERSION,
      };
      const r = await fetch("/api/checkout/mp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && (data.init_point || data.url)) {
        try { localStorage.setItem("rifex.lastBuyerEmail", email.trim().toLowerCase()); } catch {}
        setRedirecting(true);
        window.location.href = data.init_point || data.url;
        return;
      }
      setErrorMsg(data?.error === "insufficient_availability"
        ? "Ya no quedan suficientes números disponibles para esta cantidad. Vuelve atrás y elige menos."
        : (data?.error || "No se pudo iniciar el pago. Intenta nuevamente."));
    } catch (e) {
      console.error(e);
      setErrorMsg("Error de conexión iniciando el pago. Intenta nuevamente.");
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.centerState}>Cargando…</div>
      </div>
    );
  }

  if (notFound || !raffle) {
    return (
      <div className={styles.page}>
        <div className={styles.centerState}>
          <p>No encontramos esta rifa.</p>
          <a href="/rifas" style={{ color: "#18A957", fontWeight: 700 }}>Volver</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Head>
        <title>{`Checkout — ${titleCap} | Rifex`}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className={styles.shell}>
        <div className={styles.topBar}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => (step === "pago" ? setStep("datos") : router.push(`/rifas/${rawIdForBack}`))}
          >
            ← Volver
          </button>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Cerrar"
            onClick={() => router.push(`/rifas/${rawIdForBack}`)}
          >
            ✕
          </button>
        </div>

        <div className={styles.card}>
          <span className={styles.statusPill}>
            <span className={styles.statusDot} />
            Rifa activa
          </span>
          <h1 className={styles.title}>{titleCap}</h1>
          <p className={styles.subtitle}>
            {step === "datos" ? "Completa la información para continuar." : "Elige cómo quieres pagar tu compra."}
          </p>

          <div className={styles.productRow}>
            <div className={styles.productThumb}>
              {prizeThumb ? <img src={prizeThumb} alt="" /> : <span style={{ color: "#fff", fontSize: 22 }}>🎁</span>}
            </div>
            <div className={styles.productInfo}>
              <p className={styles.productName}>{titleCap}</p>
              <p className={styles.productMeta}>{quantity} {quantity === 1 ? "número" : "números"} · {humanPrizeType(raffle.prize_type || "physical")}</p>
            </div>
            <div className={styles.productTotal}>{totalCLP}</div>
          </div>

          {extraCostNotices.length > 0 && (
            <div className={styles.extraCostNotice}>⚠️ {extraCostNotices.join(" ")}</div>
          )}

          {errorMsg && <div className={styles.errorBanner}>{errorMsg}</div>}

          {step === "datos" && (
            <>
              <h2 className={styles.sectionTitle}>Información personal</h2>

              <div className={styles.field}>
                <label className={styles.label}>Nombre completo</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>👤</span>
                  <input
                    className={`${styles.input} ${touched.name && errors.name ? styles.inputError : ""}`}
                    placeholder="Tu nombre y apellido"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => markTouched("name")}
                  />
                </div>
                {touched.name && errors.name && <p className={styles.fieldErrorText}>{errors.name}</p>}
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Correo electrónico</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>✉️</span>
                  <input
                    className={`${styles.input} ${touched.email && errors.email ? styles.inputError : ""}`}
                    placeholder="tu@correo.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => markTouched("email")}
                  />
                </div>
                {touched.email && errors.email && <p className={styles.fieldErrorText}>{errors.email}</p>}
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Teléfono</label>
                <div className={styles.phoneRow}>
                  <span className={styles.phonePrefix}>🇨🇱 +56</span>
                  <div className={styles.inputWrap}>
                    <span className={styles.inputIcon}>📱</span>
                    <input
                      className={`${styles.input} ${touched.phone && errors.phone ? styles.inputError : ""}`}
                      placeholder="9 1234 5678"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
                      onBlur={() => markTouched("phone")}
                    />
                  </div>
                </div>
                {touched.phone && errors.phone && <p className={styles.fieldErrorText}>{errors.phone}</p>}
              </div>

              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => { setAccepted(e.target.checked); markTouched("accepted"); }}
                />
                <span>
                  Acepto los <a href="/terminos-rifas" target="_blank" rel="noreferrer">Términos y condiciones</a> de la rifa.
                </span>
              </label>

              <button
                type="button"
                className={styles.primaryBtn}
                style={{ marginTop: 14 }}
                disabled={!datosValid}
                onClick={() => {
                  setTouched({ name: true, email: true, phone: true, accepted: true });
                  if (datosValid) setStep("pago");
                }}
              >
                Continuar al pago →
              </button>

              <p className={styles.secondaryLink} style={{ margin: "14px 0 0" }}>
                🔒 Tus datos están protegidos. Solo los usamos para procesar tu compra y notificarte.
              </p>
            </>
          )}

          {step === "pago" && (
            <>
              <h2 className={styles.sectionTitle}>Método de pago</h2>

              <div className={styles.methodList}>
                {PAYMENT_METHODS.map((m) => (
                  <div
                    key={m.id}
                    className={`${styles.methodCard} ${method === m.id ? styles.methodCardActive : ""}`}
                    onClick={() => setMethod(m.id)}
                  >
                    <span className={styles.methodIcon}>{m.icon}</span>
                    <span className={styles.methodLabel}>{m.label}</span>
                    <span className={styles.methodRadio} />
                  </div>
                ))}
              </div>

              <div className={styles.summaryTotalRow}>
                <span className={styles.summaryTotalLabel}>Total a pagar</span>
                <span className={styles.summaryTotalValue}>{totalCLP}</span>
              </div>

              <button type="button" className={styles.primaryBtn} onClick={handlePagar}>
                🔒 Pagar {totalCLP} →
              </button>

              <div className={styles.trustFooter}>
                <span className={styles.trustItem}>✅ Organizador verificado</span>
                <span className={styles.trustItem}>💎 Transparencia total</span>
                <span className={styles.trustItem}>🔒 Tus datos protegidos</span>
              </div>
            </>
          )}
        </div>

        <div className={styles.stepsFooter}>
          <div className={styles.stepItem}>
            <span className={`${styles.stepCircle} ${styles.stepCircleMuted}`}>1</span>
            <span className={styles.stepLabel}>Selecciona la cantidad</span>
            <span className={styles.stepSub}>Elige cuántos números quieres comprar.</span>
          </div>
          <div className={styles.stepItem}>
            <span className={`${styles.stepCircle} ${step === "datos" ? "" : styles.stepCircleMuted}`}>2</span>
            <span className={styles.stepLabel}>Tus datos</span>
            <span className={styles.stepSub}>Completa la información solicitada.</span>
          </div>
          <div className={styles.stepItem}>
            <span className={`${styles.stepCircle} ${step === "pago" ? "" : styles.stepCircleMuted}`}>3</span>
            <span className={styles.stepLabel}>Pago</span>
            <span className={styles.stepSub}>Elige tu método de pago y confirma.</span>
          </div>
        </div>
      </div>

      {redirecting && (
        <div className={styles.redirectingOverlay}>
          <div className={styles.spinner} />
          <p style={{ fontWeight: 700, color: "#0f172a" }}>Redirigiendo a pago seguro…</p>
        </div>
      )}
    </div>
  );
}
