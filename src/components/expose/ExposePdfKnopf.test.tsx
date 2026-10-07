import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ObjektData } from "@/lib/objekteStore";
import { annahmenVorbelegen, baueExposeInhalt } from "@/lib/exposeInhalt";
import { SeitenSpracheProvider } from "@/lib/seitenSpracheKontext";
import { ExposeAnsicht } from "./ExposeAnsicht";

/**
 * Knopf „Exposé herunterladen“ (01.10.2026): lädt eine PDF-Datei statt den
 * Druckdialog zu öffnen, auf Deutsch und Englisch, mit eigenem Weg der Seite
 * (`onPdf`) oder dem eingebauten Download für Kundenlink und Kundenansicht.
 */

const herunterladen = vi.fn(async (_auftrag: { sprache: string }) => undefined);
vi.mock("@/lib/exposePdfHerunterladen", () => ({ exposePdfHerunterladen: (auftrag: { sprache: string }) => herunterladen(auftrag) }));

beforeAll(() => {
  class RO { observe() { /* leer */ } unobserve() { /* leer */ } disconnect() { /* leer */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});
afterEach(() => { herunterladen.mockClear(); vi.restoreAllMocks(); });

const objekt = {
  id: "o1", titel: "Wohnen an der Blau", adresse: "Söflinger Str. 203", plz: "89077", ort: "Ulm", beschreibung: "", highlights: [],
  bildUrl: "", bilder: [], dokumente: [], videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0,
  renditeVon: 0, renditeBis: 0, sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01",
  globalDaten: { gesamtQm: 0, etagen: 4, baujahr: 1954, grundstueckQm: 0, verkaufspreis: 0, qmPreis: 0, rendite: 0, jahresnettomiete: 0, hausgeldMonat: 0, kaufnebenkosten: 0, grundstueckAnteil: 0, zustand: "Neubau" },
  meta: { objektart: "neubau" },
  wohnungen: [{ id: "w7", weNr: "WE 7", etage: "0", lage: "", groesse: 65, zimmer: 3, mieteGesamt: 863, vkGesamt: 246800, qmPreis: 0, rendite: 0, vermietet: false, status: "frei" }],
} as unknown as ObjektData;
const w = objekt.wohnungen[0];

function zeigen(sprache: "de" | "en", onPdf?: () => void) {
  const inhalt = baueExposeInhalt({ objekt, wohnung: w, sprache });
  const annahmen = annahmenVorbelegen(objekt, w, null).annahmen;
  return render(
    <MemoryRouter>
      <SeitenSpracheProvider sprache={sprache}>
        <ExposeAnsicht inhalt={inhalt} rechner={{ annahmen, onAnnahmen: () => undefined, herkunft: {} }} pdfAktiv onPdf={onPdf} />
      </SeitenSpracheProvider>
    </MemoryRouter>,
  );
}

describe("Exposé herunterladen", () => {
  it("heißt auf Deutsch „Exposé herunterladen“ und lädt das PDF statt zu drucken", async () => {
    const drucken = vi.spyOn(window, "print").mockImplementation(() => undefined);
    zeigen("de");
    const knopf = screen.getByTestId("expose-pdf");
    expect(knopf).toHaveTextContent("Exposé herunterladen");
    fireEvent.click(knopf);
    await waitFor(() => expect(herunterladen).toHaveBeenCalledTimes(1));
    expect(herunterladen.mock.calls[0][0]).toMatchObject({ sprache: "de" });
    expect(drucken).not.toHaveBeenCalled();
  });

  it("heißt auf Englisch „Download exposé“, auch in der Seitenleiste", async () => {
    const drucken = vi.spyOn(window, "print").mockImplementation(() => undefined);
    zeigen("en");
    expect(screen.getByTestId("expose-pdf")).toHaveTextContent("Download exposé");
    fireEvent.click(screen.getByTestId("expose-pdf-leiste"));
    await waitFor(() => expect(herunterladen).toHaveBeenCalledTimes(1));
    expect(herunterladen.mock.calls[0][0]).toMatchObject({ sprache: "en" });
    expect(drucken).not.toHaveBeenCalled();
  });

  it("nimmt den eigenen Weg der Seite, wenn es einen gibt", () => {
    const onPdf = vi.fn();
    zeigen("de", onPdf);
    fireEvent.click(screen.getByTestId("expose-pdf"));
    expect(onPdf).toHaveBeenCalledTimes(1);
    expect(herunterladen).not.toHaveBeenCalled();
  });
});
