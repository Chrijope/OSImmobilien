/**
 * Der Konfigurator: sechs Klicks, Auswertung, Kontakt, Absenden.
 * Das Absenden geht in diesem Test nicht an den Server.
 */
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sende, zaehle } = vi.hoisted(() => ({ sende: vi.fn(), zaehle: vi.fn() }));
vi.mock("@/lib/handbuch/leadAbsenden", () => ({ sendeHandbuchLead: sende }));
vi.mock("@/lib/handbuch/ereignisse", () => ({ zaehleHandbuch: zaehle }));

import Konfigurator from "./Konfigurator";

async function waehle(text: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(text) }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
}

beforeEach(() => {
  sende.mockReset();
  zaehle.mockReset();
});

describe("Konfigurator", () => {
  it("führt durch sechs Fragen zum Ausgang „passt“ und schickt die Antworten mit dem Kürzel ab", async () => {
    sende.mockResolvedValue({ ok: true, handbuchToken: "t".repeat(64), saToken: "s".repeat(64) });
    const fertig = vi.fn();
    render(<Konfigurator beraterSlug="maria" beraterId="partner-id" onFertig={fertig} />);

    expect(screen.getByText("Was soll Ihre Wohnung für Sie leisten?")).toBeInTheDocument();
    expect(screen.getByText("Danach setzen wir die Schwerpunkte in Ihrem Handbuch.")).toBeInTheDocument();
    await waehle("Steuerlast senken");
    await waehle("^Angestellt");
    expect(screen.getByText("Wir werden gemeinsam veranlagt")).toBeInTheDocument();
    await waehle("80.000 bis 120.000 €");
    await waehle("1.000 bis 1.500 €");
    await waehle("30.000 bis 60.000 €");
    await waehle("In den nächsten drei Monaten");

    expect(screen.getByText("Ihre Angaben passen zu unseren Wohnungen.")).toBeInTheDocument();
    expect(screen.getByText(/rund 42 %/)).toBeInTheDocument();
    expect(zaehle).toHaveBeenCalledWith("hb_ausgang_passt", "partner-id");
    expect(zaehle).toHaveBeenCalledWith("hb_frage_6", "partner-id");

    fireEvent.click(screen.getByRole("button", { name: /Handbuch erhalten/ }));
    fireEvent.click(screen.getByRole("button", { name: /Handbuch anfordern/ }));
    expect(await screen.findByText("Bitte geben Sie Ihren Vornamen an.")).toBeInTheDocument();
    expect(screen.getByText("Bitte geben Sie Ihre Handynummer an.")).toBeInTheDocument();
    expect(sende).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Vorname/), { target: { value: "Erika" } });
    fireEvent.change(screen.getByLabelText(/^Nachname/), { target: { value: "Muster" } });
    fireEvent.change(screen.getByLabelText(/^E-Mail/), { target: { value: "erika@beispiel.de" } });
    fireEvent.change(screen.getByLabelText(/Handynummer/), { target: { value: "0151 23456789" } });
    // Pflichtfelder sind sichtbar markiert und für Screenreader als Pflicht ausgezeichnet.
    for (const feld of [/^Vorname/, /^Nachname/, /^E-Mail/, /Handynummer/]) {
      expect(screen.getByLabelText(feld)).toHaveAttribute("aria-required", "true");
    }
    expect(screen.getByRole("checkbox", { name: /Ja, schicken Sie mir mein Handbuch/ })).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("* Pflichtfeld")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Ja, schicken Sie mir mein Handbuch/ }));
    fireEvent.click(screen.getByRole("button", { name: /Handbuch anfordern/ }));

    await waitFor(() => expect(fertig).toHaveBeenCalled());
    const aufruf = sende.mock.calls[0][0];
    expect(aufruf.beraterSlug).toBe("maria");
    expect(aufruf.antworten).toEqual({ ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" });
    expect(aufruf.kontakt.telefon).toBe("0151 23456789");
    expect(fertig.mock.calls[0][0]).toMatchObject({ vorname: "Erika", handbuchToken: "t".repeat(64), saToken: "s".repeat(64) });
    expect(zaehle).toHaveBeenCalledWith("hb_handbuch_erhalten", "partner-id");
  });

  it("zeigt „noch nicht“ ehrlich und bietet das Handbuch trotzdem an", async () => {
    render(<Konfigurator onFertig={vi.fn()} />);
    await waehle("Fürs Alter vorsorgen");
    await waehle("Etwas anderes");
    await waehle("unter 50.000 €");
    await waehle("unter 500 €");
    await waehle("unter 10.000 €");
    await waehle("Ich informiere mich erst");
    expect(screen.getByText("Noch passt es nicht. Das ist in Ordnung.")).toBeInTheDocument();
    expect(screen.getByText("Ihr Handbuch bekommen Sie trotzdem.")).toBeInTheDocument();
  });

  it("meldet einen Fehler des Servers, ohne die Eingaben zu verlieren", async () => {
    sende.mockResolvedValue({ ok: false, fehler: "Bitte versuchen Sie es später noch einmal." });
    render(<Konfigurator onFertig={vi.fn()} />);
    for (const t of ["Vermögen aufbauen", "^Angestellt", "50.000 bis 80.000 €", "500 bis 1.000 €", "10.000 bis 30.000 €", "So bald wie möglich"]) await waehle(t);
    fireEvent.click(screen.getByRole("button", { name: /Handbuch erhalten/ }));
    fireEvent.change(screen.getByLabelText(/^Vorname/), { target: { value: "Erika" } });
    fireEvent.change(screen.getByLabelText(/^Nachname/), { target: { value: "Muster" } });
    fireEvent.change(screen.getByLabelText(/^E-Mail/), { target: { value: "erika@beispiel.de" } });
    fireEvent.change(screen.getByLabelText(/Handynummer/), { target: { value: "0151 23456789" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Ja, schicken Sie mir mein Handbuch/ }));
    fireEvent.click(screen.getByRole("button", { name: /Handbuch anfordern/ }));
    expect(await screen.findByText("Bitte versuchen Sie es später noch einmal.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Vorname/)).toHaveValue("Erika");
  });

  it("Frage 4: Rechenhilfe zum Aufklappen und „Weiß ich nicht genau“ führt höchstens zu „vielleicht“", async () => {
    render(<Konfigurator onFertig={vi.fn()} />);
    await waehle("Vermögen aufbauen");
    await waehle("^Angestellt");
    await waehle("80.000 bis 120.000 €");
    expect(screen.getByText("So rechnen Sie es kurz aus")).toBeInTheDocument();
    await waehle("Weiß ich nicht genau");
    await waehle("über 60.000 €");
    await waehle("So bald wie möglich");
    expect(screen.getByText("Ihre Angaben passen knapp.")).toBeInTheDocument();
    expect(screen.getByText(/Wir rechnen vorsichtig mit 500 €/)).toBeInTheDocument();
  });

  it("prüft die Handynummer auf Plausibilität", async () => {
    render(<Konfigurator onFertig={vi.fn()} />);
    for (const t of ["Vermögen aufbauen", "^Angestellt", "50.000 bis 80.000 €", "500 bis 1.000 €", "10.000 bis 30.000 €", "So bald wie möglich"]) await waehle(t);
    fireEvent.click(screen.getByRole("button", { name: /Handbuch erhalten/ }));
    fireEvent.change(screen.getByLabelText(/Handynummer/), { target: { value: "12ab" } });
    fireEvent.click(screen.getByRole("button", { name: /Handbuch anfordern/ }));
    expect(await screen.findByText(/Bitte prüfen Sie die Nummer/)).toBeInTheDocument();
    expect(screen.getByText("Vollständigen Text anzeigen")).toBeInTheDocument();
  });
});
