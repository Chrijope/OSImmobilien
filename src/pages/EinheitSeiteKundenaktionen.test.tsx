import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Die Aktionen oben rechts auf der Einheitsseite (Bauplan Kundenansicht vom
 * 23.09.2026, Teil 3): zwei Gruppen „Für den Kunden“ und „Intern“. „Exposé
 * für Kunden“ ist in „Kundenlink senden“ aufgegangen. An einer Einheit eines
 * Globalobjekts gibt es keine Kundenaktionen, dort steht der Satz dazu.
 */

const zustand = vi.hoisted(() => ({ objekte: {} as Record<string, unknown>, rolle: "admin" }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: zustand.rolle, name: "Test", email: "" }, authUser: null }),
  useOptionalUser: () => ({ user: { role: zustand.rolle, name: "Test" } }),
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
  ExposeErzeugenDialog: (p: { objekt: { id: string }; vorgewaehlteWohnungId?: string; ganzesObjekt?: boolean }) => (
    <div data-testid="kundenlink-dialog" data-objekt={p.objekt.id} data-wohnung={p.vorgewaehlteWohnungId ?? ""} data-ganz={String(!!p.ganzesObjekt)} />
  ),
}));
// Der Zugang hat seinen eigenen Test. Hier zählt, welche Knöpfe die Rolle bekommt, auch bei Rollen, die der Zugang sonst umleitet.
vi.mock("@/components/objektseite/ObjektseiteZugang", () => ({
  ObjektseiteZugang: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => zustand.objekte[id],
}));

const { default: EinheitSeite } = await import("./EinheitSeite");

function we(id: string): ObjektWohnung {
  return { id, weNr: `WE ${id}`, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 600, vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei" };
}

function objekt(id: string, wohnungen: ObjektWohnung[], weiteres: Partial<ObjektData> = {}): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen, videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {},
    ...weiteres,
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

beforeEach(() => { zustand.rolle = "admin"; });

describe("Aktionen auf der Einheitsseite", () => {
  it("teilt in „Für den Kunden“ und „Intern“, „Als Kunde ansehen“ öffnet die Vorschau in einem neuen Tab", () => {
    zustand.objekte = { o1: objekt("o1", [we("w1"), we("w2")]) };
    zeige("/objekte/o1/einheiten/w1");
    const kunde = screen.getByRole("group", { name: "Für den Kunden" });
    expect(within(kunde).queryByRole("link", { name: /Als Kunde ansehen/ })).not.toBeInTheDocument();
    expect(within(kunde).getByRole("button", { name: /Kundenlink senden/ })).toBeInTheDocument();
    expect(within(kunde).getByRole("button", { name: /Für Kunden reservieren/ })).toBeInTheDocument();

    const intern = screen.getByRole("group", { name: "Intern" });
    // Seit dem 05.10.2026 links neben „Exposé anzeigen“, gleich groß.
    const ansehen = within(intern).getByRole("link", { name: /Als Kunde ansehen/ });
    expect(ansehen).toHaveAttribute("href", "/objekte/o1/einheiten/w1/kundenansicht");
    expect(ansehen).toHaveAttribute("target", "_blank");
    // Das Exposé öffnet seit dem 23.09.2026 immer in einem eigenen Tab, ohne CRM-Rahmen.
    const expose = within(intern).getByRole("link", { name: /Exposé anzeigen/ });
    expect(ansehen.nextElementSibling).toBe(expose);
    expect(ansehen.className).toBe(expose.className);
    expect(expose).toHaveAttribute("href", "/objekte/o1/einheiten/w1/expose");
    expect(expose).toHaveAttribute("target", "_blank");
    expect(expose.getAttribute("rel")).toContain("noopener");
    expect(within(intern).getByRole("button", { name: /Einheit pflegen/ })).toBeInTheDocument();
    expect(within(intern).getByRole("button", { name: /Wohnung bearbeiten/ })).toBeInTheDocument();
    expect(within(intern).queryByRole("button", { name: /Objekt bearbeiten/ })).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /Exposé für Kunden/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("aktionen-erklaerung")).toHaveTextContent("Als Kunde ansehen");
  });

  /*
   * Seit dem 05.10.2026 (Christians Go) bekommen Vertriebsleitung und
   * Vertriebspartner dieselben Kundenaktionen wie der Admin, im selben
   * Layout und mit dem Erklärtext. Pflegen und die Investmentkalkulation
   * bleiben beim Admin.
   */
  it.each(["vertriebsleiter", "vertriebspartner"])("gibt der Rolle %s die Kundenaktionen wie dem Admin, ohne Pflege", (rolle) => {
    zustand.rolle = rolle;
    zustand.objekte = { o2: objekt("o2", [we("w1"), we("w2")]) };
    zeige("/objekte/o2/einheiten/w1");
    const kunde = screen.getByRole("group", { name: "Für den Kunden" });
    expect(within(kunde).getByRole("button", { name: /Kundenlink senden/ })).toBeInTheDocument();
    expect(within(kunde).getByRole("button", { name: /Für Kunden reservieren/ })).toBeInTheDocument();
    const intern = screen.getByRole("group", { name: "Intern" });
    const ansehen = within(intern).getByRole("link", { name: /Als Kunde ansehen/ });
    const expose = within(intern).getByRole("link", { name: /Exposé anzeigen/ });
    expect(ansehen).toHaveAttribute("href", "/objekte/o2/einheiten/w1/kundenansicht");
    expect(ansehen.nextElementSibling).toBe(expose);
    expect(expose).toHaveAttribute("href", "/objekte/o2/einheiten/w1/expose");
    expect(expose).toHaveAttribute("target", "_blank");
    for (const knopf of [/Einheit pflegen/, /Wohnung bearbeiten/, /Objekt bearbeiten/]) {
      expect(screen.queryByRole("button", { name: knopf })).not.toBeInTheDocument();
    }
    // Seit dem 05.10.2026 auch die Investmentkalkulation wie beim Admin.
    expect(screen.getByRole("tab", { name: "Investmentkalkulation" })).toBeInTheDocument();
    expect(screen.getByTestId("aktionen-erklaerung")).toHaveTextContent("Als Kunde ansehen");
  });

  it.each(["objektpartner", "finanzierungspartner"])("gibt der Rolle %s keine Kundenaktionen", (rolle) => {
    zustand.rolle = rolle;
    zustand.objekte = { o2: objekt("o2", [we("w1"), we("w2")]) };
    zeige("/objekte/o2/einheiten/w1");
    expect(screen.queryByRole("link", { name: /Als Kunde ansehen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kundenlink senden/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Exposé anzeigen/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("aktionen-erklaerung")).not.toBeInTheDocument();
  });

  // Beim Globalobjekt wie beim Admin: keine Kundenansicht an der Einheit, aber das Exposé.
  it("zeigt dem Vertriebspartner an einer Einheit eines Globalobjekts dasselbe wie dem Admin", () => {
    zustand.rolle = "vertriebspartner";
    zustand.objekte = { g1: objekt("g1", [we("w1"), we("w2")], { globalObjekt: true }) };
    zeige("/objekte/g1/einheiten/w1");
    expect(screen.getByTestId("hinweis-globalobjekt")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Als Kunde ansehen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kundenlink senden/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Intern" })).getByRole("link", { name: /Exposé anzeigen/ })).toHaveAttribute("href", "/objekte/g1/einheiten/w1/expose");
  });

  // Seit dem 05.10.2026 immer linksbündig (Christian): Spalten beginnen links, ab lg so breit wie die Reiter.
  it.each(["admin", "vertriebspartner", "objektpartner"])("stellt die Reiterleiste für %s linksbündig", (rolle) => {
    zustand.rolle = rolle;
    zustand.objekte = { o1: objekt("o1", [we("w1"), we("w2")]) };
    zeige("/objekte/o1/einheiten/w1");
    const leiste = screen.getByRole("tablist");
    expect(leiste.className).toMatch(/(^|\s)justify-start(\s|$)/);
    expect(leiste.className).not.toMatch(/(^|\s)justify-center(\s|$)/);
    expect(leiste.className).toContain("lg:w-fit");
    expect(leiste.className).not.toMatch(/mx-auto/);
  });

  it("öffnet mit „Kundenlink senden“ den Dialog für dieses Objekt und diese Einheit", () => {
    zustand.objekte = { o1: objekt("o1", [we("w1"), we("w2")]) };
    zeige("/objekte/o1/einheiten/w2");
    expect(screen.queryByTestId("kundenlink-dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Kundenlink senden/ }));
    const dialog = screen.getByTestId("kundenlink-dialog");
    expect(dialog).toHaveAttribute("data-objekt", "o1");
    expect(dialog).toHaveAttribute("data-wohnung", "w2");
    expect(dialog).toHaveAttribute("data-ganz", "false");
  });

  it("nimmt das Investment aus der Objektauswahl in die Vorschau mit", () => {
    zustand.objekte = { o1: objekt("o1", [we("w1"), we("w2")]) };
    zeige("/objekte/o1/einheiten/w1?empfehlung=inv1");
    expect(screen.getByRole("link", { name: /Als Kunde ansehen/ })).toHaveAttribute("href", "/objekte/o1/einheiten/w1/kundenansicht?investmentId=inv1");
  });

  it("stellt beim Einzelobjekt „Objekt bearbeiten“ in die Gruppe „Intern“", () => {
    zustand.objekte = { o2: objekt("o2", [we("w1")]) };
    zeige("/objekte/o2/einheiten/w1");
    expect(within(screen.getByRole("group", { name: "Intern" })).getByRole("button", { name: /Objekt bearbeiten/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Als Kunde ansehen/ })).toHaveAttribute("href", "/objekte/o2/einheiten/w1/kundenansicht");
  });

  it("zeigt an einer Einheit eines Globalobjekts keine Kundenaktionen, sondern den Satz dazu", () => {
    zustand.objekte = { g1: objekt("g1", [we("w1"), we("w2")], { globalObjekt: true }) };
    zeige("/objekte/g1/einheiten/w1");
    expect(screen.getByTestId("hinweis-globalobjekt")).toHaveTextContent("Dieses Haus wird nur als Ganzes verkauft. Kundenansicht und Kundenlink stehen auf der Objektseite.");
    expect(screen.queryByRole("group", { name: "Für den Kunden" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Als Kunde ansehen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kundenlink senden/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Für Kunden reservieren/ })).not.toBeInTheDocument();
    const expose = within(screen.getByRole("group", { name: "Intern" })).getByRole("link", { name: /Exposé anzeigen/ });
    expect(expose).toHaveAttribute("href", "/objekte/g1/einheiten/w1/expose");
    expect(expose).toHaveAttribute("target", "_blank");
  });
});
