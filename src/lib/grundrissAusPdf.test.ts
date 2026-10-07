import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * „Grundriss aus PDF übernehmen“: Name, Ablage, Speichern über die
 * Store-Funktionen und dass die Erkennung den neuen Plan der richtigen
 * Einheit zuordnet, im internen Exposé wie im Kundenlink.
 */

const store = vi.hoisted(() => ({
  addDokument: vi.fn(async () => true),
  removeDokument: vi.fn(async () => true),
  addWohnungTabellenDokument: vi.fn(async () => true),
  removeWohnungTabellenDokument: vi.fn(async () => true),
  getObjektById: vi.fn(),
}));
vi.mock("@/lib/objekteStore", async (orig) => ({ ...(await orig<typeof import("@/lib/objekteStore")>()), ...store }));
const ablage = vi.hoisted(() => ({ objektDateiAblegen: vi.fn() }));
vi.mock("@/lib/storage", async (orig) => ({ ...(await orig<typeof import("@/lib/storage")>()), ...ablage }));

const {
  grundrissAblagePfad, grundrissAusPdfSpeichern, grundrissName, grundrissUebernahmeFuer, naechsteNummer, uebernommeneGrundrisse,
} = await import("./grundrissAusPdf");
const { eimerFuerObjektDatei } = await import("@/lib/storage");
const { grundrisseFuerExpose } = await import("@/lib/exposeInhalt");
const { kundenGrundrisse } = await import("../../supabase/functions/get-expose/unterlagen");

const MEDIEN = "https://abc.supabase.co/storage/v1/object/public/objekt-medien";
const einheit = (id: string, weNr: string, dokumente: ObjektWohnung["dokumente"] = []) =>
  ({ id, weNr, etage: "", lage: "", groesse: 60, zimmer: 2, mieteGesamt: 0, vkGesamt: 0, qmPreis: 0, rendite: 0, vermietet: false, status: "frei", dokumente }) as ObjektWohnung;

beforeEach(() => {
  vi.clearAllMocks();
  ablage.objektDateiAblegen.mockImplementation(async (pfad: string) => (pfad.includes("/dokumente/") ? `/objekt-dokument/${pfad}` : `${MEDIEN}/${pfad}`));
});

describe("Name und Ablage", () => {
  it("nennt den Plan nach der Einheit oder dem Haus, zusätzliche mit Nummer", () => {
    expect(grundrissName({ art: "einheit", wohnungId: "w7", weNr: "WE 07" })).toBe("Grundriss WE 7");
    expect(grundrissName({ art: "einheit", wohnungId: "w", weNr: "2. OG links" })).toBe("Grundriss 2. OG links");
    expect(grundrissName({ art: "haus" })).toBe("Grundriss Haus");
    const ziel = { art: "einheit" as const, wohnungId: "w7", weNr: "7" };
    expect(naechsteNummer(ziel, [{ id: "a", name: "Grundriss WE 7" }])).toBe(2);
    expect(naechsteNummer(ziel, [{ id: "a", name: "Grundriss WE 7" }, { id: "b", name: "Grundriss WE 7 (2)" }])).toBe(3);
  });

  it("legt den Plan einer Einheit wie einen von Hand hochgeladenen Grundriss ab, den Hausplan geschützt", () => {
    const einheitPfad = grundrissAblagePfad("o1", { art: "einheit", wohnungId: "w7", weNr: "7" }, "png", 123);
    expect(einheitPfad).toBe("objekte/o1/wohnungen/w7/wd2_grundriss-aus-pdf-123.png");
    // Derselbe Eimer wie der Grundriss „wd2“ aus der Objektanlage.
    expect(eimerFuerObjektDatei(einheitPfad)).toBe("objekt-medien");
    const hausPfad = grundrissAblagePfad("o1", { art: "haus" }, "jpg", 123);
    expect(hausPfad).toBe("objekte/o1/dokumente/grundriss-aus-pdf-haus-123.jpg");
    expect(eimerFuerObjektDatei(hausPfad)).toBe("objekt-dokumente");
  });

  it("listet für die Auswahl alle Einheiten des Hauses, auch die nicht im Angebot, sortiert", () => {
    const objekt = { id: "o1", wohnungen: [einheit("w10", "WE 10"), einheit("w2", "WE 2")], wohnungenNichtImAngebot: [einheit("w5", "WE 5")] } as unknown as ObjektData;
    expect(grundrissUebernahmeFuer(objekt, "w2")).toEqual({ objektId: "o1", wohnungId: "w2", einheiten: [{ id: "w2", weNr: "WE 2" }, { id: "w5", weNr: "WE 5" }, { id: "w10", weNr: "WE 10" }] });
  });
});

describe("Speichern über die Store-Funktionen", () => {
  const bild = { blob: new Blob(["png"], { type: "image/png" }), endung: "png" as const };

  it("trägt den Plan einer Einheit als Zeile in wohnungs_dokumente ein, mit Name und Kategorie", async () => {
    const ergebnis = await grundrissAusPdfSpeichern({ objektId: "o1", ziel: { art: "einheit", wohnungId: "w7", weNr: "WE 7" }, bild, name: "Grundriss WE 7", stempel: 5 });
    expect(ergebnis).toEqual({ ok: true, name: "Grundriss WE 7" });
    expect(ablage.objektDateiAblegen).toHaveBeenCalledWith("objekte/o1/wohnungen/w7/wd2_grundriss-aus-pdf-5.png", bild.blob, "image/png");
    expect(store.addWohnungTabellenDokument).toHaveBeenCalledWith("w7", expect.objectContaining({
      name: "Grundriss WE 7", kategorie: "wohnungsunterlagen", url: `${MEDIEN}/objekte/o1/wohnungen/w7/wd2_grundriss-aus-pdf-5.png`,
    }));
    expect(store.addDokument).not.toHaveBeenCalled();
  });

  it("trägt den Hausplan über addDokument als sichtbare Objektunterlage ein", async () => {
    await grundrissAusPdfSpeichern({ objektId: "o1", ziel: { art: "haus" }, bild: { ...bild, endung: "jpg" }, name: "Grundriss Haus", stempel: 5 });
    expect(ablage.objektDateiAblegen).toHaveBeenCalledWith("objekte/o1/dokumente/grundriss-aus-pdf-haus-5.jpg", bild.blob, "image/jpeg");
    expect(store.addDokument).toHaveBeenCalledWith("o1", expect.objectContaining({
      name: "Grundriss Haus", kategorie: "objektunterlagen", typ: "custom", sichtbar: true, url: "/objekt-dokument/objekte/o1/dokumente/grundriss-aus-pdf-haus-5.jpg",
    }));
  });

  it("entfernt beim Ersetzen den alten Plan erst, wenn der neue steht", async () => {
    const reihenfolge: string[] = [];
    store.addWohnungTabellenDokument.mockImplementationOnce(async () => { reihenfolge.push("neu"); return true; });
    store.removeWohnungTabellenDokument.mockImplementationOnce(async () => { reihenfolge.push("alt weg"); return true; });
    await grundrissAusPdfSpeichern({ objektId: "o1", ziel: { art: "einheit", wohnungId: "w7", weNr: "7" }, bild, name: "Grundriss WE 7", ersetzen: [{ id: "alt", name: "Grundriss WE 7" }] });
    expect(reihenfolge).toEqual(["neu", "alt weg"]);
    expect(store.removeWohnungTabellenDokument).toHaveBeenCalledWith("alt");
  });

  it("lässt den alten Plan stehen, wenn der neue nicht gespeichert werden konnte", async () => {
    store.addWohnungTabellenDokument.mockResolvedValueOnce(false);
    const ergebnis = await grundrissAusPdfSpeichern({ objektId: "o1", ziel: { art: "einheit", wohnungId: "w7", weNr: "7" }, bild, name: "Grundriss WE 7", ersetzen: [{ id: "alt", name: "Grundriss WE 7" }] });
    expect(ergebnis.ok).toBe(false);
    expect(store.removeWohnungTabellenDokument).not.toHaveBeenCalled();
    ablage.objektDateiAblegen.mockResolvedValueOnce(null);
    expect((await grundrissAusPdfSpeichern({ objektId: "o1", ziel: { art: "haus" }, bild, name: "Grundriss Haus" })).ok).toBe(false);
    expect(store.addDokument).not.toHaveBeenCalled();
  });
});

describe("Die Erkennung findet den übernommenen Plan bei der richtigen Einheit", () => {
  const planUrl = `${MEDIEN}/objekte/o1/wohnungen/w7/wd2_grundriss-aus-pdf-5.png`;
  const hausUrl = "/objekt-dokument/objekte/o1/dokumente/grundriss-aus-pdf-haus-5.png";
  const objekt = {
    id: "o1", titel: "Haus", adresse: "Weg 1", plz: "86150", ort: "Augsburg", meta: {},
    dokumente: [
      { id: "te", name: "Teilungserklärung", url: "/objekt-dokument/objekte/o1/dokumente/te.pdf", typ: "custom", kategorie: "objektunterlagen", sichtbar: true },
      { id: "haus", name: "Grundriss Haus", url: hausUrl, typ: "custom", kategorie: "objektunterlagen", sichtbar: true },
    ],
    wohnungen: [
      einheit("w7", "WE 7", [{ id: "plan7", name: "Grundriss WE 7", url: planUrl, kategorie: "wohnungsunterlagen", ausTabelle: true }]),
      einheit("w8", "WE 8"),
    ],
  } as unknown as ObjektData;

  it("zeigt WE 7 ihren Plan, WE 8 den Hausplan als gekennzeichneten Ersatz und dem Objekt-Exposé den Hausplan", () => {
    expect(grundrisseFuerExpose(objekt, objekt.wohnungen[0]).map((p) => [p.id, p.ersatz])).toEqual([["plan7", undefined]]);
    expect(grundrisseFuerExpose(objekt, objekt.wohnungen[1]).map((p) => [p.id, p.ersatz])).toEqual([["haus", "hausplan"]]);
    expect(grundrisseFuerExpose(objekt, null).map((p) => p.id)).toEqual(["haus"]);
  });

  it("gibt denselben Plan im Kundenlink heraus, nur mit Ablage, nie mit Adresse", () => {
    const zeile = { id: "plan7", wohnung_id: "w7", name: "Grundriss WE 7", url: planUrl, kategorie: "wohnungsunterlagen" };
    const liste = kundenGrundrisse({ objektRoh: {}, objektZeilen: [], wohnung: { id: "w7", weNr: "WE 7", roh: {}, zeilen: [zeile] } });
    expect(liste.map((g) => [g.id, g.bereich, g.istBild, g.ablage.eimer])).toEqual([["plan7", "wohnung", true, "objekt-medien"]]);
    // WE 8 bekommt den Plan von WE 7 nicht.
    expect(kundenGrundrisse({ objektRoh: {}, objektZeilen: [], wohnung: { id: "w8", weNr: "WE 8", roh: {}, zeilen: [] } })).toEqual([]);
  });

  it("übergeht eine veraltete Kopie in meta.dokumente, damit „Ersetzen“ den alten Plan nicht zurückbringt", async () => {
    // Die Objektanlage kopiert beim Speichern auch Tabellenzeilen nach `meta.dokumente`.
    const { dbRowToObjekt } = await import("@/lib/objekteStore");
    const kopie = { id: "plan-alt", name: "Grundriss WE 7", url: `${MEDIEN}/objekte/o1/wohnungen/w7/wd2_grundriss-aus-pdf-1.png`, kategorie: "wohnungsunterlagen" };
    const handGrundriss = { id: "wd2", name: "Grundriss", url: `${MEDIEN}/objekte/o1/wohnungen/w7/wd2_plan.png`, kategorie: "wohnungsunterlagen" };
    const gelesen = dbRowToObjekt({ id: "o1", meta: {} }, [], [], [{ id: "w7", objekt_id: "o1", we_nr: "WE 7", meta: { dokumente: [kopie, handGrundriss] } }], [], false);
    expect(gelesen.wohnungen[0].dokumente?.map((d) => d.id)).toEqual(["wd2"]);
    const server = kundenGrundrisse({ objektRoh: {}, objektZeilen: [], wohnung: { id: "w7", weNr: "WE 7", roh: {}, zeilen: [], metaEintraege: [kopie] } });
    expect(server).toEqual([]);
  });

  it("erkennt die übernommenen Pläne am Kennzeichen im Dateinamen", () => {
    expect(uebernommeneGrundrisse(objekt, { art: "einheit", wohnungId: "w7", weNr: "7" })).toEqual([{ id: "plan7", name: "Grundriss WE 7" }]);
    expect(uebernommeneGrundrisse(objekt, { art: "einheit", wohnungId: "w8", weNr: "8" })).toEqual([]);
    expect(uebernommeneGrundrisse(objekt, { art: "haus" })).toEqual([{ id: "haus", name: "Grundriss Haus" }]);
  });
});
