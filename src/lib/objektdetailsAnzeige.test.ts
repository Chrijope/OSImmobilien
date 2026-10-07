import { describe, it, expect } from "vitest";
import {
  gemeinschaftseigentumAnzeige, importSanierungsjahre, KEINE_ANGABEN, objektdetailsAnzeige,
  sanierungenAnzeige, sanierungenAusObjekttexteKi, verwaltungAnzeige, VERMERK_BAUTRAEGER,
  VERWALTUNG_WEG, VERWALTUNG_WEG_SEV, type ObjektFuerAnzeige,
} from "@/lib/objektdetailsAnzeige";

/**
 * Die Kacheln „Verwaltung“, „Gemeinschaftseigentum“ und „Sanierungen“ auf
 * Objektseite, Einheitsseite und im Exposé, nach Christians Auftrag vom
 * 23.09.2026.
 */

const heute = new Date(2026, 8, 23);

function objekt(teil: Partial<ObjektFuerAnzeige> & { meta?: Record<string, unknown> } = {}): ObjektFuerAnzeige {
  return { titel: "Haus", meta: {}, wohnungen: [], ...teil } as ObjektFuerAnzeige;
}

describe("Verwaltung", () => {
  it("zeigt immer die WEG-Verwaltung", () => {
    expect(verwaltungAnzeige(objekt()).wert).toBe(VERWALTUNG_WEG);
    expect(verwaltungAnzeige(objekt()).unter).toBeUndefined();
  });

  it("ergänzt bei WG und Co-Living die SEV-Verwaltung", () => {
    expect(verwaltungAnzeige(objekt({ meta: { anlageklasse: "WG-Wohnung" } })).wert).toBe(VERWALTUNG_WEG_SEV);
    expect(verwaltungAnzeige(objekt({ titel: "Landsbergerstraße 22a (Co-Living)" })).wert).toBe(VERWALTUNG_WEG_SEV);
  });

  it("nennt die SEV-Verwaltung auch, sobald ein SEV-Betrag gepflegt ist (24.09.2026)", () => {
    expect(verwaltungAnzeige(objekt(), 80).wert).toBe(VERWALTUNG_WEG_SEV);
    expect(verwaltungAnzeige(objekt({ meta: { verwaltungskostenSev: 35 } })).wert).toBe(VERWALTUNG_WEG_SEV);
    expect(verwaltungAnzeige(objekt(), 0).wert).toBe(VERWALTUNG_WEG);
    expect(objektdetailsAnzeige(objekt(), { investagonRaw: undefined, verwaltungSevMonat: 80 }, heute).verwaltung.wert).toBe(VERWALTUNG_WEG_SEV);
  });

  it("verliert die gepflegte Angabe nicht, sondern stellt sie mit 360°-Merkmal und Hausgeld darunter", () => {
    const a = verwaltungAnzeige(objekt({
      meta: { verwaltung: "Hausverwaltung Beispiel GmbH", investagonRaw: { tags: ["4. 360°-Verwaltung: inklusive"] } },
      globalDaten: { hausgeldMonat: 1200 } as never,
    }));
    expect(a.wert).toBe(VERWALTUNG_WEG);
    expect(a.unter).toContain("Hausverwaltung Beispiel GmbH");
    expect(a.unter).toContain("360°-Verwaltung inklusive");
    expect(a.unter).toMatch(/Hausgeld gesamt 1\.200\s€ je Monat/);
  });
});

describe("Gemeinschaftseigentum", () => {
  it("zeigt nie die Objektbeschreibung aus den Freitexten", () => {
    const a = gemeinschaftseigentumAnzeige(objekt({
      meta: { investagonRaw: { extras: [{ value: "Dach und Fassade wurden bereits renoviert.", weight: 0 }] } },
    }));
    expect(a.wert).toBe(KEINE_ANGABEN);
    expect(a.unter).toBeUndefined();
  });

  it("setzt sich aus Einheiten, Etagen, Heizung, Aufzug, Stellplätzen und Grundstück zusammen", () => {
    const a = gemeinschaftseigentumAnzeige(objekt({
      meta: { einheitenImHaus: 14 },
      globalDaten: { etagen: 4, stellplaetze: 8, grundstueckQm: 780 } as never,
      wohnungen: [{ investagonRaw: { heating_type: "gas", tags: ["7. Aufzug: ja"] } }, {}, {}] as never,
    }));
    // Die gepflegte Zahl des Hauses, nicht die drei Einheiten im CRM.
    expect(a.wert).toBe("14 Einheiten");
    expect(a.unter).toBe("4 Etagen, Heizung Gas, Aufzug, 8 Stellplätze, Grundstück 780 m²");
    expect(a.gepflegt).toBe(false);
  });

  it("nennt ohne gepflegte Zahl keine Einheiten, auch wenn das CRM mehrere kennt", () => {
    const a = gemeinschaftseigentumAnzeige(objekt({
      globalDaten: { etagen: 4 } as never,
      wohnungen: [{}, {}, {}, {}] as never,
    }));
    expect(a.angaben).toEqual(["4 Etagen"]);
  });

  it("nennt eine einzelne Einheit nicht, weil das CRM das Haus dann nicht kennt", () => {
    const a = gemeinschaftseigentumAnzeige(objekt({ wohnungen: [{}] as never, meta: { investagonRaw: { heating_type: "district_heating" } } }));
    expect(a.wert).toBe("Heizung Fernwärme");
    expect(a.angaben).toEqual(["Heizung Fernwärme"]);
  });

  it("liest „kein Aufzug“ auch als Aussage ohne Doppelpunkt", () => {
    const a = gemeinschaftseigentumAnzeige(objekt({ meta: { investagonRaw: { tags: ["3. Kein Aufzug"] } } }));
    expect(a.wert).toBe("kein Aufzug");
  });

  it("ergänzt auf der Einheitsseite den Miteigentumsanteil", () => {
    const o = objekt({ globalDaten: { etagen: 3 } as never });
    const a = gemeinschaftseigentumAnzeige(o, { investagonRaw: { object_share_owner: 2.345 } });
    expect(a.wert).toBe("3 Etagen");
    expect(a.unter).toBe("Miteigentumsanteil 2,345 %");
    // Nur der Anteil vorhanden: dann ist er der Wert.
    expect(gemeinschaftseigentumAnzeige(objekt(), { investagonRaw: { object_share_owner: 1.5 } }).wert).toBe("Miteigentumsanteil 1,5 %");
  });

  it("lässt einen gepflegten Text gewinnen, mit dem Anteil darunter", () => {
    const o = objekt({ meta: { gemeinschaftseigentum: "5 Etagen, kein Aufzug, Fahrradraum" }, globalDaten: { etagen: 9 } as never });
    const a = gemeinschaftseigentumAnzeige(o, { investagonRaw: { object_share_owner: 2 } });
    expect(a).toMatchObject({ wert: "5 Etagen", unter: "kein Aufzug, Fahrradraum, Miteigentumsanteil 2 %", gepflegt: true });
  });
});

describe("Sanierungen: herausgelesene Maßnahmen defensiv lesen", () => {
  it("liest die vereinbarte Form und verwirft, was nicht passt", () => {
    const meta = {
      objekttexteKi: {
        sanierungen: [
          { jahr: "2024", massnahme: "Dach und Fassade renoviert", beleg: "Extras: Dach und Fassade 2024" },
          { jahr: 2021, massnahme: "Heizung erneuert" },
          { jahr: "", massnahme: "Fenster getauscht", beleg: "" },
          { jahr: "2020", massnahme: "   " },
          "Unsinn",
          null,
        ],
      },
    };
    expect(sanierungenAusObjekttexteKi(meta)).toEqual([
      { jahr: "2024", massnahme: "Dach und Fassade renoviert", quelle: "bautraeger", beleg: "Extras: Dach und Fassade 2024" },
      { jahr: "2021", massnahme: "Heizung erneuert", quelle: "bautraeger" },
      { jahr: "", massnahme: "Fenster getauscht", quelle: "bautraeger" },
    ]);
  });

  it("kommt mit fehlendem oder kaputtem Feld zurecht", () => {
    expect(sanierungenAusObjekttexteKi(undefined)).toEqual([]);
    expect(sanierungenAusObjekttexteKi({})).toEqual([]);
    expect(sanierungenAusObjekttexteKi({ objekttexteKi: "x" })).toEqual([]);
    expect(sanierungenAusObjekttexteKi({ objekttexteKi: { sanierungen: { jahr: "2024" } } })).toEqual([]);
  });
});

describe("Sanierungen: Quellen und Vorrang", () => {
  const ki = { objekttexteKi: { sanierungen: [{ jahr: "2023", massnahme: "Heizung", beleg: "b" }, { jahr: "2024", massnahme: "Dach", beleg: "a" }] } };

  it("1. gepflegte Maßnahmen gewinnen gegen herausgelesene", () => {
    const a = sanierungenAnzeige(objekt({ meta: { ...ki, sanierungen: [{ jahr: "2019", massnahme: "Fassade", betrag: 80000 }] } }), heute);
    expect(a.art).toBe("gepflegt");
    expect(a.eintraege).toEqual([{ jahr: "2019", massnahme: "Fassade", betrag: 80000, quelle: "gepflegt" }]);
    expect(a.wert).toBe("Zuletzt 2019");
    expect(a.unter).toBe("2019 Fassade");
  });

  it("2. sonst die herausgelesenen, neueste zuerst und gekennzeichnet", () => {
    const a = sanierungenAnzeige(objekt({ meta: ki }), heute);
    expect(a.art).toBe("bautraeger");
    expect(a.eintraege.map((e) => e.massnahme)).toEqual(["Dach", "Heizung"]);
    expect(a.wert).toBe("Zuletzt 2024");
    expect(a.unter).toBe(`2024 Dach, 2023 Heizung · ${VERMERK_BAUTRAEGER}`);
  });

  it("3. dazu die Sanierungsjahre aus dem Import, ohne die schon genannten", () => {
    const a = sanierungenAnzeige(objekt({
      meta: ki,
      wohnungen: [{ sanierungsjahr: 2024 }, { investagonRaw: { object_renovation_year: 2025 } }] as never,
    }), heute);
    expect(a.importJahre).toEqual([2025]);
    expect(a.jahre).toEqual([2025, 2024, 2023]);
    expect(a.wert).toBe("Zuletzt 2025");
    expect(a.unter).toBe(`2024 Dach, 2023 Heizung · ${VERMERK_BAUTRAEGER} · Sanierungsjahr 2025 laut Objektdaten`);
  });

  it("zeigt nur Import-Jahre, wenn es keine Maßnahmen gibt", () => {
    const a = sanierungenAnzeige(objekt({ meta: { investagonRaw: { object_renovation_year: 2021 } } }), heute);
    expect(a).toMatchObject({ art: "import", wert: "Zuletzt 2021", eintraege: [] });
    expect(a.unter).toBe("Sanierungsjahr 2021 laut Objektdaten, Maßnahmen nicht genannt");
  });

  it("zählt ein Sanierungsjahr bis zum Baujahr nicht als Sanierung", () => {
    const o = objekt({ globalDaten: { baujahr: 1971 } as never, wohnungen: [{ sanierungsjahr: 1971 }, { sanierungsjahr: 0 }] as never });
    expect(importSanierungsjahre(o)).toEqual([]);
    expect(sanierungenAnzeige(o, heute).wert).toBe(KEINE_ANGABEN);
  });

  it("zeigt „Laut Bauträger“ bei Maßnahmen ohne Jahr", () => {
    const a = sanierungenAnzeige(objekt({ meta: { objekttexteKi: { sanierungen: [{ jahr: "", massnahme: "Fenster getauscht", beleg: "" }] } } }), heute);
    expect(a.wert).toBe("Laut Bauträger");
    expect(a.unter).toBe(`Fenster getauscht · ${VERMERK_BAUTRAEGER}`);
  });

  it("nennt geplante Maßnahmen nicht „zuletzt“", () => {
    expect(sanierungenAnzeige(objekt({ meta: { sanierungen: [{ jahr: "2027", massnahme: "Fassade" }] } }), heute).wert).toBe("Geplant 2027");
    expect(sanierungenAnzeige(objekt({ meta: { sanierungen: [{ jahr: "2027", massnahme: "Fassade" }, { jahr: "2024", massnahme: "Heizung" }] } }), heute).wert).toBe("Zuletzt 2024");
  });

  it("zeigt in der Kachel höchstens drei Maßnahmen", () => {
    const sanierungen = ["2020", "2021", "2022", "2023", "2024"].map((jahr) => ({ jahr, massnahme: `M${jahr}` }));
    const a = sanierungenAnzeige(objekt({ meta: { sanierungen } }), heute);
    expect(a.eintraege).toHaveLength(5);
    expect(a.unter).toBe("2024 M2024, 2023 M2023, 2022 M2022 und 2 weitere");
  });

  it("zeigt bei einem Neubau ohne Maßnahmen „Neubau“ mit Baujahr", () => {
    const a = sanierungenAnzeige(objekt({ globalDaten: { zustand: "Neubau", baujahr: 2025 } as never, wohnungen: [{ sanierungsjahr: 2026 }] as never }), heute);
    expect(a).toMatchObject({ art: "neubau", wert: "Neubau 2025", importJahre: [] });
    expect(sanierungenAnzeige(objekt({ meta: { objektart: "kfw40" } }), heute).wert).toBe("Neubau");
  });

  it("sagt ehrlich, wenn nichts da ist", () => {
    const a = sanierungenAnzeige(objekt(), heute);
    expect(a).toMatchObject({ art: "keine", wert: KEINE_ANGABEN, eintraege: [] });
    expect(a.unter).toBeUndefined();
  });
});

describe("objektdetailsAnzeige", () => {
  it("liefert auf Objekt- und Einheitsseite dieselbe Verwaltung und dieselben Sanierungen", () => {
    const o = objekt({ meta: { anlageklasse: "WG-Wohnung", sanierungen: [{ jahr: "2022", massnahme: "Dach" }] } });
    const objektseite = objektdetailsAnzeige(o, undefined, heute);
    const einheitsseite = objektdetailsAnzeige(o, { investagonRaw: { object_share_owner: 3 } }, heute);
    expect(einheitsseite.verwaltung).toEqual(objektseite.verwaltung);
    expect(einheitsseite.sanierungen).toEqual(objektseite.sanierungen);
    expect(einheitsseite.gemeinschaftseigentum.wert).toBe("Miteigentumsanteil 3 %");
    expect(objektseite.gemeinschaftseigentum.wert).toBe(KEINE_ANGABEN);
  });
});
