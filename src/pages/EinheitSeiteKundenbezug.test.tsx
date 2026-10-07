import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Der Kundenbezug auf der Einheitsseite (Christians Entscheidung vom
 * 25.09.2026): Aus dem Kundenprofil über Investment und Objektauswahl
 * gekommen, gelten „Exposé anzeigen“ und „Kundenlink senden“ für diesen
 * Kunden, in seiner Sprache aus dem Kundenprofil. Über die Seitenleiste
 * „Objekte“ bleibt alles ohne Kunden wie bisher.
 */

const zustand = vi.hoisted(() => ({
  objekte: {} as Record<string, unknown>,
  investments: {} as Record<string, { id: string; kontaktId: string }>,
  kontakte: {} as Record<string, { id: string; vorname: string; nachname: string }>,
  sprachen: {} as Record<string, "de" | "en">,
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
  useOptionalUser: () => ({ user: { role: "admin", name: "Test" } }),
}));
vi.mock("@/lib/objektTexteKi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektTexteKi")>()),
  brauchtObjektTexte: () => false,
  starteObjektTexteBeiBedarf: async () => undefined,
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div>Galerie</div> }));
vi.mock("@/components/expose/ExposeErzeugenDialog", () => ({
  ExposeErzeugenDialog: (p: { vorgewaehlterKundeId?: string | null; vorgewaehltesInvestmentId?: string | null }) => (
    <div data-testid="kundenlink-dialog" data-kunde={p.vorgewaehlterKundeId ?? ""} data-investment={p.vorgewaehltesInvestmentId ?? ""} />
  ),
}));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => zustand.objekte[id],
}));
// Was die Zeilensicherheit diesem Nutzer gibt: nur, was hier im Zwischenspeicher steht.
vi.mock("@/lib/investmentsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/investmentsStore")>()),
  getInvestmentById: (id: string) => zustand.investments[id],
}));
vi.mock("@/lib/kundenStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kundenStore")>()),
  getKontaktById: (id: string) => zustand.kontakte[id],
}));
vi.mock("@/lib/kundenSprache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kundenSprache")>()),
  useKundenSprache: (id: string | null | undefined) => ({ sprache: (id && zustand.sprachen[id]) || "de", bewusstGewaehlt: true }),
}));

const lotse = vi.hoisted(() => ({ kalkulation: vi.fn((..._a: unknown[]) => null) }));
vi.mock("@/lib/lotseStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lotseStore")>()),
  kalkulationFuerLotse: (...a: unknown[]) => lotse.kalkulation(...a),
}));
// Der Lotse selbst ist eigens geprüft; hier zählt nur, was die Seite ihm mitgibt.
const lotseProps = vi.hoisted(() => ({ letzte: {} as Record<string, unknown> }));
vi.mock("@/components/objektseite/lotse/ObjektLotse", () => ({
  ObjektLotse: (p: Record<string, unknown>) => {
    lotseProps.letzte = p;
    return <div data-testid="objekt-lotse" />;
  },
  KiMarke: () => null,
}));

const { default: EinheitSeite } = await import("./EinheitSeite");

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

function zeige(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/objekte/:id/einheiten/:weId" element={<EinheitSeite />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Genau die Adresse, die „Einheit öffnen“ in der Objektauswahl baut (`einheitOeffnenLink`). */
const AUS_DEM_KUNDENPROFIL = `/objekte/o1/einheiten/w1?empfehlung=inv1&zurueck=${encodeURIComponent("/kunden/k1?tab=investments&investment=inv1#objektauswahl")}`;

function exposeAdresse(): URL {
  const link = within(screen.getByRole("group", { name: "Intern" })).getByRole("link", { name: /Exposé anzeigen/ });
  return new URL(link.getAttribute("href") || "", "https://crm.test");
}

beforeEach(() => {
  zustand.objekte = { o1: objekt("o1", [we("w1"), we("w2")]) };
  zustand.investments = { inv1: { id: "inv1", kontaktId: "k1" } };
  zustand.kontakte = { k1: { id: "k1", vorname: "Emma", nachname: "English" } };
  zustand.sprachen = { k1: "en" };
});

describe("Einheitsseite im Kundenbezug", () => {
  it("nennt Kunde und Sprache und öffnet das Exposé mit diesem Kunden", () => {
    zeige(AUS_DEM_KUNDENPROFIL);
    const hinweis = screen.getByTestId("kundenbezug-hinweis");
    expect(hinweis).toHaveTextContent("Kundenbezug: Emma English");
    expect(hinweis).toHaveTextContent("Exposé und PDF sind auf Englisch");
    expect(hinweis).toHaveAttribute("data-sprache", "en");

    const adresse = exposeAdresse();
    expect(adresse.pathname).toBe("/objekte/o1/einheiten/w1/expose");
    // Nur Kennungen in der Adresse, nie der Name.
    expect(adresse.searchParams.get("kunde")).toBe("k1");
    expect(adresse.searchParams.get("empfehlung")).toBe("inv1");
    expect(adresse.searchParams.get("zurueck")).toBe("/kunden/k1?tab=investments&investment=inv1#objektauswahl");
    expect(adresse.search).not.toContain("Emma");
    // Der Weg zurück ins Kundenprofil steht oben.
    expect(screen.getByRole("button", { name: /Zurück zu Emma English/ })).toBeInTheDocument();
  });

  it("belegt „Kundenlink senden“ mit Kunde und Investment vor", () => {
    zeige(AUS_DEM_KUNDENPROFIL);
    fireEvent.click(screen.getByRole("button", { name: /Kundenlink senden/ }));
    const dialog = screen.getByTestId("kundenlink-dialog");
    expect(dialog).toHaveAttribute("data-kunde", "k1");
    expect(dialog).toHaveAttribute("data-investment", "inv1");
  });

  it("nennt beim deutschen Kunden Deutsch", () => {
    zustand.sprachen = { k1: "de" };
    zeige(AUS_DEM_KUNDENPROFIL);
    expect(screen.getByTestId("kundenbezug-hinweis")).toHaveTextContent("Exposé und PDF sind auf Deutsch");
  });

  it("findet den Kunden auch nur über den Rückweg, etwa ohne Investment in der Adresse", () => {
    zeige(`/objekte/o1/einheiten/w1?zurueck=${encodeURIComponent("/kunden/k1?tab=investments")}`);
    expect(screen.getByTestId("kundenbezug-hinweis")).toHaveTextContent("Emma English");
    expect(exposeAdresse().searchParams.get("kunde")).toBe("k1");
    fireEvent.click(screen.getByRole("button", { name: /Kundenlink senden/ }));
    expect(screen.getByTestId("kundenlink-dialog")).toHaveAttribute("data-kunde", "k1");
    expect(screen.getByTestId("kundenlink-dialog")).toHaveAttribute("data-investment", "");
  });

  it("bleibt über die Seitenleiste „Objekte“ ohne Kunden wie bisher", () => {
    zeige("/objekte/o1/einheiten/w1");
    expect(screen.queryByTestId("kundenbezug-hinweis")).not.toBeInTheDocument();
    const link = within(screen.getByRole("group", { name: "Intern" })).getByRole("link", { name: /Exposé anzeigen/ });
    expect(link).toHaveAttribute("href", "/objekte/o1/einheiten/w1/expose");
    fireEvent.click(screen.getByRole("button", { name: /Kundenlink senden/ }));
    expect(screen.getByTestId("kundenlink-dialog")).toHaveAttribute("data-kunde", "");
  });

  it("nimmt keinen Kunden an, den der Nutzer nicht sehen darf", () => {
    /*
     * Eine von Hand in die Adresse gesetzte fremde Kennung: Investment und
     * Kontakt stehen nicht im Zwischenspeicher, die Zeilensicherheit gibt sie
     * diesem Nutzer nicht. Dann kein Kundenbezug, kein Name, kein Kunde am
     * Exposé.
     */
    zustand.investments = {};
    zustand.kontakte = {};
    zeige(`/objekte/o1/einheiten/w1?empfehlung=fremd&zurueck=${encodeURIComponent("/kunden/fremd")}`);
    expect(screen.queryByTestId("kundenbezug-hinweis")).not.toBeInTheDocument();
    expect(exposeAdresse().searchParams.get("kunde")).toBeNull();
  });

  it("zeigt im Lotsen keine Rechnung für den Kunden, auch nicht im Kundenbezug (05.10.2026)", () => {
    zeige(AUS_DEM_KUNDENPROFIL);
    fireEvent.mouseDown(screen.getByTestId("reiter-lotse"), { button: 0 });
    expect(screen.getByTestId("objekt-lotse")).toBeInTheDocument();
    expect(Object.keys(lotseProps.letzte)).not.toContain("kopf");
    expect(document.body.textContent).not.toContain("Rechnung für diesen Kunden");
  });

  it("schon die Kunden-Parameter in der Adresse machen die Rechnung für den Lotsen kundenbezogen (Runde 6)", () => {
    // Kontakt und Investment nicht im Zwischenspeicher: kein Kundenbezug für das Exposé, aber Kundenkontext für den Lotsen.
    zustand.investments = {};
    zustand.kontakte = {};
    lotse.kalkulation.mockClear();
    zeige(`/objekte/o1/einheiten/w1?empfehlung=inv9&zurueck=${encodeURIComponent("/kunden/k9")}`);
    fireEvent.mouseDown(screen.getByTestId("reiter-lotse"), { button: 0 });
    expect(lotse.kalkulation).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), null, true);

    lotse.kalkulation.mockClear();
    zeige("/objekte/o1/einheiten/w1");
    fireEvent.mouseDown(screen.getAllByTestId("reiter-lotse")[1], { button: 0 });
    expect(lotse.kalkulation).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), null, false);
  });
});
