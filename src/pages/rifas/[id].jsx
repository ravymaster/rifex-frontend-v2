// src/pages/rifas/[id].jsx
import { useRouter } from "next/router";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "../../lib/supabaseClient";
import styles from "../../styles/rifaDetalle.module.css";
import Layout from "../../components/Layout";
import TrustBadge from "../../components/TrustBadge";
import TrustPopup from "../../components/TrustPopup";
import { canonicalUrl, DEFAULT_OG_IMAGE } from "../../lib/publicMetadata";

import RaffleIntroModal from "../../components/rifex/RaffleIntroModal";
import BuyerForm from "../../components/rifex/BuyerForm";
import QuantitySelector from "../../components/rifex/QuantitySelector";
import PrizeGallery from "../../components/rifex/PrizeGallery";
import { formatDrawAt, formatDateOnly } from "../../lib/raffleTime";
import { humanRaffleStatus, humanPrizeType } from "../../lib/raffleLabels";

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

// RIFEX V4 A6 fix — esta página siempre fue client-fetch puro (raffle
// llega recién tras el useEffect) y tiene un return temprano de "cargando"
// antes de llegar al <Head> de abajo. Eso significa que un rastreador que
// no ejecuta JS (Facebook, WhatsApp, X) nunca veía el <title>/canonical/OG
// reales — solo el shell vacío. getServerSideProps resuelve exclusivamente
// lo mínimo para metadata (title, creator_trust_level, vía el mismo
// endpoint que ya usa el fetch client-side, sin duplicar su lógica) — el
// resto de la página sigue funcionando exactamente igual que antes, con su
// propio fetch client-side para la UI interactiva real.
export async function getServerSideProps({ params, req }) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base = `${proto}://${req.headers.host}`;
  try {
    const r = await fetch(`${base}/api/rifas/${params.id}`);
    if (!r.ok) return { props: { metaTitle: null, metaTrustLevel: null } };
    const j = await r.json();
    const raffle = j?.data;
    return {
      props: {
        metaTitle: raffle?.titulo || raffle?.title || null,
        metaTrustLevel: raffle?.creator_trust_level ?? null,
      },
    };
  } catch {
    return { props: { metaTitle: null, metaTrustLevel: null } };
  }
}

export default function RifaDetalle({ metaTitle, metaTrustLevel }) {
  const router = useRouter();
  const { id } = router.query;

  const [raffle, setRaffle] = useState(null);
  // RIFEX RAFFLE EXPERIENCE 2026 — ya no se carga el arreglo completo de
  // tickets al navegador (eso alimentaba la grilla pública, eliminada por
  // decisión de producto). Solo se necesitan totales agregados: el
  // servidor sigue siendo el único que conoce/decide números concretos.
  const [counts, setCounts] = useState({ total: 0, available: 0 });
  const [organizer, setOrganizer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showQty, setShowQty] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [showIntro, setShowIntro] = useState(false);
  const [showBuyer, setShowBuyer] = useState(false);

  const [payBanner, setPayBanner] = useState(null);       // {kind,text}
  const [paymentResult, setPaymentResult] = useState(null); // 'approved'|'pending'|'rejected'|null

  // Ganador (fijo)
  const [winner, setWinner] = useState(null);

  // Spinner overlay durante la redirección a MP
  const [redirecting, setRedirecting] = useState(false);

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

  // RIFEX RAFFLE EXPERIENCE 2026 — perfil del organizador vía la misma
  // autoridad pública ya existente (GET /api/perfil/[id], usada por
  // "Ver perfil del creador"), nunca datos copiados a mano en la rifa.
  async function loadOrganizer(uid) {
    if (!uid) return;
    try {
      const r = await fetch(`/api/perfil/${uid}`);
      const j = await r.json().catch(() => null);
      if (j?.ok) setOrganizer(j.profile || null);
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

  // Realtime en tickets — refresca solo los TOTALES agregados (nunca
  // descarga el arreglo completo de tickets al navegador).
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

  // mapeos compat (rifas legacy — ninguna rifa creada por crear-rifa.jsx
  // actual pasa por acá, pero rifas históricas siguen debiendo cargar)
  function mapRaffleFromOld(r) {
    if (!r) return null;
    return {
      id: r.id,
      title: r.titulo ?? r.title ?? "Rifa",
      description: r.descripcion ?? r.description ?? "",
      price_cents: typeof r.precio_clp === "number" ? r.precio_clp * 100 : r.price_cents ?? 0,
      prize_amount_cents: r.prize_amount_cents ?? 0,
      prize_type: r.prize_type ?? (r.prize_amount_cents ? "money" : "physical"),
      total_numbers: r.cupos ?? r.total_numbers ?? 100,
      theme: Array.isArray(r.temas) && r.temas.length ? r.temas[0] : r.theme ?? "Mixto",
      status: r.estado ?? r.status ?? "active",
      end_date: r.termino ?? r.end_date ?? null,
      start_date: r.inicio ?? r.start_date ?? null,
      creator_id: r.creador_id ?? r.creator_id ?? null,
      creator_trust_level: r.creator_trust_level ?? null,
      created_at: r.created_at,
      _legacy: true,
    };
  }

  // RIFEX RAFFLE EXPERIENCE 2026 — solo counts agregados (count:'exact',
  // head:true nunca descarga filas), nunca el arreglo completo de tickets.
  async function loadCounts(rid, legacy) {
    try {
      if (!legacy) {
        const [{ count: total }, { count: available }] = await Promise.all([
          supabase.from("tickets").select("id", { count: "exact", head: true }).eq("raffle_id", rid),
          supabase.from("tickets").select("id", { count: "exact", head: true }).eq("raffle_id", rid).in("status", ["available", "free"]),
        ]);
        if ((total || 0) > 0) {
          setCounts({ total: total || 0, available: available || 0 });
          return;
        }
      }
      // Fallback legacy (rifas históricas vía tickets_compat) — camino
      // muerto para rifas nuevas, preservado por compatibilidad.
      const [{ count: totalC }, { count: availableC }] = await Promise.all([
        supabase.from("tickets_compat").select("id", { count: "exact", head: true }).eq("raffle_id", rid),
        supabase.from("tickets_compat").select("id", { count: "exact", head: true }).eq("raffle_id", rid).in("status", ["available", "free"]),
      ]);
      setCounts({ total: totalC || 0, available: availableC || 0 });
    } catch (e) {
      console.error("[rifa counts error]", e);
    }
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

      setRaffle(raffleData);
      await loadCounts(rid, raffleData?._legacy);
      if (raffleData?.creator_id) loadOrganizer(raffleData.creator_id);
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

  const unitPriceCLPNumber = useMemo(() => Math.round(Number(raffle?.price_cents || 0) / 100), [raffle?.price_cents]);

  // RIFEX RAFFLE EXPERIENCE 2026 — bug real encontrado en la auditoría:
  // esto se calculaba SIEMPRE desde prize_amount_cents, que es null para
  // premios físicos → "$0" visible. Ahora solo se muestra para dinero;
  // para físico se muestra el nombre del premio (no existe una columna
  // "nombre del premio" separada del título de la rifa — la propia rifa
  // ES el premio, igual que en el mockup aprobado).
  const prizeDisplay = useMemo(() => {
    if (!raffle) return { label: "Premio", value: "—", sub: "" };
    if (raffle.prize_type === "money") {
      const n = Number(raffle.prize_amount_cents || 0) / 100;
      return {
        label: "Premio",
        value: n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }),
        sub: humanPrizeType(raffle.prize_type),
      };
    }
    return { label: "Premio", value: titleCap || "Premio físico", sub: humanPrizeType(raffle.prize_type || "physical") };
  }, [raffle, titleCap]);

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

  // DRAW-1: gate de tiempo — solo si la rifa configuró sales_end_at. Rifas
  // V1 (sales_end_at=NULL) nunca quedan bloqueadas acá.
  const salesClosed = !!(raffle?.sales_end_at && Date.now() >= new Date(raffle.sales_end_at).getTime());
  const drawInfo = raffle?.draw_at && raffle?.timezone ? formatDrawAt(raffle.draw_at, raffle.timezone) : null;
  const tzLabel = raffle?.timezone ? (TZ_LABELS[raffle.timezone] || raffle.timezone) : null;
  const soldOut = counts.total > 0 && counts.available === 0;
  const canBuy = !salesClosed && !soldOut && counts.available > 0;

  async function comprar(buyer, qty) {
    if (!qty || qty < 1) return;
    try {
      try { localStorage.setItem("rifex.lastBuyerEmail", String(buyer?.email || "").trim().toLowerCase()); } catch {}
      const payload = {
        raffle_id: id,
        raffleId: id,
        quantity: qty,
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

  // RIFEX V4 A6 fix — esta página tenía returns tempranos (cargando/error/no
  // encontrada) que corrían ANTES de llegar al <Head> más abajo. Como toda
  // la data llega por fetch client-side, la primera pasada SSR (la que ve
  // un rastreador sin JS) siempre caía en el branch "Cargando…" sin
  // title/canonical/OG reales. metaTitle/metaTrustLevel (de
  // getServerSideProps) permiten construir el Head correcto ANTES de
  // saber si `raffle` ya cargó en el cliente, y se renderiza en los tres
  // branches de abajo además del branch principal.
  const effectiveTitle = titleCap || metaTitle || "Rifa";
  const effectiveTrustLevel = raffle?.creator_trust_level ?? metaTrustLevel ?? null;
  const metaHead = (
    <Head>
      <title key="title">{`${effectiveTitle} — Información y condiciones | Rifex`}</title>
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
      <meta key="og:title" property="og:title" content={`${effectiveTitle} — Información de la iniciativa`} />
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
  );

  if (loading) {
    return (<div className={styles.page}>{metaHead}<div className={styles.loading}>Cargando rifa…</div></div>);
  }
  if (error) {
    return (<div className={styles.page}>{metaHead}<div className={styles.error}>{error}</div></div>);
  }
  // Fallback visible (evita pantalla en blanco)
  if (!raffle) {
    return (
      <div className={styles.page} style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        {metaHead}
        <div className={styles.error}>
          No encontramos esta rifa. Revisa el enlace o vuelve al <a href="/panel">panel</a>.
        </div>
      </div>
    );
  }

  const creatorId = raffle?.creator_id || raffle?.creador_id || raffle?.user_id || null;

  // Si hay cualquier overlay/modal/banner/redirect, ocultamos el CTA
  const hasAnyModalOrOverlay =
    !!showIntro || !!showQty || !!showBuyer || !!paymentResult || !!redirecting || !!payBanner;

  // —— FIX de superposición / stacking contexts ——
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
    zIndex: 200,
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
    zIndex: 150
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
      {metaHead}
      <TrustPopup trustLevel={effectiveTrustLevel} />

      {/* Overlay spinner durante la redirección a MP */}
      {redirecting && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: "fixed", inset: 0, background: "rgba(2,6,23,.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 3000,
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

        {/* HERO */}
        <div className={styles.heroGrid}>
          <div className={styles.heroMedia}>
            <PrizeGallery
              photos={raffle.prize_photos}
              prizeType={raffle.prize_type}
              title={titleCap}
            />
          </div>

          <div className={styles.heroSide}>
            <div className={styles.head}>
              <span className={styles.statusPill}>● {humanRaffleStatus(raffle.status)}</span>
              <h1 className={styles.title}>{titleCap}</h1>
              <p className={styles.sub}>{raffle.description || ""}</p>
            </div>

            {drawInfo && (
              <div className={styles.drawCard}>
                <div className={styles.drawCardLabel}>Sorteo el</div>
                <div className={styles.drawCardValue}>{drawInfo.date}</div>
                <div className={styles.drawCardSub}>a las {drawInfo.time}{tzLabel ? ` · ${tzLabel}` : ""}</div>
              </div>
            )}

            <div className={styles.topInfo}>
              <div className={`${styles.infoItem} ${styles.infoItemHi}`}>
                <div className={styles.infoLabel}>{prizeDisplay.label}</div>
                <div className={styles.infoValue}>{prizeDisplay.value}</div>
                <div className={styles.infoSub}>{prizeDisplay.sub}</div>
              </div>
              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>Números disponibles</div>
                <div className={styles.infoValue}>{counts.available} de {counts.total || raffle.total_numbers || 0}</div>
                <div className={styles.infoSub}>{" "}</div>
              </div>
              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>Valor por número</div>
                <div className={styles.infoValue}>{priceCLP}</div>
                <div className={styles.infoSub}>{" "}</div>
              </div>
            </div>

            <button
              type="button"
              className={styles.cta}
              disabled={!canBuy}
              onClick={() => setShowQty(true)}
              style={{ position: "relative", zIndex: 1 }}
            >
              {salesClosed ? "Ventas cerradas" : soldOut ? "Rifa agotada" : "Comprar número"}
            </button>

            {soldOut && !salesClosed && (
              <div className={styles.soldOutNote}>
                🔥 ¡No te quedes fuera! Los números se están agotando rápidamente.
              </div>
            )}

            <div className={styles.trustRow}>
              <TrustBadge level={raffle?.creator_trust_level ?? null} />
            </div>
          </div>
        </div>

        {/* DRAW-1: estado público del lifecycle temporal (sin copy técnico) */}
        {(drawInfo || (raffle?.extension_limit ?? 0) > 0) && !winner && (
          <div style={{ margin: "4px 0 12px", padding: "12px 14px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#0f172a", fontSize: 14, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700 }}>{salesClosed ? "Ventas cerradas" : "Ventas abiertas"}</div>
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

        {/* RIFEX RAFFLE EXPERIENCE 2026 — bloque del organizador: datos
            reales vía la misma autoridad pública de perfil (nunca copiados
            a mano en la rifa). */}
        <div className={styles.organizerBlock}>
          <div className={styles.organizerHead}>
            <div className={styles.organizerAvatar}>
              {organizer?.avatar_url ? (
                <img src={organizer.avatar_url} alt="" />
              ) : (
                <span>{(organizer?.nombre || "?").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div className={styles.organizerLabel}>Organizador</div>
              <div className={styles.organizerName}>{organizer?.nombre || "Organizador de Rifex"}</div>
            </div>
            {creatorId && (
              <a className={styles.organizerLink} href={`/perfil/${creatorId}`}>Ver perfil</a>
            )}
          </div>
          {organizer?.bio && <p className={styles.organizerBio}>"{organizer.bio}"</p>}
        </div>

        <div className={styles.linksRow}>
          <a className={styles.linkMuted} href="/terminos-rifas" target="_blank" rel="noreferrer">📄 Términos de la rifa</a>
        </div>
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
                "Tu compra fue confirmada. Tus números ya quedaron asignados y te enviamos un correo con los datos de la compra."}
              {paymentResult === "pending" &&
                "Tu pago está en revisión. Esta página se actualizará automáticamente al aprobarse."}
              {paymentResult === "rejected" &&
                "El pago no pudo completarse. Puedes intentar nuevamente con otro medio."}
            </p>
            <button style={mBtn} onClick={() => setPaymentResult(null)}>Entendido</button>
          </div>
        </div>
      )}

      <QuantitySelector
        open={showQty}
        onClose={() => setShowQty(false)}
        unitPriceCLP={unitPriceCLPNumber}
        maxQuantity={counts.available}
        onContinue={(qty) => {
          setQuantity(qty);
          setShowQty(false);
          setShowBuyer(true);
        }}
      />

      <BuyerForm
        open={showBuyer}
        onClose={() => setShowBuyer(false)}
        quantity={quantity}
        priceCLP={raffle.price_cents}
        termsVersion={TERMS_VERSION}
        onSubmit={async (buyer) => { setShowBuyer(false); await comprar(buyer, quantity); }}
        modalZIndex={2100}
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

RifaDetalle.getLayout = (page) => <Layout disableAutoMeta>{page}</Layout>;
