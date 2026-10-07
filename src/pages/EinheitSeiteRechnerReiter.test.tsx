import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Der Reiter „Investmentkalkulation“ bleibt nach dem ersten Öffnen
 * eingehängt (Befund LOTSE-R3-004). Vorher verlor der Rechner beim
 * Reiterwechsel seine Eingaben und meldete dem OS Lotsen danach wieder die
 * Anfangswerte. Beim Wechsel der Einheit fängt er neu an.
 *
 * Der Rechner selbst ist hier ein Stellvertreter mit eigenem Zustand: Geprüft
 * wird die Seite, nicht der Rechenkern.
 */

const stand = vi.hoisted(() => ({ liste: {} as Record<string, unknown> }));

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
vi.mock("@/lib/objektTexteKi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektTexteKi")>()),
  brauchtObjektTexte: () => false,
  starteObjektTexteBeiBedarf: async () => undefined,
}));
vi.mock("@/components/objektseite/ObjektseiteZugang", () => ({
  ObjektseiteZugang: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div>Galerie</div> }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => stand.liste[id],
}));
vi.mock("@/components/objektseite/EinheitInvestmentrechner", () => ({
  INVESTMENTKALKULATION_ERKLAERUNG: "Genaue Berechnung für einen bestimmten Kunden.",
  EinheitInvestmentrechner: ({ wohnung, sichtbar }: { wohnung: ObjektWohnung; sichtbar?: boolean }) => {
    const [eingaben, setEingaben] = useState(0);
    const navigate = useNavigate();
    return (
      <div data-testid="rechner" data-sichtbar={String(sichtbar)} data-wohnung={wohnung.id}>
        <button type="button" onClick={() => setEingaben((n) => n + 1)}>Eingaben {eingaben}</button>
        <button type="button" onClick={() => navigate("/objekte/o1/einheiten/w2")}>Andere Einheit</button>
      </div>
    );
  },
}));

const { default: EinheitSeite } = await import("./EinheitSeite");

const wohnung = (id: string, weNr: string): ObjektWohnung => ({
  id, weNr, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 600, vkGesamt: 200000,
  qmPreis: 0, rendite: 0, vermietet: true, status: "frei",
});

stand.liste = {
  o1: {
    id: "o1", titel: "Haus o1", adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen: [wohnung("w1", "WE 1"), wohnung("w2", "WE 2")], videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {},
  } as unknown as ObjektData,
};

const reiter = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

describe("Reiter Investmentkalkulation bleibt eingehängt (LOTSE-R3-004)", () => {
  it("behält die Eingaben beim Reiterwechsel und fängt bei einer anderen Einheit neu an", () => {
    render(
      <MemoryRouter initialEntries={["/objekte/o1/einheiten/w1"]}>
        <Routes>
          <Route path="/objekte/:id/einheiten/:weId" element={<EinheitSeite />} />
        </Routes>
      </MemoryRouter>,
    );
    // Vor dem ersten Öffnen ist der Rechner nicht eingehängt.
    expect(screen.queryByTestId("rechner")).toBeNull();

    reiter("Investmentkalkulation");
    expect(screen.getByTestId("rechner")).toHaveAttribute("data-sichtbar", "true");
    fireEvent.click(screen.getByRole("button", { name: "Eingaben 0" }));
    expect(screen.getByRole("button", { name: "Eingaben 1" })).toBeInTheDocument();

    reiter("Übersicht");
    expect(screen.getByTestId("rechner")).toHaveAttribute("data-sichtbar", "false");
    reiter("Investmentkalkulation");
    expect(screen.getByRole("button", { name: "Eingaben 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Andere Einheit" }));
    expect(screen.getByTestId("rechner")).toHaveAttribute("data-wohnung", "w2");
    expect(screen.getByRole("button", { name: "Eingaben 0" })).toBeInTheDocument();
  });
});
