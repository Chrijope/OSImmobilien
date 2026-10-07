import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Die Karte „Einladung zur Terminbuchung" im Reiter Videocall.
 *
 * Seit dem 21.09.2026 wird der Termin über den Kalender der HR-Managerin
 * vereinbart, und Calendly meldet uns nichts zurück. Die HR-Managerin trägt
 * Datum und Uhrzeit deshalb hier von Hand ein, an derselben Stelle, an der sie
 * eingeladen hat.
 *
 * Geprüft wird das, was dabei schiefgehen kann: ein Datum ohne Uhrzeit, zwei
 * getrennte Speichervorgänge, und ein Knopf, der speichert, obwohl sich nichts
 * geändert hat.
 */

const gespeichert: Array<Record<string, unknown>> = [];

vi.mock("@/lib/bewerbungStore", () => ({
  updateBewerber: vi.fn(async (_id: string, daten: Record<string, unknown>) => {
    gespeichert.push(daten);
  }),
  changeBewerberStatus: vi.fn(),
}));

const toasts: Array<{ title?: string }> = [];
vi.mock("@/hooks/use-toast", () => ({
  toast: (t: { title?: string }) => { toasts.push(t); },
  useToast: () => ({ toast: (t: { title?: string }) => { toasts.push(t); } }),
}));

vi.mock("@/lib/confirm", () => ({ confirmDialog: vi.fn().mockResolvedValue(true) }));

vi.mock("@/lib/bewerberEinladung", () => ({
  leseKooperationsEinladung: () => "",
  sendeKooperationsEinladung: vi.fn().mockResolvedValue({ ok: true }),
  vermerkeKooperationsEinladung: vi.fn(),
}));

vi.mock("@/components/bewerbung/MailOeffnungBadge", () => ({
  MailOeffnungBadge: () => null,
}));

import { GespraechEinladung } from "./GespraechEinladung";
import { updateBewerber } from "@/lib/bewerbungStore";
import type { Bewerber } from "@/lib/bewerbungStore";

const BEWERBER = {
  id: "b1",
  vorname: "Max",
  nachname: "Beispiel",
  email: "max@beispiel.de",
  status: "Erstgespraech",
} as unknown as Bewerber;

function zeichne(bewerber: Partial<Bewerber> = {}, onRefresh = vi.fn()) {
  render(
    <GespraechEinladung
      bewerber={{ ...BEWERBER, ...bewerber } as Bewerber}
      buchungsToken="t1"
      canEdit
      onRefresh={onRefresh}
    />,
  );
  return onRefresh;
}

const datumsfeld = () => screen.getByLabelText("Datum des Kennenlerngesprächs");
const uhrzeitfeld = () => screen.getByLabelText("Uhrzeit des Kennenlerngesprächs");
const speicherknopf = () => screen.getByRole("button", { name: /Termin speichern/ });

beforeEach(() => {
  gespeichert.length = 0;
  toasts.length = 0;
  vi.clearAllMocks();
});

describe("Der Termin lässt sich von Hand eintragen", () => {
  it("zeigt die Eingabe in derselben Karte wie die Einladung", () => {
    zeichne();

    expect(screen.getByTestId("kennenlerntermin-eingabe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /einladen/i })).toBeInTheDocument();
  });

  it("schreibt Datum und Uhrzeit in einem einzigen Speichervorgang", async () => {
    /*
      Zwei getrennte Aufrufe wären zwei Speichervorgänge, und zwischen ihnen
      stünde am Bewerber ein Datum ohne Uhrzeit. Genau dieser Zwischenstand
      landet in den Terminerinnerungen an den Bewerber.
    */
    zeichne();

    fireEvent.change(datumsfeld(), { target: { value: "30.09.2026" } });
    fireEvent.change(uhrzeitfeld(), { target: { value: "10:30" } });
    fireEvent.click(speicherknopf());

    await waitFor(() => expect(gespeichert).toHaveLength(1));
    expect(gespeichert[0]).toMatchObject({ erstgespraechUhrzeit: "10:30" });
    expect(String(gespeichert[0].erstgespraechDatum)).toMatch(/2026/);
  });

  it("speichert kein Datum ohne Uhrzeit", () => {
    zeichne();

    fireEvent.change(datumsfeld(), { target: { value: "30.09.2026" } });
    fireEvent.click(speicherknopf());

    expect(updateBewerber).not.toHaveBeenCalled();
    expect(toasts.some((t) => /Uhrzeit fehlt/.test(t.title || ""))).toBe(true);
  });

  it("lässt den Knopf ruhen, solange sich nichts geändert hat", () => {
    zeichne({ erstgespraechDatum: "2026-09-30", erstgespraechUhrzeit: "10:30" });

    expect(speicherknopf()).toBeDisabled();
  });

  it("füllt die Felder mit dem gespeicherten Termin vor", () => {
    zeichne({ erstgespraechDatum: "2026-09-30", erstgespraechUhrzeit: "10:30" });

    expect(uhrzeitfeld()).toHaveValue("10:30");
  });

  it("meldet der Akte, dass sie sich neu lesen soll", async () => {
    const onRefresh = zeichne();

    fireEvent.change(datumsfeld(), { target: { value: "30.09.2026" } });
    fireEvent.change(uhrzeitfeld(), { target: { value: "10:30" } });
    fireEvent.click(speicherknopf());

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});

describe("Sarah sieht, ob der Bewerber selbst bestätigt hat", () => {
  /*
    Seit dem 21.09.2026 bestätigt der Bewerber seinen Termin in der Regel
    selbst, auf der Seite mit dem eingebetteten Kalender. Die Eingabe hier
    bleibt trotzdem: für die, die es vergessen. Damit Sarah weiß, ob sie
    eingreifen muss, steht der Unterschied in der Karte.
  */
  it("meldet eine Selbstbestätigung, statt zum Eintragen aufzufordern", () => {
    zeichne({
      erstgespraechDatum: "2026-09-30",
      erstgespraechUhrzeit: "10:30",
      erstgespraechQuelle: "bewerber",
      erstgespraechBestaetigtAm: "2026-09-21T09:15:00Z",
    });

    expect(screen.getByText(/Vom Bewerber selbst bestätigt/)).toBeInTheDocument();
    expect(screen.queryByText(/Hat er das nicht getan, trag sie hier ein/)).not.toBeInTheDocument();
  });

  it("fordert zum Eintragen auf, solange nichts bestätigt wurde", () => {
    zeichne();

    expect(screen.getByText(/Hat er das nicht getan, trag sie hier ein/)).toBeInTheDocument();
    expect(screen.queryByText(/Vom Bewerber selbst bestätigt/)).not.toBeInTheDocument();
  });

  it("lässt eine Selbstbestätigung trotzdem überschreiben", () => {
    // Ein Vertipper des Bewerbers muss korrigierbar bleiben.
    zeichne({
      erstgespraechDatum: "2026-09-30",
      erstgespraechUhrzeit: "10:30",
      erstgespraechQuelle: "bewerber",
    });

    expect(uhrzeitfeld()).not.toBeDisabled();
    fireEvent.change(uhrzeitfeld(), { target: { value: "11:00" } });
    expect(speicherknopf()).not.toBeDisabled();
  });
});
