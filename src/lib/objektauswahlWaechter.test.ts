import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Wächter vor der Objektauswahl.
 *
 * Christian hat am 21.09.2026 gemeldet, dass ein Investment in der
 * Objektauswahl stand, obwohl die Selbstauskunft erst zu achtzig Prozent
 * ausgefüllt und nicht unterschrieben war. Dahinter steckte, dass mehrere
 * Stellen die Stufe setzen konnten, ohne die Selbstauskunft anzusehen.
 *
 * Geprüft wird dieselbe Bedingung, die auch die Karte im Kundenprofil
 * freischaltet: unterschrieben, PDF vorhanden, oder der Vermerk „Kunde
 * finanziert selbst".
 */

let investment: any = null;
let vermerk: any = { aktiv: false };

// Wie der echte Speicher: `getInvestmentById` liefert das umgewandelte
// Investment OHNE `meta`, die Meta-Werte gibt es nur ueber `getInvestmentMeta`.
// Die fruehere Attrappe lieferte `meta` am Investment mit und verdeckte so,
// dass der Waechter jede Selbstauskunft als nicht unterschrieben sah.
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: () => (investment ? { id: investment.id } : null),
  getInvestmentMetaField: (_id: string, key: string, fallback: unknown) =>
    investment?.meta?.[key] !== undefined ? investment.meta[key] : fallback,
}));

vi.mock("@/lib/selbstauskunftEntfaellt", () => ({
  getSelbstauskunftEntfaellt: () => vermerk,
}));

const { darfAufObjektauswahl } = await import("./objektauswahlWaechter");

beforeEach(() => {
  investment = null;
  vermerk = { aktiv: false };
});

describe("darfAufObjektauswahl", () => {
  it("lässt durch, wenn der Kunde unterschrieben hat", () => {
    investment = { id: "i1", meta: { saSigned: true } };
    expect(darfAufObjektauswahl("i1")).toBe(true);
  });

  it("lässt durch, wenn das fertige PDF vorliegt", () => {
    investment = { id: "i1", meta: { saPdf: "selbstauskunft-2026.pdf" } };
    expect(darfAufObjektauswahl("i1")).toBe(true);
  });

  it("lässt durch, wenn der Kunde selbst finanziert", () => {
    investment = { id: "i1", meta: {} };
    vermerk = { aktiv: true };
    expect(darfAufObjektauswahl("i1")).toBe(true);
  });

  it("hält die halb ausgefüllte, nicht unterschriebene Selbstauskunft auf", () => {
    // Genau Christians Fall: Daten sind da, die Unterschrift fehlt.
    investment = { id: "i1", meta: { saData: { fortschritt: 80 } } };
    expect(darfAufObjektauswahl("i1")).toBe(false);
  });

  it("sperrt nur nach einer Korrektur ab dem 26.09.2026, der Bestand bleibt wie bisher", () => {
    // Bestand vor dem 26.09.2026: bewusst unverändert (Entscheidung Christian).
    investment = { id: "i1", meta: { saPdf: "SA_alt.pdf", saSigned: false, saSignaturePending: true } };
    expect(darfAufObjektauswahl("i1")).toBe(true);
    investment = { id: "i1", meta: { saPdf: null, saSigned: false, saNeueUnterschriftSeit: "2026-09-26T10:00:00.000Z" } };
    expect(darfAufObjektauswahl("i1")).toBe(false);
  });

  it("verbirgt den Reservierungsknopf nach einer Korrektur, bis neu unterschrieben ist", () => {
    // Das Kundenprofil fragt ueber `darfReservierungStarten` genau diesen
    // Waechter. Auch ein stehengebliebenes PDF der alten Fassung zaehlt nicht.
    investment = { id: "i1", meta: { saPdf: "SA_alt.pdf", saSigned: false, saNeueUnterschriftSeit: "2026-09-27T08:00:00.000Z" } };
    expect(darfAufObjektauswahl("i1")).toBe(false);
    investment = { id: "i1", meta: { saPdf: "SA_neu.pdf", saSigned: true, saNeueUnterschriftSeit: "2026-09-27T08:00:00.000Z" } };
    expect(darfAufObjektauswahl("i1")).toBe(true);
  });

  it("lässt einen leeren Vorgang nicht durch", () => {
    investment = { id: "i1", meta: {} };
    expect(darfAufObjektauswahl("i1")).toBe(false);
  });

  it("hält an, wenn es das Investment gar nicht gibt", () => {
    investment = null;
    expect(darfAufObjektauswahl("weg")).toBe(false);
  });

  it("nimmt saSigned nur als echten Wahrheitswert, nicht als Text", () => {
    // Altdaten koennten "true" als Zeichenkette tragen. Lieber einen Vorgang
    // zu spaet vorruecken als einen zu frueh.
    investment = { id: "i1", meta: { saSigned: "true" } };
    expect(darfAufObjektauswahl("i1")).toBe(false);
  });

  it("lässt ein leeres PDF-Feld nicht als PDF durchgehen", () => {
    investment = { id: "i1", meta: { saPdf: "   " } };
    expect(darfAufObjektauswahl("i1")).toBe(false);
  });
});
