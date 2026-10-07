import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ObjektData } from "@/lib/objekteStore";

/**
 * Der Pflegedialog „Objektangaben pflegen“ darf beim Speichern nichts
 * Abgeleitetes als Handeingabe nach `meta` schreiben.
 *
 * Bis zum 23.09.2026 las er die Anzeige samt Rückfällen. Ein einziges
 * Speichern ohne Änderung machte dann aus dem Investagon-Freitext eine
 * gepflegte Kurzbeschreibung, aus „inklusive“ einen Verwalternamen und aus
 * der Energieklasse der Objektanlage eine gepflegte Klasse.
 */

const gespeichert = vi.hoisted(() => ({ aufrufe: [] as Array<{ id: string; felder: Record<string, unknown> }> }));

vi.mock("@/lib/objekteStore", () => ({
  updateObjektFieldFast: async (id: string, felder: Record<string, unknown>) => {
    gespeichert.aufrufe.push({ id, felder });
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { ObjektseiteFelderDialog } = await import("./ObjektseiteFelderDialog");

function investagonObjekt(meta: Record<string, unknown> = {}): ObjektData {
  return {
    id: "o1", titel: "13. Landsbergerstraße 22a (Co-Living)", badge: "", wohnungen: [],
    globalDaten: { energieeffizienzklasse: "D", etagen: 4 },
    meta: {
      investagonSlug: "abc",
      investagonRaw: {
        extras: [{ id: 1, value: "Dach und Fassade wurden bereits renoviert.", weight: 0 }],
        tags: ["4. 360°-Verwaltung: inklusive", "5. Energieeffizienzklasse: C"],
        energy_certificate_type: "consumption_certificate",
      },
      objekttexteKi: { sanierungen: [{ jahr: "2024", massnahme: "Dach und Fassade renoviert", beleg: "Extras" }] },
      ...meta,
    },
  } as unknown as ObjektData;
}

describe("ObjektseiteFelderDialog", () => {
  beforeEach(() => {
    gespeichert.aufrufe = [];
  });

  it("speichert ein Investagon-Objekt ohne Änderung, ohne abgeleitete Werte nach meta zu schreiben", async () => {
    const objekt = investagonObjekt();
    render(<ObjektseiteFelderDialog objekt={objekt} offen onOpenChange={() => undefined} />);

    // Die Felder sind leer; was die Seite zeigt, steht nur als Hinweis darunter.
    expect(screen.getByText(/Ohne Eintrag zeigt die Seite: Verbrauchsausweis, Klasse D/)).toBeInTheDocument();
    expect(screen.getByText(/Als Verwaltung steht immer „WEG- und SEV-Verwaltung“/)).toBeInTheDocument();
    expect(screen.getByText(/Ohne Eintrag zeigt die Seite: Zuletzt 2024, 2024 Dach und Fassade renoviert/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(gespeichert.aufrufe).toHaveLength(1));

    const meta = gespeichert.aufrufe[0].felder.meta as Record<string, unknown>;
    for (const schluessel of ["kurzbeschreibung", "gemeinschaftseigentum", "verwaltung", "energieausweis", "sanierungen", "objektart"]) {
      expect(meta, schluessel).not.toHaveProperty(schluessel);
    }
    expect(meta.investagonRaw).toBe((objekt.meta as Record<string, unknown>).investagonRaw);
    expect(meta.objekttexteKi).toBe((objekt.meta as Record<string, unknown>).objekttexteKi);
  });

  it("behält gepflegte Angaben beim Speichern", async () => {
    const objekt = investagonObjekt({ verwaltung: "Hausverwaltung Muster", gemeinschaftseigentum: "5 Etagen, Fahrradraum" });
    render(<ObjektseiteFelderDialog objekt={objekt} offen onOpenChange={() => undefined} />);
    expect(screen.getByDisplayValue("Hausverwaltung Muster")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(gespeichert.aufrufe).toHaveLength(1));

    const meta = gespeichert.aufrufe[0].felder.meta as Record<string, unknown>;
    expect(meta.verwaltung).toBe("Hausverwaltung Muster");
    expect(meta.gemeinschaftseigentum).toBe("5 Etagen, Fahrradraum");
    expect(meta).not.toHaveProperty("kurzbeschreibung");
  });

  /*
   * Seit dem 23.09.2026 stehen Beschreibung und Standortargumente in ihrer
   * eigenen Karte mit eigenem Dialog. Hier gibt es sie nicht mehr, und das
   * Speichern der übrigen Angaben lässt sie wortgleich stehen. Sonst könnte
   * ein automatischer Text durch bloßes Speichern zu einem „von Hand
   * gepflegten“ werden, den der nächste Lauf nicht mehr erneuert.
   */
  it("zeigt keine Textfelder mehr und lässt Beschreibung und Standortargumente beim Speichern unverändert", async () => {
    const argumente = ["Kurze Wege. Supermarkt in 280 m.", "Anbindung. Straßenbahn in 150 m."];
    const objekt = investagonObjekt({ kurzbeschreibung: "Automatischer Text.", standortargumente: argumente });
    render(<ObjektseiteFelderDialog objekt={objekt} offen onOpenChange={() => undefined} />);
    expect(screen.queryByText("Kurzbeschreibung")).not.toBeInTheDocument();
    expect(screen.queryByText(/Standortargumente, ein Argument je Zeile/)).not.toBeInTheDocument();
    expect(screen.getByText(/Beschreibung und Standortargumente änderst du über den Stift an ihrer eigenen Karte/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Hausverwaltung Beispiel GmbH, Augsburg"), { target: { value: "Verwaltung Neu" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(gespeichert.aufrufe).toHaveLength(1));

    const meta = gespeichert.aufrufe[0].felder.meta as Record<string, unknown>;
    expect(meta.verwaltung).toBe("Verwaltung Neu");
    expect(meta.kurzbeschreibung).toBe("Automatischer Text.");
    expect(meta.standortargumente).toBe(argumente);
  });
});
