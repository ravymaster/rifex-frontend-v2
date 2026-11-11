// src/lib/warp/rifexSupport.js
// Fuente curada de `rifex.support.read` (Connector de Warp). Contenido
// estático tomado de la página pública /contacto (correo publicado y motivos
// que ahí se indican). No consulta la base, no envía formularios ni correos:
// el asistente solo orienta y la persona escribe por su cuenta.
//
// Fuera a propósito: teléfonos, horarios y plazos de respuesta, identidad
// del operador, ids internos y cualquier valor de configuración. Al cambiar
// /contacto, se actualiza aquí y se sube SUPPORT_VERSION (solo referencia
// interna; no se entrega a Warp).
import { publicOrigin } from './publicOrigin.js';

export const SUPPORT_VERSION = '2026-11-10';
export const SUPPORT_FIELDS = Object.freeze(['contact_url', 'public_email', 'supported_reasons', 'safety_notice']);

const SUPPORT = Object.freeze({
  public_email: 'contacto@rifex.pro',
  supported_reasons: Object.freeze([
    'Soporte: dudas o problemas al usar Eventos, Campañas, Inscripciones o Medidor QR.',
    'Privacidad.',
    'Seguridad.',
    'Reportes relacionados con una iniciativa publicada en Rifex.',
    'Dudas o ideas sobre Rifex.',
  ]),
  safety_notice:
    'Nunca envíes contraseñas, códigos de verificación, claves, datos bancarios ni credenciales de Mercado Pago, ' +
    'ni por el formulario de contacto ni por correo. Describe el problema sin incluirlos.',
});

export function readSupport() {
  return {
    contact_url: `${publicOrigin()}/contacto`,
    public_email: SUPPORT.public_email,
    supported_reasons: [...SUPPORT.supported_reasons],
    safety_notice: SUPPORT.safety_notice,
  };
}
