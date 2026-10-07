import { describe, it, expect, vi } from "vitest";
import type { ObjektData } from "@/lib/objekteStore";
import { annahmenVorbelegen, baueExposeInhalt } from "@/lib/exposeInhalt";

/** „Exposé herunterladen“ baut seit 01.10.2026 das PDF im Design H3 (`exposeDruck`). */
const druck = vi.hoisted(() => ({ optionen: [] as Array<Record<string, unknown>> }));
vi.mock("./exposeDruck", async (original) => ({
  ...(await original<typeof import("./exposeDruck")>()),
  exposeDruckPdf: async (_i: unknown, _a: unknown, _e: unknown, optionen: Record<string, unknown>) => {
    druck.optionen.push(optionen);
    return new Blob(["pdf"], { type: "application/pdf" });
  },
}));

import { exposePdfHerunterladen } from "./exposePdfHerunterladen";

const objekt = {
  id: "o1", titel: "Wohnen an der Blau", adresse: "Söflinger Str. 203", plz: "89077", ort: "Ulm", beschreibung: "", highlights: [],
  bildUrl: "", bilder: [], dokumente: [], videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0,
  renditeVon: 0, renditeBis: 0, sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01",
  globalDaten: { gesamtQm: 0, etagen: 4, baujahr: 1954, grundstueckQm: 0, verkaufspreis: 0, qmPreis: 0, rendite: 0, jahresnettomiete: 0, hausgeldMonat: 0, kaufnebenkosten: 0, grundstueckAnteil: 0, zustand: "Neubau" },
  meta: { objektart: "neubau" },
  wohnungen: [{ id: "w7", weNr: "WE 7", etage: "0", lage: "", groesse: 65, zimmer: 3, mieteGesamt: 863, vkGesamt: 246800, qmPreis: 0, rendite: 0, vermietet: false, status: "frei" }],
} as unknown as ObjektData;

describe("exposePdfHerunterladen", () => {
  it("baut das H3-PDF mit Sprache und Investagon-Ergänzungen und bietet es als Datei an", async () => {
    const w = objekt.wohnungen[0];
    const klicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { klicks.push(this.download); });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    await exposePdfHerunterladen({
      inhalt: baueExposeInhalt({ objekt, wohnung: w, sprache: "en" }),
      annahmen: annahmenVorbelegen(objekt, w, null).annahmen,
      sprache: "en",
      zusatz: { beschreibungen: ["Balkon nach Süden"], merkmale: [] },
    });
    expect(druck.optionen[0]).toMatchObject({ sprache: "en", zusatz: { beschreibungen: ["Balkon nach Süden"] } });
    expect(klicks[0]).toMatch(/^Expose-Soeflinger-Str-203-WE-7-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
