import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FREIGESCHALTET_AB_RESERVIERUNG } from "./investmentFreischaltung";

/**
 * Die serverseitige Fassung der einen Finanzierungsregel (25.09.2026).
 *
 * Die Migration lässt sich hier nicht ausführen. Der Quelltext hält fest, dass
 * die Ausnahmen drinstehen, ohne die der Wachposten legitime Schreibwege
 * blockieren würde, und dass die Stufenliste dieselbe ist wie im Frontend.
 */

const DATEI = "20260925120000_finanzierung_intern_frei.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;

/** Der Rumpf einer Funktion, vom CREATE bis zum schließenden $$. */
function rumpf(name: string): string {
  const treffer = SQL.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`));
  expect(treffer, `Funktion ${name}`).toBeTruthy();
  return treffer![1];
}

describe("Migration finanzierung_intern_frei", () => {
  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und im README", () => {
    // Nach dem Ausfuehren raeumt Christian den Korb auf. Dann gibt es hier
    // nichts mehr zu vergleichen, und der Test bleibt gruen.
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(DATEI);
  });

  it("nennt Admin, Inhaber und den Dienstschlüssel als Ausnahme", () => {
    const ausnahme = rumpf("finanzierung_sperre_ausgenommen");
    expect(ausnahme).toContain("_user_id IS NULL");
    expect(ausnahme).toContain("'admin'");
    expect(ausnahme).toContain("'inhaber'");
  });

  it("beide Wachposten fragen zuerst die Ausnahme und den Altbestand ab", () => {
    for (const name of ["pruefe_finanzierung_intern_frei", "pruefe_finanzierungsstand_intern_frei"]) {
      const text = rumpf(name);
      expect(text, name).toContain("finanzierung_sperre_ausgenommen(auth.uid())");
      expect(text.indexOf("finanzierung_sperre_ausgenommen"), name).toBeLessThan(text.indexOf("RAISE EXCEPTION"));
    }
    expect(rumpf("pruefe_finanzierung_intern_frei")).toContain("finanzierung_altbestand(_inv)");
    expect(rumpf("pruefe_finanzierung_intern_frei")).toContain("finanzierung_hat_angebote(OLD.angebote)");
    expect(rumpf("pruefe_finanzierungsstand_intern_frei")).toContain("_alt_status IS NOT NULL");
  });

  it("nennt Selbstfinanzierer und Altbestand im Kopf", () => {
    expect(SQL).toContain("Selbstfinanzierer");
    expect(SQL).toContain("Altbestand");
  });

  it("prüft dieselben Stufen wie das Frontend", () => {
    const liste = rumpf("finanzierung_intern_frei_meta");
    const genannt = [...liste.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((s) => !["rvSigned", "pipelineStufe", "false", "true"].includes(s));
    expect(genannt.sort()).toEqual([...FREIGESCHALTET_AB_RESERVIERUNG].sort());
  });

  it("vergleicht investments.kunde_id nie mit Text", () => {
    // Dreimal ist eine Funktion an `kunde_id::text` gebrochen. Hier geht es
    // nur um `finanzierungen.kunde_id` (Text) gegen `investments.id::text`.
    const ohneKommentare = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");
    expect(ohneKommentare).not.toMatch(/i\.kunde_id::text|investments\.kunde_id::text/);
  });

  it("schreibt die Fehlermeldung auf Deutsch und ohne Gedankenstrich", () => {
    const meldungen = [...SQL.matchAll(/RAISE EXCEPTION\s*'([^']+)'/g)].map((m) => m[1]);
    expect(meldungen.length).toBe(2);
    for (const m of meldungen) {
      expect(m).toContain("Reservierung unterschrieben");
      expect(m).not.toMatch(/[–—]/);
    }
  });
});
