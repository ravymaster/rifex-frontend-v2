// tests/warpPilotRequestsRls.test.mjs
// RLS y permisos reales de db/migrations/2026-11-24a_warp_pilot_requests.sql
// sobre un Postgres en memoria (PGlite) con los roles y funciones de
// Supabase emulados (anon, authenticated, service_role, auth.uid(),
// auth.jwt()). Dos usuarios, un admin y anon.
//
// PGlite no es dependencia del proyecto: se carga desde PGLITE_PATH
// (ruta a node_modules/@electric-sql/pglite/dist/index.js). Sin esa
// variable la prueba se omite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PGLITE_PATH = process.env.PGLITE_PATH;
const skip = !PGLITE_PATH || !fs.existsSync(PGLITE_PATH);
const ROOT = process.cwd();
const MIGRATION = fs.readFileSync(path.join(ROOT, 'db/migrations/2026-11-24a_warp_pilot_requests.sql'), 'utf8');
const ROLLBACK = fs.readFileSync(path.join(ROOT, 'db/rollback/2026-11-24a_warp_pilot_requests_rollback.sql'), 'utf8');
const CHECK = fs.readFileSync(path.join(ROOT, 'db/checks/2026-11-24a_warp_pilot_requests_check.sql'), 'utf8');

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';

const SUPABASE_FIXTURE = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
  -- Igual que Supabase: privilegios por defecto amplios en tablas nuevas de public.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create function public.set_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at := now(); return new; end $$;
  insert into auth.users (id) values ('${U1}'), ('${U2}'), ('${ADMIN}');
`;

const FORM = (user, domain = 'ejemplo.cl') => ({
  user_id: user, company_name: 'Empresa Demo', domain, contact_name: 'Persona Demo', contact_email: 'demo@ejemplo.cl',
  contact_phone: '+56 9 1234 5678', site_type: 'wordpress', objective: 'Orientar visitantes del sitio.',
  authorized_information: 'Servicios, horarios y preguntas frecuentes.', estimated_traffic: '1000_10000',
  terms_accepted_at: new Date().toISOString(), compatibility_accepted_at: new Date().toISOString(),
});

let db;
async function as(role, sub, fn, { admin = false } = {}) {
  const claims = sub ? JSON.stringify({ sub, role, app_metadata: admin ? { role: 'admin' } : {} }) : '';
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}
async function fails(promise, re) {
  await assert.rejects(promise, (e) => { assert.match(String(e.message), re); return true; });
}
function insertSql(row) {
  const cols = Object.keys(row);
  return { text: `insert into public.warp_pilot_requests (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id, status`, values: Object.values(row) };
}

test('RLS: migración real sobre Postgres con roles de Supabase', { skip }, async (t) => {
  const { PGlite } = await import(PGLITE_PATH);
  db = new PGlite();
  await db.exec(SUPABASE_FIXTURE);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // idempotente

  let r1;
  await t.test('RLS 1: un usuario autenticado crea su propia solicitud; nace en "solicitud"', async () => {
    r1 = await as('authenticated', U1, () => db.query(insertSql(FORM(U1)).text, insertSql(FORM(U1)).values));
    assert.equal(r1.rows[0].status, 'solicitud');
  });

  await t.test('RLS 2: no puede crear a nombre de otro usuario', async () => {
    const q = insertSql(FORM(U2, 'otro.cl'));
    await fails(as('authenticated', U1, () => db.query(q.text, q.values)), /row-level security/);
  });

  await t.test('RLS 3: no puede elegir status ni internal_notes al crear', async () => {
    for (const extra of [{ status: 'activo' }, { internal_notes: 'x' }]) {
      const q = insertSql({ ...FORM(U1, 'tercero.cl'), ...extra });
      await fails(as('authenticated', U1, () => db.query(q.text, q.values)), /permission denied/);
    }
  });

  await t.test('RLS 4: duplicado activo del mismo usuario y dominio → violación única', async () => {
    const q = insertSql(FORM(U1));
    await fails(as('authenticated', U1, () => db.query(q.text, q.values)), /duplicate key|unique/);
    const q2 = insertSql(FORM(U2));
    const other = await as('authenticated', U2, () => db.query(q2.text, q2.values));
    assert.equal(other.rows.length, 1, 'otro usuario sí puede pedir el mismo dominio');
  });

  await t.test('RLS 5: cada usuario solo ve sus solicitudes; nunca internal_notes', async () => {
    const mine = await as('authenticated', U1, () => db.query('select id, user_id, domain, status from public.warp_pilot_requests'));
    assert.ok(mine.rows.length >= 1 && mine.rows.every((r) => r.user_id === U1));
    const theirs = await as('authenticated', U2, () => db.query('select id from public.warp_pilot_requests where id = $1', [r1.rows[0].id]));
    assert.equal(theirs.rows.length, 0, 'U2 no ve la solicitud de U1');
    await fails(as('authenticated', U1, () => db.query('select internal_notes from public.warp_pilot_requests')), /permission denied/);
    await fails(as('authenticated', U1, () => db.query('select * from public.warp_pilot_requests')), /permission denied/);
  });

  await t.test('RLS 6: el usuario no puede cambiar status, notas ni borrar', async () => {
    const id = r1.rows[0].id;
    const upd = await as('authenticated', U1, () => db.query(`update public.warp_pilot_requests set status = 'activo' where id = $1`, [id]));
    assert.equal(upd.affectedRows, 0, 'sin filas actualizables');
    await fails(as('authenticated', U1, () => db.query(`update public.warp_pilot_requests set domain = 'x.cl' where id = $1`, [id])), /permission denied/);
    await fails(as('authenticated', U1, () => db.query('delete from public.warp_pilot_requests where id = $1', [id])), /permission denied/);
    const st = await db.query('select status, internal_notes from public.warp_pilot_requests where id = $1', [id]);
    assert.deepEqual(st.rows[0], { status: 'solicitud', internal_notes: null });
  });

  await t.test('RLS 7: anon no puede leer, insertar, actualizar ni borrar', async () => {
    await fails(as('anon', null, () => db.query('select id from public.warp_pilot_requests')), /permission denied/);
    const q = insertSql(FORM(U1, 'anon.cl'));
    await fails(as('anon', null, () => db.query(q.text, q.values)), /permission denied/);
    await fails(as('anon', null, () => db.query(`update public.warp_pilot_requests set status = 'activo'`)), /permission denied/);
    await fails(as('anon', null, () => db.query('delete from public.warp_pilot_requests')), /permission denied/);
    await fails(as('anon', null, () => db.query('select * from public.warp_pilot_request_history')), /permission denied/);
  });

  await t.test('RLS 8: admin (app_metadata.role) lee todas y actualiza status y notas', async () => {
    const all = await as('authenticated', ADMIN, () => db.query('select id from public.warp_pilot_requests'), { admin: true });
    assert.ok(all.rows.length >= 2);
    const upd = await as('authenticated', ADMIN, () => db.query(`update public.warp_pilot_requests set status = 'revision', internal_notes = 'nota' where id = $1`, [r1.rows[0].id]), { admin: true });
    assert.equal(upd.affectedRows, 1);
    await fails(as('authenticated', ADMIN, () => db.query(`update public.warp_pilot_requests set status = 'inventado' where id = $1`, [r1.rows[0].id]), { admin: true }), /check constraint/);
    const notAdmin = await as('authenticated', U2, () => db.query(`update public.warp_pilot_requests set status = 'activo'`));
    assert.equal(notAdmin.affectedRows, 0, 'un usuario normal no actualiza nada');
  });

  await t.test('RLS 9: historial solo para el servidor; service_role opera todo', async () => {
    await fails(as('authenticated', U1, () => db.query('select * from public.warp_pilot_request_history')), /permission denied/);
    await fails(as('authenticated', ADMIN, () => db.query('select * from public.warp_pilot_request_history'), { admin: true }), /permission denied/);
    const ins = await as('service_role', null, () => db.query(`insert into public.warp_pilot_request_history (request_id, from_status, to_status) values ($1, 'solicitud', 'revision') returning id`, [r1.rows[0].id]));
    assert.equal(ins.rows.length, 1);
  });

  await t.test('RLS 10: dominio y estados validados por la base; cancelada libera el dominio', async () => {
    for (const domain of ['EJEMPLO.CL', 'https://x.cl', 'localhost', 'x', '-a.cl', 'a..cl']) {
      const q = insertSql(FORM(U2, domain));
      await fails(as('authenticated', U2, () => db.query(q.text, q.values)), /check constraint/);
    }
    await db.query(`update public.warp_pilot_requests set status = 'cancelado' where id = $1`, [r1.rows[0].id]);
    const q = insertSql(FORM(U1));
    const again = await as('authenticated', U1, () => db.query(q.text, q.values));
    assert.equal(again.rows.length, 1);
  });

  await t.test('RLS 11: el check de solo lectura funciona y el rollback limpia todo', async () => {
    const check = (await db.query(CHECK)).rows[0].warp_pilot_requests_check;
    assert.deepEqual(check.rls, { warp_pilot_request_history: true, warp_pilot_requests: true });
    assert.equal(check.internal_notes_legible_por_authenticated, false);
    assert.deepEqual(check.permisos_tabla_anon_authenticated, []);
    assert.equal(check.politicas.length, 4);
    await db.exec(ROLLBACK);
    const left = await db.query(`select count(*)::int n from pg_class where relname like 'warp_pilot_request%' and relkind = 'r'`);
    assert.equal(left.rows[0].n, 0);
  });
});
