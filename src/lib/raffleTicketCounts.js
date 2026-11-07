// src/lib/raffleTicketCounts.js
// Totales públicos de números de una Rifa (total y disponibles), leídos
// en el servidor. El navegador nunca consulta la tabla de números
// directamente: los recibe por las APIs de Rifas, que respetan la
// exposición pública (src/lib/raffleExposure.js).
export const AVAILABLE_TICKET_STATUSES = Object.freeze(['available', 'free']);

export async function countRaffleTickets(supabase, raffleId) {
  const [total, available] = await Promise.all([
    supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('raffle_id', raffleId),
    supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('raffle_id', raffleId).in('status', AVAILABLE_TICKET_STATUSES),
  ]);
  if (total.error) throw total.error;
  if (available.error) throw available.error;
  return { total: total.count || 0, available: available.count || 0 };
}
