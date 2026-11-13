// src/lib/warp/rifexServices.js
// Fuente curada y versionada de `rifex.services.list` (Connector de Warp).
// Contenido estático alineado con las páginas públicas de cada módulo
// (/eventos, /campanas, /inscripciones, /medidor-qr) y con /planes, más la
// página donde la persona lo crea por su cuenta (requiere iniciar sesión). No
// consulta la base. Al cambiar una regla comercial en esas páginas, se
// actualiza aquí y se sube SERVICES_VERSION.
//
// Rifas no se ofrece mediante el asistente y no forma parte de esta lista.
import { publicOrigin } from './publicOrigin.js';
import { publicCommission } from '../commissionPolicy.js';

export const SERVICES_VERSION = '2026-11-13';

const SERVICES = Object.freeze([
  {
    service: 'events',
    name: 'Eventos',
    summary:
      'Crea un evento, vende entradas con distintos precios y cupos, entrega un código QR por entrada y controla el ingreso escaneando con el celular.',
    when_to_use: 'Cualquier actividad que necesite vender entradas y controlar quién ingresa.',
    pricing: '{{EVENTS_PRICING}}',
    requires_mercado_pago: true,
    mercado_pago_note: 'Necesitas conectar tu cuenta de Mercado Pago: los pagos de tus compradores se acreditan directamente en ella.',
    uses_qr: true,
    organizer_receives:
      'El dinero de cada venta en tu propia cuenta de Mercado Pago, entradas con QR para tus compradores, scanner de acceso, personal de acceso y reportes en Excel.',
    url_path: '/eventos',
    create_path: '/crear-evento',
  },
  {
    service: 'campaigns',
    name: 'Campañas',
    summary:
      'Crea una campaña de recaudación, cuenta tu causa con fotos, compártela con un link o QR y recibe aportes libres o sugeridos.',
    when_to_use: 'Cualquier causa que necesite reunir aportes de forma simple y transparente.',
    pricing: '{{CAMPAIGNS_PRICING}}',
    requires_mercado_pago: true,
    mercado_pago_note: 'Necesitas conectar tu cuenta de Mercado Pago: los aportes se acreditan directamente en ella. Quien aporta no necesita cuenta en Rifex.',
    uses_qr: true,
    organizer_receives: 'Los aportes en tu propia cuenta de Mercado Pago, un link público y un código QR descargable para difundir tu campaña.',
    url_path: '/campanas',
    create_path: '/crear-colecta',
  },
  {
    service: 'registrations',
    name: 'Inscripciones',
    summary:
      'Crea una actividad gratuita, recibe inscripciones con QR individual, controla el acceso con scanner y descarga tu lista en Excel.',
    when_to_use: 'Talleres, cursos y actividades gratuitas que necesiten inscripción previa y control de acceso.',
    pricing: 'Gratis: 1 actividad por mes calendario por cuenta, con hasta 50 inscritos. Sin comisión.',
    requires_mercado_pago: false,
    mercado_pago_note: 'No necesitas Mercado Pago: Inscripciones nunca cobra a quien se inscribe.',
    uses_qr: true,
    organizer_receives: 'Un QR de confirmación para cada inscrito, scanner de acceso y la lista de asistentes en Excel.',
    url_path: '/inscripciones',
    create_path: '/crear-inscripcion',
  },
  {
    service: 'qr_meter',
    name: 'Medidor QR',
    summary:
      'Crea una pregunta con 2 a 4 respuestas, genera tu código QR y úsalo en flyers, carteles, locales o eventos para medir la respuesta de tu público.',
    when_to_use: 'Medir rápidamente el interés u opinión de tu público de forma anónima.',
    pricing: 'Gratis: hasta 10 Medidores QR nuevos por mes calendario por cuenta. Sin comisión.',
    requires_mercado_pago: false,
    mercado_pago_note: 'No necesitas Mercado Pago.',
    uses_qr: true,
    organizer_receives: 'Un código QR listo para imprimir y métricas de escaneos y respuestas. Quien responde lo hace de forma anónima.',
    url_path: '/medidor-qr',
    create_path: '/crear-medidor-qr',
  },
]);

export function listServices() {
  const base = publicOrigin();
  // Comisión desde la fuente central (src/lib/commissionPolicy.js), según el
  // ambiente del servidor.
  const c = publicCommission();
  const pricing = { '{{EVENTS_PRICING}}': c.eventsPricing, '{{CAMPAIGNS_PRICING}}': c.campaignsPricing };
  return {
    version: SERVICES_VERSION,
    commission_note: c.assistantNote,
    items: SERVICES.map(({ url_path, create_path, ...s }) => ({
      ...s,
      pricing: pricing[s.pricing] || s.pricing,
      url: `${base}${url_path}`,
      create_url: `${base}${create_path}`,
    })),
  };
}
