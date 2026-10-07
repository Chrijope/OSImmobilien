import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Die Objektseite, wenn jemand aus der Objektauswahl eines Kunden kommt
 * (`?empfehlung=<Investment>`): oben die Leiste mit Vorname und
 * Kaufpreisrahmen, in der Tabelle das Abzeichen an den passenden Einheiten,
 * und beim Öffnen einer Einheit reist der Parameter mit.
 */

const daten = vi.hoisted(() => ({
  objekte: {} as Record<string, unknown>,
  investments: {} as Record<string, { id: string; kontaktId: string }>,
  kontakte: {} as Record<string, { id: string; vorname: string; nachname: string }>,
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
  getObjektById: (id: string) => daten.objekte[id],
}));
vi.mock("@/lib/investmentsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/investmentsStore")>()),
  getInvestmentById: (id: string) => daten.investments[id],
  getEigeneSaData: (id: string) => daten.sa[id] ?? null,
}));
vi.mock("@/lib/kundenStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kundenStore")>()),
  getKontaktById: (id: string) => daten.kontakte[id],
}));
vi.mock("@/lib/finanzierbarkeitUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finanzierbarkeitUtils")>()),
  calculateFinanzierbarkeitFromSaData: (sa: { min: number; max: number }) => ({ minRahmen: sa.min, maxRahmen: sa.max }),
}));

const { default: ObjektSeite } = await import("./ObjektSeite");

function we(id: string, teile: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return { id, weNr: id, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 800, vkGesamt: 270000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teile };
}

function objekt(id: string, wohnungen: ObjektWohnung[]): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen, videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {},
  } as unknown as ObjektData;
}

function Probe({ name }: { name: string }) {
  const location = useLocation();
  const { weId, id } = useParams();
  return <p data-testid="probe">{`${name} ${weId || id || ""} ${location.search}`.trim()}</p>;
}

function OrtAnzeige() {
  const location = useLocation();
  return <p data-testid="ort">{location.pathname + location.search}</p>;
}

function zeige(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/objekte/:id" element={<><ObjektSeite /><OrtAnzeige /></>} />
        <Route path="/objekte/:id/einheiten/:weId" element={<Probe name="Einheit" />} />
        <Route path="/kunden/:id" element={<Probe name="Kunde" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  daten.objekte = {
    o1: objekt("o1", [we("w1", { vkGesamt: 270000 }), we("w2", { vkGesamt: 310000 }), we("w3", { status: "reserviert" })]),
    o2: objekt("o2", [we("w9")]),
  };
  daten.investments = { "inv-1": { id: "inv-1", kontaktId: "kunde-1" } };
  daten.kontakte = { "kunde-1": { id: "kunde-1", vorname: "Max", nachname: "Muster" } };
  daten.sa = { "inv-1": { min: 250000, max: 300000 } };
});

describe("Objektseite mit ?empfehlung=", () => {
  it("zeigt oben die Leiste mit Vorname und Kaufpreisrahmen", () => {
    zeige("/objekte/o1?empfehlung=inv-1");
    const leiste = screen.getByTestId("empfehlungs-leiste");
    // Seit dem 23.09.2026 zählt nur der Kaufpreis: Rahmen und Kaufpreisrahmen sind gleich.
    expect(leiste).toHaveTextContent(/Auswahl für Max, Kaufpreisrahmen 250\.000\s€ bis 300\.000\s€/);
    expect(leiste).toHaveTextContent("1 Einheit passt in den Rahmen.");
    expect(leiste).not.toHaveTextContent("Muster");
    expect(leiste.textContent).not.toMatch(/[–—]/);
  });

  it("kennzeichnet in der Tabelle nur die passenden Einheiten", () => {
    zeige("/objekte/o1?empfehlung=inv-1");
    expect(within(screen.getByTestId("einheit-w1")).getByText("empfohlen")).toBeInTheDocument();
    // 310.000 liegt über dem Rahmen bis 300.000.
    expect(within(screen.getByTestId("einheit-w2")).queryByText("empfohlen")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("einheit-w3")).queryByText("empfohlen")).not.toBeInTheDocument();
  });

  it("reicht ?empfehlung= beim Öffnen einer Einheit weiter", () => {
    zeige("/objekte/o1?empfehlung=inv-1");
    fireEvent.click(within(screen.getByTestId("einheit-w2")).getByRole("button", { name: /Einheit öffnen/ }));
    expect(screen.getByTestId("probe")).toHaveTextContent("Einheit w2 ?empfehlung=inv-1");
  });

  it("„Auswahl beenden“ nimmt die Leiste und den Parameter weg", () => {
    zeige("/objekte/o1?empfehlung=inv-1");
    fireEvent.click(screen.getByRole("button", { name: /Auswahl beenden/ }));
    expect(screen.queryByTestId("empfehlungs-leiste")).not.toBeInTheDocument();
    expect(screen.getByTestId("ort")).toHaveTextContent(/^\/objekte\/o1$/);
    expect(within(screen.getByTestId("einheit-w1")).queryByText("empfohlen")).not.toBeInTheDocument();
  });

  it("„Zur Objektauswahl“ führt zurück zum Kunden", () => {
    zeige("/objekte/o1?empfehlung=inv-1");
    fireEvent.click(screen.getByRole("button", { name: /Zur Objektauswahl/ }));
    expect(screen.getByTestId("probe")).toHaveTextContent("Kunde kunde-1");
  });

  it("ohne Selbstauskunft steht, dass es keinen Rahmen gibt", () => {
    daten.sa = {};
    zeige("/objekte/o1?empfehlung=inv-1");
    expect(screen.getByTestId("empfehlungs-leiste")).toHaveTextContent("Auswahl für Max, kein Finanzierungsrahmen");
    expect(within(screen.getByTestId("einheit-w1")).queryByText("empfohlen")).not.toBeInTheDocument();
  });

  it("wer den Kunden nicht sehen darf, bekommt keine Leiste", () => {
    daten.investments = {};
    zeige("/objekte/o1?empfehlung=inv-1");
    expect(screen.queryByTestId("empfehlungs-leiste")).not.toBeInTheDocument();
  });

  it("ohne Parameter bleibt die Seite wie sie war", () => {
    zeige("/objekte/o1");
    expect(screen.queryByTestId("empfehlungs-leiste")).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("einheit-w1")).getByRole("button", { name: /Einheit öffnen/ }));
    expect(screen.getByTestId("probe")).toHaveTextContent(/^Einheit w1$/);
  });

  it("ein Einzelobjekt springt in seine Einheit und behält den Parameter", () => {
    zeige("/objekte/o2?empfehlung=inv-1");
    expect(screen.getByTestId("probe")).toHaveTextContent("Einheit w9 ?empfehlung=inv-1");
  });
});
