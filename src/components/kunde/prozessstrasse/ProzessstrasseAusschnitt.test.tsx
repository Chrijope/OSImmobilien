import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProzessstrasseAusschnitt } from "./ProzessstrasseAusschnitt";
import { baueStrasse } from "./prozessstrasseModell";
import { bahnPunkte } from "./StrassenBahn";

// jsdom misst nicht. Die Attrappe meldet eine Kartenbreite von 680 px, also
// fünf Stationen im Ausschnitt.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
      // Wie im Browser: die Messung kommt nach dem ersten Zeichnen.
      setTimeout(() => this.cb([{ contentRect: { width: 680 } } as ResizeObserverEntry], this as unknown as ResizeObserver), 0);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("Prozesslinie im Ausschnitt", () => {
  it("Partner: endet an Fälligkeit, Ziel ist der Haken im Kreis", () => {
    const { container } = render(<ProzessstrasseAusschnitt stufe="reservierung" rolle="vertriebspartner" />);
    expect(screen.getByText("Station 10 von 14")).toBeTruthy();
    expect(screen.queryByText("Abrechnung")).toBeNull();
    expect(screen.queryByText("Abgeschlossen")).toBeNull();
    expect(screen.getByText("Ziel: Fälligkeit")).toBeTruthy();
    expect(container.querySelector(".lucide-circle-check")).toBeTruthy();
    expect(container.querySelector(".lucide-key-round")).toBeNull();
  });

  it("Admin: Ziel Abgeschlossen mit Schlüssel", () => {
    const { container } = render(<ProzessstrasseAusschnitt stufe="reservierung" rolle="admin" />);
    expect(screen.getByText("Station 10 von 16")).toBeTruthy();
    expect(screen.getByText("Ziel: Abgeschlossen")).toBeTruthy();
    expect(container.querySelector(".lucide-key-round")).toBeTruthy();
  });

  it("Partner hinter seinem Ziel: Ziel erreicht, Haken statt Schlüssel", () => {
    const { container } = render(<ProzessstrasseAusschnitt stufe="abrechnung" rolle="vertriebspartner" />);
    expect(screen.getByText("Ziel erreicht")).toBeTruthy();
    expect(container.querySelector(".lucide-key-round")).toBeNull();
  });

  it("zeigt fünf Stationen um die aktuelle", () => {
    render(<ProzessstrasseAusschnitt stufe="reservierung" rolle="admin" />);
    expect(screen.getByText("Zeigt Station 8 bis 12 von 16")).toBeTruthy();
  });

  it("Klick auf eine Station meldet sie dem Kundenprofil", async () => {
    const onStation = vi.fn();
    render(<ProzessstrasseAusschnitt stufe="reservierung" rolle="admin" onStation={onStation} />);
    fireEvent.click(await screen.findByRole("button", { name: "Bonitätsunterlagen, noch offen" }));
    expect(onStation).toHaveBeenCalledTimes(1);
    expect(onStation.mock.calls[0][0].key).toBe("bonitaetsunterlagen");
  });

  it("GS-Kennzeichnung an Notar ab der Stufe Notar", async () => {
    render(<ProzessstrasseAusschnitt stufe="faelligkeit" rolle="admin" grundschuldHochgeladen={false} />);
    expect(await screen.findByText(/ohne GS/)).toBeTruthy();
  });
});

describe("Ebenen je Etappe", () => {
  it("jede Etappe eine Stufe höher, innerhalb gleich hoch", () => {
    const strasse = baueStrasse("reservierung", "admin");
    const y = Object.fromEntries(strasse.stationen.map((s, i) => [s.key, bahnPunkte(strasse, 100)[i].y]));
    expect(y.neuer_lead).toBe(y.follow_up);
    expect(y.objektauswahl).toBe(y.reservierung);
    // Kleinere y-Werte liegen weiter oben.
    expect(y.erstgespraech_geplant).toBeLessThan(y.follow_up);
    expect(y.objektauswahl).toBeLessThan(y.selbstauskunft);
    expect(y.bonitaetsunterlagen).toBeLessThan(y.reservierung);
    expect(y.notar).toBeLessThan(y.finanzierung);
  });
});

describe("Kundenprofil hängt den heutigen Setz-Ablauf an die Prozesslinie", () => {
  const quelle = readFileSync("src/pages/KundenDetail.tsx", "utf8");
  const start = quelle.indexOf("<ProzessstrasseAusschnitt");
  const block = quelle.slice(start, quelle.indexOf("/>\n            );\n          })()}", start));

  it("Rückfrage, Objektpflicht, dann Setzen mit Audit", () => {
    expect(start).toBeGreaterThan(0);
    const reihenfolge = [
      "confirmDialog({",
      "objektDialogNoetig(s.key, inv.id)",
      "updateInvestment(inv.id, { pipelineStufe: s.key });",
      "updateKontakt(id || \"\", { pipelineStufe: s.key });",
      "addAktivitaet(",
    ].map((t) => block.indexOf(t));
    expect(reihenfolge.every((i) => i > 0)).toBe(true);
    expect([...reihenfolge].sort((a, b) => a - b)).toEqual(reihenfolge);
  });

  it("Rolle steuert den Schnitt, Alt+Klick springt zur Karte", () => {
    expect(block).toContain("rolle={user.role}");
    expect(block).toContain("STEP_TO_CARD_ID[s.key]");
    expect(block).toContain("markiereProfilAbschnitt(el)");
  });
});
