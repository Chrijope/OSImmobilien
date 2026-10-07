import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ObjektData } from "@/lib/objekteStore";

/**
 * Die aufgeklappten Wohneinheiten in der Listenansicht der Seite „Objekte".
 *
 * Christian am 23.09.2026:
 *
 *   1. Geoeffnet wird nur eine freie Einheit, auch eine vorgemerkte. Das gilt
 *      auch fuer den Admin.
 *   2. „Kunde / VP" zeigt Kunde, Vertriebspartner und Reservierungsdatum,
 *      die Namen nur fuer Admin, Inhaber, Vertriebsleiter und beim eigenen
 *      Kunden. Eine Reservierung aus Investagon heisst „über Investagon".
 *   3. Bei Objekten aus Investagon ist der Status ein festes Kennzeichen,
 *      und die Spalten „Aktion" und „Bearbeiten" entfallen. Bei von Hand
 *      angelegten bleibt alles wie bisher.
 */

const stand = vi.hoisted(() => ({
  rolle: "admin",
  name: "Christian Peetz",
  benutzerId: "u-admin",
  objekte: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ limit: async () => ({ data: [] }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
    rpc: async () => ({ error: null }),
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: stand.rolle, name: stand.name, email: "" }, authUser: { id: stand.benutzerId } }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/dataCache", () => ({ cacheGet: () => [], cacheSet: () => undefined }));
// Der Zweig fuer Testkonten bricht das Nachladen aus Supabase gleich ab.
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => true }));
vi.mock("@/lib/umgebungVorladen", () => ({ umgebungVorladen: () => undefined }));
vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => "u1" }));
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (_schluessel: string, rueckfall: unknown) => rueckfall,
  setUserSetting: () => undefined,
}));
vi.mock("@/lib/objekteImages", () => ({ resolveImageUrl: (u: string) => u }));
vi.mock("@/components/objekte/PortfolioKacheln", () => ({ PortfolioKacheln: () => <div /> }));
vi.mock("@/components/objekte/InvestagonImportDialog", () => ({ InvestagonImportDialog: () => <div /> }));
vi.mock("@/components/objekte/LotseUnterlagenDialog", () => ({ LotseUnterlagenDialog: () => <div /> }));
vi.mock("@/lib/objektFavorites", () => ({
  useObjektFavorites: () => ({ favorites: [], isFavorite: () => false, toggleFavorite: () => undefined }),
}));
vi.mock("@/lib/objekteStore", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/objekteStore")>();
  return {
    ...echt,
    getObjekte: () => stand.objekte,
    getObjekteImAngebot: () => stand.objekte.map(echt.objektImAngebot),
    markObjekteSeen: () => undefined,
  };
});

const { default: Objekte } = await import("./Objekte");

/** Eine Einheit, so knapp wie die Tabelle sie braucht. */
function einheit(id: string, teil: Record<string, unknown> = {}) {
  return {
    id, weNr: id, etage: "EG", lage: "", status: "frei", vermietet: true,
    groesse: 50, zimmer: 2, mieteGesamt: 500, vkGesamt: 200000, rendite: 3, ...teil,
  };
}

function objekt(id: string, wohnungen: unknown[], meta: Record<string, unknown> = {}): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München",
    beschreibung: "", highlights: [], bildUrl: "", bilder: [], dokumente: [], wohnungen,
    videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0,
    sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01", erstellt_von: "u1", meta,
  } as unknown as ObjektData;
}

/** Im CRM reserviert, mit Kunde, Partner und Datum. */
const crmReservierung = (id: string, teil: Record<string, unknown> = {}) => einheit(id, {
  status: "reserviert", kundeId: "k1", kundeName: "Max Kunde", beraterName: "Bernd Berater",
  reserviertAm: "2026-09-12", ...teil,
});

/** So kommt eine Investagon-Einheit aus dem Import: Kennung und Rohdatensatz. */
const ausInvestagon = (id: string, active: number, statusName: string, teil: Record<string, unknown> = {}) => einheit(id, {
  status: active === 1 ? "frei" : "reserviert",
  investagonId: `p-${id}`,
  investagonStatusText: statusName,
  investagonRaw: { active, visibility: 1, statusName, updated: "2026-09-20T08:00:00Z" },
  ...teil,
});

function zeigeSeite() {
  return render(
    <MemoryRouter initialEntries={["/objekte"]}>
      <Routes>
        <Route path="/objekte" element={<Objekte />} />
        <Route path="/objekte/:id/wohnung/:wid" element={<div>Wohnungsseite</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Listenansicht, dann die Wohneinheiten des (einzigen) Objekts aufklappen. */
function klappeAuf() {
  fireEvent.click(screen.getByRole("button", { name: "Listenansicht" }));
  fireEvent.click(screen.getByRole("button", { name: /Wohneinheiten/ }));
}

const zeile = (id: string) => screen.getByTestId(`wohnung-${id}`);
const spaltenkoepfe = () => screen.getAllByRole("columnheader").map((k) => k.textContent);

beforeEach(() => {
  stand.rolle = "admin";
  stand.name = "Christian Peetz";
  stand.benutzerId = "u-admin";
  stand.objekte = [];
});

describe("Objekte, Wohneinheiten: von Hand angelegtes Objekt", () => {
  beforeEach(() => {
    stand.objekte = [objekt("a", [einheit("1"), crmReservierung("2")])];
  });

  it("bleibt wie bisher: Auswahlfeld, Aktion und Bearbeiten", () => {
    zeigeSeite();
    klappeAuf();
    expect(spaltenkoepfe()).toEqual(expect.arrayContaining(["Status", "Kunde / VP", "Aktion", "Bearbeiten"]));
    expect(within(zeile("1")).getByRole("combobox")).toBeInTheDocument();
    expect(within(zeile("2")).getByRole("combobox")).toBeInTheDocument();
    expect(within(zeile("2")).getByRole("button", { name: "Aufheben" })).toBeInTheDocument();
    expect(within(zeile("2")).getByRole("button", { name: "Bearbeiten" })).toBeInTheDocument();
    expect(within(zeile("2")).getByRole("button", { name: "Wohnung löschen" })).toBeInTheDocument();
  });

  it("zeigt dem Admin Kunde, Partner und Reservierungsdatum", () => {
    zeigeSeite();
    klappeAuf();
    const reserviert = zeile("2");
    expect(within(reserviert).getByRole("button", { name: "Max Kunde" })).toBeInTheDocument();
    expect(within(reserviert).getByText("VP: Bernd Berater")).toBeInTheDocument();
    expect(within(reserviert).getByText("reserviert am 12.09.2026")).toBeInTheDocument();
  });

  it("oeffnet eine freie Einheit, eine reservierte auch fuer den Admin nicht", () => {
    zeigeSeite();
    klappeAuf();
    expect(zeile("2")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(zeile("2"));
    expect(screen.queryByText("Wohnungsseite")).not.toBeInTheDocument();
    fireEvent.click(zeile("1"));
    expect(screen.getByText("Wohnungsseite")).toBeInTheDocument();
  });
});

describe("Objekte, Wohneinheiten: Objekt aus Investagon", () => {
  beforeEach(() => {
    stand.objekte = [objekt("i", [
      ausInvestagon("1", 1, "Frei"),
      ausInvestagon("2", 7, "Notartermin"),
      ausInvestagon("3", 6, "Reserviert", { kundeId: "k1", kundeName: "Max Kunde", beraterName: "Bernd Berater", reserviertAm: "2026-09-12" }),
    ], { investagonId: "projekt-1", investagonSlug: "projekt-1" })];
  });

  it("zeigt den Status als festes Kennzeichen, ohne Auswahlfeld", () => {
    zeigeSeite();
    klappeAuf();
    // Nur die Zeilen: Oben auf der Seite stehen Filter, die auch Auswahlfelder sind.
    for (const id of ["1", "2", "3"]) {
      expect(within(zeile(id)).queryByRole("combobox")).not.toBeInTheDocument();
    }
    expect(within(zeile("2")).getByTestId("status-kennzeichen")).toHaveTextContent("Notartermin");
    expect(within(zeile("1")).getByTestId("status-kennzeichen")).toHaveTextContent("Frei");
  });

  it("laesst die Spalten Aktion und Bearbeiten ganz weg", () => {
    zeigeSeite();
    klappeAuf();
    expect(spaltenkoepfe()).not.toContain("Aktion");
    expect(spaltenkoepfe()).not.toContain("Bearbeiten");
    expect(screen.queryAllByRole("button", { name: "Aufheben" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "Wohnung löschen" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "Person hinzufügen" })).toHaveLength(0);
  });

  it("schreibt bei einer Reservierung ohne Kunden „über Investagon“, ohne geratenes Datum", () => {
    zeigeSeite();
    klappeAuf();
    expect(within(zeile("2")).getByText("über Investagon")).toBeInTheDocument();
    expect(within(zeile("2")).queryByText(/20\.09\.2026/)).not.toBeInTheDocument();
  });

  it("zeigt bei einer Reservierung aus dem CRM Kunde, Partner und Datum", () => {
    zeigeSeite();
    klappeAuf();
    expect(within(zeile("3")).getByRole("button", { name: "Max Kunde" })).toBeInTheDocument();
    expect(within(zeile("3")).getByText("reserviert am 12.09.2026")).toBeInTheDocument();
  });
});

describe("Objekte, Wohneinheiten: als Vertriebspartnerin", () => {
  beforeEach(() => {
    stand.rolle = "vertriebspartner";
    stand.name = "Anna Muster";
    stand.benutzerId = "u-anna";
    stand.objekte = [objekt("a", [
      einheit("1"),
      crmReservierung("2"),
      crmReservierung("3", { kundeId: "k3", kundeName: "Eva Eigen", beraterName: "Anna Muster" }),
    ])];
  });

  it("sieht bei fremden Kunden nur das Datum, keinen Namen", () => {
    zeigeSeite();
    klappeAuf();
    expect(within(zeile("2")).getByText("reserviert am 12.09.2026")).toBeInTheDocument();
    expect(screen.queryAllByText("Max Kunde")).toHaveLength(0);
    expect(screen.queryAllByText(/Bernd Berater/)).toHaveLength(0);
  });

  it("sieht beim eigenen Kunden den Namen", () => {
    zeigeSeite();
    klappeAuf();
    expect(within(zeile("3")).getByRole("button", { name: "Eva Eigen" })).toBeInTheDocument();
    expect(within(zeile("3")).getByText("VP: Anna Muster")).toBeInTheDocument();
  });

  // Fremde Reservierungen lehnt `einheit_reservierung_aufheben` ab, der Knopf stand trotzdem da.
  it("hat „Aufheben“ nur beim eigenen Kunden", () => {
    zeigeSeite();
    klappeAuf();
    expect(within(zeile("2")).queryByRole("button", { name: "Aufheben" })).not.toBeInTheDocument();
    expect(within(zeile("3")).getByRole("button", { name: "Aufheben" })).toBeInTheDocument();
  });

  it("kommt auch beim eigenen Kunden nicht in die reservierte Einheit", () => {
    zeigeSeite();
    klappeAuf();
    fireEvent.click(zeile("3"));
    expect(screen.queryByText("Wohnungsseite")).not.toBeInTheDocument();
  });
});

describe("Objekte, Wohneinheiten: vorgemerkt", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 23, 10, 0));
    stand.objekte = [objekt("a", [einheit("1", {
      vorgemerktBis: new Date(2026, 8, 23, 14, 30).toISOString(),
      vorgemerktKundeId: "k5", vorgemerktKundeName: "Vera Vorgemerkt", vorgemerktBeraterName: "Bernd Berater",
    })])];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("zeigt „vorgemerkt bis“ samt Kunde und Partner und laesst sich oeffnen", () => {
    zeigeSeite();
    klappeAuf();
    const vorgemerkt = zeile("1");
    expect(within(vorgemerkt).getByText("vorgemerkt bis 14:30")).toBeInTheDocument();
    expect(within(vorgemerkt).getByRole("button", { name: "Vera Vorgemerkt" })).toBeInTheDocument();
    expect(within(vorgemerkt).getByText("VP: Bernd Berater")).toBeInTheDocument();
    fireEvent.click(vorgemerkt);
    expect(screen.getByText("Wohnungsseite")).toBeInTheDocument();
  });
});
