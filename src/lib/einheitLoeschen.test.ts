import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Der Mülleimer an einer Einheit: erst prüfen, dann fragen, dann löschen.
 * Store und Dialoge sind nachgebildet; die Regeln selbst prüfen
 * `objektSpeichernAbgleich.test.ts` und `objektSpeichern.test.ts`.
 */

const stand = vi.hoisted(() => ({
  sperre: null as string | null,
  bestaetigt: true,
  ergebnis: { geloescht: true, grund: null } as { geloescht: boolean; grund: string | null },
}));

const confirmDialog = vi.hoisted(() => vi.fn(async () => stand.bestaetigt));
const hinweisDialog = vi.hoisted(() => vi.fn(async () => undefined));
const pruefeEinheitLoeschen = vi.hoisted(() => vi.fn(async () => stand.sperre));
const deleteWohnung = vi.hoisted(() => vi.fn(async () => stand.ergebnis));

vi.mock("@/lib/confirm", () => ({ confirmDialog, hinweisDialog }));
vi.mock("@/lib/objekteStore", () => ({ pruefeEinheitLoeschen, deleteWohnung }));

const { einheitLoeschenMitRueckfrage } = await import("@/lib/einheitLoeschen");

beforeEach(() => {
  stand.sperre = null;
  stand.bestaetigt = true;
  stand.ergebnis = { geloescht: true, grund: null };
  vi.clearAllMocks();
});

describe("einheitLoeschenMitRueckfrage", () => {
  it("löscht eine freie Einheit erst nach der Rückfrage", async () => {
    expect(await einheitLoeschenMitRueckfrage("o-1", "w-2", "2")).toBe(true);

    expect(pruefeEinheitLoeschen).toHaveBeenCalledWith("w-2");
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: "Einheit „2“ löschen?",
      confirmText: "Einheit löschen",
      cancelText: "Behalten",
      variant: "destructive",
      description: expect.stringContaining("Unterlagen und Bilder werden dabei mitgelöscht"),
    }));
    expect(deleteWohnung).toHaveBeenCalledWith("o-1", "w-2");
    expect(pruefeEinheitLoeschen.mock.invocationCallOrder[0]).toBeLessThan(confirmDialog.mock.invocationCallOrder[0]);
    expect(confirmDialog.mock.invocationCallOrder[0]).toBeLessThan(deleteWohnung.mock.invocationCallOrder[0]);
    expect(hinweisDialog).not.toHaveBeenCalled();
  });

  it("zeigt bei einer gesperrten Einheit den Grund und fragt gar nicht erst", async () => {
    stand.sperre = "Einheit „2“ kann nicht gelöscht werden, weil sie reserviert ist.";

    expect(await einheitLoeschenMitRueckfrage("o-1", "w-2", "2")).toBe(false);

    expect(hinweisDialog).toHaveBeenCalledWith({
      title: "Einheit nicht gelöscht",
      description: "Einheit „2“ kann nicht gelöscht werden, weil sie reserviert ist.",
    });
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(deleteWohnung).not.toHaveBeenCalled();
  });

  it("lässt die Einheit stehen, wenn „Behalten“ gewählt wird", async () => {
    stand.bestaetigt = false;

    expect(await einheitLoeschenMitRueckfrage("o-1", "w-2", "2")).toBe(false);

    expect(deleteWohnung).not.toHaveBeenCalled();
    expect(hinweisDialog).not.toHaveBeenCalled();
  });

  it("zeigt den Grund, wenn die frische Prüfung beim Löschen ablehnt", async () => {
    // Während die Rückfrage offen war, hat jemand reserviert.
    stand.ergebnis = { geloescht: false, grund: "Einheit „2“ kann nicht gelöscht werden, weil sie reserviert ist." };

    expect(await einheitLoeschenMitRueckfrage("o-1", "w-2", "2")).toBe(false);

    expect(hinweisDialog).toHaveBeenCalledWith({
      title: "Einheit nicht gelöscht",
      description: "Einheit „2“ kann nicht gelöscht werden, weil sie reserviert ist.",
    });
  });

  it("fragt ohne Nummer allgemein", async () => {
    await einheitLoeschenMitRueckfrage("o-1", "w-2");

    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: "Einheit löschen?" }));
  });
});
