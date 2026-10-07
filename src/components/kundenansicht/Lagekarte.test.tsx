import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { baueExposeInhalt } from "@/lib/exposeInhalt";
import { MUSTER_OBJEKT, MUSTER_WE7 } from "@/test/musterobjektWe7";
import type { ObjektData } from "@/lib/objekteStore";
import { Lagekarte } from "./KundenBausteine";

/**
 * Die Lagekarte der Kundenansicht ist dieselbe Karte wie im Exposé. Bis zum
 * 23.09.2026 fehlte sie ohne gemessene Analyse ganz. Seitdem steht sie da,
 * sobald die Adresse reicht; die Nadel kommt nur aus gespeicherten Daten
 * (`meta.koordinaten`), eine Adresssuche im Browser gibt es nicht.
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

const inhaltFuer = (aenderung: Partial<ObjektData>, meta: Record<string, unknown> = {}) =>
  baueExposeInhalt({
    objekt: { ...MUSTER_OBJEKT, ...aenderung, meta: { ...MUSTER_OBJEKT.meta, standortanalyse: undefined, ...meta } } as ObjektData,
    wohnung: MUSTER_WE7,
    heute: new Date(2026, 8, 23),
  });

describe("Lagekarte der Kundenansicht", () => {
  it("zeigt ohne gemessene Analyse die Karte aus der gespeicherten Lage, rechts den Hinweis", () => {
    const inhalt = inhaltFuer({}, { koordinaten: { lat: 48.34, lng: 10.89, quelle: "investagon" } });
    render(<Lagekarte mikrolage={inhalt.mikrolage} titel="Musterstraße 12" />);
    expect(screen.getByTestId("kunden-lagekarte")).toHaveTextContent("Lage und Umgebung");
    expect(screen.getByTestId("mikrolage-ersatz")).toHaveTextContent("Musterstraße 12, 86199 Augsburg");
    expect(screen.getByTestId("mikrolage-karte-feld")).toBeInTheDocument();
    expect(anfragen).toEqual([]);
  });

  it("zeigt ohne Lage ruhig den Satz, dass die Karte folgt, und fragt niemanden", () => {
    const inhalt = inhaltFuer({});
    render(<Lagekarte mikrolage={inhalt.mikrolage} titel="Musterstraße 12" />);
    expect(screen.getByTestId("mikrolage-karte-ersatz")).toHaveTextContent("Die Karte zur Lage folgt.");
    expect(screen.queryByTestId("mikrolage-karte-feld")).not.toBeInTheDocument();
    expect(anfragen).toEqual([]);
  });

  it("zeigt ohne brauchbare Adresse und ohne Lage gar nichts, statt eines leeren Kastens", () => {
    const inhalt = inhaltFuer({ adresse: "" });
    const { container } = render(<Lagekarte mikrolage={inhalt.mikrolage} titel="Objekt" />);
    expect(container).toBeEmptyDOMElement();
  });
});
