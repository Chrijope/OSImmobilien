import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { excelDatumIso, leseExcel } from "./excelLesen";
import { garageAusZeile, importAusfuehren, importPlanen, kopfErkennen, nameTeilen, planZaehlen, weNummer } from "./listenImport";
import type { Blatt } from "./excelLesen";
import type { Mieter } from "./mieterStore";
import type { ObjektWohnung } from "./objekteStore";

// Spaltenköpfe wie in „Mietdifferenz Hauffstraße Abgleich.xlsx“ (Auszug), Namen erfunden.
const MIETDIFFERENZ: Blatt = {
  name: "Mietdifferenz-Garantie",
  zeilen: [
    ["WE", "Haus", "Lage", "m² lt. Mieterübersicht", "m² lt. Investagon (15.10.)", "Mieter (lt. Mieterübersicht 23.02.2026)", "Ist-Kaltmiete Wohnung", "Mietbeginn", "Garage/Stellplatz zugeordnet (Teilungserklärung, SNR)", "Garage: Status", "Ist-Miete Garage"],
    [1, "38 a", "EG li", 42.53, 42.53, "Muster, Anna", 404.93, "15.07.2007", "keine", "KEINE Garage/kein Stellplatz zugewiesen", 0],
    [4, "38 b", "1. OG re", 42.89, 42.89, "Beispiel, Jonas", 360, "01.01.2015", "SP13", "nur Stellplatz, frei: Mietansatz offen (0 €)", 20],
    [46, "38 f", "2. OG re", 79.72, 79.72, "Leerstand lt. Übersicht", 900, "", "G4", "Garage vermietet (50 €): im 1. Jahr 50 € Subvention", 0],
    [99, "", "", 50, 50, "Probe, Lea", 500, "", "", "", null],
  ],
};

const we = (id: string, weNr: string, teil: Partial<ObjektWohnung> = {}): ObjektWohnung => ({
  id, weNr, etage: "", lage: "", groesse: 42.53, zimmer: 1, mieteGesamt: 0, vkGesamt: 161000, qmPreis: 0, rendite: 0,
  vermietet: true, status: "frei", ...teil,
});

describe("Listenimport", () => {
  it("erkennt die Spalten und bevorzugt die Investagon-Fläche", () => {
    const k = kopfErkennen(MIETDIFFERENZ)!;
    expect(k.zeile).toBe(0);
    expect(k.spalten.flaeche).toBe(4);
    expect(k.spalten.mieter).toBe(5);
    expect(k.spalten.istKaltmiete).toBe(6);
    expect(k.spalten.garageNr).toBe(8);
  });

  it("liest WE-Nummern, Namen und Daten", () => {
    expect(weNummer("WE 01")).toBe(1);
    expect(weNummer("WE1")).toBe(1);
    expect(weNummer("Summe")).toBeNull();
    expect(weNummer("WE 11/12")).toBe(11);
    expect(weNummer("Teilungserklärung kennt 11 Einheiten")).toBeNull();
    expect(nameTeilen("Muster, Anna")).toEqual({ nachname: "Muster", vorname: "Anna" });
    expect(nameTeilen("Familie Probe")).toEqual({ nachname: "Familie Probe", vorname: "" });
    expect(excelDatumIso("15.07.2007")).toBe("2007-07-15");
    expect(excelDatumIso("15.05.19")).toBe("2019-05-15");
    expect(excelDatumIso(45658)).toBe("2025-01-01");
  });

  it("leitet Garage und Stellplatz aus der Zeile ab", () => {
    const k = kopfErkennen(MIETDIFFERENZ)!.spalten;
    expect(garageAusZeile(MIETDIFFERENZ.zeilen[1], k)).toBeNull();
    expect(garageAusZeile(MIETDIFFERENZ.zeilen[2], k)).toEqual({ nr: "SP13", art: "stellplatz", status: "frei", istMiete: 0 });
    // Der Statustext geht der Spalte vor: „frei“ heißt 0 €.
    const frei = [...MIETDIFFERENZ.zeilen[3]]; frei[9] = "Garage frei: im 1. Jahr 100 € Subvention"; frei[10] = 35;
    expect(garageAusZeile(frei, k)).toEqual({ nr: "G4", art: "garage", status: "frei", istMiete: 0 });
    // Garagenliste: Spalte „Ergebnis“
    const g = { we: 0, garageNr: 1, garageStatus: 2 };
    expect(garageAusZeile(["WE5", "G22", "Mieter der Hauffstraße (eigene Wohnung)"], g)).toMatchObject({ nr: "G22", status: "eigener_mieter" });
    expect(garageAusZeile(["WE1", "(keine Nr. angegeben)", "Fremdmieter (extern)"], g)).toBeNull();
    expect(garageAusZeile(["WE9", "G3", "Fremdmieter (extern)"], g)).toMatchObject({ status: "extern" });
    expect(garageAusZeile(MIETDIFFERENZ.zeilen[3], k)).toEqual({ nr: "G4", art: "garage", status: "eigener_mieter", istMiete: 50 });
    // Preis- und Flächenabgleich: Nummern ohne Präfix
    const s = { we: 0, garageNr: 1, stellplatzNr: 2, garageIstMiete: 3 };
    expect(garageAusZeile([7, 14, null, 25], s)).toEqual({ nr: "G14", art: "garage", status: "eigener_mieter", istMiete: 25 });
    expect(garageAusZeile([6, null, 9, 20], s)).toEqual({ nr: "SP9", art: "stellplatz", status: "eigener_mieter", istMiete: 20 });
  });

  it("plant Mieter, Garagen und prüft Kaufpreis und Fläche", () => {
    const wohnungen = [
      we("w1", "WE 1", { meta: { investagonId: "x" } } as never),
      we("w4", "WE 4", { groesse: 43, investagonId: "y" }),
      we("w46", "WE 46", { groesse: 79.72 }),
    ];
    const vorhanden = { id: "m1", nachname: "Muster", vorname: "Anna", status: "aktiv", wohneinheitId: "w1", kaltmiete: 337.44, mietvertragBeginn: "2007-07-15", mietvertragEnde: "", dokumente: [] } as unknown as Mieter;
    const { zeilen } = importPlanen(MIETDIFFERENZ, wohnungen, [vorhanden], () => null);
    expect(zeilen).toHaveLength(4);
    expect(zeilen[0].mieter?.aktion).toBe("aktualisieren");
    expect(zeilen[1].mieter?.aktion).toBe("neu");
    expect(zeilen[1].flaeche.ergebnis).toBe("abweichend");
    expect(zeilen[1].hinweise.join()).toMatch(/Investagon/);
    expect(zeilen[2].mieter).toBeUndefined();
    expect(zeilen[2].hinweise.join()).toMatch(/ohne Mieter/);
    expect(zeilen[2].garage?.aktion).toBe("setzen");
    expect(zeilen[3].wohnung).toBeUndefined();
    const n = planZaehlen(zeilen);
    expect(n).toMatchObject({ mieterNeu: 1, mieterAktualisiert: 1, garagen: 2, abweichendInvestagon: 1, ohneEinheit: 1 });
  });

  it("schreibt Kaufpreis und Fläche nur bei selbst angelegten Einheiten", async () => {
    const blatt: Blatt = { name: "Vertriebsliste", zeilen: [["WE", "Fläche m²", "Verkaufspreis"], ["WE 1", 65, 153500], ["WE 2", 25, 64500]] };
    const wohnungen = [we("a", "WE 1", { groesse: 60, vkGesamt: 150000 }), we("b", "WE 2", { groesse: 20, vkGesamt: 60000, investagonId: "i" })];
    const { zeilen } = importPlanen(blatt, wohnungen, [], () => null);
    const schreiber = { mieterAnlegen: vi.fn(), mieterAendern: vi.fn(), garageSetzen: vi.fn(), wohnungAendern: vi.fn(async () => null), listendatenSetzen: vi.fn() };
    expect(await importAusfuehren({ id: "o", titel: "Brück" }, zeilen, "Vertriebsliste", schreiber)).toEqual([]);
    expect(schreiber.wohnungAendern).toHaveBeenCalledTimes(1);
    expect(schreiber.wohnungAendern).toHaveBeenCalledWith("a", { groesse: 65, vkGesamt: 153500 });
  });

  it("liest eine echte .xlsx mit geteilten Texten und Zahlen", async () => {
    const zip = new JSZip();
    zip.file("xl/workbook.xml", `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Liste" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
    zip.file("xl/sharedStrings.xml", `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>WE</t></si><si><r><t>Fläche </t></r><r><t>m²</t></r></si></sst>`);
    zip.file("xl/worksheets/sheet1.xml", `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>1</v></c><c r="C2"><f>B2*2</f><v>42.53</v></c></row></sheetData></worksheet>`);
    const [blatt] = await leseExcel(await zip.generateAsync({ type: "arraybuffer" }));
    expect(blatt.name).toBe("Liste");
    expect(blatt.zeilen).toEqual([["WE", null, "Fläche m²"], [1, null, 42.53]]);
  });

  it("übernimmt alle übrigen Spalten als Listendaten, Hausgeld bei eigenen Einheiten auch in die Rechenfelder", async () => {
    // Spaltenköpfe wie „Kaufpreisliste intern.xlsx“ (Brück), gekürzt; Mietername erfunden.
    const blatt: Blatt = { name: "Intern", zeilen: [
      ["WE", "Status", "Fläche m²", "Mieter", "Ist-Miete mtl.", "Sollmiete mtl.", "Verkaufspreis", "Mietsubvention", "MEA /1.000 (TE)",
        "Hausgeld gesamt mtl. (WP 2027)", "davon umlagefähig inkl. Heizung", "davon nicht umlagefähig", "davon Erhaltungsrücklage",
        "BK-Vorausz.", "HK-Vorausz.", "Fotos vorhanden", "Mietvertrag vorhanden", "Hinweise"],
      ["WE 1", "vermietet", 65, "Muster, Anna", 325, 650, 153500, 7901.51, 92, 407.54, 329.74, 49.35, 28.45, 50, 70,
        "nein (nur Außenfotos)", "ja: Scan 2021", "Mieter ruft nur abends an"],
    ] };
    const wohnungen = [we("a", "WE 1", { groesse: 65, vkGesamt: 153500 })];
    const { kopf, zeilen } = importPlanen(blatt, wohnungen, [], () => null, () => null);
    expect(kopf!.listen).toMatchObject({ sollMiete: 5, mietsubvention: 7, mea: 8, hausgeldGesamt: 9, ruecklage: 12, unterlageFotos: 15 });
    const z = zeilen[0];
    expect(z.listendaten?.werte).toEqual({
      status: "vermietet", sollMiete: 650, mietsubvention: 7901.51, mea: 92, hausgeldGesamt: 407.54, hausgeldUmlagefaehig: 329.74,
      hausgeldNichtUmlagefaehig: 49.35, ruecklage: 28.45, bkVorauszahlung: 50, hkVorauszahlung: 70,
      unterlageFotos: false, unterlageMietvertrag: true,
    });
    // Freitext mit möglichen Namen wird nicht übernommen.
    expect(JSON.stringify(z.listendaten)).not.toContain("abends");
    expect(z.mieter?.nebenkosten).toBe(120);
    const schreiber = { mieterAnlegen: vi.fn(), mieterAendern: vi.fn(), garageSetzen: vi.fn(), wohnungAendern: vi.fn(async () => null), listendatenSetzen: vi.fn(async () => undefined) };
    await importAusfuehren({ id: "o", titel: "Brück" }, zeilen, "Liste", schreiber);
    expect(schreiber.listendatenSetzen).toHaveBeenCalledWith("a", z.listendaten!.werte, "Liste");
    expect(schreiber.wohnungAendern).toHaveBeenCalledWith("a", { hausgeldMonat: 407.54, hausgeldUmlagefaehigEuro: 329.74, hausgeldNichtUmlagefaehigEuro: 49.35, ruecklageZufuehrungMonat: 28.45 });
    expect(schreiber.mieterAnlegen.mock.calls[0][0]).toMatchObject({ nachname: "Muster", kaltmiete: 325, nebenkosten: 120 });
  });

  it("meldet unveränderte Listendaten nicht erneut", () => {
    const blatt: Blatt = { name: "x", zeilen: [["WE", "MEA"], [1, 92]] };
    const { zeilen } = importPlanen(blatt, [we("a", "WE 1")], [], () => null, () => ({ werte: { mea: 92 } }));
    expect(zeilen[0].listendaten?.geaendert).toBe(false);
  });
});
