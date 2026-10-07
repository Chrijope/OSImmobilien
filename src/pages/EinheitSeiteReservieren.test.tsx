import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/*
 * Der Knopf „Für Kunden reservieren“ im Kopf der Einheitsseite.
 *
 * Christians Regeln vom 23.09.2026: an freien Einheiten im Angebot, nie an
 * einer Einheit eines Globalobjekts (Entscheidung vom 10.09.2026). Läuft für
 * einen anderen Kunden gerade eine Vereinbarung, steht statt des Knopfes
 * „vorgemerkt bis HH:MM“. Die Rollen prüft zusätzlich die Datenbank.
 */

const s = vi.hoisted(() => ({ liste: {} as Record<string, unknown>, rolle: "admin", investments: {} as Record<string, unknown> }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: s.rolle, name: "Test", email: "" }, authUser: null }),
}));
vi.mock("@/lib/objektTexteKi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektTexteKi")>()),
  brauchtObjektTexte: () => false,
  starteObjektTexteBeiBedarf: async () => undefined,
}));
vi.mock("@/components/objektseite/ObjektseiteZugang", () => ({
  ObjektseiteZugang: (p: { children: React.ReactNode }) => <>{p.children}</>,
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div>Galerie</div> }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => s.liste[id],
}));
vi.mock("@/lib/investmentsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/investmentsStore")>()),
  getInvestmentById: (id: string) => s.investments[id],
}));

const { default: EinheitSeite } = await import("./EinheitSeite");

const IN_EINER_STUNDE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const VOR_EINER_STUNDE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function we(extra: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return { id: "w1", weNr: "WE 6", etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 600, vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...extra };
}

function objekt(w: ObjektWohnung, extra: Partial<ObjektData> = {}): ObjektData {
  return {
    id: "o1", titel: "Haus", adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen: [w, { ...w, id: "w2", weNr: "WE 7" }], videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {}, ...extra,
  } as unknown as ObjektData;
}

function zeige(pfad = "/objekte/o1/einheiten/w1") {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/objekte/:id/einheiten/:weId" element={<EinheitSeite />} />
      </Routes>
    </MemoryRouter>,
  );
}

const KNOPF = { name: "Für Kunden reservieren" };

beforeEach(() => {
  cleanup();
  s.rolle = "admin";
  s.investments = {};
});

describe("Für Kunden reservieren", () => {
  it("steht an einer freien Einheit im Angebot", () => {
    s.liste = { o1: objekt(we()) };
    zeige();
    expect(screen.getByRole("button", KNOPF)).toBeTruthy();
  });

  it("steht in Marken-Orange (Variante brand), damit er heraussticht", () => {
    s.liste = { o1: objekt(we()) };
    zeige();
    const knopf = screen.getByRole("button", KNOPF);
    expect(knopf).toHaveClass("btn-brand");
    // Weder blau gefüllt noch umrandet: sonst überschriebe Liquid Glass die Orange (design-liquid.css, Abschnitt 6).
    expect(knopf).not.toHaveClass("bg-primary");
    expect(knopf).not.toHaveClass("bg-card");
  });

  it("fehlt an einer Einheit eines Globalobjekts", () => {
    s.liste = { o1: objekt(we(), { globalObjekt: true }) };
    zeige();
    expect(screen.queryByRole("button", KNOPF)).toBeNull();
  });

  it("fehlt an einer reservierten oder verkauften Einheit", () => {
    for (const status of ["reserviert", "verkauft"] as const) {
      cleanup();
      s.liste = { o1: objekt(we({ status, kundeId: "k-9" })) };
      zeige();
      expect(screen.queryByRole("button", KNOPF)).toBeNull();
    }
  });

  it("fehlt für Rollen, die nicht reservieren dürfen", () => {
    s.rolle = "objektpartner";
    s.liste = { o1: objekt(we()) };
    zeige();
    expect(screen.queryByRole("button", KNOPF)).toBeNull();
  });

  it("zeigt bei fremder Vormerkung „vorgemerkt bis“ statt des Knopfes", () => {
    s.liste = { o1: objekt(we({ vorgemerktBis: IN_EINER_STUNDE, vorgemerktKundeId: "k-9", vorgemerktKundeName: "Bernd Muster" })) };
    zeige();
    expect(screen.queryByRole("button", KNOPF)).toBeNull();
    expect(screen.getByText(/vorgemerkt bis \d\d:\d\d/)).toBeTruthy();
  });

  it("zeigt den Knopf wieder, sobald die Vormerkung abgelaufen ist", () => {
    s.liste = { o1: objekt(we({ vorgemerktBis: VOR_EINER_STUNDE, vorgemerktKundeId: "k-9" })) };
    zeige();
    expect(screen.getByRole("button", KNOPF)).toBeTruthy();
    expect(screen.queryByText(/vorgemerkt bis/)).toBeNull();
  });

  it("versperrt den Knopf nicht, wenn die Vormerkung dem Kunden aus ?empfehlung= gehört", () => {
    s.investments = { "inv-1": { id: "inv-1", kontaktId: "k-9", pipelineStufe: "objektauswahl" } };
    s.liste = { o1: objekt(we({ vorgemerktBis: IN_EINER_STUNDE, vorgemerktKundeId: "k-9" })) };
    zeige("/objekte/o1/einheiten/w1?empfehlung=inv-1");
    expect(screen.getByRole("button", KNOPF)).toBeTruthy();
  });
});
