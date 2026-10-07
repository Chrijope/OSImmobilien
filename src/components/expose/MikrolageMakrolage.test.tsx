import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { baueExposeInhalt } from "@/lib/exposeInhalt";
import { MAKROLAGE_LEER, MAKROLAGE_NICHT_GEMESSEN } from "@/lib/makrolage";
import type { ObjektData } from "@/lib/objekteStore";
import { MUSTER_OBJEKT, MUSTER_WE7 } from "@/test/musterobjektWe7";
import { Mikrolage } from "./Mikrolage";

/**
 * Rechts neben der Karte Mikro- und Makrolage (Christian, 24.09.2026), beides
 * aus der gemessenen Standortanalyse. Ohne Messung ein ehrlicher Satz, nie
 * eine erfundene Entfernung. Alle Orte hier sind erfunden.
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

const GEMESSEN = {
  schema: 2,
  messfassung: 2,
  gemessen_am: "2026-09-23T20:00:00Z",
  objekt_koordinaten: { lat: 48.33, lng: 10.87 },
  mikrolage: {
    einkaufen: [{ name: "Testmarkt", typ: "Supermarkt", entfernung_m: 320, lat: 48.331, lng: 10.871 }],
    oepnv: [{ name: "Teststraße", typ: "Bus", entfernung_m: 150, lat: 48.332, lng: 10.872 }],
    hochschulen: [{ name: "Universität Nah", typ: "Hochschule", entfernung_m: 2400, lat: 48.35, lng: 10.9 }],
    kliniken: [{ name: "Klinikum Test", typ: "Krankenhaus", entfernung_m: 4100 }],
    gewerbe: [{ name: "Werk Muster", typ: "Industrie- oder Gewerbefläche", entfernung_m: 1500 }],
  },
  mikrolage_hinweis: "Entfernungen als Luftlinie, Einrichtungen aus OpenStreetMap, Stand der Abfrage.",
};

function zeige(standortanalyse: unknown, meta: Record<string, unknown> = {}) {
  const inhalt = baueExposeInhalt({
    objekt: { ...MUSTER_OBJEKT, meta: { ...MUSTER_OBJEKT.meta, standortanalyse, ...meta } } as ObjektData,
    wohnung: MUSTER_WE7,
    heute: new Date(2026, 8, 24),
  });
  render(<Mikrolage mikrolage={inhalt.mikrolage} titel="Musterstraße 12" />);
  return inhalt;
}

describe("Mikro- und Makrolage neben der Karte", () => {
  it("zeigt links die Karte und rechts daneben Mikrolage und Makrolage mit gemessener Entfernung", () => {
    zeige(GEMESSEN);
    const aufbau = screen.getByTestId("mikrolage-aufbau");
    const karte = within(aufbau).getByTestId("mikrolage-karte");
    const liste = within(aufbau).getByTestId("mikrolage-liste");
    // Karte zuerst, die Liste danach: auf breiten Bildschirmen daneben, auf dem Handy darunter.
    expect(karte.compareDocumentPosition(liste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(liste).toHaveTextContent("Mikrolage");
    expect(within(liste).getByTestId("mikrolage-einkaufen")).toHaveTextContent("Testmarkt");
    const makro = within(liste).getByTestId("makrolage");
    expect(makro).toHaveTextContent("Makrolage");
    expect(within(makro).getByTestId("makrolage-hochschulen")).toHaveTextContent(/Universität Nah.*Hochschule.*2,4\s?km/);
    expect(within(makro).getByTestId("makrolage-kliniken")).toHaveTextContent(/Klinikum Test.*Krankenhaus.*4,1\s?km/);
    // Gewerbeflächen gehören nicht in die Makrolage.
    expect(liste).not.toHaveTextContent("Werk Muster");
    expect(screen.getByTestId("mikrolage-quelle")).toHaveTextContent("OpenStreetMap");
    // Keine Anfrage an einen Geodienst: Alles kommt aus der gespeicherten Messung.
    expect(anfragen).toEqual([]);
  });

  it("zeigt Punkte farbig nach Kategorie mit Legende und rechts Parks und Öffentliche Einrichtungen", () => {
    zeige({
      ...GEMESSEN,
      messfassung: 3,
      mikrolage: {
        ...GEMESSEN.mikrolage,
        parks: [{ name: "Testpark", typ: "Park", entfernung_m: 450, lat: 48.333, lng: 10.873 }],
        kindergaerten: [{ name: "Kita Sonne", entfernung_m: 380, lat: 48.334, lng: 10.874 }],
        behoerden: [{ name: "Rathaus Test", typ: "Rathaus", entfernung_m: 1200, lat: 48.34, lng: 10.88 }],
      },
    });
    // Objekt plus fünf Punkte der Mikrolage; die Makrolage bleibt von der Karte.
    expect(screen.getByTestId("mikrolage-karte-feld").querySelectorAll(".leaflet-marker-icon")).toHaveLength(6);
    const legende = screen.getByTestId("umgebung-legende");
    for (const titel of ["Objekt", "Einkaufen", "Parks und Grün", "Bus und Bahn", "Öffentliche Einrichtungen"]) expect(legende).toHaveTextContent(titel);
    expect(screen.getByTestId("mikrolage-gruen")).toHaveTextContent("Testpark");
    const einrichtungen = screen.getByTestId("mikrolage-einrichtungen");
    expect(within(einrichtungen).getByTestId("mikrolage-einrichtungen-kitas")).toHaveTextContent("Kita Sonne");
    expect(within(einrichtungen).getByTestId("mikrolage-einrichtungen-behoerden")).toHaveTextContent(/Rathaus Test.*Rathaus.*1,2\s?km/);
  });

  it("sagt oben im Kasten, wenn ab der Ortsmitte gemessen wurde", () => {
    zeige({ ...GEMESSEN, genauigkeit: "ort", mikrolage_hinweis: "Entfernungen als Luftlinie. Gemessen ab der Ortsmitte von Augsburg, nicht ab der Hausadresse." });
    expect(screen.getByTestId("umgebung-genauigkeit")).toHaveTextContent("Gemessen ab der Ortsmitte, nicht ab der Haustür.");
    expect(screen.getByTestId("mikrolage-quelle")).toHaveTextContent("Ortsmitte von Augsburg");
    expect(screen.getByTestId("umgebung-legende")).toHaveTextContent("Messpunkt");
  });

  it("sagt ehrlich, wenn im Umkreis nichts erfasst ist", () => {
    zeige({ ...GEMESSEN, mikrolage: { einkaufen: GEMESSEN.mikrolage.einkaufen } });
    expect(screen.getByTestId("makrolage-leer")).toHaveTextContent(MAKROLAGE_LEER);
    expect(screen.queryByTestId("makrolage-hochschulen")).not.toBeInTheDocument();
  });

  it("sagt bei einer älteren Messung, dass die Makrolage noch nicht gemessen ist, statt „keine vorhanden“", () => {
    zeige({ ...GEMESSEN, messfassung: undefined, mikrolage: { einkaufen: GEMESSEN.mikrolage.einkaufen } });
    expect(screen.getByTestId("makrolage-leer")).toHaveTextContent(MAKROLAGE_NICHT_GEMESSEN);
  });

  it("zeigt ohne Messung keine einzige Entfernung und keine Makrolage, nur Adresse und Hinweis", () => {
    zeige(undefined, { koordinaten: { lat: 48.34, lng: 10.89, quelle: "investagon" } });
    const ersatz = screen.getByTestId("mikrolage-ersatz");
    expect(ersatz).toHaveTextContent("Musterstraße 12, 86199 Augsburg");
    expect(ersatz).toHaveTextContent("Die Auswertung der Umgebung liegt noch nicht vor.");
    expect(ersatz.textContent).not.toMatch(/\d\s?(m|km)\b/);
    expect(screen.queryByTestId("makrolage")).not.toBeInTheDocument();
    // Ohne Messung auch keine Legende: Es gibt keine Punkte, nur die Nadel.
    expect(screen.queryByTestId("umgebung-legende")).not.toBeInTheDocument();
    expect(anfragen).toEqual([]);
  });
});
