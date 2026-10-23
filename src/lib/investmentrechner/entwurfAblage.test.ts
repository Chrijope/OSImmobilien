import { beforeEach, describe, expect, it, vi } from "vitest";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";

// Die Ablage liest über die Prüfungen des Stores, der Supabase braucht nicht.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { entwurfLaden, entwurfLoeschen, entwurfSpeichern, entwurfSchluessel } = await import("./entwurfAblage");
const { berechneInvestment, mitRuecklagenVorgabe, standardEingabe, EINGABE_VERSION } = await import("./rechenkern");
const { leereUnterlagenDaten } = await import("./unterlagenAuslesen");
const { standardKaufnebenkostenauswahl } = await import("./kaufnebenkostenAuswahl");

/*
 * Autospeichern und Rücklagenvorgabe, seit dem 23.10.2026 (Christian).
 */

describe("Rücklage im Hausgeld: 1 € je m² Wohnfläche", () => {
  it("steht sofort im Feld und folgt der Fläche, solange niemand einen Wert gesetzt hat", () => {
    const start = mitRuecklagenVorgabe({ ...standardEingabe, area: 65.5 }, false);
    expect(start.monthlyReserveContribution).toBe(65.5);
    expect(start.monthlyReserveContributionAuto).toBe(true);
    const groesser = mitRuecklagenVorgabe({ ...start, area: 80 }, false);
    expect(groesser.monthlyReserveContribution).toBe(80);
    // Und sie rechnet genau einmal, im Cashflow.
    expect(berechneInvestment(groesser).years[0].reserveContribution).toBeCloseTo(960, 6);
  });

  it("bleibt stehen, sobald ein Wert von Hand, aus Unterlagen oder Objektdaten kommt", () => {
    const gesetzt = mitRuecklagenVorgabe({ ...standardEingabe, area: 70, monthlyReserveContribution: 45 }, true);
    expect(gesetzt.monthlyReserveContribution).toBe(45);
    expect(gesetzt.monthlyReserveContributionAuto).toBe(false);
    // Danach ändert auch eine neue Fläche nichts mehr.
    expect(mitRuecklagenVorgabe({ ...gesetzt, area: 90 }, false).monthlyReserveContribution).toBe(45);
  });

  it("gibt ohne Änderung dieselbe Eingabe zurück", () => {
    const einmal = mitRuecklagenVorgabe({ ...standardEingabe, area: 50 }, false);
    expect(mitRuecklagenVorgabe(einmal, false)).toBe(einmal);
  });
});

describe("Entwurf im Browser", () => {
  let speicher: Map<string, string>;
  beforeEach(() => {
    speicher = setzeSpeicherAttrappe();
  });

  const entwurf = (photos: string[] = []) => ({
    objekte: [
      {
        eingabe: { ...standardEingabe, purchasePrice: 250_000, seniorLoanMode: "euro" as const, seniorLoanValue: 200_000 },
        knk: standardKaufnebenkostenauswahl,
        herkunft: { purchasePrice: { quelle: "eigen" as const, text: "" } },
        documentData: { ...leereUnterlagenDaten, reserveAmount: 12_000 },
        photos,
      },
    ],
    kundeId: "k1",
    investmentId: null,
    berechnungId: null,
    berechnungName: "",
    aktivIndex: 0,
  });

  it("speichert alle Eingaben und liest sie gleich wieder", () => {
    entwurfSpeichern("frei", entwurf(["data:image/png;base64,AAA"]), true);
    const geladen = entwurfLaden("frei")!;
    expect(geladen.objekte[0].eingabe.purchasePrice).toBe(250_000);
    expect(geladen.objekte[0].eingabe.seniorLoanValue).toBe(200_000);
    expect(geladen.objekte[0].eingabe.eingabeVersion).toBe(EINGABE_VERSION);
    expect(geladen.objekte[0].herkunft.purchasePrice?.quelle).toBe("eigen");
    expect(geladen.objekte[0].documentData.reserveAmount).toBe(12_000);
    expect(geladen.objekte[0].photos).toEqual(["data:image/png;base64,AAA"]);
    expect(geladen.kundeId).toBe("k1");
  });

  it("legt die Bilder getrennt ab und schreibt sie nur, wenn sie sich geändert haben", () => {
    entwurfSpeichern("frei", entwurf(["bild1"]), true);
    entwurfSpeichern("frei", entwurf(["bild2"]), false);
    expect(entwurfLaden("frei")!.objekte[0].photos).toEqual(["bild1"]);
    expect(JSON.parse(speicher.get(entwurfSchluessel("frei"))!).objekte[0]).not.toHaveProperty("photos");
  });

  it("hält die Zusammenhänge auseinander und löscht beim Zurücksetzen", () => {
    entwurfSpeichern("einheit:w1", entwurf(), true);
    expect(entwurfLaden("einheit:w2")).toBeNull();
    entwurfLoeschen("einheit:w1");
    expect(entwurfLaden("einheit:w1")).toBeNull();
  });

  it("läuft ohne Ablage weiter, wenn der Browser sie sperrt", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("gesperrt");
        },
        setItem: () => {
          throw new Error("voll");
        },
        removeItem: () => {
          throw new Error("gesperrt");
        },
      },
    });
    expect(() => entwurfSpeichern("frei", entwurf(), true)).not.toThrow();
    expect(entwurfLaden("frei")).toBeNull();
    expect(() => entwurfLoeschen("frei")).not.toThrow();
  });

  it("liest Unsinn als keinen Entwurf", () => {
    speicher.set(entwurfSchluessel("frei"), "{kaputt");
    expect(entwurfLaden("frei")).toBeNull();
    speicher.set(entwurfSchluessel("frei"), JSON.stringify({ objekte: [] }));
    expect(entwurfLaden("frei")).toBeNull();
  });
});
