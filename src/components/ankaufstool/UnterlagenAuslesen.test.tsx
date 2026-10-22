import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UnterlagenAuslesen } from "./UnterlagenAuslesen";
import type { AuslesFeld } from "@/lib/ankaufstoolUnterlagen";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

const labels = { wohnflaeche: "Wohnfläche", baujahr: "Baujahr", vermietung: "Vermietung / Leerstand" } as Record<AuslesFeld, string>;

function zeichnen(vonHand: AuslesFeld[] = []) {
  const onUebernehmen = vi.fn();
  render(
    <UnterlagenAuslesen
      labels={labels}
      anzeige={(_f, w) => String(w)}
      aktuell={(f) => (f === "wohnflaeche" ? 560 : "")}
      vonHand={new Set(vonHand)}
      onUebernehmen={onUebernehmen}
    />,
  );
  const foto = new File([new Uint8Array([137, 80, 78, 71])], "Grundriss.png", { type: "image/png" });
  // jsdom kennt File.arrayBuffer nicht; echte Browser schon.
  Object.defineProperty(foto, "arrayBuffer", { value: async () => new Uint8Array([137, 80, 78, 71]).buffer });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [foto] } });
  return onUebernehmen;
}

describe("Unterlagen im Ankaufstool auslesen", () => {
  it("zeigt die Vorschläge mit Herkunft, wählt von Hand geänderte Felder nicht vor und übernimmt nur Angehaktes", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        felder: {
          wohnflaeche: { wert: 548.2, quelle: "Grundriss (Unterlage 1), Seite 1", sicherheit: "mittel" },
          baujahr: { wert: 1988, quelle: "Grundriss (Unterlage 1), Seite 1", sicherheit: "hoch" },
          makler: { wert: "Max Mustermann", quelle: "Grundriss (Unterlage 1), Seite 1", sicherheit: "hoch" },
        },
      },
      error: null,
    });
    const onUebernehmen = zeichnen(["wohnflaeche"]);
    expect(screen.getByText("Grundriss.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Werte auslesen/ }));

    await waitFor(() => expect(screen.getByTestId("ankauf-vorschlaege")).toBeInTheDocument());
    // Das Bild geht als Daten-URL mit, ohne Dateinamen; Personendaten kommen nicht in die Liste.
    expect(invoke.mock.calls[0][1].body.dokumente[0].bild).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify(invoke.mock.calls[0][1].body)).not.toContain("Grundriss.png");
    expect(screen.queryByText(/Mustermann/)).toBeNull();
    // Der Dateiname steht nur im Browser neben der Quelle.
    expect(screen.getAllByText(/aus Grundriss \(Unterlage 1\), S\. 1 · Grundriss\.png/, { selector: "span" })).toHaveLength(2);
    expect(screen.getByText(/Sicherheit mittel/)).toBeInTheDocument();
    expect(screen.getByText(/bisher 560 \(von Hand\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /1 Werte übernehmen/ }));
    expect(onUebernehmen).toHaveBeenCalledWith([{ feld: "baujahr", wert: "1988", quelle: "Grundriss (Unterlage 1), Seite 1", sicherheit: "hoch" }]);
  });

  it("meldet verständlich, wenn die KI noch nicht verbunden ist", async () => {
    const antwort = new Response(JSON.stringify({ error: "Die KI für das Auslesen ist noch nicht verbunden. Bitte die Werte vorerst von Hand eintragen." }), { status: 503 });
    invoke.mockResolvedValueOnce({ data: null, error: Object.assign(new Error("503"), { context: antwort }) });
    zeichnen();
    fireEvent.click(screen.getByRole("button", { name: /Werte auslesen/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("noch nicht verbunden");
  });
});
