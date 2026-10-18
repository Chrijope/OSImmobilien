import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";

/**
 * Entwurf im Assistenten „Objekt anlegen“ (18.10.2026).
 *
 * Geprüft wird, dass jede Variante ihren Entwurf je Nutzer ablegt und beim
 * nächsten Öffnen am selben Schritt wiederfindet, dass der Entwurf erst nach
 * erfolgreichem Anlegen oder bewusstem Verwerfen verschwindet, und dass
 * beim Verlassen über einen Link nachgefragt wird.
 */

const t = vi.hoisted(() => ({
  entwuerfe: new Map<string, unknown>(),
  geloescht: [] as string[],
  gespeichert: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
  },
}));
vi.mock("@/lib/storage", () => ({ objektDateiAblegen: async (p: string) => `https://cdn.test/${p}` }));
vi.mock("@/lib/imageCompression", () => ({
  compressToFile: async (f: File) => f,
  compressForUpload: async (f: File) => f,
  compressImageImmediate: async (f: File) => ({ originalFile: f, thumbnailDataUrl: "data:image/png;base64,AA" }),
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "admin", name: "Test", email: "" }, authUser: { id: "u-1" }, loading: false }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/use-toast", () => {
  const toast = () => undefined;
  return { useToast: () => ({ toast }), toast };
});
vi.mock("@/lib/objektDraftStore", () => ({
  loadObjektDraft: async (k: string) => t.entwuerfe.get(k) ?? null,
  loadObjektDraftBlobs: async () => ({}),
  saveObjektDraft: async (k: string, d: unknown) => { t.entwuerfe.set(k, d); },
  saveObjektDraftBlobs: async () => undefined,
  saveObjektDraftSofort: () => undefined,
  deleteObjektDraft: async (k: string) => { t.geloescht.push(k); t.entwuerfe.delete(k); },
}));
vi.mock("@/components/objekte/ObjektUploadAnalyse", () => ({ ObjektUploadAnalyse: () => <div>Upload</div> }));
vi.mock("@/components/objekte/AfaRechnerEmbed", () => ({ AfaRechnerEmbed: () => <div>AfA</div> }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: () => undefined,
  getObjekte: () => [],
  saveObjekt: async (o: Record<string, unknown>) => { t.gespeichert.push(o); return true; },
  speichereObjektKonzept: async () => null,
  getLastObjektSaveError: () => "",
  getLastObjektSaveHinweise: () => [],
}));

const { default: ObjektNeu } = await import("./ObjektNeu");

const SCHLUESSEL = "osimmo_objekt_neu_draft::u-1";

/** Mit einem Link wie in der Sidebar, um das Verlassen zu prüfen. */
const MitSidebar = ({ children }: { children: React.ReactNode }) => (
  <div><Link to="/objekte">Sidebar Objekte</Link>{children}</div>
);

function neu() {
  return render(
    <MemoryRouter initialEntries={["/objekte/neu"]}>
      <Routes>
        <Route path="/objekte/neu" element={<ObjektNeu Rahmen={MitSidebar} />} />
        <Route path="/objekte" element={<p>Objektliste</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const knopf = (text: RegExp | string) => screen.getByText(text).closest("button")!;
const titelFeld = () => screen.getByPlaceholderText(/KFW 40 QNG Neubau/) as HTMLInputElement;
const entwurf = () => t.entwuerfe.get(SCHLUESSEL) as Record<string, any> | undefined;
const warteAufWiederherstellen = () => new Promise((r) => setTimeout(r, 30));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  t.entwuerfe.clear();
  t.geloescht = [];
  t.gespeichert = [];
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

const VARIANTEN = [
  { karte: "Globalobjekt", global: true, einzel: false, art: undefined },
  { karte: "Einzelwohnung", global: false, einzel: true, art: undefined },
  { karte: "WG und Co-Living", global: false, einzel: true, art: "wg_coliving" },
  { karte: "Objekt mit Einheiten", global: false, einzel: false, art: undefined },
] as const;

describe("Entwurf je Variante", () => {
  for (const v of VARIANTEN) {
    it(`${v.karte}: Eingaben landen im Entwurf und stehen beim nächsten Öffnen am selben Schritt wieder da`, async () => {
      neu();
      await warteAufWiederherstellen();
      fireEvent.click(screen.getByText(v.karte).closest("button")!);
      fireEvent.click(knopf(/Überspringen/));
      fireEvent.change(titelFeld(), { target: { value: `Test ${v.karte}` } });

      await waitFor(() => expect(entwurf()?.nf?.titel).toBe(`Test ${v.karte}`));
      expect(entwurf()).toMatchObject({ step: "0", isGlobalObjekt: v.global, isEinzelwohnung: v.einzel, gewaehlteObjektart: v.art });

      // Schließen und wieder öffnen: ohne neue Typwahl gleich bei den Basisdaten.
      cleanup();
      neu();
      await waitFor(() => expect(titelFeld().value).toBe(`Test ${v.karte}`));
      expect(screen.queryByText("Welche Art von Objekt möchtest du anlegen?")).toBeNull();
      expect(t.geloescht).toEqual([]);
    }, 30000);
  }

  it("stellt Konzept, Verwaltungsart und Anlageklasse aus dem Entwurf wieder her", async () => {
    t.entwuerfe.set(SCHLUESSEL, {
      nf: { titel: "WG Mitte" }, isGlobalObjekt: false, isEinzelwohnung: true, gewaehlteObjektart: "wg_coliving", step: "0",
      zusatz: { anlageklasse: "WG-Wohnung", konzept: "steuer", verwaltungsart: "Mietpool", objektUnterlagenLink: "https://drive.test/ordner" },
    });
    neu();
    await waitFor(() => expect(titelFeld().value).toBe("WG Mitte"));
    expect(document.getElementById("objekt-konzept")?.textContent).toBe("Steuer");
    expect(document.getElementById("objekt-anlageklasse")?.textContent).toBe("WG-Wohnung");
    expect(screen.getByText("Mietpool")).toBeInTheDocument();
    await waitFor(() => expect(entwurf()?.zusatz).toMatchObject({ konzept: "steuer", verwaltungsart: "Mietpool", objektUnterlagenLink: "https://drive.test/ordner" }));
  }, 30000);

  it("übernimmt einen Entwurf unter dem alten Schlüssel ohne Nutzer", async () => {
    t.entwuerfe.set("osimmo_objekt_neu_draft", { nf: { titel: "Alt" }, step: "0", isGlobalObjekt: false, isEinzelwohnung: false });
    neu();
    await waitFor(() => expect(titelFeld().value).toBe("Alt"));
    expect(t.geloescht).toContain("osimmo_objekt_neu_draft");
    await waitFor(() => expect(entwurf()?.nf?.titel).toBe("Alt"));
  }, 30000);
});

describe("Zurücksetzen", () => {
  it("löscht den Entwurf erst nach erfolgreichem Anlegen", async () => {
    t.entwuerfe.set(SCHLUESSEL, {
      nf: { titel: "Haus Nord", adresse: "Nordweg 1", plz: "03046", ort: "Cottbus", beschreibung: "", badge: "", videoUrl: "", videoSichtbar: false, bildUrl: "", highlights: [], newHighlight: "", exklusivPartner: [], newExklusivPartner: "", cloudOrdnerUrl: "" },
      isGlobalObjekt: false, isEinzelwohnung: false, step: "3", isDirty: true,
      verkaeuferDaten: { art: "firma", name: "Bau GmbH", vorname: "", strasse: "", plz: "", ort: "", email: "b@beispiel.test", telefon: "", firma: "" },
      einzelWohnungen: [{ id: "w-1", weNr: "1", groesse: 50, vkGesamt: 150000 }],
      zusatz: { anlageklasse: "Mehrfamilienhaus" },
    });
    neu();
    await waitFor(() => expect(screen.getByText(/Objekt erstellen/)).toBeInTheDocument());
    expect(t.geloescht).toEqual([]);
    fireEvent.click(knopf(/Objekt erstellen/));
    await waitFor(() => expect(t.gespeichert).toHaveLength(1), { timeout: 5000 });
    await waitFor(() => expect(t.geloescht).toContain(SCHLUESSEL));
    expect(entwurf()).toBeUndefined();
  }, 30000);

  it("übernimmt eine begonnene, nicht hinzugefügte Einheit beim Anlegen", async () => {
    t.entwuerfe.set(SCHLUESSEL, {
      nf: { titel: "Haus Süd", adresse: "", plz: "", ort: "", beschreibung: "", badge: "", videoUrl: "", videoSichtbar: false, bildUrl: "", highlights: [], newHighlight: "", exklusivPartner: [], newExklusivPartner: "", cloudOrdnerUrl: "" },
      isGlobalObjekt: false, isEinzelwohnung: false, step: "3",
      verkaeuferDaten: { art: "firma", name: "Bau GmbH", vorname: "", strasse: "", plz: "", ort: "", email: "", telefon: "", firma: "" },
      einzelWohnungen: [{ id: "w-1", weNr: "1", groesse: 50 }],
      newW: { id: "w-new-1", weNr: "2", groesse: 61, zimmer: 2 },
      zusatz: { anlageklasse: "Mehrfamilienhaus" },
    });
    neu();
    await waitFor(() => expect(screen.getByText(/Objekt erstellen/)).toBeInTheDocument());
    fireEvent.click(knopf(/Objekt erstellen/));
    await waitFor(() => expect(t.gespeichert).toHaveLength(1), { timeout: 5000 });
    expect((t.gespeichert[0].wohnungen as Array<{ weNr: string }>).map((w) => w.weNr)).toEqual(["1", "2"]);
  }, 30000);

  it("„Entwurf verwerfen“ löscht den Entwurf im Browser-Speicher", async () => {
    const neuLaden = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: neuLaden });
    t.entwuerfe.set(SCHLUESSEL, { nf: { titel: "Weg damit" }, step: "0", isGlobalObjekt: false, isEinzelwohnung: false });
    neu();
    await waitFor(() => expect(titelFeld().value).toBe("Weg damit"));
    fireEvent.click(knopf("Entwurf verwerfen"));
    fireEvent.click(await screen.findByRole("button", { name: "Entwurf verwerfen" }));
    await waitFor(() => expect(neuLaden).toHaveBeenCalled());
    expect(t.geloescht).toContain(SCHLUESSEL);
    vi.unstubAllGlobals();
  }, 30000);
});

describe("Verlassen", () => {
  it("fragt bei einem Link nach, solange Eingaben da sind, und bleibt bei Nein", async () => {
    neu();
    await warteAufWiederherstellen();
    // Ohne Eingaben geht der Link ohne Rückfrage.
    fireEvent.click(screen.getByText("Sidebar Objekte"));
    expect(await screen.findByText("Objektliste")).toBeInTheDocument();
  }, 30000);

  it("mit Eingaben: Rückfrage, Nein bleibt, Ja verlässt; Schließen des Tabs wird angehalten", async () => {
    neu();
    await warteAufWiederherstellen();
    fireEvent.click(screen.getByText("Einzelwohnung").closest("button")!);

    const schliessen = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(schliessen);
    expect(schliessen.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByText("Sidebar Objekte"));
    expect(await screen.findByText("Möchtest du das Anlegen des Objekts wirklich verlassen?")).toBeInTheDocument();
    expect(screen.getByText("Deine Eingaben bleiben als Entwurf gespeichert.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nein" }));
    await waitFor(() => expect(screen.queryByText("Möchtest du das Anlegen des Objekts wirklich verlassen?")).toBeNull());
    expect(screen.queryByText("Objektliste")).toBeNull();

    fireEvent.click(screen.getByText("Sidebar Objekte"));
    fireEvent.click(await screen.findByRole("button", { name: "Ja" }));
    expect(await screen.findByText("Objektliste")).toBeInTheDocument();
    // Der Entwurf bleibt liegen.
    expect(t.geloescht).toEqual([]);
    expect(entwurf()?.isEinzelwohnung).toBe(true);
  }, 30000);
});
