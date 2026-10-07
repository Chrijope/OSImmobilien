import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation, useNavigate, useParams } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Weiterleitung der Objektseite: Ein Objekt mit genau einer Einheit hat
 * keine eigene Objektseite. Wer `/objekte/:id` direkt aufruft, landet auf der
 * Einheiten-Seite, und zwar per Replace, damit „Zurück" nicht in einer
 * Schleife hängt. Bei mehreren oder null Einheiten bleibt die Objektseite.
 */

const objekte = vi.hoisted(() => ({ liste: {} as Record<string, unknown> }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "admin", name: "Test", email: "" }, authUser: null }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div>Galerie</div> }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => objekte.liste[id],
}));

const { default: ObjektSeite } = await import("./ObjektSeite");

function we(id: string): ObjektWohnung {
  return { id, weNr: `WE ${id}`, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 600, vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei" };
}

function objekt(id: string, wohnungen: ObjektWohnung[]): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen, videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {},
  } as unknown as ObjektData;
}

function EinheitenProbe() {
  const { weId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <p>Einheiten-Seite {weId}</p>
      <p>Pfad {location.pathname}</p>
      <button onClick={() => navigate(-1)}>Zurück</button>
    </div>
  );
}

function ListeProbe() {
  const location = useLocation();
  return <p>Objektliste {location.pathname}</p>;
}

function renderMit(pfade: string[]) {
  return render(
    <MemoryRouter initialEntries={pfade}>
      <Routes>
        <Route path="/objekte" element={<ListeProbe />} />
        <Route path="/objekte/:id" element={<ObjektSeite />} />
        <Route path="/objekte/:id/einheiten/:weId" element={<EinheitenProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Weiterleitung der Objektseite bei genau einer Einheit", () => {
  it("leitet ein Ein-Einheiten-Objekt auf die Einheiten-Seite weiter, Zurück landet in der Liste", () => {
    objekte.liste = { o1: objekt("o1", [we("w1")]) };
    renderMit(["/objekte", "/objekte/o1"]);
    expect(screen.getByText("Einheiten-Seite w1")).toBeInTheDocument();
    expect(screen.getByText("Pfad /objekte/o1/einheiten/w1")).toBeInTheDocument();
    // Replace: der Eintrag /objekte/o1 ist aus der Historie verschwunden.
    fireEvent.click(screen.getByText("Zurück"));
    expect(screen.getByText("Objektliste /objekte")).toBeInTheDocument();
  });

  it("zeigt bei mehreren Einheiten die Objektseite", () => {
    objekte.liste = { o2: objekt("o2", [we("w1"), we("w2")]) };
    renderMit(["/objekte/o2"]);
    expect(screen.queryByText(/^Einheiten-Seite w/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Haus o2" })).toBeInTheDocument();
    expect(screen.getByText("Zurück zur Objektliste")).toBeInTheDocument();
  });

  it("zeigt ohne Einheiten die Objektseite", () => {
    objekte.liste = { o3: objekt("o3", []) };
    renderMit(["/objekte/o3"]);
    expect(screen.queryByText(/^Einheiten-Seite w/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Haus o3" })).toBeInTheDocument();
  });
});

/**
 * Anordnung seit dem 24.09.2026 (Christians Vorgabe): Galerie über die ganze
 * Breite, darunter eine Zeile mit den acht Kacheln und dem Verkaufsstand,
 * dann Beschreibung und Standort, Objektdetails und die Einheitenliste. Die
 * „Datenherkunft“ ist entfallen, die Herkunft zeigt weiter das Etikett oben.
 */
describe("Anordnung der Objektseite", () => {
  /** true, wenn `a` im Dokument vor `b` steht. */
  const davor = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("zeigt Galerie, Kennzahlen mit Verkaufsstand, Beschreibung, Objektdetails und Einheiten in dieser Reihenfolge", () => {
    objekte.liste = { o4: objekt("o4", [we("w1"), we("w2")]) };
    renderMit(["/objekte/o4"]);
    const galerie = screen.getByText("Galerie");
    const zeile = screen.getByTestId("zeile-kennzahlen");
    const verkaufsstand = screen.getByTestId("karte-verkaufsstand");
    const beschreibung = screen.getByText("Beschreibung und Standort");
    const details = screen.getByText("Objektdetails");
    const einheiten = screen.getByTestId("hinweis-kundenansicht");

    // Kacheln und Verkaufsstand teilen sich eine Zeile.
    expect(zeile).toContainElement(screen.getByText("Preis je m²"));
    expect(zeile).toContainElement(verkaufsstand);
    // Den Verkaufsstand gibt es nur noch einmal, nicht mehr je Bildschirmbreite doppelt.
    expect(screen.getAllByText("Verkaufsstand")).toHaveLength(1);

    expect(davor(galerie, zeile)).toBe(true);
    expect(davor(zeile, beschreibung)).toBe(true);
    expect(davor(beschreibung, details)).toBe(true);
    expect(davor(details, einheiten)).toBe(true);
  });

  /*
   * Seit dem 24.09.2026 stehen Beschreibung und Objektdetails ab xl
   * nebeneinander, die Beschreibung auf rund 63 Prozent der Breite. Die vier
   * Objektdetails stehen dort untereinander, darunter wieder im Raster.
   */
  it("stellt Beschreibung und Objektdetails in einen Zweispalten-Container, die Details in einer Spalte", () => {
    objekte.liste = { o6: objekt("o6", [we("w1"), we("w2")]) };
    renderMit(["/objekte/o6"]);
    const zeile = screen.getByTestId("zeile-beschreibung-details");
    const beschreibung = screen.getByTestId("objekt-texte-karte");
    const details = screen.getByTestId("karte-objektdetails");

    // Genau zwei Spalten, links die Beschreibung, rechts die Details und
    // darunter die internen Highlights (seit 01.10.2026).
    expect(zeile.children).toHaveLength(2);
    expect(zeile.children[0]).toBe(beschreibung);
    expect(zeile.children[1].children[0]).toBe(details);
    expect(zeile.children[1].children[1]).toBe(screen.getByTestId("karte-interne-highlights"));
    expect(zeile.className).toContain("xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]");
    // Unter xl untereinander.
    expect(zeile.className).toContain("grid-cols-1");

    const raster = screen.getByTestId("objektdetails-raster");
    expect(raster.className).toContain("xl:grid-cols-1");
    expect(raster.className).not.toContain("xl:grid-cols-4");
    for (const label of ["Energieausweis", "Gemeinschaftseigentum", "Sanierungen", "Verwaltung"]) {
      expect(raster).toContainElement(screen.getByText(label));
    }
    // Der Hinweis und die Einheitenliste stehen weiter darunter, außerhalb der Zeile.
    expect(zeile).not.toContainElement(screen.getByTestId("hinweis-kundenansicht"));
  });

  it("zeigt keine Datenherkunft mehr, das Etikett oben bleibt", () => {
    objekte.liste = { o5: objekt("o5", [we("w1"), we("w2")]) };
    renderMit(["/objekte/o5"]);
    expect(screen.queryByText("Datenherkunft")).not.toBeInTheDocument();
    expect(screen.getByText("Handanlage im CRM")).toBeInTheDocument();
  });
});

/**
 * Reiterleiste oben seit dem 01.10.2026 (Christians Vorgabe): Dokumente und
 * Karte standen vorher als Reiter unter der Galerie. Einen Reiter „Fotos“
 * gibt es nicht mehr, die Galerie steht in der Übersicht immer oben.
 */
describe("Reiterleiste der Objektseite", () => {
  const davor = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("zeigt Übersicht, Dokumente und Karte oberhalb der Galerie, ohne Reiter Fotos", () => {
    objekte.liste = { o7: objekt("o7", [we("w1"), we("w2")]) };
    renderMit(["/objekte/o7"]);
    const namen = screen.getAllByRole("tab").map((t) => t.textContent?.trim());
    expect(namen).toEqual(["Übersicht", "Dokumente", "Karte"]);
    expect(davor(screen.getByRole("tablist"), screen.getByText("Galerie"))).toBe(true);
  });

  it("blendet beim Reiter Karte die Übersicht aus und zeigt die Karte", async () => {
    objekte.liste = { o8: objekt("o8", [we("w1"), we("w2")]) };
    renderMit(["/objekte/o8"]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Karte" }));
    expect(await screen.findByTestId("umgebungskarte-ohne-lage")).toBeInTheDocument();
    expect(screen.getByText("Galerie").closest(".hidden")).not.toBeNull();
    expect(screen.getByTestId("hinweis-kundenansicht").closest(".hidden")).not.toBeNull();
  });

  it("zeigt im Reiter Dokumente den Leerzustand ohne Dateien", async () => {
    objekte.liste = { o9: objekt("o9", [we("w1"), we("w2")]) };
    renderMit(["/objekte/o9"]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dokumente" }));
    expect(await screen.findByText("Noch keine Dateien hinterlegt")).toBeInTheDocument();
  });
});
