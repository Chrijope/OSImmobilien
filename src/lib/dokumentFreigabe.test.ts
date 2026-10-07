import { describe, it, expect } from "vitest";
import {
  darfZumKunden, dokumentAmpel, dokumentOberbegriff, freigabeDokumentAusZeile, internVonHandAusZeile,
  investagonImportKategorie, istInvestagonDatei, kundenFreigabeWert, type FreigabeDokument,
} from "../../supabase/functions/_shared/dokument-freigabe";
import { investagonKategorieAusRohdaten } from "../../supabase/functions/_shared/dokument-gruppen";
import { investagonKategorieSuche } from "./dokumentGruppen";

/**
 * Die Dokumenten-Ampel, freigegeben von Christian am 23.09.2026.
 *
 * Die Prüflinge liegen in `supabase/functions/_shared/`, dorthin schaut
 * Vitest nicht. Diese Datei liest sie deshalb über die Verzeichnisgrenze
 * hinweg ein. Dieselbe Regel entscheidet im Server (`get-expose`,
 * Kundenansicht) und im CRM, hier wird sie festgehalten.
 */

const dok = (name: string, teil: Partial<FreigabeDokument> = {}): FreigabeDokument => ({ name, ...teil });

describe("dokumentAmpel mit echten Titeln", () => {
  it.each([
    // Grün: Verkaufsunterlagen ohne Personendaten
    ["Exposé", "gruen"],
    ["Objektbeschreibung", "gruen"],
    ["Exposé (PDF)", "gruen"],
    ["Magdeburg_Friesenstraße_Grundriss_WE09", "gruen"],
    ["Lageplan", "gruen"],
    ["Wohnflächenberechnung WE 09", "gruen"],
    ["Wohnfläche", "gruen"],
    ["Teilungserklärung", "gruen"],
    ["TEILUNGSERKLAERUNG_Friesenstr_12", "gruen"],
    ["Aufteilungsplan", "gruen"],
    ["Energieausweis_bis_2030", "gruen"],
    ["Versicherungsnachweis", "gruen"],
    ["Gebäudeversicherung Police 2025", "gruen"],
    // Gelb: nennt oft andere Eigentümer oder ist unklar
    ["Wirtschaftsplan 2025", "gelb"],
    ["Hausgeldabrechnung_2023.pdf", "gelb"],
    ["Protokoll ETV 2024", "gelb"],
    ["Jahresabrechnung 2024 WE 3", "gelb"],
    ["Grundsteuerbescheid 2024", "gelb"],
    ["Altlastenauskunft Stadt Magdeburg", "gelb"],
    ["Reservierungsvereinbarung", "gelb"],
    ["Muster-KV", "gelb"],
    ["Kaufvertrag Entwurf", "gelb"],
    ["Objektbilder", "gelb"],
    ["Renovierung WE", "gelb"],
    ["Kalkulation Einkauf", "gelb"],
    ["", "gelb"],
    // Rot: Mieter- und Eigentümerdaten
    ["7.2.8 Mietvertrag WE 09_23.02.2010", "rot"],
    ["Mietvertrag", "rot"],
    ["Mieterhöhung 01.03.2024", "rot"],
    ["Übergabeprotokoll WE 5", "rot"],
    ["Kautionsbestätigung", "rot"],
    ["GB 115615 - Friesenstr.", "rot"],
    ["GB115615", "rot"],
    ["GBA Wohnung", "rot"],
    ["Grundbuchauszug", "rot"],
  ])("„%s“ ist %s", (titel, ampel) => {
    expect(dokumentAmpel(dok(titel))).toBe(ampel);
  });

  it("nimmt die Investagon-Kategorie, wo der Titel nichts sagt", () => {
    expect(dokumentAmpel(dok("Plan_WE09_OG2", { investagonKategorie: "layout" }))).toBe("gruen");
    expect(dokumentAmpel(dok("Scan_0042", { investagonKategorie: "rental_agreement" }))).toBe("rot");
    expect(dokumentAmpel(dok("Scan_0043", { investagonKategorie: "land_register" }))).toBe("rot");
    expect(dokumentAmpel(dok("Scan_0044", { investagonKategorie: "economic_plan" }))).toBe("gelb");
    expect(dokumentAmpel(dok("Scan_0045", { investagonKategorie: "other_object" }))).toBe("gelb");
  });

  it("lässt ein rotes Stichwort auch dann zählen, wenn die Liste die Datei anderswo einordnet", () => {
    // In der Liste steht sie beim Hausgeld (Reihenfolge der Stichworte), die
    // Abrechnung für einen Mieter nennt aber den Mieter.
    expect(dokumentOberbegriff(dok("Nebenkostenabrechnung Mieter 2023"))).toBe("WEG und Hausgeld");
    expect(dokumentAmpel(dok("Nebenkostenabrechnung Mieter 2023"))).toBe("rot");
    expect(dokumentOberbegriff(dok("Mietvertrag Anlage Grundriss"))).toBe("Grundrisse und Pläne");
    expect(dokumentAmpel(dok("Mietvertrag Anlage Grundriss"))).toBe("rot");
    expect(dokumentAmpel(dok("Teilungserklärung mit Grundbuchauszug"))).toBe("rot");
    // Eine Abkürzung zählt nur als eigenes Wort: „Abgabe" ist kein Grundbuch.
    expect(dokumentAmpel(dok("Exposé Abgabebestätigung"))).toBe("gruen");
  });

  it("lässt Rot vor allem gelten: Ein Mietvertrag unter „Exposé“ bleibt rot", () => {
    expect(dokumentAmpel(dok("Mietvertrag Scholtz", { investagonKategorie: "expose" }))).toBe("rot");
    expect(dokumentAmpel(dok("Grundbuchauszug Blatt 1234", { investagonKategorie: "layout" }))).toBe("rot");
    // Umgekehrt macht ein harmloser Titel eine rote Kategorie nicht grün.
    expect(dokumentAmpel(dok("Exposé", { investagonKategorie: "rental_agreement" }))).toBe("rot");
  });

  it("nennt den Oberbegriff wie die Liste im Reiter", () => {
    expect(dokumentOberbegriff(dok("Plan", { investagonKategorie: "layout" }))).toBe("Grundrisse und Pläne");
    expect(dokumentOberbegriff(dok("7.2.8 Mietvertrag WE 09_23.02.2010"))).toBe("Mietverhältnis");
    expect(dokumentOberbegriff(dok("Notizen"))).toBe("Sonstiges");
  });
});

describe("darfZumKunden", () => {
  it("lässt Grün von selbst hinaus und hält Gelb zurück", () => {
    expect(darfZumKunden(dok("Energieausweis"))).toBe(true);
    expect(darfZumKunden(dok("Wirtschaftsplan 2025"))).toBe(false);
  });

  it("folgt danach der Entscheidung von Admin oder Inhaber, in beide Richtungen", () => {
    expect(darfZumKunden(dok("Wirtschaftsplan 2025", { kundenFreigabe: "frei" }))).toBe(true);
    expect(darfZumKunden(dok("Energieausweis", { kundenFreigabe: "gesperrt" }))).toBe(false);
  });

  it("sperrt, was beim Hochladen von Hand intern markiert wurde, außer Admin gibt es ausdrücklich frei", () => {
    expect(darfZumKunden(dok("Exposé", { internVonHand: true }))).toBe(false);
    expect(darfZumKunden(dok("Exposé", { internVonHand: true, kundenFreigabe: "frei" }))).toBe(true);
  });

  it("lässt Rot nur als geschwärzt geprüfte UND freigegebene Kopie hinaus", () => {
    const mv = "7.2.8 Mietvertrag WE 09_23.02.2010";
    expect(darfZumKunden(dok(mv))).toBe(false);
    expect(darfZumKunden(dok(mv, { kundenFreigabe: "frei" }))).toBe(false);
    expect(darfZumKunden(dok(mv, { geschwaerzt: true }))).toBe(false);
    expect(darfZumKunden(dok(mv, { geschwaerzt: true, kundenFreigabe: "gesperrt" }))).toBe(false);
    expect(darfZumKunden(dok(mv, { geschwaerzt: true, kundenFreigabe: "frei" }))).toBe(true);
    expect(darfZumKunden(dok("GBA Wohnung", { geschwaerzt: true, kundenFreigabe: "frei" }))).toBe(true);
  });

  it("nimmt nur echte Wahrheitswerte: ein „true“ als Text schwärzt nichts", () => {
    const vergiftet = { name: "Mietvertrag", geschwaerzt: "true", kundenFreigabe: "frei" } as unknown as FreigabeDokument;
    expect(darfZumKunden(vergiftet)).toBe(false);
  });
});

describe("Angaben aus einer Tabellenzeile", () => {
  it("erkennt Investagon-Dateien am Zeiger des Imports und an der Originaladresse", () => {
    expect(istInvestagonDatei("/investagon-dokument/o1/mv.pdf")).toBe(true);
    expect(istInvestagonDatei("https://tool.investagon.com/files/abc.pdf")).toBe(true);
    expect(istInvestagonDatei("/objekt-dokument/objekte/o1/dokumente/a.pdf")).toBe(false);
    expect(istInvestagonDatei("https://investagon.com.example.org/a.pdf")).toBe(false);
    expect(istInvestagonDatei(undefined)).toBe(false);
  });

  it("wertet „intern“ und sichtbar = false nur bei eigenen Dateien als Handmarkierung", () => {
    expect(internVonHandAusZeile({ url: "/objekt-dokument/a.pdf", kategorie: "intern" })).toBe(true);
    expect(internVonHandAusZeile({ url: "/objekt-dokument/a.pdf", kategorie: "objektunterlagen", sichtbar: false })).toBe(true);
    expect(internVonHandAusZeile({ url: "/objekt-dokument/a.pdf", kategorie: "objektunterlagen", sichtbar: true })).toBe(false);
    // So legt der Investagon-Import jede Datei an. Das ist keine Entscheidung.
    expect(internVonHandAusZeile({ url: "/investagon-dokument/o1/a.pdf", kategorie: "intern", sichtbar: false })).toBe(false);
  });

  it("kennt nur frei und gesperrt", () => {
    expect(kundenFreigabeWert("frei")).toBe("frei");
    expect(kundenFreigabeWert("gesperrt")).toBe("gesperrt");
    expect(kundenFreigabeWert("FREI")).toBeNull();
    expect(kundenFreigabeWert(true)).toBeNull();
    expect(kundenFreigabeWert(null)).toBeNull();
  });

  it("glaubt eine Freigabe nur aus der Tabelle, nie aus meta.dokumente", () => {
    const zeile = { name: "Mietvertrag WE 3", url: "/objekt-dokument/mv.pdf", kategorie: "wohnungsunterlagen", kunden_freigabe: "frei", geschwaerzt: true };
    expect(darfZumKunden(freigabeDokumentAusZeile(zeile, "tabelle"))).toBe(true);
    // Dasselbe JSON in `wohnungen.meta` darf jede interne Rolle schreiben.
    expect(darfZumKunden(freigabeDokumentAusZeile(zeile, "meta"))).toBe(false);
  });

  it("läuft ohne die Spalten der Migration mit der Grundregel", () => {
    expect(freigabeDokumentAusZeile({ name: "Energieausweis", url: "/objekt-dokument/e.pdf", kategorie: "objektunterlagen", sichtbar: true }, "tabelle"))
      .toMatchObject({ kundenFreigabe: null, geschwaerzt: false, internVonHand: false });
  });
});

describe("investagonKategorieAusRohdaten", () => {
  const roh = {
    files: [
      { id: 1, filename: "https://tool.investagon.com/f/a.pdf", title: "Plan WE 09", category: "layout", original_filename: "a.pdf" },
      { id: 2, filename: "https://tool.investagon.com/f/Teilung_2019.pdf", category: "declaration_of_division", original_filename: "Teilung_2019.pdf" },
      { id: 3, filename: "https://tool.investagon.com/f/x.pdf", title: "Ohne Kategorie" },
      { id: 4, filename: "https://tool.investagon.com/f/MV%20WE%2009.pdf", category: "rental_agreement" },
    ],
  };

  it("findet dasselbe wie die Suche im Browser", () => {
    const server = investagonKategorieAusRohdaten(roh);
    const browser = investagonKategorieSuche({ meta: { investagonRaw: roh } });
    for (const name of ["Plan WE 09", "plan  we-09", "a.pdf", "Teilung_2019.pdf", "Ohne Kategorie", "MV WE 09.pdf", "Handanlage"]) {
      expect(server(name)).toBe(browser(name));
    }
    expect(server("MV WE 09.pdf")).toBe("rental_agreement");
  });

  it("gibt ohne Rohdaten nichts zurück", () => {
    expect(investagonKategorieAusRohdaten(undefined)("Plan WE 09")).toBeUndefined();
    expect(investagonKategorieAusRohdaten({ files: "kaputt" })("Plan WE 09")).toBeUndefined();
  });
});

describe("Kategorie beim Investagon-Import (24.09.2026)", () => {
  it("legt Unterlagen zum Haus als Objekt-, zur Wohnung als Wohnungsunterlage ab", () => {
    for (const name of ["Baubeschreibung", "Teilungserklärung", "WE 7 Grundriss", "Energieausweis", "Mietvertrag WE 7", "Grundbuchauszug"]) {
      expect(investagonImportKategorie("objekt", name)).toBe("objektunterlagen");
      expect(investagonImportKategorie("wohnung", name)).toBe("wohnungsunterlagen");
    }
  });

  it("hält nur Vergütung und Vertriebsabsprachen intern, auch wenn es nur im Dateinamen steht", () => {
    for (const name of ["Provisionsvereinbarung", "Courtage", "Vertriebsvereinbarung 2026", "Vergütung Vertrieb", "Kalkulation Einkauf", "Tippgebervertrag"]) {
      expect(investagonImportKategorie("objekt", name)).toBe("intern");
    }
    expect(investagonImportKategorie("wohnung", "Anlage 3", "we-7-intern_preisliste.pdf")).toBe("intern");
    expect(investagonImportKategorie("objekt", "Internet und Glasfaser")).toBe("objektunterlagen");
  });

  it("macht die Kundenfreigabe dadurch nicht großzügiger: Bei Investagon-Dateien zählt die Kategorie nicht", () => {
    const url = "/investagon-dokument/o1/we-7-mietvertrag.pdf";
    for (const kategorie of ["intern", "wohnungsunterlagen", "objektunterlagen"]) {
      const zeile = { name: "Mietvertrag WE 7", url, kategorie };
      // Rot bleibt rot, egal unter welcher Kategorie die Zeile steht.
      expect(darfZumKunden(freigabeDokumentAusZeile(zeile, "tabelle", "rental_agreement"))).toBe(false);
      expect(darfZumKunden(freigabeDokumentAusZeile({ ...zeile, kunden_freigabe: "frei" }, "tabelle", "rental_agreement"))).toBe(false);
      // Grün bleibt grün, Gelb bleibt gesperrt.
      expect(darfZumKunden(freigabeDokumentAusZeile({ name: "Energieausweis", url, kategorie }, "tabelle", "energy_certificate"))).toBe(true);
      expect(darfZumKunden(freigabeDokumentAusZeile({ name: "Wirtschaftsplan 2026", url, kategorie }, "tabelle", "economic_plan"))).toBe(false);
    }
  });
});
