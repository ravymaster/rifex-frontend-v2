// src/lib/warpIaFormat.js
// Formato de celdas del panel «Warp IA» (/ia). Un dato ausente se muestra como
// «No disponible», nunca como cero.
export const NO_DISPONIBLE = 'No disponible';

const ESTADOS = {
  ok: 'OK',
  sin_saldo: 'Sin saldo',
  tope_diario: 'Tope diario alcanzado',
  tope_mensual: 'Tope mensual alcanzado',
  suspendido: 'Suspendido',
  sin_facturacion: 'Sin facturación',
};
const NOTAS = {
  monto_no_coincide: 'Monto no coincide',
  moneda_no_coincide: 'Moneda no coincide',
  proveedor_no_coincide: 'Proveedor no coincide',
  orden_no_coincide: 'Orden no coincide',
  intencion_ya_acreditada: 'Intención ya acreditada',
};
const PROVIDERS = { mercadopago: 'Mercado Pago', paypal: 'PayPal' };

const clp = (v) => `$${Math.round(v).toLocaleString('es-CL')} CLP`;

export function formatCell(row, [field, , kind]) {
  const v = row?.[field];
  if (v === null || v === undefined || v === '') return NO_DISPONIBLE;
  switch (kind) {
    case 'date': {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return NO_DISPONIBLE;
      return d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' });
    }
    case 'bool':
      return typeof v === 'boolean' ? (v ? 'Sí' : 'No') : NO_DISPONIBLE;
    case 'clp':
      return typeof v === 'number' ? clp(v) : NO_DISPONIBLE;
    case 'usd':
      return typeof v === 'number'
        ? `US$${v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
        : NO_DISPONIBLE;
    case 'amount':
      if (typeof v !== 'number') return NO_DISPONIBLE;
      return row.currency === 'CLP' ? clp(v) : `${v.toLocaleString('es-CL')}${row.currency ? ` ${row.currency}` : ''}`;
    case 'int':
      return typeof v === 'number' ? v.toLocaleString('es-CL') : NO_DISPONIBLE;
    case 'estado':
      return ESTADOS[v] || String(v);
    case 'note':
      return NOTAS[v] || String(v);
    case 'provider':
      return PROVIDERS[v] || String(v);
    default:
      return String(v);
  }
}
