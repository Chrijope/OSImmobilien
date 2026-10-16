import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StufenTerminDialog } from "./StufenTerminDialog";

/*
 * Das Fenster beim Setzen von Besichtigung oder Termin Bankgutachter
 * (16.10.2026): Pflicht sind Datum und Uhrzeit, Abbrechen setzt nichts.
 */
describe("StufenTerminDialog", () => {
  it("speichert ohne Datum und Uhrzeit nichts und sagt, was fehlt", async () => {
    const onSpeichern = vi.fn(async () => null);
    render(<StufenTerminDialog stufe="besichtigung" kundeName="Erika Muster" onAbbrechen={() => {}} onSpeichern={onSpeichern} />);
    expect(screen.getByText("Besichtigung eintragen")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bitte ein Datum angeben.");
    expect(onSpeichern).not.toHaveBeenCalled();
  });

  it("Abbrechen ruft nur onAbbrechen", () => {
    const onSpeichern = vi.fn(async () => null);
    const onAbbrechen = vi.fn();
    render(<StufenTerminDialog stufe="bankgutachter" onAbbrechen={onAbbrechen} onSpeichern={onSpeichern} />);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onAbbrechen).toHaveBeenCalledTimes(1);
    expect(onSpeichern).not.toHaveBeenCalled();
  });

  it("gibt die Eingabe weiter und zeigt eine Fehlermeldung des Speicherns an", async () => {
    const onSpeichern = vi.fn(async () => "Diese Zeit ist bereits vergeben");
    render(<StufenTerminDialog stufe="bankgutachter" onAbbrechen={() => {}} onSpeichern={onSpeichern} />);
    fireEvent.change(screen.getByLabelText("Datum *"), { target: { value: "2099-01-15" } });
    fireEvent.change(screen.getByLabelText("Uhrzeit *"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Ort (optional)"), { target: { value: "Objekt" } });
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));
    await waitFor(() => expect(onSpeichern).toHaveBeenCalledWith({ datum: "2099-01-15", uhrzeit: "10:00", ort: "Objekt", notiz: "" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Diese Zeit ist bereits vergeben");
  });

  it("ist ohne Stufe geschlossen", () => {
    const { container } = render(<StufenTerminDialog stufe={null} onAbbrechen={() => {}} onSpeichern={async () => null} />);
    expect(container.textContent).toBe("");
    expect(screen.queryByText(/eintragen/)).toBeNull();
  });
});
