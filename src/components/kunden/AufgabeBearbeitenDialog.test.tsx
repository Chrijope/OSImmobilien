/**
 * Der Stift an einem Termin: die Buchung muss mitziehen.
 *
 * Christian am 16.09.2026: "Wenn man einen selbst gebuchten Termin über den
 * neuen Stift verschiebt, muss die zugehörige Buchung mitziehen." Vorher trug
 * der Stift nur den Eintrag in der Kundenakte um, die Buchung blieb auf der
 * alten Zeit stehen, sperrte dort weiter den Kalender und zeigte dem Kunden
 * über seinen Absagelink den alten Termin.
 *
 * Eine Mail an den Kunden darf dabei nicht entstehen, die Bestätigung kommt
 * vom Buchungskalender. Dafür sorgt die Datenbank: `meeting_mail_vormerken`
 * steigt aus, sobald zu dem Eintrag eine Buchung existiert.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AktivitaetEntry } from "@/lib/aktivitaetenStore";

const spione = vi.hoisted(() => ({
  ladeBuchungZuAktivitaet: vi.fn(),
  verschiebeBuchungIntern: vi.fn(),
  updateAktivitaet: vi.fn(),
  updateAufgabe: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/buchungStore", () => ({
  ladeBuchungZuAktivitaet: spione.ladeBuchungZuAktivitaet,
  verschiebeBuchungIntern: spione.verschiebeBuchungIntern,
}));

vi.mock("@/lib/aktivitaetenStore", () => ({
  updateAktivitaet: spione.updateAktivitaet,
}));

vi.mock("@/lib/aufgabenStore", () => ({
  findeAufgabeZuAktivitaet: () => null,
  getAufgaben: () => [],
  updateAufgabe: spione.updateAufgabe,
}));

vi.mock("@/lib/investmentsStore", () => ({ getInvestmentsByKontakt: () => [] }));
vi.mock("@/lib/loadAllUsers", () => ({ loadAllUsers: () => [] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: spione.toast }) }));
// Die Investment-Auswahl zieht den ganzen Anlege-Dialog nach, hier reicht ein Platzhalter.
vi.mock("@/components/kunden/QuickActionDialog", () => ({ InvestmentAuswahl: () => null }));

import { AufgabeBearbeitenDialog } from "@/components/kunden/AufgabeBearbeitenDialog";

/** Ein selbst gebuchter Termin, weit genug in der Zukunft. */
const TERMIN: AktivitaetEntry = {
  id: "akt-1",
  kundeId: "k1",
  art: "meeting",
  beschreibung: "Beratungsgespräch",
  von: "Berater",
  datum: "2026-09-16T09:00:00",
  faelligAm: "2027-10-01",
  uhrzeit: "10:00",
};

/** 10:00 Uhr Berliner Zeit am 01.10.2027, so wie die Buchung sie führt. */
const START_ALT = "2027-10-01T08:00:00.000Z";

function zeige(aktivitaet: AktivitaetEntry) {
  render(
    <AufgabeBearbeitenDialog
      aktivitaet={aktivitaet}
      kundeId="k1"
      eigenerName="Christian"
      onClose={() => {}}
    />,
  );
}

function setzeUhrzeit(wert: string) {
  const feld = document.querySelector('input[type="time"]') as HTMLInputElement;
  fireEvent.change(feld, { target: { value: wert } });
}

function speichern() {
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  spione.verschiebeBuchungIntern.mockResolvedValue(true);
  spione.updateAktivitaet.mockResolvedValue(undefined);
  spione.ladeBuchungZuAktivitaet.mockResolvedValue(null);
});

describe("AufgabeBearbeitenDialog: Termin verschieben", () => {
  it("zieht die zugehörige Buchung mit und schreibt die Zeit nicht ein zweites Mal", async () => {
    const buchung = { id: "b1", start_at: START_ALT };
    spione.ladeBuchungZuAktivitaet.mockResolvedValue(buchung);
    zeige(TERMIN);
    setzeUhrzeit("11:00");
    speichern();

    await waitFor(() => expect(spione.verschiebeBuchungIntern).toHaveBeenCalledTimes(1));
    // 11:00 Uhr Berliner Zeit am selben Tag.
    expect(spione.verschiebeBuchungIntern).toHaveBeenCalledWith(buchung, "2027-10-01T09:00:00.000Z");
    // Die Datenbankfunktion hat die neue Zeit im Eintrag schon gesetzt.
    const felder = spione.updateAktivitaet.mock.calls[0][1];
    expect(felder).not.toHaveProperty("faelligAm");
    expect(felder).not.toHaveProperty("uhrzeit");
  });

  it("lässt einen von Hand angelegten Termin ohne Buchung wie bisher laufen", async () => {
    zeige(TERMIN);
    setzeUhrzeit("11:00");
    speichern();

    await waitFor(() => expect(spione.updateAktivitaet).toHaveBeenCalledTimes(1));
    expect(spione.verschiebeBuchungIntern).not.toHaveBeenCalled();
    expect(spione.updateAktivitaet.mock.calls[0][1]).toMatchObject({
      faelligAm: "2027-10-01",
      uhrzeit: "11:00",
    });
  });

  it("verschiebt nichts, wenn nur der Titel geändert wird", async () => {
    spione.ladeBuchungZuAktivitaet.mockResolvedValue({ id: "b1", start_at: START_ALT });
    zeige(TERMIN);
    fireEvent.change(screen.getByPlaceholderText("z.B. Beratungsgespräch"), {
      target: { value: "Beratungsgespräch (Teil 2)" },
    });
    speichern();

    await waitFor(() => expect(spione.updateAktivitaet).toHaveBeenCalledTimes(1));
    expect(spione.verschiebeBuchungIntern).not.toHaveBeenCalled();
  });

  it("bricht ab und meldet es, wenn die Buchung nicht verschoben werden kann", async () => {
    spione.ladeBuchungZuAktivitaet.mockResolvedValue({ id: "b1", start_at: START_ALT });
    spione.verschiebeBuchungIntern.mockResolvedValue(false);
    zeige(TERMIN);
    setzeUhrzeit("11:00");
    speichern();

    await waitFor(() => expect(spione.toast).toHaveBeenCalled());
    // Der Eintrag in der Akte bleibt unberührt, sonst liefen beide auseinander.
    expect(spione.updateAktivitaet).not.toHaveBeenCalled();
    expect(spione.toast.mock.calls[0][0]).toMatchObject({ variant: "destructive" });
  });
});
