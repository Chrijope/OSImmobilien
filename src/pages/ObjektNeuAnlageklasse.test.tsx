import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ObjektData } from "@/lib/objekteStore";

/**
 * Anlageklasse und Globalobjekt in der Objektanlage (Christian, 23.09.2026).
 *
 *   - Bei einem Objekt aus Investagon ist die Anlageklasse nur Anzeige, mit
 *     dem Hinweis, dass sie aus Investagon kommt. Gespeichert wird, was
 *     Investagon geliefert hat, und der Schalter bleibt, wie der Import ihn
 *     gesetzt hat.
 *   - Bei einer Handanlage ist das Sternchen echt: ohne Anlageklasse kein
 *     Speichern.
 *   - Anlageklasse „Globalobjekt“ und Schalter werden immer gleich
 *     gespeichert, der Schalter ist die Wahrheit.
 *   - Ein reserviertes Haus bleibt Globalobjekt, das Feld ist gesperrt.
 */

const t = vi.hoisted(() => ({
  objekt: undefined as unknown,
  gespeichert: [] as Array<Record<string, unknown>>,
  toasts: [] as Array<{ title?: string; description?: string }>,
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
  useUser: () => ({ user: { role: "admin", name: "Test", email: "" }, authUser: { id: "u-1" } }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/use-toast", () => {
  // Stabil wie im echten Hook: Ein Effekt der Seite hängt an `toast`, und
  // eine neue Funktion je Render ließe ihn bei jedem Render neu laufen.
  const toast = (x: { title?: string; description?: string }) => { t.toasts.push(x); };
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
}));

const { default: ObjektNeu } = await import("./ObjektNeu");

function objekt(felder: Partial<ObjektData> & { meta?: Record<string, unknown> }): ObjektData {
  return {
    id: "o-1", titel: "Teststraße 5", adresse: "Teststraße 5", plz: "80331", ort: "München", beschreibung: "",
    highlights: [], bildUrl: "", bilder: [], dokumente: [], wohnungen: [], videoUrl: "", videoSichtbar: false,
    badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0,
    sichtbar: true, erstellt_am: "2026-01-01",
    verkaeuferDaten: { name: "Verkäufer GmbH", strasse: "Weg 1", plz: "80331", ort: "München", email: "v@beispiel.test", telefon: "" },
    ...felder,
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

function speichern() {
  fireEvent.click(screen.getByText(/Änderungen speichern/).closest("button")!);
}

/**
 * Im Feld „Anlageklasse“ einen Eintrag wählen. Über Kennung und Text statt
 * über Rollen: Die Seite ist groß, und `getByRole` rechnet dort sekundenlang.
 */
function klasseWaehlen(name: string) {
  fireEvent.keyDown(document.getElementById("objekt-anlageklasse")!, { key: "Enter" });
  const option = screen.getAllByText(name).map((el) => el.closest('[role="option"]')).find(Boolean);
  fireEvent.click(option!);
}

// Radix arbeitet mit Zeigerereignissen, die jsdom nicht kennt.
beforeAll(() => {

  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  t.gespeichert = [];
  t.toasts = [];
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

describe("Anlageklasse bei einem Objekt aus Investagon", () => {
  it("zeigt die Klasse nur an, mit Hinweis, und bietet keine Auswahl", () => {
    t.objekt = objekt({ meta: { investagonSlug: "proj-1", anlageklasse: "WG-Wohnung" } });
    oeffnen();
    const feld = screen.getByLabelText("Anlageklasse") as HTMLInputElement;
    expect(feld.tagName).toBe("INPUT");
    expect(feld).toBeDisabled();
    expect(feld.value).toBe("WG-Wohnung");
    expect(screen.getByText(/Kommt aus Investagon und wird dort gepflegt/)).toBeInTheDocument();
    // Kein Pflichtsternchen, denn hier kann niemand etwas wählen.
    expect(screen.queryByText("Anlageklasse *")).toBeNull();
  });

  it("speichert ohne Pflichtfehler und lässt Klasse und Schalter, wie Investagon sie gesetzt hat", async () => {
    t.objekt = objekt({ globalObjekt: true, meta: { investagonSlug: "proj-1", anlageklasse: "Globalobjekt" } });
    oeffnen();
    speichern();
    await waitFor(() => expect(t.gespeichert).toHaveLength(1));
    expect(t.gespeichert[0].globalObjekt).toBe(true);
    expect((t.gespeichert[0].meta as Record<string, unknown>).anlageklasse).toBe("Globalobjekt");
  });

  it("blockiert auch dann nicht, wenn Investagon keine Klasse liefert", async () => {
    t.objekt = objekt({ meta: { investagonSlug: "proj-1" } });
    oeffnen();
    expect((screen.getByLabelText("Anlageklasse") as HTMLInputElement).value).toBe("Keine Angabe aus Investagon");
    speichern();
    await waitFor(() => expect(t.gespeichert).toHaveLength(1));
    expect(t.toasts.some((x) => x.title === "Anlageklasse ist Pflichtfeld")).toBe(false);
  });
});

describe("Anlageklasse bei einer Handanlage", () => {
  it("ist Pflicht: ohne Klasse wird nicht gespeichert", async () => {
    t.objekt = objekt({ meta: {} });
    oeffnen();
    expect(screen.getByText("Anlageklasse *")).toBeInTheDocument();
    speichern();
    await waitFor(() => expect(t.toasts.some((x) => x.title === "Anlageklasse ist Pflichtfeld")).toBe(true));
    expect(t.gespeichert).toHaveLength(0);
  });

  it("speichert eine gewählte Klasse unverändert", async () => {
    t.objekt = objekt({ meta: { anlageklasse: "Eigentumswohnung" } });
    oeffnen();
    speichern();
    await waitFor(() => expect(t.gespeichert).toHaveLength(1));
    expect((t.gespeichert[0].meta as Record<string, unknown>).anlageklasse).toBe("Eigentumswohnung");
    expect(t.gespeichert[0].globalObjekt).toBeUndefined();
  });

  it("schreibt bei gesetztem Schalter immer die Klasse „Globalobjekt“", async () => {
    // Vorher konnte ein Globalobjekt als „Mehrfamilienhaus“ gespeichert sein.
    t.objekt = objekt({ globalObjekt: true, meta: { anlageklasse: "Mehrfamilienhaus" } });
    oeffnen();
    speichern();
    await waitFor(() => expect(t.gespeichert).toHaveLength(1));
    expect(t.gespeichert[0].globalObjekt).toBe(true);
    expect((t.gespeichert[0].meta as Record<string, unknown>).anlageklasse).toBe("Globalobjekt");
  });

  it("macht aus der Klasse „Globalobjekt“ ohne Schalter kein Globalobjekt, sondern verlangt eine Klasse", async () => {
    // Der Altfall der Portfoliokachel: Klasse „Globalobjekt“, Schalter aus.
    // Der Schalter ist die Wahrheit, die Klasse passt sich an.
    t.objekt = objekt({ globalObjekt: false, meta: { anlageklasse: "Globalobjekt" } });
    oeffnen();
    speichern();
    await waitFor(() => expect(t.toasts.some((x) => x.title === "Anlageklasse ist Pflichtfeld")).toBe(true));
    expect(t.gespeichert).toHaveLength(0);
  });
});

describe("Globalobjekt mit Hausreservierung", () => {
  it("sperrt die Auswahl und bleibt Globalobjekt", async () => {
    t.objekt = objekt({ globalObjekt: true, belegung: "reserviert", belegungKundeId: "k-1", meta: { anlageklasse: "Globalobjekt" } });
    oeffnen();
    expect(screen.getByRole("combobox", { name: /^Anlageklasse/ })).toBeDisabled();
    expect(screen.getByText(/Das Haus ist im CRM reserviert oder vorgemerkt/)).toBeInTheDocument();
    speichern();
    await waitFor(() => expect(t.gespeichert).toHaveLength(1));
    expect(t.gespeichert[0].globalObjekt).toBe(true);
    expect((t.gespeichert[0].meta as Record<string, unknown>).anlageklasse).toBe("Globalobjekt");
  });
});

/*
 * Die Wahl im Feld selbst, als letzter Test der Datei und ohne Speichern.
 * Nach dem Öffnen eines Radix-Auswahlfelds wird jsdom auf dieser großen Seite
 * für alles Weitere sehr langsam, auch ohne jede Kopplung (gemessen am
 * 23.09.2026: Speichern danach rund zehn Sekunden, der nächste Test fünf).
 * Dass Klasse und Schalter zusammen gespeichert werden, prüfen die Tests
 * darüber.
 */
describe("Wahl im Feld und Schalter sind eine Angabe", () => {
  it("„Globalobjekt“ setzt den Schalter, eine andere Wahl nimmt ihn zurück", () => {
    t.objekt = objekt({ meta: { anlageklasse: "Mehrfamilienhaus" } });
    oeffnen();
    expect(screen.queryByText("Weiter: Globaldaten →")).toBeNull();

    klasseWaehlen("Globalobjekt");
    // Der Schalter ist an: Statt „Wohnungen“ kommen jetzt die Globaldaten,
    // ohne dass der Typ ein zweites Mal gewählt werden musste.
    expect(screen.getByText("Weiter: Globaldaten →")).toBeInTheDocument();
    expect(t.toasts.some((x) => x.title === "Objekttyp: Globalobjekt")).toBe(true);

    klasseWaehlen("Eigentumswohnung");
    expect(screen.queryByText("Weiter: Globaldaten →")).toBeNull();
    expect(t.toasts.some((x) => x.title === "Kein Globalobjekt mehr")).toBe(true);
  }, 30000);
});
