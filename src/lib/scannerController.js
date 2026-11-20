// src/lib/scannerController.js
// EVENT-4 — máquina de guardas mínima, separada de la UI para poder
// probarla sin cámara real. Regla única: como mucho una solicitud de
// check-in en vuelo a la vez, y ninguna detección nueva (cámara o
// fallback manual) se acepta hasta que el portero pulse explícitamente
// "Siguiente escaneo" — nunca reactivación automática por temporizador.
//
// Hallazgo de la primera prueba manual real (2026-08-25): un
// auto-reset por temporizador reactivaba el loop de cámara mientras el
// teléfono seguía apuntando al mismo QR, generando un segundo check-in
// real que sobrescribía el resultado PASA visible con already_used antes
// de que el portero pudiera reaccionar. Este módulo elimina esa clase de
// bug por diseño: "locked" solo se libera con reset() explícito, nunca
// solo.
export function createScannerController({ submit }) {
  let locked = false;

  function isLocked() {
    return locked;
  }

  /**
   * Detección real (QR válido o fallback manual) que dispara una
   * solicitud de check-in. Sincrónicamente marca "locked" ANTES de
   * awaitear nada — cualquier detección concurrente (mismo frame,
   * frames siguientes antes de que esta resuelva, o un doble toque)
   * llega después en el mismo hilo de JS y encuentra locked=true.
   */
  async function handleDetection(payload) {
    if (locked) return { accepted: false };
    locked = true;
    try {
      const result = await submit(payload);
      return { accepted: true, result };
    } catch (error) {
      return { accepted: true, error };
    }
  }

  /**
   * Rechazo que se decide localmente, sin red (ej. QR malformado) —
   * también debe bloquear nuevas detecciones hasta el próximo reset
   * explícito, con la misma persistencia que un rechazo del servidor.
   */
  function lockForLocalReject() {
    if (locked) return false;
    locked = true;
    return true;
  }

  /** Equivalente exacto de pulsar "Siguiente escaneo". */
  function reset() {
    locked = false;
  }

  return { handleDetection, lockForLocalReject, reset, isLocked };
}
