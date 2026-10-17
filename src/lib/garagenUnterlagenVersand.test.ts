import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const metaGesetzt = vi.fn();
let garage: { nr: string; art: string; status: string; istMiete: number | null } | null = null;

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("@/lib/objekteStore", () => ({
  getObjektById: () => ({ titel: "Hauffstraße 38", adresse: "Hauffstraße 38", wohnungen: [{ id: "w1", weNr: "WE 46" }] }),
}));
vi.mock("@/lib/mietgarantie", () => ({ garageFuerEinheit: () => garage, mietgarantieFuerObjekt: () => null }));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: () => ({ vorname: "Anna", nachname: "Muster", email: "anna@example.de", strasse: "Musterweg", hausnummer: "1", plz: "10115", ort: "Berlin" }),
}));
vi.mock("@/lib/listendaten", () => ({ listendatenFuerEinheit: () => ({ werte: { haus: "38 f" } }) }));
vi.mock("@/lib/mieterStore", () => ({ getMieter: () => [] }));
vi.mock("@/lib/objektdaten", () => ({ aktuellerMieter: () => undefined }));
vi.mock("@/lib/abwicklungStore", () => ({ getAbwicklungDaten: () => ({}) }));
vi.mock("@/lib/investmentsStore", () => ({ getInvestmentMetaField: (_i: string, _k: string, f: unknown) => f, setInvestmentMetaFields: (...a: unknown[]) => metaGesetzt(...a) }));
vi.mock("@/lib/garagenUnterlagen", async (orig) => ({
  ...(await orig<typeof import("@/lib/garagenUnterlagen")>()),
  garagenUnterlagenPdfs: async () => ({ anschreiben: new Blob(["a"]), muster: new Blob(["m"]) }),
}));

import { garagenUnterlagenFuer, garagenUnterlagenSenden, nachNotartermin } from "./garagenUnterlagenVersand";

const inv = { id: "i1", kontaktId: "k1", objektId: "o1", wohnungId: "w1", nummer: 1, label: "", pipelineStufe: "notar", notarTermin: "2026-01-10", erstellt_am: "" };

describe("Garagenunterlagen am Investment", () => {
  beforeEach(() => { invoke.mockReset(); metaGesetzt.mockReset(); });

  it("nur für vermietete Garagen und erst nach dem Notartermin", () => {
    garage = null;
    expect(garagenUnterlagenFuer(inv)).toBe(false);
    garage = { nr: "G4", art: "garage", status: "frei", istMiete: null };
    expect(garagenUnterlagenFuer(inv)).toBe(false);
    garage = { nr: "G4", art: "garage", status: "extern", istMiete: 50 };
    expect(garagenUnterlagenFuer(inv)).toBe(true);
    expect(nachNotartermin(inv)).toBe(true);
    expect(nachNotartermin({ notarTermin: "2999-01-01" })).toBe(false);
    expect(nachNotartermin({})).toBe(false);
  });

  it("sendet beide PDFs an den Käufer und merkt sich den Versand", async () => {
    garage = { nr: "G4", art: "garage", status: "extern", istMiete: 50 };
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    await garagenUnterlagenSenden(inv);
    const body = invoke.mock.calls[0][1].body;
    expect(body.templateName).toBe("garagen-unterlagen");
    expect(body.recipientEmail).toBe("anna@example.de");
    expect(body.templateData).toEqual({ name: "Anna Muster", wohnung: "WE 46, Haus 38 f", garage: "G4" });
    expect(body.attachments.map((a: { filename: string }) => a.filename)).toEqual([
      "Ihre_Garage_Hauffstrasse_38_WE_46_Garage_G4.pdf", "Musterschreiben_Garagennutzer_Garage_G4.pdf",
    ]);
    expect(metaGesetzt).toHaveBeenCalledWith("i1", { garagenUnterlagenVersendetAm: expect.any(String) });
  });

  it("merkt sich nichts, wenn der Versand scheitert", async () => {
    invoke.mockResolvedValue({ data: { success: false, reason: "gesperrt" }, error: null });
    await expect(garagenUnterlagenSenden(inv)).rejects.toThrow("gesperrt");
    expect(metaGesetzt).not.toHaveBeenCalled();
  });
});
