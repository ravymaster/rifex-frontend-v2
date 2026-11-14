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

// Snapshot que se guarda en cada operación nueva (platform_fee_bps +
// commission_policy). El código de política es el modo vigente del servidor.
export const COMMISSION_POLICIES = Object.freeze(['standard', 'launch']);

export function commissionSnapshotFor(module, env = process.env) {
  return { bps: commissionBpsFor(module, env), policy: commissionMode(env) };
}

// Valida un snapshot leído o por escribir: bps entero 0..10000 y política
// conocida. Nunca convierte ni redondea (1.5, "100", -1 o 10001 se rechazan).
export function isValidSnapshot(snapshot) {
  return Boolean(
    snapshot &&
      Number.isInteger(snapshot.bps) &&
      snapshot.bps >= 0 &&
      snapshot.bps <= BPS_DENOMINATOR &&
      COMMISSION_POLICIES.includes(snapshot.policy)
  );
}

// Campañas: snapshot completo del aporte al crearlo (bruto, bps, comisión,
// política). Si la fila ya tiene snapshot (reintento), se reutiliza tal cual.
export function contributionCommission(row, amountClp, env = process.env) {
  if (row && row.platform_fee_bps != null) {
    const kept = { bps: row.platform_fee_bps, policy: row.commission_policy };
    if (!isValidSnapshot(kept) || row.marketplace_fee_cents == null) {
      throw new Error('contributionCommission: snapshot guardado inválido');
    }
    return { ...kept, feeClp: Math.round(row.marketplace_fee_cents / 100), reused: true };
  }
  const snap = commissionSnapshotFor('campaigns', env);
  return { ...snap, feeClp: computeCommission(amountClp, snap.bps), reused: false };
}

// Tasa decimal exacta para la función SQL create_event_order (numeric).
export function bpsToRate(bps) {
  assertBps(bps);
  return bps / BPS_DENOMINATOR;
}

// REGLA ÚNICA DE COMISIÓN (Eventos y Campañas):
//   comisión_clp = ceil(bruto_clp * bps / 10000)
// Se calcula sobre el bruto TOTAL de la operación (nunca por entrada) y se
// redondea UNA sola vez hacia arriba al peso completo. Aritmética entera:
// ceil(a / b) = floor((a + b - 1) / b) con a, b >= 0. Tope en el bruto.
// El resultado es exactamente lo que se guarda y lo que recibe Mercado Pago.
export function computeCommission(grossClp, bps) {
  assertBps(bps);
  if (!Number.isInteger(grossClp) || grossClp < 0) {
    throw new Error('computeCommission: grossClp debe ser entero >= 0');
  }
  const raw = Math.floor((grossClp * bps + (BPS_DENOMINATOR - 1)) / BPS_DENOMINATOR);
  return Math.min(raw, grossClp);
}

// Misma regla para un bruto guardado en centavos (event_orders.subtotal_cents,
// colecta_contributions.amount_cents): devuelve la comisión en centavos,
// siempre un múltiplo exacto de 100 (pesos completos). Es la réplica exacta
// de create_event_order_v2 (migración 2026-11-13b).
export function computeCommissionCents(grossCents, bps) {
  assertBps(bps);
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new Error('computeCommissionCents: grossCents debe ser entero >= 0');
  }
  const DEN = BPS_DENOMINATOR * 100;
  const feeClp = Math.floor((grossCents * bps + (DEN - 1)) / DEN);
  return Math.min(feeClp * 100, grossCents);
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

export const ROUNDING_NOTE =
  'La comisión se calcula sobre el monto bruto cobrado y, cuando el resultado contiene una fracción de peso, se redondea al peso superior.';

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
      roundingNote: ROUNDING_NOTE,
      planFeature: 'La comisión de lanzamiento del 1 % solo se cobra sobre ventas o aportes efectivamente cobrados',
      metaDescription:
        'Comisión de lanzamiento de Rifex: solo 1 % sobre ventas o aportes efectivamente cobrados. Publica sin costo y sin mensualidad. Mercado Pago puede aplicar sus propios costos.',
      faqAnswer:
        'Comisión de lanzamiento: solo 1 %. Publica sin costo y sin mensualidad. Rifex cobra el 1 % únicamente sobre ventas o aportes efectivamente cobrados, descontado automáticamente por Mercado Pago al momento del pago. Mercado Pago puede aplicar sus propios costos. Es una tarifa promocional de lanzamiento. ' + ROUNDING_NOTE,
      termsClause:
        'Durante el período de lanzamiento, Rifex cobra una comisión promocional de solo 1 % sobre cada entrada vendida o aporte efectivamente cobrado, descontada automáticamente por el proveedor de pagos al momento del pago. ' + ROUNDING_NOTE + ' Es una tarifa promocional y puede actualizarse con aviso razonable. No hay planes, suscripciones ni cobro por publicar',
      assistantNote:
        'Comisión de lanzamiento: solo 1 %. Publica sin costo y sin mensualidad. Rifex cobra el 1 % únicamente sobre ventas o aportes efectivamente cobrados. Mercado Pago puede aplicar sus propios costos. Es una tarifa promocional de lanzamiento, no permanente. ' + ROUNDING_NOTE,
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
    roundingNote: ROUNDING_NOTE,
    planFeature: 'La comisión solo se cobra cuando existe una venta o aporte exitoso',
    metaDescription:
      'Rifex cobra una comisión única del 7% por venta o aporte exitoso. Sin planes, sin mensualidad, sin cobro por publicar.',
    faqAnswer:
      'Una comisión única del 7% sobre cada entrada vendida o aporte exitoso, descontada automáticamente por Mercado Pago al momento del pago — no hay planes ni suscripciones. ' + ROUNDING_NOTE,
    termsClause:
      'Rifex cobra una comisión única del 7% sobre cada entrada vendida o aporte exitoso, descontada automáticamente por el proveedor de pagos al momento del pago. ' + ROUNDING_NOTE + ' No hay planes, suscripciones ni cobro por publicar',
    assistantNote:
      'Rifex cobra una comisión única del 7% solo cuando existe una venta o aporte exitoso. Sin planes, mensualidad ni cobro por publicar. ' + ROUNDING_NOTE,
    assistantCollect: 'Rifex descuenta una comisión del 7% al momento del pago.',
  };
}

// Para getStaticProps: solo datos serializables y públicos.
export function commissionStaticProps(env = process.env) {
  return { props: { commission: publicCommission(env) } };
}
