import { describe, it, expect } from "vitest";
// Betreff und Kaufpreis liegen bei der Edge Function, weil sie dort gebraucht
// werden. Getestet werden sie hier, weil Vitest nur unterhalb von src sucht,
// so wie bei bewerber-eingangsmail und bewerber-kennenlernen-ueberblick.
import {
  KAUFPREIS_UNBEKANNT,
  finanzierungBetreff,
  investmentKaufpreis,
  kaufpreisFuerMail,
  kaufpreisText,
} from "../../supabase/functions/_shared/finanzierung-starten-mail.ts";

describe("Betreff der Mail an den Finanzierungspartner", () => {
  it("nennt die Aufgabe und den Kunden", () => {
    expect(finanzierungBetreff("Otto Hans")).toBe("Finanzierung starten: Otto Hans");
  });

  it("faellt ohne Kundennamen auf einen vollstaendigen Satz zurueck", () => {
    // Nie "Finanzierung starten: undefined" im Postfach.
    expect(finanzierungBetreff(undefined)).toBe("Eine neue Finanzierung kann starten");
    expect(finanzierungBetreff("   ")).toBe("Eine neue Finanzierung kann starten");
  });
});

describe("Kaufpreis fuer die Mail an den Finanzierungspartner", () => {
  it("liest den Preis am Investment, nicht am Kontakt", () => {
    expect(investmentKaufpreis({ meta: { kaufpreis: 132000 } })).toBe(132000);
  });

  it("nimmt dieselben Quellen in derselben Reihenfolge wie die Anwendung", () => {
    // Reihenfolge aus kaufpreisAusMeta in src/lib/investmentsStore.ts und
    // vorhandeneObjektDaten in src/lib/objektDatenPflicht.ts.
    const meta = {
      kaufpreis: 132000,
      rvVirtualWohnung: { kaufpreis: 200000 },
      wohnungSnapshot: { kaufpreis: 300000, vkGesamt: 400000 },
      objektSnapshot: { kaufpreis: 500000 },
    };
    expect(investmentKaufpreis({ meta })).toBe(132000);
    expect(investmentKaufpreis({ meta: { ...meta, kaufpreis: 0 } })).toBe(200000);
    expect(investmentKaufpreis({ meta: { wohnungSnapshot: { vkGesamt: 275000 } } })).toBe(275000);
    expect(investmentKaufpreis({ meta: { wohnungSnapshot: { vk_gesamt: 275000 } } })).toBe(275000);
  });

  it("nimmt die Spalte investments.kaufpreis erst, wenn das Meta nichts hergibt", () => {
    expect(investmentKaufpreis({ kaufpreis: 189000, meta: {} })).toBe(189000);
    expect(investmentKaufpreis({ kaufpreis: 189000, meta: { kaufpreis: 132000 } })).toBe(132000);
  });

  it("haelt 0, Text und Unsinn fuer nicht erfasst", () => {
    expect(investmentKaufpreis({ meta: { kaufpreis: 0 } })).toBe(0);
    expect(investmentKaufpreis({ meta: { kaufpreis: "keine Angabe" } })).toBe(0);
    expect(investmentKaufpreis({ meta: { kaufpreis: -5000 } })).toBe(0);
    expect(investmentKaufpreis(null)).toBe(0);
    expect(investmentKaufpreis({})).toBe(0);
  });

  it("schreibt den Betrag deutsch mit Tausenderpunkt und Euro", () => {
    expect(kaufpreisText(132000)).toBe("132.000 €");
    expect(kaufpreisText(1250000)).toBe("1.250.000 €");
    expect(kaufpreisText(189999.4)).toBe("189.999 €");
  });

  it("schickt niemals undefined oder 0 Euro hinaus", () => {
    // Genau das war die Sorge: eine Zeile "Kaufpreis: 0 €" waere schlimmer als
    // gar keine, weil der Finanzierungspartner sie fuer eine Angabe haelt.
    const ohnePreis = kaufpreisFuerMail({ meta: {} });
    expect(ohnePreis).toBe(KAUFPREIS_UNBEKANNT);
    expect(ohnePreis).not.toMatch(/undefined|NaN|0 €/);
    expect(kaufpreisFuerMail(null)).toBe(KAUFPREIS_UNBEKANNT);
  });

  it("liefert bei vorhandenem Preis den fertigen Text fuer die Zeile", () => {
    expect(kaufpreisFuerMail({ meta: { kaufpreis: 132000 } })).toBe("132.000 €");
  });
});
