import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Wächter „Objektscore nur intern“ (Strategie vom 04.10.2026).
 *
 * Der Score ist eine interne Sortierhilfe. Er erscheint nie im Exposé, im
 * Kundenlink, im Portal, in PDFs, Mails, der Kundenansicht oder dem
 * Präsentationsmodus, geht nicht an den MORE Lotsen oder eine KI, wird
 * nirgends gespeichert und steht in keiner Adresse. Dieser Test hält fest,
 * wer die Score-Module einbinden darf, und durchsucht die übrigen Stellen.
 */

const wurzel = resolve(__dirname, "../..");

function dateienUnter(ordner: string, mitTests = false): string[] {
  const liste: string[] = [];
  const sammeln = (o: string) => {
    for (const name of readdirSync(o)) {
      const pfad = join(o, name);
      if (statSync(pfad).isDirectory()) sammeln(pfad);
      else if (/\.(ts|tsx)$/.test(name) && (mitTests || !/[._]test\.(ts|tsx)$/.test(name))) liste.push(relative(wurzel, pfad));
    }
  };
  sammeln(resolve(wurzel, ordner));
  return liste;
}

const inhalt = (datei: string) => readFileSync(resolve(wurzel, datei), "utf-8");

const SCORE_MODULE = [
  "@/lib/objektScore", "@/lib/objektScoreDaten", "@/components/objektscore/ScoreAnzeige",
  "@/components/objektseite/PassendeKundenKarte", "./PassendeKundenKarte",
  "@/components/objektseite/PassendeKundenChip", "./PassendeKundenChip",
  "@/components/objektscore/usePassendeKunden",
];
const importiertScore = (code: string) =>
  SCORE_MODULE.some((m) => new RegExp(`from\\s+["']${m.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}["']`).test(code));

/** Wer den Score rechnen oder zeigen darf. Alles intern, alles nach Rolle. */
const ERLAUBT = [
  "src/lib/objektScoreDaten.ts",
  "src/lib/einheitEmpfehlung.ts", // nur die Sortierung „Bester Score“
  "src/components/objektscore/ScoreAnzeige.tsx",
  "src/components/objektscore/usePassendeKunden.ts",
  "src/components/kunden/ObjektEmpfehlungen.tsx",
  "src/components/kunden/ObjektauswahlFenster.tsx",
  "src/components/objektseite/EinheitenTabelle.tsx",
  "src/components/objektseite/PassendeKundenChip.tsx",
  "src/components/objektseite/PassendeKundenKarte.tsx",
  "src/pages/ObjektSeite.tsx",
  "src/pages/EinheitSeite.tsx",
  // Die alte Verwaltungs- und Wohnungsansicht, die der Vertriebspartner sieht (04.10.2026).
  "src/pages/ObjektDetail.tsx",
  "src/pages/WohnungDetail.tsx",
].sort();

describe("Objektscore nur intern", () => {
  const dateien = dateienUnter("src");

  it("nur die erlaubten Dateien binden die Score-Module ein", () => {
    expect(dateien.filter((d) => importiertScore(inhalt(d))).sort()).toEqual(ERLAUBT);
  });

  it("keine kundensichtbare Stelle bindet sie ein: Exposé, Portal, Kundenansicht, PDF, Mail, Lotse, Präsentation", () => {
    const kundensichtbar = dateien.filter((d) => /expose|portal|kundenansicht|kundenlink|pdf|mail|lotse|praesentation|handbuch/i.test(d));
    expect(kundensichtbar.length).toBeGreaterThan(20);
    expect(kundensichtbar.filter((d) => importiertScore(inhalt(d)))).toEqual([]);
  });

  it("keine Edge Function kennt den Score", () => {
    const functions = dateienUnter("supabase/functions", true);
    expect(functions.filter((d) => /objektScore|ScoreAnzeige|PassendeKunden/.test(inhalt(d)))).toEqual([]);
  });

  it("die Score-Module speichern nichts, rufen nichts auf und schreiben keine Adresse", () => {
    for (const d of ["src/lib/objektScore.ts", "src/lib/objektScoreDaten.ts", "src/components/objektscore/ScoreAnzeige.tsx", "src/components/objektscore/usePassendeKunden.ts",
      "src/components/objektseite/PassendeKundenChip.tsx", "src/components/objektseite/PassendeKundenKarte.tsx"]) {
      expect(inhalt(d), d).not.toMatch(/supabase\.|functions\.invoke|\bfetch\s*\(|localStorage|sessionStorage|setInvestmentMeta|updateKontakt|updateInvestment|URLSearchParams|setSearchParams|lovable/);
    }
  });

  it("die Karte „Passende Kunden“ hängt nur an Einheitenseite und Wohnungsansicht, nicht an Kundenansicht oder Präsentation", () => {
    expect(dateien.filter((d) => /PassendeKundenKarte/.test(inhalt(d)) && d !== "src/components/objektseite/PassendeKundenKarte.tsx").sort())
      .toEqual(["src/pages/EinheitSeite.tsx", "src/pages/WohnungDetail.tsx"]);
  });
});
