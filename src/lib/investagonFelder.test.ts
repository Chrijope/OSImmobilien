import { describe, it, expect } from "vitest";
import {
  rohdaten,
  beschreibungsTexte,
  merkmale,
  merkmalWert,
  energieeffizienzklasse,
  dokumente,
  grundrisse,
  heizungText,
  ausweisartText,
  objektDetails,
  anzeigbareMerkmale,
  nummeriereMerkmale,
  istAnzeigbaresMerkmal,
  deutscheDezimalstellen,
  type MitInvestagonRohdaten,
} from "./investagonFelder";

/*
 * Die Beispiele stammen aus echten Datensaetzen vom 16.09.2026. Erfundene
 * Minimalfaelle wuerden genau das nicht pruefen, worauf es hier ankommt: dass
 * die Merkmalsliste ihre Nummern mitbringt, dass ein Merkmal auch ohne
 * Doppelpunkt vorkommt und dass die Effizienzklasse nicht im eigenen Feld
 * steht, sondern im Merkmalstext.
 */

/** Eine Einheit, wie der Import sie ablegt. */
const EINHEIT: MitInvestagonRohdaten = {
  meta: {
    investagonId: "8xgzk5a4",
    investagonRaw: {
      id: 174351,
      statusName: "Frei",
      active: true,
      lat: 49.4521,
      lng: 11.0767,
      heating_type: "district_heating",
      object_building_year: 1965,
      object_renovation_year: null,
      energy_certificate_type: "consumption_certificate",
      energy_efficiency_class: null,
      property_kind: "Sanierung",
      property_usage: "Kapitalanlage",
      object_apartment_type: "Etagenwohnung",
      object_floor: 2,
      object_balcony: true,
      share_land: null,
      object_share_owner: 2.345,
      transaction_tax_rate: 3.5,
      rent_status: "rented",
      object_size: 58.4,
      object_rooms: 2,
      purchase_price_apartment: 249000,
      rent_apartment_month: 612,
      // Absichtlich nicht nach weight sortiert, so kommt es auch aus der API.
      extras: [
        {
          id: 3312,
          weight: 3,
          value:
            "Dach und Fassade wurden bereits renoviert. Hausflure und Eingangsbereiche werden dieses Jahr noch komplett renoviert",
        },
        {
          id: 3310,
          weight: 0,
          value:
            "Die Wohnung ist aktuell leer und im unrenovierten Zustand und wird mit einem Sanierungskonzept verkauft.",
        },
        { id: 3313, weight: 1, value: "   " },
        {
          id: 3311,
          weight: 2,
          value:
            "Kunde bekommt ein personalisiertes Restnutzungsdauergutachten nach Verkauf zugestellt.",
        },
      ],
      tags: [
        "1. Produktklasse: Erhaltungsaufwand",
        "2. Mietmodell: Standard-Vermietung",
        "3. 24 Monate Mietgarantie ab wirtschaftlichen Übergang: inklusive",
        "4. 360°-Verwaltung: inklusive",
        "5. Energieeffizienzklasse: C",
        "6. Gebäudeanteil: ca. 81 %",
        "7. Gebäude-AfA: 3.7 % p.a.",
        "8. Sofort abzugsfähiger Erhaltungsaufwand ca. 12.500 € - 22.000 € pro Wohneinheit",
        "9. Einbauküche: inklusive",
      ],
      files: [
        {
          id: 91002,
          title: "Grundriss WE 6",
          parent: 174351,
          category: "layout",
          filename: "https://cdn.investagon.com/files/91002/grundriss-we6.pdf",
          position: 2,
          created_at: "2026-02-01T09:12:00Z",
          updated_at: "2026-02-03T11:00:00Z",
          original_filename: "grundriss-we6.pdf",
        },
        {
          id: 91003,
          title: "Grundriss WE 6 als Bild",
          parent: 174351,
          category: "layout",
          filename: "https://cdn.investagon.com/files/91003/grundriss-we6.jpg",
          position: 3,
          created_at: "2026-02-01T09:13:00Z",
          updated_at: "2026-02-01T09:13:00Z",
          original_filename: "grundriss-we6.jpg",
        },
        {
          id: 91001,
          title: "Exposé Amadio",
          parent: 174351,
          category: "expose",
          filename: "https://cdn.investagon.com/files/91001/expose-amadio.pdf",
          position: 1,
          created_at: "2026-01-20T08:00:00Z",
          updated_at: "2026-01-20T08:00:00Z",
          original_filename: "expose-amadio.pdf",
        },
        {
          id: 91004,
          title: null,
          parent: 174351,
          category: "energy_certificate",
          filename:
            "https://cdn.investagon.com/files/91004/energieausweis%20amadio.pdf?v=3",
          position: 4,
          created_at: "2026-01-22T08:00:00Z",
          updated_at: "2026-01-22T08:00:00Z",
          original_filename: null,
        },
        {
          id: 91005,
          title: "Rundgang",
          parent: 174351,
          // So etwas kann Investagon jederzeit ergaenzen.
          category: "virtual_tour",
          filename: "https://cdn.investagon.com/files/91005/rundgang.html",
          position: 5,
          created_at: "2026-01-22T08:00:00Z",
          updated_at: "2026-01-22T08:00:00Z",
          original_filename: "rundgang.html",
        },
        {
          id: 91006,
          title: "Kaputter Eintrag ohne Adresse",
          category: "settlements",
          filename: null,
          position: 6,
        },
      ],
      photos: [
        {
          id: 5501,
          filename: "https://cdn.investagon.com/photos/5501/aussen.jpg",
          position: 1,
          created_at: "2026-01-20T08:00:00Z",
        },
      ],
    },
  },
};

/** Ein Objekt. Hier ist `extras` leer, so wie in den meisten Objekten. */
const OBJEKT: MitInvestagonRohdaten = {
  meta: {
    investagonVollSyncVersion: "a1b2c3",
    investagonRaw: {
      id: 4411,
      statusName: "Frei",
      extras: [],
      tags: [],
      files: [],
      photos: [],
      heating_type: "gas",
      object_building_year: 1978,
      object_renovation_year: 2021,
      energy_efficiency_class: "D",
      transaction_tax_rate: 3.5,
    },
  },
};

describe("rohdaten", () => {
  it("holt den Originaldatensatz aus meta", () => {
    expect(rohdaten(EINHEIT)?.id).toBe(174351);
  });

  it("gibt undefined zurueck, wenn nichts aus Investagon kommt", () => {
    expect(rohdaten(null)).toBeUndefined();
    expect(rohdaten(undefined)).toBeUndefined();
    expect(rohdaten({})).toBeUndefined();
    expect(rohdaten({ meta: null })).toBeUndefined();
    expect(rohdaten({ meta: { beraterName: "Sarah Kaiser-Thom" } })).toBeUndefined();
  });

  it("nimmt nur ein Objekt als Rohdatensatz an", () => {
    expect(rohdaten({ meta: { investagonRaw: "kaputt" } })).toBeUndefined();
    expect(rohdaten({ meta: { investagonRaw: [1, 2, 3] } })).toBeUndefined();
    expect(rohdaten({ meta: { investagonRaw: null } })).toBeUndefined();
  });
});

describe("beschreibungsTexte", () => {
  it("sortiert die Freitexte nach weight und laesst Leeres weg", () => {
    const texte = beschreibungsTexte(EINHEIT);
    expect(texte).toHaveLength(3);
    expect(texte[0]).toContain("aktuell leer und im unrenovierten Zustand");
    expect(texte[1]).toContain("Restnutzungsdauergutachten");
    expect(texte[2]).toContain("Dach und Fassade");
  });

  it("kommt mit einem leeren extras zurecht, wie es Objekte meist haben", () => {
    expect(beschreibungsTexte(OBJEKT)).toEqual([]);
  });

  it("gibt ohne Rohdaten eine leere Liste zurueck", () => {
    expect(beschreibungsTexte(undefined)).toEqual([]);
    expect(beschreibungsTexte({ meta: { investagonRaw: { extras: "kaputt" } } })).toEqual([]);
  });
});

describe("merkmale", () => {
  it("zerlegt die Merkmalsliste in Bezeichnung und Wert", () => {
    const liste = merkmale(EINHEIT);
    expect(liste).toHaveLength(9);
    expect(liste[0]).toEqual({
      nummer: 1,
      bezeichnung: "Produktklasse",
      wert: "Erhaltungsaufwand",
    });
    expect(liste[4]).toEqual({
      nummer: 5,
      bezeichnung: "Energieeffizienzklasse",
      wert: "C",
    });
  });

  it("nimmt die Nummer aus dem Text heraus, sie wird nie angezeigt", () => {
    const mietgarantie = merkmale(EINHEIT)[2];
    expect(mietgarantie.nummer).toBe(3);
    expect(mietgarantie.bezeichnung).toBe("24 Monate Mietgarantie ab wirtschaftlichen Übergang");
    expect(mietgarantie.wert).toBe("inklusive");
  });

  it("laesst ein Merkmal ohne Doppelpunkt vollstaendig durch", () => {
    const erhaltungsaufwand = merkmale(EINHEIT)[7];
    expect(erhaltungsaufwand.bezeichnung).toBe(
      "Sofort abzugsfähiger Erhaltungsaufwand ca. 12.500 € - 22.000 € pro Wohneinheit",
    );
    expect(erhaltungsaufwand.wert).toBe("");
  });

  it("sortiert nach der Nummer, auch wenn die Liste durcheinander kommt", () => {
    const durcheinander: MitInvestagonRohdaten = {
      meta: {
        investagonRaw: {
          tags: [
            "9. Einbauküche: inklusive",
            "Ohne Nummer und ohne Doppelpunkt",
            "1. Produktklasse: Erhaltungsaufwand",
            "5. Energieeffizienzklasse: C",
          ],
        },
      },
    };
    expect(merkmale(durcheinander).map((m) => m.bezeichnung)).toEqual([
      "Produktklasse",
      "Energieeffizienzklasse",
      "Einbauküche",
      "Ohne Nummer und ohne Doppelpunkt",
    ]);
  });

  it("gibt ohne Merkmale eine leere Liste zurueck", () => {
    expect(merkmale(OBJEKT)).toEqual([]);
    expect(merkmale(null)).toEqual([]);
    expect(merkmale({ meta: { investagonRaw: { tags: [null, 42, "  "] } } })).toEqual([
      // Die 42 ist zwar Unsinn, aber sie ist ein Text und geht als Aussage durch.
      { nummer: undefined, bezeichnung: "42", wert: "" },
    ]);
  });
});

describe("merkmalWert", () => {
  it("findet den Wert ohne Ruecksicht auf Gross- und Kleinschreibung", () => {
    expect(merkmalWert(EINHEIT, "Energieeffizienzklasse")).toBe("C");
    expect(merkmalWert(EINHEIT, "energieeffizienzklasse")).toBe("C");
    expect(merkmalWert(EINHEIT, "  MIETMODELL ")).toBe("Standard-Vermietung");
  });

  it("gibt undefined zurueck, wenn es das Merkmal nicht gibt oder es leer ist", () => {
    expect(merkmalWert(EINHEIT, "Stellplatz")).toBeUndefined();
    expect(merkmalWert(EINHEIT, "")).toBeUndefined();
    // Das Merkmal ohne Doppelpunkt hat keinen Wert.
    expect(
      merkmalWert(EINHEIT, "Sofort abzugsfähiger Erhaltungsaufwand ca. 12.500 € - 22.000 € pro Wohneinheit"),
    ).toBeUndefined();
    expect(merkmalWert(undefined, "Energieeffizienzklasse")).toBeUndefined();
  });
});

describe("energieeffizienzklasse", () => {
  it("nimmt das Merkmal, wenn das eigene Feld null ist", () => {
    expect(rohdaten(EINHEIT)?.energy_efficiency_class).toBeNull();
    expect(energieeffizienzklasse(EINHEIT)).toBe("C");
  });

  it("nimmt das eigene Feld, wenn es gefuellt ist", () => {
    expect(energieeffizienzklasse(OBJEKT)).toBe("D");
  });

  it("laesst A+ zu", () => {
    expect(
      energieeffizienzklasse({ meta: { investagonRaw: { energy_efficiency_class: "a+" } } }),
    ).toBe("A+");
  });

  /*
   * Lieber keine Angabe als eine falsche: An einer Effizienzklasse im Exposé
   * laesst sich ein Kaeufer uns festhalten.
   */
  it("gibt nichts zurueck, was keine Klasse ist", () => {
    expect(
      energieeffizienzklasse({
        meta: { investagonRaw: { tags: ["5. Energieeffizienzklasse: wird ermittelt"] } },
      }),
    ).toBeUndefined();
    expect(
      energieeffizienzklasse({ meta: { investagonRaw: { energy_efficiency_class: "K" } } }),
    ).toBeUndefined();
    expect(energieeffizienzklasse(null)).toBeUndefined();
  });
});

describe("dokumente", () => {
  it("uebersetzt die Kategorien und sortiert nach position", () => {
    const liste = dokumente(EINHEIT);
    expect(liste.map((d) => d.kategorieLabel)).toEqual([
      "Exposé",
      "Grundriss",
      "Grundriss",
      "Energieausweis",
      "virtual_tour",
    ]);
    expect(liste[0].url).toBe("https://cdn.investagon.com/files/91001/expose-amadio.pdf");
    expect(liste[0].geaendertAm).toBe("2026-01-20T08:00:00Z");
  });

  it("behaelt bei einer unbekannten Kategorie den Rohwert als Label", () => {
    const rundgang = dokumente(EINHEIT).find((d) => d.kategorie === "virtual_tour");
    expect(rundgang?.kategorieLabel).toBe("virtual_tour");
  });

  it("nimmt den Dateinamen aus der Adresse, wenn Investagon keinen mitgibt", () => {
    const ausweis = dokumente(EINHEIT).find((d) => d.kategorie === "energy_certificate");
    expect(ausweis?.dateiname).toBe("energieausweis amadio.pdf");
    // Ohne title greift der Dateiname, damit die Zeile nie leer bleibt.
    expect(ausweis?.titel).toBe("energieausweis amadio.pdf");
  });

  it("laesst Eintraege ohne Adresse weg", () => {
    expect(dokumente(EINHEIT).some((d) => d.kategorie === "settlements")).toBe(false);
  });

  it("gibt ohne Dateien eine leere Liste zurueck", () => {
    expect(dokumente(OBJEKT)).toEqual([]);
    expect(dokumente(undefined)).toEqual([]);
    expect(dokumente({ meta: { investagonRaw: { files: "kaputt" } } })).toEqual([]);
  });
});

describe("grundrisse", () => {
  it("liefert nur die Grundrisse, Bild vor PDF", () => {
    const liste = grundrisse(EINHEIT);
    expect(liste).toHaveLength(2);
    expect(liste[0].dateiname).toBe("grundriss-we6.jpg");
    expect(liste[1].dateiname).toBe("grundriss-we6.pdf");
  });

  it("gibt ohne Grundrisse eine leere Liste zurueck", () => {
    expect(grundrisse(OBJEKT)).toEqual([]);
    expect(grundrisse(null)).toEqual([]);
  });
});

describe("heizungText", () => {
  it("uebersetzt die bekannten Arten", () => {
    expect(heizungText(EINHEIT)).toBe("Fernwärme");
    expect(heizungText(OBJEKT)).toBe("Gas");
  });

  it("laesst eine unbekannte Art unveraendert durch", () => {
    expect(heizungText({ meta: { investagonRaw: { heating_type: "wood_chips" } } })).toBe(
      "wood_chips",
    );
  });

  it("gibt ohne Angabe undefined zurueck", () => {
    expect(heizungText({ meta: { investagonRaw: { heating_type: null } } })).toBeUndefined();
    expect(heizungText(undefined)).toBeUndefined();
  });
});

describe("ausweisartText", () => {
  it("uebersetzt die beiden Ausweisarten", () => {
    expect(ausweisartText(EINHEIT)).toBe("Verbrauchsausweis");
    expect(
      ausweisartText({ meta: { investagonRaw: { energy_certificate_type: "demand_certificate" } } }),
    ).toBe("Bedarfsausweis");
  });

  it("uebersetzt auch requirement_certificate, so schreibt Investagon heute den Bedarfsausweis", () => {
    expect(
      ausweisartText({ meta: { investagonRaw: { energy_certificate_type: "requirement_certificate" } } }),
    ).toBe("Bedarfsausweis");
    expect(
      ausweisartText({ meta: { investagonRaw: { energy_certificate_type: "Requirement_Certificate" } } }),
    ).toBe("Bedarfsausweis");
  });

  it("laesst Unbekanntes durch und gibt ohne Angabe undefined zurueck", () => {
    expect(
      ausweisartText({ meta: { investagonRaw: { energy_certificate_type: "exempt" } } }),
    ).toBe("exempt");
    expect(ausweisartText(OBJEKT)).toBeUndefined();
  });
});

describe("objektDetails", () => {
  it("zeigt nur die Angaben, die wirklich dastehen", () => {
    const zeilen = objektDetails(EINHEIT);
    expect(zeilen).toEqual([
      { label: "Baujahr", wert: "1965" },
      { label: "Heizung", wert: "Fernwärme" },
      { label: "Energieausweis", wert: "Verbrauchsausweis" },
      { label: "Energieeffizienzklasse", wert: "C" },
      { label: "Objektkategorie", wert: "Sanierung" },
      { label: "Nutzungsart", wert: "Kapitalanlage" },
      { label: "Etage", wert: "2" },
      { label: "Balkon", wert: "Ja" },
      { label: "Miteigentumsanteil", wert: "2,345 %" },
      { label: "Grunderwerbsteuer", wert: "3,5 %" },
    ]);
  });

  it("laesst das Sanierungsjahr weg, solange es null ist", () => {
    expect(objektDetails(EINHEIT).some((z) => z.label === "Sanierungsjahr")).toBe(false);
    expect(objektDetails(OBJEKT)).toContainEqual({ label: "Sanierungsjahr", wert: "2021" });
  });

  it("schreibt eine Jahreszahl ohne Tausenderpunkt", () => {
    expect(objektDetails(OBJEKT)).toContainEqual({ label: "Baujahr", wert: "1978" });
  });

  /*
   * In den Rohdaten steht bei nicht gepflegten Einheiten dasselbe false wie
   * bei tatsaechlich balkonlosen. "Balkon: Nein" waere also eine Aussage, die
   * wir nicht belegen koennen.
   */
  it("behauptet bei einem false nicht, dass es keinen Balkon gibt", () => {
    expect(
      objektDetails({ meta: { investagonRaw: { object_balcony: false } } }),
    ).toEqual([]);
    expect(
      objektDetails({ meta: { investagonRaw: { object_balcony: "Loggia" } } }),
    ).toEqual([{ label: "Balkon", wert: "Loggia" }]);
  });

  it("gibt ohne Rohdaten eine leere Liste zurueck", () => {
    expect(objektDetails(undefined)).toEqual([]);
    expect(objektDetails({ meta: {} })).toEqual([]);
  });

  it("uebernimmt kein unsinniges Baujahr und keine Null-Prozent", () => {
    expect(
      objektDetails({
        meta: {
          investagonRaw: {
            object_building_year: 0,
            transaction_tax_rate: 0,
            object_share_owner: null,
          },
        },
      }),
    ).toEqual([]);
  });
});

describe("Robustheit gegen kaputte Fremddaten", () => {
  /*
   * Investagon ist nicht unser System. Felder koennen fehlen, null sein oder
   * ihren Typ wechseln. Keine dieser Funktionen darf deshalb eine Seite
   * zerlegen.
   */
  const kaputt: unknown[] = [
    null,
    undefined,
    {},
    { meta: null },
    { meta: { investagonRaw: null } },
    { meta: { investagonRaw: 42 } },
    {
      meta: {
        investagonRaw: {
          extras: [null, "reiner Text", { value: 5, weight: "2" }],
          tags: [{ nicht: "text" }, ":ohne Bezeichnung"],
          files: [null, "kaputt", { filename: 17, category: 9 }],
          heating_type: 5,
          energy_certificate_type: [],
          object_building_year: "1965",
          transaction_tax_rate: "3,5",
          object_share_owner: "keine Zahl",
          object_floor: 0,
        },
      },
    },
  ];

  it("wirft bei keiner Eingabe", () => {
    for (const eingabe of kaputt) {
      const d = eingabe as MitInvestagonRohdaten | null | undefined;
      expect(() => {
        rohdaten(d);
        beschreibungsTexte(d);
        merkmale(d);
        merkmalWert(d, "Energieeffizienzklasse");
        energieeffizienzklasse(d);
        dokumente(d);
        grundrisse(d);
        heizungText(d);
        ausweisartText(d);
        objektDetails(d);
      }).not.toThrow();
    }
  });

  it("liest aus kaputten Daten nur das Brauchbare", () => {
    const d = kaputt[kaputt.length - 1] as MitInvestagonRohdaten;
    expect(beschreibungsTexte(d)).toEqual(["5", "reiner Text"]);
    expect(dokumente(d)).toEqual([]);
    expect(heizungText(d)).toBe("5");
    expect(objektDetails(d)).toEqual([
      { label: "Baujahr", wert: "1965" },
      { label: "Heizung", wert: "5" },
      { label: "Etage", wert: "0" },
      { label: "Grunderwerbsteuer", wert: "3,5 %" },
    ]);
  });
});

describe("anzeigbareMerkmale (Sperrliste vom 24.09.2026)", () => {
  const mit = (...tags: string[]) => ({ meta: { investagonRaw: { tags } } });

  it("laesst Beliebtheit, Etage und AfA-Satz weg", () => {
    const liste = anzeigbareMerkmale(mit(
      "1. Viele Klicks",
      "2. Viele ♡",
      "Beliebt bei Kapitalanlegern",
      "3. Erdgeschoss Links",
      "3.OG Links",
      "DG rechts",
      "3.5% Afa",
      "Gebäude-AfA: 3.7 % p.a.",
      "4. Einbauküche: inklusive",
    ));
    expect(liste.map((m) => m.bezeichnung)).toEqual(["Einbauküche"]);
  });

  it("laesst neutrale Aussagen stehen, die nur aehnlich klingen", () => {
    const liste = anzeigbareMerkmale(mit(
      "Im Herzen der Altstadt",
      "Denkmal-AfA möglich",
      "Etagenheizung: Gas",
      "20.000 € Erhaltungsaufwand",
    ));
    expect(liste.map((m) => m.bezeichnung)).toEqual([
      "Im Herzen der Altstadt",
      "Denkmal-AfA möglich",
      "Etagenheizung",
      "20.000 € Erhaltungsaufwand",
    ]);
  });

  it("schreibt Dezimalpunkte deutsch, den Tausenderpunkt nicht", () => {
    const liste = anzeigbareMerkmale(mit("Zimmer: 2.5", "Bruttorendite: 4.25 %", "20.000 € Erhaltungsaufwand"));
    expect(liste.map((m) => [m.bezeichnung, m.wert])).toEqual([
      ["Zimmer", "2,5"],
      ["Bruttorendite", "4,25 %"],
      ["20.000 € Erhaltungsaufwand", ""],
    ]);
  });

  it("aendert `merkmale` selbst nicht, dort suchen andere Stellen nach Etage und Aufzug", () => {
    expect(merkmale(mit("3. Erdgeschoss Links")).map((m) => m.bezeichnung)).toEqual(["Erdgeschoss Links"]);
  });

  it("istAnzeigbaresMerkmal prueft Bezeichnung und Wert zusammen", () => {
    expect(istAnzeigbaresMerkmal({ bezeichnung: "Lage", wert: "2. OG rechts" })).toBe(false);
    expect(istAnzeigbaresMerkmal({ bezeichnung: "Balkon", wert: "Südwest" })).toBe(true);
    expect(deutscheDezimalstellen("3.OG und 2.5 Zimmer, 1.250 €")).toBe("3.OG und 2,5 Zimmer, 1.250 €");
  });
});

/**
 * Befund vom 05.10.2026: Investagon schreibt die Nummern ohne Leerzeichen
 * („1.Hoher …“, „3.500m …“). Die Liste zeigte „1.Hoher …“, dann
 * „3.500m von neuer U5 entfernt“ und „4.Küche …“. Die 2 fehlte, weil
 * „2.Erhöhte AfA“ ein gesperrter AfA-Satz ist, und „3.500m“ heißt Nummer 3
 * und 500 m, nicht 3.500 m (das Objekt nennt „rund 500 m“ zur U5).
 */
describe("Nummern ohne Leerzeichen (Befund 05.10.2026)", () => {
  const mit = (...tags: string[]) => ({ meta: { investagonRaw: { tags } } });
  const BEISPIEL = mit(
    "1.Hoher Erhaltungsaufwand:45.000–55.000 €",
    "2.Erhöhte AfA:4.17 %",
    "3.500m von neuer U5 entfernt",
    "4.Küche und Möbel inklusive",
    "5.SEV und WEG-Verwaltung",
    "6.Erstvermietungsgarantie",
    "7.Fassade und Außenaufzug neu",
    "8.Sanierte Tiefgarage",
    "9.Modernes Co-Living-Konzept",
    "",
    "Viele Klicks",
    "Viele ♡",
  );

  it("erkennt jede Nummer der Folge, auch ohne Leerzeichen, und verliert keinen Eintrag", () => {
    const liste = merkmale(BEISPIEL);
    expect(liste.map((m) => m.nummer)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, undefined, undefined]);
    expect(liste[0]).toEqual({ nummer: 1, bezeichnung: "Hoher Erhaltungsaufwand", wert: "45.000–55.000 €" });
    expect(liste[2]).toEqual({ nummer: 3, bezeichnung: "500m von neuer U5 entfernt", wert: "" });
  });

  it("zeigt fortlaufend nummeriert, mit Leerzeichen nach dem Punkt, ohne gesperrte Einträge", () => {
    const liste = nummeriereMerkmale(anzeigbareMerkmale(BEISPIEL));
    expect(liste.map((m) => (m.wert ? `${m.bezeichnung} ${m.wert}` : m.bezeichnung))).toEqual([
      "1. Hoher Erhaltungsaufwand 45.000–55.000 €",
      "2. 500m von neuer U5 entfernt",
      "3. Küche und Möbel inklusive",
      "4. SEV und WEG-Verwaltung",
      "5. Erstvermietungsgarantie",
      "6. Fassade und Außenaufzug neu",
      "7. Sanierte Tiefgarage",
      "8. Modernes Co-Living-Konzept",
    ]);
  });

  it("hält einen Tausenderpunkt am Anfang nicht für eine Nummer", () => {
    expect(merkmale(mit("45.000 € Zuschuss")).map((m) => [m.nummer, m.bezeichnung])).toEqual([[undefined, "45.000 € Zuschuss"]]);
    expect(merkmale(mit("1.500 € Zuschuss")).map((m) => [m.nummer, m.bezeichnung])).toEqual([[undefined, "1.500 € Zuschuss"]]);
    // Außer der Reihe ist es keine Nummer: Nach der 1 kommt die 2, nicht die 3.
    expect(merkmale(mit("1.Einbauküche", "3.500 m² Grundstück")).map((m) => m.bezeichnung)).toEqual(["Einbauküche", "3.500 m² Grundstück"]);
  });

  it("nummeriert Merkmale ohne Nummer in den Rohdaten nicht", () => {
    expect(nummeriereMerkmale(anzeigbareMerkmale(mit("Einbauküche: inklusive", "Fahrradkeller"))).map((m) => m.bezeichnung)).toEqual([
      "Einbauküche",
      "Fahrradkeller",
    ]);
  });
});
