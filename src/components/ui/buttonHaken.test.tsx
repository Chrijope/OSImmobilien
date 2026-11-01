import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./button";
import { meldeSpeicherErgebnis } from "@/lib/speicherSignal";

describe("Haken im Speichern-Knopf", () => {
  it("zeigt den Haken nach einer Erfolgsmeldung", () => {
    render(<Button onClick={() => meldeSpeicherErgebnis("ok")}>Speichern</Button>);
    act(() => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("button").textContent).toContain("Gespeichert");
  });

  it("bleibt bei einem Fehler, wie er ist", () => {
    render(<Button onClick={() => meldeSpeicherErgebnis("fehler")}>Speichern</Button>);
    act(() => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("button").textContent).toBe("Speichern");
  });

  it("reagiert nicht bei anderen Knöpfen", () => {
    render(<Button onClick={() => meldeSpeicherErgebnis("ok")}>Abbrechen</Button>);
    act(() => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("button").textContent).toBe("Abbrechen");
  });

  it("wartet mit haken auf ein Versprechen, das true liefert", async () => {
    render(<Button haken onClick={async () => true}>Sichern</Button>);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("button").textContent).toContain("Gespeichert");
  });
});
