import { describe, expect, it } from "vitest";
import { feldmarkierung, type Herkunft } from "./herkunft";

describe("feldmarkierung", () => {
  it("ordnet Objekt, Unterlagen, Selbstauskunft und alles andere zu", () => {
    const herkunft: Herkunft = {
      purchasePrice: { quelle: "objekt", text: "Aus der Objektanlage" },
      monthlyOperatingCosts: { quelle: "unterlagen", text: "Aus der Hausgeldabrechnung" },
      taxableIncomeCustomer: { quelle: "selbstauskunft", text: "Aus der Selbstauskunft" },
      equity: { quelle: "eigen", text: "" },
    };
    expect(feldmarkierung(herkunft, "purchasePrice")).toBe("objekt");
    expect(feldmarkierung(herkunft, "monthlyOperatingCosts")).toBe("objekt");
    expect(feldmarkierung(herkunft, "taxableIncomeCustomer")).toBe("selbstauskunft");
    // Übernommen und danach selbst geändert zählt als manuell.
    expect(feldmarkierung(herkunft, "equity")).toBe("manuell");
    expect(feldmarkierung(herkunft, "vacancyRate")).toBe("manuell");
    expect(feldmarkierung(undefined, "purchasePrice")).toBe("manuell");
  });
});
