// src/lib/eventAnalyticsAuth.js
// EVENT-5 — autoridad de "quién puede ver analytics/exportar el reporte de
// este evento": exclusivamente events.organizer_id. A diferencia de
// canCheckIn (src/lib/eventStaffAuth.js), un colaborador `door` NUNCA
// califica acá — "door puede escanear/hacer check-in, pero no... acceder a
// finanzas innecesarias" (EVENT4_STAFF_SCANNER_CHECKIN.md), y el reporte de
// EVENT-5 es, en parte, exactamente eso: finanzas del evento. Deliberadamente
// separada de canCheckIn, nunca reutilizada ni fusionada con ella.
export async function canViewEventAnalytics(supabase, eventId, userId) {
  if (!userId) return false;

  const { data: event, error } = await supabase
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .maybeSingle();
  if (error || !event) return false;

  return event.organizer_id === userId;
}
