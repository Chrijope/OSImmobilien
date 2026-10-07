import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ObjektData } from "@/lib/objekteStore";
import { EinheitInvestmentrechner } from "./EinheitInvestmentrechner";

/**
 * Der Reiter selbst: oben die Aufstellung, was übernommen wurde und was fehlt,
 * darunter der Rechner mit den Zahlen der Einheit.
 */

// Die Fotos lädt der Rechner übers Netz. Hier geht es nur darum, welche er anfragt.
const bilderLaden = vi.hoisted(() => vi.fn(async () => [] as string[]));
vi.mock("@/lib/investmentrechner/rechnerBilder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/investmentrechner/rechnerBilder")>()),
  ladeRechnerBilder: bilderLaden,
}));

const objekt: ObjektData = {
  id: "o1", titel: "Musterwohnanlage", adresse: "Musterstraße 12", plz: "86150", ort: "Augsburg",
  beschreibung: "", highlights: [], bildUrl: "", bilder: [], dokumente: [],
  videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0,
  renditeVon: 0, renditeBis: 0, sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01",
  afaDaten: { afaModell: "linear", afaSatz: 2.5, restnutzungsdauer: 40, grundstueckAnteil: 20 },
  globalDaten: { baujahr: 1962 } as ObjektData["globalDaten"],
  meta: {},
  wohnungen: [
    {
      id: "w7", weNr: "WE 7", etage: "2. OG", lage: "rechts", groesse: 61.4, zimmer: 3,
      mieteGesamt: 790, vkGesamt: 232000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei",
      stellplatzPreis: 9500, stellplatzMiete: 40, hausgeldNichtUmlagefaehigEuro: 45,
    },
  ],
} as ObjektData;

const heute = new Date(2026, 8, 2);

const zeige = (o: ObjektData = objekt) =>
  render(
    <TooltipProvider>
      <EinheitInvestmentrechner objekt={o} wohnung={o.wohnungen[0]} heute={heute} />
    </TooltipProvider>,
  );

describe("Reiter Investmentrechner", () => {
  it("zeigt die Vorbelegung, die offenen Felder und den Rechner mit den Zahlen der Einheit", () => {
    zeige();

    const uebersicht = screen.getByTestId("vorbelegung-uebersicht");
    // Seit dem 23.09.2026 zugeklappt, deshalb erst aufklappen.
    fireEvent.click(screen.getByTestId("vorbelegung-umschalter"));
    // Seit dem 25.09.2026 heißt das Feld „Kaufpreis“, der Gesamtkaufpreis.
    expect(uebersicht).toHaveTextContent("Kaufpreis");
    expect(uebersicht).toHaveTextContent("241.500");
    expect(uebersicht).toHaveTextContent("Kommt vom Kunden");
    expect(uebersicht).toHaveTextContent("Eigenkapital");
    // Der Rechner darunter trägt die Bezeichnung der Einheit.
    expect(screen.getAllByText("Musterwohnanlage, WE 7").length).toBeGreaterThan(0);
    // Keine zweite Seitenüberschrift unter der Überschrift der Einheitenseite.
    expect(screen.queryByRole("heading", { level: 1, name: "Investmentrechner" })).not.toBeInTheDocument();
  });

  it("rechnet sofort mit den Zahlen der Einheit und sagt, warum ohne zvE keine Steuerwirkung entsteht (30.09.2026)", () => {
    const gemeldet = vi.fn();
    render(
      <TooltipProvider>
        <EinheitInvestmentrechner objekt={objekt} wohnung={objekt.wohnungen[0]} heute={heute} onErgebnis={gemeldet} />
      </TooltipProvider>,
    );
    const { eingabe, ergebnis } = gemeldet.mock.calls.at(-1)![0];
    // Kaufpreis 232.000 plus Stellplatz 9.500, AfA-Satz aus dem Objekt.
    expect(eingabe.purchasePrice).toBe(241500);
    expect(eingabe.buildingDepreciationRate).toBe(2.5);
    // Kein Einkommen vorbelegt: Cashflow vor und nach Steuer gleich, mit Hinweis.
    expect(ergebnis.years[0].cashflowAfterTax).toBeCloseTo(ergebnis.years[0].cashflowBeforeTax, 6);
    expect(screen.getAllByTestId("hinweis-ohne-steuerwirkung")[0]).toHaveTextContent("Bitte das zvE");
  });

  it("klappt die Angaben aus der Objektanlage zu, Überschrift, Pfeil und Zähler bleiben sichtbar", () => {
    zeige();

    const umschalter = screen.getByTestId("vorbelegung-umschalter");
    expect(umschalter).toHaveTextContent("Angaben aus der Objektanlage");
    expect(umschalter).toHaveAttribute("aria-expanded", "false");
    expect(umschalter.querySelector("svg")).not.toBeNull();
    const uebersicht = screen.getByTestId("vorbelegung-uebersicht");
    expect(uebersicht).toHaveTextContent("übernommen");
    expect(uebersicht).toHaveTextContent("offen");
    expect(uebersicht).not.toHaveTextContent("241.500");
    expect(uebersicht).not.toHaveTextContent("Vorgaben des Rechners");

    fireEvent.click(umschalter);
    expect(umschalter).toHaveAttribute("aria-expanded", "true");
    expect(uebersicht).toHaveTextContent("Vorgaben des Rechners");

    fireEvent.click(umschalter);
    expect(uebersicht).not.toHaveTextContent("241.500");
  });

  it("sagt oben, wofür der Reiter da ist und wann „Finanzen“ reicht", () => {
    zeige();
    const zweck = screen.getByTestId("reiter-zweck");
    expect(zweck).toHaveTextContent("Genaue Berechnung für einen bestimmten Kunden");
    expect(zweck).toHaveTextContent("Kundenprofil und Selbstauskunft");
    expect(zweck).toHaveTextContent("Berechnungs-PDF");
    expect(zweck).toHaveTextContent("Finanzen");
    // Keine Gedankenstriche in Texten, die Nutzer sehen.
    expect(zweck.textContent).not.toMatch(/[–—]/);
  });

  it("fragt die Fotos der Einheit vor denen des Objekts an", async () => {
    const mitBildern = {
      ...objekt,
      bildUrl: "/o/titel.jpg",
      bilder: [{ id: "o1", url: "/o/1.jpg", alt: "", reihenfolge: 1 }],
      wohnungen: [{ ...objekt.wohnungen[0], bilder: [{ id: "w1", url: "/w/1.jpg", alt: "", reihenfolge: 1 }] }],
    } as ObjektData;
    zeige(mitBildern);
    expect(bilderLaden).toHaveBeenCalledWith(["/w/1.jpg", "/o/titel.jpg", "/o/1.jpg"]);
    // Die Antwort der Attrappe abwarten, damit der Rechner zur Ruhe kommt.
    await act(async () => {});
  });
});
