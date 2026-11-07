// src/pages/api/medidor-qr/[id]/index.js
// MEDIDOR QR V1 — GET owner-only: detalle + métricas completas del
// dashboard privado (sección 11 del mandato).
//
// EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1 (puntos 3/5/6/7):
// PATCH owner-only de edición limitada.
//   - name: siempre editable (nunca afecta el significado histórico de
//     resultados existentes).
//   - destination_url / destination_button_label: siempre editables —
//     el QR impreso codifica únicamente /m/<slug> (identidad permanente,
//     punto 5), así que cambiar el destino nunca invalida un QR ya
//     impreso (punto 6).
//   - question / options: editables SOLO si response_count === 0,
//     calculado server-side en cada request (nunca confiado del
//     cliente) — desde la primera respuesta válida quedan bloqueados
//     para no alterar el significado histórico de resultados ya
//     existentes (punto 7).
//   - measurement_start / measurement_end: editables siempre (ajustar
//     la ventana no reinterpreta respuestas ya registradas).
//   - slug / status / organizer_id / created_at / scan_count: nunca
//     tocados por este endpoint — slug es la identidad pública
//     permanente (punto 5); status solo cambia vía status.js (cierre
//     terminal).
//
// Definiciones de métricas (sección 8 del mandato — nunca presentar
// aproximaciones como personas exactas):
//   - scan_count: crudo, sin deduplicar.
//   - visit_count: distinto por visitor_key (medidor_qr_visits).
//   - response_count: total de respuestas (medidor_qr_responses).
//   - conversion_pct: response_count / scan_count (0 si scan_count=0).
//   - destination_clicks / destination_click_pct: clics voluntarios al
//     destino opcional, sobre respuestas (nunca sobre escaneos — el
//     funnel real exige haber respondido primero).
//   - breakdown: conteo + porcentaje por option_index.
//   - daily_evolution: agrupado por DÍA LOCAL del organizador
//     (medidor.timezone), nunca por día UTC crudo (punto 11).
import { createClient } from '@supabase/supabase-js';
import { parseSafeExternalUrl } from '@/lib/safeExternalUrl';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_NAME = 120;
const MAX_QUESTION = 300;
const MAX_OPTION = 80;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_DESTINATION_LABEL = 60;

async function getRequester(req) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return null;
  const { data: ures, error } = await supabase.auth.getUser(token);
  if (error || !ures?.user) return null;
  return ures.user;
}

// EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1 (punto 11): agrupa la
// evolución diaria por el DÍA LOCAL del organizador (medidor.timezone),
// no por el día UTC crudo — evita que una respuesta a las 21:30 en
// Santiago (00:30 UTC del día siguiente) aparezca en la fecha
// equivocada en el dashboard/Excel. Locale 'en-CA' produce
// directamente 'YYYY-MM-DD'.
function localDateKey(isoTimestamp, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(isoTimestamp));
  } catch {
    return new Date(isoTimestamp).toISOString().slice(0, 10);
  }
}

export async function loadMedidorQrMetrics(medidor) {
  const optionsCount = Array.isArray(medidor.options) ? medidor.options.length : 0;
  const timeZone = medidor.timezone || 'America/Santiago';

  const { count: visitCount, error: visitErr } = await supabase
    .from('medidor_qr_visits')
    .select('id', { count: 'exact', head: true })
    .eq('medidor_qr_id', medidor.id);
  if (visitErr) throw visitErr;

  const { data: responses, error: respErr } = await supabase
    .from('medidor_qr_responses')
    .select('option_index, created_at')
    .eq('medidor_qr_id', medidor.id);
  if (respErr) throw respErr;

  const { count: destinationClicks, error: clickErr } = await supabase
    .from('medidor_qr_destination_clicks')
    .select('id', { count: 'exact', head: true })
    .eq('medidor_qr_id', medidor.id);
  if (clickErr) throw clickErr;

  const responseCount = (responses || []).length;
  const breakdown = Array.from({ length: optionsCount }, (_, i) => {
    const count = (responses || []).filter((r) => r.option_index === i).length;
    return { option_index: i, count, percent: responseCount > 0 ? Math.round((count / responseCount) * 1000) / 10 : 0 };
  });

  const byDay = {};
  for (const r of responses || []) {
    const day = localDateKey(r.created_at, timeZone);
    if (!byDay[day]) byDay[day] = { responses: 0, per_option: Array(optionsCount).fill(0) };
    byDay[day].responses += 1;
    if (r.option_index >= 0 && r.option_index < optionsCount) byDay[day].per_option[r.option_index] += 1;
  }
  const dailyEvolution = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, scans: null, responses: v.responses, per_option: v.per_option }));

  const conversionPct = medidor.scan_count > 0 ? Math.round((responseCount / medidor.scan_count) * 1000) / 10 : 0;
  const destinationClickPct = responseCount > 0 ? Math.round(((destinationClicks || 0) / responseCount) * 1000) / 10 : 0;

  return {
    scan_count: medidor.scan_count,
    visit_count: visitCount || 0,
    response_count: responseCount,
    conversion_pct: conversionPct,
    destination_clicks: destinationClicks || 0,
    destination_click_pct: destinationClickPct,
    breakdown,
    daily_evolution: dailyEvolution,
  };
}

async function handleGet(req, res, user, medidor) {
  const metrics = await loadMedidorQrMetrics(medidor);
  return res.status(200).json({ ok: true, medidor, metrics });
}

async function handlePatch(req, res, user, medidor) {
  const body = req.body || {};
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = String(body.name || '').trim();
    if (!name || name.length > MAX_NAME) return res.status(400).json({ ok: false, error: 'invalid_name' });
    patch.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'destination_url')) {
    if (body.destination_url) {
      const parsed = parseSafeExternalUrl(body.destination_url);
      if (!parsed.ok) return res.status(400).json({ ok: false, error: `invalid_destination_url:${parsed.error}` });
      patch.destination_url = parsed.href;
    } else {
      // Punto 6: destination_url puede modificarse (incluida su
      // eliminación) sin regenerar el QR — el QR nunca lo codifica.
      patch.destination_url = null;
      patch.destination_button_label = null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'destination_button_label') && patch.destination_url !== null) {
    patch.destination_button_label = body.destination_button_label
      ? String(body.destination_button_label).trim().slice(0, MAX_DESTINATION_LABEL)
      : null;
  }

  const wantsQuestionEdit = Object.prototype.hasOwnProperty.call(body, 'question');
  const wantsOptionsEdit = Object.prototype.hasOwnProperty.call(body, 'options');
  if (wantsQuestionEdit || wantsOptionsEdit) {
    // Punto 7: integridad histórica — nunca confiar en un flag del
    // cliente, se recalcula server-side en cada request.
    const { count: responseCount, error: countErr } = await supabase
      .from('medidor_qr_responses')
      .select('id', { count: 'exact', head: true })
      .eq('medidor_qr_id', medidor.id);
    if (countErr) throw countErr;
    if ((responseCount || 0) > 0) {
      return res.status(409).json({ ok: false, error: 'locked_has_responses', message: 'La pregunta y las alternativas ya no se pueden editar: este Medidor tiene respuestas.' });
    }

    if (wantsQuestionEdit) {
      const question = String(body.question || '').trim();
      if (!question || question.length > MAX_QUESTION) return res.status(400).json({ ok: false, error: 'invalid_question' });
      patch.question = question;
    }
    if (wantsOptionsEdit) {
      const rawOptions = Array.isArray(body.options) ? body.options : [];
      const options = rawOptions.map((o) => String(o || '').trim()).filter(Boolean);
      if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
        return res.status(400).json({ ok: false, error: 'invalid_options_count' });
      }
      if (options.some((o) => o.length > MAX_OPTION)) {
        return res.status(400).json({ ok: false, error: 'invalid_option_length' });
      }
      const normalized = options.map((o) => o.toLowerCase());
      if (new Set(normalized).size !== normalized.length) {
        return res.status(400).json({ ok: false, error: 'duplicate_options' });
      }
      patch.options = options;
    }
  }

  let measurementStart = medidor.measurement_start;
  let measurementEnd = medidor.measurement_end;
  if (Object.prototype.hasOwnProperty.call(body, 'measurement_start')) {
    const d = new Date(body.measurement_start);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_measurement_start' });
    measurementStart = d.toISOString();
    patch.measurement_start = measurementStart;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'measurement_end')) {
    const d = new Date(body.measurement_end);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_measurement_end' });
    measurementEnd = d.toISOString();
    patch.measurement_end = measurementEnd;
  }
  if (new Date(measurementEnd).getTime() <= new Date(measurementStart).getTime()) {
    return res.status(400).json({ ok: false, error: 'measurement_end_before_start' });
  }

  if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: 'empty_patch' });
  patch.updated_at = new Date().toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from('medidores_qr')
    .update(patch)
    .eq('id', medidor.id)
    .select('*')
    .maybeSingle();
  if (updateErr) throw updateErr;

  return res.status(200).json({ ok: true, medidor: updated });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PATCH') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: medidor, error: fetchErr } = await supabase
      .from('medidores_qr')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!medidor) return res.status(404).json({ ok: false, error: 'not_found' });
    if (medidor.organizer_id !== user.id) return res.status(403).json({ ok: false, error: 'not_your_medidor' });

    if (req.method === 'PATCH') return await handlePatch(req, res, user, medidor);
    return await handleGet(req, res, user, medidor);
  } catch (e) {
    console.error('[api/medidor-qr/[id]] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
