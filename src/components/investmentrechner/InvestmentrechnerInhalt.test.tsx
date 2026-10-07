import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe } from "@/lib/investmentrechner/rechenkern";
import { standardKaufnebenkostenauswahl } from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { eigeneBerechnung, InvestmentrechnerInhalt, startZustand } from "./InvestmentrechnerInhalt";

const pdf = vi.hoisted(() => ({ herunterladen: vi.fn(async () => "Berechnung_Musterwohnanlage_WE-7_2026-09-28.pdf") }));
vi.mock("@/lib/investmentrechner/berechnungAnsichtPdf", () => ({ ladeBerechnungsansichtHerunter: pdf.herunterladen }));

/**
 * Der Rechner wird an zwei Stellen benutzt: als Seite in der Seitenleiste und
 * als Reiter auf der Einheitenseite. Geprüft wird hier vor allem, dass die
 * Seite in der Seitenleiste davon nichts merkt.
 */

const vorbelegung = {
  eingabe: { ...standardEingabe, propertyTitle: "Musterwohnanlage, WE 7", purchasePrice: 241500, monthlyColdRent: 830 },
  knk: { weg: "bundesland" as const, bundesland: "bayern" },
};

describe("Startzustand", () => {
  it("ist ohne Vorbelegung unverändert die Standardeingabe", () => {
    // Der Rechenkern ist eine reine Funktion der Eingabe. Startet die Seite mit
    // derselben Eingabe wie bisher, rechnet sie auch dasselbe.
    expect(startZustand().eingabe).toBe(standardEingabe);
    expect(startZustand().knk).toBe(standardKaufnebenkostenauswahl);
    expect(startZustand().photos).toEqual([]);
    expect(startZustand().documents).toEqual([]);
    expect(berechneInvestment(startZustand().eingabe)).toEqual(berechneInvestment(standardEingabe));
  });

  it("übernimmt mit Vorbelegung deren Eingabe und Kaufnebenkostenweg", () => {
    const zustand = startZustand(vorbelegung);
    expect(zustand.eingabe.purchasePrice).toBe(241500);
    expect(zustand.knk).toEqual({ weg: "bundesland", bundesland: "bayern" });
    // Fotos und Unterlagen bleiben leer, sie liegen nur im Arbeitsspeicher.
    expect(zustand.photos).toEqual([]);
    expect(zustand.documents).toEqual([]);
  });
});

/** Die Info-Symbole des Rechners brauchen den Provider, den App.tsx stellt. */
const zeige = (inhalt: React.ReactNode) => render(<TooltipProvider>{inhalt}</TooltipProvider>);

describe("Darstellung", () => {
  it("zeigt ohne Angaben die Überschrift der Seite und einen leeren Rechner", () => {
    zeige(<InvestmentrechnerInhalt />);
    expect(screen.getByRole("heading", { level: 1, name: "Investmentkalkulation" })).toBeInTheDocument();
    expect(screen.getByText("Neue Investmentkalkulation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Neu starten/ })).toBeInTheDocument();
  });

  it("lässt im Reiter die Überschrift weg und zeigt die vorbelegten Zahlen", () => {
    zeige(<InvestmentrechnerInhalt vorbelegung={vorbelegung} mitUeberschrift={false} />);
    expect(screen.queryByRole("heading", { level: 1, name: "Investmentkalkulation" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Musterwohnanlage, WE 7").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Auf Objektdaten zurücksetzen/ })).toBeInTheDocument();
  });
});

describe("Stand für den OS Lotsen (LOTSE-R3-002)", () => {
  it("meldet, ob die Rechnung kundenbezogen ist (LOTSE2-002)", () => {
    const ohne = vi.fn();
    const erste = zeige(<InvestmentrechnerInhalt vorbelegung={vorbelegung} mitUeberschrift={false} onErgebnis={ohne} />);
    expect(ohne).toHaveBeenLastCalledWith(expect.objectContaining({ kundenbezogen: false }));
    erste.unmount();
    const mit = vi.fn();
    zeige(<InvestmentrechnerInhalt vorbelegung={vorbelegung} mitUeberschrift={false} start={{ kundeId: "k1" }} onErgebnis={mit} />);
    expect(mit).toHaveBeenLastCalledWith(expect.objectContaining({ kundenbezogen: true }));
  });

  it("meldet immer das eigene Objekt, nie das gewählte Vergleichsobjekt", () => {
    const eigenes = { eingabe: "A" };
    const vergleich = { eingabe: "B", vergleich: true };
    expect(eigeneBerechnung([eigenes, vergleich], ["erg A", "erg B"])).toEqual({ eingabe: "A", ergebnis: "erg A" });
  });

  it("ist das eigene Objekt entfernt, gibt es nichts Neues zu melden", () => {
    expect(eigeneBerechnung([{ eingabe: "B", vergleich: true }], ["erg B"])).toBeNull();
  });
});

describe("Druck bei eingehängtem, verstecktem Rechner (LOTSE-R3-004)", () => {
  it("setzt die Druckklasse nur, solange der Rechner sichtbar ist", () => {
    const { rerender, unmount } = zeige(<InvestmentrechnerInhalt vorbelegung={vorbelegung} sichtbar={false} />);
    expect(document.body.classList.contains("investmentrechner-druck")).toBe(false);
    rerender(<TooltipProvider><InvestmentrechnerInhalt vorbelegung={vorbelegung} sichtbar /></TooltipProvider>);
    expect(document.body.classList.contains("investmentrechner-druck")).toBe(true);
    unmount();
    expect(document.body.classList.contains("investmentrechner-druck")).toBe(false);
  });
});

describe("Berechnung herunterladen (28.09.2026)", () => {
  it("speichert die Berechnung als PDF-Datei, ohne Druckdialog", async () => {
    const drucken = vi.spyOn(window, "print").mockImplementation(() => {});
    zeige(<InvestmentrechnerInhalt vorbelegung={vorbelegung} mitUeberschrift={false} />);
    expect(screen.queryByRole("button", { name: /Drucken/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Berechnung herunterladen" }));
    await waitFor(() => expect(pdf.herunterladen).toHaveBeenCalledTimes(1));
    const [objekte, sprache, druckdokument] = pdf.herunterladen.mock.calls[0] as unknown as [{ input: { propertyTitle: string } }[], string, HTMLElement];
    expect(objekte).toHaveLength(1);
    expect(objekte[0].input.propertyTitle).toBe("Musterwohnanlage, WE 7");
    expect(sprache).toBe("de");
    expect(druckdokument.querySelectorAll(".expose-page")).toHaveLength(8);
    expect(drucken).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Berechnung herunterladen" })).toBeEnabled());
    drucken.mockRestore();
  });
});
