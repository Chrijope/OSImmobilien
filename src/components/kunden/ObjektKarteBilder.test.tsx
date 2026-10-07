import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObjektKarteBlock } from "./FreieWohnungenCard";
import { objektKarteDaten, type ObjektKarteDaten } from "@/lib/objektKarte";

/**
 * Die Bildleiste der Objektkarte im Kundenprofil.
 *
 * Christian am 22.09.2026: Ein Kaufvorgang trägt jetzt mehrere Bilder, und in
 * der Karte soll man rechts und links durchklicken können, statt nur das
 * Titelbild zu sehen.
 *
 * Geprüft wird das Blättern, nicht das Aussehen: dass die Pfeile nur bei
 * mehreren Bildern erscheinen, dass sie im Kreis laufen und dass ein
 * Kaufvorgang aus der Zeit vor der Liste weiterhin sein einzelnes Bild zeigt.
 */

const BILDER = ["https://example.org/a.jpg", "https://example.org/b.jpg", "https://example.org/c.jpg"];

/*
  Die Karte wird aus derselben Funktion gebaut wie im Kundenprofil. Ein von
  Hand zusammengestelltes Objekt ginge schief: Die Übersicht darunter liest
  `karte.daten` und würde ohne sie beim Rendern stehen bleiben.
*/
function karte(eigeneBilder: string[], eigenesBild = ""): ObjektKarteDaten {
  return objektKarteDaten({
    investment: { strasse: "Roonstraße 3", plz: "95028", ort: "Hof", weNr: "6", kaufpreis: 189000 },
    erstelltAm: "2026-08-01T09:00:00.000Z",
    eigenesBild,
    eigeneBilder,
  });
}

function zeige(daten: ObjektKarteDaten) {
  return render(<ObjektKarteBlock karte={daten} investagon={false} aktionen={null} />);
}

/** Das gerade gezeigte Bild. */
const angezeigt = () => (screen.getByAltText("Roonstraße 3") as HTMLImageElement).getAttribute("src");

describe("Die Bilder in der Objektkarte", () => {
  it("blättert vorwärts und rückwärts", () => {
    zeige(karte(BILDER, BILDER[0]));
    expect(angezeigt()).toBe(BILDER[0]);

    fireEvent.click(screen.getByRole("button", { name: "Nächstes Bild" }));
    expect(angezeigt()).toBe(BILDER[1]);

    fireEvent.click(screen.getByRole("button", { name: "Vorheriges Bild" }));
    expect(angezeigt()).toBe(BILDER[0]);
  });

  it("läuft im Kreis, statt am Ende stehen zu bleiben", () => {
    // Ein Pfeil, der plötzlich nichts mehr tut, sieht nach einem Fehler aus.
    zeige(karte(BILDER, BILDER[0]));

    fireEvent.click(screen.getByRole("button", { name: "Vorheriges Bild" }));
    expect(angezeigt()).toBe(BILDER[2]);

    fireEvent.click(screen.getByRole("button", { name: "Nächstes Bild" }));
    expect(angezeigt()).toBe(BILDER[0]);
  });

  it("springt über die Punkte direkt zu einem Bild", () => {
    zeige(karte(BILDER, BILDER[0]));

    fireEvent.click(screen.getByRole("button", { name: "Bild 3 von 3" }));

    expect(angezeigt()).toBe(BILDER[2]);
  });

  it("zeigt keine Pfeile, wenn es nur ein Bild gibt", () => {
    zeige(karte([BILDER[0]], BILDER[0]));

    expect(screen.queryByRole("button", { name: "Nächstes Bild" })).toBeNull();
    expect(angezeigt()).toBe(BILDER[0]);
  });

  it("zeigt das einzelne Bild älterer Kaufvorgänge", () => {
    // Vor dem 22.09.2026 gab es nur `bildUrl`, die Liste blieb leer.
    zeige(karte([], BILDER[0]));

    expect(angezeigt()).toBe(BILDER[0]);
    expect(screen.queryByRole("button", { name: "Nächstes Bild" })).toBeNull();
  });

  it("zeigt ohne jedes Bild den Platzhalter statt eines leeren Rahmens", () => {
    const { container } = zeige(karte([]));

    expect(screen.queryByAltText("Roonstraße 3")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
