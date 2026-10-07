import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UmgebungsKarte } from "./UmgebungsKarte";

/**
 * Die Karte auf Objekt- und Einheitsseite liest seit dem 23.09.2026 nur, was
 * am Objekt gespeichert ist, in derselben Reihenfolge wie im Exposé:
 * gemessene Analyse, dann `meta.koordinaten`, sonst ein ruhiger Satz mit Link.
 * Sie fragt keinen Geodienst mehr.
 */

const anfragen: string[] = [];
beforeEach(() => {
  anfragen.length = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    anfragen.push(String(url));
    return { ok: false, status: 599, json: async () => ({}) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

const ADRESSE = "Danziger Straße 1, 18437 Stralsund";
const ANALYSE = {
  schema: 2, gemessen_am: "2026-09-23T10:00:00Z", objekt_koordinaten: { lat: 54.3087, lng: 13.0741 },
  mikrolage: {
    einkaufen: [{ name: "Markt am Eck", typ: "Supermarkt", entfernung_m: 280, lat: 54.31, lng: 13.075 }],
    oepnv: [{ name: "Haltestelle", typ: "Bus", entfernung_m: 150, lat: 54.309, lng: 13.073 }],
  },
  mikrolage_hinweis: "Entfernungen als Luftlinie, Einrichtungen aus OpenStreetMap, Stand der Abfrage.",
};

describe("UmgebungsKarte ohne Abfrage", () => {
  it("zeigt mit gemessener Analyse Nadel, farbige Punkte mit Legende und rechts den Lagekasten", () => {
    render(<UmgebungsKarte adresse={ADRESSE} titel="Danziger Straße 1" meta={{ standortanalyse: ANALYSE }} />);
    const feld = screen.getByTestId("mikrolage-karte-feld");
    expect(feld.querySelectorAll(".leaflet-marker-icon")).toHaveLength(3);
    const legende = screen.getByTestId("umgebung-legende");
    expect(legende).toHaveTextContent("Objekt");
    expect(legende).toHaveTextContent("Einkaufen");
    expect(legende).toHaveTextContent("Bus und Bahn");
    const [links, rechts] = Array.from(screen.getByTestId("mikrolage-aufbau").children);
    expect(links).toHaveAttribute("data-testid", "mikrolage-karte");
    expect(rechts).toHaveAttribute("data-testid", "mikrolage-liste");
    expect(screen.getByTestId("mikrolage-einkaufen")).toHaveTextContent(/Markt am Eck.*Supermarkt.*300 m · 4 min/);
    expect(screen.getByTestId("mikrolage-verkehr")).toHaveTextContent("Haltestelle");
    expect(screen.getByTestId("mikrolage-quelle")).toHaveTextContent("OpenStreetMap");
    expect(anfragen).toEqual([]);
  });

  it("zeigt ohne Analyse die gespeicherte Lage mit Nadel und sagt, dass die Umgebung noch folgt", () => {
    render(<UmgebungsKarte adresse={ADRESSE} meta={{ koordinaten: { lat: 54.3087, lng: 13.0741, quelle: "investagon" } }} />);
    expect(screen.getByTestId("mikrolage-karte-feld").querySelectorAll(".leaflet-marker-icon")).toHaveLength(1);
    expect(screen.getByTestId("umgebungskarte")).toHaveTextContent("Die Auswertung der Umgebung liegt noch nicht vor.");
    expect(screen.getByTestId("umgebungskarte").textContent).not.toMatch(/\d\s?(m|km)\b/);
    expect(screen.queryByTestId("umgebung-legende")).not.toBeInTheDocument();
    expect(anfragen).toEqual([]);
  });

  it("nennt im CRM den Grund, wenn die Messung an der Adresse scheiterte", () => {
    render(<UmgebungsKarte adresse={ADRESSE} meta={{ standortanalyseFehler: { art: "adresse", grund: "x" } }} />);
    expect(screen.getByTestId("umgebungskarte-fehler")).toHaveTextContent("Adresse am Objekt prüfen");
  });

  it("zeigt ohne Lage ruhig den Satz und den Weg zu OpenStreetMap, ohne Karte und ohne Anfrage", () => {
    render(<UmgebungsKarte adresse={ADRESSE} meta={{}} />);
    const hinweis = screen.getByTestId("umgebungskarte-ohne-lage");
    expect(hinweis).toHaveTextContent("Die Karte zur Lage folgt.");
    expect(screen.getByRole("link", { name: "In OpenStreetMap ansehen" })).toHaveAttribute(
      "href", `https://www.openstreetmap.org/search?query=${encodeURIComponent(ADRESSE)}`,
    );
    expect(screen.queryByTestId("umgebungskarte-feld")).not.toBeInTheDocument();
    expect(anfragen).toEqual([]);
  });

  it("traut einer alten, erfundenen Analyse ohne Schema 2 keine Koordinaten", () => {
    render(<UmgebungsKarte adresse={ADRESSE} meta={{ standortanalyse: { objekt_koordinaten: { lat: 1, lng: 2 }, mikrolage: {} } }} />);
    expect(screen.getByTestId("umgebungskarte-ohne-lage")).toBeInTheDocument();
  });
});
