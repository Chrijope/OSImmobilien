import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Die Altwege über Objekt- und Wohnungsseite, seit dem 23.09.2026.
 *
 * Bis dahin reservierte die Wohnungsseite schon beim Klick auf „Kunde
 * reservieren“, bevor es überhaupt eine Vereinbarung gab, und der Abgleich auf
 * der Objektseite setzte jede Einheit auf „reserviert“, deren Investment auf
 * der Stufe „Reservierung“ stand. Diese Stufe setzt aber schon das Absenden.
 * Nach Christians Regeln bleibt die Einheit bis zur Unterschrift frei.
 *
 * Außerdem verlangten beide Seiten eine unterschriebene Selbstauskunft, das
 * Kundenprofil ließ auch „Kunde finanziert selbst“ gelten. Jetzt gilt überall
 * `darfReservierungStarten`.
 */

const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");

function funktionsrumpf(quelle: string, kopf: string): string {
  const start = quelle.indexOf(kopf);
  expect(start).toBeGreaterThan(-1);
  // Bis zur nächsten Handler-Definition auf derselben Einrückung.
  const rest = quelle.slice(start + kopf.length);
  const ende = rest.search(/\n {2}const handle/);
  return rest.slice(0, ende < 0 ? undefined : ende);
}

describe("Wohnungsseite", () => {
  const quelle = lies("src/pages/WohnungDetail.tsx");

  it("reserviert beim Klick nicht mehr, sondern führt nur ins Formular", () => {
    expect(quelle).not.toContain("reserveWohnung");
    const rumpf = funktionsrumpf(quelle, "const handleReservieren = async () => {");
    expect(rumpf).toContain("navigate(`/reservierung?");
  });

  it("lässt Selbstauskunft oder „finanziert selbst“ gelten", () => {
    expect(quelle).toContain("darfReservierungStarten(investmentIdFromUrl)");
    expect(quelle).not.toContain("getSaSigned(");
  });

  it("zeigt den Knopf nie an einer Einheit eines Globalobjekts", () => {
    // Seit dem 23.09.2026 über die eine Globalobjekt-Frage (`istGlobalobjekt`).
    expect(quelle.match(/darfReservieren\(user\.role\) && !istGlobalobjekt\(objekt\)/g)?.length).toBe(2);
  });
});

describe("Objektseite (Verwaltung)", () => {
  const quelle = lies("src/pages/ObjektDetail.tsx");

  it("reserviert beim Klick nicht, sondern führt nur ins Formular", () => {
    const rumpf = funktionsrumpf(quelle, "const handleKundeReservieren = (wId: string) => {");
    expect(rumpf).not.toContain("reserveWohnung");
    expect(rumpf).toContain("darfReservierungStarten(investmentIdFromUrl)");
    expect(rumpf).toContain("istGlobalobjekt(objekt)");
  });

  it("zieht im Abgleich die Stufe „Reservierung“ nur mit wirksamer Unterschrift nach", () => {
    expect(quelle).toContain('(inv.pipelineStufe !== "reservierung" || reservierungIstWirksam(inv.id))');
  });

  it("hat keinen Weg mehr, der ohne Prüfung per Klick reserviert", () => {
    expect(quelle).not.toContain("const handleReservieren = (wId: string)");
    expect(quelle).not.toContain("getSaSigned(");
  });
});
