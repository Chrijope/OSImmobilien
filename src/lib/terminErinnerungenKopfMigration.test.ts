/**
 * Gegenpruefung vom 04.10.2026: Der Zeitplan von send-termin-erinnerungen
 * schickt das Geheimwort mit (20261004190000), und Glocken mit
 * Sperrschluessel sind je Empfaenger eindeutig (20261004191000).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const lies = (pfad: string) => readFileSync(pfad, "utf8");

const KOPF_DATEI = "20261004190000_termin_erinnerungen_kopf.sql";
const INDEX_DATEI = "20261004191000_benachrichtigungen_sperre_eindeutig.sql";
const KOPF_SQL = lies(`supabase/migrations/${KOPF_DATEI}`);
const INDEX_SQL = lies(`supabase/migrations/${INDEX_DATEI}`);

describe("20261004190000_termin_erinnerungen_kopf", () => {
  it("stellt genau den Zeitplan von send-termin-erinnerungen um", () => {
    expect(KOPF_SQL).toContain("_funktionen text[] := ARRAY[\n    'send-termin-erinnerungen'\n  ];");
    expect(KOPF_SQL).toContain("jsonb_build_object(''x-internal-secret'', public.automatik_geheimnis())");
  });

  it("ändert ohne Geheimwort im Tresor nichts und ist wiederholbar", () => {
    expect(KOPF_SQL).toContain("IF _geheimwort = '' THEN");
    expect(KOPF_SQL).toContain("IF _job.command LIKE '%x-internal-secret%' THEN");
  });
});

describe("20261004191000_benachrichtigungen_sperre_eindeutig", () => {
  it("legt den Teilindex nur ohne Dubletten an und löscht nichts", () => {
    expect(INDEX_SQL).toContain("HAVING count(*) > 1");
    expect(INDEX_SQL).toContain("CREATE UNIQUE INDEX IF NOT EXISTS benachrichtigungen_sperre_eindeutig");
    expect(INDEX_SQL).toContain("ON public.benachrichtigungen (benutzer_id, (meta ->> 'sperre'))");
    expect(INDEX_SQL).toContain("WHERE meta ? 'sperre';");
    expect(INDEX_SQL).not.toMatch(/\bDELETE\b/);
  });

  it("eigene-investments-reminders überspringt die Ablehnung des Index still", () => {
    const code = lies("supabase/functions/eigene-investments-reminders/index.ts");
    expect(code).toContain('if (insFehler?.code === "23505") return;');
  });
});

describe("Eingangskorb", () => {
  it("hat die Prüfzeilen 80.1 bis 80.3 nach 58.1, nur die letzte Zeile endet mit Semikolon", () => {
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    for (const nr of ["80.1", "80.2", "80.3"]) expect(pruefung).toContain(`SELECT '${nr} `);
    expect(pruefung.indexOf("SELECT '58.1 ")).toBeLessThan(pruefung.indexOf("SELECT '80.1 "));
    expect(pruefung.trimEnd().endsWith(";")).toBe(true);
    const schluss = pruefung.split("\n").filter((z) => !z.trim().startsWith("--") && z.trimEnd().endsWith(";"));
    expect(schluss).toHaveLength(1);
  });

  it("beide Teile liegen, solange offen, im Korb und in der Sammeldatei", () => {
    const sammel = lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql");
    for (const [datei, sql] of [[KOPF_DATEI, KOPF_SQL], [INDEX_DATEI, INDEX_SQL]]) {
      const korb = `supabase/migrations-inbox/${datei}`;
      if (!existsSync(korb)) continue;
      expect(lies(korb)).toBe(sql);
      expect(sammel).toContain(sql.trim());
    }
  });
});
