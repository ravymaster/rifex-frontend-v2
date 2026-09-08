// src/pages/rifas/[id]/checkout.jsx
// RIFEX CHECKOUT V2 — UX CORRECTION PASS (2026-09-07). Pantalla única
// "Finaliza tu compra": foto real del premio + resumen + datos del
// comprador (nombre, correo, términos) + un solo CTA. Sin teléfono, sin
// pantalla "Método de pago" ficticia, sin stepper 1-2-3. Cero cambios de
// lógica de pagos: el submit real sigue siendo el mismo
// POST /api/checkout/mp ya certificado (misma RPC atómica, mismo
// HOLD_MINUTES, mismo assignRandomAvailableNumbers).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { supabaseBrowser as supabase } from "../../../lib/supabaseClient";
import { idOrSlugColumn } from "../../../lib/idOrSlug";
import { humanPrizeType } from "../../../lib/raffleLabels";
import { formatDrawAt } from "../../../lib/raffleTime";
import styles from "../../../styles/checkoutV2.module.css";

const TZ_LABELS = {
  "America/Santiago": "Hora de Chile",
  "America/Argentina/Buenos_Aires": "Hora de Argentina",
};

const TERMS_VERSION = "v1.0";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RaffleCheckout() {
  const router = useRouter();
  const { id, qty: qtyParam } = router.query;

  const [raffle, setRaffle] = useState(null);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [touched, setTouched] = useState({});
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
      const { count: availableCount } = await supabase.from("tickets").select("id", { count: "exact", head: true })
        .eq("raffle_id", r.id).in("status", ["available", "free"]);
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
  const unitFmt = useMemo(
    () => unitPriceCLP.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }),
    [unitPriceCLP]
  );
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

  // RIFEX 2026 PHOTO-FIRST — misma portada real ya usada por PrizeGallery
  // en la ficha pública y por la Buy Box (raffle.prize_photos[0]), sin
  // pipeline de imágenes nuevo. Para premio en dinero, si la rifa tiene
  // fotos declaradas se usa igual la portada real; nunca se inventa una.
  // FINAL VISUAL LOCK (2026-09-08) — acá se muestra como miniatura (nunca
  // como foto hero): ese rol ya lo cumple la columna izquierda de la
  // ficha pública.
  const prizeThumb = Array.isArray(raffle?.prize_photos) && raffle.prize_photos.length ? raffle.prize_photos[0] : null;

  const drawInfo = raffle?.draw_at && raffle?.timezone ? formatDrawAt(raffle.draw_at, raffle.timezone) : null;
  const tzLabel = raffle?.timezone ? (TZ_LABELS[raffle.timezone] || raffle.timezone) : null;

  const errors = useMemo(() => {
    const e = {};
    if (!name.trim() || name.trim().length < 3) e.name = "Ingresa tu nombre completo.";
    if (!EMAIL_RE.test(email.trim())) e.email = "Ingresa un correo válido.";
    if (!accepted) e.accepted = "Debes aceptar los términos de la rifa.";
    return e;
  }, [name, email, accepted]);

  const formValid = Object.keys(errors).length === 0;
  const rawIdForBack = typeof id === "string" ? id : "";

  function markTouched(field) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  async function handleContinuar() {
    setTouched({ name: true, email: true, accepted: true });
    if (!formValid || !raffle?.id || quantity < 1) return;
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
        ? "Ya no quedan suficientes números disponibles para esta cantidad. Vuelve a la rifa y elige menos."
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
        <a className={styles.backLink} href={`/rifas/${rawIdForBack}`}>← Volver a la rifa</a>

        <div className={styles.card}>
          <div className={styles.checkoutGrid}>
            <div className={styles.gridHead}>
              <h1 className={styles.title}>Finaliza tu compra</h1>
              <p className={styles.subtitle}>Completa tus datos y revisa tu compra.</p>
              {errorMsg && <div className={styles.errorBanner}>{errorMsg}</div>}
            </div>

            <div className={styles.gridSummary}>
              <p className={styles.summaryTitle}>Resumen de tu compra</p>
              <div className={styles.summaryHead}>
                <div className={styles.summaryThumb}>
                  {prizeThumb ? <img src={prizeThumb} alt="" /> : <span className={styles.summaryThumbFallback}>🎁</span>}
                </div>
                <div className={styles.summaryHeadText}>
                  <p className={styles.summaryPrizeName}>{titleCap}</p>
                  <p className={styles.summaryPrizeMeta}>{humanPrizeType(raffle.prize_type || "physical")}</p>
                </div>
              </div>
              {extraCostNotices.length > 0 && (
                <div className={styles.extraCostNotice}>⚠️ {extraCostNotices.join(" ")}</div>
              )}
              {drawInfo && (
                <div className={styles.summaryRow}><span>Sorteo</span><b>{drawInfo.date} · {drawInfo.time}{tzLabel ? ` · ${tzLabel}` : ""}</b></div>
              )}
              <div className={styles.summaryRow}><span>Cantidad</span><b>{quantity} {quantity === 1 ? "número" : "números"}</b></div>
              <div className={styles.summaryRow}><span>Precio por número</span><b>{unitFmt}</b></div>
              <div className={styles.summaryTotalRow}><span>Total</span><b>{totalCLP}</b></div>
            </div>

            <div className={styles.gridForm}>
              <div className={styles.field}>
                <label className={styles.label}>Nombre completo</label>
                <input
                  className={`${styles.input} ${touched.name && errors.name ? styles.inputError : ""}`}
                  placeholder="Tu nombre y apellido"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => markTouched("name")}
                />
                {touched.name && errors.name && <p className={styles.fieldErrorText}>{errors.name}</p>}
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Correo electrónico</label>
                <input
                  className={`${styles.input} ${touched.email && errors.email ? styles.inputError : ""}`}
                  placeholder="tu@correo.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                />
                {touched.email && errors.email && <p className={styles.fieldErrorText}>{errors.email}</p>}
              </div>
            </div>

            <div className={styles.gridTerms}>
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
            </div>

            <div className={styles.gridCta}>
              <button type="button" className={styles.primaryBtn} disabled={!formValid} onClick={handleContinuar}>
                Continuar al pago →
              </button>
              <p className={styles.trustFootnote}>🔒 Tus datos están protegidos. Compra procesada de forma segura.</p>
            </div>
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
