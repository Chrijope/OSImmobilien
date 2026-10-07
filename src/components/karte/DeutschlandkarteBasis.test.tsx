import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { DeutschlandkarteBasis, type KartenPunkt } from "./DeutschlandkarteBasis";

/**
 * Die Marketingkarte blinkte (bis 05.10.2026): Jede neu gebaute Punkteliste,
 * auch mit unveraendertem Inhalt, entfernte alle Marker und blendete sie neu
 * ein. Seitdem gleicht die Karte ab: gleicher Inhalt, gleiche Marker.
 */

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

const FARBEN = { kunde: "#22c55e", objekt: "#f59e0b" };
// Weit auseinander, damit nichts zu einem Kreis zusammengefasst wird.
const HAMBURG: KartenPunkt = { id: "a", name: "Punkt A", lat: 53.55, lng: 9.99, typ: "kunde", details: "Hamburg" };
const MUENCHEN: KartenPunkt = { id: "b", name: "Punkt B", lat: 48.14, lng: 11.58, typ: "kunde", details: "München" };
const DRESDEN: KartenPunkt = { id: "c", name: "Punkt C", lat: 51.05, lng: 13.74, typ: "objekt", details: "Dresden" };

/** Nur die Datenpunkte, nicht die Ortsmarken der Landeshauptstaedte. */
const marker = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLElement>(".leaflet-marker-icon")).filter((el) => el.innerHTML.includes("width:14px"));

describe("DeutschlandkarteBasis zeichnet nur bei echter Datenänderung neu", () => {
  it("behält die Marker bei einer neuen Liste mit gleichem Inhalt", () => {
    const { container, rerender } = render(<DeutschlandkarteBasis punkte={[HAMBURG, MUENCHEN]} farben={FARBEN} />);
    const vorher = marker(container);
    expect(vorher).toHaveLength(2);
    // Neue Liste, neue Objekte, andere Reihenfolge, gleicher Inhalt.
    rerender(<DeutschlandkarteBasis punkte={[{ ...MUENCHEN }, { ...HAMBURG }]} farben={{ ...FARBEN }} />);
    const nachher = marker(container);
    expect(nachher).toHaveLength(2);
    for (const el of vorher) expect(nachher).toContain(el);
  });

  it("fügt bei einem neuen Punkt nur diesen hinzu und lässt die übrigen stehen", () => {
    const { container, rerender } = render(<DeutschlandkarteBasis punkte={[HAMBURG, MUENCHEN]} farben={FARBEN} />);
    const vorher = marker(container);
    rerender(<DeutschlandkarteBasis punkte={[HAMBURG, MUENCHEN, DRESDEN]} farben={FARBEN} />);
    const nachher = marker(container);
    expect(nachher).toHaveLength(3);
    for (const el of vorher) expect(nachher).toContain(el);
  });

  it("ersetzt einen Punkt, dessen Lage sich ändert, und entfernt einen weggefallenen", () => {
    const { container, rerender } = render(<DeutschlandkarteBasis punkte={[HAMBURG, MUENCHEN]} farben={FARBEN} />);
    const [a, b] = marker(container);
    rerender(<DeutschlandkarteBasis punkte={[{ ...HAMBURG, lat: 53.0, lng: 8.8 }]} farben={FARBEN} />);
    const nachher = marker(container);
    expect(nachher).toHaveLength(1);
    expect(nachher).not.toContain(a);
    expect(nachher).not.toContain(b);
  });
});
