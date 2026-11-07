// src/lib/raffleTime.js
// Utilidades temporales puras para el lifecycle de sorteo (DRAW-1). Sin
// dependencias externas: convierte hora local en una zona IANA a un
// instante UTC usando Intl.DateTimeFormat (funciona igual en Node y en el
// navegador), evitando agregar una librería de timezones a mitad de sprint.
// Nunca comparar por offset fijo — todo pasa por el nombre IANA para que el
// horario de verano se resuelva solo.

const T5_MINUTES_DEFAULT = 5;

/**
 * Convierte fecha+hora "de pared" en una zona IANA a un instante UTC real.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {string} timeStr 'HH:mm'
 * @param {string} timeZone IANA, ej. 'America/Santiago'
 * @returns {Date|null}
 */
export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  const [hh, mm] = String(timeStr || "").split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm) || !timeZone) return null;

  // 1) Adivinar el instante asumiendo que la hora de pared ES UTC.
  const guessUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0);

  // 2) Ver qué hora de pared produce ese instante EN la zona objetivo.
  let parts;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    parts = Object.fromEntries(dtf.formatToParts(new Date(guessUtcMs)).map((p) => [p.type, p.value]));
  } catch {
    return null; // timeZone inválida
  }
  const hour24 = parts.hour === "24" ? 0 : Number(parts.hour);
  const asIfLocalMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    hour24, Number(parts.minute), Number(parts.second)
  );

  // 3) La diferencia entre "como si fuera local" y nuestro guess es el
  //    offset real de la zona en ese instante (ya incluye DST si aplica).
  const offsetMs = asIfLocalMs - guessUtcMs;
  return new Date(guessUtcMs - offsetMs);
}

export function zonedTimeToUtcISOString(dateStr, timeStr, timeZone) {
  const dt = zonedTimeToUtc(dateStr, timeStr, timeZone);
  return dt ? dt.toISOString() : null;
}

export function computeSalesEndAt(drawAtISO, minutesBefore = T5_MINUTES_DEFAULT) {
  if (!drawAtISO) return null;
  const t = new Date(drawAtISO).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t - minutesBefore * 60_000).toISOString();
}

/** Presenta un instante UTC en la zona/locale de la rifa. Solo lectura/UI. */
export function formatDrawAt(utcISOString, timeZone, locale = "es-CL") {
  if (!utcISOString || !timeZone) return null;
  const d = new Date(utcISOString);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const date = new Intl.DateTimeFormat(locale, { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
    const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    return { date, time };
  } catch {
    return null;
  }
}

/**
 * Descompone un instante UTC en la fecha/hora "de pared" de una zona IANA,
 * en el mismo formato que esperan los inputs `type="date"`/`type="time"`
 * (`YYYY-MM-DD` / `HH:mm`). Solo para prellenar/limitar inputs — la
 * autoridad real de validación sigue viviendo en la RPC.
 * @param {string} utcISOString
 * @param {string} timeZone IANA
 * @returns {{date: string, time: string}|null}
 */
export function toZonedInputParts(utcISOString, timeZone) {
  if (!utcISOString || !timeZone) return null;
  const d = new Date(utcISOString);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
    const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]));
    const hour = p.hour === "24" ? "00" : p.hour;
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
  } catch {
    return null;
  }
}

/**
 * Presenta una fecha-solo ('YYYY-MM-DD', columna `date`, ej. `end_date`) sin
 * pasar por `new Date(...)`: ese constructor interpreta 'YYYY-MM-DD' como
 * medianoche UTC, y `toLocaleDateString()` la vuelve a formatear en la zona
 * del NAVEGADOR — en cualquier zona con offset negativo respecto a UTC eso
 * corre la fecha mostrada un día hacia atrás. Como el valor ya es la fecha
 * de pared correcta, basta con reordenar los componentes del string.
 * @param {string} dateOnlyStr 'YYYY-MM-DD'
 * @returns {string|null} 'DD-MM-YYYY'
 */
export function formatDateOnly(dateOnlyStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateOnlyStr || ""));
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${d}-${mo}-${y}`;
}

export const T5_MINUTES = T5_MINUTES_DEFAULT;
