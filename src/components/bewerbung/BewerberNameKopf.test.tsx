import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BewerberNameKopf } from "./BewerberNameKopf";

/**
 * Der Name im Kopf des Bewerberprofils.
 *
 * Der wichtigste Unterschied zu vorher ist nicht das Aussehen, sondern wann
 * geschrieben wird: früher bei jedem Tastendruck, jetzt einmal beim
 * Bestätigen. Erst dadurch kann Abbrechen überhaupt etwas verwerfen.
 */

beforeEach(() => cleanup());

describe("Anzeige", () => {
  it("zeigt den Namen als Überschrift, nicht als Eingabefeld", () => {
    render(<BewerberNameKopf vorname="Erika" nachname="Muster" darfBearbeiten onSpeichern={() => {}} />);
    expect(screen.getByRole("heading", { name: "Erika Muster" })).toBeTruthy();
    expect(screen.queryByLabelText("Vorname")).toBeNull();
  });

  it("zeigt keinen Stift ohne Bearbeitungsrecht", () => {
    render(<BewerberNameKopf vorname="Erika" nachname="Muster" darfBearbeiten={false} onSpeichern={() => {}} />);
    expect(screen.queryByLabelText("Namen bearbeiten")).toBeNull();
  });

  // Ein leerer Kopf sähe aus wie ein Ladefehler.
  it("schreibt 'Ohne Namen', wenn beide Felder leer sind", () => {
    render(<BewerberNameKopf vorname="" nachname="" darfBearbeiten onSpeichern={() => {}} />);
    expect(screen.getByRole("heading", { name: "Ohne Namen" })).toBeTruthy();
  });
});

describe("Bearbeiten", () => {
  it("öffnet die Felder erst auf den Stift", () => {
    render(<BewerberNameKopf vorname="Erika" nachname="Muster" darfBearbeiten onSpeichern={() => {}} />);
    fireEvent.click(screen.getByLabelText("Namen bearbeiten"));
    expect((screen.getByLabelText("Vorname") as HTMLInputElement).value).toBe("Erika");
    expect((screen.getByLabelText("Nachname") as HTMLInputElement).value).toBe("Muster");
  });

  it("speichert einmal beim Übernehmen, nicht bei jedem Tastendruck", () => {
    const gespeichert = vi.fn();
    render(<BewerberNameKopf vorname="Erika" nachname="Muster" darfBearbeiten onSpeichern={gespeichert} />);
    fireEvent.click(screen.getByLabelText("Namen bearbeiten"));
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Erika Maria" } });
    expect(gespeichert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Namen übernehmen"));
    expect(gespeichert).toHaveBeenCalledExactlyOnceWith("Erika Maria", "Muster");
  });

  it("verwirft die Änderung beim Abbrechen", () => {
    const gespeichert = vi.fn();
    render(<BewerberNameKopf vorname="Erika" nachname="Muster" darfBearbeiten onSpeichern={gespeichert} />);
    fireEvent.click(screen.getByLabelText("Namen bearbeiten"));
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Falsch" } });
    fireEvent.click(screen.getByLabelText("Bearbeiten abbrechen"));
    expect(gespeichert).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Erika Muster" })).toBeTruthy();
  });

  it("übernimmt mit der Eingabetaste und verwirft mit Escape", () => {
    const gespeichert = vi.fn();
    render(<BewerberNameKopf vorname="Erika" nachname="Muster" darfBearbeiten onSpeichern={gespeichert} />);
    fireEvent.click(screen.getByLabelText("Namen bearbeiten"));
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Musterfrau" } });
    fireEvent.keyDown(screen.getByLabelText("Nachname"), { key: "Enter" });
    expect(gespeichert).toHaveBeenCalledExactlyOnceWith("Erika", "Musterfrau");

    cleanup();
    gespeichert.mockClear();
    render(<BewerberNameKopf vorname="Erika" nachname="Muster" darfBearbeiten onSpeichern={gespeichert} />);
    fireEvent.click(screen.getByLabelText("Namen bearbeiten"));
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Egal" } });
    fireEvent.keyDown(screen.getByLabelText("Nachname"), { key: "Escape" });
    expect(gespeichert).not.toHaveBeenCalled();
  });

  it("entfernt Leerzeichen an den Rändern", () => {
    const gespeichert = vi.fn();
    render(<BewerberNameKopf vorname="Erika" nachname="Muster" darfBearbeiten onSpeichern={gespeichert} />);
    fireEvent.click(screen.getByLabelText("Namen bearbeiten"));
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "  Erika  " } });
    fireEvent.click(screen.getByLabelText("Namen übernehmen"));
    expect(gespeichert).toHaveBeenCalledExactlyOnceWith("Erika", "Muster");
  });

  /*
   * Der Fall, der in einer Liste mit Vorschau leicht passiert: Jemand fängt an
   * zu tippen und klickt dann einen anderen Bewerber an. Der halb getippte
   * Name darf nicht auf den nächsten übergehen.
   */
  it("verwirft den Entwurf, wenn ein anderer Bewerber geladen wird", () => {
    const { rerender } = render(
      <BewerberNameKopf vorname="Erika" nachname="Muster" darfBearbeiten onSpeichern={() => {}} />,
    );
    fireEvent.click(screen.getByLabelText("Namen bearbeiten"));
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Halbfertig" } });
    rerender(<BewerberNameKopf vorname="Max" nachname="Beispiel" darfBearbeiten onSpeichern={() => {}} />);
    expect(screen.getByRole("heading", { name: "Max Beispiel" })).toBeTruthy();
    expect(screen.queryByDisplayValue("Halbfertig")).toBeNull();
  });
});
