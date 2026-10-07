import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PortalObjektBilder } from "./PortalObjektBilder";

/**
 * Die Bildleiste im Kundenportal.
 *
 * Christian am 22.09.2026: Der Kunde soll alle Bilder sehen und selbst
 * durchblättern, nicht nur das Titelbild.
 *
 * Im Portal sitzt der Kunde davor und kann nichts richten. Deshalb prüft der
 * letzte Test, dass ein nicht mehr erreichbares Bild übersprungen wird, statt
 * einen leeren Rahmen zu hinterlassen.
 */

const BILDER = ["https://example.org/a.jpg", "https://example.org/b.jpg", "https://example.org/c.jpg"];

const TEXTE = {
  vorheriges: "Vorheriges Bild",
  naechstes: "Nächstes Bild",
  bildNr: (nr: number, gesamt: number) => `Bild ${nr} von ${gesamt}`,
};

const zeige = (bilder: string[]) =>
  render(<PortalObjektBilder bilder={bilder} alt="Roonstraße 3" texte={TEXTE} />);

const angezeigt = () => (screen.getByAltText("Roonstraße 3") as HTMLImageElement).getAttribute("src");

describe("Die Bildleiste im Kundenportal", () => {
  it("blättert vorwärts und rückwärts", () => {
    zeige(BILDER);
    expect(angezeigt()).toBe(BILDER[0]);

    fireEvent.click(screen.getByRole("button", { name: "Nächstes Bild" }));
    expect(angezeigt()).toBe(BILDER[1]);

    fireEvent.click(screen.getByRole("button", { name: "Vorheriges Bild" }));
    expect(angezeigt()).toBe(BILDER[0]);
  });

  it("läuft im Kreis", () => {
    zeige(BILDER);

    fireEvent.click(screen.getByRole("button", { name: "Vorheriges Bild" }));

    expect(angezeigt()).toBe(BILDER[2]);
  });

  it("springt über die Punkte direkt zu einem Bild", () => {
    zeige(BILDER);

    fireEvent.click(screen.getByRole("button", { name: "Bild 2 von 3" }));

    expect(angezeigt()).toBe(BILDER[1]);
  });

  it("zeigt bei einem einzigen Bild keine Pfeile", () => {
    zeige([BILDER[0]]);

    expect(screen.queryByRole("button", { name: "Nächstes Bild" })).toBeNull();
    expect(angezeigt()).toBe(BILDER[0]);
  });

  it("zeigt ohne Bild gar nichts, statt eines leeren Rahmens", () => {
    const { container } = zeige([]);

    expect(container.firstChild).toBeNull();
  });

  it("überspringt ein Bild, das nicht mehr erreichbar ist", () => {
    zeige(BILDER);

    // Der Browser meldet das fehlende Bild über `onError`.
    fireEvent.error(screen.getByAltText("Roonstraße 3"));

    expect(angezeigt()).toBe(BILDER[1]);
    // Aus dreien sind zwei geworden, die Punkte zählen entsprechend mit.
    expect(screen.getByRole("button", { name: "Bild 2 von 2" })).toBeTruthy();
  });
});
