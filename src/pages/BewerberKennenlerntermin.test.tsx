import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type React from "react";

/*
 * Der Kalender steht seit dem 26.09.2026 hinter einer Zwei-Klick-Lösung
 * (`ZweiKlickEinbettung`, eigener Test). Hier geht es um die Adresse und den
 * Ablauf, deshalb rendert die Attrappe die Einbettung sofort.
 */
vi.mock("@/components/cookie/ZweiKlickEinbettung", () => ({
  ZweiKlickEinbettung: ({ children }: { children: React.ReactNode }) => children,
}));

/**
 * Die Terminseite des Kennenlerngesprächs.
 *
 * Christian hat sie am 21.09.2026 in Auftrag gegeben: links der eingebettete
 * Kalender, rechts die Bestätigung der gebuchten Zeit durch den Bewerber. Damit
 * muss die HR-Managerin den Termin nicht mehr nachtragen. Am selben Tag kam der
 * Umbau auf das dunkle Haus-Design dazu, gleiche Bauart wie die Terminseite des
 * Vertriebspartners, und die Kalenderadresse wanderte aus dem Quelltext ins
 * Profil der zuständigen Person.
 *
 * Geprüft wird vor allem, was auf einer öffentlichen Seite schiefgehen darf und
 * was nicht: Der richtige Kalender muss kommen, nichts darf erzwungen werden,
 * eine fehlende Adresse darf keinen leeren Rahmen hinterlassen, und ein
 * unbekanntes Token darf nichts verraten.
 */

let standAntwort: unknown = null;
const bestaetigungen: Array<{ token: string; datum: string; uhrzeit: string }> = [];
let bestaetigungErgebnis: unknown = { ok: true };

vi.mock("@/lib/kennenlerntermin", () => ({
  ladeKennenlerntermin: vi.fn(async () => standAntwort),
  bestaetigeKennenlerntermin: vi.fn(async (token: string, datum: string, uhrzeit: string) => {
    bestaetigungen.push({ token, datum, uhrzeit });
    return bestaetigungErgebnis;
  }),
}));

import BewerberKennenlerntermin from "./BewerberKennenlerntermin";

function zeichne(token = "tok1") {
  return render(
    <MemoryRouter initialEntries={[`/kennenlerngespraech/${token}`]}>
      <Routes>
        <Route path="/kennenlerngespraech/:token" element={<BewerberKennenlerntermin />} />
      </Routes>
    </MemoryRouter>,
  );
}

const KALENDER = "https://calendly.com/jana-kirchner/kennenlernen";
const OFFEN = { vorname: "Max", datum: "", uhrzeit: "", quelle: "", kalender: KALENDER };

beforeEach(() => {
  standAntwort = OFFEN;
  bestaetigungen.length = 0;
  bestaetigungErgebnis = { ok: true };
});

describe("Kalender und Bestätigung stehen nebeneinander", () => {
  it("zeigt den Kalender und daneben die Bestätigung", async () => {
    zeichne();

    await screen.findByText(/Zeit im Kalender aussuchen/);
    expect(screen.getByText(/Gebuchte Zeit bestätigen/)).toBeInTheDocument();
    expect(screen.getByTitle("Termin aussuchen")).toBeInTheDocument();
  });

  it("spricht den Bewerber mit Vornamen an", async () => {
    zeichne();

    expect(await screen.findByText(/Max, such dir eine Zeit aus/)).toBeInTheDocument();
  });

  it("sagt, dass die Bestätigung freiwillig ist", async () => {
    /*
      Ein Pflichtfeld hinter einer bereits erfolgten Buchung lässt Leute
      glauben, die Buchung sei nicht durchgegangen, und sie buchen ein zweites
      Mal.
    */
    zeichne();

    expect(await screen.findByText(/steht auch ohne diesen Schritt/)).toBeInTheDocument();
  });
});

describe("Die Kalenderadresse kommt aus dem Profil der zuständigen Person", () => {
  it("bettet genau den Kalender ein, den die Datenbank nennt", async () => {
    zeichne();

    const rahmen = await screen.findByTitle("Termin aussuchen");
    expect(rahmen.getAttribute("src")).toContain(KALENDER);
    // Der Zustimmungsbanner von Calendly bleibt weg, die Seite steckt ja schon
    // in unserer eigenen.
    expect(rahmen.getAttribute("src")).toContain("hide_gdpr_banner=1");
  });

  it("sagt es, statt einen leeren Rahmen zu zeigen, wenn keine hinterlegt ist", async () => {
    standAntwort = { ...OFFEN, kalender: "" };
    zeichne();

    expect(await screen.findByText(/Kalender ist gerade nicht erreichbar/)).toBeInTheDocument();
    expect(screen.queryByTitle("Termin aussuchen")).not.toBeInTheDocument();
    // Wer über einen anderen Weg schon gebucht hat, soll die Zeit trotzdem
    // eintragen können.
    expect(screen.getByLabelText("Datum")).toBeInTheDocument();
  });

  it("fällt auf die bisherige feste Adresse zurück, solange die Migration fehlt", async () => {
    /*
      Fehlt das Feld ganz, kennt die Datenbankfunktion es noch nicht. Der
      Bewerber soll in dieser Zwischenzeit buchen können.
    */
    standAntwort = { ...OFFEN, kalender: null };
    zeichne();

    const rahmen = await screen.findByTitle("Termin aussuchen");
    expect(rahmen.getAttribute("src")).toMatch(/^https:\/\/calendly\.com\//);
  });

  it("zeigt einen Knopf statt eines toten Rahmens, wenn der Dienst kein Einbetten erlaubt", async () => {
    // Fantastical setzt `frame-ancestors 'self'`. Heute nutzt die zuständige
    // Person Calendly, aber das kann wechseln.
    standAntwort = { ...OFFEN, kalender: "https://fantastical.app/jana/kennenlernen" };
    zeichne();

    expect(await screen.findByRole("button", { name: /Kalender öffnen/ })).toBeInTheDocument();
    expect(screen.queryByTitle("Termin aussuchen")).not.toBeInTheDocument();
  });
});

describe("Die Bestätigung", () => {
  it("schickt Datum und Uhrzeit mit dem Token ab", async () => {
    zeichne("tok1");
    await screen.findByLabelText("Datum");

    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("Uhrzeit"), { target: { value: "10:30" } });
    fireEvent.click(screen.getByRole("button", { name: /Termin bestätigen/ }));

    await waitFor(() => expect(bestaetigungen).toHaveLength(1));
    expect(bestaetigungen[0]).toEqual({ token: "tok1", datum: "2026-09-30", uhrzeit: "10:30" });
  });

  it("lässt den Knopf ruhen, solange ein Wert fehlt", async () => {
    zeichne();
    await screen.findByLabelText("Datum");

    expect(screen.getByRole("button", { name: /Termin bestätigen/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-09-30" } });
    expect(screen.getByRole("button", { name: /Termin bestätigen/ })).toBeDisabled();
  });

  it("zeigt danach den bestätigten Termin im Klartext", async () => {
    zeichne();
    await screen.findByLabelText("Datum");

    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("Uhrzeit"), { target: { value: "10:30" } });
    fireEvent.click(screen.getByRole("button", { name: /Termin bestätigen/ }));

    expect(await screen.findByText("Termin steht")).toBeInTheDocument();
    expect(screen.getByText(/30\. September 2026, 10:30 Uhr/)).toBeInTheDocument();
  });

  it("meldet einen abgelehnten Termin verständlich und bleibt in der Eingabe", async () => {
    bestaetigungErgebnis = { ok: false, grund: "Der Termin liegt in der Vergangenheit. Bitte prüf das Datum." };
    zeichne();
    await screen.findByLabelText("Datum");

    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("Uhrzeit"), { target: { value: "10:30" } });
    fireEvent.click(screen.getByRole("button", { name: /Termin bestätigen/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Vergangenheit/);
    expect(screen.getByLabelText("Datum")).toBeInTheDocument();
  });
});

describe("Ein bereits bestätigter Termin", () => {
  it("zeigt gleich die Bestätigung statt des Kalenders", async () => {
    standAntwort = { ...OFFEN, datum: "2026-09-30", uhrzeit: "10:30", quelle: "bewerber" };
    zeichne();

    expect(await screen.findByText("Termin steht")).toBeInTheDocument();
    expect(screen.getByText("Danke, Max.")).toBeInTheDocument();
    expect(screen.queryByTitle("Termin aussuchen")).not.toBeInTheDocument();
  });

  it("nennt weiter den Zugang per Mail samt Spam-Ordner", async () => {
    standAntwort = { ...OFFEN, datum: "2026-09-30", uhrzeit: "10:30", quelle: "bewerber" };
    zeichne();

    expect(await screen.findByText(/Spam-Ordner/)).toBeInTheDocument();
  });

  it("lässt sich über Zeit korrigieren wieder ändern", async () => {
    // Ein Vertipper direkt nach dem Buchen ist der wahrscheinlichste Fehler.
    standAntwort = { ...OFFEN, datum: "2026-09-30", uhrzeit: "10:30", quelle: "bewerber" };
    zeichne();

    fireEvent.click(await screen.findByRole("button", { name: /Zeit korrigieren/ }));

    expect(await screen.findByLabelText("Datum")).toHaveValue("2026-09-30");
    expect(screen.getByTitle("Termin aussuchen")).toBeInTheDocument();
  });
});

describe("Ohne gültigen Zugang", () => {
  it("verrät nicht, ob es das Token gibt", async () => {
    /*
      Unbekanntes Token, nicht eingereichter Bogen und fehlende Migration sehen
      absichtlich gleich aus.
    */
    standAntwort = null;
    zeichne("unbekannt");

    expect(await screen.findByText(/Dieser Link ist nicht mehr gültig/)).toBeInTheDocument();
    expect(screen.queryByTitle("Termin aussuchen")).not.toBeInTheDocument();
  });
});
