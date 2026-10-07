import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// jsdom 20 kennt keine Zeigerereignisse. Mit der Mausklasse als Ersatz kommen
// clientX und pointerId beim Wischen an, mehr braucht die Komponente nicht.
if (typeof window.PointerEvent === "undefined") {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

import { AkademieWahrFalsch } from "./AkademieWahrFalsch";
import type { AkademieWahrFalschAufgabe } from "@/lib/vertriebsakademieAufgabenTypen";
import { mischeMitSaat } from "./AufgabenHelfer";

const AUFGABE: AkademieWahrFalschAufgabe = {
  id: "test-wahrfalsch",
  typ: "wahrfalsch",
  titel: "Umlagefähig oder nicht",
  karten: [
    { aussage: "Grundsteuer", stimmt: true, aufloesung: "Sie steht in der Betriebskostenverordnung." },
    { aussage: "Hausverwaltung", stimmt: false, aufloesung: "Verwaltungskosten trägt der Eigentümer." },
    { aussage: "Müllabfuhr", stimmt: true, aufloesung: "Klassische Betriebskosten." },
  ],
};

/** Die Karten erscheinen gemischt, der Test folgt derselben Saat. */
const REIHENFOLGE = mischeMitSaat(AUFGABE.karten, AUFGABE.id);

function zeige(onFertig = vi.fn()) {
  render(<AkademieWahrFalsch aufgabe={AUFGABE} geloest={false} versuche={0} onFertig={onFertig} />);
  return onFertig;
}

/** Wartet das Hinausfliegen der Karte ab. */
function flugAbwarten() {
  act(() => { vi.advanceTimersByTime(400); });
}

describe("Wisch-Stapel über die Knöpfe", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("zeigt die oberste Karte mit Zähler und blendet nach dem Tippen die Auflösung ein", () => {
    zeige();
    expect(screen.getByText("Karte 1 von 3")).toBeInTheDocument();
    expect(screen.getByText(REIHENFOLGE[0].aussage)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Stimmt$/ }));
    flugAbwarten();

    expect(screen.getByText("Karte 2 von 3")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(REIHENFOLGE[0].aufloesung))).toBeInTheDocument();
    expect(screen.getByText(REIHENFOLGE[0].stimmt ? "Richtig." : "Noch nicht.")).toBeInTheDocument();
  });

  it("meldet gelöst, wenn alle Karten richtig lagen", () => {
    const onFertig = zeige();
    for (const karte of REIHENFOLGE) {
      fireEvent.click(screen.getByRole("button", { name: karte.stimmt ? /^Stimmt$/ : /Stimmt nicht/ }));
      flugAbwarten();
    }
    expect(onFertig).toHaveBeenCalledTimes(1);
    expect(onFertig).toHaveBeenCalledWith(true);
    expect(screen.getByText(/3 von 3 richtig/)).toBeInTheDocument();
  });

  it("meldet nicht gelöst bei einem Fehler und zeigt die Bilanz", () => {
    const onFertig = zeige();
    REIHENFOLGE.forEach((karte, i) => {
      // Die erste Karte absichtlich falsch, der Rest richtig.
      const antwort = i === 0 ? !karte.stimmt : karte.stimmt;
      fireEvent.click(screen.getByRole("button", { name: antwort ? /^Stimmt$/ : /Stimmt nicht/ }));
      flugAbwarten();
    });
    expect(onFertig).toHaveBeenCalledWith(false);
    expect(screen.getByText(/2 von 3 richtig/)).toBeInTheDocument();
  });

  it("nimmt während des Hinausfliegens keine zweite Antwort an", () => {
    const onFertig = zeige();
    fireEvent.click(screen.getByRole("button", { name: /^Stimmt$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stimmt$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stimmt$/ }));
    flugAbwarten();
    expect(screen.getByText("Karte 2 von 3")).toBeInTheDocument();
    expect(onFertig).not.toHaveBeenCalled();
  });
});

describe("Wisch-Stapel per Wischen", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function karte() {
    return screen.getByRole("group", { name: /Aussage:/ });
  }

  it("wertet einen Wisch nach rechts als Stimmt", () => {
    zeige();
    const erste = REIHENFOLGE[0];
    fireEvent.pointerDown(karte(), { clientX: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(karte(), { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(karte(), { clientX: 260, pointerId: 1 });
    flugAbwarten();
    expect(screen.getByText("Karte 2 von 3")).toBeInTheDocument();
    expect(screen.getByText(erste.stimmt ? "Richtig." : "Noch nicht.")).toBeInTheDocument();
  });

  it("wertet einen Wisch nach links als Stimmt nicht", () => {
    zeige();
    const erste = REIHENFOLGE[0];
    fireEvent.pointerDown(karte(), { clientX: 300, pointerId: 1, button: 0 });
    fireEvent.pointerMove(karte(), { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(karte(), { clientX: 150, pointerId: 1 });
    flugAbwarten();
    expect(screen.getByText("Karte 2 von 3")).toBeInTheDocument();
    expect(screen.getByText(!erste.stimmt ? "Richtig." : "Noch nicht.")).toBeInTheDocument();
  });

  it("lässt eine zu kurze Bewegung zurückspringen, ohne zu werten", () => {
    zeige();
    fireEvent.pointerDown(karte(), { clientX: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(karte(), { clientX: 130, pointerId: 1 });
    fireEvent.pointerUp(karte(), { clientX: 130, pointerId: 1 });
    flugAbwarten();
    expect(screen.getByText("Karte 1 von 3")).toBeInTheDocument();
  });

  it("nimmt auch die Pfeiltasten", () => {
    zeige();
    fireEvent.keyDown(karte(), { key: "ArrowRight" });
    flugAbwarten();
    expect(screen.getByText("Karte 2 von 3")).toBeInTheDocument();
  });
});
