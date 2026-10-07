import { describe, it, expect } from "vitest";
import {
  dateinameAusAblage, eigeneEinheitNummer, einheitNummern, grundrissStaerke, grundrisseWaehlen, nenntFremdeEinheit,
  planAnzeigename, planIstBild, HOECHSTENS_PLAENE_EINHEIT, ersatzArt, geschossSchluessel, type PlanKandidat,
} from "../../supabase/functions/_shared/grundriss-erkennung";

/**
 * Die gemeinsame Grundriss-Erkennung für Browser und Edge Function
 * (`supabase/functions/_shared/grundriss-erkennung.ts`). Maßstab: Ein
 * falscher Plan ist schlimmer als keiner.
 */

describe("einheitNummern", () => {
  it.each([
    ["WE12", ["12"]],
    ["WE 12", ["12"]],
    ["WE_12", ["12"]],
    ["WE-12", ["12"]],
    ["Whg. 12", ["12"]],
    ["Whg 12", ["12"]],
    ["WHG_7a", ["7a"]],
    ["Wohnung 12", ["12"]],
    ["Wohnung Nr. 12", ["12"]],
    ["WE-Nr. 012", ["12"]],
    ["Wohneinheit 03", ["3"]],
    ["App. 5", ["5"]],
    ["Apartment 5", ["5"]],
    ["ETW 4", ["4"]],
    ["WE 1.02", ["1.2"]],
    ["WE7Grundriss.jpg", ["7"]],
    ["Grundriss WE 7 und WE 8", ["7", "8"]],
    ["2-Zimmer-Wohnung 5", ["5"]],
  ])("liest %s", (text, erwartet) => {
    expect(einheitNummern(text)).toEqual(erwartet);
  });

  it.each([
    ["Haus Nr. 9 (Hausnummer, keine Einheit)", "Haus Nr. 9"],
    ["Bewertung 12 (WE mitten im Wort)", "Bewertung 12"],
    ["Wohnungsplan 5 (zusammengesetztes Wort)", "Wohnungsplan 5"],
    ["Tiefgarage 12", "Tiefgarage 12"],
    ["Postleitzahl hinter WE", "WE 89077"],
    ["leer", ""],
  ])("findet keine Nummer in: %s", (_, text) => {
    expect(einheitNummern(text)).toEqual([]);
  });
});

describe("eigeneEinheitNummer", () => {
  it.each([["WE 07", "7"], ["7", "7"], ["6b", "6b"], ["WE7", "7"], ["Whg. 3", "3"], ["1.02", "1.2"]])("%s ergibt %s", (weNr, nr) => {
    expect(eigeneEinheitNummer(weNr)).toBe(nr);
  });

  it("rät aus einer Lagebeschreibung keine Nummer", () => {
    expect(eigeneEinheitNummer("2. OG links")).toBeUndefined();
    expect(eigeneEinheitNummer("")).toBeUndefined();
    expect(eigeneEinheitNummer(undefined)).toBeUndefined();
  });

  it("erkennt eine fremde Nummer nur, wenn die eigene bekannt ist", () => {
    expect(nenntFremdeEinheit("Mietvertrag Whg. 8", "WE 7")).toBe(true);
    expect(nenntFremdeEinheit("Grundriss WE 07", "7")).toBe(false);
    expect(nenntFremdeEinheit("Grundriss Haus 9", "WE 7")).toBe(false);
    expect(nenntFremdeEinheit("Grundriss WE 8", "2. OG links")).toBe(false);
  });
});

describe("grundrissStaerke: woran ein Grundriss erkannt wird", () => {
  it.each([
    ["Grundriss", 3],
    ["Grundriss WE 7.pdf", 3],
    ["Wohnungsgrundriss 3-Zimmer", 3],
    ["Floor plan unit 5", 3],
    ["Wohnungsplan", 3],
    ["Exposé_Grundriss_WE09", 3],
    ["GR WE12.pdf", 2],
    ["WE12_GR.jpg", 2],
    ["Plan Whg. 12", 1],
    ["Pläne Haus 9", 1],
    ["Bauzeichnung WE 3", 1],
  ])("%s", (name, staerke) => {
    expect(grundrissStaerke({ name })).toBe(staerke);
  });

  it.each([
    ["Mietvertrag Anlage Grundriss", "rot, nennt einen Mieter"],
    ["GBA Wohnung 7 mit Grundriss", "rot, Grundbuch"],
    ["Teilungserklärung mit Grundrissen", "gehört zur Teilungserklärung"],
    ["Kaufvertrag Anlage Grundriss", "Vertragsunterlage"],
    ["Wohnflächenberechnung WE 7 GR", "Flächenberechnung"],
    ["Wirtschaftsplan 2025", "Hausgeld, „plan“ nur im Wortinneren"],
    ["Aufteilungsplan", "Teilungserklärung"],
    ["Lageplan", "Nebenplan"],
    ["Grundriss Tiefgarage", "Nebenplan ohne Nummer"],
    ["Grundriss Keller", "Nebenplan ohne Nummer"],
    ["Exposé WE 7", "kein Plan"],
    ["WE12.pdf", "nur eine Nummer, das kann alles sein"],
    ["Wohnung 12", "nur eine Nummer"],
    ["Energieausweis", "kein Plan"],
  ])("erkennt keinen Grundriss in „%s“ (%s)", (name) => {
    expect(grundrissStaerke({ name })).toBe(0);
  });

  it("lässt einen Nebenplan mit Einheitennummer stehen", () => {
    expect(grundrissStaerke({ name: "Grundriss WE 3 mit Keller" })).toBe(3);
  });

  it("nimmt die Investagon-Kategorie vor dem Namen", () => {
    expect(grundrissStaerke({ name: "Scan_0042", investagonKategorie: "layout" })).toBe(3);
    // Der Verkäufer hat die Datei ausdrücklich als Mietvertrag oder Lageplan eingeordnet.
    expect(grundrissStaerke({ name: "Grundriss WE 7", investagonKategorie: "rental_agreement" })).toBe(0);
    expect(grundrissStaerke({ name: "Grundriss", investagonKategorie: "site_plan" })).toBe(0);
    // „Sonstiges“ und „Exposé“ sagen nichts, dann entscheidet der Name.
    expect(grundrissStaerke({ name: "Grundriss WE 7", investagonKategorie: "other_object" })).toBe(3);
    expect(grundrissStaerke({ name: "Grundriss WE 7", investagonKategorie: "expose" })).toBe(3);
    // Rot bleibt rot, auch unter `layout`.
    expect(grundrissStaerke({ name: "Mietvertrag Scholtz Anlage Grundriss", investagonKategorie: "layout" })).toBe(0);
  });

  it("liest die Nummer und das Stichwort auch aus dem Dateinamen", () => {
    expect(grundrissStaerke({ name: "Dokument 3", dateiname: "WE3_Grundriss.pdf" })).toBe(3);
  });
});

describe("Dateinamen", () => {
  it("nimmt den Namen hinter der Ablage ohne Schlüssel und ohne Kürzel des Imports", () => {
    expect(dateinameAusAblage("/investagon-dokument/o1/1a2b3c4d-WE18_Grundriss.jpg")).toBe("WE18_Grundriss.jpg");
    expect(dateinameAusAblage("https://x.supabase.co/storage/v1/object/sign/objekt-dokumente/objekte/o1/dokumente/Grundriss%20WE%207.pdf?token=geheim")).toBe("Grundriss WE 7.pdf");
    expect(dateinameAusAblage("")).toBe("");
  });

  it("erkennt ein Bild an der Endung der Datei, nicht am Schlüssel dahinter", () => {
    expect(planIstBild("WE07.png")).toBe(true);
    expect(planIstBild("plan.pdf", "Grundriss.jpg")).toBe(false);
    expect(planIstBild("", "Grundriss WE 7.jpeg")).toBe(true);
    expect(planIstBild("Mietvertrag WE 09_23.02.2010", "Grundriss.png")).toBe(true);
  });

  it("zeigt den Namen ohne Endung und Unterstriche", () => {
    expect(planAnzeigename("WE18_Grundriss.jpg")).toBe("WE18 Grundriss");
    expect(planAnzeigename("Grundriss WE 7")).toBe("Grundriss WE 7");
    expect(planAnzeigename("")).toBe("Grundriss");
  });
});

describe("grundrisseWaehlen: Zuordnung zur Einheit", () => {
  const k = (name: string, bereich: PlanKandidat["bereich"], extra: Partial<PlanKandidat> = {}) => ({ name, bereich, ...extra });

  it("nimmt den Plan der Einheit vor dem des Objekts", () => {
    const liste = [
      k("Grundriss WE 7", "objekt"),
      k("Pläne Haus 9", "objekt", { investagonKategorie: "layout" }),
      k("Grundriss", "wohnung", { dateiname: "WE07.png" }),
    ];
    expect(grundrisseWaehlen(liste, { weNr: "WE 07" }).map((p) => p.name)).toEqual(["Grundriss"]);
  });

  it("findet den Plan am Objekt über die Nummer, in jeder Schreibweise", () => {
    for (const name of ["Grundriss WE 7", "Grundriss Whg. 7", "Grundriss Wohnung Nr. 07", "GR_WE07.pdf", "Plan Wohnung 7"]) {
      expect(grundrisseWaehlen([k(name, "objekt")], { weNr: "WE 7" }).map((p) => p.name)).toEqual([name]);
    }
  });

  it("Gegenprobe: nie den Plan einer fremden Wohnung", () => {
    const fremd = [k("Grundriss WE 8", "objekt"), k("Grundriss Whg. 17", "objekt"), k("GR_WE70.pdf", "objekt"), k("Grundriss", "objekt", { dateiname: "WE18_Grundriss.jpg" })];
    expect(grundrisseWaehlen(fremd, { weNr: "WE 7" })).toEqual([]);
    // Auch ein falsch abgelegter Plan an der Einheit, der eine andere Nummer nennt, fällt weg.
    expect(grundrisseWaehlen([k("Grundriss WE 8", "wohnung")], { weNr: "WE 7" })).toEqual([]);
  });

  it("nimmt ohne eigenen Plan EINEN Ersatz: erst das Geschoss der Einheit, sonst den Hausplan, nie ein fremdes Geschoss", () => {
    const haus = k("Pläne Haus 9", "objekt");
    const og2 = k("Grundriss 2. OG", "objekt");
    const og3 = k("Grundriss 3. OG", "objekt");
    // Die Einheit liegt im 2. OG: ihr Geschossplan, gekennzeichnet.
    const ziel2 = { weNr: "WE 7", etage: "2. OG" };
    expect(grundrisseWaehlen([haus, og3, og2], ziel2).map((p) => p.name)).toEqual(["Grundriss 2. OG"]);
    expect(ersatzArt(og2, ziel2)).toBe("geschossplan");
    // Dieselbe Etage in anderer Schreibweise, auch als nackte Zahl aus der Datenbank.
    expect(grundrisseWaehlen([haus, og2], { weNr: "WE 7", etage: "2" }).map((p) => p.name)).toEqual(["Grundriss 2. OG"]);
    // Ein anderes Geschoss nie, dann der Hausplan.
    expect(grundrisseWaehlen([og3, haus], ziel2).map((p) => p.name)).toEqual(["Pläne Haus 9"]);
    expect(ersatzArt(haus, ziel2)).toBe("hausplan");
    // Ohne bekannte Etage kein Geschossplan, nur der Hausplan; ohne ihn gar keiner.
    expect(grundrisseWaehlen([og2, haus], { weNr: "WE 7" }).map((p) => p.name)).toEqual(["Pläne Haus 9"]);
    expect(grundrisseWaehlen([og3], ziel2)).toEqual([]);
    // Der eigene Plan ist kein Ersatz.
    expect(ersatzArt(k("Grundriss", "wohnung"), ziel2)).toBeNull();
    // Ein bloßes „Grundriss.jpg“ an einem Haus mit vielen Wohnungen kann jeder gehören.
    expect(grundrisseWaehlen([k("Grundriss.jpg", "objekt")], { weNr: "WE 7" })).toEqual([]);
    // Bei einer Einzelwohnung gehört er ihr.
    expect(grundrisseWaehlen([k("Grundriss.jpg", "objekt")], { weNr: "", einzelwohnung: true }).map((p) => p.name)).toEqual(["Grundriss.jpg"]);
  });

  it("prüft eine genannte Nummer ohne eigene Nummer nicht auf gut Glück", () => {
    expect(grundrisseWaehlen([k("Grundriss WE 5", "objekt")], { weNr: "2. OG links" })).toEqual([]);
    expect(grundrisseWaehlen([k("Grundriss WE 5", "objekt")], { weNr: "", einzelwohnung: true })).toHaveLength(1);
  });

  it("nimmt bei mehreren Treffern den besten: sicher erkannt vor schwach, Bild vor PDF", () => {
    const liste = [
      k("Plan WE 7", "wohnung"),
      k("Grundriss WE 7.pdf", "wohnung"),
      k("Grundriss WE 7.jpg", "wohnung"),
      k("GR WE 7", "wohnung"),
    ];
    expect(grundrisseWaehlen(liste, { weNr: "7" }).map((p) => p.name)).toEqual(["Grundriss WE 7.jpg"]);
    // Ohne das Bild gewinnt die sicher erkannte PDF vor „GR“ und „Plan“.
    expect(grundrisseWaehlen(liste.filter((p) => !p.name.endsWith(".jpg")), { weNr: "7" }).map((p) => p.name)).toEqual(["Grundriss WE 7.pdf"]);
  });

  it("zeigt einer Einheit genau einen Plan, den eigenen (Christian, 24.09.2026)", () => {
    expect(HOECHSTENS_PLAENE_EINHEIT).toBe(1);
    const viele = ["EG", "OG", "DG", "UG", "Spitzboden"].map((g) => k(`Grundriss WE 7 ${g}`, "wohnung"));
    expect(grundrisseWaehlen(viele, { weNr: "WE 7" })).toHaveLength(1);
    // Plan an der Einheit, am Objekt mit ihrer Nummer und ein Hausplan: nur der eine an der Einheit, der Ersatz tritt zurück.
    const gemischt = [k("Grundriss WE 7", "objekt"), k("Pläne Haus 9", "objekt"), k("Grundriss", "wohnung", { dateiname: "WE07.png" })];
    expect(grundrisseWaehlen(gemischt, { weNr: "WE 7" }).map((p) => p.name)).toEqual(["Grundriss"]);
    // Das Exposé des ganzen Objekts behält mehrere.
    expect(grundrisseWaehlen([k("Grundriss WE 2", "objekt"), k("Grundriss WE 1", "objekt")], { weNr: null })).toHaveLength(2);
  });

  it("zeigt im Exposé des Objekts erst die Pläne des Hauses, sonst die der Einheiten", () => {
    const mitHaus = [k("Grundriss WE 1", "objekt"), k("Pläne Haus 9", "objekt", { investagonKategorie: "layout" }), k("Grundriss", "wohnung")];
    expect(grundrisseWaehlen(mitHaus, { weNr: null }).map((p) => p.name)).toEqual(["Pläne Haus 9"]);
    const nurEinheiten = [k("Grundriss WE 2", "objekt"), k("Grundriss WE 1", "objekt")];
    expect(grundrisseWaehlen(nurEinheiten, { weNr: null }).map((p) => p.name)).toEqual(["Grundriss WE 1", "Grundriss WE 2"]);
  });

  it("gibt ohne erkannten Grundriss nichts zurück", () => {
    expect(grundrisseWaehlen([k("Energieausweis", "objekt"), k("Mietvertrag WE 7", "wohnung")], { weNr: "WE 7" })).toEqual([]);
    expect(grundrisseWaehlen([], { weNr: "WE 7" })).toEqual([]);
  });
});

describe("geschossSchluessel", () => {
  it("liest das Geschoss in jeder Schreibweise, eine Hausnummer nicht", () => {
    for (const t of ["Grundriss 2. OG", "grundriss_2og.pdf", "OG 2", "2. Obergeschoss", "2. Etage"]) expect(geschossSchluessel(t), t).toBe("og2");
    expect(geschossSchluessel("Grundriss EG")).toBe("eg");
    expect(geschossSchluessel("Dachgeschoss")).toBe("dg");
    expect(geschossSchluessel("Grundriss OG")).toBe("og?");
    expect(geschossSchluessel("Pläne Haus 9")).toBeUndefined();
    expect(geschossSchluessel("Wegweiser")).toBeUndefined();
    expect(geschossSchluessel("0", true)).toBe("eg");
    expect(geschossSchluessel("3", true)).toBe("og3");
    expect(geschossSchluessel("3")).toBeUndefined();
  });
});
