/**
 * Der Wizard von „Partner werden“ im Browser: Weg wählen, Bereich, die Fragen
 * dieses Wegs, Pflichtfelder am Ende, und ohne Einwilligung geht nichts hinaus.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import PartnerWizard from "./PartnerWizard";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function klick(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  act(() => {
    vi.advanceTimersByTime(250);
  });
}

describe("PartnerWizard", () => {
  it("Portfolio-Weg: ohne Bereichswahl zu Team und Einheiten, am Ende die Pflichtfelder", () => {
    vi.useFakeTimers();
    const netz = vi.spyOn(globalThis, "fetch");
    render(<PartnerWizard onZurueckZurSeite={() => {}} />);

    expect(screen.getByRole("heading", { name: "Wie möchtest du mit uns arbeiten?" })).toBeTruthy();
    klick(/Portfolio-Partner/);
    expect(screen.getByRole("heading", { name: "Wie viele Vertriebler sind bei euch aktiv?" })).toBeTruthy();
    klick(/2 bis 5/);
    expect(screen.getByRole("heading", { name: /Einheiten/ })).toBeTruthy();
    klick(/10 bis 50/);
    expect(screen.getByRole("heading", { name: /im Haus eine Erlaubnis/ })).toBeTruthy();
    klick(/In Vorbereitung/);
    klick(/In Bayern/);
    klick(/Gerne sofort/);

    expect(screen.getByRole("heading", { name: "Wie erreichen wir dich?" })).toBeTruthy();
    expect(screen.getByText(/Schritt 7/).parentElement?.textContent).toContain("Schritt 7 von 7");
    fireEvent.click(screen.getByRole("button", { name: /Jetzt Partner werden/ }));
    expect(screen.getByText("Bitte gib deinen Vornamen an.")).toBeTruthy();
    expect(screen.getByText(/Handynummer an/)).toBeTruthy();
    expect(screen.getByText(/bestätige die Einwilligung/)).toBeTruthy();
    expect(netz).not.toHaveBeenCalled();
  });

  it("zeigt bei vorgewähltem Weg die Wahl und bietet Weiter an", () => {
    render(<PartnerWizard startWeg="portfolio" onZurueckZurSeite={() => {}} />);
    expect(screen.getByRole("button", { name: /Portfolio-Partner/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Weiter/ }));
    expect(screen.getByRole("heading", { name: "Wie viele Vertriebler sind bei euch aktiv?" })).toBeTruthy();
  });

  it("Tippgeber: Bereich mit Hinweis zur Erlaubnis, danach keine Frage nach der Erlaubnis", () => {
    vi.useFakeTimers();
    render(<PartnerWizard onZurueckZurSeite={() => {}} />);
    klick(/Tippgeber/);
    expect(screen.getByRole("heading", { name: "Aus welchem Bereich kommst du?" })).toBeTruthy();
    expect(screen.getByText(/reine Weitergabe eines Kontakts/)).toBeTruthy();
    klick(/Finanzberatung/);
    expect(screen.getByRole("heading", { name: /Wie viele Kunden/ })).toBeTruthy();
    klick(/Unter 100/);
    expect(screen.getByRole("heading", { name: /nach Immobilien/ })).toBeTruthy();
    expect(screen.queryByText(/34c/)).toBeNull();
  });

  it("Vertriebspartner fragt zuerst nach der Erlaubnis nach § 34c", () => {
    vi.useFakeTimers();
    render(<PartnerWizard onZurueckZurSeite={() => {}} />);
    klick(/Vertriebspartner/);
    klick(/Versicherung/);
    expect(screen.getByRole("heading", { name: /34c GewO/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /In Vorbereitung/ })).toBeTruthy();
  });
});
