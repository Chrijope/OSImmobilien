import { beforeEach, describe, expect, it, vi } from "vitest";

const meta = vi.hoisted(() => ({ werte: {} as Record<string, unknown>, geschrieben: [] as Array<[string, string, unknown]> }));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMeta: (id: string, key: string, fallback: unknown) => meta.werte[`${id}:${key}`] ?? fallback,
  setInvestmentMeta: (id: string, key: string, wert: unknown) => { meta.geschrieben.push([id, key, wert]); },
}));

const {
  darfWohnortMerken, gemerkteWohnortGeo, grob, wohnortAnfrage, wohnortAus, wohnortGeoAmInvestment,
  wohnortGeoMerken, wohnortKoordinateErmitteln, WOHNORT_GEO_SCHLUESSEL,
} = await import("@/lib/wohnortKoordinate");

beforeEach(() => {
  meta.werte = {};
  meta.geschrieben = [];
});

describe("Woher der Wohnort kommt", () => {
  it("zuerst aus dem Kontakt, auch wenn die Selbstauskunft noch die alte Adresse hat", () => {
    // Genau der Fehlerfall: Selbstauskunft mit Platzhalteradresse, Kontakt danach korrigiert.
    expect(wohnortAus({ plz: "12345", ort: "Musterstadt", strasse: "Musterstraße 1" }, { plz: "83022", ort: "Rosenheim" }))
      .toEqual({ plz: "83022", ort: "Rosenheim", quelle: "kontakt" });
  });

  it("sonst aus der Selbstauskunft des Investments", () => {
    expect(wohnortAus({ plz: "83022", ort: "Rosenheim", strasse: "Geheimweg 7" }, { plz: "", ort: "" }))
      .toEqual({ plz: "83022", ort: "Rosenheim", quelle: "selbstauskunft" });
    expect(wohnortAus({ plz: "83022", ort: "Rosenheim" }, null)?.quelle).toBe("selbstauskunft");
    // Eine Selbstauskunft ohne PLZ zählt nicht, auch wenn ein Ort dasteht.
    expect(wohnortAus({ ort: "Rosenheim" }, { plz: "", ort: "München" })).toBeNull();
  });

  it("ohne PLZ gibt es keinen Wohnort", () => {
    expect(wohnortAus({ ort: "Rosenheim" }, { plz: "", ort: "Rosenheim" })).toBeNull();
    expect(wohnortAus(undefined, null)).toBeNull();
  });
});

describe("Was an Photon geht", () => {
  it("nur „PLZ Ort“, keine Straße, kein Name", () => {
    expect(wohnortAnfrage({ plz: " 83022 ", ort: "Rosenheim" })).toBe("83022 Rosenheim");
    expect(wohnortAnfrage({ plz: "83022", ort: "" })).toBe("83022");
  });

  it("fragt genau diese Zeichenkette an und rundet das Ergebnis grob", async () => {
    const suche = vi.fn(async () => ({ lat: 47.856789, lng: 12.128765 }));
    const geo = await wohnortKoordinateErmitteln(
      { plz: "83022", ort: "Rosenheim", strasse: "Geheimweg 7", name: "Max Muster" } as never,
      suche,
    );
    expect(suche).toHaveBeenCalledTimes(1);
    expect(suche).toHaveBeenCalledWith("83022 Rosenheim");
    expect(geo).toEqual({ plz: "83022", lat: 47.86, lng: 12.13 });
  });

  it("wirft, wenn es nichts anzufragen gibt, ohne zu fragen", async () => {
    const suche = vi.fn();
    await expect(wohnortKoordinateErmitteln({ plz: "", ort: "" }, suche)).rejects.toThrow();
    expect(suche).not.toHaveBeenCalled();
  });

  it("grob heißt zwei Nachkommastellen", () => {
    expect(grob({ lat: 48.13743, lng: 11.57549 })).toEqual({ lat: 48.14, lng: 11.58 });
  });
});

describe("Merken am Investment", () => {
  it("gilt nur, solange die PLZ dieselbe ist", () => {
    const gespeichert = { plz: "83022", lat: 47.86, lng: 12.13 };
    expect(gemerkteWohnortGeo(gespeichert, "83022")).toEqual(gespeichert);
    expect(gemerkteWohnortGeo(gespeichert, "80331")).toBeNull();
    expect(gemerkteWohnortGeo({ plz: "83022", lat: "x", lng: 1 }, "83022")).toBeNull();
    expect(gemerkteWohnortGeo(null, "83022")).toBeNull();
  });

  it("liest über das Store-Modul", () => {
    meta.werte[`inv-1:${WOHNORT_GEO_SCHLUESSEL}`] = { plz: "83022", lat: 47.86, lng: 12.13 };
    expect(wohnortGeoAmInvestment("inv-1", "83022")).toEqual({ plz: "83022", lat: 47.86, lng: 12.13 });
    expect(wohnortGeoAmInvestment("inv-1", "83024")).toBeNull();
  });

  it("schreibt nur PLZ und grobe Koordinate, und nur für Rollen, die schreiben dürfen", () => {
    expect(wohnortGeoMerken("inv-1", { plz: "83022", lat: 47.86, lng: 12.13 }, "vertriebspartner")).toBe(true);
    expect(meta.geschrieben).toEqual([["inv-1", "wohnortGeo", { plz: "83022", lat: 47.86, lng: 12.13 }]]);

    expect(wohnortGeoMerken("inv-1", { plz: "83022", lat: 47.86, lng: 12.13 }, "finanzierungspartner")).toBe(false);
    expect(meta.geschrieben).toHaveLength(1);
  });

  it("Rollen, die merken dürfen", () => {
    for (const r of ["admin", "inhaber", "vertriebsleiter", "vertriebspartner", "backoffice"]) expect(darfWohnortMerken(r)).toBe(true);
    for (const r of ["finanzierungspartner", "setterin", "", undefined]) expect(darfWohnortMerken(r)).toBe(false);
  });
});
