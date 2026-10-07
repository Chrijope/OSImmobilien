import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * Die Buchungsstrecke des persönlichen Gesprächs.
 *
 * Zwei Dinge werden hier bewacht. Erstens die Startansicht: Wer aus der
 * Einladungsmail kommt, soll nicht unvermittelt in einem Monatsraster landen,
 * sondern zuerst lesen, worum es geht und wie lange es dauert. Zweitens der
 * zweite Besuch: Wer schon gebucht hat, sieht seinen Termin und kann ihn
 * verschieben oder absagen, statt versehentlich ein zweites Mal zu buchen.
 */

vi.mock("@/lib/confirm", () => ({ confirmDialog: vi.fn(async () => false) }));

let zugang: unknown = null;
const freieZeiten: string[] = ["2026-10-05T08:00:00Z"];
vi.mock("@/lib/bewerberTerminStore", () => ({
  ladeBewerberTerminZugang: vi.fn(async () => zugang),
  ladeBewerberFreieZeiten: vi.fn(async () => freieZeiten),
  bucheBewerberTermin: vi.fn(async () => null),
  verschiebeBewerberTermin: vi.fn(async () => true),
  sageBewerberTerminAb: vi.fn(async () => true),
}));

vi.mock("react-router-dom", () => ({ useParams: () => ({ token: "tok-42" }) }));

import BewerberKooperationsgespraech from "./BewerberKooperationsgespraech";

/** Der Zugang, wie `bewerber_termin_zugang` ihn liefert, bereits gelesen. */
function offenerZugang(teil: Record<string, unknown> = {}) {
  return {
    gastgeber: { name: "Sarah Kaiser-Thom", email: null, telefon: null, bild: null, position: null },
    zeitzone: "Europe/Berlin",
    dauerMinuten: 45,
    bezeichnung: "Bewerbergespräch",
    beschreibung: null,
    vorausschauTage: 30,
    buchbar: true,
    buchung: null,
    ...teil,
  };
}

beforeEach(() => {
  zugang = null;
});

describe("Die Startseite vor dem Kalender", () => {
  it("zeigt zuerst worum es geht, wie lange es dauert und was ihn erwartet", async () => {
    zugang = offenerZugang();
    render(<BewerberKooperationsgespraech />);

    expect(await screen.findByText(/Dein persönliches Gespräch/)).toBeInTheDocument();
    expect(screen.getByText(/45 Minuten/)).toBeInTheDocument();
    expect(screen.getByText(/Sarah Kaiser-Thom/)).toBeInTheDocument();
    expect(screen.getByText(/Nichts entschieden/)).toBeInTheDocument();
    // Der Kalender kommt erst nach dem Knopf.
    expect(screen.queryByLabelText("Nächster Monat")).not.toBeInTheDocument();
  });

  it("führt über genau einen Knopf in den Kalender", async () => {
    zugang = offenerZugang();
    render(<BewerberKooperationsgespraech />);

    fireEvent.click(await screen.findByRole("button", { name: /Zeit aussuchen/ }));
    await waitFor(() => expect(screen.getByLabelText("Nächster Monat")).toBeInTheDocument());
    expect(screen.getByText(/Such dir deine Zeit aus/)).toBeInTheDocument();
  });

  it("sperrt den Weg in den Kalender, solange die Angaben nicht abgesendet sind", async () => {
    zugang = offenerZugang({ buchbar: false });
    render(<BewerberKooperationsgespraech />);
    expect(await screen.findByRole("button", { name: /Zeit aussuchen/ })).toBeDisabled();
  });

  /*
   * Ohne die Migration 20260906120000 oder ohne Wochenplan gibt es keinen
   * Zugang. Die Seite darf dann nicht abstürzen, sondern nennt den Weg, den es
   * sicher gibt.
   */
  it("stürzt nicht ab, wenn es gerade keinen Kalender gibt", async () => {
    zugang = null;
    render(<BewerberKooperationsgespraech />);
    expect(await screen.findByText(/Gerade geht das hier nicht/)).toBeInTheDocument();
    expect(screen.getByText(/os@os-immobilien.com/)).toBeInTheDocument();
  });
});

describe("Der zweite Besuch, wenn der Termin schon steht", () => {
  const MIT_TERMIN = offenerZugang({
    buchung: {
      id: "bu-1",
      startAt: "2026-10-05T08:00:00Z",
      endeAt: "2026-10-05T08:45:00Z",
      dauerMinuten: 45,
      status: "offen",
      bezeichnung: "Bewerbergespräch",
      raumToken: null,
    },
  });

  it("zeigt den Termin statt der Terminwahl", async () => {
    zugang = MIT_TERMIN;
    render(<BewerberKooperationsgespraech />);

    expect(await screen.findByText(/Dein Termin steht schon/)).toBeInTheDocument();
    // Kein zweiter Buchungsweg: Weder Startseite noch Kalender stehen hier.
    expect(screen.queryByRole("button", { name: /Zeit aussuchen/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nächster Monat")).not.toBeInTheDocument();
  });

  it("bietet Verschieben und Absagen an", async () => {
    zugang = MIT_TERMIN;
    render(<BewerberKooperationsgespraech />);

    expect(await screen.findByRole("button", { name: "Termin verschieben" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Termin absagen" })).toBeInTheDocument();
  });

  it("öffnet zum Verschieben den Kalender, ohne die Startseite dazwischen", async () => {
    zugang = MIT_TERMIN;
    render(<BewerberKooperationsgespraech />);

    fireEvent.click(await screen.findByRole("button", { name: "Termin verschieben" }));
    await waitFor(() => expect(screen.getByText(/Such dir eine neue Zeit aus/)).toBeInTheDocument());
    expect(screen.getByText(/wird die alte frei/)).toBeInTheDocument();
  });
});
