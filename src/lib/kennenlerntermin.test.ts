import { describe, it, expect, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { bestaetigeKennenlerntermin, ersterVorname } from "@/lib/kennenlerntermin";

/**
 * Die Anrede auf der Terminseite des Kennenlerngesprächs.
 *
 * Christian am 21.09.2026: Oben soll nur der Vorname stehen, nicht Vor- und
 * Nachname. Die Datenbankfunktion `bewerber_kennenlerntermin_zugang` gibt die
 * Spalte `bewerbungen.vorname` heraus, und darin steht je nach Herkunft der
 * Bewerbung auch schon einmal der ganze Name.
 */

describe("ersterVorname", () => {
  it("lässt einen einzelnen Vornamen unverändert", () => {
    expect(ersterVorname("Max")).toBe("Max");
  });

  it("schneidet den Nachnamen ab", () => {
    expect(ersterVorname("Max Mustermann")).toBe("Max");
  });

  it("lässt einen Doppelnamen mit Bindestrich ganz", () => {
    // Der wichtigste Fall: Ein Bindestrich trennt nicht, ein Leerzeichen schon.
    expect(ersterVorname("Anna-Lena")).toBe("Anna-Lena");
    expect(ersterVorname("Anna-Lena Mustermann")).toBe("Anna-Lena");
  });

  it("nimmt bei zwei Vornamen nur den ersten", () => {
    expect(ersterVorname("Karl Heinz Mustermann")).toBe("Karl");
  });

  it("verträgt überzählige Leerzeichen", () => {
    expect(ersterVorname("  Max   Mustermann  ")).toBe("Max");
  });

  it("gibt bei leerem Feld leer zurück, damit die Seite ohne Anrede grüßt", () => {
    expect(ersterVorname("")).toBe("");
    expect(ersterVorname("   ")).toBe("");
  });
});

/*
  Bis zum 29.09.2026 las der Bewerber hier, sein Termin sei trotzdem sicher und
  wir notierten ihn selbst. Bei diesem Fehler wird aber nichts gespeichert.
*/
describe("Bestätigen, wenn die Datenbankfunktion fehlt", () => {
  it("lädt zum zweiten Versuch ein und verspricht nichts weiter", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const ergebnis = await bestaetigeKennenlerntermin("tok", "2030-04-02", "10:00");
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok === false) {
      expect(ergebnis.grund).toBe("Das hat gerade nicht geklappt. Versuch es bitte gleich noch einmal.");
      expect(ergebnis.grund).not.toMatch(/notieren|sicher/);
    }
  });
});
