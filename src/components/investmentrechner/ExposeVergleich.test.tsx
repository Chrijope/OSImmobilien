import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { ExposeDokument, ExposeVergleichsdokument, type ExposeObjekt } from "./ExposeDokument";

/*
 * Geprüft wird der Zusammenbau des Exposés: bei einem Objekt acht Seiten
 * (seit dem 25.09.2026 mit dem Glossar am Ende, seit dem 07.10.2026 mit
 * Deckblatt und Kennzahlen-Seite vorn), bei zwei Objekten kommt die
 * Vergleichsseite dazu und die Zählung läuft von 1 bis 17 durch.
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
  it("hat bei einem Objekt acht Seiten, das Glossar zuletzt", () => {
    const { container } = render(<ExposeDokument {...objekt({ propertyTitle: "4 WG München" })} />);
    expect(container.querySelectorAll(".expose-page")).toHaveLength(8);
    expect(seitenzahlen(container)).toEqual(Array.from({ length: 8 }, (_, i) => `Seite ${i + 1}`));
    // Das Glossar steht nach den Bildern.
    const seiten = [...container.querySelectorAll(".expose-page")];
    expect(seiten[6].classList.contains("photos-page")).toBe(true);
    expect(seiten[7].classList.contains("glossary-page")).toBe(true);
    // Ohne Vergleich steht keine Objektkennzeichnung im Seitenkopf.
    expect(container.textContent).not.toContain("Objekt A");
  });

  it("hat bei zwei Objekten siebzehn durchnummerierte Seiten, jedes Objekt mit dem gewählten Deckblatt", () => {
    const a = objekt({ propertyTitle: "4 WG München", purchasePrice: 600000, monthlyColdRent: 2000 });
    const b = objekt({ propertyTitle: "Sonnenweg 12" });
    const { container } = render(<ExposeVergleichsdokument a={a} b={b} deckblatt="jahre" />);
    expect(container.querySelectorAll(".expose-page")).toHaveLength(17);
    expect(seitenzahlen(container)).toEqual(Array.from({ length: 17 }, (_, i) => `Seite ${i + 1}`));
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
    expect(kopfzeilen.filter((zeile) => zeile.endsWith("Objekt A"))).toHaveLength(7);
    expect(kopfzeilen.filter((zeile) => zeile.endsWith("Objekt B"))).toHaveLength(7);
    expect(kopfzeilen.filter((zeile) => zeile.endsWith("Objektvergleich"))).toHaveLength(1);
  });
});
