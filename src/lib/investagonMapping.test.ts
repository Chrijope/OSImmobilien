import { describe, expect, it, vi } from "vitest";
import { bilderAnfordern, statusFelder, findeBestandsEinheit, einheitAus, einheitMeta, kennung, projektAus, projektKennungVon } from "../../supabase/functions/investagon-import/mapping";
import { holeJson, zahl, zugaenge } from "../../supabase/functions/investagon-import/api";

// Feldnamen aus https://api.investagon.com/api/docs (09.09.2026), synthetische Werte.
const property = {
  id: 4711, api_property_id: "unit-uuid", object_apartment_number: "WE 01",
  object_size: 75.5, object_rooms: 3, purchase_price_apartment: 300000,
  purchase_price_furniture: 10000, purchase_price_parking: 20000,
  rent_apartment_month: 1000, rent_parking_month: 70,
  object_floor: "2. OG", object_street: "Teststraße", object_house_number: "5",
  object_postal_code: "10115", object_city: "Berlin", object_building_year: 2024,
  object_renovation_year: 2025, property_usage: "Eigentumswohnung", property_kind: "Neubau",
};

describe("Investagon Vollständige Detailantwort", () => {
  it("verwendet API-UUID statt interner numerischer ID", () => {
    expect(kennung(property)).toBe("unit-uuid");
    expect(projektKennungVon({ project: "/api/api_projects/project-uuid" })).toBe("project-uuid");
    expect(projektKennungVon({ project: { api_project_id: "project-uuid", id: 42 } })).toBe("project-uuid");
  });
  it("übernimmt dokumentierte Zahlen und hält Stellplatz separat für die CRM-Kalkulation", () => {
    const e = einheitAus(property);
    expect(e).toMatchObject({ we: "WE 01", kp: 300000, qm: 75.5, zi: 3, miete: 1000, moebel: 10000, stellplatzPreis: 20000, stellplatzMiete: 70, geschoss: "2. OG", sanierungsjahr: 2025 });
    expect(e.qmPreis).toBe(4105.96);
    expect(e.roh).toEqual(property);
  });
  it("übernimmt Adresse, Gebäudedaten und Beschreibung", () => {
    expect(projektAus({ ...property, object_explanation: "Objektbeschreibung" }, [einheitAus(property)])).toMatchObject({ adresse: "Teststraße 5", plz: "10115", ort: "Berlin", baujahr: 2024, bauzustand: "Neubau", anlageklasse: "Eigentumswohnung", beschreibung: "Objektbeschreibung" });
  });
  it("unterscheidet fehlende Kosten von ausdrücklich gelieferten Nullwerten", () => {
    // Die Rücklagenzuführung ist seit dem 25.09.2026 ein eigenes Feld, nie der Rücklagenbestand.
    expect(einheitMeta({ property_management_fee: 0, property_management_fee_sev: null, operation_cost_reserve_apartment: 30 })).toEqual({ verwaltungWegMonat: 0, ruecklageZufuehrungMonat: 30 });
  });
  it("überspringt Platzhalter statt sie als Nullwert zu interpretieren", () => {
    expect(zahl({ a: "n/a", b: "1.234,56 €" }, ["a", "b"])).toBe(1234.56);
  });
  it("sendet keine Investagon-Zugangsdaten an fremde Medienhosts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(holeJson({ token: "test", orgId: "org", basis: "https://api.investagon.com", name: "Testträger", slot: "", platz: 1 }, "https://cdn.example.com/image.jpg")).rejects.toThrow("API-Host");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("nennt Bauträger und Platz, damit die Herkunft am Objekt stehen kann", () => {
    const env = { get: (n: string) => ({ INVESTAGON_API_TOKEN: "t1", INVESTAGON_API_TOKEN_6: "t6" } as Record<string, string>)[n] };
    expect(zugaenge(env).map((z) => ({ name: z.name, platz: z.platz, slot: z.slot })))
      .toEqual([
        { name: "Lehner", platz: 1, slot: "" },
        { name: "OS Immobilien (eigener Bestand)", platz: 6, slot: "_6" },
      ]);
  });
});

describe("Befunde des Live-Diagnoseberichts vom 09.09.2026", () => {
  it("verarbeitet wikiPage als Klartext", () => {
    const p = projektAus({ api_project_id: "p", wikiPage: "<p>Gute Lage &amp; Ausstattung</p><p>71&nbsp;m²</p>" }, []);
    expect(p.beschreibung).toBe("Gute Lage & Ausstattung\n71 m²");
  });
  it("übernimmt Medien auch beim bestehenden Cron-Aufruf mit nur sync:true", () => {
    expect(bilderAnfordern({ sync: true })).toBe(true);
    expect(bilderAnfordern({ sync: true, bilder: false })).toBe(false);
    expect(bilderAnfordern({ trockenlauf: true })).toBe(false);
  });
  it("repariert die alte API-ID-Wohnungsnummer statt eine zweite Wohnung anzulegen", () => {
    const alt = { we_nr: "unit-uuid", meta: {} };
    expect(findeBestandsEinheit([alt], "unit-uuid", "WE 01")).toBe(alt);
    expect(findeBestandsEinheit([{ we_nr: "WE 01", meta: { investagonId: "andere-id" } }], "unit-uuid", "WE 01")).toBeUndefined();
  });
  it("hält die stabile ID bei einer geänderten Wohnungsnummer", () => {
    const alt = { we_nr: "WE 01", meta: { investagonId: "unit-uuid" } };
    expect(findeBestandsEinheit([alt], "unit-uuid", "WE 02")).toBe(alt);
  });
  it("erkennt dieselbe Wohnung wieder, wenn ein zweiter Zugang das Haus übernimmt", () => {
    // Der andere Investagon-Zugang führt eigene Kopien mit neuen Kennungen.
    // Ohne diesen Vergleich läge danach jede Wohnung doppelt im Objekt.
    const alt = { we_nr: "WE 01", meta: { investagonId: "lehner-1" } };
    expect(findeBestandsEinheit([alt], "moreimmo-1", "WE 01", new Set(["moreimmo-1"]))).toBe(alt);
  });
  it("nimmt keiner anderen gelieferten Wohnung ihre Nummer weg", () => {
    // "lehner-1" kommt in derselben Lieferung vor, gehört also zu einer
    // anderen Wohnung. Dann bleibt die Zeile unangetastet.
    const alt = { we_nr: "WE 01", meta: { investagonId: "lehner-1" } };
    expect(findeBestandsEinheit([alt], "lehner-2", "WE 01", new Set(["lehner-1", "lehner-2"])))
      .toBeUndefined();
  });
  it("stellt verkaufte und reservierte Investagon-Wohnungen nicht als frei dar", () => {
    expect(statusFelder({ active: 0 }).status).toBe("verkauft");
    for (const active of [5, 6, 7, 9]) expect(statusFelder({ active }).status).toBe("reserviert");
    expect(statusFelder({ active: 1 }).status).toBe("frei");
  });
  it("bewahrt Kundenbindung und lokal gesetzte Reservierungen", () => {
    expect(statusFelder({ active: 1 }, { status: "reserviert", kunde_id: "kunde" }).status).toBeUndefined();
    expect(statusFelder({ active: 1 }, { status: "reserviert", meta: {} }).status).toBeUndefined();
    expect(statusFelder({ active: 1 }, { status: "reserviert", meta: { investagonStatusVerwaltet: true } }).status).toBe("frei");
  });
});
