import { describe, it, expect } from "vitest";
import {
  wizardStruktur, unterlagenRegeln, objektseitenDokumente, kundeSiehtObjektDokument, kundeSiehtWohnungDokument, einheitUnterlagenGruppen,
  objektUnterlagenEintraege,
} from "./objektUnterlagenRegeln";
import { DEFAULT_WOHNUNG_DOCS, dbRowToObjekt, defaultDokumente, type ObjektDokument, type WohnungDokument } from "./objekteStore";

describe("wizardStruktur", () => {
  it("erkennt das Globalobjekt", () => {
    expect(wizardStruktur(true, false)).toBe("globalobjekt");
  });

  it("erkennt die Einzelwohnung", () => {
    expect(wizardStruktur(false, true)).toBe("einzelwohnung");
  });

  it("erkennt das Objekt mit Einheiten", () => {
    expect(wizardStruktur(false, false)).toBe("mehrere_einheiten");
  });

  it("laesst dem Globalobjekt den Vortritt, falls beide Schalter stehen", () => {
    expect(wizardStruktur(true, true)).toBe("globalobjekt");
  });
});

describe("unterlagenRegeln, Einzelwohnung", () => {
  const regeln = unterlagenRegeln("einzelwohnung", true);

  it("zeigt keine Objektunterlagen", () => {
    expect(regeln.objektDokumente).toBe(false);
  });

  it("zeigt die Unterlagen der Wohnung", () => {
    expect(regeln.wohnungDokumente).toBe(true);
  });

  it("legt alle Medien an die Einheit", () => {
    expect(regeln.medienZiel).toBe("einheit");
    expect(regeln.wohnungBilder).toBe(true);
  });

  it("bleibt ohne angelegte Einheit gleich, weil es immer genau eine gibt", () => {
    expect(unterlagenRegeln("einzelwohnung", false)).toEqual(regeln);
  });
});

describe("unterlagenRegeln, Globalobjekt", () => {
  it("nimmt Objektunterlagen und Objektbilder", () => {
    const regeln = unterlagenRegeln("globalobjekt", false);
    expect(regeln.objektDokumente).toBe(true);
    expect(regeln.medienZiel).toBe("objekt");
  });

  it("bietet ohne angelegte Einheiten nichts je Einheit an", () => {
    const regeln = unterlagenRegeln("globalobjekt", false);
    expect(regeln.wohnungDokumente).toBe(false);
    expect(regeln.wohnungBilder).toBe(false);
  });

  it("bietet mit angelegten Einheiten auch Unterlagen und Bilder je Einheit an", () => {
    const regeln = unterlagenRegeln("globalobjekt", true);
    expect(regeln.wohnungDokumente).toBe(true);
    expect(regeln.wohnungBilder).toBe(true);
  });
});

describe("unterlagenRegeln, Objekt mit Einheiten", () => {
  const regeln = unterlagenRegeln("mehrere_einheiten", true);

  it("trennt Hausunterlagen und Wohnungsunterlagen", () => {
    expect(regeln.objektDokumente).toBe(true);
    expect(regeln.wohnungDokumente).toBe(true);
    expect(regeln.objektDokumenteTitel).not.toBe(regeln.wohnungDokumenteTitel);
  });

  it("legt die Medien ans Objekt und laesst zusaetzlich Bilder je Einheit zu", () => {
    expect(regeln.medienZiel).toBe("objekt");
    expect(regeln.wohnungBilder).toBe(true);
  });

  it("bietet die Wohnungsunterlagen auch an, bevor eine Einheit angelegt ist", () => {
    // Die Karte erscheint erst mit der ersten Einheit, die Regel selbst
    // haengt aber nicht daran: Bei dieser Art gibt es immer Einheiten.
    expect(unterlagenRegeln("mehrere_einheiten", false).wohnungDokumente).toBe(true);
  });
});

/*
 * Die Unterlagen der Einheitsseite, seit dem 23.09.2026 in zwei Gruppen.
 *
 * Bis dahin stand an dieser Stelle `einheitAnzeige`, nach der die
 * Objektunterlagen nur bei genau einer Einheit auf der Einheitsseite standen.
 * Christian hat das umgekehrt: Sie gehören auf jede Einheitsseite.
 */
function objektDok(id: string, teil: Partial<ObjektDokument> = {}): ObjektDokument {
  return { id, name: `Datei ${id}`, url: `/objekt-dokument/${id}.pdf`, typ: "standard", kategorie: "objektunterlagen", sichtbar: true, ...teil };
}
function wohnungDok(id: string, teil: Partial<WohnungDokument> = {}): WohnungDokument {
  return { id, name: `Datei ${id}`, url: `/objekt-dokument/${id}.pdf`, kategorie: "wohnungsunterlagen", ...teil };
}

describe("objektseitenDokumente", () => {
  it("laesst die leeren Platzhalter ohne Datei weg und sonst alles stehen, auch das Interne", () => {
    const dokumente = [objektDok("a"), objektDok("leer", { url: "" }), objektDok("i", { kategorie: "intern" })];
    expect(objektseitenDokumente({ dokumente }).map((d) => d.id)).toEqual(["a", "i"]);
  });
});

/*
 * Seit dem 23.09.2026 folgt „Kunde sieht" der Dokumenten-Ampel
 * (`_shared/dokument-freigabe.ts`). Vorher entschied allein die Kategorie,
 * und damit galten Mietvertrag und Grundbuchauszug als „Kunde sieht".
 */
describe("kundeSieht folgt der Ampel", () => {
  it("gibt eine grüne Objektunterlage frei, eine von Hand intern markierte nie", () => {
    expect(kundeSiehtObjektDokument(objektDok("a", { name: "Energieausweis" }))).toBe(true);
    expect(kundeSiehtObjektDokument(objektDok("a", { name: "Energieausweis", sichtbar: false }))).toBe(false);
    expect(kundeSiehtObjektDokument(objektDok("a", { name: "Energieausweis", kategorie: "intern", sichtbar: true }))).toBe(false);
  });

  it("hält Gelbes zurück, bis Admin oder Inhaber freigeben", () => {
    expect(kundeSiehtObjektDokument(objektDok("a", { name: "Wirtschaftsplan 2025" }))).toBe(false);
    expect(kundeSiehtObjektDokument(objektDok("a", { name: "Wirtschaftsplan 2025", kundenFreigabe: "frei" }))).toBe(true);
  });

  it("lässt die Admin-Sperre auch bei Grün gelten", () => {
    expect(kundeSiehtObjektDokument(objektDok("a", { name: "Exposé", kundenFreigabe: "gesperrt" }))).toBe(false);
  });

  it("wertet bei Investagon-Dateien „intern“ nicht als Handmarkierung, dort entscheidet die Ampel", () => {
    const ausInvestagon = { url: "/investagon-dokument/o1/grundriss.pdf", kategorie: "intern" as const, sichtbar: false };
    expect(kundeSiehtObjektDokument(objektDok("a", { name: "Plan OG 2", ...ausInvestagon }), "layout")).toBe(true);
    expect(kundeSiehtObjektDokument(objektDok("a", { name: "Mietvertrag WE 3", ...ausInvestagon }), "rental_agreement")).toBe(false);
  });

  it("entscheidet bei Wohnungsunterlagen genauso, nicht mehr allein nach der Kategorie", () => {
    expect(kundeSiehtWohnungDokument(wohnungDok("w", { name: "Grundriss WE 7" }))).toBe(true);
    expect(kundeSiehtWohnungDokument(wohnungDok("w", { name: "Grundriss WE 7", kategorie: "intern" }))).toBe(false);
    expect(kundeSiehtWohnungDokument(wohnungDok("w", { name: "Hausgeldabrechnung 2024" }))).toBe(false);
  });
});

describe("Befund 2: die Standardeinträge Mietvertrag und Grundbuch", () => {
  it("gelten nie mehr als „Kunde sieht“, auch nicht als Wohnungsunterlage", () => {
    for (const name of ["Mietvertrag", "GBA Wohnung"]) {
      const standard = DEFAULT_WOHNUNG_DOCS.find((d) => d.name === name)!;
      expect(standard.kategorie).toBe("wohnungsunterlagen");
      expect(kundeSiehtWohnungDokument({ ...standard, url: "/objekt-dokument/x.pdf" })).toBe(false);
    }
    const grundbuch = defaultDokumente().find((d) => d.name === "Grundbuchauszug")!;
    expect(grundbuch).toMatchObject({ kategorie: "objektunterlagen", sichtbar: true });
    expect(kundeSiehtObjektDokument({ ...grundbuch, url: "/objekt-dokument/x.pdf" })).toBe(false);
  });

  it("bleiben auch mit bloßer Freigabe zurück, erst geschwärzt geprüft UND frei lässt sie hinaus", () => {
    const mv = wohnungDok("mv", { name: "Mietvertrag" });
    expect(kundeSiehtWohnungDokument({ ...mv, kundenFreigabe: "frei" })).toBe(false);
    expect(kundeSiehtWohnungDokument({ ...mv, geschwaerzt: true })).toBe(false);
    expect(kundeSiehtWohnungDokument({ ...mv, kundenFreigabe: "frei", geschwaerzt: true })).toBe(true);
  });

  it("zeigen im Reiter Dokumente die rote Ampel und „nur CRM“", () => {
    const [, wohnung] = einheitUnterlagenGruppen(
      { dokumente: [objektDok("gb", { name: "Grundbuchauszug" })], meta: {} },
      { dokumente: [wohnungDok("mv", { name: "Mietvertrag" }), wohnungDok("gba", { name: "GBA Wohnung" })] },
    );
    expect(wohnung.eintraege.map((e) => [e.name, e.ampel, e.kundeSieht])).toEqual([
      ["Mietvertrag", "rot", false],
      ["GBA Wohnung", "rot", false],
    ]);
  });
});

describe("Freigabe-Schalter im Reiter", () => {
  it("ist bei einer Objektunterlage mit den neuen Spalten bereit, ohne sie wartet er auf die Migration", () => {
    const eintraege = objektUnterlagenEintraege({
      dokumente: [
        objektDok("mit", { name: "Exposé", freigabeSpalten: true, kundenFreigabe: null, geschwaerzt: false }),
        objektDok("ohne", { name: "Exposé alt" }),
      ],
      meta: {},
    });
    expect(eintraege.map((e) => [e.id, e.tabelle, e.freigabeSchalter])).toEqual([
      ["mit", "objekt_dokumente", "bereit"],
      ["ohne", "objekt_dokumente", "migration_fehlt"],
    ]);
  });

  it("bietet bei einer Wohnungsunterlage nur aus meta.dokumente keinen Schalter, dort gilt die Grundregel", () => {
    const [wohnung] = einheitUnterlagenGruppen(
      { dokumente: [], meta: {} },
      {
        dokumente: [
          wohnungDok("tabelle", { name: "Grundriss", ausTabelle: true, freigabeSpalten: true }),
          wohnungDok("meta", { name: "Grundriss alt" }),
        ],
      },
    );
    expect(wohnung.eintraege.map((e) => [e.id, e.tabelle, e.freigabeSchalter])).toEqual([
      ["tabelle", "wohnungs_dokumente", "bereit"],
      ["meta", undefined, "nur_grundregel"],
    ]);
  });
});

describe("einheitUnterlagenGruppen", () => {
  it("zeigt die Objektunterlagen auch bei einem Haus mit vielen Einheiten, getrennt von denen der Wohnung", () => {
    const gruppen = einheitUnterlagenGruppen(
      { dokumente: [objektDok("expose", { name: "Exposé" })], meta: {} },
      { dokumente: [wohnungDok("grundriss", { name: "Grundriss" })] },
    );
    expect(gruppen.map((g) => g.titel)).toEqual(["Dokumente zum Objekt", "Dokumente zu dieser Wohnung"]);
    expect(gruppen[0].eintraege.map((e) => e.name)).toEqual(["Exposé"]);
    expect(gruppen[1].eintraege.map((e) => e.name)).toEqual(["Grundriss"]);
  });

  it("uebernimmt die Einordnung der Objektseite: Internes bleibt als nur CRM gekennzeichnet", () => {
    const [objekt] = einheitUnterlagenGruppen(
      { dokumente: [objektDok("frei", { name: "Energieausweis" }), objektDok("gesperrt", { name: "Energieausweis", sichtbar: false }), objektDok("intern", { name: "Energieausweis", kategorie: "intern" })], meta: {} },
      { dokumente: [] },
    );
    expect(objekt.eintraege.map((e) => [e.id, e.kundeSieht, e.art])).toEqual([
      ["frei", true, "Objektunterlagen"],
      ["gesperrt", false, "Objektunterlagen"],
      ["intern", false, "Intern"],
    ]);
  });

  it("laesst eine Wohnung ohne eigene Dateien ohne leere Gruppe", () => {
    const gruppen = einheitUnterlagenGruppen(
      { dokumente: [objektDok("a")], meta: {} },
      // Die Platzhalter aus DEFAULT_WOHNUNG_DOCS tragen keine Datei.
      { dokumente: [wohnungDok("platzhalter", { url: "" })] },
    );
    expect(gruppen.map((g) => g.schluessel)).toEqual(["objekt"]);
  });

  it("laesst ebenso die Objektgruppe weg, wenn am Objekt nichts liegt", () => {
    const gruppen = einheitUnterlagenGruppen({ dokumente: [], meta: {} }, { dokumente: [wohnungDok("w")] });
    expect(gruppen.map((g) => g.schluessel)).toEqual(["wohnung"]);
  });

  it("gibt ohne jede Datei gar keine Gruppe zurueck", () => {
    expect(einheitUnterlagenGruppen({ dokumente: [], meta: {} }, {})).toEqual([]);
  });

  it("behaelt eine Gruppe, die nur einen Sammelordner hat, denn der ist ihr Inhalt", () => {
    const gruppen = einheitUnterlagenGruppen(
      { dokumente: [], meta: { unterlagenLink: " https://ordner.example/haus " } },
      { dokumente: [], unterlagenLink: "   " },
    );
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0]).toMatchObject({ schluessel: "objekt", link: "https://ordner.example/haus", eintraege: [] });
  });
});

describe("Investagon-Kategorie an den Zeilen", () => {
  /*
   * Der Import schreibt nur den Namen in die Zeile, die Kategorie steht im
   * Originaldatensatz. Objektseite und Einheitsseite gruppieren danach.
   */
  const files = (eintraege: Array<Record<string, unknown>>) => ({ investagonRaw: { files: eintraege } });

  it("findet die Kategorie einer Objektunterlage über ihren Namen", () => {
    const eintraege = objektUnterlagenEintraege({
      dokumente: [
        objektDok("a", { name: "Plan OG 2", kategorie: "intern", sichtbar: false }),
        objektDok("i", { name: "Plan OG 2", url: "/investagon-dokument/o1/plan.pdf", kategorie: "intern", sichtbar: false }),
        objektDok("b", { name: "Eigene Datei" }),
      ],
      meta: files([{ id: 7, filename: "https://tool.investagon.com/f/plan.pdf", title: "Plan OG 2", category: "layout" }]),
    });
    // a: von Hand intern markiert, also nie. i: dieselbe Datei aus Investagon,
    // dort ist „intern" nur die Voreinstellung des Imports, der Grundriss ist
    // grün. b: ohne Stichwort „Sonstiges", also gelb und erst nach Freigabe.
    expect(eintraege.map((e) => [e.id, e.investagonKategorie, e.art, e.kundeSieht])).toEqual([
      ["a", "layout", "Intern", false],
      ["i", "layout", "Intern", true],
      ["b", undefined, "Objektunterlagen", false],
    ]);
  });

  it("liest bei der Wohnung ihren eigenen Datensatz, nicht den des Objekts", () => {
    const [, wohnung] = einheitUnterlagenGruppen(
      { dokumente: [objektDok("o", { name: "Plan OG 2" })], meta: files([{ filename: "https://t/x.pdf", title: "Plan OG 2", category: "layout" }]) },
      {
        dokumente: [wohnungDok("w", { name: "MV_WE09.pdf" })],
        investagonRaw: { files: [{ filename: "https://t/MV_WE09.pdf", original_filename: "MV_WE09.pdf", category: "rental_agreement" }] },
      },
    );
    expect(wohnung.eintraege[0].investagonKategorie).toBe("rental_agreement");
  });
});

describe("Freigabe beim Einlesen (objekteStore)", () => {
  const zeile = { id: "o1", titel: "Haus", meta: {} };

  it("liest Freigabe und Schwärzung aus der Tabellenzeile, ohne die Spalten bleibt es bei der Grundregel", () => {
    const objekt = dbRowToObjekt(zeile, [], [
      { id: "a", name: "Wirtschaftsplan 2025", url: "/objekt-dokument/a.pdf", kategorie: "objektunterlagen", sichtbar: true, kunden_freigabe: "frei", geschwaerzt: false },
      { id: "b", name: "Exposé", url: "/objekt-dokument/b.pdf", kategorie: "objektunterlagen", sichtbar: true },
      { id: "c", name: "Exposé alt", url: "/objekt-dokument/c.pdf", kategorie: "objektunterlagen", sichtbar: true, kunden_freigabe: "irgendwas" },
    ], [], [], false);
    expect(objekt.dokumente.map((d) => [d.id, d.kundenFreigabe, d.freigabeSpalten])).toEqual([
      ["a", "frei", true],
      ["b", undefined, undefined],
      ["c", null, true],
    ]);
    expect(objektUnterlagenEintraege(objekt).map((e) => [e.id, e.kundeSieht])).toEqual([["a", true], ["b", true], ["c", true]]);
  });

  it("wirft eine Freigabe in wohnungen.meta.dokumente weg, die darf jede interne Rolle schreiben", () => {
    const objekt = dbRowToObjekt(zeile, [], [], [{
      id: "w7", objekt_id: "o1", we_nr: "7",
      meta: { dokumente: [
        { id: "mv", name: "Mietvertrag", url: "/objekt-dokument/mv.pdf", kategorie: "wohnungsunterlagen", kunden_freigabe: "frei", geschwaerzt: true, kundenFreigabe: "frei", ausTabelle: true, freigabeSpalten: true },
      ] },
    }], [], false);
    const [mv] = objekt.wohnungen[0].dokumente;
    expect(mv).not.toHaveProperty("kunden_freigabe");
    expect(mv).not.toHaveProperty("geschwaerzt");
    expect(mv).not.toHaveProperty("kundenFreigabe");
    expect(mv).not.toHaveProperty("ausTabelle");
    const [gruppe] = einheitUnterlagenGruppen({ dokumente: [], meta: {} }, objekt.wohnungen[0]);
    expect(gruppe.eintraege.map((e) => [e.name, e.kundeSieht, e.freigabeSchalter])).toEqual([["Mietvertrag", false, "nur_grundregel"]]);
  });
});
