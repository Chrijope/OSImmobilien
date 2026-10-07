import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { standardEingabe } from "@/lib/investmentrechner/rechenkern";
import { standardKaufnebenkostenauswahl } from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { InvestmentrechnerInhalt, type Rechnervorbelegung } from "./InvestmentrechnerInhalt";

/**
 * Der Bereich „Bilder" startet mit den Fotos aus der Objektanlage.
 *
 * Geladen wird über `ladeRechnerBilder`, hier ersetzt durch eine Attrappe,
 * damit kein Netz gebraucht wird. Geprüft wird das Verhalten im Rechner:
 * dass die Fotos im Bereich und in der Druckfassung ankommen, dass eigene
 * Bilder Vorrang haben und dass eine Änderung des Nutzers stehen bleibt.
 */

const laden = vi.hoisted(() => vi.fn());
vi.mock("@/lib/investmentrechner/rechnerBilder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/investmentrechner/rechnerBilder")>()),
  ladeRechnerBilder: laden,
}));

const EINS = "data:image/png;base64,RUlOUw==";
const ZWEI = "data:image/png;base64,WldFSQ==";

const vor: Rechnervorbelegung = {
  eingabe: { ...standardEingabe, propertyTitle: "Testwohnung" },
  knk: standardKaufnebenkostenauswahl,
  bilder: ["/w/1.jpg", "/o/titel.jpg"],
};

const zeige = (v: Rechnervorbelegung = vor) =>
  render(
    <StrictMode>
      <TooltipProvider>
        <InvestmentrechnerInhalt vorbelegung={v} mitUeberschrift={false} />
      </TooltipProvider>
    </StrictMode>,
  );

const oeffneBilder = () => fireEvent.click(screen.getByRole("button", { name: "Bilder" }));
const fotosImBereich = () => screen.queryAllByAltText(/^Objektfoto \d$/).map((bild) => bild.getAttribute("src"));
const fotosInDerPdf = () => screen.queryAllByAltText(/^Objektansicht \d$/).map((bild) => bild.getAttribute("src"));

// Mit Klammern: Gibt beforeEach eine Funktion zurück, ruft Vitest sie als Aufräumschritt auf.
beforeEach(() => {
  laden.mockReset();
});
afterEach(cleanup);

describe("Fotos aus der Objektanlage im Bereich „Bilder“", () => {
  it("stehen nach dem Öffnen im Bereich und in der Druckfassung, in der gelieferten Reihenfolge", async () => {
    laden.mockResolvedValue([EINS, ZWEI]);
    zeige();
    await waitFor(() => expect(fotosInDerPdf()).toEqual([EINS, ZWEI]));
    oeffneBilder();
    expect(fotosImBereich()).toEqual([EINS, ZWEI]);
    expect(screen.getByTestId("foto-vorbelegung")).toHaveTextContent("Vorbelegt mit den Fotos aus der Objektanlage");
    // Eine Anfrage, auch im StrictMode, mit den Adressen aus der Vorbelegung.
    expect(laden).toHaveBeenCalledTimes(1);
    expect(laden.mock.calls[0][0]).toEqual(["/w/1.jpg", "/o/titel.jpg"]);
  });

  it("lässt eigene Bilder stehen, wenn die Vorbelegung erst danach eintrifft", async () => {
    let liefere!: (bilder: string[]) => void;
    laden.mockImplementation(() => new Promise<string[]>((r) => { liefere = r; }));
    zeige();
    oeffneBilder();
    expect(screen.getByTestId("foto-vorbelegung")).toHaveTextContent("werden geladen");
    const eingabe = document.querySelector("label.photo-upload input[type=file]") as HTMLInputElement;
    fireEvent.change(eingabe, { target: { files: [new File(["x"], "eigenes.png", { type: "image/png" })] } });
    await waitFor(() => expect(fotosImBereich()).toHaveLength(1));
    const eigenes = fotosImBereich()[0];
    await act(async () => liefere([EINS, ZWEI]));
    expect(fotosImBereich()).toEqual([eigenes]);
    expect(eigenes).not.toBe(EINS);
    expect(screen.queryByTestId("foto-vorbelegung")).not.toBeInTheDocument();
  });

  it("holt entfernte Fotos nicht von selbst zurück, erst „Auf Objektdaten zurücksetzen“", async () => {
    laden.mockResolvedValue([EINS, ZWEI]);
    zeige();
    await waitFor(() => expect(fotosInDerPdf()).toHaveLength(2));
    oeffneBilder();
    fireEvent.click(screen.getByRole("button", { name: "Objektfoto 1 entfernen" }));
    expect(fotosImBereich()).toEqual([ZWEI]);

    fireEvent.click(screen.getByRole("button", { name: /Auf Objektdaten zurücksetzen/ }));
    await waitFor(() => expect(fotosInDerPdf()).toEqual([EINS, ZWEI]));
    // Die Fotos kommen aus dem Zwischenspeicher, nicht aus einem zweiten Download.
    expect(laden).toHaveBeenCalledTimes(1);
  });

  it("sagt es, wenn sich keine Fotos laden ließen", async () => {
    laden.mockResolvedValue([]);
    zeige();
    oeffneBilder();
    await waitFor(() => expect(screen.getByTestId("foto-vorbelegung")).toHaveTextContent("ließen sich nicht laden"));
    expect(fotosImBereich()).toEqual([]);
  });

  it("lädt ohne hinterlegte Fotos gar nichts", () => {
    zeige({ ...vor, bilder: [] });
    oeffneBilder();
    expect(laden).not.toHaveBeenCalled();
    expect(screen.queryByTestId("foto-vorbelegung")).not.toBeInTheDocument();
  });
});
