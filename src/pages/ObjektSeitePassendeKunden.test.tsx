import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Ansicht B des Objektscores (04.10.2026): Auf der Objektseite zeigt die
 * Spalte „Kunde / VP“ bei freien Einheiten die passenden Kunden als Chip mit
 * bestem Score, oben steht der Zähler. Kommt man aus der Objektauswahl eines
 * Kunden, steht dort dessen Score. Nur für Admin, Inhaber und
 * Vertriebsleitung.
 */

const daten = vi.hoisted(() => ({
  rolle: "admin",
  objekte: {} as Record<string, unknown>,
  investments: [] as Array<{ id: string; kontaktId: string; pipelineStufe: string }>,
  kontakte: {} as Record<string, Record<string, unknown>>,
  sa: {} as Record<string, unknown>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: daten.rolle, name: "Test", email: "" }, authUser: { id: "nutzer-1" } }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useVertretungen", () => ({ useVertretungen: () => new Set() }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div>Galerie</div> }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => daten.objekte[id],
}));
vi.mock("@/lib/investmentsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/investmentsStore")>()),
  getInvestments: () => daten.investments,
  getInvestmentById: (id: string) => daten.investments.find((i) => i.id === id),
  getEigeneSaData: (id: string) => daten.sa[id] ?? null,
  getInvestmentMeta: (_id: string, _key: string, fallback: unknown) => fallback,
}));
vi.mock("@/lib/kundenStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kundenStore")>()),
  getKontaktById: (id: string) => daten.kontakte[id],
}));
vi.mock("@/lib/investmentrechner/kundenUebernahme", () => ({
  kundenUebernahmeFuer: () => ({ aenderung: {}, felder: [], posten: [], hinweis: { quelle: "selbstauskunft", text: "" }, ohneSelbstauskunft: false }),
}));

const { default: ObjektSeite } = await import("./ObjektSeite");

function we(id: string, teile: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return { id, weNr: id, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 800, vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teile };
}

function objekt(id: string, wohnungen: ObjektWohnung[]): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen, videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {},
  } as unknown as ObjektData;
}

function Probe() {
  const { weId } = useParams();
  return <p data-testid="probe">Einheit {weId}</p>;
}

function zeige(pfad = "/objekte/o1") {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/objekte/:id" element={<ObjektSeite />} />
        <Route path="/objekte/:id/einheiten/:weId" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Überschuss 1.200 €: Rahmen rund 184.000 € bis 260.000 €.
const SA = { gehalt: 3000, miete: 900, lebenshaltung: 800, vermoegenswerte: [{ betrag: 30000 }], wuenscheZiele: ["steuer"] };

beforeEach(() => {
  daten.rolle = "admin";
  daten.objekte = {
    o1: objekt("o1", [we("w1"), we("w2", { vkGesamt: 900000 }), we("w3", { status: "reserviert" })]),
  };
  daten.investments = [
    { id: "inv-1", kontaktId: "k-1", pipelineStufe: "objektauswahl" },
    { id: "inv-2", kontaktId: "k-2", pipelineStufe: "follow_up_objekt" },
    { id: "inv-3", kontaktId: "k-3", pipelineStufe: "selbstauskunft" },
    { id: "inv-4", kontaktId: "k-4", pipelineStufe: "reservierung" },
  ];
  daten.kontakte = {
    "k-1": { id: "k-1", vorname: "Kunde", nachname: "Eins", berater: "Partner 1", zustaendig_id: "vp-1" },
    "k-2": { id: "k-2", vorname: "Kunde", nachname: "Zwei", berater: "Partner 2", zustaendig_id: "vp-2" },
    "k-3": { id: "k-3", vorname: "Kunde", nachname: "Drei" },
    "k-4": { id: "k-4", vorname: "Kunde", nachname: "Vier" },
  };
  // k-3 hat keine Selbstauskunft, k-4 steht schon in der Reservierung.
  daten.sa = { "inv-1": SA, "inv-2": SA, "inv-4": SA };
});

describe("Objektseite, passende Kunden", () => {
  it("zeigt bei freien Einheiten den Chip, oben den Zähler, ohne neuen Spaltenkopf", () => {
    zeige();
    expect(screen.getByTestId("passende-kunden-zaehler")).toHaveTextContent("Für 2 Kunden passt mindestens eine Einheit");
    expect(screen.getByTestId("passende-kunden-zaehler")).toHaveTextContent("1 Kunde ohne vollständige Selbstauskunft nicht bewertet");
    expect(within(screen.getByTestId("einheit-w1")).getByTestId("passende-kunden-chip")).toHaveTextContent(/^2 Kunden\s*\d+$/);
    expect(within(screen.getByTestId("einheit-w2")).getByText("kein passender Kunde")).toBeInTheDocument();
    expect(within(screen.getByTestId("einheit-w3")).queryByTestId("passende-kunden-chip")).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toContain("Kunde / VP");
    expect(screen.queryByRole("columnheader", { name: /Score/ })).not.toBeInTheDocument();
  });

  it("öffnet die kleine Liste mit Score, Name und Partner, der Link führt zur Einheitenseite", () => {
    zeige();
    fireEvent.click(within(screen.getByTestId("einheit-w1")).getByTestId("passende-kunden-chip"));
    const liste = screen.getByTestId("passende-kunden-liste");
    expect(liste).toHaveTextContent("Kunde Eins");
    expect(liste).toHaveTextContent("Partner 2");
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Alle auf der Einheitenseite/ }));
    expect(screen.getByTestId("probe")).toHaveTextContent("Einheit w1");
  });

  it("der Inhaber sieht die passenden Kunden", () => {
    daten.rolle = "inhaber";
    zeige();
    expect(screen.queryByTestId("passende-kunden-zaehler")).toBeInTheDocument();
  });

  /*
   * Seit dem 04.10.2026 sieht die Vertriebsleitung die neue Objektseite wie
   * der Admin, mit allen Kunden. Pflegen darf sie dort nichts.
   */
  it("die Vertriebsleitung sieht die Objektseite mit allen passenden Kunden", () => {
    daten.rolle = "vertriebsleiter";
    zeige();
    expect(screen.getByTestId("passende-kunden-zaehler")).toHaveTextContent("Für 2 Kunden passt mindestens eine Einheit");
    expect(within(screen.getByTestId("einheit-w1")).getByTestId("passende-kunden-chip")).toHaveTextContent(/^2 Kunden/);
  });

  // Seit dem 05.10.2026 hat die Vertriebsleitung die Kundenaktionen (Hinweis darauf), Pflegen bleibt beim Admin.
  it("die Vertriebsleitung bekommt keine Pflegeknöpfe, aber den Hinweis auf die Kundenaktionen, der Admin beides", () => {
    daten.rolle = "vertriebsleiter";
    const { unmount } = zeige();
    expect(screen.queryByRole("button", { name: /Objekt bearbeiten/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Objektdetails bearbeiten/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("hinweis-kundenansicht")).toBeInTheDocument();
    unmount();
    daten.rolle = "admin";
    zeige();
    expect(screen.getByRole("button", { name: /Objekt bearbeiten/ })).toBeInTheDocument();
    expect(screen.getByTestId("hinweis-kundenansicht")).toBeInTheDocument();
  });

  // Der Vertriebspartner landet in der Verwaltungsansicht, dort steht sein Chip (`ObjektDetail`).
  it.each(["finanzierungspartner", "buchhaltung", "objektpartner", "vertriebspartner"])("%s sieht sie auf der Objektseite nicht", (rolle) => {
    daten.rolle = rolle;
    zeige();
    expect(screen.queryByTestId("passende-kunden-zaehler")).not.toBeInTheDocument();
    expect(screen.queryByTestId("passende-kunden-chip")).not.toBeInTheDocument();
  });

  it("aus der Objektauswahl eines Kunden steht dessen Score je Einheit statt der Liste", () => {
    zeige("/objekte/o1?empfehlung=inv-1");
    expect(screen.queryByTestId("passende-kunden-zaehler")).not.toBeInTheDocument();
    expect(screen.queryByTestId("passende-kunden-chip")).not.toBeInTheDocument();
    const ring = within(screen.getByTestId("einheit-w1")).getByTestId("score-ring");
    expect(Number(ring.getAttribute("data-wert"))).toBeGreaterThan(0);
    expect(within(screen.getByTestId("einheit-w2")).getByTestId("score-ring")).toHaveAttribute("data-wert", "nb");
  });
});
