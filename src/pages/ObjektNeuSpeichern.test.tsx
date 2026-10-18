import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Anlegen, Bearbeiten und Speichern im Objektformular, je Objektart
 * (16.10.2026, Ablösung von Investagon).
 *
 * Geprüft wird, was an `saveObjekt` geht: Keine Angabe darf beim Speichern
 * verloren gehen, und jede neue Angabe aus dem Formular muss ankommen. Die
 * Datenbank selbst ist gemockt, ebenso Speicher und Bildverkleinerung.
 */

const t = vi.hoisted(() => ({
  objekt: undefined as unknown,
  gespeichert: [] as Array<Record<string, unknown>>,
  glocke: [] as Array<Record<string, unknown>>,
  hochgeladen: [] as string[],
  entwurf: null as unknown,
  entwurfDateien: {} as Record<string, File>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabelle: string) => ({
      select: async () => ({ data: null, error: new Error("offline") }),
      insert: async (zeilen: Array<Record<string, unknown>>) => { if (tabelle === "benachrichtigungen") t.glocke.push(...zeilen); return { error: null }; },
    }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
    storage: {
      from: (eimer: string) => ({
        upload: async (pfad: string) => { t.hochgeladen.push(`${eimer}/${pfad}`); return { error: null }; },
        getPublicUrl: (pfad: string) => ({ data: { publicUrl: `https://cdn.test/${eimer}/${pfad}` } }),
      }),
    },
  },
}));
vi.mock("@/lib/storage", () => ({
  objektDateiAblegen: async (pfad: string) => { t.hochgeladen.push(`objekt-dokumente/${pfad}`); return `https://cdn.test/objekt-dokumente/${pfad}`; },
}));
vi.mock("@/lib/imageCompression", () => ({
  compressToFile: async (f: File) => f,
  compressForUpload: async (f: File) => f,
  compressImageImmediate: async (f: File) => ({ originalFile: f, thumbnailDataUrl: "data:image/png;base64,AA" }),
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "admin", name: "Test", email: "" }, authUser: { id: "u-1" } }),
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
  loadObjektDraft: async () => t.entwurf,
  loadObjektDraftBlobs: async () => t.entwurfDateien,
  saveObjektDraft: async () => undefined,
  saveObjektDraftBlobs: async () => undefined,
  saveObjektDraftSofort: () => undefined,
  deleteObjektDraft: async () => undefined,
}));
vi.mock("@/components/objekte/ObjektUploadAnalyse", () => ({ ObjektUploadAnalyse: () => <div>Upload</div> }));
vi.mock("@/components/objekte/AfaRechnerEmbed", () => ({ AfaRechnerEmbed: () => <div>AfA</div> }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => ((t.objekt as { id?: string } | undefined)?.id === id ? t.objekt : undefined),
  getObjekte: () => [],
  saveObjekt: async (o: Record<string, unknown>) => { t.gespeichert.push(o); return true; },
  speichereObjektKonzept: async () => null,
  getLastObjektSaveError: () => "",
  getLastObjektSaveHinweise: () => [],
}));

const { default: ObjektNeu, objektDokumenteZumSpeichern, afaModellAusRechner } = await import("./ObjektNeu");

const EINHEIT_ID = "5b6c1f2e-0000-4000-8000-000000000001";

/** Eine Einheit mit allen Feldern, die bisher beim Speichern verloren gingen. */
function vollEinheit(felder: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return {
    id: EINHEIT_ID, weNr: "3", etage: "1. OG", lage: "links", groesse: 50, zimmer: 2, mieteGesamt: 500, vkGesamt: 200000,
    qmPreis: 4000, rendite: 3, vermietet: true, status: "frei",
    stadtteil: "Göggingen", sanierungsjahr: 2024, sanierungAnteilProzent: 11.8, sanierungAnteilBetrag: 21240,
    nebenkostenMonat: 95, mietgarantieKalt: 790, mietgarantieMonate: 24, verwaltungWegMonat: 28, verwaltungSevMonat: 25,
    sevErstesJahrInklusive: true, vermietetSeit: "2023-04", moebelPreis: 6000, moebelNutzungsdauerJahre: 10,
    finanzierungsnebenkostenSatz: 1.5, ruecklageZufuehrungMonat: 40, hausgeldUmlagefaehigEuro: 120,
    hausgeldNichtUmlagefaehigEuro: 60, interneHighlightsHand: ["Balkon nach Süden"],
    bilder: [
      { id: "b-1", url: "https://cdn.test/a.jpg", alt: "a", reihenfolge: 0 },
      { id: "b-2", url: "https://cdn.test/b.jpg", alt: "b", reihenfolge: 1 },
    ],
    ...felder,
  };
}

function objekt(felder: Partial<ObjektData> & { meta?: Record<string, unknown> }): ObjektData {
  return {
    id: "o-1", titel: "Teststraße 5", adresse: "Teststraße 5", plz: "80331", ort: "München", beschreibung: "",
    highlights: [], bildUrl: "", bilder: [], dokumente: [], wohnungen: [], videoUrl: "", videoSichtbar: false,
    badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0,
    sichtbar: true, erstellt_am: "2026-01-01", sanierungskosten: 180000, erhaltungsaufwandJahre: 3,
    afaDaten: { afaModell: "gutachten", afaSatz: 3.33, restnutzungsdauer: 30, grundstueckAnteil: 18 },
    verkaeuferDaten: { name: "Verkäufer GmbH", strasse: "Weg 1", plz: "80331", ort: "München", email: "v@beispiel.test", telefon: "" },
    ...felder,
  } as unknown as ObjektData;
}

function bearbeiten() {
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

function neu() {
  return render(
    <MemoryRouter initialEntries={["/objekte/neu"]}>
      <Routes>
        <Route path="/objekte/neu" element={<ObjektNeu />} />
        <Route path="/objekte" element={<p>Objektliste</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const knopf = (text: RegExp) => screen.getByText(text).closest("button")!;
const gespeicherteEinheit = () => (t.gespeichert[0].wohnungen as ObjektWohnung[])[0];
const meta = () => t.gespeichert[0].meta as Record<string, unknown>;

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  t.gespeichert = [];
  t.glocke = [];
  t.hochgeladen = [];
  t.entwurf = null;
  t.entwurfDateien = {};
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

describe("Bearbeiten und Speichern: nichts geht verloren", () => {
  it("Objekt mit Einheiten: alle Einheitenfelder, Erhaltungsaufwand-Verteilung, AfA-Modell und Objektangaben bleiben", async () => {
    t.objekt = objekt({
      wohnungen: [vollEinheit({ exklusivNutzer: ["u-ali"] })],
      exklusivPartner: ["Zoe Vertrieb"],
      meta: {
        exklusivPartnerKennung: { "Zoe Vertrieb": "u-zoe" },
        anlageklasse: "Mehrfamilienhaus",
        energieausweis: { art: "Bedarfsausweis", klasse: "B", kennwert: 74 },
        sanierungen: [{ jahr: "2024", massnahme: "Dach", betrag: 90000 }],
        einheitenImHaus: 28,
        kurzbeschreibung: "Bleibt wortgleich",
        standortargumente: ["Lage. Bleibt auch."],
        interneHighlightsHand: ["RND-Gutachten liegt vor"],
      },
    });
    bearbeiten();
    fireEvent.click(knopf(/Änderungen speichern/));
    await waitFor(() => expect(t.gespeichert).toHaveLength(1));

    const w = gespeicherteEinheit();
    expect(w).toMatchObject({
      stadtteil: "Göggingen", sanierungsjahr: 2024, sanierungAnteilProzent: 11.8, sanierungAnteilBetrag: 21240,
      nebenkostenMonat: 95, mietgarantieKalt: 790, mietgarantieMonate: 24, verwaltungWegMonat: 28, verwaltungSevMonat: 25,
      sevErstesJahrInklusive: true, vermietetSeit: "2023-04", moebelPreis: 6000, moebelNutzungsdauerJahre: 10,
      finanzierungsnebenkostenSatz: 1.5, ruecklageZufuehrungMonat: 40, hausgeldUmlagefaehigEuro: 120,
      hausgeldNichtUmlagefaehigEuro: 60, interneHighlightsHand: ["Balkon nach Süden"],
    });
    expect(w.bilder?.map((b) => b.url)).toEqual(["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]);

    expect(t.gespeichert[0].erhaltungsaufwandJahre).toBe(3);
    expect((t.gespeichert[0].afaDaten as { afaModell: string }).afaModell).toBe("gutachten");
    expect(meta().energieausweis).toEqual({ art: "Bedarfsausweis", klasse: "B", kennwert: 74 });
    expect(meta().sanierungen).toEqual([{ jahr: "2024", massnahme: "Dach", betrag: 90000 }]);
    expect(meta().einheitenImHaus).toBe(28);
    expect(meta().kurzbeschreibung).toBe("Bleibt wortgleich");
    expect(meta().standortargumente).toEqual(["Lage. Bleibt auch."]);
    // Exklusive Freischaltung: Objekt über die Kennung, Einheit über exklusivNutzer.
    expect(t.gespeichert[0].exklusivPartner).toEqual(["Zoe Vertrieb"]);
    expect(meta().exklusivPartnerKennung).toEqual({ "Zoe Vertrieb": "u-zoe" });
    expect(w.exklusivNutzer).toEqual(["u-ali"]);
    // Nichts neu zugewiesen, also keine Glocke.
    expect(t.glocke).toEqual([]);
    // Unverändert geöffnet und gespeichert: die Spalte bleibt, auch wenn das Formular die Kurzbeschreibung zeigte.
    expect(t.gespeichert[0].beschreibung).toBe("");
    expect(meta().interneHighlightsHand).toEqual(["RND-Gutachten liegt vor"]);
    // Eine Energieklasse: die aus dem Ausweis auch in der Objektspalte.
    expect((t.gespeichert[0].globalDaten as { energieeffizienzklasse: string }).energieeffizienzklasse).toBe("B");
  }, 30000);

  it("Einzelwohnung: das Hausgeld der Einheit bleibt, wenn der AfA-Schritt keines nennt", async () => {
    t.objekt = objekt({
      wohnungen: [vollEinheit({ hausgeldMonat: 220 })],
      meta: { anlageklasse: "Eigentumswohnung", einzelwohnung: true },
    });
    bearbeiten();
    fireEvent.click(knopf(/Änderungen speichern/));
    await waitFor(() => expect(t.gespeichert).toHaveLength(1));
    expect(gespeicherteEinheit()).toMatchObject({ hausgeldMonat: 220, hausgeldNichtUmlagefaehigEuro: 60, stadtteil: "Göggingen", mietgarantieKalt: 790 });
  }, 30000);

  it("die neuen Einheitenfelder lassen sich im Formular eintragen", async () => {
    t.objekt = objekt({ wohnungen: [vollEinheit({ mietgarantieKalt: undefined })], meta: { anlageklasse: "Eigentumswohnung", einzelwohnung: true } });
    bearbeiten();
    // Die Einzelwohnung steht gleich aufgeklappt (siehe ObjektNeu).
    const feld = () => screen.getAllByText("Mietgarantie kalt / Monat (€)")[0].parentElement!.querySelector("input")!;
    // Das Eurofeld wechselt beim Fokus in den Eingabemodus und tauscht dabei sein Eingabefeld.
    fireEvent.focus(feld());
    fireEvent.change(feld(), { target: { value: "850" } });
    fireEvent.blur(feld());
    fireEvent.click(knopf(/Änderungen speichern/));
    await waitFor(() => expect(t.gespeichert).toHaveLength(1));
    expect(gespeicherteEinheit().mietgarantieKalt).toBe(850);
  }, 30000);
});

describe("Neu anlegen: Globalobjekt mit Einheit, Bild und Unterlage", () => {
  it("lädt Bild und Unterlagen der Einheit hoch und speichert die Einheit am Haus", async () => {
    const bild = new File(["x"], "fassade.jpg", { type: "image/jpeg" });
    const pdf = new File(["%PDF"], "grundriss.pdf", { type: "application/pdf" });
    const ausweis = new File(["%PDF"], "ausweis.pdf", { type: "application/pdf" });
    t.entwurf = {
      nf: { titel: "Haus am See", adresse: "Seeweg 1", plz: "14548", ort: "Schwielowsee", beschreibung: "Ein helles Haus am Wasser.", badge: "", videoUrl: "", videoSichtbar: false, bildUrl: "", highlights: [], newHighlight: "", exklusivPartner: ["Zoe Vertrieb"], newExklusivPartner: "", cloudOrdnerUrl: "" },
      zusatz: { exklusivKennungen: { "Zoe Vertrieb": "u-zoe" } },
      isGlobalObjekt: true,
      isEinzelwohnung: false,
      verkaeuferDaten: { art: "firma", name: "Bau GmbH", vorname: "", strasse: "Weg 1", plz: "14548", ort: "Schwielowsee", email: "b@beispiel.test", telefon: "", firma: "" },
      objektangaben: { standortargumente: ["Seenähe. Der Schwielowsee liegt vor der Tür.", "  "], energieausweis: { klasse: "C" }, sanierungen: [] },
      interneHighlightsText: "Garagen mit eigenem Mietertrag\n\n",
      einzelWohnungen: [{ ...vollEinheit({ bilder: undefined, vkGesamt: 0 }), status: "frei" }],
      wohnungBilder: { [EINHEIT_ID]: [{ id: "neu-1", url: "data:image/png;base64,AA", alt: "fassade.jpg", reihenfolge: 0 }] },
      wohnungDocs: { [EINHEIT_ID]: { wd2: "grundriss.pdf" } },
      objektDocs: { energieausweis: "ausweis.pdf" },
    };
    t.entwurfDateien = {
      [`wohnungBild::${EINHEIT_ID}::neu-1`]: bild,
      [`wohnungDoc::${EINHEIT_ID}::wd2`]: pdf,
      "objektDoc::energieausweis": ausweis,
    };
    neu();
    // Erst den Entwurf laden lassen, dann die Art wählen.
    await new Promise((r) => setTimeout(r, 20));
    fireEvent.click(screen.getByText("Globalobjekt").closest("button")!);
    await waitFor(() => expect(screen.getByText(/Objekt erstellen/)).toBeInTheDocument());
    fireEvent.click(knopf(/Objekt erstellen/));
    await waitFor(() => expect(t.gespeichert).toHaveLength(1), { timeout: 5000 });

    const o = t.gespeichert[0];
    expect(o.globalObjekt).toBe(true);
    const w = gespeicherteEinheit();
    expect(w.bilder?.[0].url).toMatch(/^https:\/\/cdn\.test\/objekt-medien\/objekte\/.+\/wohnungen\/.+\/bilder\/neu-1\.jpg$/);
    expect(w.dokumente?.find((d) => d.name === "Grundriss")?.url).toMatch(/wohnungen\/.+\/wd2_grundriss\.pdf$/);
    expect((o.dokumente as Array<{ name: string; url: string }>).find((d) => d.name === "Energieausweis")?.url).toMatch(/energieausweis_ausweis\.pdf$/);
    expect(w).toMatchObject({ stadtteil: "Göggingen", mietgarantieKalt: 790 });
    expect(meta().interneHighlightsHand).toEqual(["Garagen mit eigenem Mietertrag"]);
    expect(meta().energieausweis).toEqual({ klasse: "C" });
    // Beschreibung und Standortargumente aus dem Wizard sind gepflegte Texte für Objektseite und Exposé (18.10.2026).
    expect(o.beschreibung).toBe("Ein helles Haus am Wasser.");
    expect(meta().kurzbeschreibung).toBe("Ein helles Haus am Wasser.");
    expect(meta().standortargumente).toEqual(["Seenähe. Der Schwielowsee liegt vor der Tür."]);
    // Exklusiv zugewiesen: Kennung gespeichert und die Glocke für den neuen Nutzer.
    expect(meta().exklusivPartnerKennung).toEqual({ "Zoe Vertrieb": "u-zoe" });
    expect(t.glocke).toEqual([expect.objectContaining({ benutzer_id: "u-zoe", titel: "Objekt exklusiv zugewiesen", link: `/objekte/${o.id}` })]);
  }, 30000);
});

describe("Hilfsfunktionen", () => {
  const bestand = [
    { name: "Exposé", url: "https://x/expose.pdf", typ: "standard" },
    { name: "Energieausweis", url: "https://x/ea.pdf", typ: "standard" },
    { name: "Protokoll", url: "https://x/p.pdf", typ: "custom" },
    { name: "Investagon-Datei", url: "/investagon-dokument/o/x.pdf", typ: "standard" },
  ];

  it("entfernt im Formular gelöschte Unterlagen und lässt fremde stehen", () => {
    const ergebnis = objektDokumenteZumSpeichern(bestand, { expose: "expose.pdf" }, { lageplan: "https://x/neu.pdf" });
    expect(ergebnis).toEqual([
      { name: "Exposé", url: "https://x/expose.pdf", typ: "standard" },
      { name: "Energieausweis", url: "", typ: "standard" },
      { name: "Investagon-Datei", url: "/investagon-dokument/o/x.pdf", typ: "standard" },
    ]);
  });

  it("ersetzt eine Kategorie durch die neu hochgeladene Datei", () => {
    expect(objektDokumenteZumSpeichern(bestand, {}, { energieausweis: "https://x/ea2.pdf" })[1].url).toBe("https://x/ea2.pdf");
  });

  it("übernimmt das Gutachten-Modell aus dem AfA-Rechner", () => {
    expect(afaModellAusRechner({ afaModus: "gutachten" }, "linear")).toBe("gutachten");
    expect(afaModellAusRechner({ afaModus: "berechnen" }, "gutachten")).toBe("linear");
    expect(afaModellAusRechner({ afaModus: "berechnen" }, "degressiv")).toBe("degressiv");
    expect(afaModellAusRechner(null, "gutachten")).toBe("gutachten");
  });
});
