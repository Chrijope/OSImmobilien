import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ObjektData, ObjektDokument, ObjektWohnung, WohnungDokument } from "@/lib/objekteStore";

/**
 * Der Reiter „Dokumente" der Einheitenseite.
 *
 * Christian am 23.09.2026: Was die Objektseite an Dokumenten zeigt, muss auch
 * auf jeder Einheitenseite stehen. Wer eine Wohnung öffnet, soll Exposé,
 * Energieausweis und Teilungserklärung dort finden, ohne zurück zur
 * Objektseite zu müssen. Bis dahin standen die Objektunterlagen nur bei einem
 * Objekt mit genau einer Einheit hier.
 *
 * Geprüft wird hier die fertige Seite, nicht nur die Regel dahinter: dass die
 * Objektunterlagen wirklich ankommen, dass es genau dieselben sind wie auf der
 * Objektseite, dass eine Rolle ohne Zugang die Seite gar nicht erst sieht, und
 * dass eine Wohnung ohne eigene Dateien keine leere Überschrift bekommt.
 */

const zustand = vi.hoisted(() => ({
  objekte: {} as Record<string, unknown>,
  rolle: "admin",
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
  useOptionalUser: () => ({ user: { role: zustand.rolle, name: "Test", email: "" }, authUser: null }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div>Galerie</div> }));
// Die Textkarte der Objektseite spricht mit der KI, das gehört nicht hierher.
vi.mock("@/components/objektseite/ObjektTexteKarte", () => ({ ObjektTexteKarte: () => null }));
vi.mock("@/lib/objektTexteKi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektTexteKi")>()),
  starteObjektTexteBeiBedarf: async () => undefined,
}));
// Die Vorschau im Reiter holt eine befristete Adresse. Im Test kommt sie ohne Netz.
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  resolveUnterlagenUrl: async (wert: string) => `https://x.supabase.co/storage/v1/object/sign/objekt-dokumente${wert}?token=t`,
}));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => zustand.objekte[id],
}));

const { default: EinheitSeite } = await import("./EinheitSeite");
const { default: ObjektSeite } = await import("./ObjektSeite");

function objektDok(name: string, teil: Partial<ObjektDokument> = {}): ObjektDokument {
  return { id: `od-${name}`, name, url: `/objekt-dokument/${name}.pdf`, typ: "standard", kategorie: "objektunterlagen", sichtbar: true, ...teil };
}

function wohnungDok(name: string, teil: Partial<WohnungDokument> = {}): WohnungDokument {
  return { id: `wd-${name}`, name, url: `/objekt-dokument/${name}.pdf`, kategorie: "wohnungsunterlagen", ...teil };
}

function we(id: string, dokumente: WohnungDokument[] = []): ObjektWohnung {
  return { id, weNr: `WE ${id}`, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 600, vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", dokumente };
}

function objekt(id: string, wohnungen: ObjektWohnung[], dokumente: ObjektDokument[], meta: Record<string, unknown> = {}): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente, wohnungen, videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta,
  } as unknown as ObjektData;
}

/** Die Unterlagen des Hauses, wie sie auf der Objektseite stehen, einschließlich einer internen. */
const hausUnterlagen = [
  objektDok("Exposé"),
  objektDok("Energieausweis"),
  objektDok("Teilungserklärung", { sichtbar: false }),
  objektDok("Kalkulation Einkauf", { kategorie: "intern" }),
  // Ein Platzhalter ohne Datei steht auch auf der Objektseite nicht.
  objektDok("Lageplan", { url: "" }),
];

function renderMit(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/objekte/:id" element={<ObjektSeite />} />
        <Route path="/objekte/:id/verwaltung" element={<div>Verwaltungsansicht Objekt</div>} />
        <Route path="/objekte/:id/einheiten/:weId" element={<EinheitSeite />} />
        <Route path="/objekte/:id/wohnung/:weId" element={<div>Verwaltungsansicht Wohnung</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Radix wechselt den Reiter beim Drücken der Maustaste, nicht erst beim Loslassen. */
function oeffneDokumente() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Dokumente" }));
}

function liste(): HTMLElement {
  return screen.getByRole("navigation", { name: "Dokumentenliste" });
}

/**
 * Alle Dokumentnamen der gerade gezeigten Liste, sortiert. Zugeklappte
 * Gruppen zeigen ihre Dateien nicht, deshalb werden vorher alle aufgeklappt.
 */
function namenInListe(): string[] {
  liste().querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]').forEach((knopf) => fireEvent.click(knopf));
  return Array.from(liste().querySelectorAll("li"))
    .map((zeile) => zeile.querySelector("span.block")?.textContent || "")
    .sort((a, b) => a.localeCompare(b, "de"));
}

function bereichKnopf(name: RegExp) {
  return screen.getByRole("button", { name });
}

/** Wartet, bis die Vorschau ihre Adresse hat. Sonst käme die Antwort erst nach dem Test an. */
async function vorschauGeladen() {
  await waitFor(() => expect(screen.queryByText("Vorschau wird geladen…")).not.toBeInTheDocument());
}

beforeEach(() => {
  zustand.rolle = "admin";
});

describe("Reiter Dokumente der Einheitenseite", () => {
  it("zeigt bei einem Haus mit mehreren Einheiten die Objektunterlagen und getrennt davon die der Wohnung", async () => {
    zustand.objekte = { o2: objekt("o2", [we("w1", [wohnungDok("Grundriss"), wohnungDok("Mietvertrag")]), we("w2")], hausUnterlagen) };
    renderMit("/objekte/o2/einheiten/w1");
    oeffneDokumente();

    // Der Umschalter steht links oben, die Objektunterlagen sind zuerst dran.
    expect(bereichKnopf(/Dokumente zum Objekt/)).toHaveAttribute("aria-pressed", "true");
    expect(namenInListe()).toEqual(["Energieausweis", "Exposé", "Kalkulation Einkauf", "Teilungserklärung"]);

    fireEvent.click(bereichKnopf(/Dokumente zu dieser Wohnung/));
    expect(namenInListe()).toEqual(["Grundriss", "Mietvertrag"]);
    // Nichts vom Haus rutscht in die Wohnung.
    expect(within(liste()).queryByText("Exposé")).not.toBeInTheDocument();
    await vorschauGeladen();
  });

  it("zeigt genau die Dokumente, die auch die Objektseite zeigt", async () => {
    zustand.objekte = { o2: objekt("o2", [we("w1"), we("w2")], hausUnterlagen) };

    // Seit dem 01.10.2026 im Reiter „Dokumente“ oben auf der Objektseite, nicht mehr unter der Galerie.
    const objektseite = renderMit("/objekte/o2");
    // Dort trägt der Reiter die Zahl der Dateien, etwa „Dokumente (5)“.
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Dokumente/ }));
    const aufDerObjektseite = namenInListe();
    await vorschauGeladen();
    objektseite.unmount();

    renderMit("/objekte/o2/einheiten/w1");
    oeffneDokumente();
    expect(aufDerObjektseite.length).toBeGreaterThan(0);
    expect(namenInListe()).toEqual(aufDerObjektseite);
    await vorschauGeladen();
  });

  it("gliedert nach Oberbegriffen und zeigt das erste Dokument sofort in der Vorschau", async () => {
    zustand.objekte = { o2: objekt("o2", [we("w1"), we("w2")], hausUnterlagen) };
    renderMit("/objekte/o2/einheiten/w1");
    oeffneDokumente();

    const gruppen = Array.from(liste().querySelectorAll('button[aria-expanded]')).map((k) => k.firstChild?.textContent);
    expect(gruppen).toEqual(["Exposé und Beschreibung", "Teilungserklärung", "Energie", "Sonstiges"]);
    const vorschau = screen.getByRole("region", { name: "Vorschau" });
    expect(await within(vorschau).findByTitle("Vorschau: Exposé")).toBeInTheDocument();
  });

  it("kennzeichnet Internes und nicht Freigegebenes wie die Objektseite als „Nur im CRM“, nie als freigegeben", async () => {
    zustand.objekte = { o2: objekt("o2", [we("w1"), we("w2")], hausUnterlagen) };
    renderMit("/objekte/o2/einheiten/w1");
    oeffneDokumente();
    namenInListe();

    const zeile = (name: string) => within(liste()).getByText(name, { selector: "li span" }).closest("li") as HTMLElement;
    expect(within(zeile("Exposé")).getByText("Für Kunden freigegeben")).toBeInTheDocument();
    expect(within(zeile("Teilungserklärung")).getByText("Nur im CRM")).toBeInTheDocument();
    expect(within(zeile("Kalkulation Einkauf")).getByText("Nur im CRM")).toBeInTheDocument();
    // Seit dem 24.09.2026 ohne „Intern“ davor, das las sich als „Intern · Kunde sieht“.
    expect(within(zeile("Kalkulation Einkauf")).queryByText("Intern")).not.toBeInTheDocument();
    expect(within(zeile("Kalkulation Einkauf")).queryByText("Für Kunden freigegeben")).not.toBeInTheDocument();
    await vorschauGeladen();
  });

  it("zeigt bei einer Wohnung ohne eigene Dateien keinen Umschalter und keine leere Überschrift", async () => {
    // Die Platzhalter aus der Objektanlage tragen keine Datei und zählen nicht.
    zustand.objekte = { o2: objekt("o2", [we("w1", [wohnungDok("Grundriss", { url: "" })]), we("w2")], hausUnterlagen) };
    renderMit("/objekte/o2/einheiten/w1");
    oeffneDokumente();

    expect(screen.getByRole("heading", { name: /Dokumente zum Objekt/ })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Welche Dokumente" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Dokumente zu dieser Wohnung/)).not.toBeInTheDocument();
    await vorschauGeladen();
  });

  it("zeigt ohne jede Datei einen Hinweis statt einer leeren Ansicht", () => {
    zustand.objekte = { o2: objekt("o2", [we("w1"), we("w2")], []) };
    renderMit("/objekte/o2/einheiten/w1");
    oeffneDokumente();

    expect(screen.getByText("Noch keine Dateien hinterlegt")).toBeInTheDocument();
    expect(screen.queryByText(/Dokumente zum Objekt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dokumente zu dieser Wohnung/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Vorschau" })).not.toBeInTheDocument();
  });

  it("zeigt die Objektunterlagen gerade dort, wo es keine Objektseite gibt: beim Objekt mit einer Einheit", async () => {
    // Ein Einzelobjekt: Der Klick auf das Objekt landet sofort auf der Einheit.
    zustand.objekte = { o1: objekt("o1", [we("w1")], [objektDok("Teilungserklärung"), objektDok("Energieausweis")], { einzelwohnung: true }) };
    renderMit("/objekte/o1");
    oeffneDokumente();

    expect(namenInListe()).toEqual(["Energieausweis", "Teilungserklärung"]);
    expect(screen.queryByText(/Dokumente zu dieser Wohnung/)).not.toBeInTheDocument();
    await vorschauGeladen();
  });

  it.each(["vertriebspartner", "objektpartner", "kunde", "tippgeber"])(
    "laesst die Rolle %s gar nicht erst auf die Seite, genau wie bei der Objektseite, und zeigt ihr kein internes Dokument",
    (rolle) => {
      zustand.rolle = rolle;
      zustand.objekte = { o2: objekt("o2", [we("w1"), we("w2")], hausUnterlagen) };

      const einheit = renderMit("/objekte/o2/einheiten/w1");
      expect(screen.getByText("Verwaltungsansicht Wohnung")).toBeInTheDocument();
      expect(screen.queryByText("Kalkulation Einkauf")).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: "Dokumente" })).not.toBeInTheDocument();
      einheit.unmount();

      // Dieselbe Tür wie die Objektseite: auch dort geht es für diese Rolle nicht hinein.
      renderMit("/objekte/o2");
      expect(screen.getByText("Verwaltungsansicht Objekt")).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /^Dokumente/ })).not.toBeInTheDocument();
      expect(screen.queryByText("Kalkulation Einkauf")).not.toBeInTheDocument();
    },
  );
});
