import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { BewerberNotizDialog } from "./BewerberNotizDialog";

/**
 * Das Fenster für eine neue Notiz.
 *
 * Es speichert nicht selbst, es reicht den geputzten Text nach oben. Genau das
 * wird hier geprüft, dazu die beiden Kleinigkeiten, an denen ein Notizfenster
 * sonst ärgerlich wird: ein leerer Text darf nicht durchgehen, und beim
 * nächsten Öffnen darf der Text von vorhin nicht mehr dastehen.
 */
function Beispiel({ onSpeichern }: { onSpeichern: (text: string) => void }) {
  const [offen, setOffen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOffen(true)}>Öffnen</button>
      <BewerberNotizDialog offen={offen} onOffen={setOffen} onSpeichern={onSpeichern} />
    </>
  );
}

it("gibt den Text ohne führende und folgende Leerzeichen nach oben", () => {
  const onSpeichern = vi.fn();
  render(<Beispiel onSpeichern={onSpeichern} />);
  fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));
  fireEvent.change(screen.getByLabelText("Text der Notiz"), { target: { value: "  Ruft morgen zurück  " } });
  fireEvent.click(screen.getByRole("button", { name: "Notiz speichern" }));
  expect(onSpeichern).toHaveBeenCalledWith("Ruft morgen zurück");
});

it("lässt eine leere Notiz nicht speichern", () => {
  const onSpeichern = vi.fn();
  render(<Beispiel onSpeichern={onSpeichern} />);
  fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));
  expect(screen.getByRole("button", { name: "Notiz speichern" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Text der Notiz"), { target: { value: "   " } });
  expect(screen.getByRole("button", { name: "Notiz speichern" })).toBeDisabled();
  expect(onSpeichern).not.toHaveBeenCalled();
});

it("beginnt beim nächsten Öffnen wieder leer", () => {
  const onSpeichern = vi.fn();
  render(<Beispiel onSpeichern={onSpeichern} />);
  fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));
  fireEvent.change(screen.getByLabelText("Text der Notiz"), { target: { value: "Erster Versuch" } });
  fireEvent.click(screen.getByRole("button", { name: "Notiz speichern" }));
  fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));
  expect(screen.getByLabelText("Text der Notiz")).toHaveValue("");
});
