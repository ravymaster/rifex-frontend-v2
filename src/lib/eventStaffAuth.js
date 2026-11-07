// src/lib/eventStaffAuth.js
// EVENT-4 — autoridad compartida de "quién puede operar check-in de este
// evento": el organizador (events.organizer_id) o un colaborador con rol
// `door` y status `active` en event_staff, para ESE evento específicamente.
// Espejo en JS de la misma regla que check_in_event_ticket valida en SQL
// (defensa en profundidad para la UI/ping — la RPC sigue siendo la única
// autoridad real que puede ejecutar el check-in en sí).
export async function canCheckIn(supabase, eventId, userId) {
  if (!userId) return false;

  const { data: event, error: evErr } = await supabase
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .maybeSingle();
  if (evErr || !event) return false;
  if (event.organizer_id === userId) return true;

  const { data: staff, error: stErr } = await supabase
    .from('event_staff')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('role', 'door')
    .eq('status', 'active')
    .maybeSingle();
  if (stErr) return false;
  return !!staff;
}
