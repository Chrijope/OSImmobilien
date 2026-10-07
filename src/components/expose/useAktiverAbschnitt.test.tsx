import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useAktiverAbschnitt } from "./useAktiverAbschnitt";
import { EXPOSE_ABSCHNITTE, abschnittAnker } from "@/lib/exposeInhalt";

/**
 * Die Abschnittserkennung läuft über die Scroll-Position, nicht über einen
 * IntersectionObserver: aktiv ist der unterste Abschnitt, dessen Oberkante
 * über 40 Prozent der Fensterhöhe liegt. Die Begründung steht im Haken selbst.
 *
 * jsdom zeichnet nichts, jedes Rechteck wäre sonst null hoch und würde vom
 * Haken übersprungen. Deshalb werden die Rechtecke hier gestellt: Wer in
 * `obenJeAnker` steht, gilt als gezeichnet, alle übrigen bleiben ohne Höhe.
 */

const obenJeAnker = new Map<string, number>();
const echtesRechteck = Element.prototype.getBoundingClientRect;

/** Legt fest, wo die Oberkante eines Abschnitts liegt, in Pixeln. */
function setzeOberkante(id: string, oben: number) {
  obenJeAnker.set(abschnittAnker(id as never), oben);
}

function Anzeige() {
  const aktiv = useAktiverAbschnitt();
  return <span data-testid="aktiv">{aktiv}</span>;
}

/** Fensterhöhe in jsdom ist 768, die Schwelle liegt damit bei 307,2 Pixeln. */
const UEBER_DER_SCHWELLE = 100;
const UNTER_DER_SCHWELLE = 600;

beforeEach(() => {
  obenJeAnker.clear();
  for (const a of EXPOSE_ABSCHNITTE) {
    const abschnitt = document.createElement("section");
    abschnitt.id = abschnittAnker(a.id);
    document.body.appendChild(abschnitt);
  }
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const oben = obenJeAnker.get(this.id);
    if (oben === undefined) return { top: 0, height: 0 } as DOMRect;
    return { top: oben, height: 500 } as DOMRect;
  };
  // Sonst misst der Haken erst im nächsten Bild, und der Test liest zu früh.
  vi.stubGlobal("requestAnimationFrame", (rueckruf: FrameRequestCallback) => {
    rueckruf(0);
    return 0;
  });
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = echtesRechteck;
  vi.unstubAllGlobals();
  document.querySelectorAll("section").forEach((s) => s.remove());
});

describe("useAktiverAbschnitt", () => {
  it("bleibt bei „start“, solange kein Abschnitt gezeichnet ist", () => {
    render(<Anzeige />);
    expect(screen.getByTestId("aktiv")).toHaveTextContent("start");
  });

  it("meldet den untersten Abschnitt, dessen Oberkante über der Schwelle liegt", () => {
    setzeOberkante("standort", UEBER_DER_SCHWELLE);
    setzeOberkante("mikrolage", UEBER_DER_SCHWELLE + 50);
    setzeOberkante("objektdaten", UNTER_DER_SCHWELLE);
    render(<Anzeige />);
    expect(screen.getByTestId("aktiv")).toHaveTextContent("mikrolage");
  });

  it("misst beim Scrollen neu", () => {
    setzeOberkante("standort", UEBER_DER_SCHWELLE);
    setzeOberkante("mikrolage", UEBER_DER_SCHWELLE + 50);
    render(<Anzeige />);
    expect(screen.getByTestId("aktiv")).toHaveTextContent("mikrolage");

    // Nach oben gescrollt: die Mikrolage rutscht unter die Schwelle.
    setzeOberkante("mikrolage", UNTER_DER_SCHWELLE);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(screen.getByTestId("aktiv")).toHaveTextContent("standort");
  });

  it("überspringt Abschnitte ohne Ausdehnung, auch wenn sie im Bild stünden", () => {
    // „standort“ ist nicht gezeichnet und bekommt deshalb kein Rechteck.
    setzeOberkante("mikrolage", UNTER_DER_SCHWELLE);
    render(<Anzeige />);
    expect(screen.getByTestId("aktiv")).toHaveTextContent("start");
  });

  it("entfernt seine Zuhörer beim Abbau", () => {
    const entfernt = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Anzeige />);
    unmount();
    const ereignisse = entfernt.mock.calls.map((aufruf) => aufruf[0]);
    expect(ereignisse).toContain("scroll");
    expect(ereignisse).toContain("resize");
    entfernt.mockRestore();
  });
});
