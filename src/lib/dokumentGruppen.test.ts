import { describe, it, expect } from "vitest";
import {
  DOKUMENT_OBERBEGRIFFE, dateiArt, dateiEndung, downloadDateiname, gruppiereDokumente, investagonKategorieSuche,
  liegtAufFremdemServer, normalisiereTitel, oberbegriffAusKategorie, oberbegriffAusTitel, oberbegriffFuer,
} from "./dokumentGruppen";

describe("oberbegriffAusTitel", () => {
  // Titel, wie sie in Objektanlage und Investagon-Paketen wirklich vorkommen.
  it.each([
    ["Magdeburg_Friesenstraße_Grundriss_WE09", "Grundrisse und Pläne"],
    ["Grundriss", "Grundrisse und Pläne"],
    ["Lageplan", "Grundrisse und Pläne"],
    ["Exposé_Grundriss_WE09.pdf", "Grundrisse und Pläne"],
    ["7.2.8 Mietvertrag WE 09_23.02.2010", "Mietverhältnis"],
    ["Mieterhöhung 01.03.2024", "Mietverhältnis"],
    ["Mietsubvention Vereinbarung", "Mietverhältnis"],
    ["Mietvertrag", "Mietverhältnis"],
    ["Wirtschaftsplan 2025", "WEG und Hausgeld"],
    ["Hausgeldabrechnung_2023.pdf", "WEG und Hausgeld"],
    ["Jahresabrechnung 2024 WE 3", "WEG und Hausgeld"],
    ["Protokoll ETV 2024", "WEG und Hausgeld"],
    ["Nebenkostenabrechnung Mieter 2023", "WEG und Hausgeld"],
    ["Hausgeld", "WEG und Hausgeld"],
    ["Teilungserklärung", "Teilungserklärung"],
    ["TEILUNGSERKLAERUNG_Friesenstr_12", "Teilungserklärung"],
    ["Aufteilungsplan", "Teilungserklärung"],
    ["GB 115615 - Friesenstr.", "Grundbuch"],
    ["GB115615", "Grundbuch"],
    ["Grundbuchauszug", "Grundbuch"],
    ["GBA Wohnung", "Grundbuch"],
    ["Energieausweis_bis_2030", "Energie"],
    ["Wohnflächenberechnung WE 09", "Flächen"],
    ["Wohnfläche", "Flächen"],
    ["Versicherungsnachweis", "Versicherung"],
    ["Gebäudeversicherung Police 2025", "Versicherung"],
    ["Altlastenauskunft Stadt Magdeburg", "Behördliche Auskünfte"],
    ["Denkmalschutz Bescheinigung", "Behördliche Auskünfte"],
    ["Reservierungsvereinbarung", "Vertragsunterlagen"],
    ["Kaufvertrag Entwurf", "Vertragsunterlagen"],
    ["Muster-KV", "Vertragsunterlagen"],
    ["Exposé", "Exposé und Beschreibung"],
    ["Objektbeschreibung", "Exposé und Beschreibung"],
    ["Objektbilder", "Sonstiges"],
    ["Renovierung WE", "Sonstiges"],
    ["", "Sonstiges"],
  ])("ordnet „%s“ unter %s ein", (titel, erwartet) => {
    expect(oberbegriffAusTitel(titel)).toBe(erwartet);
  });

  it("findet Umlaute auch dann, wenn der Dateiname sie zerlegt speichert (macOS)", () => {
    const zerlegt = "Wohnfla\u0308chenberechnung";
    expect(zerlegt).not.toBe("Wohnflächenberechnung");
    expect(oberbegriffAusTitel(zerlegt)).toBe("Flächen");
  });

  it("liest Abkürzungen nur als eigenes Wort, nicht mitten in einem anderen", () => {
    // „gb" steckt in „Abgabe", „kv" in „Pkv". Beides ist kein Grundbuch und kein Kaufvertrag.
    expect(oberbegriffAusTitel("Abgabebestaetigung")).toBe("Sonstiges");
    expect(oberbegriffAusTitel("Pkv Bescheinigung")).toBe("Sonstiges");
  });
});

describe("oberbegriffAusKategorie und oberbegriffFuer", () => {
  it("übersetzt jede bekannte Investagon-Kategorie", () => {
    expect(oberbegriffAusKategorie("declaration_of_division")).toBe("Teilungserklärung");
    expect(oberbegriffAusKategorie("economic_plan")).toBe("WEG und Hausgeld");
    expect(oberbegriffAusKategorie("energy_certificate")).toBe("Energie");
    expect(oberbegriffAusKategorie("expose")).toBe("Exposé und Beschreibung");
    expect(oberbegriffAusKategorie("land_register")).toBe("Grundbuch");
    expect(oberbegriffAusKategorie("layout")).toBe("Grundrisse und Pläne");
    expect(oberbegriffAusKategorie("living_area_calculation")).toBe("Flächen");
    expect(oberbegriffAusKategorie("rental_agreement")).toBe("Mietverhältnis");
    expect(oberbegriffAusKategorie("settlements")).toBe("WEG und Hausgeld");
    expect(oberbegriffAusKategorie("site_plan")).toBe("Grundrisse und Pläne");
  });

  it("lässt „Sonstiges“, Unbekanntes und Leeres offen, damit der Titel entscheidet", () => {
    expect(oberbegriffAusKategorie("other_object")).toBeUndefined();
    expect(oberbegriffAusKategorie("neue_kategorie")).toBeUndefined();
    expect(oberbegriffAusKategorie("")).toBeUndefined();
    expect(oberbegriffAusKategorie(undefined)).toBeUndefined();
  });

  it("gibt der Kategorie den Vorrang vor dem Titel", () => {
    // Ein Titel ohne Stichwort, aber Investagon weiß, dass es ein Grundriss ist.
    expect(oberbegriffFuer({ name: "Plan_WE09_OG2", investagonKategorie: "layout" })).toBe("Grundrisse und Pläne");
    // Und umgekehrt schlägt die Kategorie ein irreführendes Stichwort.
    expect(oberbegriffFuer({ name: "Exposé Energieausweis", investagonKategorie: "energy_certificate" })).toBe("Energie");
  });

  it("fällt bei „Sonstiges“ aus Investagon auf den Titel zurück", () => {
    expect(oberbegriffFuer({ name: "Mietvertrag WE 3", investagonKategorie: "other_object" })).toBe("Mietverhältnis");
    expect(oberbegriffFuer({ name: "Notizen", investagonKategorie: "other_object" })).toBe("Sonstiges");
  });
});

describe("gruppiereDokumente", () => {
  const dok = (name: string, investagonKategorie?: string) => ({ id: name, name, investagonKategorie });

  it("gruppiert in der festen fachlichen Reihenfolge, Sonstiges zuletzt, leere Gruppen fallen weg", () => {
    const gruppen = gruppiereDokumente([
      dok("Notizen"),
      dok("GB 115615 - Friesenstr."),
      dok("7.2.8 Mietvertrag WE 09_23.02.2010"),
      dok("Magdeburg_Friesenstraße_Grundriss_WE09"),
      dok("Exposé"),
    ]);
    expect(gruppen.map((g) => g.oberbegriff)).toEqual(["Exposé und Beschreibung", "Grundrisse und Pläne", "Mietverhältnis", "Grundbuch", "Sonstiges"]);
    expect(DOKUMENT_OBERBEGRIFFE.at(-1)).toBe("Sonstiges");
  });

  it("sortiert innerhalb einer Gruppe nach Namen, Zahlen als Zahlen", () => {
    const [gruppe] = gruppiereDokumente([dok("Grundriss WE 10"), dok("Grundriss WE 2"), dok("grundriss WE 1")]);
    expect(gruppe.eintraege.map((e) => e.name)).toEqual(["grundriss WE 1", "Grundriss WE 2", "Grundriss WE 10"]);
  });

  it("gibt ohne Dokumente keine Gruppe zurück", () => {
    expect(gruppiereDokumente([])).toEqual([]);
  });
});

describe("investagonKategorieSuche", () => {
  const quelle = {
    meta: {
      investagonRaw: {
        files: [
          { id: 1, filename: "https://tool.investagon.com/f/a.pdf", title: "Plan WE 09", category: "layout", original_filename: "a.pdf" },
          { id: 2, filename: "https://tool.investagon.com/f/Teilung_2019.pdf", category: "declaration_of_division", original_filename: "Teilung_2019.pdf" },
          { id: 3, filename: "https://tool.investagon.com/f/x.pdf", title: "Ohne Kategorie" },
        ],
      },
    },
  };

  it("findet die Kategorie über den Titel wie über den Originalnamen", () => {
    const suche = investagonKategorieSuche(quelle);
    expect(suche("Plan WE 09")).toBe("layout");
    // Ohne Titel schreibt der Import den Originalnamen in die Zeile.
    expect(suche("Teilung_2019.pdf")).toBe("declaration_of_division");
    // Groß, klein und Satzzeichen spielen keine Rolle.
    expect(suche("plan  we-09")).toBe("layout");
  });

  it("gibt nichts zurück, wo nichts passt oder keine Rohdaten da sind", () => {
    expect(investagonKategorieSuche(quelle)("Ohne Kategorie")).toBeUndefined();
    expect(investagonKategorieSuche(quelle)("Handanlage Exposé")).toBeUndefined();
    expect(investagonKategorieSuche(undefined)("Plan WE 09")).toBeUndefined();
    expect(investagonKategorieSuche({ meta: {} })("Plan WE 09")).toBeUndefined();
  });
});

describe("Dateiart, Herkunft und Dateiname", () => {
  it("erkennt PDF und Bilder am Ablagepfad, sonst am Namen", () => {
    expect(dateiArt("/objekt-dokument/objekte/o1/dokumente/abc.pdf")).toBe("pdf");
    expect(dateiArt("/investagon-dokument/o1/1a2b-Grundriss.PNG")).toBe("bild");
    expect(dateiArt("https://x.supabase.co/storage/v1/object/sign/objekt-dokumente/a.jpg?token=t")).toBe("bild");
    expect(dateiArt("/objekt-dokument/objekte/o1/dokumente/ohne-endung", "Grundriss.pdf")).toBe("pdf");
    expect(dateiArt("/objekt-dokument/objekte/o1/dokumente/tabelle.xlsx")).toBe("andere");
    expect(dateiArt("/objekt-dokument/objekte/o1/dokumente/foto.heic")).toBe("andere");
  });

  it("hält reine Ziffern nicht für eine Endung", () => {
    expect(dateiEndung("7.2.8 Mietvertrag WE 09_23.02.2010")).toBe("");
    expect(dateiEndung("GB 115615 - Friesenstr.")).toBe("");
    expect(dateiEndung("a/b/c.PDF?token=1#seite")).toBe("pdf");
  });

  it("erkennt fremde Server, nicht aber unseren Speicher und unsere Zeiger", () => {
    expect(liegtAufFremdemServer("https://tool.investagon.com/files/abc.pdf")).toBe(true);
    expect(liegtAufFremdemServer("https://x.supabase.co/storage/v1/object/public/objekt-medien/a.pdf")).toBe(false);
    expect(liegtAufFremdemServer("/objekt-dokument/objekte/o1/dokumente/a.pdf")).toBe(false);
    expect(liegtAufFremdemServer("/investagon-dokument/o1/a.pdf")).toBe(false);
    expect(liegtAufFremdemServer("")).toBe(false);
  });

  it("hängt die Endung aus dem Ablagepfad an, wenn der Name keine trägt", () => {
    expect(downloadDateiname("Teilungserklärung", "/objekt-dokument/objekte/o1/dokumente/x.pdf")).toBe("Teilungserklärung.pdf");
    expect(downloadDateiname("Grundriss.pdf", "/objekt-dokument/objekte/o1/dokumente/x.pdf")).toBe("Grundriss.pdf");
    expect(downloadDateiname("7.2.8 Mietvertrag WE 09_23.02.2010", "/investagon-dokument/o1/ab-mv.pdf")).toBe("7.2.8 Mietvertrag WE 09_23.02.2010.pdf");
    // Schrägstrich raus, und kein doppelter Punkt vor der Endung.
    expect(downloadDateiname("GB 115615 / Friesenstr.", "/x/y.pdf")).toBe("GB 115615 Friesenstr.pdf");
    expect(downloadDateiname("", "/x/y")).toBe("Dokument");
  });

  it("normalisiert Titel für die Suche", () => {
    expect(normalisiereTitel("Magdeburg_Friesenstraße_Grundriss_WE09")).toBe("magdeburg friesenstrasse grundriss we09");
    expect(normalisiereTitel("Exposé Übersicht")).toBe("expose uebersicht");
  });
});
