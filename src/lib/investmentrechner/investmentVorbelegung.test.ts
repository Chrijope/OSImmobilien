import { describe, expect, it, vi } from "vitest";
import type { ObjektData } from "@/lib/objekteStore";

/*
 * „Neue Berechnung“ aus dem Kundenprofil (seit dem 30.09.2026): Ein
 * Investment, das nur die Wohnung kennt und keine Objekt-Kennung trägt,
 * bekommt trotzdem die Zahlen der Objektanlage. Musterwerte, keine
 * Kundendaten.
 */
const investment = vi.hoisted(() => ({
  id: "i1", kontaktId: "k1", nummer: 1, label: "Investment 1", pipelineStufe: "objektauswahl",
  objektId: undefined as string | undefined, wohnungId: "w5",
}));
const objekt = vi.hoisted(
  () =>
    ({
      id: "o1", titel: "Musterhaus 30", adresse: "Musterstraße 30", plz: "39104", ort: "Magdeburg",
      beschreibung: "", highlights: [], bildUrl: "", bilder: [], dokumente: [], meta: {},
      afaDaten: { afaModell: "linear", afaSatz: 6.67, restnutzungsdauer: 50, grundstueckAnteil: 10 },
      wohnungen: [
        { id: "w5", weNr: "WE 05", groesse: 78.08, zimmer: 3, mieteGesamt: 596.16, vkGesamt: 178900, status: "frei" },
      ],
    }) as unknown as ObjektData,
);

vi.mock("@/lib/investmentsStore", () => ({ getInvestmentById: (id: string) => (id === investment.id ? investment : undefined) }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjekte: () => [objekt],
}));

import { vorbelegungAusInvestment } from "./investmentVorbelegung";

describe("vorbelegungAusInvestment", () => {
  it("findet die Wohnung aus dem Bestand auch ohne Objekt-Kennung am Investment", () => {
    const vor = vorbelegungAusInvestment("i1", new Date(2026, 8, 30));
    expect(vor?.wohnungId).toBe("w5");
    expect(vor?.quellen).toBeDefined();
    expect(vor?.eingabe.purchasePrice).toBe(178900);
    expect(vor?.eingabe.buildingDepreciationRate).toBe(6.67);
    expect(vor?.eingabe.buildingShare).toBe(90);
    // Sachsen-Anhalt aus der Postleitzahl: 5,0 % Grunderwerbsteuer.
    expect(vor?.eingabe.transferTaxRate).toBe(5);
  });
});
