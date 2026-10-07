import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Der Verkaufsstatus im Objektassistenten (Christian, 23.09.2026).
 *
 * `saveObjekt` schreibt Status, Kunde und Reservierung einer vorhandenen
 * Einheit nie. Der Assistent zeigt den Status dort deshalb nur an und schickt
 * beim Speichern den gespeicherten Stand mit, damit kein Hinweis „Der
 * Verkaufsstatus bleibt …“ entsteht. Für eine neue Einheit bleibt die Auswahl.
 */

const t = vi.hoisted(() => ({
  objekt: undefined as unknown,
  rolle: "admin",
  gespeichert: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: t.rolle, name: "Test", email: "" }, authUser: { id: "u-1" } }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/use-toast", () => {
  // Stabil wie im echten Hook, sonst läuft ein Effekt der Seite bei jedem Render.
  const toast = () => undefined;
  return { useToast: () => ({ toast }), toast };
});
vi.mock("@/lib/objektDraftStore", () => ({
  loadObjektDraft: async () => null,
  loadObjektDraftBlobs: async () => null,
  saveObjektDraft: async () => undefined,
  saveObjektDraftBlobs: async () => undefined,
  deleteObjektDraft: async () => undefined,
}));
vi.mock("@/components/objekte/ObjektUploadAnalyse", () => ({ ObjektUploadAnalyse: () => <div>Upload</div> }));
vi.mock("@/components/objekte/AfaRechnerEmbed", () => ({ AfaRechnerEmbed: () => <div>AfA</div> }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => ((t.objekt as { id?: string } | undefined)?.id === id ? t.objekt : undefined),
  getObjekte: () => [],
  saveObjekt: async (o: Record<string, unknown>) => { t.gespeichert.push(o); return true; },
  getLastObjektSaveError: () => "",
  getLastObjektSaveHinweise: () => [],
}));

const { default: ObjektNeu } = await import("./ObjektNeu");

const EINHEIT_ID = "5b6c1f2e-0000-4000-8000-000000000001";

function einheit(felder: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return {
    id: EINHEIT_ID, weNr: "3", etage: "1. OG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 500, vkGesamt: 200000,
    qmPreis: 4000, rendite: 3, vermietet: true, status: "reserviert",
    kundeId: "k-1", kundeName: "Max Kunde", beraterName: "Anna Muster", reserviertAm: "2026-09-12", reserviertVon: "u-anna",
    ...felder,
  };
}

function objekt(wohnungen: ObjektWohnung[]): ObjektData {
  return {
    id: "o-1", titel: "Teststraße 5", adresse: "Teststraße 5", plz: "80331", ort: "München", beschreibung: "",
    highlights: [], bildUrl: "", bilder: [], dokumente: [], wohnungen, videoUrl: "", videoSichtbar: false,
    badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0,
    sichtbar: true, erstellt_am: "2026-01-01",
    verkaeuferDaten: { name: "Verkäufer GmbH", strasse: "Weg 1", plz: "80331", ort: "München", email: "v@beispiel.test", telefon: "" },
    meta: { anlageklasse: "Eigentumswohnung" },
  } as unknown as ObjektData;
}

function oeffnen() {
  return render(
    <MemoryRouter initialEntries={["/objekte/o-1/bearbeiten"]}>
      <Routes>
        <Route path="/objekte/:id/bearbeiten" element={<ObjektNeu />} />
        <Route path="/objekte/:id" element={<p>Objektseite</p>} />
        <Route path="/objekte" element={<p>Objektliste</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Über Attribute statt Rollen: Die Seite ist groß, `getByRole` rechnet dort sekundenlang. */
const auswahlFelder = () => document.querySelectorAll('[aria-label="Verkaufsstatus"]');
const einheitBearbeiten = () => fireEvent.click(document.querySelector('button[aria-label="Bearbeiten"]')!);

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  t.gespeichert = [];
  t.rolle = "admin";
  // Die Seite liest gespeicherte Verkäufer aus dem Browserspeicher.
  const speicher = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, v); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
    key: () => null,
    length: 0,
  });
});
afterEach(() => cleanup());

describe("Verkaufsstatus im Objektassistenten", () => {
  it("zeigt bei einer vorhandenen Einheit nur den Status, die neue Einheit behält die Auswahl", () => {
    t.objekt = objekt([einheit()]);
    oeffnen();
    // Vor dem Aufklappen gibt es genau eine Auswahl: im Formular für eine neue Einheit.
    expect(auswahlFelder()).toHaveLength(1);
    expect(screen.queryByTestId("verkaufsstatus-anzeige")).toBeNull();

    einheitBearbeiten();
    const anzeige = screen.getByTestId("verkaufsstatus-anzeige");
    expect(within(anzeige).getByText("reserviert")).toBeInTheDocument();
    expect(within(anzeige).getByText("Max Kunde")).toBeInTheDocument();
    expect(within(anzeige).getByText("reserviert am 12.09.2026")).toBeInTheDocument();
    expect(within(anzeige).getByText("Reserviert wird über die Einheitsseite oder das Kundenprofil.")).toBeInTheDocument();
    // Die aufgeklappte vorhandene Einheit bringt keine zweite Auswahl mit.
    expect(auswahlFelder()).toHaveLength(1);
  }, 30000);

  it("sperrt den Objektpartner an einem fremden Objekt, dieselbe Regel wie die Datenbank (30.09.2026)", () => {
    t.rolle = "objektpartner";
    t.objekt = objekt([einheit()]);
    oeffnen();
    expect(screen.getByText(/Dieses Objekt kannst du nicht bearbeiten/)).toBeInTheDocument();
  }, 30000);

  it("zeigt dem Objektpartner Status und Datum, aber keine Namen", () => {
    t.rolle = "objektpartner";
    // Sein eigenes Objekt: Nur daran darf er seit dem 30.09.2026 arbeiten.
    t.objekt = { ...objekt([einheit()]), erstellt_von: "u-1" };
    oeffnen();
    einheitBearbeiten();
    const anzeige = screen.getByTestId("verkaufsstatus-anzeige");
    expect(within(anzeige).getByText("reserviert am 12.09.2026")).toBeInTheDocument();
    expect(within(anzeige).queryByText("Max Kunde")).toBeNull();
    expect(within(anzeige).queryByText(/VP:/)).toBeNull();
  }, 30000);

  it("schickt beim Speichern den gespeicherten Status mit, auch wenn der Formularstand veraltet ist", async () => {
    t.objekt = objekt([einheit({ status: "frei", kundeId: undefined, kundeName: undefined, reserviertAm: undefined, reserviertVon: undefined })]);
    oeffnen();
    // Während der Assistent offen ist, reserviert jemand die Einheit.
    t.objekt = objekt([einheit()]);
    einheitBearbeiten();
    expect(within(screen.getByTestId("verkaufsstatus-anzeige")).getByText("reserviert")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Änderungen speichern/).closest("button")!);
    await waitFor(() => expect(t.gespeichert).toHaveLength(1));
    const wohnungen = t.gespeichert[0].wohnungen as ObjektWohnung[];
    expect(wohnungen).toHaveLength(1);
    expect(wohnungen[0].id).toBe(EINHEIT_ID);
    expect(wohnungen[0].status).toBe("reserviert");
  }, 30000);
});
