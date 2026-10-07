import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Die Follow-up-Karte im Reiter Übersicht: Lesemodus mit Datum, Uhrzeit und
// vollem Text für alle Rollen, Bearbeiten öffnet das Formular, und der
// Rückruf aus der Bedenkzeit erscheint in derselben Karte.

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { FollowUpCard } from "./FollowUpCard";
import type { Bewerber } from "@/lib/bewerbungStore";

function bewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return { id: "b-1", vorname: "Max", nachname: "Muster", status: "FollowUp", ...teil } as Bewerber;
}

const onSave = vi.fn();
const onZumClosing = vi.fn();

beforeEach(() => {
  onSave.mockClear();
  onZumClosing.mockClear();
});

const renderKarte = (b: Bewerber, canEdit = true) =>
  render(<FollowUpCard b={b} canEdit={canEdit} onSave={onSave} onZumClosing={onZumClosing} />);

describe("FollowUpCard", () => {
  it("ohne Follow-up zeigt sie der HR-Managerin direkt das Formular", () => {
    renderKarte(bewerber());
    expect(screen.getByTestId("follow-up-formular")).toBeInTheDocument();
    expect(screen.queryByTestId("follow-up-lesemodus")).not.toBeInTheDocument();
    expect(screen.getByText(/Follow-Up \(optional\)/)).toBeInTheDocument();
  });

  it("mit Follow-up zeigt sie Datum, Uhrzeit und den vollen Text im Lesemodus, auch mit Bearbeitungsrecht", () => {
    renderKarte(bewerber({
      followUpDatum: "09.09.2026", followUpUhrzeit: "10:00",
      followUpNotiz: "Rücksprache mit Partnerin abwarten.\nZwei Exposés mitschicken.",
    }));
    const lese = screen.getByTestId("follow-up-lesemodus");
    expect(lese).toHaveTextContent("09.09.2026 · 10:00 Uhr");
    expect(lese).toHaveTextContent("Rücksprache mit Partnerin abwarten.");
    expect(lese).toHaveTextContent("Zwei Exposés mitschicken.");
    expect(screen.queryByTestId("follow-up-formular")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bearbeiten/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entfernen/ })).toBeInTheDocument();
  });

  it("ohne Bearbeitungsrecht gibt es den Lesemodus ohne Knöpfe", () => {
    renderKarte(bewerber({ followUpDatum: "09.09.2026", followUpNotiz: "Text" }), false);
    expect(screen.getByTestId("follow-up-lesemodus")).toHaveTextContent("Text");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("Bearbeiten öffnet das Formular mit den bisherigen Werten, Speichern schreibt die drei Felder", () => {
    renderKarte(bewerber({ followUpDatum: "2026-09-09", followUpUhrzeit: "10:00", followUpNotiz: "Alt" }));
    fireEvent.click(screen.getByRole("button", { name: /Bearbeiten/ }));
    expect(screen.getByTestId("follow-up-formular")).toBeInTheDocument();
    expect(screen.getByLabelText("Uhrzeit (optional)")).toHaveValue("10:00");
    fireEvent.change(screen.getByLabelText("Notiz (optional)"), { target: { value: "Neu" } });
    fireEvent.click(screen.getByRole("button", { name: /Follow-Up speichern/ }));
    expect(onSave).toHaveBeenCalledWith({ followUpDatum: "2026-09-09", followUpUhrzeit: "10:00", followUpNotiz: "Neu" });
  });

  it("Abbrechen verwirft die Änderung und kehrt in den Lesemodus zurück", () => {
    renderKarte(bewerber({ followUpDatum: "09.09.2026", followUpNotiz: "Alt" }));
    fireEvent.click(screen.getByRole("button", { name: /Bearbeiten/ }));
    fireEvent.change(screen.getByLabelText("Notiz (optional)"), { target: { value: "Neu" } });
    fireEvent.click(screen.getByRole("button", { name: /Abbrechen/ }));
    expect(screen.getByTestId("follow-up-lesemodus")).toHaveTextContent("Alt");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Entfernen leert die drei Felder", () => {
    renderKarte(bewerber({ followUpDatum: "09.09.2026", followUpNotiz: "Alt" }));
    fireEvent.click(screen.getByRole("button", { name: /Entfernen/ }));
    expect(onSave).toHaveBeenCalledWith({ followUpDatum: "", followUpUhrzeit: "", followUpNotiz: "" });
  });

  it("der Bedenkzeit-Rückruf erscheint in derselben Karte mit Kanal, Erinnerung und Vorbereitung", () => {
    renderKarte(bewerber({
      status: "Bedenkzeit", closingEntscheidung: "bedenkzeit",
      bedenkzeitRueckrufAm: "09.09.2026", bedenkzeitRueckrufUhrzeit: "10:00",
      bedenkzeitKanal: "telefon", bedenkzeitErinnerungTage: 1,
      bedenkzeitVorbereitung: "Zwei Bestandsobjekte als Exposé mitschicken.",
    }));
    const lese = screen.getByTestId("bedenkzeit-lesemodus");
    expect(lese).toHaveTextContent("Rückruf (Bedenkzeit) 09.09.2026 · 10:00 Uhr");
    expect(lese).toHaveTextContent("Telefon · Erinnerung 1 Tag vorher");
    expect(lese).toHaveTextContent("Zwei Bestandsobjekte als Exposé mitschicken.");
    expect(screen.queryByTestId("follow-up-lesemodus")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bearbeiten/ }));
    expect(onZumClosing).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Follow-up und Bedenkzeit-Rückruf stehen nebeneinander, jeder mit eigenem Bearbeiten", () => {
    renderKarte(bewerber({
      followUpDatum: "20.08.2026", followUpNotiz: "Erst nachhaken",
      status: "Bedenkzeit", closingEntscheidung: "bedenkzeit", bedenkzeitRueckrufAm: "09.09.2026",
    }));
    expect(screen.getByTestId("follow-up-lesemodus")).toBeInTheDocument();
    expect(screen.getByTestId("bedenkzeit-lesemodus")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Bearbeiten/ })).toHaveLength(2);
  });

  it("nach der Entscheidung verschwindet der Rückruf aus der Karte", () => {
    renderKarte(bewerber({ status: "Paketwahl", closingEntscheidung: "ja", bedenkzeitRueckrufAm: "09.09.2026" }));
    expect(screen.queryByTestId("bedenkzeit-lesemodus")).not.toBeInTheDocument();
    expect(screen.getByTestId("follow-up-formular")).toBeInTheDocument();
  });
});
