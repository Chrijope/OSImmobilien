import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { objektauswahlFreigeschaltet } from "@/lib/investmentFreischaltung";
import type { InvestmentBerechnung } from "@/lib/investmentBerechnungenStore";

/**
 * Eine gespeicherte Berechnung wird immer gezeigt.
 *
 * Christians Befund vom 21.09.2026: Bei einem Kunden ohne ausgefuellte
 * Selbstauskunft stand unter „Berechnungen" trotzdem „noch keine Berechnung
 * gespeichert", obwohl eine am Investment hing. Grund war nicht das Laden,
 * sondern die Karte darum herum: Der Abschnitt steckte allein in der
 * freigeschalteten Objektauswahl. Sichtbar wurde die Berechnung erst, nachdem
 * der Schalter „Kunde finanziert selbst" einmal an und wieder aus war, weil
 * das den Vorgang auf die Stufe „Objektauswahl" hob.
 */

const berechnung: InvestmentBerechnung = {
  id: "ber-1",
  investment_id: "inv-1",
  kontakt_id: "k-1",
  wohnung_id: null,
  name: "Roonstraße 3, WE 6",
  eingabe: {} as InvestmentBerechnung["eingabe"],
  knk: { weg: "bundesland", bundesland: "NW" },
  unterlagen: null,
  kennzahlen: {
    kaufpreis: 280000,
    eigenkapital: 30000,
    cashflowMonatNachSteuern: -120,
    bruttorendite: 0.0412,
    irr: 0.061,
  },
  herkunft: {},
  erstellt_von: null,
  erstellt_am: "2026-09-18T10:00:00.000Z",
  geaendert_am: "2026-09-18T10:00:00.000Z",
};

const gespeicherte: InvestmentBerechnung[] = [];

vi.mock("@/lib/investmentBerechnungenStore", async () => {
  const echt = await vi.importActual<typeof import("@/lib/investmentBerechnungenStore")>(
    "@/lib/investmentBerechnungenStore",
  );
  return {
    ...echt,
    ladeBerechnungen: async () => ({ berechnungen: [...gespeicherte], migrationFehlt: false, fehler: null }),
    loescheBerechnung: async () => ({ erfolg: true, migrationFehlt: false, fehler: null }),
  };
});

vi.mock("@/lib/loadAllUsers", () => ({ loadAllUsers: () => [] }));

const { InvestmentBerechnungen } = await import("@/components/kunden/InvestmentBerechnungen");

function zeigeGesperrt() {
  return render(
    <InvestmentBerechnungen investmentId="inv-1" darfPflegen={false} nurWennVorhanden onNavigate={() => {}} />,
  );
}

describe("Der gemeldete Fall: keine Selbstauskunft, Schalter aus, Berechnung vorhanden", () => {
  it("laesst die Objektauswahl gesperrt", () => {
    // Genau die Lage des Kunden: nichts unterschrieben, kein Vermerk, und die
    // Stufe noch vor der Objektauswahl.
    expect(
      objektauswahlFreigeschaltet({ saLiegtVor: false, saEntfaellt: false, stufeErreicht: false }),
    ).toBe(false);
  });

  it("zeigt die gespeicherte Berechnung trotzdem", async () => {
    gespeicherte.splice(0, gespeicherte.length, berechnung);
    zeigeGesperrt();
    expect(await screen.findByText("Roonstraße 3, WE 6")).toBeTruthy();
    expect(screen.getByText("Berechnungen")).toBeTruthy();
  });

  it("bietet dort weder Anlegen noch Loeschen an, die Karte bleibt gesperrt", async () => {
    gespeicherte.splice(0, gespeicherte.length, berechnung);
    zeigeGesperrt();
    await screen.findByText("Roonstraße 3, WE 6");
    expect(screen.queryByRole("button", { name: /Neue Berechnung/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /löschen/i })).toBeNull();
  });

  it("zeichnet ohne gespeicherte Berechnung gar nichts", async () => {
    gespeicherte.splice(0, gespeicherte.length);
    const { container } = zeigeGesperrt();
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(screen.queryByText("Berechnungen")).toBeNull();
  });
});

describe("In der freigeschalteten Karte bleibt alles wie bisher", () => {
  it("nennt ohne Berechnung weiter den bekannten Satz", async () => {
    gespeicherte.splice(0, gespeicherte.length);
    render(<InvestmentBerechnungen investmentId="inv-1" darfPflegen onNavigate={() => {}} />);
    expect(
      await screen.findByText("Für dieses Investment ist noch keine Berechnung gespeichert."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Neue Berechnung/ })).toBeTruthy();
  });
});

describe("Die gesperrte Objektauswahl im Quelltext", () => {
  /*
   * Die Seite ist zu gross, um sie in einem Test aufzubauen. Dieselbe
   * Vorgehensweise wie in `objektauswahlImmerSichtbar.test.ts`: Der Quelltext
   * haelt die Zusage fest, damit sie sich nicht still zurueckdrehen laesst.
   */
  const kundenDetail = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");

  it("traegt den Abschnitt Berechnungen auch in der gesperrten Karte", () => {
    const gesperrterZweig = kundenDetail.slice(
      kundenDetail.indexOf("{!objektauswahlFrei ? ("),
      kundenDetail.indexOf("</LockedPhaseCard>"),
    );
    expect(gesperrterZweig).toContain("<InvestmentBerechnungen");
    expect(gesperrterZweig).toContain("nurWennVorhanden");
    expect(gesperrterZweig).toContain("darfPflegen={false}");
  });
});
