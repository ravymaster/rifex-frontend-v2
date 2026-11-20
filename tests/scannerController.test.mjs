// tests/scannerController.test.mjs
// EVENT-4 — reproduce y demuestra cerrado el bug de aceptación encontrado
// en la primera prueba manual real (2026-08-25): múltiples detecciones
// consecutivas del mismo QR, antes de que la primera solicitud haya sido
// respondida, deben producir exactamente UNA solicitud HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScannerController } from '../src/lib/scannerController.js';

test('detecciones consecutivas del mismo QR antes de la primera respuesta -> exactamente 1 submit', async () => {
  let submitCalls = 0;
  let resolveFirst;
  const firstPending = new Promise((resolve) => { resolveFirst = resolve; });

  const controller = createScannerController({
    submit: async (payload) => {
      submitCalls += 1;
      await firstPending;
      return { status: 200, body: { ok: true, result: 'pass' } };
    },
  });

  // Simula el loop de cámara detectando el mismo QR en 5 frames
  // sucesivos, todos antes de que la primera solicitud resuelva —
  // exactamente el escenario que causó el bug real.
  const token = 'a'.repeat(32);
  const attempts = [
    controller.handleDetection({ qr_token: token }),
    controller.handleDetection({ qr_token: token }),
    controller.handleDetection({ qr_token: token }),
    controller.handleDetection({ qr_token: token }),
    controller.handleDetection({ qr_token: token }),
  ];

  assert.equal(submitCalls, 1, 'debe haber exactamente 1 submit sincrónico ante 5 detecciones consecutivas');
  assert.equal(controller.isLocked(), true, 'debe quedar bloqueado inmediatamente tras la primera detección aceptada');

  resolveFirst();
  const results = await Promise.all(attempts);

  assert.equal(submitCalls, 1, 'ninguna de las detecciones adicionales debe haber disparado un segundo submit');
  assert.equal(results.filter((r) => r.accepted === true).length, 1, 'solo la primera detección se marca accepted');
  assert.equal(results.filter((r) => r.accepted === false).length, 4, 'las otras 4 deben ser ignoradas, no encoladas');

  // Sin reset(), una detección nueva tampoco dispara submit — ni con el
  // resultado ya resuelto.
  const stillLocked = await controller.handleDetection({ qr_token: token });
  assert.equal(stillLocked.accepted, false);
  assert.equal(submitCalls, 1);

  // reset() (equivalente a pulsar "Siguiente escaneo") es la ÚNICA forma
  // de habilitar una detección nueva.
  controller.reset();
  assert.equal(controller.isLocked(), false);
  const afterReset = await controller.handleDetection({ qr_token: 'b'.repeat(32) });
  assert.equal(submitCalls, 2);
  assert.equal(afterReset.accepted, true);
});

test('doble toque en el fallback manual mientras hay una solicitud en vuelo -> exactamente 1 submit', async () => {
  let submitCalls = 0;
  let resolveFirst;
  const firstPending = new Promise((resolve) => { resolveFirst = resolve; });
  const controller = createScannerController({
    submit: async () => { submitCalls += 1; await firstPending; return { status: 200, body: { ok: true, result: 'pass' } }; },
  });

  const first = controller.handleDetection({ ticket_number: 'RFX-EVT-000000' });
  const doubleTouch = controller.handleDetection({ ticket_number: 'RFX-EVT-000000' });

  assert.equal(submitCalls, 1);
  resolveFirst();
  const [r1, r2] = await Promise.all([first, doubleTouch]);
  assert.equal(r1.accepted, true);
  assert.equal(r2.accepted, false);
  assert.equal(submitCalls, 1);
});

test('lockForLocalReject bloquea sin red y persiste hasta reset()', async () => {
  let submitCalls = 0;
  const controller = createScannerController({ submit: async () => { submitCalls += 1; return {}; } });

  assert.equal(controller.lockForLocalReject(), true, 'primer reject local debe bloquear');
  assert.equal(controller.isLocked(), true);
  assert.equal(controller.lockForLocalReject(), false, 'un segundo reject local no vuelve a bloquear (ya lo estaba)');

  const duringLock = await controller.handleDetection({ qr_token: 'c'.repeat(32) });
  assert.equal(duringLock.accepted, false, 'ninguna detección real debe aceptarse mientras está bloqueado por un reject local');
  assert.equal(submitCalls, 0);

  controller.reset();
  assert.equal(controller.isLocked(), false);
  const afterReset = await controller.handleDetection({ qr_token: 'd'.repeat(32) });
  assert.equal(afterReset.accepted, true);
  assert.equal(submitCalls, 1);
});

test('un submit que rechaza (error de red) igual queda accepted+locked, nunca reintenta solo', async () => {
  let submitCalls = 0;
  const controller = createScannerController({
    submit: async () => { submitCalls += 1; throw new Error('network down'); },
  });

  const outcome = await controller.handleDetection({ qr_token: 'e'.repeat(32) });
  assert.equal(outcome.accepted, true);
  assert.ok(outcome.error instanceof Error);
  assert.equal(controller.isLocked(), true, 'un error de red también debe quedar persistente hasta Siguiente escaneo');

  const retryAttempt = await controller.handleDetection({ qr_token: 'e'.repeat(32) });
  assert.equal(retryAttempt.accepted, false);
  assert.equal(submitCalls, 1);
});
