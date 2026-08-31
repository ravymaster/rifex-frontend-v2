// src/pages/rifas/[id].jsx
import { useRouter } from "next/router";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "../../lib/supabaseClient";
import styles from "../../styles/rifaDetalle.module.css";
import { getIconByNumber } from "../../hooks/useIconsMap";
import Layout from "../../components/Layout";
import TrustBadge from "../../components/TrustBadge";
import TrustPopup from "../../components/TrustPopup";
import { canonicalUrl, DEFAULT_OG_IMAGE } from "../../lib/publicMetadata";

import RaffleIntroModal from "../../components/rifex/RaffleIntroModal";
import BuyerForm from "../../components/rifex/BuyerForm";
import { formatDrawAt, formatDateOnly } from "../../lib/raffleTime";

const TERMS_VERSION = "v1.0";
const TZ_LABELS = {
  "America/Santiago": "Hora de Chile",
  "America/Argentina/Buenos_Aires": "Hora de Argentina",
};
const BANNER_AUTO_HIDE_MS = 15000; // 15s
const MODAL_AUTO_HIDE_MS  = 12000; // 12s

// RIFEX CLOSURE PASS (2026-08-29) — etiquetas neutras de entrega, incluye
// el valor legado 'a_convenir' (rifas históricas, ya no ofrecible para
// rifas nuevas desde crear-rifa.jsx, pero deben seguir mostrándose bien).
const DELIVERY_METHOD_LABELS = {
  retira_en_tienda: "Retiro / entrega presencial",
  envio_incluido: "Envío incluido por el creador",
  envio_pagado: "Envío a cargo del ganador",
  a_convenir: "A convenir con el creador",
};

export default function RifaDetalle() {
  const router = useRouter();
  const { id } = router.query;

  const [raffle, setRaffle] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState([]);
  const [showIntro, setShowIntro] = useState(false);
  const [showBuyer, setShowBuyer] = useState(false);

  const [payBanner, setPayBanner] = useState(null);       // {kind,text}
  const [paymentResult, setPaymentResult] = useState(null); // 'approved'|'pending'|'rejected'|null

  // Ganador (fijo)
  const [winner, setWinner] = useState(null);

  // Spinner overlay durante la redirección a MP
  const [redirecting, setRedirecting] = useState(false);

  const availableStatuses = new Set(["available", "free"]);

  useEffect(() => {
    if (!id) return;
    loadData(id);
    loadWinner(id);
  }, [id]);

  // Mostrar/ocultar intro según ganador / preferencia del usuario / query
  useEffect(() => {
    if (!id) return;

    // si ya hay ganador, nunca mostrar intro
    if (winner) {
      setShowIntro(false);
      return;
    }
    // override por query (?noIntro=1)
    const qNoIntro = (router.query?.noIntro || router.query?.nointro) === "1";
    if (qNoIntro) {
      setShowIntro(false);
      return;
    }
    // sólo si no lo cerró antes
    try {
      const dismissed = localStorage.getItem(`rifex.intro.dismissed:${id}`) === "1";
      setShowIntro(!dismissed);
    } catch {
      setShowIntro(true);
    }
  }, [id, winner, router.query]);

  // helpers ganador
  async function loadWinner(rid) {
    try {
      const r = await fetch(`/api/raffles/winner?rid=${rid}`);
      const j = await r.json().catch(() => null);
      if (j?.ok) setWinner(j.winner || null);
    } catch {}
  }
  async function ensureWinner(rid) {
    try {
      const r = await fetch(`/api/raffles/winner?rid=${rid}&ensure=1`);
      const j = await r.json().catch(() => null);
      if (j?.ok && j.winner) setWinner(j.winner);
    } catch {}
  }

  const scrollTop = () => { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {} };

  // Retorno de MP: confirmación + refrescos + (posible) sorteo
  useEffect(() => {
    if (!router.isReady || !id) return;

    const q = router.query || {};
    const flag  = (q.pay || q.status || "").toLowerCase();        // success|failure|pending
    const cstat = (q.collection_status || "").toLowerCase();      // approved|in_process|rejected
    const cid   = q.collection_id || q.payment_id || null;

    if (!flag && !cstat && !cid) return;

    setShowIntro(false);
    scrollTop();
    setPayBanner({ kind: "success", text: "Confirmando pago…" });

    (async () => {
      let status = "unknown";
      try {
        if (cid) {
          const r = await fetch(`/api/checkout/confirm?collection_id=${cid}`);
          const j = await r.json().catch(() => null);
          if (j?.ok && j.status) status = j.status;
        }
      } catch {}

      let final;
      if (status === "approved" || flag === "success" || cstat === "approved") final = "approved";
      else if (status === "in_process" || status === "pending" || flag === "pending" || cstat === "in_process") final = "pending";
      else final = "rejected";

      if (final === "approved") setPayBanner({ kind: "success", text: "Pago aprobado. Actualizando…" });
      else if (final === "pending") setPayBanner({ kind: "warn", text: "Pago pendiente. Se actualizará al aprobarse." });
      else setPayBanner({ kind: "error", text: "Pago rechazado o cancelado." });

      setPaymentResult(final);

      await loadData(id);
      setTimeout(() => loadData(id), 3000);

      if (final === "approved") {
        await ensureWinner(id);
      }

      setTimeout(() => setPaymentResult(null), MODAL_AUTO_HIDE_MS);
      setTimeout(() => setPayBanner(null), BANNER_AUTO_HIDE_MS);

      // limpiar query de retorno
      setTimeout(() => {
        const { pathname, query } = router;
        const clean = { ...query };
        delete clean.pay; delete clean.status;
        delete clean.collection_status; delete clean.collection_id;
        delete clean.payment_id; delete clean.external_reference;
        router.replace({ pathname, query: clean }, undefined, { shallow: true });
      }, BANNER_AUTO_HIDE_MS + 500);
    })();
  }, [router.isReady, router.query, id]);

  // Liberar reservas vencidas + refrescar si liberó algo
  useEffect(() => {
    if (!id) return;
    const hit = async () => {
      try {
        const r = await fetch(`/api/tickets/release-expired?rid=${id}`);
        const j = await r.json().catch(() => null);
        if (j?.ok && j.released > 0) await loadData(id);
      } catch {}
    };
    hit();
    const timer = setInterval(hit, 30_000);
    return () => clearInterval(timer);
  }, [id]);

  // Realtime en tickets
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`raffle-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", filter: `raffle_id=eq.${id}` },
        async () => {
          await loadData(id);
          await loadWinner(id);
        }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [id]);

  // mapeos compat
  function mapRaffleFromOld(r) {
    if (!r) return null;
    return {
      id: r.id,
      title: r.titulo ?? r.title ?? "Rifa",
      description: r.descripcion ?? r.description ?? "",
      prize_description: r.prize_description ?? r.descripcion_premio ?? r.description ?? "",
      price_cents: typeof r.precio_clp === "number" ? r.precio_clp * 100 : r.price_cents ?? 0,
      prize_amount_cents: r.prize_amount_cents ?? 0,
      total_numbers: r.cupos ?? r.total_numbers ?? 100,
      theme: Array.isArray(r.temas) && r.temas.length ? r.temas[0] : r.theme ?? "Mixto",
      status: r.estado ?? r.status ?? "activa",
      end_date: r.termino ?? r.end_date ?? null,
      start_date: r.inicio ?? r.start_date ?? null,
      creator_id: r.creador_id ?? r.creator_id ?? null,
      creator_trust_level: r.creator_trust_level ?? null,
      created_at: r.created_at,
    };
  }
  function mapTicketFromOld(t) {
    if (!t) return null;
    const number = t.num ?? t.number;
    const rawStatus = t.status ?? "available";
    const status =
      rawStatus === "free" ? "available" :
      rawStatus === "reserved" ? "pending" :
      rawStatus === "paid" ? "sold" : rawStatus;
    return {
      id: t.id,
      raffle_id: t.rifa_id ?? t.raffle_id,
      number,
      status,
      holder_user: t.holder_user ?? null,
      payment_ref: t.payment_ref ?? null,
      created_at: t.created_at,
    };
  }

  async function loadData(rid) {
    try {
      setLoading(true);

      let raffleData = null;

      { const { data, error } = await supabase.from("raffles").select("*").eq("id", rid).limit(1);
        if (!error && Array.isArray(data) && data.length) raffleData = data[0]; }
      if (!raffleData) {
        const { data, error } = await supabase.from("raffles_compat").select("*").eq("id", rid).limit(1);
        if (!error && Array.isArray(data) && data.length) raffleData = data[0];
      }
      if (!raffleData) {
        const { data, error } = await supabase.from("rifas").select("*").eq("id", rid).limit(1);
        if (!error && Array.isArray(data) && data.length) raffleData = mapRaffleFromOld(data[0]);
      }

      let ticketsData = [];
      { const { data, error } = await supabase.from("tickets").select("*").eq("raffle_id", rid).order("number", { ascending: true });
        if (!error && Array.isArray(data) && data.length) ticketsData = data; }
      if (!ticketsData.length) {
        const { data, error } = await supabase.from("tickets_compat").select("*").eq("raffle_id", rid).order("number", { ascending: true });
        if (!error && Array.isArray(data) && data.length) ticketsData = data;
      }
      if (!ticketsData.length) {
        const { data, error } = await supabase.from("rifa_tickets").select("*").eq("rifa_id", rid).order("num", { ascending: true });
        if (!error && Array.isArray(data) && data.length) ticketsData = data.map(mapTicketFromOld).filter(Boolean);
      }

      setRaffle(raffleData);
      setTickets(ticketsData || []);
      setError(null);
    } catch (e) {
      console.error("[rifa load error]", e);
      setError(`No se pudo cargar la rifa: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  const titleCap = useMemo(() => {
    if (!raffle?.title) return "";
    const s = String(raffle.title);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [raffle?.title]);

  const priceCLP = useMemo(() => {
    const n = Number(raffle?.price_cents || 0) / 100;
    return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  }, [raffle?.price_cents]);

  const prizeCLP = useMemo(() => {
    const n = Number(raffle?.prize_amount_cents || 0) / 100;
    return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  }, [raffle?.prize_amount_cents]);

  // RIFEX CLOSURE PASS (2026-08-29) — "Información del premio" pública:
  // un único bloque, solo con lo que aplica. Nunca inventa información
  // sobre rifas históricas — requires_transfer_procedures=false en una
  // rifa vieja significa "no declaró trámites bajo este contrato", nunca
  // "transferencia incluida" (ver migración de la columna).
  const premioInfo = useMemo(() => {
    if (!raffle || raffle.prize_type !== "physical") return null;
    const rows = [];

    if (raffle.delivery_method) {
      const label = DELIVERY_METHOD_LABELS[raffle.delivery_method] || raffle.delivery_method;
      if (raffle.delivery_method === "envio_pagado") {
        rows.push({
          tone: "amber",
          title: "Importante sobre el premio",
          lines: ["Este es un premio físico.", "El costo de envío será asumido por el ganador."],
        });
      } else if (raffle.delivery_method === "envio_incluido") {
        rows.push({
          tone: "green",
          title: "Envío incluido",
          lines: ["El costo de envío será asumido por el creador."],
        });
      } else {
        rows.push({ tone: "neutral", title: "Entrega del premio", lines: [label] });
      }
    }

    if (raffle.requires_transfer_procedures) {
      if (raffle.transfer_expenses_owner === "winner") {
        rows.push({
          tone: "amber",
          title: "Importante sobre el premio",
          lines: [
            "Este premio requiere transferencia o trámites.",
            "Los gastos asociados serán asumidos por el ganador.",
            "Revisa las condiciones antes de participar.",
          ],
          conditions: raffle.transfer_conditions,
        });
      } else if (raffle.transfer_expenses_owner === "creator") {
        rows.push({
          tone: "green",
          title: "Transferencia incluida",
          lines: ["Los gastos y trámites informados serán asumidos por el creador."],
          conditions: raffle.transfer_conditions,
        });
      }
    }

    return rows.length ? rows : null;
  }, [raffle]);

  // RIFEX CLOSURE PASS (2026-08-29) — resumen MUY compacto para el punto
  // natural inmediatamente anterior al pago (BuyerForm): solo lo que
  // implica un costo adicional a cargo del ganador, nunca los casos
  // positivos (esos ya se ven arriba en "Información del premio").
  const extraCostNotices = useMemo(() => {
    if (!raffle || raffle.prize_type !== "physical") return [];
    const notices = [];
    if (raffle.delivery_method === "envio_pagado") notices.push("Envío a cargo del ganador.");
    if (raffle.requires_transfer_procedures && raffle.transfer_expenses_owner === "winner") {
      notices.push("Transferencia/trámites a cargo del ganador.");
    }
    return notices;
  }, [raffle]);

  const selectedTotalCLP = useMemo(() => {
    const n = (Number(raffle?.price_cents || 0) / 100) * selected.length;
    return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  }, [raffle?.price_cents, selected.length]);

  // DRAW-1: gate de tiempo — solo si la rifa configuró sales_end_at. Rifas
  // V1 (sales_end_at=NULL) nunca quedan bloqueadas acá.
  const salesClosed = !!(raffle?.sales_end_at && Date.now() >= new Date(raffle.sales_end_at).getTime());
  const drawInfo = raffle?.draw_at && raffle?.timezone ? formatDrawAt(raffle.draw_at, raffle.timezone) : null;
  const tzLabel = raffle?.timezone ? (TZ_LABELS[raffle.timezone] || raffle.timezone) : null;

  function isSelected(n) { return selected.includes(n); }
  function toggleNumber(n, isFree) {
    if (!isFree || salesClosed) return;
    setSelected((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]);
  }

  async function comprar(buyer) {
    if (selected.length === 0) return;
    try {
      try { localStorage.setItem("rifex.lastBuyerEmail", String(buyer?.email || "").trim().toLowerCase()); } catch {}
      const payload = {
        raffle_id: id,
        raffleId: id,
        numbers: selected,
        buyer_email: buyer?.email || null,
        buyer_name: buyer?.name || null,
        accepted_terms: !!buyer?.accepted_terms,
        terms_version: TERMS_VERSION,
      };
      const r = await fetch("/api/checkout/mp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && (data.init_point || data.url)) {
        // 🔵 Mostrar overlay spinner antes de salir a MP
        setRedirecting(true);
        // Evita doble click mientras se navega
        setShowBuyer(false);
        window.location.href = data.init_point || data.url;
        return;
      }
      alert(data?.error || "No se pudo iniciar el checkout.");
    } catch (e) {
      console.error(e);
      setRedirecting(false);
      alert("Error iniciando checkout.");
    }
  }

  if (loading) {
    return (<div className={styles.page}><div className={styles.loading}>Cargando rifa…</div></div>);
  }
  if (error) {
    return (<div className={styles.page}><div className={styles.error}>{error}</div></div>);
  }
  // Fallback visible (evita pantalla en blanco)
  if (!raffle) {
    return (
      <div className={styles.page} style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <div className={styles.error}>
          No encontramos esta rifa. Revisa el enlace o vuelve al <a href="/panel">panel</a>.
        </div>
      </div>
    );
  }

  const creatorId = raffle?.creator_id || raffle?.creador_id || raffle?.user_id || null;

  // Si hay cualquier overlay/modal/banner/redirect, ocultamos el CTA
  const hasAnyModalOrOverlay =
    !!showIntro || !!showBuyer || !!paymentResult || !!redirecting || !!payBanner;

  // —— FIX de superposición / stacking contexts ——
  // Aislamos el contenedor de página para controlar las capas.
  // Cuando hay un overlay de pantalla completa (spinner de MP, modal de
  // confirmación), subimos el z-index del propio contenedor por encima del
  // header sticky del sitio: "isolation: isolate" atrapa hasta los elementos
  // position:fixed dentro de este contexto, así que sin esto el header
  // quedaría visualmente encima del overlay durante el flujo de pago.
  const pageIsolated = {
    position: "relative",
    isolation: "isolate",
    zIndex: hasAnyModalOrOverlay ? 3500 : "auto",
  };

  const bannerStyle = (kind) => ({
    margin: "8px 0 12px",
    padding: "10px 40px 10px 12px",
    borderRadius: 10,
    fontWeight: 700,
    position: "relative",
    zIndex: 200, // <- por encima de la grilla/CTA
    ...(kind === "success"
      ? { background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }
      : kind === "error"
      ? { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }
      : { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }),
  });
  const bannerClose = {
    position: "absolute", top: 6, right: 8, width: 28, height: 28, borderRadius: 999,
    border: "none", background: "#f1f5f9", color: "#0f172a", fontWeight: 800,
    cursor: "pointer", display: "grid", placeItems: "center", lineHeight: 1, zIndex: 201
  };

  const winnerStyle = {
    margin: "4px 0 12px",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #bbf7d0",
    background: "#ecfdf5",
    color: "#065f46",
    fontWeight: 700,
    position: "relative",
    zIndex: 150 // sobre la grilla
  };
  const winnerSmall = { fontWeight: 500, fontSize: 12, color: "#065f46" };

  // estilos modal
  const mBackdrop = { position: "fixed", inset: 0, background: "rgba(2,6,23,.55)", display: "grid", placeItems: "center", zIndex: 2000 };
  const mBox = { width: "min(520px, 92vw)", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 24px 60px rgba(2,6,23,.25)", padding: "16px 18px", position: "relative" };
  const mTitle = { fontSize: 18, fontWeight: 800, margin: "2px 0 8px" };
  const mP = { margin: "0 0 12px", color: "#0f172a" };
  const mBtn = { display: "inline-block", border: "none", background: "linear-gradient(90deg,#1E3A8A,#18A957)", color: "#fff", fontWeight: 800, borderRadius: 999, padding: "10px 16px", cursor: "pointer" };
  const mClose = { position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 999, border: "none", background: "#f1f5f9", color: "#0f172a", fontWeight: 800, cursor: "pointer", display: "grid", placeItems: "center", lineHeight: 1 };

  return (
    <div className={styles.page} style={pageIsolated}>
      <Head>
        <title key="title">{`${titleCap || "Rifa"} — Información y condiciones | Rifex`}</title>
        <meta
          key="description"
          name="description"
          content="Consulta organizador, finalidad, premio, fecha, condiciones y estado de confianza de esta iniciativa en Rifex."
        />
        {/* RIFEX V4 A6 — landing individual con premio: fuera de catálogo/sitemap,
            noindex pero follow (así Facebook/WhatsApp/X pueden seguir generando
            la vista previa aunque no se indexe en buscadores), canonical propia.
            key="robots" pisa el <meta robots> que Layout agregaría solo si se le
            pasara noindex — acá se define directamente el valor exacto de V4. */}
        <meta key="robots" name="robots" content="noindex, follow, noarchive" />
        <link key="canonical" rel="canonical" href={canonicalUrl(`/rifas/${id || ""}`)} />
        <meta key="og:title" property="og:title" content={`${titleCap || "Rifa"} — Información de la iniciativa`} />
        <meta
          key="og:description"
          property="og:description"
          content="Consulta organizador, finalidad, fecha, condiciones y estado de confianza en Rifex."
        />
        <meta key="og:url" property="og:url" content={canonicalUrl(`/rifas/${id || ""}`)} />
        <meta key="og:type" property="og:type" content="website" />
        <meta key="og:image" property="og:image" content={DEFAULT_OG_IMAGE} />
        <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
      </Head>
      <TrustPopup trustLevel={raffle?.creator_trust_level ?? null} />

      {/* Overlay spinner durante la redirección a MP */}
      {redirecting && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: "fixed", inset: 0, background: "rgba(2,6,23,.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 3000, // por encima de todo
            backdropFilter: "blur(1px)"
          }}
        >
          <div style={{ textAlign: "center", color: "#fff" }}>
            <div
              aria-hidden="true"
              style={{
                width: 68, height: 68, border: "6px solid rgba(255,255,255,.35)",
                borderTop: "6px solid #18A957", borderRadius: "50%",
                animation: "rfx-spin 1s linear infinite", margin: "0 auto 16px"
              }}
            />
            <div style={{ fontWeight: 800 }}>Redirigiendo a Mercado Pago…</div>
          </div>
        </div>
      )}

      <RaffleIntroModal
        open={showIntro}
        onClose={() => {
          setShowIntro(false);
          try { localStorage.setItem(`rifex.intro.dismissed:${id}`, "1"); } catch {}
        }}
        raffle={raffle}
      />

      <div className={styles.card} style={{ position: "relative" }}>
        {winner && (
          <div style={winnerStyle}>
            🏆 Número ganador: <b>{winner.number}</b>
            {" — "}
            {winner.buyer_name || winner.buyer_email || "Comprador"}
            <div style={winnerSmall}>
              Seleccionado el {new Date(winner.created_at).toLocaleString("es-CL")}
            </div>
          </div>
        )}

        {payBanner && (
          <div style={bannerStyle(payBanner.kind)}>
            <button style={bannerClose} aria-label="Cerrar aviso" title="Cerrar" onClick={() => setPayBanner(null)}>×</button>
            {payBanner.text}
          </div>
        )}

        {/* Encabezado */}
        <div className={styles.head}>
          <span className={styles.statusPill}>● {raffle.status || "activa"}</span>
          <h1 className={styles.title}>{titleCap}</h1>
          <p className={styles.sub}>{raffle.description || ""}</p>
        </div>

        {/* Info top */}
        <div className={styles.topInfo}>
          <div className={`${styles.infoItem} ${styles.infoItemHi}`}>
            <div className={styles.infoLabel}>Premio</div>
            <div className={styles.infoValue}>{prizeCLP}</div>
            <div className={styles.infoSub}>{raffle.prize_description || "—"}</div>
          </div>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>Valor del número</div>
            <div className={styles.infoValue}>{priceCLP}</div>
            <div className={styles.infoSub}>{raffle.total_numbers ? `Total ${raffle.total_numbers}` : "\u00A0"}</div>
          </div>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>Termina</div>
            <div className={styles.infoValue}>{raffle.end_date ? (formatDateOnly(raffle.end_date) ?? "—") : "—"}</div>
            <div className={styles.infoSub}>{" "}</div>
          </div>
        </div>

        {/* DRAW-1: estado público del lifecycle temporal (sin copy técnico) */}
        {(drawInfo || (raffle?.extension_limit ?? 0) > 0) && !winner && (
          <div style={{ margin: "4px 0 12px", padding: "12px 14px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#0f172a", fontSize: 14, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700 }}>{salesClosed ? "Ventas cerradas" : "Ventas abiertas"}</div>
            {drawInfo && (
              <div>Sorteo: {drawInfo.date} · {drawInfo.time}{tzLabel ? ` · ${tzLabel}` : ""}</div>
            )}
            {drawInfo && (
              <div style={{ color: "#94a3b8", fontSize: 12 }}>
                Sorteo automático: puede ejecutarse hasta 5 minutos después de la hora indicada.
              </div>
            )}
            {drawInfo && <div style={{ color: "#64748b" }}>Ventas cierran 5 minutos antes del sorteo.</div>}
            {(raffle?.extension_limit ?? 0) > 0 && (
              <div style={{ color: "#64748b" }}>
                {(raffle?.extensions_used ?? 0) > 0
                  ? `Fecha de sorteo modificada · ${raffle.extensions_used} de ${raffle.extension_limit} extensiones utilizadas.`
                  : `Esta rifa puede extender su fecha de sorteo hasta ${raffle.extension_limit} ${raffle.extension_limit === 1 ? "vez" : "veces"}. Cualquier cambio será informado a los participantes.`}
              </div>
            )}
          </div>
        )}

        {/* RIFEX CLOSURE PASS (2026-08-29): un único bloque público con las
            condiciones económicas del premio físico — visible ANTES de
            participar, nunca escondido en Términos. Ámbar = costo a cargo
            del ganador, verde = incluido por el creador, neutro = sin
            alerta económica (ej. retiro presencial). */}
        {premioInfo && (
          <div style={{ margin: "4px 0 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".03em" }}>
              Información del premio
            </div>
            {premioInfo.map((row, idx) => (
              <div
                key={idx}
                className={row.tone === "amber" ? styles.alertAmber : row.tone === "green" ? styles.alertGreen : styles.alertNeutral}
              >
                {row.title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{row.title}</div>}
                {row.lines.map((line, i) => <div key={i}>{line}</div>)}
                {row.conditions && (
                  <>
                    <div style={{ fontWeight: 700, marginTop: 8 }}>Condiciones de transferencia</div>
                    <div>{row.conditions}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <TrustBadge level={raffle?.creator_trust_level ?? null} />

        <div className={styles.linksRow}>
          {creatorId && <a className={styles.linkPrimary} href={`/perfil/${creatorId}`}>👤 Ver perfil del creador</a>}
          <a className={styles.linkMuted} href="/terminos" target="_blank" rel="noreferrer">📄 Términos de la rifa</a>
        </div>

        {/* Grid de números */}
        <div className={styles.numbersWrap} style={{ position: "relative", zIndex: 1 }}>
          <div className={styles.numbersHead}>
            <h3 className={styles.numbersTitle}>Números disponibles</h3>
            <div className={styles.legend}>
              <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "#23B6C6" }} />Disponible</span>
              <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "#94a3b8" }} />Vendido</span>
            </div>
          </div>
          <div className={styles.numbersBlock}>
            <div className={styles.numsGrid}>
              {tickets.map((t) => {
                const n = t.number;
                const state = t.status || "available";
                const isFree = availableStatuses.has(state);
                const cls = [
                  styles.num,
                  state === "sold" ? styles.sold :
                  state === "pending" ? styles.pending : styles.free,
                  isSelected(n) ? styles.sel : "",
                ].join(" ");
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleNumber(n, isFree)}
                    aria-pressed={isSelected(n)}
                    disabled={!isFree}
                    className={cls}
                    style={{ position: "relative", zIndex: 0 }}
                  >
                    {/* Ícono de fondo (si existe) */}
                    {(() => {
                      const ico = getIconByNumber(n);
                      return ico ? (
                        <img
                          className={styles.iconImg}
                          src={ico.src512}
                          srcSet={ico.src1024 ? `${ico.src1024} 1024w, ${ico.src512} 512w` : undefined}
                          sizes="128px"
                          width={128}
                          height={128}
                          loading="lazy"
                          decoding="async"
                          alt=""
                          style={{
                            opacity: isSelected(n) ? 0 : 1,
                            filter:
                              state === "sold" ? "grayscale(1)" :
                              state === "pending" ? "grayscale(.35)" : "none",
                            zIndex: 1,
                            pointerEvents: "none"
                          }}
                        />
                      ) : null;
                    })()}

                    {/* OVERLAY + CHECK + RING */}
                    {isSelected(n) && (
                      <>
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 12,
                            background: "linear-gradient(180deg, rgba(34,197,94,0.98) 0%, rgba(16,185,129,0.98) 100%)",
                            zIndex: 20,
                            pointerEvents: "none"
                          }}
                        />
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            inset: 3,
                            border: "3px solid #fff",
                            borderRadius: 10,
                            zIndex: 25,
                            pointerEvents: "none",
                            animation: "rfx-pulse 1.1s ease-in-out infinite"
                          }}
                        />
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 30,
                            fontWeight: 900,
                            color: "#0b1221",
                            textShadow: "0 1px 0 rgba(255,255,255,.7)",
                            zIndex: 30,
                            pointerEvents: "none"
                          }}
                        >
                          ✓
                        </span>
                      </>
                    )}

                    {/* Número */}
                    <span className={styles.numBadge} style={{ zIndex: 40 }}>
                      {n}
                    </span>

                    {/* Badges RES./VEND. */}
                    {state !== "available" && (
                      <span
                        className={[
                          styles.badge,
                          state === "pending" ? styles.badgePending : styles.badgeSold,
                        ].join(" ")}
                        style={{ zIndex: 40 }}
                      >
                        {state === "pending" ? "RES." : "VEND."}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className={styles.numsNote}>Estado: <b>{raffle.status || "activa"}</b></div>
          </div>
        </div>

        {/* CTA abajo — oculto cuando hay banner/intro/modales/redirect */}
        {!hasAnyModalOrOverlay && (
          <div
            className={styles.bottomCta}
            style={{ position: "relative", zIndex: 10, marginTop: 12 }}
            aria-hidden={hasAnyModalOrOverlay}
          >
            <button
              type="button"
              className={styles.cta}
              disabled={salesClosed || selected.length === 0}
              onClick={() => setShowBuyer(true)}
              style={{ position: "relative", zIndex: 1 }}
            >
              {salesClosed
                ? "Ventas cerradas"
                : selected.length === 0
                ? "Selecciona un número para comprar"
                : `Comprar ${selected.length} ${selected.length === 1 ? "número" : "números"} — ${selectedTotalCLP}`}
            </button>
          </div>
        )}
      </div>

      {/* Modal confirmación */}
      {paymentResult && (
        <div style={mBackdrop} onClick={() => setPaymentResult(null)}>
          <div style={mBox} onClick={(e) => e.stopPropagation()}>
            <button style={mClose} aria-label="Cerrar" title="Cerrar" onClick={() => setPaymentResult(null)}>×</button>
            <div style={mTitle}>
              {paymentResult === "approved" && "✅ Pago aprobado"}
              {paymentResult === "pending"  && "⌛ Pago pendiente"}
              {paymentResult === "rejected" && "❌ Pago rechazado"}
            </div>
            <p style={mP}>
              {paymentResult === "approved" &&
                "Tu compra fue confirmada. Tus números ya aparecen como VENDIDOS y te enviamos un correo con los datos de la compra."}
              {paymentResult === "pending" &&
                "Tu pago está en revisión. La grilla se actualizará automáticamente al aprobarse."}
              {paymentResult === "rejected" &&
                "El pago no pudo completarse. Puedes intentar nuevamente con otro medio."}
            </p>
            <button style={mBtn} onClick={() => setPaymentResult(null)}>Entendido</button>
          </div>
        </div>
      )}

      <BuyerForm
        open={showBuyer}
        onClose={() => setShowBuyer(false)}
        selected={selected}
        priceCLP={raffle.price_cents}
        termsVersion={TERMS_VERSION}
        onSubmit={async (buyer) => { setShowBuyer(false); await comprar(buyer); }}
        // fuerza al modal/overlay a estar arriba
        modalZIndex={2100}
        // RIFEX CLOSURE PASS (2026-08-29): disclosure MUY compacta de
        // costos adicionales, en el resumen inmediatamente anterior al
        // pago — nunca escondida en Términos.
        extraCostNotices={extraCostNotices}
      />

      {/* Animaciones */}
      <style jsx>{`
        @keyframes rfx-pulse {
          0%   { opacity: .95; transform: scale(1); }
          50%  { opacity: .6;  transform: scale(.985); }
          100% { opacity: .95; transform: scale(1); }
        }
        @keyframes rfx-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

RifaDetalle.getLayout = (page) => <Layout>{page}</Layout>;

