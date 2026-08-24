// src/lib/eventFulfillment.js
// EVENT-3 (Fase 7/17) — punto único de "convertir una orden paid en
// tickets + avisar al comprador". Llamado desde dos caminos que deben
// converger al mismo resultado, sin duplicar lógica: webhook-events.js
// (camino primario, justo después de mark_event_order_paid) y el lookup
// de orden del comprador (camino de auto-reparación lazy, igual que
// expire-orders/release-expired ya certificados — si la emisión falló
// transitoriamente en el webhook, la próxima vez que el comprador entra a
// ver su orden se reintenta sola, sin cron ni intervención manual).
//
// PAYMENT STATE (event_orders.status) y FULFILLMENT STATE
// (tickets_issued_at/tickets_email_sent_at) están separados a propósito:
// un fallo acá NUNCA revierte 'paid', nunca cobra de nuevo, nunca duplica
// sold — el pago ya quedó resuelto por mark_event_order_paid antes de que
// esta función exista en el flujo.
import { sendEventTicketsEmail } from "@/lib/eventTicketMailer";

const isValidEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/**
 * Emite tickets (idempotente, vía RPC) para una orden ya 'paid' y envía el
 * correo de entradas listas (idempotente, vía tickets_email_sent_at) si
 * corresponde. Nunca se llama sobre una orden que no está 'paid' — el
 * caller debe verificarlo antes (la RPC igual lo re-valida y falla
 * ruidosamente si no).
 * @returns {Promise<{tickets: object[], order: object}>}
 */
export async function ensureEventOrderFulfilled(supabase, orderId) {
  const { data: tickets, error: issueErr } = await supabase
    .rpc("issue_event_order_tickets", { p_order_id: orderId });
  if (issueErr) throw issueErr;

  const { data: order, error: ordErr } = await supabase
    .from("event_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (ordErr) throw ordErr;

  if (order && !order.tickets_email_sent_at && Array.isArray(tickets) && tickets.length > 0) {
    if (isValidEmail(order.buyer_email)) {
      try {
        const { data: event } = await supabase
          .from("events")
          .select("title")
          .eq("id", order.event_id)
          .maybeSingle();
        const base = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
        const orderLink = `${base}/eventos/orden/${order.access_token}`;

        const result = await sendEventTicketsEmail({
          to: order.buyer_email,
          buyerName: order.buyer_name,
          eventTitle: event?.title || "tu evento",
          orderLink,
          ticketCount: tickets.length,
        });
        if (result?.ok) {
          await supabase.from("event_orders").update({ tickets_email_sent_at: new Date().toISOString() }).eq("id", orderId);
        } else {
          console.error("[eventFulfillment] ticket email send failed (will retry lazily)", { orderId, error: result?.error });
        }
      } catch (e) {
        console.error("[eventFulfillment] ticket email error (will retry lazily)", { orderId, err: e?.message || e });
      }
    }
  }

  return { tickets: tickets || [], order };
}
