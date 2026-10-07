import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * „Exposé herunterladen“ in der Kundenansicht (Bauplan vom 23.09.2026,
 * Frage 6): eine echte PDF-Datei mit neutralen Standardannahmen, nie mit
 * Werten aus einer Selbstauskunft. Geprüft für eine Wohnung und für das
 * Globalobjekt, dessen Recheneinheit das ganze Haus ist.
 *
 * Das PDF selbst baut `exposeDruckPdf` (Design H3); hier wird geprüft, was
 * die Kundenansicht ihm übergibt.
 */
const druck = vi.hoisted(() => ({ aufrufe: [] as Array<{ inhalt: { kontakt: { vertrieb?: { name: string } } }; optionen: { sprache?: string } }> }));
vi.mock("@/lib/exposeDruck", async (original) => ({
  ...(await original<typeof import("@/lib/exposeDruck")>()),
  exposeDruckPdf: async (inhalt: never, _a: unknown, _e: unknown, optionen: never) => {
    druck.aufrufe.push({ inhalt, optionen });
    return new Blob(["pdf"], { type: "application/pdf" });
  },
}));

// Kein Netz im Test: Schrift, Logo und Bilder scheitern, das PDF entsteht trotzdem.
vi.stubGlobal("fetch", () => Promise.reject(new Error("kein Netz im Test")));

import { kundenExposeGrundlage, kundenExposePdf } from "@/lib/kundenansichtExpose";
import { STANDARD_ANNAHMEN } from "@/lib/exposeAnnahmen";
import { MUSTER_OBJEKT, MUSTER_WE7 } from "@/test/musterobjektWe7";
import type { ObjektData } from "@/lib/objekteStore";

const heute = new Date(2026, 8, 23);
const partner = { name: "Petra Partner", rolle: "Dein Ansprechpartner", email: "petra@example.org", telefon: "+49 151 1111111" };

const GLOBAL: ObjektData = {
  ...MUSTER_OBJEKT,
  globalObjekt: true,
  globalDaten: { ...MUSTER_OBJEKT.globalDaten!, verkaufspreis: 1_850_000, gesamtQm: 640, jahresnettomiete: 88_000 },
  wohnungen: MUSTER_OBJEKT.wohnungen.map((w) => ({ ...w, vkGesamt: 0, qmPreis: 0, rendite: 0 })),
};

beforeEach(() => { druck.aufrufe.length = 0; });

describe("Exposé der Kundenansicht", () => {
  it("rechnet für eine Wohnung mit Standardannahmen, ohne Selbstauskunft", () => {
    const g = kundenExposeGrundlage(MUSTER_OBJEKT, MUSTER_WE7, partner, heute);
    expect(g.inhalt.ansicht).not.toBe("objekt");
    expect(g.annahmen.zvE).toBe(STANDARD_ANNAHMEN.zvE);
    expect(g.annahmen.verheiratet).toBe(STANDARD_ANNAHMEN.verheiratet);
    expect(Object.values(g.herkunft)).not.toContain("selbstauskunft");
    expect(g.ergebnis.kauf.gesamtinvestition).toBeGreaterThan(0);
  });

  it("baut für eine Wohnung eine PDF-Datei mit dem Partner als Ansprechpartner", async () => {
    const { blob, dateiname } = await kundenExposePdf(MUSTER_OBJEKT, MUSTER_WE7, partner, heute);
    expect(blob).toBeInstanceOf(Blob);
    expect(dateiname).toMatch(/\.pdf$/);
    expect(druck.aufrufe[0].inhalt.kontakt.vertrieb?.name).toBe("Petra Partner");
  });

  /*
   * Kundensprache: Unter einem englischen Kundenlink kam das PDF bis zum
   * 25.09.2026 deutsch heraus, obwohl Knopf und Seite englisch waren.
   */
  it("baut das PDF in der Sprache der Seite, ohne Angabe deutsch", async () => {
    await kundenExposePdf(MUSTER_OBJEKT, MUSTER_WE7, partner, heute, "en");
    await kundenExposePdf(MUSTER_OBJEKT, MUSTER_WE7, partner, heute);
    expect(druck.aufrufe.map((a) => a.optionen.sprache)).toEqual(["en", "de"]);
    expect(JSON.stringify(druck.aufrufe[0].inhalt)).not.toBe(JSON.stringify(druck.aufrufe[1].inhalt));
  });

  it("baut beim Globalobjekt den Inhalt in der Sprache der Seite", () => {
    const en = kundenExposeGrundlage(GLOBAL, null, partner, heute, "en");
    const de = kundenExposeGrundlage(GLOBAL, null, partner, heute);
    expect(en.inhalt.ansicht).toBe("objekt");
    expect(JSON.stringify(en.inhalt)).not.toBe(JSON.stringify(de.inhalt));
  });

  it("rechnet beim Globalobjekt mit dem ganzen Haus und baut die PDF-Datei", async () => {
    const g = kundenExposeGrundlage(GLOBAL, null, partner, heute);
    expect(g.inhalt.ansicht).toBe("objekt");
    expect(g.inhalt.struktur).toBe("globalobjekt");
    expect(g.ergebnis.kauf.kaufpreisAngepasst).toBe(1_850_000);
    const { blob, dateiname } = await kundenExposePdf(GLOBAL, null, partner, heute);
    expect(blob).toBeInstanceOf(Blob);
    expect(dateiname).toMatch(/\.pdf$/);
  });
});
