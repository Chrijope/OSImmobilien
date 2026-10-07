import { describe, it, expect } from "vitest";
import { bilderListe, MAX_OBJEKT_BILDER } from "@/lib/objektDatenPflicht";

/**
 * Die Bilder eines Kaufvorgangs liegen in einem JSON-Datensatz am Investment.
 * Was von dort kommt, kann alles Mögliche sein: eine Liste, ein einzelner
 * Eintrag aus der Zeit vor dem 22.09.2026, leere Zeichenketten aus einem
 * abgebrochenen Hochladen oder gar nichts.
 *
 * `bilderListe` macht daraus eine Liste, auf die sich Dialog, Karte und
 * Kundenportal verlassen können. Das erste Bild ist überall das Titelbild.
 */
describe("Die Bilderliste eines Kaufvorgangs", () => {
  it("nimmt das einzelne Bild älterer Vorgänge nach vorne", () => {
    // Vor dem 22.09.2026 gab es nur `bildUrl`. Ohne diesen Rückfall stünde
    // eine gepflegte Wohnung plötzlich ohne Bild da.
    expect(bilderListe(undefined, "https://example.org/a.jpg")).toEqual(["https://example.org/a.jpg"]);
  });

  it("stellt das Titelbild voran, wenn die Liste es noch nicht führt", () => {
    const liste = bilderListe(["https://example.org/b.jpg"], "https://example.org/a.jpg");
    expect(liste).toEqual(["https://example.org/a.jpg", "https://example.org/b.jpg"]);
  });

  it("lässt die Reihenfolge in Ruhe, wenn das Titelbild schon vorne steht", () => {
    const vorhanden = ["https://example.org/a.jpg", "https://example.org/b.jpg"];
    expect(bilderListe(vorhanden, "https://example.org/a.jpg")).toEqual(vorhanden);
  });

  it("wirft Doppelte weg", () => {
    // Sonst zeigt das Durchklicken in der Karte zweimal dasselbe Zimmer.
    const liste = bilderListe(["https://example.org/a.jpg", "https://example.org/a.jpg"]);
    expect(liste).toEqual(["https://example.org/a.jpg"]);
  });

  it("überspringt Leeres und alles, was kein Text ist", () => {
    // Ein abgebrochenes Hochladen hinterlässt schon einmal einen leeren Eintrag.
    expect(bilderListe(["", "  ", null, 7, "https://example.org/a.jpg"])).toEqual(["https://example.org/a.jpg"]);
  });

  it("hält die Obergrenze ein", () => {
    const viele = Array.from({ length: 9 }, (_, i) => `https://example.org/${i}.jpg`);
    expect(bilderListe(viele)).toHaveLength(MAX_OBJEKT_BILDER);
  });

  it("kommt mit allem zurecht, was aus einem JSON-Feld kommen kann", () => {
    expect(bilderListe(undefined)).toEqual([]);
    expect(bilderListe(null)).toEqual([]);
    expect(bilderListe("kein Feld")).toEqual([]);
    expect(bilderListe({ a: 1 })).toEqual([]);
  });
});
