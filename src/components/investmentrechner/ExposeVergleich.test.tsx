import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { ExposeDokument, ExposeVergleichsdokument, type ExposeObjekt } from "./ExposeDokument";

/*
 * Geprüft wird der Zusammenbau des Exposés: bei einem Objekt neun Seiten (seit dem 11.10.2026 mit der Ampel)
 * (seit dem 25.09.2026 mit dem Glossar am Ende, seit dem 07.10.2026 mit
 * Deckblatt und Kennzahlen-Seite vorn), bei zwei Objekten kommt die
 * Vergleichsseite dazu und die Zählung läuft von 1 bis 19 durch.
 */

function objekt(aenderung: Partial<InvestmentEingabe>): ExposeObjekt {
  const input: InvestmentEingabe = {
    ...standardEingabe,
    clientName: "Familie Muster",
    taxableIncomeCustomer: 62000,
    purchasePrice: 300000,
    monthlyColdRent: 1000,
    ...aenderung,
  };
  return { input, result: berechneInvestment(input), photos: [], documents: [], documentData: leereUnterlagenDaten };
}

function seitenzahlen(wurzel: HTMLElement): string[] {
  return Array.from(wurzel.querySelectorAll(".expose-footer span:last-child")).map(
    (element) => element.textContent ?? "",
  );
}

describe("Exposé", () => {
  it("hat bei einem Objekt neun Seiten, das Glossar zuletzt", () => {
    const { container } = render(<ExposeDokument {...objekt({ propertyTitle: "4 WG München" })} />);
    expect(container.querySelectorAll(".expose-page")).toHaveLength(9);
    expect(seitenzahlen(container)).toEqual(Array.from({ length: 9 }, (_, i) => `Seite ${i + 1}`));
    // Die Ampel vor den Bildern, das Glossar danach.
    const seiten = [...container.querySelectorAll(".expose-page")];
    expect(seiten[6].classList.contains("einordnung-page")).toBe(true);
    expect(seiten[7].classList.contains("photos-page")).toBe(true);
    expect(seiten[8].classList.contains("glossary-page")).toBe(true);
    // Ohne Vergleich steht keine Objektkennzeichnung im Seitenkopf.
    expect(container.textContent).not.toContain("Objekt A");
  });

  it("hat bei zwei Objekten neunzehn durchnummerierte Seiten, jedes Objekt mit dem gewählten Deckblatt", () => {
    const a = objekt({ propertyTitle: "4 WG München", purchasePrice: 600000, monthlyColdRent: 2000 });
    const b = objekt({ propertyTitle: "Sonnenweg 12" });
    const { container } = render(<ExposeVergleichsdokument a={a} b={b} deckblatt="jahre" />);
    expect(container.querySelectorAll(".expose-page")).toHaveLength(19);
    expect(seitenzahlen(container)).toEqual(Array.from({ length: 19 }, (_, i) => `Seite ${i + 1}`));
    expect(container.querySelectorAll(".compare-page")).toHaveLength(1);
    expect(container.querySelectorAll(".deckblatt-jahre")).toHaveLength(2);
    expect(container.querySelectorAll(".deckblatt-blick")).toHaveLength(0);
  });

  it("nennt im Seitenkopf, um welches Objekt es geht", () => {
    const { container } = render(<ExposeVergleichsdokument a={objekt({})} b={objekt({})} />);
    const kopfzeilen = Array.from(container.querySelectorAll(".expose-page-heading span")).map(
      (element) => element.textContent ?? "",
    );
    // Alle Seiten außer dem Deckblatt, das die Marke rechts oben trägt.
    expect(kopfzeilen.filter((zeile) => zeile.endsWith("Objekt A"))).toHaveLength(8);
    expect(kopfzeilen.filter((zeile) => zeile.endsWith("Objekt B"))).toHaveLength(8);
    expect(kopfzeilen.filter((zeile) => zeile.endsWith("Objektvergleich"))).toHaveLength(1);
  });

  it("Plus: zwei Seiten Bankgespräch, mit Haken zwei Seiten Bankunterlagen, durchnummeriert (11.10.2026)", () => {
    const ohne = render(<ExposeDokument {...objekt({})} erweitert />).container;
    expect(ohne.querySelectorAll(".einordnung-page")).toHaveLength(2);
    expect(ohne.querySelectorAll(".bankunterlagen-page")).toHaveLength(0);
    const mit = render(<ExposeDokument {...objekt({ bankunterlagenInBerechnung: true })} erweitert />).container;
    expect(mit.querySelectorAll(".bankunterlagen-page")).toHaveLength(2);
    expect(seitenzahlen(mit)).toEqual(Array.from({ length: 12 }, (_, i) => `Seite ${i + 1}`));
    // Der Haken allein wirkt nur in Plus.
    const normal = render(<ExposeDokument {...objekt({ bankunterlagenInBerechnung: true })} />).container;
    expect(normal.querySelectorAll(".bankunterlagen-page")).toHaveLength(0);
  });
});
