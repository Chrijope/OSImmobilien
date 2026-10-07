import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Das Kästchen „Interne Highlights“: nur für interne Rollen, mit gut
 * sichtbarem Hinweis, Erhaltungsaufwand und Restnutzungsdauer hervorgehoben,
 * und ohne Daten kein erfundener Inhalt.
 */

const rolle = vi.hoisted(() => ({ wert: "admin" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ user: { name: "Test", role: rolle.wert } }) }));

const { InterneHighlightsKarte } = await import("./InterneHighlightsKarte");
const { OBJEKT_TEXTE_SCHEMA } = await import("../../../supabase/functions/_shared/objekt-texte");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function objekt(weiteres: Record<string, any> = {}): any {
  return {
    id: "o1", titel: "Musterhaus", meta: {}, globalDaten: { baujahr: 1965 }, sanierungskosten: 0, erhaltungsaufwandJahre: 1,
    afaDaten: { afaModell: "linear", afaSatz: 2, restnutzungsdauer: 50, grundstueckAnteil: 20 }, dokumente: [], wohnungen: [],
    ...weiteres,
  };
}
const stand = (interneHighlights: unknown[]) => ({
  schema: OBJEKT_TEXTE_SCHEMA, kurzbeschreibung: "x", standortargumente: [], marktargumente: [], sanierungen: [], interneHighlights,
  erzeugtAm: "", modell: "", quellenStand: "", quellen: [], beanstandungen: [],
});

describe("InterneHighlightsKarte", () => {
  beforeEach(() => { rolle.wert = "admin"; });

  it("zeigt den Hinweis und hebt Erhaltungsaufwand und Restnutzungsdauer hervor", () => {
    render(<InterneHighlightsKarte objekt={objekt({
      sanierungskosten: 250000,
      afaDaten: { afaModell: "gutachten", afaSatz: 4, restnutzungsdauer: 25, grundstueckAnteil: 20 },
      meta: { objekttexteKi: stand([{ punkt: "Denkmalschutz", beleg: "Exposé.pdf", art: "sonstiges" }]) },
    })} />);
    expect(screen.getByText("Interne Highlights")).toBeInTheDocument();
    expect(screen.getByText("Nur intern")).toBeInTheDocument();
    expect(screen.getByTestId("highlights-hinweis")).toHaveTextContent("rein intern und nur für deine Vorbereitung");
    expect(screen.getByTestId("highlights-hinweis")).toHaveTextContent("nicht an Kunden weiter");
    expect(screen.getByTestId("highlight-erhaltungsaufwand")).toHaveTextContent("Erhaltungsaufwand: 250.000");
    expect(screen.getByTestId("highlight-restnutzungsdauer")).toHaveTextContent("25 Jahre RND");
    expect(screen.getByTestId("highlights-liste")).toHaveTextContent("Denkmalschutz");
    expect(screen.getByText("Denkmalschutz")).toHaveAttribute("title", "Beleg: Exposé.pdf");
  });

  it("erfindet ohne Daten nichts", () => {
    render(<InterneHighlightsKarte objekt={objekt({ meta: { objekttexteKi: stand([]) } })} />);
    expect(screen.queryByTestId("highlights-oben")).toBeNull();
    expect(screen.queryByTestId("highlights-liste")).toBeNull();
    expect(screen.getByTestId("highlights-leer")).toBeInTheDocument();
    expect(screen.queryByText(/nicht vorhanden/i)).toBeNull();
  });

  it("sagt, dass die Highlights noch entstehen, solange der Lauf aussteht", () => {
    render(<InterneHighlightsKarte objekt={objekt()} />);
    expect(screen.getByTestId("highlights-wird-erstellt")).toBeInTheDocument();
    expect(screen.queryByTestId("highlights-leer")).toBeNull();
  });

  it.each(["kunde", "tippgeber", "bewerber"])("bleibt für die Rolle %s leer", (r) => {
    rolle.wert = r;
    const { container } = render(<InterneHighlightsKarte objekt={objekt({ sanierungskosten: 1000 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sehen auch Vertriebspartner, sobald sie die Seite sehen", () => {
    rolle.wert = "vertriebspartner";
    render(<InterneHighlightsKarte objekt={objekt({ sanierungskosten: 1000 })} />);
    expect(screen.getByTestId("karte-interne-highlights")).toBeInTheDocument();
  });
});
