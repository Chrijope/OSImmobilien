import { describe, it, expect } from "vitest";
import type { ObjektData } from "@/lib/objekteStore";
import { annahmenVorbelegen, baueExposeInhalt } from "@/lib/exposeInhalt";
import { berechneExpose } from "@/lib/exposeRechner";
import { baueDruckDaten, exposePdfDateiname } from "./daten";
import { druckFotos, ladeDruckBilder, type BildLader } from "./bilder";
import { KARO, karoPfade } from "./baukasten";

/**
 * Die Aufbereitung für die PDF-Entwürfe: dieselben Abschnitte wie die Seite,
 * beide Sprachen, und keine Zeichen, die der Hausschrift fehlen.
 */

const objekt = {
  id: "o1", titel: "Wohnen an der Blau", adresse: "Söflinger Str. 203", plz: "89077", ort: "Ulm", beschreibung: "", highlights: [],
  bildUrl: "", bilder: [], dokumente: [], videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0,
  renditeVon: 0, renditeBis: 0, sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01",
  globalDaten: { gesamtQm: 0, etagen: 4, baujahr: 1954, grundstueckQm: 0, verkaufspreis: 0, qmPreis: 0, rendite: 0, jahresnettomiete: 0, hausgeldMonat: 0, kaufnebenkosten: 0, grundstueckAnteil: 0, zustand: "Neubau" },
  meta: { objektart: "neubau" },
  wohnungen: [{ id: "w7", weNr: "WE 7", etage: "0", lage: "", groesse: 65, zimmer: 3, mieteGesamt: 863, vkGesamt: 246800, qmPreis: 0, rendite: 0, vermietet: false, status: "frei" }],
} as unknown as ObjektData;
const w = objekt.wohnungen[0];
const LEER = { fotos: [], plaene: [] };

function daten(sprache: "de" | "en", vk = 246800) {
  const wohnung = { ...w, vkGesamt: vk };
  const o = { ...objekt, wohnungen: [wohnung] } as ObjektData;
  const inhalt = baueExposeInhalt({ objekt: o, wohnung, sprache });
  const annahmen = annahmenVorbelegen(o, wohnung, null).annahmen;
  return baueDruckDaten(inhalt, annahmen, berechneExpose(inhalt.wirtschaftlichkeit.objektdaten, annahmen), LEER, { sprache });
}

describe("Druckdaten der Exposé-Entwürfe", () => {
  it("enthält Finanzen und Kontakt, ohne Kaufpreis keine Wirtschaftlichkeit", () => {
    const d = daten("de");
    expect(d.finanzen?.hoehepunkte).toHaveLength(3);
    expect(d.abschnitte.map((a) => a.id)).toContain("wirtschaftlichkeit");
    expect(d.kontakt.satz).toBeTruthy();
    const ohne = daten("de", 0);
    expect(ohne.finanzen).toBeUndefined();
    expect(ohne.abschnitte.map((a) => a.id)).not.toContain("wirtschaftlichkeit");
  });

  it("schreibt Englisch, wenn der Kunde Englisch spricht", () => {
    const d = daten("en");
    expect(d.w.inhalt).toBe("Contents");
    expect(d.finanzen?.annahmenTitel).not.toBe(daten("de").finanzen?.annahmenTitel);
  });

  it("führt Nächste Schritte und Zeitplan in einem Kapitel, mit Erklärung je Station, wie online", () => {
    const d = daten("de");
    const ids = d.abschnitte.map((a) => a.id);
    expect(ids).not.toContain("naechste-schritte");
    expect(ids.filter((id) => id === "zeitplan")).toHaveLength(1);
    expect(d.abschnitte.find((a) => a.id === "zeitplan")).toMatchObject({ titel: "Nächste Schritte und Zeitplan", claim: "Der Weg zum Eigentum" });
    expect(d).not.toHaveProperty("schritte");
    expect(d.zeitplan.erledigt.map((e) => e.titel)).toEqual(["Beratung"]);
    expect(d.zeitplan.stationen).toHaveLength(6);
    expect(d.zeitplan.stationen.every((s) => !!s.text)).toBe(true);
    expect(d.zeitplan.stationen.filter((s) => s.zahlung).map((s) => s.titel)).toEqual(["Reservierung", "Kaufpreisfälligkeit"]);
    const en = daten("en");
    expect(en.abschnitte.find((a) => a.id === "zeitplan")?.titel).toBe("Next steps and timeline");
    expect(en.zeitplan.erledigtLabel).toBe("Done");
    expect(en.zeitplan.stationen[3].text).toBe("The contract is notarised at the notary’s office, in person or by power of attorney.");
  });

  it("nutzt keine Zeichen, die in Plus Jakarta Sans fehlen", () => {
    const text = JSON.stringify(daten("de")) + JSON.stringify(daten("en"));
    expect(text).not.toMatch(/[≈✓▲→]/);
  });
});

describe("Exposé-PDF H3: Titelbild, Raster und Dateiname", () => {
  it("stellt das gesetzte Titelbild vorn, sonst bleibt das erste Foto vorn", () => {
    const fotos = [{ id: "a", url: "/a.jpg" }, { id: "titelbild", url: "/t.jpg" }, { id: "b", url: "/b.jpg" }];
    expect(druckFotos(fotos).map((f) => f.url)).toEqual(["/t.jpg", "/a.jpg", "/b.jpg"]);
    expect(druckFotos([{ id: "a", url: "/a.jpg" }, { id: "b", url: "" }]).map((f) => f.url)).toEqual(["/a.jpg"]);
  });

  it("lädt alle Fotos für die Einblicke, die großen scharf und die im Raster verkleinert (05.10.2026)", async () => {
    const bilder = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, url: `/b${i}.jpg`, alt: "", reihenfolge: i }));
    const inhalt = baueExposeInhalt({ objekt: { ...objekt, bilder }, wohnung: objekt.wohnungen[0] });
    const kanten: number[] = [];
    const lader: BildLader = {
      bild: async (_url, maxKante) => { kanten.push(maxKante); return { src: "data:", breite: 3, hoehe: 2 }; },
      pdfSeite: async () => null,
      karte: async () => null,
      logo: async () => null,
    };
    const geladen = await ladeDruckBilder(inhalt, lader);
    expect(geladen.fotos).toHaveLength(12);
    expect(kanten.slice(0, 3)).toEqual([2400, 2400, 2400]);
    expect(kanten.slice(3, 12).every((k) => k === 1200)).toBe(true);
  });

  it("zeichnet das Karo der Haus-PDFs: 16 mm, höchstens 10 Prozent, nach außen auslaufend", () => {
    expect(KARO.abstand).toBeCloseTo((16 * 72) / 25.4, 3);
    expect(KARO.linie).toBeCloseTo((0.2 * 72) / 25.4, 3);
    const pfade = karoPfade(595.28, 841.89);
    expect(pfade.length).toBeGreaterThan(3);
    for (const p of pfade) expect(p.deckkraft).toBeLessThanOrEqual(0.1);
    // Auch das flache Kapitelband bekommt Linien.
    expect(karoPfade(519, 84).length).toBeGreaterThan(0);
  });

  it("nennt die Datei nach Adresse und Einheit, ohne Personennamen", () => {
    const d = new Date(2026, 9, 1);
    const wohnung = objekt.wohnungen[0];
    const inhalt = baueExposeInhalt({ objekt, wohnung, kundeName: "Anna Muster" });
    expect(exposePdfDateiname(inhalt, d)).toBe("Expose-Soeflinger-Str-203-WE-7-2026-10-01.pdf");
  });
});
