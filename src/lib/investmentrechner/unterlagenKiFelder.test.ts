import { describe, expect, it } from "vitest";
import { standardEingabe } from "./rechenkern";
import { herkunftAusJson, ohneAutomatik } from "./herkunft";
import type { UnterlagenDokument } from "./unterlagenAuslesen";
import {
  abgleichListe,
  anfrageDokumente,
  dokumentSeiten,
  enthaeltKnkSaetze,
  kiAntwortAufGesamtkaufpreis,
  kiAntwortInVorschlaege,
  kiHinweise,
  uebernahmeAnwenden,
  unterlagenAuslesbar,
  vorschlagswertFormatiert,
  zahlPruefen,
  AUSLESBARE_FELDER,
} from "./unterlagenKiFelder";

const beschreibung = (feld: string) => {
  const treffer = AUSLESBARE_FELDER.find((eintrag) => eintrag.feld === feld);
  if (!treffer) throw new Error(`Unbekanntes Feld ${feld}`);
  return treffer;
};

describe("KI-Auslesung der Rechnerfelder", () => {
  it("nimmt Zahlen als Zahl und deutsche Beträge als Text", () => {
    expect(zahlPruefen(beschreibung("purchasePrice"), 241500)).toBe(241500);
    expect(zahlPruefen(beschreibung("purchasePrice"), "241.500,00 €")).toBe(241500);
    expect(zahlPruefen(beschreibung("area"), "72,5 m²")).toBe(72.5);
  });

  it("verwirft leere, unlesbare und unplausible Werte", () => {
    expect(zahlPruefen(beschreibung("purchasePrice"), "")).toBeNull();
    expect(zahlPruefen(beschreibung("purchasePrice"), null)).toBeNull();
    expect(zahlPruefen(beschreibung("purchasePrice"), "unbekannt")).toBeNull();
    // Kaufpreis muss größer als null sein.
    expect(zahlPruefen(beschreibung("purchasePrice"), 0)).toBeNull();
    expect(zahlPruefen(beschreibung("purchasePrice"), -5000)).toBeNull();
    // Ein Sollzins von 350 Prozent ist ein Lesefehler, kein Wert.
    expect(zahlPruefen(beschreibung("seniorInterestRate"), 350)).toBeNull();
    expect(zahlPruefen(beschreibung("constructionYear"), 1492)).toBeNull();
  });

  it("rundet Baujahr und Zimmer, Prozentsätze bleiben Prozent", () => {
    expect(zahlPruefen(beschreibung("constructionYear"), 1998.4)).toBe(1998);
    expect(zahlPruefen(beschreibung("rooms"), 2.5)).toBe(2.5);
    expect(zahlPruefen(beschreibung("rooms"), 2.3)).toBe(2.5);
    expect(zahlPruefen(beschreibung("transferTaxRate"), 3.5)).toBe(3.5);
    // Nur der Gebäudeanteil darf als Bruchteil kommen, er ist dann eindeutig.
    expect(zahlPruefen(beschreibung("buildingShare"), 0.8)).toBe(80);
    expect(zahlPruefen(beschreibung("buildingShare"), 80)).toBe(80);
  });

  it("bildet die Antwort auf Vorschläge ab und belegt nur sichere Änderungen vor", () => {
    const aktuell = { ...standardEingabe, purchasePrice: 241500, area: 0 };
    const antwort = {
      felder: {
        purchasePrice: { wert: 241500, quelle: "Preisliste.pdf, Seite 2", sicherheit: "hoch" },
        area: { wert: "72,5", quelle: "Exposé.pdf, Seite 3", sicherheit: "hoch" },
        monthlyColdRent: { wert: 830, quelle: "Mietvertrag.pdf, Seite 1", sicherheit: "mittel" },
        address: { wert: "  Musterstraße 1,  80331 München ", quelle: "Exposé.pdf, Seite 1", sicherheit: "hoch" },
        seniorInterestRate: { wert: 350, quelle: "Finanzierung.pdf, Seite 1", sicherheit: "hoch" },
        clientName: { wert: "Max Mustermann", quelle: "Exposé.pdf, Seite 1", sicherheit: "hoch" },
        rooms: { wert: null, quelle: "", sicherheit: "hoch" },
      },
      hinweise: ["Preisliste nennt zwei Einheiten, genommen wurde WE 7.", "", 42],
    };
    const vorschlaege = kiAntwortInVorschlaege(antwort, aktuell);
    expect(vorschlaege.map((vorschlag) => vorschlag.feld)).toEqual([
      "address",
      "area",
      "purchasePrice",
      "monthlyColdRent",
    ]);
    const kaufpreis = vorschlaege.find((vorschlag) => vorschlag.feld === "purchasePrice")!;
    expect(kaufpreis.unveraendert).toBe(true);
    expect(kaufpreis.vorausgewaehlt).toBe(false);
    const flaeche = vorschlaege.find((vorschlag) => vorschlag.feld === "area")!;
    expect(flaeche.wert).toBe(72.5);
    expect(flaeche.aktuell).toBe(0);
    expect(flaeche.vorausgewaehlt).toBe(true);
    const miete = vorschlaege.find((vorschlag) => vorschlag.feld === "monthlyColdRent")!;
    expect(miete.sicherheit).toBe("mittel");
    expect(miete.vorausgewaehlt).toBe(false);
    const adresse = vorschlaege.find((vorschlag) => vorschlag.feld === "address")!;
    expect(adresse.wert).toBe("Musterstraße 1, 80331 München");
    expect(kiHinweise(antwort)).toEqual(["Preisliste nennt zwei Einheiten, genommen wurde WE 7."]);
  });

  it("liefert bei kaputter Antwort nichts statt zu raten", () => {
    expect(kiAntwortInVorschlaege(null, standardEingabe)).toEqual([]);
    expect(kiAntwortInVorschlaege({ felder: "nein" }, standardEingabe)).toEqual([]);
    expect(kiAntwortInVorschlaege({ felder: { purchasePrice: 241500 } }, standardEingabe)).toEqual([]);
    expect(kiHinweise({})).toEqual([]);
  });

  it("schreibt nur die ausgewählten Felder und erkennt Kaufnebenkostensätze", () => {
    const vorschlaege = kiAntwortInVorschlaege(
      {
        felder: {
          purchasePrice: { wert: 200000, quelle: "a", sicherheit: "hoch" },
          transferTaxRate: { wert: 5, quelle: "b", sicherheit: "hoch" },
          area: { wert: 60, quelle: "c", sicherheit: "hoch" },
        },
      },
      standardEingabe,
    );
    const nurKaufpreis = uebernahmeAnwenden(vorschlaege, new Set(["purchasePrice"]));
    expect(nurKaufpreis).toEqual({ purchasePrice: 200000 });
    expect(enthaeltKnkSaetze(nurKaufpreis)).toBe(false);
    const mitSteuer = uebernahmeAnwenden(vorschlaege, new Set(["purchasePrice", "transferTaxRate"]));
    expect(mitSteuer).toEqual({ purchasePrice: 200000, transferTaxRate: 5 });
    expect(enthaeltKnkSaetze(mitSteuer)).toBe(true);
  });

  it("formatiert Werte mit Einheit", () => {
    expect(vorschlagswertFormatiert("euro", 241500)).toContain("241.500");
    expect(vorschlagswertFormatiert("prozent", 3.5)).toContain("3,5");
    expect(vorschlagswertFormatiert("quadratmeter", 72.5)).toBe("72,5 m²");
    expect(vorschlagswertFormatiert("jahr", 0)).toBe("leer");
    expect(vorschlagswertFormatiert("text", "")).toBe("leer");
  });

  it("bereitet nur lesbare Unterlagen mit Seiten für die Anfrage vor", () => {
    const basis: UnterlagenDokument = {
      id: "1",
      name: "Exposé.pdf",
      category: "Objektunterlage",
      pages: 2,
      status: "done",
      detail: "",
      text: "Seite eins\nSeite zwei",
    };
    const dokumente: UnterlagenDokument[] = [
      basis,
      { ...basis, id: "2", name: "Mit Seiten.pdf", seiten: [" A ", "B"] },
      { ...basis, id: "3", name: "Lädt.pdf", status: "reading" },
      { ...basis, id: "4", name: "Kaputt.pdf", status: "error", text: "" },
      { ...basis, id: "5", name: "Scan.pdf", status: "manual", text: "" },
    ];
    expect(dokumentSeiten(basis)).toEqual(["Seite eins", "Seite zwei"]);
    const anfrage = anfrageDokumente(dokumente);
    expect(anfrage.map((dokument) => dokument.name)).toEqual(["Exposé.pdf", "Mit Seiten.pdf", "Scan.pdf"]);
    expect(anfrage[1].seiten).toEqual(["A", "B"]);
    expect(anfrage[2].seiten).toEqual([""]);
    expect(unterlagenAuslesbar(dokumente)).toBe(true);
    // Ein Scan ohne Datei lässt sich nicht auslesen, ein lesbares Dokument schon.
    expect(unterlagenAuslesbar([dokumente[4]])).toBe(false);
    expect(unterlagenAuslesbar([{ ...dokumente[4], datei: new File([""], "Scan.pdf") }])).toBe(true);
    expect(unterlagenAuslesbar([])).toBe(false);
  });

  it("reicht Ablage, Ebene und Rot-Markierung an die Function weiter (seit dem 28.09.2026)", () => {
    const mietvertrag: UnterlagenDokument = {
      id: "e:m", name: "Anlage 3.pdf", category: "Einheitsunterlage", pages: 1, status: "done", detail: "", text: "Text",
      ablage: { url: "/investagon-dokument/o1/a3.pdf", ebene: "einheit", rot: true, investagonKategorie: "rental_agreement" },
    };
    expect(anfrageDokumente([mietvertrag])[0]).toMatchObject({
      url: "/investagon-dokument/o1/a3.pdf", ebene: "einheit", rot: true, investagonKategorie: "rental_agreement",
    });
    // Eigene Uploads haben keine Ablage und bleiben wie bisher.
    const { ablage: _ohne, ...eigen } = mietvertrag;
    expect(Object.keys(anfrageDokumente([eigen])[0]).sort()).toEqual(["kategorie", "name", "seiten"]);
  });
});

describe("KI-Auslesung: Gesamtkaufpreis seit Version 3", () => {
  const feld = (wert: number, quelle = "Preisliste.pdf, Seite 1") => ({ wert, quelle, sicherheit: "hoch" as const });

  it("ergänzt bei einer alten Antwort den Kaufpreis um die Möbel", () => {
    const alt = { ausleseVersion: 2, felder: { purchasePrice: feld(242000), furniturePrice: feld(8000) }, hinweise: [] };
    const neu = kiAntwortAufGesamtkaufpreis(alt);
    expect(neu.felder.purchasePrice?.wert).toBe(250000);
    expect(neu.felder.purchasePrice?.quelle).toMatch(/plus Möbel 8\.000/);
    expect(neu.felder.furniturePrice?.wert).toBe(8000);
  });

  it("lässt eine neue Antwort und eine alte ohne Möbel unverändert", () => {
    const neu = { ausleseVersion: 3, felder: { purchasePrice: feld(250000), furniturePrice: feld(8000) }, hinweise: [] };
    expect(kiAntwortAufGesamtkaufpreis(neu)).toBe(neu);
    const ohneMoebel = { ausleseVersion: 2, felder: { purchasePrice: feld(242000) }, hinweise: [] };
    expect(kiAntwortAufGesamtkaufpreis(ohneMoebel)).toBe(ohneMoebel);
  });
});

describe("Abgleich mit den hinterlegten Einheitsdaten (28.09.2026)", () => {
  const quelle = "Mietvertrag der Einheit, Faktenauszug";
  const antwort = {
    felder: {
      monthlyColdRent: { wert: 650.4, quelle, sicherheit: "hoch" },
      area: { wert: 55.8, quelle, sicherheit: "hoch" },
      rooms: { wert: 3, quelle, sicherheit: "hoch" },
      purchasePrice: { wert: 199000, quelle: "Exposé.pdf, Seite 2", sicherheit: "hoch" },
    },
    hinweise: [],
  };
  // Aus der Einheit: Miete 650 €, Fläche 55,5 m², Zimmer 2. Kaufpreis ist leer.
  const hinterlegt = { ...standardEingabe, monthlyColdRent: 650, area: 55.5, rooms: 2 };
  const vorschlaege = kiAntwortInVorschlaege(antwort, hinterlegt);
  const zu = (feld: string) => vorschlaege.find((v) => v.feld === feld)!;

  it("leeres Feld: der sichere Wert aus der Unterlage ist vorausgewählt", () => {
    expect(zu("purchasePrice")).toMatchObject({ abgleich: "leer", vorausgewaehlt: true });
  });

  it("gleicher Wert (Euro gerundet, Fläche auf 0,5 m²): bestätigt, nichts ausgewählt", () => {
    expect(zu("monthlyColdRent")).toMatchObject({ abgleich: "bestaetigt", vorausgewaehlt: false, unveraendert: true });
    expect(zu("area")).toMatchObject({ abgleich: "bestaetigt", vorausgewaehlt: false });
  });

  it("abweichender Wert: nicht vorausgewählt, aber wählbar", () => {
    expect(zu("rooms")).toMatchObject({ abgleich: "abweichend", vorausgewaehlt: false, unveraendert: false, aktuell: 2, wert: 3 });
    // Ein Euro Unterschied ist schon eine Abweichung.
    const miete = kiAntwortInVorschlaege({ felder: { monthlyColdRent: { wert: 651, quelle, sicherheit: "hoch" } } }, hinterlegt)[0];
    expect(miete.abgleich).toBe("abweichend");
  });
});

describe("Belegt heißt: mit Herkunft, auch 0 oder Voreinstellung (LOTSE-R4-003)", () => {
  const antwort = { felder: { buildingShare: { wert: 90, quelle: "Kaufpreisaufteilung.pdf", sicherheit: "hoch" } }, hinweise: [] };

  it("ein gepflegter Gebäudeanteil von 80 Prozent ist belegt, die Unterlage weicht ab", () => {
    const [v] = kiAntwortInVorschlaege(antwort, standardEingabe, { buildingShare: { quelle: "objekt", text: "Aus der Objektanlage" } });
    expect(v).toMatchObject({ abgleich: "abweichend", vorausgewaehlt: false });
  });

  it("ohne Herkunft ist die Voreinstellung leer, der sichere Wert ist vorausgewählt", () => {
    const [v] = kiAntwortInVorschlaege(antwort, standardEingabe, {});
    expect(v).toMatchObject({ abgleich: "leer", vorausgewaehlt: true });
    // Eine eingetippte 0 ist ebenfalls belegt.
    const [null0] = kiAntwortInVorschlaege(
      { felder: { furniturePrice: { wert: 8000, quelle: "Preisliste.pdf", sicherheit: "hoch" } }, hinweise: [] },
      standardEingabe,
      { furniturePrice: { quelle: "eigen", text: "" } },
    );
    expect(null0.abgleich).toBe("abweichend");
  });

  it("ein automatisch übernommener Wert erscheint als solcher, nicht als Bestätigung", () => {
    const eingabe = { ...standardEingabe, buildingShare: 90 };
    const [v] = abgleichListe(antwort, eingabe, { buildingShare: { quelle: "unterlagen", text: "Aus X", automatisch: true, vorher: 80 } });
    expect(v).toMatchObject({ automatisch: true, vorausgewaehlt: false });
  });

  it("weicht die neue Auslesung vom automatisch übernommenen Wert ab, bleiben beide Zeilen (LOTSE-R7-004)", () => {
    const eingabe = { ...standardEingabe, buildingShare: 85 };
    const liste = abgleichListe(antwort, eingabe, { buildingShare: { quelle: "unterlagen", text: "Aus X", automatisch: true, vorher: 80 } });
    const zeilen = liste.filter((z) => z.feld === "buildingShare");
    expect(zeilen.map((z) => [!!z.automatisch, z.abgleich])).toEqual([[true, "bestaetigt"], [false, "abweichend"]]);
    // Die Automatik-Zeile ist nie ein Vorschlag zum Übernehmen.
    expect(uebernahmeAnwenden([zeilen[0]], new Set(["buildingShare"]))).toEqual({});
  });
});

describe("Automatisch übernommen: Speichern, Laden, Vergleichsobjekt (LOTSE-R5-004, R5-005)", () => {
  const herkunft = { area: { quelle: "unterlagen" as const, text: "Aus Beleg.pdf", automatisch: true, vorher: 0 } };

  it("überlebt Speichern und Laden mit Wert davor", () => {
    const geladen = herkunftAusJson(JSON.parse(JSON.stringify(herkunft)), Object.keys(standardEingabe));
    expect(geladen.area).toEqual({ quelle: "unterlagen", text: "Aus Beleg.pdf", stand: undefined, automatisch: true, vorher: 0 });
    // Fremde Werte werden nicht übernommen.
    const fremd = herkunftAusJson({ area: { quelle: "eigen", text: "", automatisch: true, vorher: { x: 1 } } }, Object.keys(standardEingabe));
    expect(fremd.area).toEqual({ quelle: "eigen", text: "", stand: undefined });
  });

  it("ein Vergleichsobjekt übernimmt die Werte ohne automatisch und ohne Wert davor", () => {
    expect(ohneAutomatik(herkunft)).toEqual({ area: { quelle: "unterlagen", text: "Aus Beleg.pdf" } });
  });
});
