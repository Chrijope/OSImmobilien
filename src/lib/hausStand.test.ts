/**
 * Option A vom 05.10.2026: Ein Globalobjekt ist nicht mehr frei, sobald
 * mindestens eine Einheit reserviert oder verkauft ist, auch wenn die
 * Belegung am Haus noch „frei“ sagt. Geprüft wird die gemeinsame Regel
 * `hausGesamtStand` und, was die Oberfläche in `objektBelegung` daraus macht.
 */
import { describe, expect, it, vi } from "vitest";
import { HAUS_STAND_TEXT, hausFrei, hausGesamtStand } from "../../supabase/functions/_shared/haus-stand";

vi.mock("@/lib/dataCache", () => ({ cacheGet: () => [] }));

const { hausKnopfStand, hausTeilweiseHinweis, uebersichtsBelegung } = await import("@/lib/objektBelegung");

const stand = (einheitenStatus: unknown[], belegung?: unknown) => hausGesamtStand({ belegung, einheitenStatus });

describe("hausGesamtStand", () => {
  it("ist frei, solange keine Einheit belegt ist", () => {
    expect(stand(["frei", "frei", null, ""])).toBe("frei");
    expect(hausFrei(stand(["frei"]))).toBe(true);
  });

  it("ist teilweise reserviert bei 3 von 6 belegten Einheiten", () => {
    const s = stand(["reserviert", "verkauft", "Reserviert", "frei", "frei", "frei"], "frei");
    expect(s).toBe("teilweise_reserviert");
    expect(hausFrei(s)).toBe(false);
    expect(HAUS_STAND_TEXT[s]).toBe("teilweise reserviert, nicht verfügbar");
  });

  it("ist reserviert, wenn alle Einheiten reserviert oder verkauft sind", () => {
    expect(stand(["reserviert", "reserviert"])).toBe("reserviert");
    expect(stand(["reserviert", "verkauft"])).toBe("reserviert");
  });

  it("ist verkauft, wenn alle Einheiten verkauft sind", () => {
    expect(stand(["verkauft", " Verkauft "])).toBe("verkauft");
  });

  it("nimmt die Belegung am Haus vor den Einheiten", () => {
    expect(stand(["frei", "frei"], "reserviert")).toBe("reserviert");
    expect(stand(["frei", "reserviert"], "verkauft")).toBe("verkauft");
  });

  it("zählt den Status „gesetzt“ als reserviert", () => {
    expect(stand(["gesetzt", "frei"])).toBe("teilweise_reserviert");
    expect(stand(["gesetzt"])).toBe("reserviert");
  });

  it("ist bei leerer Einheitenliste frei", () => {
    expect(stand([])).toBe("frei");
    expect(stand([], "frei")).toBe("frei");
  });
});

type Einheit = { id: string; status: string };
const we = (id: string, status = "frei"): Einheit => ({ id, status });

function haus(wohnungen: Einheit[], nichtImAngebot: Einheit[] = [], teile: Record<string, unknown> = {}) {
  return { globalObjekt: true, belegung: "frei" as const, wohnungen, wohnungenNichtImAngebot: nichtImAngebot, ...teile } as Parameters<typeof uebersichtsBelegung>[0];
}

describe("objektBelegung beim teilweise reservierten Haus", () => {
  // 6 Einheiten, davon 3 belegt, eine davon nicht im Angebot (Investagon ohne CRM-Kunde).
  const teilweise = haus(
    [we("1", "reserviert"), we("2", "verkauft"), we("3"), we("4"), we("5")],
    [we("6", "reserviert")],
  );

  it("sperrt den Knopf und nennt den Grund", () => {
    expect(hausKnopfStand(teilweise, { darfReservieren: true })).toBe("teilweise");
    expect(hausTeilweiseHinweis(teilweise)).toBe("3 von 6 Einheiten sind reserviert oder verkauft. Das Haus ist deshalb nicht verfügbar.");
  });

  it("zählt auch eine belegte Einheit, die nicht im Angebot steht", () => {
    const o = haus([we("1"), we("2")], [we("3", "verkauft")]);
    expect(hausKnopfStand(o, { darfReservieren: true })).toBe("teilweise");
    expect(hausTeilweiseHinweis(o)).toBe("1 von 3 Einheiten ist reserviert oder verkauft. Das Haus ist deshalb nicht verfügbar.");
  });

  it("zeigt das Haus in der Übersicht als nicht verfügbar", () => {
    expect(uebersichtsBelegung(teilweise)).toMatchObject({ vollBelegt: true, aufdruck: "Teilweise reserviert" });
  });

  it("lässt ein freies Haus reservierbar", () => {
    const frei = haus([we("1"), we("2")]);
    expect(hausKnopfStand(frei, { darfReservieren: true })).toBe("reservierbar");
    expect(hausTeilweiseHinweis(frei)).toBeNull();
    expect(uebersichtsBelegung(frei).vollBelegt).toBe(false);
  });

  it("lässt ein reserviertes Haus beim Stand „belegt“", () => {
    const o = haus([we("1", "reserviert"), we("2")], [], { belegung: "reserviert" });
    expect(hausKnopfStand(o, { darfReservieren: true })).toBe("belegt");
    expect(hausTeilweiseHinweis(o)).toBeNull();
  });

  it("gilt nicht für Objekte, die in Einheiten verkauft werden", () => {
    const o = haus([we("1", "reserviert"), we("2")], [], { globalObjekt: false });
    expect(hausTeilweiseHinweis(o)).toBeNull();
    expect(uebersichtsBelegung(o).vollBelegt).toBe(false);
  });
});
