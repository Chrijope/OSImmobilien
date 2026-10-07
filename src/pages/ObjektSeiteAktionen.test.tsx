import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ReactNode } from "react";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Aktionen und Bearbeiten-Stifte auf der Objektseite.
 *
 * Geprüft wird:
 *
 *   1. Bei einem Objekt aus Investagon erscheint „Objekt bearbeiten" nicht,
 *      weil der Abgleich jede Handänderung an den Stammdaten wieder
 *      überschreibt. Stattdessen steht der erklärende Satz da.
 *   2. Seit dem 23.09.2026 (Christians Vorgabe): „Objektangaben pflegen" und
 *      „Exposé je Einheit erzeugen" sind weg. Die Objektangaben öffnet der
 *      Stift an den Objektdetails, Beschreibung und Standort der Stift an
 *      ihrer Karte, beides nur für Admin und Inhaber.
 *   3. Ein Globalobjekt hat keine Einheitsseite und bekommt deshalb „Exposé
 *      anzeigen", mit dem Ziel `/objekte/<id>/expose`.
 */

const zustand = vi.hoisted(() => ({
  objekte: {} as Record<string, unknown>,
  rolle: "admin",
  // Lässt die Seite ohne die Zugangsprüfung rendern, damit sich die Regel
  // für die Stifte auch unabhängig von ihr prüfen lässt.
  zugangUmgehen: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: zustand.rolle, name: "Test", email: "" }, authUser: null }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div>Galerie</div> }));
// Der selbsttätige Textlauf gehört nicht hierher, er hat seinen eigenen Test.
vi.mock("@/lib/objektTexteKi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektTexteKi")>()),
  brauchtObjektTexte: () => false,
  starteObjektTexteBeiBedarf: async () => undefined,
}));
vi.mock("@/components/objektseite/ObjektseiteZugang", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/components/objektseite/ObjektseiteZugang")>();
  return {
    ObjektseiteZugang: (p: { verwaltungPfad: string; children: ReactNode }) =>
      zustand.zugangUmgehen ? <>{p.children}</> : <echt.ObjektseiteZugang {...p} />,
  };
});
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => zustand.objekte[id],
  updateObjektFieldFast: async () => undefined,
}));

const { default: ObjektSeite } = await import("./ObjektSeite");

function we(id: string): ObjektWohnung {
  return { id, weNr: `WE ${id}`, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 600, vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei" };
}

function objekt(id: string, meta: Record<string, unknown>, weiteres: Partial<ObjektData> = {}): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen: [we("w1"), we("w2")], videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta,
    ...weiteres,
  } as unknown as ObjektData;
}

function zeigeObjekt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/objekte/${id}`]}>
      <Routes>
        <Route path="/objekte/:id" element={<ObjektSeite />} />
        <Route path="/objekte/:id/verwaltung" element={<p>Verwaltungsansicht</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const STIFT_DETAILS = "Objektdetails bearbeiten";
const STIFT_TEXTE = "Beschreibung und Standort bearbeiten";

beforeEach(() => {
  zustand.rolle = "admin";
  zustand.zugangUmgehen = false;
});

/*
 * Die Seitenleiste steht zweimal im Markup, einmal für schmale und einmal für
 * breite Bildschirme. Deshalb wird dort mit `AllBy` gezählt.
 */
describe("Aktionen auf der Objektseite", () => {
  it("zeigt „Objekt bearbeiten“ bei einem selbst angelegten Objekt, die entfallenen Knöpfe nicht mehr", () => {
    zustand.objekte = { eigen: objekt("eigen", {}) };
    zeigeObjekt("eigen");
    expect(screen.getAllByRole("button", { name: /Objekt bearbeiten/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Objektangaben pflegen/ })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /Exposé je Einheit erzeugen/ })).toHaveLength(0);
    expect(screen.queryAllByText(/Exposé je Einheit/)).toHaveLength(0);
  });

  it('blendet bei Investagon „Objekt bearbeiten“ aus und erklärt es', () => {
    zustand.objekte = { ig: objekt("ig", { investagonId: "4711" }) };
    zeigeObjekt("ig");
    expect(screen.queryAllByRole("button", { name: /Objekt bearbeiten/ })).toHaveLength(0);
    expect(screen.getAllByText(/kommt aus Investagon und wird dort gepflegt/).length).toBeGreaterThan(0);
    // Der Admin erfährt, dass die Pflege in `meta` trotzdem geht.
    expect(screen.getAllByText(/über den Stift an der jeweiligen Karte/).length).toBeGreaterThan(0);
  });

  it("nennt keinen Objektpartner mehr als den, der pflegt", () => {
    zustand.objekte = { eigen: objekt("eigen", {}) };
    zeigeObjekt("eigen");
    expect(screen.queryAllByText(/Objektpartner trägt/)).toHaveLength(0);
  });
});

describe("Exposé beim Globalobjekt", () => {
  it("verlinkt beim Globalobjekt „Exposé anzeigen“ auf das Exposé des ganzen Objekts", () => {
    zustand.objekte = { g1: objekt("g1", {}, { globalObjekt: true }) };
    zeigeObjekt("g1");
    const links = screen.getAllByRole("link", { name: /Exposé anzeigen/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/objekte/g1/expose");
      // Seit dem 23.09.2026 immer in einem eigenen Tab, ohne CRM-Rahmen.
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("zeigt „Exposé anzeigen“ auch beim Globalobjekt mit nur einer Einheit, denn es springt nie in die Einheit", () => {
    zustand.objekte = { g2: objekt("g2", {}, { globalObjekt: true, wohnungen: [we("w1")] }) };
    zeigeObjekt("g2");
    expect(screen.getAllByRole("link", { name: /Exposé anzeigen/ })[0]).toHaveAttribute("href", "/objekte/g2/expose");
  });

  it("zeigt bei einem Objekt mit Einheitsseiten kein „Exposé anzeigen“", () => {
    zustand.objekte = { mfh: objekt("mfh", {}) };
    zeigeObjekt("mfh");
    expect(screen.queryAllByRole("link", { name: /Exposé anzeigen/ })).toHaveLength(0);
    // Seit dem 23.09.2026 steht der Weg zu Kundenansicht und Kundenlink über der Wohnungstabelle.
    expect(screen.getByTestId("hinweis-kundenansicht")).toHaveTextContent("Kundenansicht und Kundenlink findest du auf jeder Einheitsseite.");
  });
});

/*
 * Bauplan Kundenansicht vom 23.09.2026, Teil 3: Bei einem Haus mit mehreren
 * Wohnungen entfällt die Karte „Aktionen“ samt der beiden gesperrten Knöpfe,
 * „Objekt bearbeiten“ steht im Kopf. Das Globalobjekt behält die Karte und
 * bekommt „Als Kunde ansehen“ und „Kundenlink senden“ für das ganze Haus.
 */
describe("Aktionen nach dem Umbau zur Kundenansicht", () => {
  it("hat beim Haus mit mehreren Wohnungen keine Aktionskarte, „Objekt bearbeiten“ steht einmal im Kopf", () => {
    zustand.objekte = { mfh: objekt("mfh", {}) };
    zeigeObjekt("mfh");
    expect(screen.queryByTestId("karte-aktionen")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /Kundenlink erstellen/ })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /Objektseite als Kunde ansehen/ })).toHaveLength(0);
    expect(screen.queryAllByText(/kommen mit der nächsten Etappe/)).toHaveLength(0);
    // Nicht mehr in der doppelt gezeichneten Seitenleiste, sondern einmal im Kopf.
    expect(screen.getAllByRole("button", { name: /Objekt bearbeiten/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Objekt bearbeiten/ }));
    expect(screen.getByText("Verwaltungsansicht")).toBeInTheDocument();
  });

  it("erklärt beim Haus aus Investagon im Kopf, warum „Objekt bearbeiten“ fehlt", () => {
    zustand.objekte = { ig: objekt("ig", { investagonId: "4711" }) };
    zeigeObjekt("ig");
    expect(screen.queryByTestId("karte-aktionen")).not.toBeInTheDocument();
    expect(screen.getAllByText(/kommt aus Investagon und wird dort gepflegt/)).toHaveLength(1);
  });

  it("zeigt beim Globalobjekt „Als Kunde ansehen“ für das ganze Haus in einem neuen Tab und „Kundenlink senden“", () => {
    zustand.objekte = { g1: objekt("g1", {}, { globalObjekt: true }) };
    zeigeObjekt("g1");
    expect(screen.getAllByTestId("karte-aktionen").length).toBeGreaterThan(0);
    const ansehen = screen.getAllByRole("link", { name: /Als Kunde ansehen/ });
    expect(ansehen.length).toBeGreaterThan(0);
    for (const link of ansehen) {
      expect(link).toHaveAttribute("href", "/objekte/g1/kundenansicht");
      expect(link).toHaveAttribute("target", "_blank");
    }
    expect(screen.getAllByRole("button", { name: /Kundenlink senden/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Kundenlink erstellen/ })).toHaveLength(0);
    expect(screen.queryByTestId("hinweis-kundenansicht")).not.toBeInTheDocument();
  });
});

/*
 * Seit dem 05.10.2026 (Christians Go) haben Vertriebsleitung und
 * Vertriebspartner beim Globalobjekt dieselben Kundenaktionen wie der Admin.
 * Pflegen bleibt beim Admin. Der Zugang ist hier umgangen, damit nur die
 * Knopfregel zählt.
 */
describe("Kundenaktionen beim Globalobjekt nach aktiver Rolle", () => {
  for (const rolle of ["vertriebsleiter", "vertriebspartner"]) {
    it(`zeigt ${rolle} Exposé, Kundenansicht und Kundenlink samt Erklärung, ohne Pflege`, () => {
      zustand.rolle = rolle;
      zustand.zugangUmgehen = true;
      zustand.objekte = { g1: objekt("g1", {}, { globalObjekt: true }) };
      zeigeObjekt("g1");
      for (const link of screen.getAllByRole("link", { name: /Exposé anzeigen/ })) expect(link).toHaveAttribute("href", "/objekte/g1/expose");
      for (const link of screen.getAllByRole("link", { name: /Als Kunde ansehen/ })) expect(link).toHaveAttribute("href", "/objekte/g1/kundenansicht");
      expect(screen.getAllByRole("button", { name: /Kundenlink senden/ }).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/„Kundenlink senden" schickt sie ihm/).length).toBeGreaterThan(0);
      expect(screen.queryAllByRole("button", { name: /Objekt bearbeiten/ })).toHaveLength(0);
      expect(screen.queryAllByText(/änderst du über den Stift/)).toHaveLength(0);
    });
  }

  for (const rolle of ["objektpartner", "finanzierungspartner"]) {
    it(`zeigt ${rolle} keine Kundenaktionen`, () => {
      zustand.rolle = rolle;
      zustand.zugangUmgehen = true;
      zustand.objekte = { g1: objekt("g1", {}, { globalObjekt: true }) };
      zeigeObjekt("g1");
      expect(screen.queryAllByRole("link", { name: /Exposé anzeigen/ })).toHaveLength(0);
      expect(screen.queryAllByRole("link", { name: /Als Kunde ansehen/ })).toHaveLength(0);
      expect(screen.queryAllByRole("button", { name: /Kundenlink senden/ })).toHaveLength(0);
    });
  }

  // Seit dem 05.10.2026 immer linksbündig (Christian), wie auf der Einheitsseite.
  it("stellt die Reiterleiste linksbündig", () => {
    zustand.objekte = { eigen: objekt("eigen", {}) };
    zeigeObjekt("eigen");
    const leiste = screen.getByRole("tablist");
    expect(leiste.className).toMatch(/(^|\s)justify-start(\s|$)/);
    expect(leiste.className).not.toMatch(/(^|\s)justify-center(\s|$)/);
    expect(leiste.className).not.toMatch(/mx-auto/);
  });
});

describe("Bearbeiten-Stifte nur für Admin und Inhaber", () => {
  for (const rolle of ["admin", "inhaber"]) {
    it(`zeigt ${rolle} beide Stifte, der an den Objektdetails öffnet die Objektangaben`, () => {
      zustand.rolle = rolle;
      zustand.objekte = { eigen: objekt("eigen", {}) };
      zeigeObjekt("eigen");
      expect(screen.getByRole("button", { name: STIFT_TEXTE })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: STIFT_DETAILS }));
      expect(screen.getByRole("dialog", { name: "Objektangaben pflegen" })).toBeInTheDocument();
    });
  }

  for (const rolle of ["objektpartner", "vertriebspartner"]) {
    it(`schickt ${rolle} auf die Verwaltungsansicht, ohne Stift`, () => {
      zustand.rolle = rolle;
      zustand.objekte = { eigen: objekt("eigen", {}) };
      zeigeObjekt("eigen");
      expect(screen.getByText("Verwaltungsansicht")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: STIFT_DETAILS })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: STIFT_TEXTE })).not.toBeInTheDocument();
    });

    /*
     * Die Zugangsprüfung ist heute der erste Riegel. Die Stifte fragen die
     * Rolle trotzdem selbst, damit eine spätere Öffnung der Seite für weitere
     * Rollen die Pflege nicht still mit aufmacht.
     */
    it(`zeigt ${rolle} auch ohne Zugangsprüfung keinen Stift`, () => {
      zustand.rolle = rolle;
      zustand.zugangUmgehen = true;
      zustand.objekte = { eigen: objekt("eigen", {}, { beschreibung: "" }) };
      zeigeObjekt("eigen");
      expect(screen.getByRole("heading", { name: "Haus eigen" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: STIFT_DETAILS })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: STIFT_TEXTE })).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  }
});
