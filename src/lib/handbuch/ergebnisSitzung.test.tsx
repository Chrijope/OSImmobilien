/**
 * HB-006: Das frische Handbuch-Ergebnis übersteht den Sprachwechsel und das
 * Neuladen.
 *
 * Vorher setzte der Umschalter DE/EN die Adresse ohne den Zustand der
 * Navigation neu, und /handbuch/ergebnis/neu zeigte „ungültiger Link“.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SeitenSpracheProvider, SeitenSprachUmschalter } from "@/components/SeitenSprache";
import { ERGEBNIS_SITZUNG_SCHLUESSEL, leseFrischesErgebnis, merkeFrischesErgebnis } from "./ergebnisSitzung";
import type { HandbuchErgebnisZustand } from "@/pages/HandbuchLanding";

// Das Radix-Menü hängt in jsdom, geprüft wird nur die Verdrahtung.
vi.mock("@/components/kunde/portal/LanguageToggle", () => ({
  LanguageToggle: ({ onChange }: { onChange: (s: "de" | "en") => void }) => (
    <button type="button" onClick={() => onChange("en")}>
      EN
    </button>
  ),
}));

const ERGEBNIS: HandbuchErgebnisZustand = {
  antworten: {
    ziel: "vermoegen",
    beruf: "angestellt",
    brutto: "80_120",
    ueberschuss: "1000_1500",
    eigenkapital: "30_60",
    start: "drei_monate",
  },
  vorname: "Erika",
  nachname: "Muster",
  handbuchToken: "a".repeat(64),
  saToken: "sa-token",
  beraterSlug: "timo-blum",
};

function speicherErsatz() {
  const werte = new Map<string, string>();
  const speicher = {
    getItem: (k: string) => werte.get(k) ?? null,
    setItem: (k: string, v: string) => void werte.set(k, String(v)),
    removeItem: (k: string) => void werte.delete(k),
  };
  vi.stubGlobal("localStorage", { ...speicher });
  vi.stubGlobal("sessionStorage", speicher);
  return speicher;
}

let speicher: ReturnType<typeof speicherErsatz>;
beforeEach(() => {
  speicher = speicherErsatz();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.lang = "de";
});

function Stand() {
  const ort = useLocation();
  const z = ort.state as HandbuchErgebnisZustand | null;
  return <p data-testid="stand">{`${ort.search}|${z?.vorname ?? "ohne"}`}</p>;
}

describe("Sprachwechsel", () => {
  it("behält den Navigationszustand", () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/handbuch/ergebnis/neu", state: ERGEBNIS }]}>
        <SeitenSpracheProvider>
          <SeitenSprachUmschalter />
          <Stand />
        </SeitenSpracheProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("stand")).toHaveTextContent("|Erika");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByTestId("stand")).toHaveTextContent("?lang=en|Erika");
  });
});

describe("Merken für die Sitzung", () => {
  it("liest zurück, was die Ergebnisseite braucht", () => {
    merkeFrischesErgebnis(ERGEBNIS);
    expect(leseFrischesErgebnis()).toEqual(ERGEBNIS);
  });

  it("speichert keine Kontaktdaten, auch wenn sie mitkommen", () => {
    merkeFrischesErgebnis({ ...ERGEBNIS, email: "erika@example.org", telefon: "0151" } as HandbuchErgebnisZustand);
    const roh = speicher.getItem(ERGEBNIS_SITZUNG_SCHLUESSEL) || "";
    expect(roh).not.toContain("erika@example.org");
    expect(roh).not.toContain("0151");
  });

  it("verwirft Unbrauchbares", () => {
    expect(leseFrischesErgebnis()).toBeNull();
    speicher.setItem(ERGEBNIS_SITZUNG_SCHLUESSEL, "{kaputt");
    expect(leseFrischesErgebnis()).toBeNull();
    speicher.setItem(ERGEBNIS_SITZUNG_SCHLUESSEL, JSON.stringify({ ...ERGEBNIS, antworten: { ziel: "x" } }));
    expect(leseFrischesErgebnis()).toBeNull();
  });

  it("bricht nicht, wenn der Speicher gesperrt ist", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("gesperrt");
      },
      setItem: () => {
        throw new Error("gesperrt");
      },
    });
    expect(() => merkeFrischesErgebnis(ERGEBNIS)).not.toThrow();
    expect(leseFrischesErgebnis()).toBeNull();
  });
});
