import { describe, it, expect, vi } from "vitest";

// Der frühere Knopf „Closing gebucht" ist entfallen. Ob ein Closing steht,
// hängt jetzt am echten Termin (Closing-Termin-Karte oder Punkt 10); alte
// Verlaufseinträge zählen für Bestandsdaten weiter.

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() }, from: vi.fn() } }));
vi.mock("@/lib/bewerbungStore", () => ({ getBewerberById: vi.fn(), updateBewerber: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { closingGebucht, countNichtErreichtVersuche, logKontaktversuch } from "./bewerberKontaktversuch";
import { getBewerberById, updateBewerber } from "./bewerbungStore";
import type { Kontaktversuch } from "./bewerbungStore";

const versuch = (ergebnis: Kontaktversuch["ergebnis"]): Kontaktversuch =>
  ({ id: "k", versuch: 1, datum: "2026-09-01T10:00:00.000Z", ergebnis, von: "Sarah" });

describe("closingGebucht", () => {
  it("ohne Termin und ohne Verlaufseintrag steht kein Closing", () => {
    expect(closingGebucht({})).toBe(false);
    expect(closingGebucht({ kontaktversuche: [versuch("nicht_erreicht")], closingTerminDatum: "" })).toBe(false);
  });

  it("ein Termin aus Karte oder Punkt 10 zählt als gebuchtes Closing", () => {
    expect(closingGebucht({ closingTerminDatum: "10.09.2026" })).toBe(true);
  });

  it("alte Verlaufseinträge des entfallenen Knopfs bleiben wirksam", () => {
    expect(closingGebucht({ kontaktversuche: [versuch("closing_gebucht")] })).toBe(true);
  });

  it("Closing-Verlaufseinträge zählen nicht als erfolglose Versuche", () => {
    expect(countNichtErreichtVersuche({ kontaktversuche: [versuch("closing_gebucht"), versuch("nicht_erreicht")] })).toBe(1);
  });
});

/*
 * ─── „Erreicht" ───
 *
 * Seit dem 17.09.2026 lässt sich auch ein geglücktes Telefonat festhalten.
 * Geprüft wird die Wirkung, weil genau sie neu entschieden wurde: Der Anruf
 * wird notiert, die Mailkette rührt sich nicht, die Stufe auch nicht, und die
 * 24-Stunden-Ruhe im Eingang fällt weg.
 */
describe("logKontaktversuch mit erreicht", () => {
  it("notiert den Anruf, ohne Mail und ohne Stufenwechsel", async () => {
    vi.mocked(getBewerberById).mockReturnValue({
      id: "b1", vorname: "Max", nachname: "Muster", email: "max@example.com",
      status: "Eingang", kontaktversuche: [], eingangHiddenUntil: "2026-09-18T10:00:00.000Z",
    } as never);
    vi.mocked(updateBewerber).mockClear();

    const { ok } = await logKontaktversuch({ bewerberId: "b1", ergebnis: "erreicht", beraterName: "Sarah" });

    expect(ok).toBe(true);
    const [, patch] = vi.mocked(updateBewerber).mock.calls[0] as [string, Record<string, unknown>];
    expect((patch.kontaktversuche as Kontaktversuch[]).at(-1)?.ergebnis).toBe("erreicht");
    // Kein Status im Patch: Die Stufe rückt nur, wenn ein Mensch sie rückt.
    expect(patch).not.toHaveProperty("status");
    // Die Ruhe im Eingang fällt weg, wer telefoniert hat, will die Akte sehen.
    expect(patch.eingangHiddenUntil).toBe("");
  });

  it("zählt nicht als erfolgloser Versuch und treibt die Mailkette nicht weiter", () => {
    expect(countNichtErreichtVersuche({ kontaktversuche: [versuch("erreicht"), versuch("nicht_erreicht")] })).toBe(1);
  });
});
