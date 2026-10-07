import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Ansicht C des Objektscores (04.10.2026): die Karte „Passende Kunden“ auf
 * der Einheitenseite. Score je Kunde, Stufe, Hauptgrund, Partner, Rahmen,
 * Entfernung, Filter Alle und Meine Kunden, Weg ins Kundenprofil. Nur für
 * die freigegebenen Rollen und nur an einer freien Einheit.
 */

const daten = vi.hoisted(() => ({
  rolle: "admin",
  nutzerId: "vp-1",
  investments: [] as Array<{ id: string; kontaktId: string; pipelineStufe: string }>,
  kontakte: {} as Record<string, Record<string, unknown>>,
  sa: {} as Record<string, unknown>,
  vertretungFuer: new Set<string>(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: daten.rolle, name: "Test" }, authUser: { id: daten.nutzerId } }),
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useVertretungen", () => ({ useVertretungen: (id: string | null | undefined) => (id ? daten.vertretungFuer : new Set()) }));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestments: () => daten.investments,
  getEigeneSaData: (id: string) => daten.sa[id] ?? null,
  getInvestmentMeta: (_id: string, _key: string, fallback: unknown) => fallback,
  setInvestmentMeta: () => undefined,
}));
vi.mock("@/lib/kundenStore", () => ({ getKontaktById: (id: string) => daten.kontakte[id] }));
vi.mock("@/lib/selbstauskunftEntfaellt", () => ({ selbstauskunftEntfaellt: () => false }));
vi.mock("@/lib/investmentrechner/kundenUebernahme", () => ({
  kundenUebernahmeFuer: (_k: string, inv: string) => ({
    aenderung: inv === "inv-1" ? { annualGrossIncome: 80000, taxClass: "I", jointAssessment: false, taxableIncomeCustomer: 70000 } : {},
    felder: [], posten: [], hinweis: { quelle: "selbstauskunft", text: "" }, ohneSelbstauskunft: false,
  }),
}));

const { PassendeKundenKarte } = await import("./PassendeKundenKarte");

function we(teile: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return { id: "w1", weNr: "WE 07", etage: "2", lage: "", groesse: 55, zimmer: 2, mieteGesamt: 850, vkGesamt: 220000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teile } as ObjektWohnung;
}
function objekt(w: ObjektWohnung, teile: Partial<ObjektData> = {}): ObjektData {
  return {
    id: "o1", titel: "Musterhaus", adresse: "Teststraße 1", plz: "83022", ort: "Rosenheim", sichtbar: true, wohnungen: [w], dokumente: [], bilder: [],
    afaDaten: { afaModell: "linear", afaSatz: 2, restnutzungsdauer: 50, grundstueckAnteil: 20 }, globalDaten: { baujahr: 1990, zustand: "" },
    meta: { objektart: "sanierter_bestand", standortanalyse: { schema: 2, objekt_koordinaten: { lat: 47.86, lng: 12.12 }, mikrolage: { oepnv: [{ name: "Bus", entfernung_m: 100 }] } } },
    ...teile,
  } as unknown as ObjektData;
}

function Ort() {
  const l = useLocation();
  return <p data-testid="ort">{l.pathname + l.search + l.hash}</p>;
}

function zeige(w = we(), o = objekt(w)) {
  return render(
    <MemoryRouter initialEntries={["/objekte/o1/einheiten/w1"]}>
      <Routes><Route path="*" element={<><PassendeKundenKarte objekt={o} wohnung={w} /><Ort /></>} /></Routes>
    </MemoryRouter>,
  );
}

const SA = { gehalt: 3000, miete: 900, lebenshaltung: 800, vermoegenswerte: [{ betrag: 30000 }], wuenscheZiele: ["steuer"] };

beforeEach(() => {
  daten.rolle = "admin";
  daten.nutzerId = "vp-1";
  daten.investments = [
    { id: "inv-1", kontaktId: "k-1", pipelineStufe: "objektauswahl" },
    { id: "inv-2", kontaktId: "k-2", pipelineStufe: "selbstauskunft" },
    { id: "inv-3", kontaktId: "k-3", pipelineStufe: "notar" },
  ];
  daten.kontakte = {
    "k-1": { id: "k-1", vorname: "Kunde", nachname: "Eins", berater: "Partner 1", zustaendig_id: "vp-1" },
    "k-2": { id: "k-2", vorname: "Kunde", nachname: "Zwei", berater: "Partner 2", zustaendig_id: "vp-2" },
    "k-3": { id: "k-3", vorname: "Kunde", nachname: "Drei", berater: "Partner 1", zustaendig_id: "vp-1" },
  };
  daten.sa = { "inv-1": SA, "inv-2": SA, "inv-3": SA };
  daten.vertretungFuer = new Set();
});

describe("Karte „Passende Kunden“", () => {
  it("zeigt suchende Kunden mit Score, Stufe, Partner und Rahmen, nicht die aus späteren Stufen", () => {
    zeige();
    const karte = screen.getByTestId("karte-passende-kunden");
    expect(karte).toHaveTextContent("2 von 2 suchenden");
    expect(karte).toHaveTextContent("nur Stufen Selbstauskunft bis Follow-Up Objekt");
    const eins = screen.getByTestId("passender-kunde-k-1");
    expect(Number(within(eins).getByTestId("score-ring").getAttribute("data-wert"))).toBeGreaterThan(0);
    expect(eins).toHaveTextContent("Objektauswahl");
    expect(eins).toHaveTextContent(/Partner 1 · Rahmen \d{3}\.\d{3}\s€ bis \d{3}\.\d{3}\s€/);
    expect(screen.queryByTestId("passender-kunde-k-3")).not.toBeInTheDocument();
  });

  it("ohne Einkommen in der Selbstauskunft ein Teilwert mit Angabe, was fehlt", () => {
    zeige();
    const zwei = screen.getByTestId("passender-kunde-k-2");
    expect(within(zwei).getByTestId("score-ring")).toHaveAttribute("data-teilwert", "ja");
    expect(zwei).toHaveTextContent("Partner 2 · Teilwert, Jahresbrutto fehlt, Steuerwirkung nicht bewertet");
  });

  it("filtert auf die eigenen Kunden", () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: "Meine Kunden" }));
    expect(screen.getByTestId("passender-kunde-k-1")).toBeInTheDocument();
    expect(screen.queryByTestId("passender-kunde-k-2")).not.toBeInTheDocument();
  });

  it("„Kundenprofil öffnen“ führt ins Investment, Abschnitt Objektauswahl", () => {
    zeige();
    fireEvent.click(within(screen.getByTestId("passender-kunde-k-1")).getByRole("button", { name: "Kundenprofil öffnen" }));
    expect(screen.getByTestId("ort")).toHaveTextContent("/kunden/k-1?tab=investments&investment=inv-1#objektauswahl");
  });

  it("sagt, wenn niemand passt", () => {
    zeige(we({ vkGesamt: 900000 }));
    expect(screen.getByTestId("passende-kunden-leer")).toHaveTextContent("Für diese Einheit passt gerade kein suchender Kunde.");
  });

  it("fehlt an einer reservierten Einheit und beim Globalobjekt", () => {
    const { unmount } = zeige(we({ status: "reserviert" }));
    expect(screen.queryByTestId("karte-passende-kunden")).not.toBeInTheDocument();
    unmount();
    const w = we();
    zeige(w, objekt(w, { globalObjekt: true }));
    expect(screen.queryByTestId("karte-passende-kunden")).not.toBeInTheDocument();
  });

  it.each(["inhaber", "vertriebsleiter"])("%s sieht die Karte", (rolle) => {
    daten.rolle = rolle;
    zeige();
    expect(screen.getByTestId("karte-passende-kunden")).toBeInTheDocument();
  });

  it("der Vertriebspartner sieht nur seine eigenen Kunden", () => {
    daten.rolle = "vertriebspartner";
    daten.nutzerId = "vp-2";
    zeige();
    expect(screen.getByTestId("passender-kunde-k-2")).toBeInTheDocument();
    expect(screen.queryByTestId("passender-kunde-k-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("karte-passende-kunden")).toHaveTextContent("1 von 1 suchenden");
    // Ohne fremde Kunden gibt es nichts umzuschalten.
    expect(screen.queryByRole("group", { name: "Kundenfilter" })).not.toBeInTheDocument();
  });

  it("der Vertriebspartner sieht als heutige Vertretung auch die Kunden des Vertretenen", () => {
    daten.rolle = "vertriebspartner";
    daten.nutzerId = "vp-2";
    daten.vertretungFuer = new Set(["vp-1"]);
    zeige();
    expect(screen.getByTestId("passender-kunde-k-1")).toBeInTheDocument();
    expect(screen.getByTestId("passender-kunde-k-2")).toBeInTheDocument();
  });

  it("Admin hat den Umschalter „Alle / Meine Kunden“", () => {
    daten.nutzerId = "admin-1";
    zeige();
    expect(screen.getByRole("group", { name: "Kundenfilter" })).toBeInTheDocument();
  });

  it("Admin sieht alle Kunden, auch fremder Partner", () => {
    daten.nutzerId = "admin-1";
    zeige();
    expect(screen.getByTestId("passender-kunde-k-1")).toBeInTheDocument();
    expect(screen.getByTestId("passender-kunde-k-2")).toBeInTheDocument();
  });

  it.each(["finanzierungspartner", "buchhaltung", "objektpartner", "kunde"])("%s sieht sie nicht", (rolle) => {
    daten.rolle = rolle;
    zeige();
    expect(screen.queryByTestId("karte-passende-kunden")).not.toBeInTheDocument();
  });
});
