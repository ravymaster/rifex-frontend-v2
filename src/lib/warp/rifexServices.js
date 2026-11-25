// src/lib/warp/rifexServices.js
// Fuente curada y versionada de `rifex.services.list` (Connector de Warp).
// Contenido estático alineado con las páginas públicas de cada módulo
// (/eventos, /campanas, /inscripciones, /medidor-qr, /warp-conversacional) y
// con /planes, más la página donde la persona lo crea o lo solicita por su
// cuenta (requiere iniciar sesión). No
// consulta la base. Al cambiar una regla comercial en esas páginas, se
// actualiza aquí y se sube SERVICES_VERSION.
//
// Rifas no se ofrece mediante el asistente y no forma parte de esta lista.
import { publicOrigin } from './publicOrigin.js';
import { publicCommission } from '../commissionPolicy.js';

export const SERVICES_VERSION = '2026-11-24b';

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
  // WARP CONVERSACIONAL (Sprint 2): mismo texto que /warp-conversacional.
  // Piloto asistido: el asistente explica y enlaza; nunca envía la solicitud.
  {
    service: 'warp_conversational',
    name: 'Asistente de IA',
    aliases: ['Warp Conversacional'],
    summary:
      'Asistente de inteligencia artificial para sitios web que responde solo con la información autorizada del negocio, orienta a los visitantes hacia páginas, productos o servicios del sitio y mantiene controlados el consumo y los costos. Se ofrece como piloto asistido y comienza en modo de solo lectura: informa, orienta y deriva; no compra, no reserva ni modifica datos sin una integración adicional acordada.',
    when_to_use:
      'Negocios que quieren un asistente en su propio sitio web. Compatible con Next.js/React, con WordPress mediante instalación asistida y con PHP o sitios tradicionales; las plataformas personalizadas se evalúan caso a caso. Cada sitio pasa por una revisión de compatibilidad antes de cualquier cobro, y la activación queda sujeta a la verificación del dominio.',
    pricing:
      'Piloto: instalación $79.990 CLP y mensualidad $29.990 CLP. Precio de lanzamiento sujeto a revisión de compatibilidad. Sin permanencia durante el piloto. El consumo tiene un presupuesto limitado y el exceso se bloquea salvo que lo autorices. Enviar la solicitud no genera cobros.',
    requires_mercado_pago: false,
    mercado_pago_note: 'No necesitas Mercado Pago para solicitar el piloto. Enviar la solicitud no genera cobros ni activa nada.',
    uses_qr: false,
    organizer_receives:
      'Instalación asistida en tu sitio, ajustes iniciales de la información autorizada, presupuesto de consumo limitado, pruebas antes de abrirlo al público y monitoreo. Proceso: revisamos tu sitio, definimos la información autorizada, instalamos, probamos y activamos y monitoreamos. Para solicitarlo necesitas una cuenta de Rifex.',
    url_path: '/warp-conversacional',
    create_path: '/warp-conversacional#solicitar',
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
