import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { ObjektWohnung } from "@/lib/objekteStore";
import type { BelegungsKontext } from "@/lib/einheitBelegung";
import { EinheitVerkaufsstatus } from "./EinheitVerkaufsstatus";

/**
 * Der Verkaufsstatus im Objektassistenten (Christian, 23.09.2026).
 *
 *   - Vorhandene Einheit: nur Anzeige mit Kennzeichen, Kunde und Datum, und
 *     dem Satz, wo reserviert wird. Keine Auswahl, denn `saveObjekt` schreibt
 *     den Status dort nie.
 *   - Namen nur für Rollen, die sie sehen dürfen (`belegungsAnzeige`).
 *   - Neue Einheit: Auswahl, „Reserviert“ nur für Rollen, die reservieren
 *     dürfen.
 */

const SATZ = "Reserviert wird über die Einheitsseite oder das Kundenprofil.";

function einheit(felder: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return {
    id: "w-1", weNr: "3", etage: "1. OG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 500, vkGesamt: 200000,
    qmPreis: 4000, rendite: 3, vermietet: true, status: "reserviert",
    kundeId: "k-1", kundeName: "Max Kunde", beraterName: "Anna Muster", reserviertAm: "2026-09-12", reserviertVon: "u-anna",
    ...felder,
  };
}

const ADMIN: BelegungsKontext = { rolle: "admin", benutzerId: "u-admin", name: "Christian" };

// Radix arbeitet mit Zeigerereignissen, die jsdom nicht kennt.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => cleanup());

function auswahl(): HTMLElement | null {
  return document.querySelector('[aria-label="Verkaufsstatus"]');
}

function oeffneAuswahl() {
  fireEvent.keyDown(auswahl()!, { key: "Enter" });
}

function option(name: string): HTMLElement | undefined {
  return screen.queryAllByText(name).map((el) => el.closest<HTMLElement>('[role="option"]')).find(Boolean) ?? undefined;
}

describe("vorhandene Einheit", () => {
  it("zeigt den Status ohne Auswahl, mit Kunde, Datum und dem Satz zum Reservierungsweg", () => {
    render(<EinheitVerkaufsstatus vorhandene={einheit()} onWaehlen={() => undefined} kontext={ADMIN} />);
    expect(auswahl()).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    const anzeige = screen.getByTestId("verkaufsstatus-anzeige");
    expect(within(anzeige).getByText("reserviert")).toBeInTheDocument();
    expect(within(anzeige).getByText("Max Kunde")).toBeInTheDocument();
    expect(within(anzeige).getByText("VP: Anna Muster")).toBeInTheDocument();
    expect(within(anzeige).getByText("reserviert am 12.09.2026")).toBeInTheDocument();
    expect(within(anzeige).getByText(SATZ)).toBeInTheDocument();
  });

  it("zeigt eine freie Einheit als frei, ohne Belegungsangaben", () => {
    const frei = einheit({ status: "frei", kundeId: undefined, kundeName: undefined, beraterName: undefined, reserviertAm: undefined, reserviertVon: undefined });
    render(<EinheitVerkaufsstatus vorhandene={frei} onWaehlen={() => undefined} kontext={ADMIN} />);
    expect(auswahl()).toBeNull();
    expect(screen.getByText("frei")).toBeInTheDocument();
    expect(screen.queryByTestId("belegung-angaben")).toBeNull();
    expect(screen.getByText(SATZ)).toBeInTheDocument();
  });

  it("zeigt eine verkaufte Einheit als verkauft", () => {
    render(<EinheitVerkaufsstatus vorhandene={einheit({ status: "verkauft" })} onWaehlen={() => undefined} kontext={ADMIN} />);
    expect(auswahl()).toBeNull();
    expect(screen.getAllByText("verkauft").length).toBeGreaterThan(0);
  });

  it("nennt eine in Investagon belegte Einheit ohne Vorgang im CRM so", () => {
    const fremd = einheit({
      kundeId: undefined, kundeName: undefined, beraterName: undefined, reserviertAm: undefined, reserviertVon: undefined,
      investagonId: "inv-7", investagonRaw: { statusName: "Notartermin" },
    });
    render(<EinheitVerkaufsstatus vorhandene={fremd} onWaehlen={() => undefined} kontext={ADMIN} />);
    expect(screen.getByText("über Investagon")).toBeInTheDocument();
  });
});

describe("Namen je Rolle", () => {
  it.each(["admin", "inhaber", "vertriebsleiter", "backoffice"])("%s sieht Kunde und Partner", (rolle) => {
    render(<EinheitVerkaufsstatus vorhandene={einheit()} onWaehlen={() => undefined} kontext={{ rolle, benutzerId: "u-x", name: "Jemand" }} />);
    expect(screen.getByText("Max Kunde")).toBeInTheDocument();
    expect(screen.getByText("VP: Anna Muster")).toBeInTheDocument();
  });

  it.each(["objektpartner", "vertriebspartner", "hausverwaltung"])("%s sieht bei einem fremden Kunden nur das Datum", (rolle) => {
    render(<EinheitVerkaufsstatus vorhandene={einheit()} onWaehlen={() => undefined} kontext={{ rolle, benutzerId: "u-x", name: "Jemand" }} />);
    expect(screen.queryByText("Max Kunde")).toBeNull();
    expect(screen.queryByText(/VP:/)).toBeNull();
    expect(screen.getByText("reserviert am 12.09.2026")).toBeInTheDocument();
    expect(screen.getByText("reserviert")).toBeInTheDocument();
  });

  it("die Vertriebspartnerin sieht ihren eigenen Kunden", () => {
    render(<EinheitVerkaufsstatus vorhandene={einheit()} onWaehlen={() => undefined}
      kontext={{ rolle: "vertriebspartner", benutzerId: "u-anna", name: "Anna Muster" }} />);
    expect(screen.getByText("Max Kunde")).toBeInTheDocument();
  });
});

describe("neue Einheit", () => {
  it("bietet die Auswahl, ohne den Satz, und meldet die Wahl", () => {
    const waehlen = vi.fn();
    render(<EinheitVerkaufsstatus wert="frei" onWaehlen={waehlen} kontext={ADMIN} />);
    expect(auswahl()).not.toBeNull();
    expect(screen.queryByTestId("verkaufsstatus-anzeige")).toBeNull();
    expect(screen.queryByText(SATZ)).toBeNull();
    oeffneAuswahl();
    expect(option("Reserviert")).toBeDefined();
    fireEvent.click(option("Verkauft")!);
    expect(waehlen).toHaveBeenCalledWith("verkauft");
  });

  it("steht ohne Wert auf „Frei“", () => {
    render(<EinheitVerkaufsstatus onWaehlen={() => undefined} kontext={ADMIN} />);
    expect(auswahl()!.textContent).toBe("Frei");
  });

  it("bietet „Reserviert“ nicht an, wenn die Rolle nicht reservieren darf", () => {
    render(<EinheitVerkaufsstatus wert="frei" onWaehlen={() => undefined} kontext={{ rolle: "objektpartner" }} />);
    oeffneAuswahl();
    expect(option("Verkauft")).toBeDefined();
    expect(option("Reserviert")).toBeUndefined();
  });

  it("zeigt einen alten Stand „reserviert“ weiter an, aber nicht wählbar", () => {
    render(<EinheitVerkaufsstatus wert="reserviert" onWaehlen={() => undefined} kontext={{ rolle: "objektpartner" }} />);
    expect(auswahl()!.textContent).toBe("Reserviert");
    oeffneAuswahl();
    expect(option("Reserviert")).toHaveAttribute("data-disabled");
  });
});
