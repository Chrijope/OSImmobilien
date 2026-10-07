import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Migration absicherung_stufe0 (30.09.2026, Christians Grundsatz vom 29.09.).
 *
 * Ausfuehren laesst sie sich hier nicht. Der Quelltext haelt fest: Waechter
 * zuerst, die Objektsicherung wird zu statt geloescht, die Serverfunktionen
 * verlieren das Aufrufrecht nur fuer anon, authenticated und PUBLIC, anon
 * verliert alle Schreibrechte, authenticated nur TRUNCATE.
 *
 * Der wichtigste Fall ist der spaetere: Ruft jemand eine der entzogenen
 * Funktionen kuenftig aus dem Browser auf, scheitert das im Betrieb mit
 * "permission denied". Dieser Test faellt vorher um.
 */

const DATEI = "20260930100000_absicherung_stufe0.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;

const ohneKommentare = (s: string) =>
  s
    .split("\n")
    .map((z) => (z.indexOf("--") === -1 ? z : z.slice(0, z.indexOf("--"))))
    .join("\n");

const CODE = ohneKommentare(SQL);

/** Signaturen aus dem Waechter-Array. */
function waechterListe(): string[] {
  const a = CODE.indexOf("_funktionen text[] := ARRAY[");
  expect(a).toBeGreaterThanOrEqual(0);
  const block = CODE.slice(a, CODE.indexOf("];", a));
  return [...block.matchAll(/'(public\.[^']+)'/g)].map((m) => m[1]);
}

/** Signaturen aus den REVOKE-Zeilen. */
function entzogen(): string[] {
  return [...CODE.matchAll(/^REVOKE ALL ON FUNCTION (public\.[^\n]+?\)) FROM PUBLIC, anon, authenticated;$/gm)].map(
    (m) => m[1],
  );
}

const name = (signatur: string) => signatur.replace(/^public\./, "").replace(/\(.*$/, "");

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const pfad = join(ordner, n);
    return statSync(pfad).isDirectory() ? dateien(pfad) : [pfad];
  });
}

describe("Migration absicherung_stufe0", () => {
  it("prueft zuerst im Waechter und bricht bei fehlender Voraussetzung ab", () => {
    const waechter = CODE.indexOf("_funktionen text[] := ARRAY[");
    expect(waechter).toBeGreaterThan(CODE.indexOf("BEGIN;"));
    for (const aenderung of ["ALTER TABLE", "REVOKE", "GRANT"]) {
      expect(CODE.indexOf(aenderung)).toBeGreaterThan(waechter);
    }
    expect(CODE).toContain("to_regprocedure(_f)");
    expect(CODE).toContain("NOT p.prosecdef");
    expect(CODE.match(/RAISE EXCEPTION/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("entzieht genau die Funktionen aus dem Waechter und gibt sie service_role", () => {
    const liste = waechterListe();
    expect(liste).toHaveLength(34);
    expect(entzogen()).toEqual(liste);
    const grant = CODE.slice(CODE.indexOf("GRANT EXECUTE ON FUNCTION"), CODE.indexOf("TO service_role;"));
    for (const f of liste) expect(grant).toContain(f);
    // OSImmobilien: Diese zwei werden in keiner Migration angelegt. Auf einer
    // frischen Datenbank fehlen sie, deshalb stehen sie ausserhalb des
    // Waechters und werden nur behandelt, wenn es sie gibt.
    for (const f of ["public.kennzahlen_gespraeche_woche()", "public.email_queue_dispatch()"]) {
      expect(liste).not.toContain(f);
      expect(CODE).toContain(
        `IF to_regprocedure('${f}') IS NOT NULL THEN EXECUTE $q$REVOKE ALL ON FUNCTION ${f} FROM PUBLIC, anon, authenticated$q$`,
      );
      expect(CODE).toContain(`$q$GRANT EXECUTE ON FUNCTION ${f} TO service_role$q$`);
    }
    // Die Hintergrundfunktionen aus dem Auftrag sind dabei.
    for (const n of [
      "buchung_pipeline_vorwaerts",
      "buchung_investment_vorwaerts",
      "kennzahl_schreiben",
      "meeting_mail_claim",
      "rotate_audit_log",
      "purge_old_activity_log",
    ]) {
      expect(liste.map(name)).toContain(n);
    }
  });

  it("keine der entzogenen Funktionen wird im Browser per rpc aufgerufen", () => {
    const namen = waechterListe().map(name);
    const quellen = dateien("src").filter((p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p));
    const treffer: string[] = [];
    for (const pfad of quellen) {
      const text = readFileSync(pfad, "utf8");
      for (const n of namen) {
        if (new RegExp(`rpc\\(\\s*["'\`]${n}["'\`]`).test(text)) treffer.push(`${pfad}: ${n}`);
      }
    }
    expect(treffer).toEqual([]);
  });

  it("schliesst die Objektsicherung, ohne sie zu loeschen", () => {
    expect(CODE).toContain("ALTER TABLE public.objekte_sicherung_20260922 ENABLE ROW LEVEL SECURITY;");
    expect(CODE).toContain("REVOKE ALL ON TABLE public.objekte_sicherung_20260922 FROM PUBLIC, anon, authenticated;");
    expect(CODE).not.toMatch(/DROP\s+(TABLE|FUNCTION|POLICY)/i);
    expect(CODE).not.toMatch(/\bDELETE\s+FROM\b|\bUPDATE\s+public\./i);
  });

  it("anon verliert alle Schreibrechte, authenticated nur TRUNCATE, storage und realtime bleiben", () => {
    expect(CODE).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE %s FROM anon");
    expect(CODE).toContain("REVOKE TRUNCATE ON TABLE %s FROM authenticated");
    expect(CODE).toContain("c.relnamespace = 'public'::regnamespace");
    // authenticated schreibt weiter ueber die Zeilenregeln.
    expect(CODE).not.toMatch(/REVOKE[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*FROM[^;]*authenticated/);
    expect(CODE).not.toMatch(/\b(storage|realtime)\./);
    expect(CODE).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
  });

  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und in der Pruefung", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(DATEI);
    const pruefung = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
    for (let i = 1; i <= 7; i++) expect(pruefung).toContain(`'50.${i} `);
    // Die Pruefzeile 50.2 kennt dieselben Funktionen wie die Migration.
    const zeile = pruefung.slice(pruefung.indexOf("'50.2 "), pruefung.indexOf("'50.3 "));
    for (const f of waechterListe()) expect(zeile).toContain(`'${f}'`);
  });
});
