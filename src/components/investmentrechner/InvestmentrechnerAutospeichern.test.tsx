import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";
import { entwurfLaden } from "@/lib/investmentrechner/entwurfAblage";
import { InvestmentrechnerInhalt } from "./InvestmentrechnerInhalt";
import { standardEingabe } from "@/lib/investmentrechner/rechenkern";
import { standardKaufnebenkostenauswahl } from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";

/*
 * Autospeichern, Zurücksetzen und die Rücklagenvorgabe im geöffneten Rechner,
 * seit dem 23.10.2026 (Christian). Dieselbe Komponente läuft im CRM und auf
 * der Artefaktseite.
 */

const zeige = () => render(<TooltipProvider><InvestmentrechnerInhalt /></TooltipProvider>);
const feld = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;

describe("Autospeichern im Browser", () => {
  beforeEach(() => {
    setzeSpeicherAttrappe();
  });

  it("behält die Eingaben nach dem Neuladen und leert sie mit „Zurücksetzen“", async () => {
    const erste = zeige();
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    fireEvent.change(feld(/^Wohnfläche/), { target: { value: "72" } });
    expect(entwurfLaden("frei")?.objekte[0].eingabe.area).toBe(72);
    erste.unmount();

    // Neu geöffnet: derselbe Stand, die Rücklage folgt der Fläche (1 € je m²).
    zeige();
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    expect(feld(/^Wohnfläche/).value).toBe("72");
    fireEvent.click(screen.getByRole("button", { name: /Miete & Entwicklung/ }));
    expect(feld(/^davon Instandhaltungsrücklage/).value).toBe("72");

    // Ein eigener Wert bleibt, auch wenn sich die Fläche danach ändert.
    fireEvent.change(feld(/^davon Instandhaltungsrücklage/), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    fireEvent.change(feld(/^Wohnfläche/), { target: { value: "90" } });
    expect(entwurfLaden("frei")?.objekte[0].eingabe.monthlyReserveContribution).toBe(40);

    fireEvent.click(screen.getByTestId("rechner-zuruecksetzen"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Berechnung zurücksetzen?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Zurücksetzen" }));
    await waitFor(() => expect(entwurfLaden("frei")?.objekte[0].eingabe.area).toBe(0));
    expect(entwurfLaden("frei")?.objekte[0].eingabe.monthlyReserveContributionAuto).toBe(true);
  });

  it("lässt mit „Abbrechen“ alles stehen", async () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    fireEvent.change(feld(/^Wohnfläche/), { target: { value: "55" } });
    fireEvent.click(screen.getByTestId("rechner-zuruecksetzen"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(entwurfLaden("frei")?.objekte[0].eingabe.area).toBe(55);
  });
});

describe("Kopfbereich", () => {
  it("trennt Kunde und Objekt, die Ansichten und Deckblatt mit Sprache in eigene Ebenen", () => {
    const { container } = zeige();
    const kopf = container.querySelector(".result-header")!;
    expect(kopf.querySelector(".result-kopf [data-testid='rechner-zuruecksetzen']")).not.toBeNull();
    expect(within(kopf.querySelector(".hauptansichten") as HTMLElement).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual([
      "Analyse",
      "Berechnung",
      "Ausführlich",
    ]);
    const optionen = kopf.querySelector(".result-optionen") as HTMLElement;
    expect(within(optionen).getByText("Deckblatt")).toBeInTheDocument();
    expect(within(optionen).getByText(/Sprache für Kunde und PDF/)).toBeInTheDocument();
    expect(within(optionen).getByRole("radio", { name: "DE" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("Von Hand geänderte Unterlagenangaben im Entwurf", () => {
  beforeEach(() => {
    setzeSpeicherAttrappe();
  });

  it("überschreibt die Vorbelegung nach dem Neuladen nicht (Codex-Prüfung vom 23.10.2026)", () => {
    const vorbelegung = {
      eingabe: { ...standardEingabe, purchasePrice: 200_000 },
      knk: standardKaufnebenkostenauswahl,
      unterlagen: { ...leereUnterlagenDaten, reserveAsOf: "31.12.2024" },
    };
    const mitVorbelegung = () =>
      render(<TooltipProvider><InvestmentrechnerInhalt vorbelegung={vorbelegung} mitUeberschrift={false} /></TooltipProvider>);
    const erste = mitVorbelegung();
    fireEvent.click(screen.getByRole("button", { name: /Objektunterlagen/ }));
    expect(feld(/^Stand der Rücklage/).value).toBe("31.12.2024");
    fireEvent.change(feld(/^Stand der Rücklage/), { target: { value: "30.06.2026" } });
    erste.unmount();

    mitVorbelegung();
    fireEvent.click(screen.getByRole("button", { name: /Objektunterlagen/ }));
    expect(feld(/^Stand der Rücklage/).value).toBe("30.06.2026");
  });
});
