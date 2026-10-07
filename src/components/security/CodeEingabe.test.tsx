import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import { CodeEingabe } from "./CodeEingabe";

/**
 * Die Codeeingabe der Zwei-Faktor-Anmeldung: nur Ziffern, Einfügen füllt alle
 * Felder, genau ein automatisches Absenden, nach einem Fehler leer und fokussiert.
 */

afterEach(cleanup);

function Aufbau({ onVollstaendig, beschaeftigt = false, fehler = 0 }: { onVollstaendig?: () => void; beschaeftigt?: boolean; fehler?: number }) {
  const [code, setCode] = useState("");
  return (
    <>
      <CodeEingabe
        value={code}
        onChange={setCode}
        onVollstaendig={onVollstaendig}
        beschaeftigt={beschaeftigt}
        fehler={fehler}
        label="Code aus der App"
      />
      <output data-testid="stand">{code}</output>
    </>
  );
}

const feld = () => screen.getByLabelText("Code aus der App") as HTMLInputElement;
const stand = () => screen.getByTestId("stand").textContent;

describe("CodeEingabe", () => {
  it("ist für das Handy eingerichtet: Ziffernblock und Code-Autofill", () => {
    render(<Aufbau />);
    expect(feld()).toHaveAttribute("inputmode", "numeric");
    expect(feld()).toHaveAttribute("autocomplete", "one-time-code");
    expect(feld()).toHaveAttribute("maxlength", "6");
  });

  it("nimmt nur Ziffern an", () => {
    render(<Aufbau />);
    fireEvent.change(feld(), { target: { value: "12a" } });
    expect(stand()).toBe("");
    fireEvent.change(feld(), { target: { value: "123" } });
    expect(stand()).toBe("123");
  });

  it("füllt beim Einfügen alle Felder, auch mit Leerzeichen im Code", () => {
    render(<Aufbau />);
    fireEvent.paste(feld(), { clipboardData: { getData: () => "123 456" } });
    expect(stand()).toBe("123456");
  });

  it("sendet nach der sechsten Ziffer genau einmal ab", () => {
    const absenden = vi.fn();
    const { rerender } = render(<Aufbau onVollstaendig={absenden} />);
    fireEvent.change(feld(), { target: { value: "12345" } });
    expect(absenden).not.toHaveBeenCalled();
    fireEvent.change(feld(), { target: { value: "123456" } });
    expect(absenden).toHaveBeenCalledTimes(1);

    // Prüfung läuft und endet, der Code steht noch: kein zweites Absenden.
    rerender(<Aufbau onVollstaendig={absenden} beschaeftigt />);
    rerender(<Aufbau onVollstaendig={absenden} />);
    expect(absenden).toHaveBeenCalledTimes(1);
  });

  it("sendet ohne onVollstaendig nichts von selbst ab", () => {
    render(<Aufbau />);
    fireEvent.change(feld(), { target: { value: "123456" } });
    expect(stand()).toBe("123456");
  });

  it("leert nach einem Fehler alle Felder und setzt den Fokus zurück", () => {
    const absenden = vi.fn();
    const { rerender } = render(<Aufbau onVollstaendig={absenden} />);
    fireEvent.change(feld(), { target: { value: "000000" } });
    expect(absenden).toHaveBeenCalledTimes(1);
    feld().blur();

    act(() => { rerender(<Aufbau onVollstaendig={absenden} fehler={1} />); });
    expect(stand()).toBe("");
    expect(document.activeElement).toBe(feld());

    // Derselbe Code noch einmal wird wieder abgesendet.
    fireEvent.change(feld(), { target: { value: "000000" } });
    expect(absenden).toHaveBeenCalledTimes(2);
  });

  it("sperrt die Eingabe während der Prüfung", () => {
    render(<Aufbau beschaeftigt />);
    expect(feld()).toBeDisabled();
    expect(feld()).toHaveAttribute("aria-busy", "true");
  });
});
