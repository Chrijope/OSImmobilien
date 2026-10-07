import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { DatumFeld, UhrzeitFeld } from "./TerminFelder";
import { tagesknopf, uhrzeitKnopf, uhrzeitSpalte } from "./terminFelderTestHilfe";

/**
 * Die eigene Datums- und Uhrzeitauswahl der Terminseite (29.09.2026). Sie
 * ersetzt die nativen Browserfelder und liefert dieselben Werte:
 * JJJJ-MM-TT und HH:MM.
 */

function Datum({ start = "" }: { start?: string }) {
  const [wert, setWert] = useState(start);
  return (
    <>
      <label htmlFor="d">Datum</label>
      <DatumFeld id="d" wert={wert} aufWahl={setWert} />
      <output>{wert}</output>
    </>
  );
}

function Uhrzeit({ start = "" }: { start?: string }) {
  const [wert, setWert] = useState(start);
  return (
    <>
      <label htmlFor="u">Uhrzeit</label>
      <UhrzeitFeld id="u" wert={wert} aufWahl={setWert} />
      <output>{wert}</output>
    </>
  );
}

const wert = () => document.querySelector("output")!.textContent;
const kalenderOffen = () => document.querySelector("[role='grid']") !== null;
const uhrzeitOffen = () => document.querySelector("[data-uhrzeit-auswahl]") !== null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 15.04.2030, 10 Uhr in Berlin.
  vi.setSystemTime(new Date("2030-04-15T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DatumFeld", () => {
  it("zeigt TT.MM.JJJJ und setzt JJJJ-MM-TT", () => {
    render(<Datum />);
    expect(screen.getByLabelText("Datum")).toHaveTextContent("TT.MM.JJJJ");
    fireEvent.click(screen.getByLabelText("Datum"));
    fireEvent.click(tagesknopf(22));
    expect(wert()).toBe("2030-04-22");
    expect(screen.getByLabelText("Datum")).toHaveTextContent("22.04.2030");
    // Nach der Wahl geht die Auswahl zu.
    expect(kalenderOffen()).toBe(false);
  });

  it("beginnt die Woche am Montag und graut die Vergangenheit aus", () => {
    render(<Datum />);
    fireEvent.click(screen.getByLabelText("Datum"));
    const kopf = document.querySelectorAll("[role='grid'] th");
    expect(kopf[0]).toHaveAttribute("aria-label", "Montag");
    expect(tagesknopf(14)).toBeDisabled();
    expect(tagesknopf(15)).not.toBeDisabled();
    fireEvent.click(tagesknopf(14));
    expect(wert()).toBe("");
  });

  it("lässt höchstens ein Jahr voraus zu", () => {
    render(<Datum start="2031-04-10" />);
    fireEvent.click(screen.getByLabelText("Datum"));
    expect(tagesknopf(14)).not.toBeDisabled();
    expect(tagesknopf(15)).toBeDisabled();
    const vor = document.querySelector("button[name='next-month']");
    expect(vor).toHaveAttribute("aria-label", "Nächster Monat");
    expect(vor).toBeDisabled();
  });

  it("öffnet im Monat des gewählten Datums, mit ihm markiert", () => {
    render(<Datum start="2030-06-03" />);
    expect(screen.getByLabelText("Datum")).toHaveTextContent("03.06.2030");
    fireEvent.click(screen.getByLabelText("Datum"));
    expect(screen.getByText("Juni 2030")).toBeInTheDocument();
    expect(tagesknopf(3)).toHaveAttribute("aria-selected", "true");
  });
});

describe("UhrzeitFeld", () => {
  it("setzt Stunde und Minute in 5-Minuten-Schritten als HH:MM", () => {
    render(<Uhrzeit />);
    expect(screen.getByLabelText("Uhrzeit")).toHaveTextContent("HH:MM");
    fireEvent.click(screen.getByLabelText("Uhrzeit"));
    expect(Array.from(uhrzeitSpalte(1).querySelectorAll("button"), (b) => b.textContent)).toEqual(
      ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"],
    );
    expect(uhrzeitSpalte(0).querySelectorAll("button")).toHaveLength(24);
    expect(uhrzeitSpalte(0)).toHaveAttribute("aria-label", "Stunde");
    expect(uhrzeitSpalte(1)).toHaveAttribute("aria-label", "Minute");
    fireEvent.click(uhrzeitKnopf(0, "14"));
    expect(wert()).toBe("14:00");
    fireEvent.click(uhrzeitKnopf(1, "35"));
    expect(wert()).toBe("14:35");
    expect(screen.getByLabelText("Uhrzeit")).toHaveTextContent("14:35");
    // Mit der Minute ist die Zeit vollständig, die Auswahl geht zu.
    expect(uhrzeitOffen()).toBe(false);
  });

  it("merkt sich eine Minute, die vor der Stunde gewählt wurde", () => {
    render(<Uhrzeit />);
    fireEvent.click(screen.getByLabelText("Uhrzeit"));
    fireEvent.click(uhrzeitKnopf(1, "45"));
    expect(wert()).toBe("");
    fireEvent.click(uhrzeitKnopf(0, "09"));
    expect(wert()).toBe("09:45");
  });

  it("ändert beim Stundenwechsel die Minute nicht", () => {
    render(<Uhrzeit start="10:30" />);
    fireEvent.click(screen.getByLabelText("Uhrzeit"));
    expect(uhrzeitKnopf(0, "10")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(uhrzeitKnopf(0, "11"));
    expect(wert()).toBe("11:30");
  });

  it("lässt sich mit der Tastatur bedienen", () => {
    render(<Uhrzeit start="10:30" />);
    fireEvent.click(screen.getByLabelText("Uhrzeit"));
    // Der Fokus steht auf der gewählten Stunde.
    expect(uhrzeitKnopf(0, "10")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(uhrzeitKnopf(0, "11")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(uhrzeitKnopf(1, "30")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(uhrzeitKnopf(1, "25")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(uhrzeitKnopf(0, "10")).toHaveFocus();
  });
});
