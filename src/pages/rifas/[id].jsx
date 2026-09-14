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

import PrizeGallery from "../../components/rifex/PrizeGallery";
import { formatDrawAt, formatDateOnly } from "../../lib/raffleTime";
import { humanRaffleStatus, humanPrizeType } from "../../lib/raffleLabels";
import { idOrSlugColumn, isUuid } from "../../lib/idOrSlug";

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

// RAFFLE VISUAL POLISH (2026-09-07) — pasos y preguntas frecuentes de las
// pestañas "Cómo participar" y "Preguntas frecuentes": copy estático,
// nunca depende de datos por-rifa — la lógica real de compra/asignación/
// pago no cambia, esto solo la explica.
const HOW_IT_WORKS_STEPS = [
  { title: "Elegí la cantidad", text: "Indicá cuántos números querés — el sistema te muestra el total a pagar." },
  { title: "Pagá con Mercado Pago", text: "Completás el pago de forma segura, directo en Mercado Pago." },
  { title: "Recibí tus números", text: "El sistema asigna tus números al azar entre los disponibles — nunca los elegís vos." },
  { title: "Esperá el sorteo", text: "Cuando llegue la fecha, el sorteo se ejecuta automáticamente y se avisa al ganador." },
];

const TABS = [
  { id: "premio", label: "Sobre el premio" },
  { id: "participar", label: "Cómo participar" },
  { id: "condiciones", label: "Condiciones" },
  { id: "organizador", label: "Organizador" },
  { id: "faq", label: "Preguntas frecuentes" },
];

const FAQ_ITEMS = [
  { q: "¿Cómo se eligen los números?", a: "Los asigna el sistema automáticamente entre los disponibles al confirmarse el pago — nunca los elige el comprador ni el organizador." },
  { q: "¿Es seguro pagar?", a: "Sí. Todo el pago se procesa a través de Mercado Pago — Rifex nunca ve ni guarda tus datos de tarjeta." },
  { q: "¿Qué pasa si no gano?", a: "No hay cargos adicionales. Podés participar en otras rifas activas cuando quieras." },
  { q: "¿Cómo sé si gané?", a: "El ganador se contacta directamente por los datos entregados al comprar, y el resultado queda visible en esta misma página." },
];

// RIFEX CHECKOUT V2 — UX CORRECTION PASS (2026-09-07) — Buy Box
// photo-first, siempre visible en el sidebar (ya no detrás de un botón
// "Comprar número" ni de un modal). Reutiliza la portada real del premio
// (raffle.prize_photos[0], mismo asset ya usado por PrizeGallery — sin
// pipeline de imágenes nuevo). Sin chips 1/5/10/20, sin botón Cancelar:
// quien no quiera comprar simplemente no continúa. Solo decide CUÁNTOS
// números — nunca cuáles; "Continuar" navega a /rifas/[id]/checkout, que
// es quien realmente llama a /api/checkout/mp (sin cambios).
//
// FINAL VISUAL LOCK (2026-09-08) — la Buy Box deja de repetir la foto
// hero (esa ahora es grande en la columna izquierda): usa una miniatura
// real de la portada + título/tipo, y consolida en una sola tarjeta la
// info que antes vivía repartida en drawCard/statCardsRow (sorteo,
// disponibles, valor por número) — siempre visible, se pueda comprar o
// no, para no perder esa información cuando las ventas están cerradas o
// la rifa está agotada. Solo la mitad inferior (selector/CTA) cambia
// según `canBuy`; cero cambios a qué datos se piden o cómo se procesan.
function BuyBox({
  photoUrl, title, prizeTypeLabel, drawInfo, tzLabel,
  availableCount, totalCount, unitPriceCLPNumber,
  isMoneyPrize, prizeAmountFmt,
  canBuy, salesClosed,
  quantity, setQuantity, onContinue,
}) {
  const clampedMax = Math.max(1, availableCount || 1);
  const qty = Math.min(Math.max(1, quantity || 1), clampedMax);

  const unitFmt = unitPriceCLPNumber.toLocaleString("es-CL", {
    style: "currency", currency: "CLP", maximumFractionDigits: 0,
  });
  const totalCLP = (unitPriceCLPNumber * qty).toLocaleString("es-CL", {
    style: "currency", currency: "CLP", maximumFractionDigits: 0,
  });

  return (
    <div className={styles.buyBox}>
      <div className={styles.buyBoxHead}>
        {photoUrl && (
          <div className={styles.buyBoxThumb}>
            <img src={photoUrl} alt="" />
          </div>
        )}
        <div className={styles.buyBoxHeadText}>
          <p className={styles.buyBoxHeadTitle}>{title}</p>
          <p className={styles.buyBoxHeadType}>{prizeTypeLabel}</p>
        </div>
      </div>

      {drawInfo && (
        <div className={styles.buyBoxInfoRow}>
          <span>Sorteo</span>
          <b>{drawInfo.date} · {drawInfo.time}{tzLabel ? ` · ${tzLabel}` : ""}</b>
        </div>
      )}
      <div className={styles.buyBoxInfoRow}>
        <span>Disponibles</span>
        <b>{availableCount} de {totalCount}</b>
      </div>
      <div className={styles.buyBoxInfoRow}>
        <span>Valor por número</span>
        <b>{unitFmt}</b>
      </div>
      {isMoneyPrize && (
        <div className={styles.buyBoxInfoRow}>
          <span>Premio</span>
          <b>{prizeAmountFmt}</b>
        </div>
      )}

      <p className={styles.buyBoxTrust}>🔒 Compra segura</p>

      {canBuy ? (
        <>
          <h3 className={styles.buyBoxTitle}>🎟 ¿Cuántos números quieres?</h3>
          <p className={styles.buyBoxSub}>Cada número aumenta tus posibilidades.</p>

          <div className={styles.buyBoxStepperRow}>
            <button type="button" className={styles.buyBoxStepBtn} disabled={qty <= 1}
              onClick={() => setQuantity(Math.max(1, qty - 1))} aria-label="Menos">−</button>
            <span className={styles.buyBoxStepValue}>{qty}</span>
            <button type="button" className={styles.buyBoxStepBtn} disabled={qty >= clampedMax}
              onClick={() => setQuantity(Math.min(clampedMax, qty + 1))} aria-label="Más">+</button>
          </div>

          <div className={styles.buyBoxRow}>
            <span>Precio por número</span>
            <b>{unitFmt}</b>
          </div>
          <div className={styles.buyBoxRow}>
            <span>Cantidad</span>
            <b>{qty} {qty === 1 ? "número" : "números"}</b>
          </div>
          <div className={styles.buyBoxTotalRow}>
            <span>Total a pagar</span>
            <b>{totalCLP}</b>
          </div>

          <button type="button" className={styles.buyBoxCta} onClick={() => onContinue(qty)}>Continuar →</button>
          <p className={styles.buyBoxFootnote}>🔒 Compra procesada de forma segura.</p>
        </>
      ) : (
        <button type="button" className={styles.buyBoxCta} disabled>
          {salesClosed ? "Ventas cerradas" : "Rifa agotada"}
        </button>
      )}
    </div>
  );
}

// RIFEX V4 A6 fix — esta página siempre fue client-fetch puro (raffle
// llega recién tras el useEffect) y tiene un return temprano de "cargando"
// antes de llegar al <Head> de abajo. Eso significa que un rastreador que
// no ejecuta JS (Facebook, WhatsApp, X) nunca veía el <title>/canonical/OG
// reales — solo el shell vacío. getServerSideProps resuelve exclusivamente
// lo mínimo para metadata (title, creator_trust_level, vía el mismo
// endpoint que ya usa el fetch client-side, sin duplicar su lógica) — el
// resto de la página sigue funcionando exactamente igual que antes, con su
// propio fetch client-side para la UI interactiva real.
export async function getServerSideProps({ params, req, query }) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base = `${proto}://${req.headers.host}`;
  try {
    const r = await fetch(`${base}/api/rifas/${params.id}`);
    if (!r.ok) return { props: { metaTitle: null, metaTrustLevel: null } };
    const j = await r.json();
    const raffle = j?.data;
    // PROD FIX (2026-09-10): la misión anterior solo consolidaba el
    // canonical hacia el slug, pero el UUID seguía siendo la URL real
    // navegable/compartida — nunca redirigía. Ahora, si se entra por
    // UUID y la rifa ya tiene slug, se redirige 308 al slug real,
    // preservando query string. Solo redirige si isUuid(params.id) es
    // true (nunca si ya se entró por slug, evitando loops); si la rifa
    // no tiene slug (histórica, sin backfill), no redirige — sigue
    // resolviendo por UUID como siempre (degradación segura, nunca se
    // inventa un slug en la visita). El UUID interno nunca cambia.
    if (isUuid(params.id) && raffle?.slug) {
      const qs = new URLSearchParams(query || {});
      qs.delete('id');
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return {
        redirect: {
          destination: `/rifas/${raffle.slug}${suffix}`,
          permanent: true,
        },
      };
    }
    return {
      props: {
        metaTitle: raffle?.titulo || raffle?.title || null,
        metaTrustLevel: raffle?.creator_trust_level ?? null,
        // RIFEX HUMAN URL STANDARD 2026: único cambio autorizado en Rifas
        // esta misión — consolidar canonical/og:url hacia el slug cuando
        // existe, en vez de reflejar de vuelta lo que sea que trajo la URL
        // (UUID o slug). Rifas históricas sin slug siguen usando su UUID.
        metaSlug: raffle?.slug || null,
      },
    };
  } catch {
    return { props: { metaTitle: null, metaTrustLevel: null, metaSlug: null } };
  }
}

export default function RifaDetalle({ metaTitle, metaTrustLevel, metaSlug }) {
  const router = useRouter();
  const { id } = router.query;

  const [raffle, setRaffle] = useState(null);
  // RIFEX HUMAN URL STANDARD 2026: consolida canonical/og:url hacia el
  // slug — prioriza el slug ya resuelto client-side (raffle.slug), cae a
  // metaSlug (SSR, disponible antes de la primera pintura/para crawlers
  // sin JS) y solo usa el `id` crudo de la URL si la rifa no tiene slug
  // (histórica, backfill nunca corrido, o falló el SSR fetch).
  const canonicalId = raffle?.slug || metaSlug || id || "";
  // RIFEX RAFFLE EXPERIENCE 2026 — ya no se carga el arreglo completo de
  // tickets al navegador (eso alimentaba la grilla pública, eliminada por
  // decisión de producto). Solo se necesitan totales agregados: el
  // servidor sigue siendo el único que conoce/decide números concretos.
  const [counts, setCounts] = useState({ total: 0, available: 0 });
  const [organizer, setOrganizer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // RIFEX CHECKOUT V2 — UX CORRECTION PASS (2026-09-07) — la Buy Box es
  // siempre visible en el sidebar cuando se puede comprar (ya no detrás
  // de un botón "Comprar número" ni de un modal). "Continuar" navega a
  // /rifas/[id]/checkout con la cantidad elegida; el checkout (datos +
  // pago, una sola pantalla) vive ahí.
  const [quantity, setQuantity] = useState(1);

  const [payBanner, setPayBanner] = useState(null);       // {kind,text}
  const [paymentResult, setPaymentResult] = useState(null); // 'approved'|'pending'|'rejected'|null

  // Ganador (fijo)
  const [winner, setWinner] = useState(null);

  // Spinner overlay durante la redirección a MP
  const [redirecting, setRedirecting] = useState(false);

  // RAFFLE VISUAL POLISH (2026-09-07) — pestañas de la sección inferior,
  // puramente de presentación (nunca cambian qué datos se piden ni cómo).
  const [activeTab, setActiveTab] = useState("premio");

  useEffect(() => {
    if (!id) return;
    // RAFFLE VISUAL POLISH (2026-09-07) — `id` puede ser el slug amigable
    // nuevo, no el UUID real. loadWinner ya no se llama acá directo con
    // `id`: se dispara desde loadData una vez que se resuelve el UUID
    // real de la rifa, para no consultar /api/raffles/winner con un slug.
    loadData(id);
  }, [id]);

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
        // UUID real ya resuelto por loadData — nunca el slug de la URL.
        await ensureWinner(raffle?.id);
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

  // Liberar reservas vencidas + refrescar si liberó algo — siempre con el
  // UUID real ya resuelto (raffle.id), nunca con el slug de la URL.
  useEffect(() => {
    const rid = raffle?.id;
    if (!rid) return;
    const hit = async () => {
      try {
        const r = await fetch(`/api/tickets/release-expired?rid=${rid}`);
        const j = await r.json().catch(() => null);
        if (j?.ok && j.released > 0) await loadData(rid);
      } catch {}
    };
    hit();
    const timer = setInterval(hit, 30_000);
    return () => clearInterval(timer);
  }, [raffle?.id]);

  // Realtime en tickets — refresca solo los TOTALES agregados (nunca
  // descarga el arreglo completo de tickets al navegador). Igual que
  // arriba, siempre contra el UUID real, nunca el slug de la URL.
  useEffect(() => {
    const rid = raffle?.id;
    if (!rid) return;
    const channel = supabase
      .channel(`raffle-${rid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", filter: `raffle_id=eq.${rid}` },
        async () => {
          await loadData(rid);
          await loadWinner(rid);
        }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [raffle?.id]);

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

      // RAFFLE VISUAL POLISH (2026-09-07) — `rid` puede ser el UUID real o
      // el slug amigable nuevo (/rifas/lambo): nunca se asume uno u otro.
      const col = idOrSlugColumn(rid);

      { const { data, error } = await supabase.from("raffles").select("*").eq(col, rid).limit(1);
        if (!error && Array.isArray(data) && data.length) raffleData = data[0]; }
      if (!raffleData && col === "id") {
        const { data, error } = await supabase.from("raffles_compat").select("*").eq("id", rid).limit(1);
        if (!error && Array.isArray(data) && data.length) raffleData = data[0];
      }
      if (!raffleData && col === "id") {
        const { data, error } = await supabase.from("rifas").select("*").eq("id", rid).limit(1);
        if (!error && Array.isArray(data) && data.length) raffleData = mapRaffleFromOld(data[0]);
      }

      setRaffle(raffleData);
      if (raffleData?.id) {
        await loadCounts(raffleData.id, raffleData?._legacy);
        // Siempre con el UUID real ya resuelto — nunca con el slug de la URL.
        loadWinner(raffleData.id);
      }
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

  const unitPriceCLPNumber = useMemo(() => Math.round(Number(raffle?.price_cents || 0) / 100), [raffle?.price_cents]);

  // RIFEX 2026 PHOTO-FIRST — reutiliza la portada real ya usada por
  // PrizeGallery (raffle.prize_photos[0]), sin pipeline de imágenes
  // nuevo, para que la Buy Box y el checkout mantengan el premio
  // visualmente presente durante la compra.
  const prizeThumb = useMemo(
    () => (Array.isArray(raffle?.prize_photos) && raffle.prize_photos.length ? raffle.prize_photos[0] : null),
    [raffle?.prize_photos]
  );

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

  // RIFEX CHECKOUT UNIFICADO V2 (2026-09-07) — comprar() se retiró de esta
  // página: el submit real (POST /api/checkout/mp) ahora vive en
  // /rifas/[id]/checkout.jsx (pantalla "Método de pago"), con el mismo
  // payload y el mismo endpoint, sin ningún cambio de lógica de pagos.

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
      <link key="canonical" rel="canonical" href={canonicalUrl(`/rifas/${canonicalId}`)} />
      <meta key="og:title" property="og:title" content={`${effectiveTitle} — Información de la iniciativa`} />
      <meta
        key="og:description"
        property="og:description"
        content="Consulta organizador, finalidad, fecha, condiciones y estado de confianza en Rifex."
      />
      <meta key="og:url" property="og:url" content={canonicalUrl(`/rifas/${canonicalId}`)} />
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

  // Si hay cualquier overlay/modal/banner/redirect, ocultamos el CTA.
  // La Buy Box no es un overlay — vive inline dentro del propio sidebar,
  // nunca cubre la foto/hero.
  const hasAnyModalOrOverlay =
    !!paymentResult || !!redirecting || !!payBanner;

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

        {/* RAFFLE VISUAL POLISH (2026-09-07) — encabezado + layout de 2
            columnas (imagen+pestañas a la izquierda, compra+confianza a
            la derecha), acercándose al diseño aprobado. Toda la data
            (raffle, counts, organizer, premioInfo, extraCostNotices)
            sigue siendo exactamente la misma de siempre — esto es
            reordenamiento visual puro. */}
        <div className={styles.headTop}>
          <span className={styles.statusPill}>● {humanRaffleStatus(raffle.status)}</span>
          <h1 className={styles.title}>{titleCap}</h1>
        </div>

        <div className={styles.layout2col}>
          <div className={styles.mainCol}>
            <PrizeGallery
              photos={raffle.prize_photos}
              prizeType={raffle.prize_type}
              title={titleCap}
            />

            <div className={styles.tabsNav} role="tablist" aria-label="Detalle de la rifa">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabBtnActive : ""}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className={styles.tabPanel}>
              {activeTab === "premio" && (
                <div>
                  <h2 className={styles.tabPanelTitle}>🎁 Sobre el premio</h2>
                  <p className={styles.tabPanelText}>{raffle.description || "Sin descripción adicional."}</p>
                  {Array.isArray(raffle.features) && raffle.features.length > 0 && (
                    <>
                      <h3 className={styles.featuresTitle}>Características</h3>
                      <div className={styles.featuresGrid}>
                        {raffle.features.map((f, i) => (
                          <div key={i} className={styles.featureCard}>
                            <span className={styles.featureCardIcon} aria-hidden="true">✦</span>
                            <div>
                              <div className={styles.featureCardLabel}>{f.label}</div>
                              <div className={styles.featureCardValue}>{f.value}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === "participar" && (
                <div>
                  <h2 className={styles.tabPanelTitle}>🛒 Cómo participar</h2>
                  <div className={styles.stepsList}>
                    {HOW_IT_WORKS_STEPS.map((s, i) => (
                      <div key={i} className={styles.stepItem}>
                        <span className={styles.stepNum}>{i + 1}</span>
                        <div>
                          <div className={styles.stepTitle}>{s.title}</div>
                          <div className={styles.stepText}>{s.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "condiciones" && (
                <div>
                  <h2 className={styles.tabPanelTitle}>📋 Condiciones</h2>

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

                  <a className={styles.linkMuted} href="/terminos-rifas" target="_blank" rel="noreferrer">📄 Ver términos completos de la rifa</a>
                </div>
              )}

              {activeTab === "organizador" && (
                <div>
                  <h2 className={styles.tabPanelTitle}>👤 Organizador</h2>
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
                </div>
              )}

              {activeTab === "faq" && (
                <div>
                  <h2 className={styles.tabPanelTitle}>❓ Preguntas frecuentes</h2>
                  <div className={styles.faqList}>
                    {FAQ_ITEMS.map((f, i) => (
                      <div key={i} className={styles.faqItem}>
                        <div className={styles.faqQ}>{f.q}</div>
                        <div className={styles.faqA}>{f.a}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className={styles.sideCol}>
            {/* RIFEX CHECKOUT V2 — UX CORRECTION PASS (2026-09-07) — la Buy
                Box ya no vive detrás de un botón "Comprar número": está
                siempre visible (nunca un modal, nunca un backdrop de
                página completa). "Continuar" navega directamente a
                /rifas/[id]/checkout — una sola pantalla, sin "Método de
                pago" ficticio.
                FINAL VISUAL LOCK (2026-09-08) — consolida en esta misma
                tarjeta lo que antes vivían como drawCard/statCardsRow
                separados (sorteo, disponibles, valor por número): sigue
                visible se pueda comprar o no, solo cambia la mitad
                inferior (selector/CTA vs. botón deshabilitado). */}
            <BuyBox
              photoUrl={prizeThumb}
              title={titleCap}
              prizeTypeLabel={humanPrizeType(raffle.prize_type || "physical")}
              drawInfo={drawInfo}
              tzLabel={tzLabel}
              availableCount={counts.available}
              totalCount={counts.total || raffle.total_numbers || 0}
              unitPriceCLPNumber={unitPriceCLPNumber}
              isMoneyPrize={raffle.prize_type === "money"}
              prizeAmountFmt={prizeDisplay.value}
              canBuy={canBuy}
              salesClosed={salesClosed}
              quantity={quantity}
              setQuantity={setQuantity}
              onContinue={(qty) => {
                router.push({ pathname: "/rifas/[id]/checkout", query: { id, qty } });
              }}
            />

            {soldOut && !salesClosed && (
              <div className={styles.soldOutNote}>
                🔥 ¡No te quedes fuera! Los números se están agotando rápidamente.
              </div>
            )}

            {/* RAFFLE VISUAL POLISH (2026-09-07) — badges de confianza
                genéricas del diseño aprobado; TrustBadge de abajo sigue
                siendo la señal REAL basada en creator_trust_level. */}
            <div className={styles.staticTrustRow}>
              <span className={styles.staticTrustBadge}>✅ Organizador verificado</span>
              <span className={styles.staticTrustBadge}>🔒 Pago seguro (Mercado Pago)</span>
              <span className={styles.staticTrustBadge}>💎 Transparencia total</span>
            </div>

            <div className={styles.trustRow}>
              <TrustBadge level={raffle?.creator_trust_level ?? null} />
            </div>

            <div className={styles.safetyNote}>
              🛡️ ¡Rifa segura! Tus datos están protegidos. Compra con confianza.
            </div>

            <div className={styles.sideOrganizerCard}>
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
            </div>

            {raffle.prize_type === "physical" && (
              <div className={styles.sideDeliveryCard}>
                <div className={styles.sideDeliveryTitle}>🚚 Entrega del premio</div>
                <div className={styles.sideDeliveryText}>
                  {raffle.delivery_method ? (DELIVERY_METHOD_LABELS[raffle.delivery_method] || raffle.delivery_method) : "Se coordina con el organizador."}
                </div>
                {extraCostNotices.length > 0 && (
                  <div className={styles.sideDeliveryNotice}>{extraCostNotices.join(" ")}</div>
                )}
              </div>
            )}

            <div className={styles.linksRow}>
              <a className={styles.linkMuted} href="/terminos-rifas" target="_blank" rel="noreferrer">📄 Términos de la rifa</a>
            </div>
          </aside>
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
