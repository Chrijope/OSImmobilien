import { describe, it, expect } from "vitest";
import { kundenAnschrift, anschriftZeile } from "./kundenAnschrift";

/** Musterdaten, keine echten Personen. */
const SA_ADRESSE = { strasse: "Musterweg", hausnummer: "1", plz: "80331", ort: "München" };
const inv = (saData: Record<string, unknown> | null) => ({
  id: "i1", erstellt_am: "2026-09-01T00:00:00Z", meta: { saData },
});

describe("kundenAnschrift für die Marketingkarte", () => {
  it("nimmt die Anschrift am Kontakt, wenn dort PLZ oder Ort steht", () => {
    const a = kundenAnschrift({ strasse: "Am Kontakt", hausnummer: "2", plz: "20095", ort: "Hamburg" }, [inv(SA_ADRESSE)]);
    expect(a).toMatchObject({ quelle: "kontakt", ort: "Hamburg" });
  });

  it("nimmt die Anschrift aus der Selbstauskunft, wenn am Kontakt keine steht", () => {
    const a = kundenAnschrift({ strasse: "", plz: "", ort: " " }, [inv({ ...SA_ADRESSE, abgeschlossen: true })]);
    expect(a).toMatchObject({ quelle: "selbstauskunft", plz: "80331", ort: "München" });
    expect(anschriftZeile(a!)).toBe("Musterweg 1 80331 München");
  });

  it("liest auch den Snapshot und nimmt die neueste Selbstauskunft", () => {
    const alt = { id: "alt", erstellt_am: "2026-01-01T00:00:00Z", meta: { saSnapshot: { ...SA_ADRESSE, ort: "Alt", abgeschlossenAm: "2026-01-02T00:00:00Z" } } };
    const neu = { id: "neu", erstellt_am: "2026-02-01T00:00:00Z", meta: { saData: { ...SA_ADRESSE, ort: "Neu", abgeschlossenAm: "2026-09-02T00:00:00Z" } } };
    expect(kundenAnschrift({}, [alt, neu])?.ort).toBe("Neu");
    expect(kundenAnschrift({}, [alt])?.ort).toBe("Alt");
  });

  it("übernimmt keine unbestätigte Vorbelegung aus einem anderen Investment", () => {
    const vorbelegt = inv({ ...SA_ADRESSE, vorbelegung: { offeneAbschnitte: ["person"] } });
    expect(kundenAnschrift({}, [vorbelegt])).toBeNull();
  });

  it("liefert ohne jede Anschrift nichts", () => {
    expect(kundenAnschrift({}, [])).toBeNull();
    expect(kundenAnschrift({}, [inv({ strasse: "Nur Straße" })])).toBeNull();
  });
});
