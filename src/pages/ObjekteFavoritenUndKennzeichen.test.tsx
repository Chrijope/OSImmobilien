import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ObjektData } from "@/lib/objekteStore";

/**
 * Die Objektuebersicht: Favoritenblock, Stern in beiden Ansichten und das
 * blaue Kennzeichen an der Kachel.
 *
 * Geprueft wird dreierlei:
 *
 *   1. Favoriten stehen oben unter der Ueberschrift „Favoriten", das
 *      Verfuegbare unter „Gesamtportfolio", Belegtes, nicht mehr Angebotenes
 *      und Ausgeblendetes ganz unten unter „Nicht verfügbar". Ein leerer Block
 *      hat keine Ueberschrift. „Nicht verfügbar" laesst sich zuklappen, und
 *      das bleibt je Nutzer gespeichert.
 *   2. Der Stern zum Merken gibt es nicht nur in der Kachel-, sondern auch in
 *      der Listenansicht, und er schaltet dort genauso um.
 *   3. Das Kennzeichen („KfW Klimafreundlicher Neubau" und aehnliche) steht
 *      gerade statt schraeg, sitzt links vor dem farbigen Punkt und ist in
 *      der Breite begrenzt, damit es nicht ueber das Bild hinauslaeuft.
 *   4. Das Kennzeichen „Neu" fuer frisch importierte Objekte: in beiden
 *      Ansichten, neue Objekte vorn im Gesamtportfolio, erstes Sehen einmal
 *      gemerkt. Die Grenzen der Regel prueft `objekteNeu.test.ts`.
 */

const stand = vi.hoisted(() => ({
  rolle: "admin",
  objekte: [] as unknown[],
  favoriten: new Set<string>(),
  umgeschaltet: [] as string[],
  /** Die gespeicherten Einstellungen des angemeldeten Nutzers. */
  einstellungen: {} as Record<string, unknown>,
  gespeichert: [] as [string, unknown][],
  /** Aufrufe von `setObjektSichtbar`: Objekt und neuer Wert. */
  sichtbarGesetzt: [] as [string, boolean][],
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
  useUser: () => ({ user: { role: stand.rolle, name: "Test", email: "" }, authUser: { id: "u1" } }),
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
  getUserSetting: (schluessel: string, rueckfall: unknown) => stand.einstellungen[schluessel] ?? rueckfall,
  setUserSetting: (schluessel: string, wert: unknown) => {
    stand.einstellungen[schluessel] = wert;
    stand.gespeichert.push([schluessel, wert]);
  },
}));
vi.mock("@/lib/objekteImages", () => ({ resolveImageUrl: (u: string) => u }));
vi.mock("@/components/objekte/PortfolioKacheln", () => ({ PortfolioKacheln: () => <div /> }));
vi.mock("@/components/objekte/InvestagonImportDialog", () => ({ InvestagonImportDialog: () => <div /> }));
vi.mock("@/components/objekte/LotseUnterlagenDialog", () => ({ LotseUnterlagenDialog: () => <div /> }));
vi.mock("@/lib/objektFavorites", () => ({
  useObjektFavorites: () => ({
    favorites: [...stand.favoriten],
    isFavorite: (id: string) => stand.favoriten.has(id),
    toggleFavorite: (id: string) => { stand.umgeschaltet.push(id); },
  }),
}));
vi.mock("@/lib/objekteStore", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/objekteStore")>();
  return {
    ...echt,
    getObjekte: () => stand.objekte,
    // Die Objektliste laedt seit dem 23.09.2026 die Angebotssicht. Gekuerzt
    // wird mit der echten Regel, nur die Datenquelle ist ersetzt.
    getObjekteImAngebot: () => stand.objekte.map(echt.objektImAngebot),
    markObjekteSeen: () => undefined,
    setObjektSichtbar: async (id: string, sichtbar: boolean) => {
      stand.sichtbarGesetzt.push([id, sichtbar]);
      return { ok: true };
    },
  };
});

const { default: Objekte } = await import("./Objekte");

/**
 * Eine Einheit, so knapp wie die Kachel sie braucht. `roh` ist der
 * Investagon-Datensatz; fehlt er, richtet sich das Angebot allein nach dem
 * CRM-Status.
 */
function einheit(
  id: string,
  status: "frei" | "reserviert" | "verkauft",
  investagonStatusText?: string,
  roh?: Record<string, unknown>,
) {
  return {
    id, weNr: id, status, investagonStatusText, investagonRaw: roh,
    groesse: 50, zimmer: 2, mieteGesamt: 500, vkGesamt: 200000, rendite: 3,
  };
}

function objekt(
  id: string,
  titel: string,
  badge = "",
  anders: { sichtbar?: boolean; wohnungen?: unknown[]; meta?: Record<string, unknown> } = {},
): ObjektData {
  return {
    id,
    titel,
    adresse: "Teststraße 1",
    plz: "80331",
    ort: "München",
    beschreibung: "",
    highlights: [],
    bildUrl: "",
    bilder: [],
    dokumente: [],
    wohnungen: [],
    videoUrl: "",
    videoSichtbar: false,
    badge,
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0,
    sichtbar: true,
    status: "freigegeben",
    erstellt_am: "2026-01-01",
    erstellt_von: "u1",
    meta: {},
    ...anders,
  } as unknown as ObjektData;
}

/** Sichtbar, mit einer freien Einheit: gehoert ins Gesamtportfolio. */
const freiesObjekt = (id: string, titel: string) =>
  objekt(id, titel, "", { wohnungen: [einheit(`${id}1`, "frei")] });

/** Sichtbar, aber nichts mehr frei: reserviert und beim Notar. */
const belegtesObjekt = (id: string, titel: string) =>
  objekt(id, titel, "", {
    wohnungen: [einheit(`${id}1`, "reserviert", "Reserviert"), einheit(`${id}2`, "reserviert", "Notartermin")],
  });

/**
 * Sichtbar (gruener Punkt), aber alle Einheiten sind in Investagon offline.
 * So kommen die Offline-Objekte seit dem 23.09.2026 aus dem Import.
 */
const offlineObjekt = (id: string, titel: string) =>
  objekt(id, titel, "", {
    wohnungen: [
      einheit(`${id}1`, "frei", "Frei", { active: 1, visibility: -1 }),
      einheit(`${id}2`, "reserviert", "Reserviert", { active: 6, visibility: -1 }),
    ],
  });

/** Ausgeblendet (oranger Punkt), obwohl eine Einheit frei waere. */
const ausgeblendetesObjekt = (id: string, titel: string) =>
  objekt(id, titel, "", { sichtbar: false, wohnungen: [einheit(`${id}1`, "frei")] });

function zeigeSeite() {
  return render(
    <MemoryRouter>
      <Objekte />
    </MemoryRouter>,
  );
}

/** Schaltet die Uebersicht auf die Listenansicht um. */
function inDieListe() {
  fireEvent.click(screen.getByRole("button", { name: "Listenansicht" }));
}

function ueberschriften() {
  return screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent);
}

/** Die Objekttitel, die unter einer Ueberschrift stehen, in ihrer Reihenfolge. */
function objekteUnter(ueberschrift: string) {
  const block = screen.getByRole("heading", { level: 2, name: ueberschrift }).closest("section") as HTMLElement;
  return within(block).queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
}

beforeEach(() => {
  stand.rolle = "admin";
  stand.objekte = [];
  stand.favoriten = new Set();
  stand.umgeschaltet = [];
  stand.einstellungen = {};
  stand.gespeichert = [];
  stand.sichtbarGesetzt = [];
});

describe("Favoriten stehen oben, getrennt vom Gesamtportfolio", () => {
  it("zeigt beide Ueberschriften, sobald es einen Favoriten gibt", () => {
    stand.objekte = [objekt("a", "Haus A"), objekt("b", "Haus B"), objekt("c", "Haus C")];
    stand.favoriten = new Set(["b"]);
    zeigeSeite();
    expect(ueberschriften()).toEqual(["Favoriten", "Gesamtportfolio"]);
  });

  /*
   * Eine Ueberschrift ohne Inhalt sieht aus wie ein Fehler. Ohne Favoriten
   * bleibt es deshalb bei der einen ungeteilten Liste.
   */
  it("laesst ohne Favoriten jede Ueberschrift weg", () => {
    stand.objekte = [objekt("a", "Haus A"), objekt("b", "Haus B")];
    zeigeSeite();
    expect(ueberschriften()).toEqual([]);
    expect(screen.getByText("Haus A")).toBeInTheDocument();
    expect(screen.getByText("Haus B")).toBeInTheDocument();
  });

  it("trennt auch in der Listenansicht", () => {
    stand.objekte = [objekt("a", "Haus A"), objekt("b", "Haus B")];
    stand.favoriten = new Set(["a"]);
    zeigeSeite();
    inDieListe();
    expect(ueberschriften()).toEqual(["Favoriten", "Gesamtportfolio"]);
  });
});

describe("Nicht verfuegbar steht unter dem Gesamtportfolio", () => {
  const dreiBloecke = () => {
    stand.objekte = [
      freiesObjekt("a", "Haus A"),
      belegtesObjekt("b", "Haus B"),
      freiesObjekt("c", "Haus C"),
    ];
    stand.favoriten = new Set(["c"]);
  };

  it("zeigt in der Kachelansicht alle drei Bloecke samt Unterzeile", () => {
    dreiBloecke();
    zeigeSeite();
    expect(ueberschriften()).toEqual(["Favoriten", "Gesamtportfolio", "Nicht verfügbar"]);
    expect(objekteUnter("Favoriten")).toEqual(["Haus C"]);
    expect(objekteUnter("Gesamtportfolio")).toEqual(["Haus A"]);
    expect(objekteUnter("Nicht verfügbar")).toEqual(["Haus B"]);
    expect(screen.getByText("reserviert, beim Notar oder nicht mehr im Angebot")).toBeInTheDocument();
  });

  it("zeigt dieselben drei Bloecke in der Listenansicht", () => {
    dreiBloecke();
    zeigeSeite();
    inDieListe();
    expect(ueberschriften()).toEqual(["Favoriten", "Gesamtportfolio", "Nicht verfügbar"]);
    expect(objekteUnter("Gesamtportfolio")).toEqual(["Haus A"]);
    expect(objekteUnter("Nicht verfügbar")).toEqual(["Haus B"]);
  });

  it("legt ein ausgeblendetes Objekt fuer die Leitung unter Nicht verfuegbar", () => {
    stand.objekte = [freiesObjekt("a", "Haus A"), ausgeblendetesObjekt("d", "Haus D")];
    zeigeSeite();
    expect(ueberschriften()).toEqual(["Gesamtportfolio", "Nicht verfügbar"]);
    expect(objekteUnter("Nicht verfügbar")).toEqual(["Haus D"]);
  });

  /*
   * „Frei" kommt aus der Angebotsregel: Eine Einheit, die im CRM frei steht,
   * die Investagon aber offline fuehrt, bietet niemand an.
   */
  it("zaehlt eine in Investagon offline gestellte Einheit nicht als frei", () => {
    stand.objekte = [
      freiesObjekt("a", "Haus A"),
      objekt("e", "Haus E", "", { wohnungen: [einheit("e1", "frei", "Frei", { active: 1, visibility: -1 })] }),
    ];
    zeigeSeite();
    expect(objekteUnter("Nicht verfügbar")).toEqual(["Haus E"]);
  });

  it("laesst einen belegten Favoriten oben bei den Favoriten", () => {
    stand.objekte = [freiesObjekt("a", "Haus A"), belegtesObjekt("b", "Haus B")];
    stand.favoriten = new Set(["b"]);
    zeigeSeite();
    expect(ueberschriften()).toEqual(["Favoriten", "Gesamtportfolio"]);
    expect(objekteUnter("Favoriten")).toEqual(["Haus B"]);
  });

  it("zeigt ohne Favoriten und ohne Belegtes keine einzige Ueberschrift", () => {
    stand.objekte = [freiesObjekt("a", "Haus A"), freiesObjekt("c", "Haus C")];
    zeigeSeite();
    expect(ueberschriften()).toEqual([]);
    inDieListe();
    expect(ueberschriften()).toEqual([]);
  });

  describe("fuer einen Vertriebspartner", () => {
    beforeEach(() => {
      stand.rolle = "vertriebspartner";
    });

    it("stehen unter Nicht verfuegbar nur belegte, sichtbare Objekte", () => {
      stand.objekte = [
        freiesObjekt("a", "Haus A"),
        belegtesObjekt("b", "Haus B"),
        ausgeblendetesObjekt("d", "Haus D"),
      ];
      zeigeSeite();
      expect(ueberschriften()).toEqual(["Gesamtportfolio", "Nicht verfügbar"]);
      expect(objekteUnter("Nicht verfügbar")).toEqual(["Haus B"]);
      expect(screen.queryByText("Haus D")).not.toBeInTheDocument();
      expect(screen.getByText("reserviert, beim Notar oder nicht mehr im Angebot")).toBeInTheDocument();
    });

    /*
     * Die Falle: In der Angebotssicht hat ein Offline-Objekt keine Einheit
     * mehr in `wohnungen`, genau wie ein frisch angelegtes. Es darf trotzdem
     * nicht im Gesamtportfolio stehen, sondern gehoert nach unten.
     */
    it("steht ein sichtbares Objekt mit lauter Offline-Einheiten unter Nicht verfuegbar", () => {
      stand.objekte = [freiesObjekt("a", "Haus A"), offlineObjekt("o", "Haus O")];
      zeigeSeite();
      expect(ueberschriften()).toEqual(["Gesamtportfolio", "Nicht verfügbar"]);
      expect(objekteUnter("Gesamtportfolio")).toEqual(["Haus A"]);
      expect(objekteUnter("Nicht verfügbar")).toEqual(["Haus O"]);
    });

    it("entfaellt Nicht verfuegbar, wenn dort nur Ausgeblendetes stuende", () => {
      stand.objekte = [freiesObjekt("a", "Haus A"), ausgeblendetesObjekt("d", "Haus D")];
      zeigeSeite();
      expect(ueberschriften()).toEqual([]);
      expect(screen.queryByText("Haus D")).not.toBeInTheDocument();
    });
  });
});

describe("Nicht verfuegbar laesst sich zuklappen", () => {
  const zweiBloecke = () => {
    stand.objekte = [freiesObjekt("a", "Haus A"), belegtesObjekt("b", "Haus B")];
  };
  const kopfKnopf = () => screen.getByRole("button", { name: "Nicht verfügbar" });

  it("steht ohne gespeicherten Wert offen", () => {
    zweiBloecke();
    zeigeSeite();
    expect(kopfKnopf()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Haus B")).toBeInTheDocument();
  });

  /*
   * Ein echter Knopf in der Ueberschrift: mit Tabulator erreichbar, mit
   * Eingabe- und Leertaste bedienbar, und die Vorlesehilfe hoert, ob er
   * offen ist und was er steuert.
   */
  it("ist ein echter Knopf mit aria-expanded und aria-controls", () => {
    zweiBloecke();
    zeigeSeite();
    const knopf = kopfKnopf();
    expect(knopf.tagName).toBe("BUTTON");
    expect(knopf).toHaveAttribute("type", "button");
    expect(knopf.getAttribute("aria-controls")).toBeTruthy();
    expect(knopf.closest("h2")).not.toBeNull();
  });

  it("klappt in der Kachelansicht zu und speichert das je Nutzer", () => {
    zweiBloecke();
    zeigeSeite();
    fireEvent.click(kopfKnopf());
    expect(kopfKnopf()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Haus B")).not.toBeInTheDocument();
    // Ueberschrift, Zahl und Unterzeile bleiben stehen, nur die Objekte gehen.
    expect(ueberschriften()).toEqual(["Gesamtportfolio", "Nicht verfügbar"]);
    expect(screen.getByText("reserviert, beim Notar oder nicht mehr im Angebot")).toBeInTheDocument();
    expect(stand.gespeichert).toEqual([["objekteNichtVerfuegbarZu", true]]);

    fireEvent.click(kopfKnopf());
    expect(screen.getByText("Haus B")).toBeInTheDocument();
    expect(stand.gespeichert.at(-1)).toEqual(["objekteNichtVerfuegbarZu", false]);
  });

  it("klappt genauso in der Listenansicht", () => {
    zweiBloecke();
    zeigeSeite();
    inDieListe();
    expect(screen.getByText("Haus B")).toBeInTheDocument();
    fireEvent.click(kopfKnopf());
    expect(screen.queryByText("Haus B")).not.toBeInTheDocument();
    expect(screen.getByText("Haus A")).toBeInTheDocument();
  });

  it("kommt so zurueck, wie der Nutzer es verlassen hat", () => {
    zweiBloecke();
    stand.einstellungen = { objekteNichtVerfuegbarZu: true };
    zeigeSeite();
    expect(kopfKnopf()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Haus B")).not.toBeInTheDocument();
    // Zugeklappt in beiden Ansichten, es ist ein Zustand, nicht zwei.
    inDieListe();
    expect(screen.queryByText("Haus B")).not.toBeInTheDocument();
  });

  it("laesst Favoriten und Gesamtportfolio ohne Knopf", () => {
    zweiBloecke();
    stand.favoriten = new Set(["a"]);
    stand.objekte = [...stand.objekte, freiesObjekt("c", "Haus C")];
    zeigeSeite();
    expect(ueberschriften()).toEqual(["Favoriten", "Gesamtportfolio", "Nicht verfügbar"]);
    expect(screen.queryByRole("button", { name: "Favoriten" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gesamtportfolio" })).not.toBeInTheDocument();
  });
});

describe("Der Stern zum Merken", () => {
  it("steht in der Listenansicht genauso wie in der Kachelansicht", () => {
    stand.objekte = [objekt("a", "Haus A")];
    zeigeSeite();
    expect(screen.getAllByRole("button", { name: "Als Favorit markieren" })).toHaveLength(1);
    inDieListe();
    expect(screen.getAllByRole("button", { name: "Als Favorit markieren" })).toHaveLength(1);
  });

  it("schaltet aus der Listenansicht heraus um, ohne das Objekt zu oeffnen", () => {
    stand.objekte = [objekt("a", "Haus A")];
    zeigeSeite();
    inDieListe();
    fireEvent.click(screen.getByRole("button", { name: "Als Favorit markieren" }));
    expect(stand.umgeschaltet).toEqual(["a"]);
  });

  it("nennt den Knopf anders, wenn das Objekt schon Favorit ist", () => {
    stand.objekte = [objekt("a", "Haus A")];
    stand.favoriten = new Set(["a"]);
    zeigeSeite();
    inDieListe();
    expect(screen.getByRole("button", { name: "Favorit entfernen" })).toBeInTheDocument();
  });
});

describe("Das blaue Kennzeichen an der Kachel", () => {
  const langesKennzeichen = "KfW Klimafreundlicher Neubau";

  it("steht gerade und nicht mehr schraeg gedreht", () => {
    stand.objekte = [objekt("a", "Haus A", langesKennzeichen)];
    zeigeSeite();
    const kennzeichen = screen.getByText(langesKennzeichen).closest("[data-ui='badge']");
    expect(kennzeichen).not.toBeNull();
    expect(kennzeichen!.className).not.toMatch(/rotate/);
  });

  /*
   * Der Punkt zeigt Entwurf (orange) oder sichtbar (gruen). Er sitzt aussen
   * rechts, das Kennzeichen davor. In einer Zeile mit `justify-end` heisst
   * "davor" genau: dieselbe Elternbox, und im Markup zuerst.
   */
  it("sitzt links vor dem farbigen Punkt", () => {
    stand.objekte = [objekt("a", "Haus A", langesKennzeichen)];
    zeigeSeite();
    const kennzeichen = screen.getByText(langesKennzeichen).closest("[data-ui='badge']")!;
    const punkt = screen.getByLabelText("Sichtbar");
    expect(kennzeichen.parentElement).toBe(punkt.parentElement);
    const reihe = [...kennzeichen.parentElement!.children];
    expect(reihe.indexOf(kennzeichen)).toBeLessThan(reihe.indexOf(punkt));
  });

  it("begrenzt die Breite und kuerzt einen langen Text statt ihn herauslaufen zu lassen", () => {
    stand.objekte = [objekt("a", "Haus A", langesKennzeichen)];
    zeigeSeite();
    const kennzeichen = screen.getByText(langesKennzeichen).closest("[data-ui='badge']")!;
    expect(kennzeichen.className).toMatch(/max-w-/);
    // Der volle Text bleibt im Tooltip lesbar, auch wenn die Anzeige kuerzt.
    expect(kennzeichen.getAttribute("title")).toBe(langesKennzeichen);
    expect(within(kennzeichen as HTMLElement).getByText(langesKennzeichen).className).toMatch(/truncate/);
  });

  it("zeigt den Punkt auch ohne Kennzeichen", () => {
    stand.objekte = [objekt("a", "Haus A")];
    zeigeSeite();
    expect(screen.getByLabelText("Sichtbar")).toBeInTheDocument();
  });
});

describe("Das Kennzeichen Neu", () => {
  const TAG = 24 * 60 * 60 * 1000;
  const vorTagen = (tage: number) => new Date(Date.now() - tage * TAG).toISOString();

  /** Frei und vom Import vor so vielen Tagen neu angelegt. */
  const neuesObjekt = (id: string, titel: string, tageHer = 1) =>
    objekt(id, titel, "", {
      wohnungen: [einheit(`${id}1`, "frei")],
      meta: { investagonNeuAngelegtAm: vorTagen(tageHer) },
    });

  /** Das Kennzeichen "Neu" auf der Karte mit diesem Titel, oder null. */
  function neuKennzeichen(titel: string) {
    const karte = screen.getByRole("heading", { level: 3, name: titel }).closest("[data-ui='card']") as HTMLElement;
    return within(karte).queryByText("Neu");
  }

  it("steht in der Kachelansicht gerade in der Zeile mit Kennzeichen und Punkt", () => {
    stand.objekte = [
      objekt("a", "Haus A", "KfW 40"),
      objekt("n", "Haus N", "KfW 40", {
        wohnungen: [einheit("n1", "frei")],
        meta: { investagonNeuAngelegtAm: vorTagen(1) },
      }),
    ];
    zeigeSeite();
    const neu = neuKennzeichen("Haus N")!;
    expect(neu).not.toBeNull();
    expect(neu.closest("[data-ui='badge']")!.className).not.toMatch(/rotate/);
    // Ganz links in der Zeile, vor dem blauen Kennzeichen und dem Punkt.
    const reihe = [...neu.parentElement!.children];
    const blau = within(neu.parentElement!).getByText("KfW 40").closest("[data-ui='badge']")!;
    expect(reihe.indexOf(neu)).toBeLessThan(reihe.indexOf(blau));
    expect(neuKennzeichen("Haus A")).toBeNull();
  });

  it("steht auch in der Listenansicht", () => {
    stand.objekte = [objekt("a", "Haus A"), neuesObjekt("n", "Haus N")];
    zeigeSeite();
    inDieListe();
    expect(neuKennzeichen("Haus N")).not.toBeNull();
    expect(neuKennzeichen("Haus N")!.className).not.toMatch(/rotate/);
    expect(neuKennzeichen("Haus A")).toBeNull();
  });

  /*
   * Orange statt Gruen (23.09.2026): Weiss auf dem Gruen war im Dunkelmodus
   * zu blass. Die Schrift kommt aus dem Vordergrund-Token zum Orange, weil
   * `--warning` mit dem Modus wechselt und keine feste Farbe auf beiden
   * Fassungen besteht.
   */
  it("ist in beiden Ansichten orange mit der passenden Schriftfarbe", () => {
    stand.objekte = [neuesObjekt("n", "Haus N")];
    zeigeSeite();
    const pruefe = () => {
      const klassen = neuKennzeichen("Haus N")!.closest("[data-ui='badge']")!.className.split(/\s+/);
      expect(klassen).toContain("bg-warning");
      expect(klassen).toContain("hover:bg-warning");
      expect(klassen.some((k) => k.startsWith("text-[hsl(var(--warning-foreground"))).toBe(true);
      expect(klassen.join(" ")).not.toMatch(/success|text-white/);
    };
    pruefe();
    inDieListe();
    pruefe();
  });

  it("stellt neue Objekte im Gesamtportfolio vorn, das juengste zuerst", () => {
    stand.objekte = [
      freiesObjekt("a", "Haus A"),
      neuesObjekt("n1", "Haus N1", 5),
      belegtesObjekt("b", "Haus B"),
      neuesObjekt("n2", "Haus N2", 2),
    ];
    zeigeSeite();
    expect(objekteUnter("Gesamtportfolio")).toEqual(["Haus N2", "Haus N1", "Haus A"]);
    inDieListe();
    expect(objekteUnter("Gesamtportfolio")).toEqual(["Haus N2", "Haus N1", "Haus A"]);
  });

  it("zeigt das Kennzeichen auch bei den Favoriten, ohne dort umzusortieren", () => {
    stand.objekte = [freiesObjekt("a", "Haus A"), neuesObjekt("n", "Haus N"), freiesObjekt("c", "Haus C")];
    stand.favoriten = new Set(["a", "n"]);
    zeigeSeite();
    expect(objekteUnter("Favoriten")).toEqual(["Haus A", "Haus N"]);
    expect(neuKennzeichen("Haus N")).not.toBeNull();
  });

  it("merkt sich das erste Sehen genau einmal", () => {
    stand.objekte = [freiesObjekt("a", "Haus A"), neuesObjekt("n", "Haus N")];
    zeigeSeite();
    inDieListe();
    fireEvent.click(screen.getByRole("button", { name: "Kachelansicht" }));
    const eintraege = stand.gespeichert.filter(([schluessel]) => schluessel === "objekteNeuErstGesehen");
    expect(eintraege).toHaveLength(1);
    expect(Object.keys(eintraege[0][1] as object)).toEqual(["n"]);
    // Beim ersten Sehen steht das Kennzeichen schon da und bleibt.
    expect(neuKennzeichen("Haus N")).not.toBeNull();
  });

  it("verschwindet sieben Tage nach dem ersten Sehen und rueckt nicht mehr vor", () => {
    stand.objekte = [freiesObjekt("a", "Haus A"), neuesObjekt("n", "Haus N", 10)];
    stand.einstellungen = { objekteNeuErstGesehen: { n: vorTagen(8) } };
    zeigeSeite();
    expect(neuKennzeichen("Haus N")).toBeNull();
    expect(stand.gespeichert).toEqual([]);
  });

  it("zeigt ein Objekt ohne Anlage-Kennung aus dem Import nie als neu", () => {
    stand.objekte = [freiesObjekt("a", "Haus A")];
    zeigeSeite();
    expect(neuKennzeichen("Haus A")).toBeNull();
    expect(stand.gespeichert).toEqual([]);
  });

  /*
   * Zweiter Weg (23.09.2026): Investagon fuehrt das Objekt als neu. Der
   * Import legt dafuer das Anlagedatum aus Investagon ans Objekt, und die
   * sieben Tage zaehlen ab diesem Datum. Die Regel selbst prueft
   * `objekteNeu.test.ts`, hier nur, dass die Seite sie benutzt.
   */
  const ausInvestagon = (id: string, titel: string, tageHer: number) =>
    objekt(id, titel, "", {
      wohnungen: [einheit(`${id}1`, "frei")],
      meta: { investagonErstelltAm: vorTagen(tageHer) },
    });

  it("zeigt ein Objekt, das Investagon als neu fuehrt, als neu und stellt es vorn", () => {
    // Das belegte Objekt sorgt fuer den Block "Nicht verfuegbar" und damit
    // fuer die Ueberschrift "Gesamtportfolio".
    stand.objekte = [freiesObjekt("a", "Haus A"), belegtesObjekt("b", "Haus B"), ausInvestagon("i", "Haus I", 2)];
    zeigeSeite();
    expect(neuKennzeichen("Haus I")).not.toBeNull();
    expect(objekteUnter("Gesamtportfolio")).toEqual(["Haus I", "Haus A"]);
    // Kein erstes Sehen noetig: Die Frist zaehlt ab dem Datum aus Investagon.
    expect(stand.gespeichert).toEqual([]);
  });

  it("zeigt es nicht mehr als neu, wenn das Datum aus Investagon abgelaufen ist", () => {
    stand.objekte = [freiesObjekt("a", "Haus A"), belegtesObjekt("b", "Haus B"), ausInvestagon("i", "Haus I", 8)];
    zeigeSeite();
    expect(neuKennzeichen("Haus I")).toBeNull();
    expect(objekteUnter("Gesamtportfolio")).toEqual(["Haus A", "Haus I"]);
  });

  /*
   * Gesehen heisst angezeigt. Steht ein neues Objekt im zugeklappten Block,
   * hat der Nutzer es nicht gesehen, und die Frist beginnt noch nicht.
   */
  it("merkt nichts fuer ein neues Objekt im zugeklappten Block", () => {
    stand.objekte = [
      freiesObjekt("a", "Haus A"),
      objekt("nb", "Haus NB", "", {
        wohnungen: [einheit("nb1", "reserviert", "Reserviert")],
        meta: { investagonNeuAngelegtAm: vorTagen(1) },
      }),
    ];
    stand.einstellungen = { objekteNichtVerfuegbarZu: true };
    zeigeSeite();
    expect(stand.gespeichert).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Nicht verfügbar" }));
    expect(neuKennzeichen("Haus NB")).not.toBeNull();
    const eintraege = stand.gespeichert.filter(([schluessel]) => schluessel === "objekteNeuErstGesehen");
    expect(eintraege).toHaveLength(1);
    expect(Object.keys(eintraege[0][1] as object)).toEqual(["nb"]);
  });
});

/*
 * Der Punkt als Schalter (Christian am 30.09.2026): Bei Investagon-Objekten
 * blenden Admin, Inhaber und Objektpartner das Objekt per Klick fuer die
 * Vertriebspartner aus oder ein, immer erst nach einer Rueckfrage.
 */
describe("Der Punkt schaltet die Sichtbarkeit von Investagon-Objekten", () => {
  const investagon = { investagonId: "p1" };
  const investagonObjekt = (sichtbar: boolean) =>
    objekt("i", "Haus I", "", { sichtbar, meta: investagon, wohnungen: [einheit("i1", "frei")] });

  it.each(["admin", "inhaber", "objektpartner"])("blendet als %s nach Rueckfrage aus", async (rolle) => {
    stand.rolle = rolle;
    stand.objekte = [investagonObjekt(true)];
    zeigeSeite();
    const punkt = screen.getByRole("button", { name: "Sichtbar" });
    fireEvent.click(punkt);
    // Die Rueckfrage allein aendert nichts.
    expect(stand.sichtbarGesetzt).toEqual([]);
    fireEvent.click(await screen.findByRole("button", { name: "Ausblenden" }));
    await waitFor(() => expect(stand.sichtbarGesetzt).toEqual([["i", false]]));
  });

  it("schaltet ein ausgeblendetes Objekt wieder sichtbar", async () => {
    stand.objekte = [investagonObjekt(false)];
    zeigeSeite();
    const punkt = screen.getByRole("button", { name: "Ausgeblendet" });
    fireEvent.click(punkt);
    fireEvent.click(await screen.findByRole("button", { name: "Sichtbar schalten" }));
    await waitFor(() => expect(stand.sichtbarGesetzt).toEqual([["i", true]]));
  });

  it("aendert bei „So lassen“ nichts", async () => {
    stand.objekte = [investagonObjekt(true)];
    zeigeSeite();
    fireEvent.click(screen.getByRole("button", { name: "Sichtbar" }));
    fireEvent.click(await screen.findByRole("button", { name: "So lassen" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(stand.sichtbarGesetzt).toEqual([]);
  });

  it.each(["vertriebspartner", "vertriebsleiter", "backoffice"])("zeigt %s keinen Punkt", (rolle) => {
    stand.rolle = rolle;
    stand.objekte = [investagonObjekt(true)];
    zeigeSeite();
    expect(screen.getByText("Haus I")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sichtbar")).toBeNull();
  });

  it("bleibt bei selbst angelegten Objekten eine reine Anzeige", () => {
    stand.objekte = [objekt("a", "Haus A")];
    zeigeSeite();
    expect(screen.getByLabelText("Sichtbar").tagName).toBe("SPAN");
    expect(screen.queryByRole("button", { name: "Sichtbar" })).toBeNull();
  });
});
