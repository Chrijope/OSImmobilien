/**
 * Die Eintragung vor dem Ergebnis: ohne Einwilligung geht nichts raus.
 *
 * Geprueft wird das, was der Geschaeftsfuehrer ausdruecklich verlangt hat:
 * ein Pflichthaken mit einer Meldung, die sagt was fehlt, und ein davon
 * GETRENNTER, freiwilliger Haken fuer die werbliche Ansprache. Ein einziger
 * Haken fuer beides waere die Vorlage, die wir nicht wollen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const sendeAnalyseLead = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ ok: true, kontaktId: "kontakt-1" })),
);
vi.mock("@/lib/analyseLead", () => ({ sendeAnalyseLead }));
vi.mock("@/lib/analysetoolEreignisse", () => ({ protokolliereAnalyseEreignis: vi.fn() }));

import ErgebnisFreischalten from "./ErgebnisFreischalten";
import { calculateScore, type AnalysisData } from "@/lib/scoringEngine";
import { LEAD_EINWILLIGUNG_TEXT, LEAD_WERBUNG_TEXT } from "@/lib/leadEinwilligung";

const DATEN: AnalysisData = {
  age: 38,
  familyStatus: "verheiratet",
  householdSize: 2,
  dependents: 0,
  livingSituation: "miete",
  profession: "angestellt",
  employmentType: "unbefristet",
  employmentDuration: 8,
  netIncome: 4500,
  additionalIncome: 0,
  savingsRate: 600,
  equity: 40000,
  liquidityReserve: 15000,
  existingLoans: 0,
  monthlyFixedCosts: 1800,
  existingProperties: 0,
  investmentExperience: "wenig",
  realEstateExperience: "keine",
  goals: ["vermoegensaufbau"],
  incomeClass: "50k_80k",
  taxOptimizationInterest: true,
  financingWillingness: "ja",
} as AnalysisData;

const ERGEBNIS = calculateScore(DATEN);

function fuelleAus() {
  fireEvent.change(screen.getByPlaceholderText("Vorname *"), { target: { value: "Max" } });
  fireEvent.change(screen.getByPlaceholderText("Nachname *"), { target: { value: "Mustermann" } });
  fireEvent.change(screen.getByPlaceholderText("E-Mail *"), {
    target: { value: "max@example.com" },
  });
  // Die Telefonnummer laeuft ueber PhoneInput, das Feld traegt den Typ tel.
  const telefon = document.querySelector('input[type="tel"]') as HTMLInputElement;
  fireEvent.change(telefon, { target: { value: "0170 1234567" } });
}

const absendenKnopf = () => screen.getByRole("button", { name: /Auswertung ansehen/ });
const pflichtHaken = () => screen.getByLabelText(new RegExp(LEAD_EINWILLIGUNG_TEXT.slice(0, 40)));
const werbeHaken = () => screen.getByLabelText(new RegExp(LEAD_WERBUNG_TEXT.slice(0, 40)));

beforeEach(() => {
  sendeAnalyseLead.mockClear();
  render(
    <ErgebnisFreischalten result={ERGEBNIS} data={DATEN} onFreigeschaltet={() => {}} />,
  );
});

describe("Einwilligung in der Eintragung", () => {
  it("zeigt zwei getrennte Haken, Pflicht und Werbung", () => {
    expect(pflichtHaken()).toBeTruthy();
    expect(werbeHaken()).toBeTruthy();
    expect(pflichtHaken()).not.toBe(werbeHaken());
  });

  it("schickt ohne Haken nichts ab und sagt, was fehlt", async () => {
    fuelleAus();
    fireEvent.click(absendenKnopf());
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/Einwilligung/);
    });
    expect(sendeAnalyseLead).not.toHaveBeenCalled();
  });

  it("schickt mit Haken ab und meldet die Einwilligung mit", async () => {
    fuelleAus();
    fireEvent.click(pflichtHaken());
    fireEvent.click(absendenKnopf());
    await waitFor(() => expect(sendeAnalyseLead).toHaveBeenCalled());
    const eingabe = sendeAnalyseLead.mock.calls[0][0] as Record<string, unknown>;
    expect(eingabe.einwilligung).toBe(true);
    expect(eingabe.werbeeinwilligung).toBe(false);
  });

  it("blockiert das Absenden nicht, wenn nur der freiwillige Haken fehlt", async () => {
    fuelleAus();
    fireEvent.click(pflichtHaken());
    fireEvent.click(werbeHaken());
    fireEvent.click(absendenKnopf());
    await waitFor(() => expect(sendeAnalyseLead).toHaveBeenCalled());
    const eingabe = sendeAnalyseLead.mock.calls[0][0] as Record<string, unknown>;
    expect(eingabe.werbeeinwilligung).toBe(true);
  });
});
