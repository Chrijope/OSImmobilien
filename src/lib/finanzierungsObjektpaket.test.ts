import { describe, expect, it } from "vitest";
import { darfObjektpaketHinweisSehen, fehlendeFinanzierungsunterlagen, FINANZIERUNG_PFLICHTUNTERLAGEN } from "./finanzierungsObjektpaket";
import type { ObjektData, ObjektDokument, ObjektWohnung, WohnungDokument } from "./objekteStore";

const odok = (name: string, url = "x.pdf"): ObjektDokument =>
  ({ id: name, name, url, typ: "custom", kategorie: "objektunterlagen", sichtbar: true });
const wdok = (name: string, url = "x.pdf"): WohnungDokument => ({ id: name, name, url, kategorie: "wohnungsunterlagen" });

const we = (teil: Partial<ObjektWohnung>): ObjektWohnung => ({
  id: "w1", weNr: "WE 1", etage: "EG", lage: "links", groesse: 65, zimmer: 2, mieteGesamt: 325, vkGesamt: 153500,
  qmPreis: 0, rendite: 0, vermietet: true, vermietungsStatus: "vermietet", status: "frei", dokumente: [], ...teil,
});

const objekt = (dokumente: ObjektDokument[], wohnungen: ObjektWohnung[] = []) =>
  ({ dokumente, meta: {}, wohnungen }) as unknown as Pick<ObjektData, "dokumente" | "meta" | "wohnungen">;

const HAUS = [
  odok("Teilungserklärung_Brück.pdf"), odok("Energieausweis"), odok("Wirtschaftsplan 2026"),
  odok("Protokoll ETV 2023"), odok("Protokoll ETV 2024"), odok("WEG-Protokoll 2025"), odok("Bau- und Leistungsbeschreibung"),
];

describe("Finanzierungsobjektpaket", () => {
  it("hat sieben Pflichtunterlagen", () => {
    expect(FINANZIERUNG_PFLICHTUNTERLAGEN).toHaveLength(7);
  });

  it("zeigt den Hinweis nur Admin, Inhaber, Objektpartner und Backoffice", () => {
    for (const r of ["admin", "inhaber", "objektpartner", "backoffice"]) expect(darfObjektpaketHinweisSehen(r)).toBe(true);
    for (const r of ["vertriebspartner", "finanzierungspartner", "vertriebsleiter", "individuell", undefined]) expect(darfObjektpaketHinweisSehen(r)).toBe(false);
  });

  it("findet Objekt- und Wohnungsunterlagen zusammen und meldet die vermietete Einheit vollständig", () => {
    const w = we({ dokumente: [wdok("GBA Wohnung"), wdok("Mietvertrag WE 1_2019")] });
    const e = fehlendeFinanzierungsunterlagen(objekt(HAUS, [w]), w);
    expect(e.fehlend).toEqual([]);
    expect(e.vorhanden).toHaveLength(7);
    expect(e.vollstaendig).toBe(true);
  });

  it("verlangt den Mietvertrag nur bei Vermietung und zählt leere Fächer nicht", () => {
    const leer = we({ vermietet: false, vermietungsStatus: "leerstand", dokumente: [wdok("GBA Wohnung"), wdok("Mietvertrag", "")] });
    expect(fehlendeFinanzierungsunterlagen(objekt(HAUS, [leer]), leer).vollstaendig).toBe(true);
    const vermietet = { ...leer, vermietungsStatus: "gekuendigt" as const };
    expect(fehlendeFinanzierungsunterlagen(objekt(HAUS, [vermietet]), vermietet).fehlend).toEqual(["Mietvertrag"]);
  });

  it("braucht drei WEG-Protokolle, eine Datei mit drei Jahren reicht, ein Übergabeprotokoll nicht", () => {
    const ohne = HAUS.filter((d) => !/protokoll/i.test(d.name));
    const w = we({ vermietet: false, vermietungsStatus: "leerstand", dokumente: [wdok("Grundbuch")] });
    const zwei = fehlendeFinanzierungsunterlagen(objekt([...ohne, odok("Protokoll ETV 2024"), odok("Protokoll ETV 2025"), odok("Übergabeprotokoll")], [w]), w);
    expect(zwei.fehlend).toEqual(["WEG-Protokolle der letzten 3 Jahre"]);
    const sammel = fehlendeFinanzierungsunterlagen(objekt([...ohne, odok("WEG Protokolle 2023 2024 2025")], [w]), w);
    expect(sammel.vollstaendig).toBe(true);
  });

  it("erkennt Investagon-Dateien an der Kategorie, auch ohne Stichwort im Titel", () => {
    const o = {
      ...objekt([...HAUS.filter((d) => d.name !== "Energieausweis"), odok("EA_Scan_0815")]),
      meta: { investagonRaw: { files: [{ title: "EA_Scan_0815", category: "energy_certificate", filename: "https://example.org/ea.pdf" }] } },
    } as unknown as Pick<ObjektData, "dokumente" | "meta" | "wohnungen">;
    expect(fehlendeFinanzierungsunterlagen(o).fehlend).toEqual(["Grundbuchauszug"]);
  });

  it("fasst auf Objektebene zusammen, nennt die betroffenen Einheiten und lässt Verkauftes weg", () => {
    const a = we({ id: "a", weNr: "WE 1", dokumente: [wdok("GBA"), wdok("Mietvertrag")] });
    const b = we({ id: "b", weNr: "2", dokumente: [wdok("GBA")] });
    const verkauft = we({ id: "c", weNr: "3", status: "verkauft" });
    const e = fehlendeFinanzierungsunterlagen(objekt(HAUS.filter((d) => d.name !== "Energieausweis"), [a, b, verkauft]));
    expect(e.fehlend).toEqual(["Mietvertrag (WE 2)", "Energieausweis"]);
    expect(e.vorhanden).toHaveLength(5);
  });

  it("prüft ein Objekt ohne Einheiten nur mit seinen eigenen Dateien und ohne Mietvertrag", () => {
    const e = fehlendeFinanzierungsunterlagen(objekt([]));
    expect(e.fehlend).toHaveLength(6);
    expect(e.fehlend).not.toContain("Mietvertrag");
  });
});
