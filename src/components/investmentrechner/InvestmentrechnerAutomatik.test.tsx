import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { standardEingabe } from "@/lib/investmentrechner/rechenkern";
import { standardKaufnebenkostenauswahl } from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { InvestmentrechnerInhalt } from "./InvestmentrechnerInhalt";
import type { KiAntwort } from "@/lib/investmentrechner/unterlagenKiFelder";

const laden = vi.hoisted(() => vi.fn());
vi.mock("@/lib/investmentrechner/objektUnterlagen", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/investmentrechner/objektUnterlagen")>(), leseObjektUnterlagen: laden }));
const vor = {
  eingabe: { ...standardEingabe, propertyTitle: "Testwohnung" }, knk: standardKaufnebenkostenauswahl,
  quellen: { objektId: "o1", wohnungId: "w1", weNr: "1", adresse: "Straße 1", dokumente: [{ id: "d1", name: "Beleg.pdf", url: "/beleg.pdf", ebene: "einheit" as const }] },
};
const antwort: KiAntwort = { felder: { area: { wert: 68, quelle: "Beleg.pdf, Seite 2", sicherheit: "hoch" } }, hinweise: [] };
const renderRechner = (key = "w1", v = vor) => <StrictMode><TooltipProvider><InvestmentrechnerInhalt key={key} vorbelegung={v} /></TooltipProvider></StrictMode>;
beforeEach(() => { laden.mockReset(); });
afterEach(cleanup);

describe("Automatische Übernahme im geöffneten Rechner", () => {
  it("liest ohne Upload/Klick und startet auch im StrictMode nur eine Anfrage", async () => {
    laden.mockResolvedValue({ documents: [], antwort });
    render(renderRechner());
    await waitFor(() => expect(screen.queryByText("Objektunterlagen werden automatisch ausgelesen …")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    expect(screen.getByRole("spinbutton", { name: /Wohnfläche/ })).toHaveValue(68);
    expect(laden).toHaveBeenCalledTimes(1);
    expect(laden.mock.calls[0][0].wohnungId).toBe("w1");
  });
  it("überschreibt keine Eingabe, die während der Auslesung gemacht wurde", async () => {
    let resolve!: (v: { documents: []; antwort: KiAntwort }) => void;
    laden.mockImplementation(() => new Promise(r => { resolve = r; }));
    render(renderRechner());
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /Wohnfläche/ }), { target: { value: "72" } });
    await act(async () => resolve({ documents: [], antwort }));
    expect(screen.getByRole("spinbutton", { name: /Wohnfläche/ })).toHaveValue(72);
    // Seit dem 28.09.2026 mit beiden Werten: hinterlegt und laut Unterlage.
    expect(screen.getByText(/Hinterlegt 72 m², laut Beleg\.pdf, Seite 2 68 m²\. Die hinterlegte Angabe bleibt/)).toBeInTheDocument();
  });
  it("überträgt verspätete Antworten nicht auf eine andere Einheit", async () => {
    let resolve!: (v: { documents: []; antwort: KiAntwort }) => void;
    laden.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ documents: [], antwort: { felder: {}, hinweise: [] } });
    const view = render(renderRechner());
    view.rerender(renderRechner("w2", { ...vor, quellen: { ...vor.quellen, wohnungId: "w2", weNr: "2" } }));
    await act(async () => resolve({ documents: [], antwort }));
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    expect(screen.getByRole("spinbutton", { name: /Wohnfläche/ })).not.toHaveValue(68);
  });
  it("zeigt automatisch Übernommenes in der Übernahmeliste und nimmt es per Klick zurück (R4-004)", async () => {
    laden.mockResolvedValue({ documents: [], antwort });
    render(renderRechner());
    await waitFor(() => expect(screen.queryByText("Objektunterlagen werden automatisch ausgelesen …")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Objektunterlagen/ }));
    expect(screen.getByText("Automatisch übernommen, laut Beleg.pdf, Seite 2.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Zurücknehmen/ }));
    // Danach steht der Wert davor wieder da, und die Unterlage erscheint als nicht ausgewählte Abweichung.
    expect(screen.getByTestId("ki-abweichung-area")).toHaveTextContent("laut Beleg.pdf, Seite 2: 68 m²");
    expect(screen.getByRole("checkbox", { name: /Wohnfläche.*übernehmen/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    expect(screen.getByRole("spinbutton", { name: /Wohnfläche/ })).not.toHaveValue(68);
  });
  it("eine neue Auslesung mit anderem Wert lässt Zurücknehmen stehen und zeigt die Abweichung dazu (R7-004)", async () => {
    laden.mockResolvedValueOnce({ documents: [], antwort })
      .mockResolvedValue({ documents: [], antwort: { felder: { area: { wert: 70, quelle: "Beleg.pdf, Seite 3", sicherheit: "hoch" } }, hinweise: [] } });
    render(renderRechner());
    await waitFor(() => expect(screen.queryByText("Objektunterlagen werden automatisch ausgelesen …")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Unterlagen erneut prüfen" }));
    // Längere Fristen: Unter Last der ganzen Suite braucht die zweite Auslesung mehr als eine Sekunde.
    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2), { timeout: 5000 });
    await waitFor(() => expect(screen.queryByText("Objektunterlagen werden automatisch ausgelesen …")).not.toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /Objektunterlagen/ }));
    expect(await screen.findByTestId("ki-abweichung-area", {}, { timeout: 5000 })).toHaveTextContent("laut Beleg.pdf, Seite 3: 70 m²");
    expect(screen.getByText("Automatisch übernommen, laut Beleg.pdf, Seite 2.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Zurücknehmen/ }));
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    expect(screen.getByRole("spinbutton", { name: /Wohnfläche/ })).not.toHaveValue(68);
    expect(screen.getByRole("spinbutton", { name: /Wohnfläche/ })).not.toHaveValue(70);
  });
  it("eine gespeicherte Berechnung ohne Objekt zeigt Zurücknehmen allein aus der Herkunft (R6-004)", async () => {
    const berechnung = {
      id: "b1", investment_id: "i-unbekannt", kontakt_id: "k-unbekannt", wohnung_id: null, name: "Variante A",
      eingabe: { ...standardEingabe, area: 68 }, knk: standardKaufnebenkostenauswahl, unterlagen: null, kennzahlen: {},
      herkunft: { area: { quelle: "unterlagen", text: "Aus Beleg.pdf, Seite 2", automatisch: true, vorher: 0 } },
      erstellt_von: null, erstellt_am: "2026-09-28T08:00:00Z", geaendert_am: "2026-09-28T08:00:00Z",
    } as unknown as import("@/lib/investmentBerechnungenStore").InvestmentBerechnung;
    render(<StrictMode><TooltipProvider><InvestmentrechnerInhalt start={{ berechnung }} /></TooltipProvider></StrictMode>);
    fireEvent.click(screen.getByRole("button", { name: /Objektunterlagen/ }));
    expect(screen.getByText("Automatisch übernommen, laut Beleg.pdf, Seite 2.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Zurücknehmen/ }));
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    expect(screen.getByRole("spinbutton", { name: /Wohnfläche/ })).not.toHaveValue(68);
    expect(laden).not.toHaveBeenCalled();
  });
  it("ein Vergleichsobjekt trägt die Werte als übernommen, ohne Zurücknehmen (R5-004)", async () => {
    laden.mockResolvedValue({ documents: [], antwort });
    render(renderRechner());
    await waitFor(() => expect(screen.queryByText("Objektunterlagen werden automatisch ausgelesen …")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Objekt zum Vergleich/ }));
    fireEvent.click(screen.getByRole("button", { name: /Objektunterlagen/ }));
    expect(screen.queryByRole("button", { name: /Zurücknehmen/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Objekt & Kaufpreis/ }));
    // Der Wert selbst ist mitgekommen.
    expect(screen.getByRole("spinbutton", { name: /Wohnfläche/ })).toHaveValue(68);
  });
});
