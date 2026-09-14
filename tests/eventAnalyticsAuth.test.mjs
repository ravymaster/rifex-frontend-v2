// tests/eventAnalyticsAuth.test.mjs
// EVENT-5 — canViewEventAnalytics debe ser estrictamente organizer-only:
// door/revoked/random/cross-event/anon todos rechazados, a diferencia de
// canCheckIn (que sí acepta door activo). Nunca se fusionan ambas
// autoridades.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canViewEventAnalytics } from '../src/lib/eventAnalyticsAuth.js';

function fakeSupabase(eventRow) {
  return {
    from(table) {
      assert.equal(table, 'events');
      return {
        select() {
          return {
            eq(col, val) {
              assert.equal(col, 'id');
              return {
                maybeSingle: () => Promise.resolve(
                  eventRow && eventRow.id === val ? { data: eventRow, error: null } : { data: null, error: null }
                ),
              };
            },
          };
        },
      };
    },
  };
}

test('organizador real -> autorizado', async () => {
  const supabase = fakeSupabase({ id: 'ev-1', organizer_id: 'org-1' });
  assert.equal(await canViewEventAnalytics(supabase, 'ev-1', 'org-1'), true);
});

test('staff door (no organizador) -> rechazado, aunque sea door activo en ese evento', async () => {
  // canViewEventAnalytics ni siquiera consulta event_staff — solo compara
  // contra organizer_id. Un userId de un door real jamás califica.
  const supabase = fakeSupabase({ id: 'ev-1', organizer_id: 'org-1' });
  assert.equal(await canViewEventAnalytics(supabase, 'ev-1', 'door-user-1'), false);
});

test('usuario random sin relación con el evento -> rechazado', async () => {
  const supabase = fakeSupabase({ id: 'ev-1', organizer_id: 'org-1' });
  assert.equal(await canViewEventAnalytics(supabase, 'ev-1', 'random-user'), false);
});

test('organizador de OTRO evento (cross-event) -> rechazado', async () => {
  const supabase = fakeSupabase({ id: 'ev-1', organizer_id: 'org-1' });
  // org-2 es organizador legítimo de otro evento, pero acá pide ev-1.
  assert.equal(await canViewEventAnalytics(supabase, 'ev-1', 'org-2'), false);
});

test('anon (userId ausente) -> rechazado sin siquiera consultar la base', async () => {
  let queried = false;
  const supabase = {
    from() {
      queried = true;
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
    },
  };
  assert.equal(await canViewEventAnalytics(supabase, 'ev-1', null), false);
  assert.equal(await canViewEventAnalytics(supabase, 'ev-1', undefined), false);
  assert.equal(queried, false, 'un userId ausente debe rechazarse sin tocar la base');
});

test('evento inexistente -> rechazado, nunca lanza', async () => {
  const supabase = fakeSupabase(null);
  assert.equal(await canViewEventAnalytics(supabase, 'ev-inexistente', 'org-1'), false);
});

test('error de infraestructura al resolver el evento -> falla cerrado (rechaza, nunca autoriza por defecto)', async () => {
  const supabase = {
    from() {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) };
    },
  };
  assert.equal(await canViewEventAnalytics(supabase, 'ev-1', 'org-1'), false);
});
