// src/pages/api/admin/search.js
// Búsqueda operativa (A3) — solo lectura, solo datos operativos seguros.
// Nunca devuelve tokens/secrets ni encabezados crudos de webhook_events
// (que en la práctica traen bearer tokens internos de infraestructura,
// no de Rifex, pero igual nunca deben salir de acá).
import { createClient } from "@supabase/supabase-js";
import { resolveAdmin } from "@/lib/adminAuth";
import { isAcceptingContributions } from "@/lib/colectaStatus";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMERIC_RE = /^\d{5,}$/; // mp_payment_id reales son numéricos largos
const MAX_TITLE_MATCHES = 15;

async function webhookEventsFor(paymentId) {
  if (!paymentId) return [];
  const { data } = await supabase
    .from("webhook_events")
    .select("event_type,payload,received_at")
    .eq("payment_id", String(paymentId))
    .order("id", { ascending: false })
    .limit(10);
  // Nunca headers. payload de MP no trae secretos (solo {data:{id},type,...}
  // o, para colecta.reconcile, {reason,...}) — pero igual se recorta a lo
  // mínimo útil, no se devuelve crudo.
  return (data || []).map((e) => ({
    event_type: e.event_type,
    received_at: e.received_at,
    reason: e.payload?.reason || null,
  }));
}

function buildPaymentEntry({
  product, opId, mpPaymentId, amountCents, feeCents, status, createdAt,
  title, publicUrl, creatorEmail, counterpartEmail,
}) {
  return {
    product,
    id: opId, // purchase_id (raffle) o contribution_id (campaign) — lo que necesita /api/admin/reconcile
    mp_payment_id: mpPaymentId || null,
    amount_cents: amountCents ?? null,
    fee_cents: feeCents ?? null,
    status,
    title: title || null,
    public_url: publicUrl,
    creator_email: creatorEmail || null,
    counterpart_email: counterpartEmail || null, // comprador/aportante
    created_at: createdAt || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const auth = await resolveAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.status(400).json({ ok: false, error: "query_too_short" });
  if (q.length > 200) return res.status(400).json({ ok: false, error: "query_too_long" });

  try {
    const isUuid = UUID_RE.test(q);
    const isEmail = EMAIL_RE.test(q);
    const isNumeric = NUMERIC_RE.test(q);

    const raffleMatches = [];
    const campaignMatches = [];
    const paymentMatches = [];

    // ---- por UUID: puede ser id de rifa, colecta, contribution o purchase ----
    if (isUuid) {
      const [{ data: r }, { data: c }, { data: contrib }, { data: purchase }] = await Promise.all([
        supabase.from("raffles").select("id,title,status,creator_id,creator_email,created_at").eq("id", q).maybeSingle(),
        supabase.from("colectas").select("id,title,status,end_at,creator_id,created_at").eq("id", q).maybeSingle(),
        supabase.from("colecta_contributions").select("*").eq("id", q).maybeSingle(),
        supabase.from("payments").select("*").eq("purchase_id", q).maybeSingle(),
      ]);
      if (r) raffleMatches.push(r);
      if (c) campaignMatches.push(c);
      if (contrib) {
        const { data: colecta } = await supabase.from("colectas").select("id,title,creator_id").eq("id", contrib.colecta_id).maybeSingle();
        let creatorEmail = null;
        if (colecta?.creator_id) {
          const { data: cu } = await supabase.auth.admin.getUserById(colecta.creator_id);
          creatorEmail = cu?.user?.email || null;
        }
        paymentMatches.push({
          entry: buildPaymentEntry({
            product: "campaign", opId: contrib.id, mpPaymentId: contrib.mp_payment_id,
            amountCents: contrib.amount_cents, feeCents: contrib.marketplace_fee_cents, status: contrib.status,
            createdAt: contrib.created_at, title: colecta?.title, publicUrl: colecta ? `/colectas/${colecta.id}` : null,
            creatorEmail, counterpartEmail: contrib.contributor_email,
          }),
          webhook_events: await webhookEventsFor(contrib.mp_payment_id),
          reconcile_trace_supported: true,
        });
      }
      if (purchase) {
        const { data: raffle } = await supabase.from("raffles").select("id,title,creator_id,creator_email").eq("id", purchase.raffle_id).maybeSingle();
        paymentMatches.push({
          entry: buildPaymentEntry({
            product: "raffle", opId: purchase.purchase_id, mpPaymentId: purchase.mp_payment_id,
            amountCents: purchase.amount_cents, feeCents: purchase.marketplace_fee_cents, status: purchase.status,
            createdAt: purchase.created_at, title: raffle?.title, publicUrl: raffle ? `/rifas/${raffle.id}` : null,
            creatorEmail: raffle?.creator_email, counterpartEmail: purchase.buyer_email,
          }),
          webhook_events: await webhookEventsFor(purchase.mp_payment_id),
          reconcile_trace_supported: false, // Rifas no tiene traza de reconciliación hoy
        });
      }
    }

    // ---- por payment_id numérico: payments.mp_payment_id / colecta_contributions.mp_payment_id ----
    if (isNumeric) {
      const [{ data: pays }, { data: contribs }] = await Promise.all([
        supabase.from("payments").select("*").eq("mp_payment_id", q),
        supabase.from("colecta_contributions").select("*").eq("mp_payment_id", q),
      ]);
      for (const p of pays || []) {
        const { data: raffle } = await supabase.from("raffles").select("id,title,creator_id,creator_email").eq("id", p.raffle_id).maybeSingle();
        paymentMatches.push({
          entry: buildPaymentEntry({
            product: "raffle", opId: p.purchase_id, mpPaymentId: p.mp_payment_id,
            amountCents: p.amount_cents, feeCents: p.marketplace_fee_cents, status: p.status,
            createdAt: p.created_at, title: raffle?.title, publicUrl: raffle ? `/rifas/${raffle.id}` : null,
            creatorEmail: raffle?.creator_email, counterpartEmail: p.buyer_email,
          }),
          webhook_events: await webhookEventsFor(p.mp_payment_id),
          reconcile_trace_supported: false,
        });
      }
      for (const c of contribs || []) {
        const { data: colecta } = await supabase.from("colectas").select("id,title,creator_id").eq("id", c.colecta_id).maybeSingle();
        let creatorEmail = null;
        if (colecta?.creator_id) {
          const { data: cu } = await supabase.auth.admin.getUserById(colecta.creator_id);
          creatorEmail = cu?.user?.email || null;
        }
        paymentMatches.push({
          entry: buildPaymentEntry({
            product: "campaign", opId: c.id, mpPaymentId: c.mp_payment_id,
            amountCents: c.amount_cents, feeCents: c.marketplace_fee_cents, status: c.status,
            createdAt: c.created_at, title: colecta?.title, publicUrl: colecta ? `/colectas/${colecta.id}` : null,
            creatorEmail, counterpartEmail: c.contributor_email,
          }),
          webhook_events: await webhookEventsFor(c.mp_payment_id),
          reconcile_trace_supported: true,
        });
      }
    }

    // ---- por email: creador de rifa/colecta, comprador/aportante ----
    if (isEmail) {
      const [{ data: rByCreator }, { data: pByBuyer }, { data: cByContributor }] = await Promise.all([
        supabase.from("raffles").select("id,title,status,creator_id,creator_email,created_at").eq("creator_email", q),
        supabase.from("payments").select("*").eq("buyer_email", q),
        supabase.from("colecta_contributions").select("*").eq("contributor_email", q),
      ]);
      raffleMatches.push(...(rByCreator || []));
      for (const p of pByBuyer || []) {
        const { data: raffle } = await supabase.from("raffles").select("id,title,creator_id,creator_email").eq("id", p.raffle_id).maybeSingle();
        paymentMatches.push({
          entry: buildPaymentEntry({
            product: "raffle", opId: p.purchase_id, mpPaymentId: p.mp_payment_id,
            amountCents: p.amount_cents, feeCents: p.marketplace_fee_cents, status: p.status,
            createdAt: p.created_at, title: raffle?.title, publicUrl: raffle ? `/rifas/${raffle.id}` : null,
            creatorEmail: raffle?.creator_email, counterpartEmail: p.buyer_email,
          }),
          webhook_events: await webhookEventsFor(p.mp_payment_id),
          reconcile_trace_supported: false,
        });
      }
      for (const c of cByContributor || []) {
        const { data: colecta } = await supabase.from("colectas").select("id,title,creator_id").eq("id", c.colecta_id).maybeSingle();
        let creatorEmail = null;
        if (colecta?.creator_id) {
          const { data: cu } = await supabase.auth.admin.getUserById(colecta.creator_id);
          creatorEmail = cu?.user?.email || null;
        }
        paymentMatches.push({
          entry: buildPaymentEntry({
            product: "campaign", opId: c.id, mpPaymentId: c.mp_payment_id,
            amountCents: c.amount_cents, feeCents: c.marketplace_fee_cents, status: c.status,
            createdAt: c.created_at, title: colecta?.title, publicUrl: colecta ? `/colectas/${colecta.id}` : null,
            creatorEmail, counterpartEmail: c.contributor_email,
          }),
          webhook_events: await webhookEventsFor(c.mp_payment_id),
          reconcile_trace_supported: true,
        });
      }
      // creador de colecta: colectas no tiene creator_email redundante — resolver por listUsers
      const { data: usersPage } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const matchedUser = (usersPage?.users || []).find((u) => (u.email || "").toLowerCase() === q.toLowerCase());
      if (matchedUser) {
        const { data: cByCreator } = await supabase
          .from("colectas")
          .select("id,title,status,end_at,creator_id,created_at")
          .eq("creator_id", matchedUser.id);
        campaignMatches.push(...(cByCreator || []));
      }
    }

    // ---- por texto libre: título de rifa/campaña ----
    if (!isUuid && !isNumeric && !isEmail) {
      const [{ data: rByTitle }, { data: cByTitle }] = await Promise.all([
        supabase.from("raffles").select("id,title,status,creator_id,creator_email,created_at").ilike("title", `%${q}%`).limit(MAX_TITLE_MATCHES),
        supabase.from("colectas").select("id,title,status,end_at,creator_id,created_at").ilike("title", `%${q}%`).limit(MAX_TITLE_MATCHES),
      ]);
      raffleMatches.push(...(rByTitle || []));
      campaignMatches.push(...(cByTitle || []));
    }

    return res.status(200).json({
      ok: true,
      query: q,
      raffles: raffleMatches.map((r) => ({
        id: r.id, title: r.title, status: r.status, creator_email: r.creator_email || null,
        created_at: r.created_at, public_url: `/rifas/${r.id}`,
      })),
      campaigns: campaignMatches.map((c) => ({
        id: c.id, title: c.title, status: isAcceptingContributions(c) ? "active" : c.status,
        created_at: c.created_at, public_url: `/colectas/${c.id}`,
      })),
      payments: paymentMatches.map((m) => ({ ...m.entry, webhook_events: m.webhook_events, reconcile_trace_supported: m.reconcile_trace_supported })),
    });
  } catch (e) {
    console.error("[api/admin/search] error", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
