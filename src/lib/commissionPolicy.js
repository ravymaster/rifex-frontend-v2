// src/lib/commissionPolicy.js
// Fuente única de la comisión de Rifex para Eventos y Campañas.
//
// - Las tasas se expresan en puntos base (100 pb = 1 %).
// - La tasa vigente se decide SOLO en el servidor con RIFEX_COMMISSION_MODE
//   (variable de servidor, nunca NEXT_PUBLIC_*). Sin la variable, o con
//   cualquier valor distinto de "launch", rige la comisión estándar (700 pb).
// - El navegador nunca envía ni elige el porcentaje: los checkouts calculan
//   la comisión con esta función y la guardan en la orden o el aporte.
// - Las operaciones ya creadas conservan el monto guardado; webhooks,
//   conciliaciones y reportes leen ese monto y nunca recalculan con la tasa
//   vigente.
//
// Rifas no usa esta política: conserva su comisión propia
// (src/lib/paymentEngine/feePolicy.js).

export const STANDARD_COMMISSION_BPS = 700;
export const LAUNCH_COMMISSION_BPS = 100;
export const COMMISSION_MODULES = Object.freeze(['events', 'campaigns']);

const BPS_DENOMINATOR = 10000;

export function commissionMode(env = process.env) {
  const raw = String((env && env.RIFEX_COMMISSION_MODE) || '').trim().toLowerCase();
  return raw === 'launch' ? 'launch' : 'standard';
}

export function commissionBpsFor(module, env = process.env) {
  if (!COMMISSION_MODULES.includes(module)) {
    throw new Error(`commissionBpsFor: módulo no soportado (${module})`);
  }
  return commissionMode(env) === 'launch' ? LAUNCH_COMMISSION_BPS : STANDARD_COMMISSION_BPS;
}

// Tasa decimal exacta para la función SQL create_event_order (numeric).
export function bpsToRate(bps) {
  assertBps(bps);
  return bps / BPS_DENOMINATOR;
}

// Comisión en la unidad entera recibida (pesos CLP en Campañas). Redondeo
// hacia abajo y tope en el monto: la comisión nunca supera la tasa anunciada.
export function computeCommission(amount, bps) {
  assertBps(bps);
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error('computeCommission: amount debe ser entero >= 0');
  }
  const raw = Math.floor((amount * bps) / BPS_DENOMINATOR);
  return Math.max(0, Math.min(raw, amount));
}

function assertBps(bps) {
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS_DENOMINATOR) {
    throw new Error('commissionPolicy: bps inválido');
  }
}

export function formatPercent(bps, { spaced = false } = {}) {
  assertBps(bps);
  const n = bps / 100;
  const s = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return spaced ? `${s} %` : `${s}%`;
}

const LAUNCH_STATEMENT =
  'Comisión de lanzamiento: solo 1 %. Publica sin costo y sin mensualidad. Rifex cobra el 1 % únicamente sobre ventas o aportes efectivamente cobrados. Mercado Pago puede aplicar sus propios costos.';

// Textos públicos según el modo. En modo estándar se devuelven exactamente
// los textos vigentes (7%), para que un ambiente sin la variable no cambie.
// Solo contiene datos públicos; se entrega a las páginas desde el servidor
// (getStaticProps) y a las capacidades del asistente.
export function publicCommission(env = process.env) {
  const mode = commissionMode(env);
  if (mode === 'launch') {
    return {
      mode,
      bps: LAUNCH_COMMISSION_BPS,
      percent: formatPercent(LAUNCH_COMMISSION_BPS, { spaced: true }),
      promotional: true,
      name: 'Comisión de lanzamiento',
      statement: LAUNCH_STATEMENT,
      chip: { value: '1 %', label: 'Comisión de lanzamiento' },
      eventsPricing:
        'Comisión de lanzamiento: solo 1 %. Publica sin costo y sin mensualidad. Rifex cobra el 1 % únicamente sobre ventas efectivamente cobradas. Mercado Pago puede aplicar sus propios costos.',
      campaignsPricing:
        'Comisión de lanzamiento: solo 1 %. Publica sin costo y sin mensualidad. Rifex cobra el 1 % únicamente sobre aportes efectivamente cobrados. Mercado Pago puede aplicar sus propios costos.',
      eventsSecurityLine:
        'Comisión de lanzamiento de Rifex: solo 1 %, aplicada únicamente sobre ventas efectivamente cobradas. Mercado Pago puede aplicar sus propios costos.',
      planName: 'Comisión de lanzamiento: solo 1 %',
      planDesc:
        'Publica sin costo y sin mensualidad. Rifex cobra el 1 % únicamente sobre ventas o aportes efectivamente cobrados, descontado automáticamente por tu proveedor de pagos en cada operación aprobada. Mercado Pago puede aplicar sus propios costos. Es una tarifa promocional de lanzamiento.',
      planBadge: 'Promoción de lanzamiento',
      planFeature: 'La comisión de lanzamiento del 1 % solo se cobra sobre ventas o aportes efectivamente cobrados',
      metaDescription:
        'Comisión de lanzamiento de Rifex: solo 1 % sobre ventas o aportes efectivamente cobrados. Publica sin costo y sin mensualidad. Mercado Pago puede aplicar sus propios costos.',
      faqAnswer:
        'Comisión de lanzamiento: solo 1 %. Publica sin costo y sin mensualidad. Rifex cobra el 1 % únicamente sobre ventas o aportes efectivamente cobrados, descontado automáticamente por Mercado Pago al momento del pago. Mercado Pago puede aplicar sus propios costos. Es una tarifa promocional de lanzamiento.',
      termsClause:
        'Durante el período de lanzamiento, Rifex cobra una comisión promocional de solo 1 % sobre cada entrada vendida o aporte efectivamente cobrado, descontada automáticamente por el proveedor de pagos al momento del pago. Es una tarifa promocional y puede actualizarse con aviso razonable. No hay planes, suscripciones ni cobro por publicar',
      assistantNote:
        'Comisión de lanzamiento: solo 1 %. Publica sin costo y sin mensualidad. Rifex cobra el 1 % únicamente sobre ventas o aportes efectivamente cobrados. Mercado Pago puede aplicar sus propios costos. Es una tarifa promocional de lanzamiento, no permanente.',
      assistantCollect:
        'Rifex descuenta su comisión de lanzamiento de solo 1 % al momento del pago, solo sobre lo efectivamente cobrado; Mercado Pago puede aplicar sus propios costos.',
    };
  }
  return {
    mode,
    bps: STANDARD_COMMISSION_BPS,
    percent: formatPercent(STANDARD_COMMISSION_BPS),
    promotional: false,
    name: 'Comisión',
    statement: null,
    chip: { value: '7%', label: 'Comisión de servicio' },
    eventsPricing: 'Sin costo por publicar ni mensualidad. Comisión de Rifex del 7% solo sobre ventas efectivamente cobradas.',
    campaignsPricing: 'Sin costo por publicar ni mensualidad. Comisión de Rifex del 7% solo sobre aportes exitosos.',
    eventsSecurityLine: 'La comisión de servicio de Rifex es del 7%, aplicada solo sobre ventas efectivamente cobradas.',
    planName: '7% por venta o aporte exitoso',
    planDesc:
      'Rifex cobra 7% únicamente cuando consigues una venta o aporte exitoso. No hay mensualidad, suscripción ni cobro por publicar — se descuenta automáticamente por tu proveedor de pagos en cada operación aprobada.',
    planBadge: 'Único modelo',
    planFeature: 'La comisión solo se cobra cuando existe una venta o aporte exitoso',
    metaDescription:
      'Rifex cobra una comisión única del 7% por venta o aporte exitoso. Sin planes, sin mensualidad, sin cobro por publicar.',
    faqAnswer:
      'Una comisión única del 7% sobre cada entrada vendida o aporte exitoso, descontada automáticamente por Mercado Pago al momento del pago — no hay planes ni suscripciones.',
    termsClause:
      'Rifex cobra una comisión única del 7% sobre cada entrada vendida o aporte exitoso, descontada automáticamente por el proveedor de pagos al momento del pago. No hay planes, suscripciones ni cobro por publicar',
    assistantNote:
      'Rifex cobra una comisión única del 7% solo cuando existe una venta o aporte exitoso. Sin planes, mensualidad ni cobro por publicar.',
    assistantCollect: 'Rifex descuenta una comisión del 7% al momento del pago.',
  };
}

// Para getStaticProps: solo datos serializables y públicos.
export function commissionStaticProps(env = process.env) {
  return { props: { commission: publicCommission(env) } };
}
