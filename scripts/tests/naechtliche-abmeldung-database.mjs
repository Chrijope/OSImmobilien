// Prueft die Migration 20260926200000_naechtliche_abmeldung.sql gegen eine
// nachgebildete auth-Tabelle: wer nachts rausfliegt, wer erst nach 30 Tagen,
// das Berliner Zeitfenster im Sommer und Winter, einmal je Tag, Rechte.
// Run with PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/tests/naechtliche-abmeldung-database.mjs
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();

const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = u(1), VP_UND_KUNDE = u(2), OHNE_ROLLE = u(3), KUNDE = u(4), BEWERBER = u(5), TEST = u(6);

// Nachbildung wie in Supabase: refresh_tokens haengt per ON DELETE CASCADE an sessions.
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, created_at timestamptz NOT NULL);
  CREATE TABLE auth.refresh_tokens (id bigserial PRIMARY KEY, user_id varchar(255), session_id uuid REFERENCES auth.sessions(id) ON DELETE CASCADE);
  CREATE TYPE public.app_role AS ENUM ('inhaber','admin','vertriebspartner','kunde','bewerber','testaccount');
  CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE (user_id, role));
  CREATE TABLE public.login_sessions (id bigserial PRIMARY KEY, user_id uuid, aktiv boolean DEFAULT true);
  INSERT INTO public.user_roles VALUES
    ('${ADMIN}','admin'), ('${VP_UND_KUNDE}','vertriebspartner'), ('${VP_UND_KUNDE}','kunde'),
    ('${KUNDE}','kunde'), ('${BEWERBER}','bewerber'), ('${TEST}','testaccount');
`);

const sql = await readFile(new URL('../../supabase/migrations/20260926200000_naechtliche_abmeldung.sql', import.meta.url), 'utf8');
// Der Zeitplan braucht pg_cron, das PGlite nicht hat; der DO-Block meldet das nur.
await db.exec(sql.slice(0, sql.indexOf('-- Nachsehen, erwartet')));

async function befuellen(jetzt) {
  await db.exec(`DELETE FROM auth.sessions; DELETE FROM public.naechtliche_abmeldung_laeufe; DELETE FROM public.login_sessions;`);
  for (const id of [ADMIN, VP_UND_KUNDE, OHNE_ROLLE, KUNDE, BEWERBER, TEST]) {
    for (const alterTage of [1, 31]) {
      const { rows } = await db.query(
        `INSERT INTO auth.sessions (user_id, created_at) VALUES ($1, $2::timestamptz - make_interval(days => $3)) RETURNING id`,
        [id, jetzt, alterTage]);
      await db.query(`INSERT INTO auth.refresh_tokens (user_id, session_id) VALUES ($1, $2)`, [id, rows[0].id]);
    }
    await db.query(`INSERT INTO public.login_sessions (user_id) VALUES ($1)`, [id]);
  }
}
const lauf = async (jetzt) => (await db.query(`SELECT public.naechtliche_abmeldung($1::timestamptz) AS r`, [jetzt])).rows[0].r;
const verbliebene = async () =>
  (await db.query(`SELECT user_id, count(*)::int AS n FROM auth.sessions GROUP BY user_id`)).rows
    .reduce((m, r) => ({ ...m, [r.user_id]: r.n }), {});

let passed = 0;
const ok = (name) => { passed++; console.log('ok', name); };

// Sommer: 03:30 CEST = 01:30 UTC
const SOMMER = '2026-07-15 01:30:00+00';
await befuellen(SOMMER);
assert.match(await lauf('2026-07-15 00:30:00+00'), /Uebersprungen: in Berlin ist es 02:30/);
assert.match(await lauf('2026-07-15 02:30:00+00'), /Uebersprungen: in Berlin ist es 04:30/);
assert.equal((await db.query(`SELECT count(*)::int n FROM auth.sessions`)).rows[0].n, 12);
ok('Sommer: ausserhalb 03:30 bis 03:59 passiert nichts');

assert.match(await lauf(SOMMER), /Gelaufen: 8 Sitzungen nachts beendet, 2 Kunden/);
let rest = await verbliebene();
assert.deepEqual(rest, { [KUNDE]: 1, [BEWERBER]: 1 });
ok('Rollenauswahl: Admin, Testkonto, Partner-und-Kunde, ohne Rolle raus; Kunde und Bewerber nur die 31 Tage alte Sitzung');

assert.equal((await db.query(`SELECT count(*)::int n FROM auth.refresh_tokens`)).rows[0].n, 2);
ok('Erneuerungstoken gehen mit den Sitzungen');

assert.deepEqual((await db.query(`SELECT user_id FROM public.login_sessions WHERE aktiv ORDER BY user_id`)).rows.map(r => r.user_id), [KUNDE, BEWERBER]);
ok('login_sessions der nachts Abgemeldeten stehen auf inaktiv');

const prot = (await db.query(`SELECT lauf_tag::text, sitzungen_nacht, sitzungen_30_tage FROM public.naechtliche_abmeldung_laeufe`)).rows;
assert.deepEqual(prot, [{ lauf_tag: '2026-07-15', sitzungen_nacht: 8, sitzungen_30_tage: 2 }]);
ok('Protokoll: eine Zeile mit den Zahlen');

await db.query(`INSERT INTO auth.sessions (user_id, created_at) VALUES ($1, now())`, [ADMIN]);
assert.match(await lauf('2026-07-15 01:45:00+00'), /schon ein Lauf/);
assert.equal((await verbliebene())[ADMIN], 1);
ok('Zweiter Aufruf am selben Tag aendert nichts');

// Winter: 03:30 CET = 02:30 UTC, 01:30 UTC ist 02:30 Uhr
const WINTER = '2026-12-15 02:30:00+00';
await befuellen(WINTER);
assert.match(await lauf('2026-12-15 01:30:00+00'), /Uebersprungen: in Berlin ist es 02:30/);
assert.match(await lauf(WINTER), /Gelaufen: 8 Sitzungen/);
ok('Winter: 02:30 UTC ist der Lauf, 01:30 UTC nicht');

// Umstellungstag Oktober (25.10.2026): 01:30 UTC = 02:30 MEZ, 02:30 UTC = 03:30 MEZ
await befuellen('2026-10-25 02:30:00+00');
assert.match(await lauf('2026-10-25 01:30:00+00'), /Uebersprungen/);
assert.match(await lauf('2026-10-25 02:30:00+00'), /Gelaufen/);
// Umstellungstag Maerz (29.03.2026): 01:30 UTC = 03:30 MESZ
await befuellen('2026-03-29 01:30:00+00');
assert.match(await lauf('2026-03-29 01:30:00+00'), /Gelaufen/);
ok('Umstellungstage Maerz und Oktober treffen genau einmal');

// Einzelnes Konto
await befuellen(SOMMER);
assert.equal((await db.query(`SELECT public.sitzungen_beenden($1) AS n`, [KUNDE])).rows[0].n, 2);
assert.equal((await verbliebene())[KUNDE], undefined);
assert.equal((await verbliebene())[ADMIN], 2);
ok('sitzungen_beenden trifft nur das eine Konto');

// Rechte
for (const rolle of ['anon', 'authenticated']) {
  for (const fn of ['public.sitzungen_beenden(uuid)', 'public.naechtliche_abmeldung(timestamptz)']) {
    const { rows } = await db.query(`SELECT has_function_privilege('${rolle}', '${fn}', 'EXECUTE') AS d`);
    assert.equal(rows[0].d, false, `${rolle} darf ${fn} nicht`);
  }
  const { rows } = await db.query(`SELECT has_table_privilege('${rolle}', 'public.naechtliche_abmeldung_laeufe', 'SELECT') AS d`);
  assert.equal(rows[0].d, false);
}
assert.equal((await db.query(`SELECT has_function_privilege('service_role', 'public.sitzungen_beenden(uuid)', 'EXECUTE') AS d`)).rows[0].d, true);
ok('Rechte: nur service_role und Eigentuemer');

// Mehrfach ausfuehrbar
await db.exec(sql.slice(0, sql.indexOf('-- Nachsehen, erwartet')));
ok('Migration laeuft ein zweites Mal durch');

console.log(`${passed} Pruefungen bestanden`);
