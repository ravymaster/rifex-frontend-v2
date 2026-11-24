// src/lib/warpPilotRequest.js
// Warp Conversacional — solicitud de piloto: validación y textos compartidos
// por el formulario (navegador), la API (servidor) y los correos.
//
// Sin dependencias ni secretos: lógica pura y testeable. La autoridad final
// sigue siendo la base (checks + RLS en db/migrations/2026-11-24a_...).

export const WARP_PILOT_STATUSES = Object.freeze([
  'solicitud', 'revision', 'compatible', 'pendiente_pago', 'pagado', 'configuracion',
  'pruebas', 'activo', 'pausado', 'cancelado', 'incompatible',
]);

// Estados en lenguaje humano (mismo texto para usuario y admin).
export const WARP_PILOT_STATUS_LABEL = Object.freeze({
  solicitud: 'Solicitud recibida',
  revision: 'En revisión',
  compatible: 'Compatible',
  pendiente_pago: 'Pendiente de pago',
  pagado: 'Pagado',
  configuracion: 'En configuración',
  pruebas: 'En pruebas',
  activo: 'Activo',
  pausado: 'Pausado',
  cancelado: 'Cancelado',
  incompatible: 'No compatible',
});

export const WARP_PILOT_NEXT_STEP = Object.freeze({
  solicitud: 'Revisaremos tu sitio y te contactaremos por correo. Aún no hay cobro ni activación.',
  revision: 'Estamos revisando la compatibilidad de tu sitio.',
  compatible: 'Tu sitio es compatible. Te enviaremos la propuesta del piloto.',
  pendiente_pago: 'Te enviamos las instrucciones de pago del piloto.',
  pagado: 'Recibimos el pago. Coordinaremos la instalación.',
  configuracion: 'Estamos configurando el asistente con la información autorizada.',
  pruebas: 'El asistente está en pruebas antes de activarse.',
  activo: 'Tu asistente está activo.',
  pausado: 'El asistente está pausado. Escríbenos si quieres reactivarlo.',
  cancelado: 'La solicitud fue cancelada.',
  incompatible: 'Por ahora tu sitio no es compatible. Te explicamos el motivo por correo.',
});

// Solicitudes que todavía cuentan como "activas" para evitar duplicados.
export const WARP_PILOT_CLOSED_STATUSES = Object.freeze(['cancelado', 'incompatible']);

export const WARP_SITE_TYPES = Object.freeze([
  { value: 'nextjs_react', label: 'Next.js / React' },
  { value: 'wordpress', label: 'WordPress (instalación asistida)' },
  { value: 'php_tradicional', label: 'PHP o sitio tradicional' },
  { value: 'plataforma_personalizada', label: 'Plataforma personalizada' },
  { value: 'no_lo_se', label: 'No lo sé' },
]);

export const WARP_TRAFFIC_OPTIONS = Object.freeze([
  { value: 'menos_1000', label: 'Menos de 1.000 visitas al mes' },
  { value: '1000_10000', label: 'Entre 1.000 y 10.000 visitas al mes' },
  { value: '10000_50000', label: 'Entre 10.000 y 50.000 visitas al mes' },
  { value: 'mas_50000', label: 'Más de 50.000 visitas al mes' },
]);

export const WARP_PILOT_LIMITS = Object.freeze({
  company: [2, 120],
  contactName: [2, 120],
  email: 254,
  phone: [7, 20],
  objective: [10, 1000],
  authorizedInformation: [10, 2000],
  domain: 253,
  notes: 4000,
});

// Campos que se pueden conservar mientras la persona inicia sesión: nunca
// nombre, correo ni teléfono.
export const WARP_PILOT_DRAFT_FIELDS = Object.freeze(['company', 'domain', 'siteType', 'objective', 'authorizedInformation', 'estimatedTraffic']);

export function shortRequestId(id) {
  return String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

// Quita caracteres de control y espacios sobrantes. No interpreta HTML: el
// texto se guarda plano y siempre se escapa al mostrarlo.
export function cleanText(value, { multiline = false } = {}) {
  let s = String(value ?? '').normalize('NFC');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '');
  if (multiline) {
    s = s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/\s+/g, ' ');
  }
  return s.trim();
}

const SECRET_PATTERNS = [
  /\b(contrase(ñ|n)a|password|passwd|clave\s+(de\s+acceso|secreta|privada|api)|api[\s_-]?key|secret[\s_-]?key|token\s+(de\s+acceso|secreto))\s*[:=]/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(sk|pk|rk)[-_](live|test|proj)?[-_]?[A-Za-z0-9]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\br8_[A-Za-z0-9]{20,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\b[0-9a-f]{40,}\b/i,
];

// true si el texto parece contener una contraseña, clave o token.
export function looksLikeSecret(value) {
  const s = String(value || '');
  return SECRET_PATTERNS.some((re) => re.test(s));
}

const DANGEROUS_SCHEME = /^(javascript|data|vbscript|file|blob|about|ftp|ws|wss|mailto|tel):/i;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

// Normaliza un dominio público: acepta "Ejemplo.cl", "https://www.ejemplo.cl/ruta"
// o "ejemplo.cl/". Devuelve { ok, domain, url } (url siempre https) o
// { ok:false, error }. Rechaza esquemas peligrosos, credenciales, puertos,
// IP, localhost y nombres internos.
export function normalizeDomain(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, error: 'domain_required' };
  if (raw.length > 300) return { ok: false, error: 'domain_invalid' };
  if (DANGEROUS_SCHEME.test(raw)) return { ok: false, error: 'domain_scheme' };
  if (/[\s<>"'`\\]/.test(raw)) return { ok: false, error: 'domain_invalid' };
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) return { ok: false, error: 'domain_scheme' };
  let url;
  try {
    url = new URL(hasScheme ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: 'domain_invalid' };
  }
  if (url.username || url.password) return { ok: false, error: 'domain_invalid' };
  if (url.port) return { ok: false, error: 'domain_port' };
  let host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  if (!host || host.length > WARP_PILOT_LIMITS.domain || host.length < 4) return { ok: false, error: 'domain_invalid' };
  if (/^\d+(\.\d+){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return { ok: false, error: 'domain_ip' };
  const labels = host.split('.');
  if (labels.length < 2) return { ok: false, error: 'domain_invalid' };
  if (!labels.every((l) => LABEL.test(l)) || !TLD.test(labels[labels.length - 1])) return { ok: false, error: 'domain_invalid' };
  if (/^(localhost|local|internal|intranet|lan|home|test|example|invalid)$/.test(labels[labels.length - 1])) return { ok: false, error: 'domain_internal' };
  return { ok: true, domain: host, url: `https://${host}` };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

function lenOk(s, [min, max]) {
  return s.length >= min && s.length <= max;
}

export const WARP_PILOT_ERROR_MESSAGE = Object.freeze({
  invalid_request: 'No pudimos procesar la solicitud. Revisa los datos e inténtalo de nuevo.',
  company_invalid: 'Indica el nombre de la empresa (entre 2 y 120 caracteres).',
  domain_required: 'Indica el dominio de tu sitio, por ejemplo: tuempresa.cl.',
  domain_invalid: 'El dominio no es válido. Escríbelo como tuempresa.cl.',
  domain_scheme: 'Solo aceptamos dominios web (https). Escríbelo como tuempresa.cl.',
  domain_port: 'Indica el dominio sin puerto, por ejemplo: tuempresa.cl.',
  domain_ip: 'Indica un dominio, no una dirección IP.',
  domain_internal: 'Indica un dominio público, no uno local o de pruebas.',
  contact_name_invalid: 'Indica el nombre del responsable (entre 2 y 120 caracteres).',
  email_invalid: 'Indica un correo de contacto válido.',
  phone_invalid: 'El teléfono no es válido. Usa solo números, espacios, paréntesis, guiones y +.',
  site_type_invalid: 'Selecciona el tipo de sitio.',
  objective_invalid: 'Cuéntanos el objetivo del asistente (entre 10 y 1000 caracteres).',
  authorized_information_invalid: 'Describe la información que debería responder (entre 10 y 2000 caracteres).',
  traffic_invalid: 'Selecciona un rango de tráfico válido.',
  terms_required: 'Debes aceptar los términos para enviar la solicitud.',
  compatibility_required: 'Debes aceptar la revisión de compatibilidad.',
  secret_detected: 'No incluyas contraseñas, claves ni tokens en el formulario. Nunca te los pediremos por aquí.',
  missing_auth: 'Inicia sesión en Rifex para enviar la solicitud.',
  duplicate_active_request: 'Ya tienes una solicitud activa para ese dominio. Puedes revisarla en «Mis solicitudes de Warp».',
  rate_limited: 'Enviaste varias solicitudes seguidas. Espera un momento e inténtalo de nuevo.',
  server_error: 'No pudimos guardar la solicitud. Inténtalo nuevamente en unos minutos.',
});

// Valida y normaliza el cuerpo del formulario. Devuelve { ok, value } con
// los campos listos para guardar, o { ok:false, error, field }.
export function validatePilotRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_request' };
  // Honeypot: un campo invisible que las personas nunca completan.
  if (cleanText(body.website)) return { ok: false, error: 'invalid_request', honeypot: true };

  const company = cleanText(body.company);
  if (!lenOk(company, WARP_PILOT_LIMITS.company)) return { ok: false, error: 'company_invalid', field: 'company' };

  const d = normalizeDomain(body.domain);
  if (!d.ok) return { ok: false, error: d.error, field: 'domain' };

  const contactName = cleanText(body.contactName);
  if (!lenOk(contactName, WARP_PILOT_LIMITS.contactName)) return { ok: false, error: 'contact_name_invalid', field: 'contactName' };

  const email = cleanText(body.email).toLowerCase();
  if (email.length > WARP_PILOT_LIMITS.email || !EMAIL.test(email)) return { ok: false, error: 'email_invalid', field: 'email' };

  const phoneRaw = cleanText(body.phone);
  if (phoneRaw && !PHONE.test(phoneRaw)) return { ok: false, error: 'phone_invalid', field: 'phone' };

  const siteType = String(body.siteType || '');
  if (!WARP_SITE_TYPES.some((t) => t.value === siteType)) return { ok: false, error: 'site_type_invalid', field: 'siteType' };

  const objective = cleanText(body.objective, { multiline: true });
  if (!lenOk(objective, WARP_PILOT_LIMITS.objective)) return { ok: false, error: 'objective_invalid', field: 'objective' };

  const authorizedInformation = cleanText(body.authorizedInformation, { multiline: true });
  if (!lenOk(authorizedInformation, WARP_PILOT_LIMITS.authorizedInformation)) return { ok: false, error: 'authorized_information_invalid', field: 'authorizedInformation' };

  const traffic = String(body.estimatedTraffic || '');
  if (traffic && !WARP_TRAFFIC_OPTIONS.some((t) => t.value === traffic)) return { ok: false, error: 'traffic_invalid', field: 'estimatedTraffic' };

  if (body.acceptTerms !== true) return { ok: false, error: 'terms_required', field: 'acceptTerms' };
  if (body.acceptCompatibility !== true) return { ok: false, error: 'compatibility_required', field: 'acceptCompatibility' };

  for (const [field, value] of [['company', company], ['contactName', contactName], ['objective', objective], ['authorizedInformation', authorizedInformation]]) {
    if (looksLikeSecret(value)) return { ok: false, error: 'secret_detected', field };
  }

  return {
    ok: true,
    value: {
      company_name: company,
      domain: d.domain,
      contact_name: contactName,
      contact_email: email,
      contact_phone: phoneRaw || null,
      site_type: siteType,
      objective,
      authorized_information: authorizedInformation,
      estimated_traffic: traffic || null,
    },
  };
}

export function siteTypeLabel(value) {
  return WARP_SITE_TYPES.find((t) => t.value === value)?.label || value || '—';
}
