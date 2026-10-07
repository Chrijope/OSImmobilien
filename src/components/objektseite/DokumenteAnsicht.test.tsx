import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { EinheitUnterlage } from "@/lib/objektUnterlagenRegeln";

/**
 * Der neue Reiter „Dokumente" (Christian, 23.09.2026): Umschalter, Liste nach
 * Oberbegriffen, Vorschau rechts, Herunterladen an jeder Zeile.
 *
 * Der Speicher ist nachgebaut: Aus jedem Zeiger wird eine befristete Adresse
 * wie aus dem echten Eimer, eine fremde Adresse bleibt, wie sie ist.
 */

const speicher = vi.hoisted(() => ({
  resolveUnterlagenUrl: vi.fn(),
  unterlageHerunterladen: vi.fn(),
  adresseHerunterladen: vi.fn(),
}));
vi.mock("@/lib/storage", () => speicher);
const toastFehler = vi.hoisted(() => vi.fn());
// `toast(...)` selbst ist der schlichte Hinweis, etwa nach einem Abbruch.
const toastWeitere = vi.hoisted(() => ({ hinweis: vi.fn(), erfolg: vi.fn(), warnung: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(toastWeitere.hinweis, { error: toastFehler, success: toastWeitere.erfolg, warning: toastWeitere.warnung }),
}));
// Wer angemeldet ist. `null` heißt: öffentliche Seite ohne Nutzer.
const nutzer = vi.hoisted(() => ({ rolle: null as string | null }));
vi.mock("@/contexts/UserContext", () => ({
  useOptionalUser: () => (nutzer.rolle ? { user: { role: nutzer.rolle, name: "Test" } } : null),
}));
const freigabe = vi.hoisted(() => ({ setzeKundenFreigabe: vi.fn(), FREIGABE_MIGRATION: "20260923170000_dokument_kundenfreigabe" }));
vi.mock("@/lib/dokumentFreigabeStore", () => freigabe);
const bestaetigen = vi.hoisted(() => vi.fn());
vi.mock("@/lib/confirm", () => ({ confirmDialog: bestaetigen }));
// Die Einstellung „Wer darf Dokumente für Kunden freigeben". `null` heißt: nichts gespeichert.
const einstellung = vi.hoisted(() => ({ wert: null as unknown }));
vi.mock("@/lib/appConfigStore", () => ({
  getAppConfig: (_schluessel: string, rueckfall: unknown) => einstellung.wert ?? rueckfall,
  setAppConfig: vi.fn(),
}));

const { DokumenteAnsicht, ROT_HINWEIS } = await import("./DokumenteAnsicht");

function befristet(zeiger: string): string {
  return `https://x.supabase.co/storage/v1/object/sign/objekt-dokumente${zeiger}?token=t`;
}

function dok(name: string, datei: string, teil: Partial<EinheitUnterlage> = {}): EinheitUnterlage {
  return { id: `d-${name}`, name, url: `/objekt-dokument/objekte/o1/dokumente/${datei}`, art: "Objektunterlagen", kundeSieht: true, ...teil };
}

const zumObjekt = [
  dok("Teilungserklärung", "teilung.pdf", { kundeSieht: false }),
  dok("Kalkulation Einkauf", "kalk.xlsx", { art: "Intern", kundeSieht: false }),
  dok("Exposé", "expose.pdf"),
  dok("GB 115615 - Friesenstr.", "gb.pdf"),
];
const zurWohnung = [
  dok("7.2.8 Mietvertrag WE 09_23.02.2010", "mv.pdf", { art: "Wohnungsunterlagen" }),
  dok("Magdeburg_Friesenstraße_Grundriss_WE09", "grundriss.png", { art: "Wohnungsunterlagen" }),
];

function bereiche() {
  return [
    { schluessel: "objekt", titel: "Dokumente zum Objekt", eintraege: zumObjekt, link: "https://ordner.example/haus", linkLabel: "Objektunterlagen öffnen" },
    { schluessel: "wohnung", titel: "Dokumente zu dieser Wohnung", eintraege: zurWohnung },
  ];
}

function vorschau() {
  return screen.getByRole("region", { name: "Vorschau" });
}

/** Wartet, bis die Vorschau ihre Adresse hat. Sonst käme die Antwort erst nach dem Test an. */
async function vorschauGeladen() {
  await waitFor(() => expect(within(vorschau()).queryByText("Vorschau wird geladen…")).not.toBeInTheDocument());
}

function stelleBreiteEin(schmal: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: schmal && query.includes("max-width"),
      media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {},
    }),
  });
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  speicher.resolveUnterlagenUrl.mockReset().mockImplementation(async (wert: string) =>
    /^https?:\/\//.test(wert) ? wert : befristet(wert));
  speicher.unterlageHerunterladen.mockReset().mockResolvedValue(true);
  speicher.adresseHerunterladen.mockReset().mockResolvedValue(true);
  toastFehler.mockReset();
  nutzer.rolle = null;
  einstellung.wert = null;
  freigabe.setzeKundenFreigabe.mockReset();
  bestaetigen.mockReset().mockResolvedValue(true);
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
  stelleBreiteEin(false);
});

afterEach(() => {
  stelleBreiteEin(false);
});

describe("DokumenteAnsicht", () => {
  it("wählt beim Öffnen das erste Dokument der ersten Gruppe und zeigt es sofort als PDF", async () => {
    render(<DokumenteAnsicht bereiche={bereiche()} />);

    // Das Exposé steht in der ersten Gruppe, also ist es ausgewählt.
    expect(within(vorschau()).getByText("Exposé")).toBeInTheDocument();
    const rahmen = await within(vorschau()).findByTitle("Vorschau: Exposé");
    expect(rahmen.tagName).toBe("IFRAME");
    expect(rahmen.getAttribute("src")).toBe(`${befristet("/objekt-dokument/objekte/o1/dokumente/expose.pdf")}#view=FitH`);
    expect(speicher.resolveUnterlagenUrl).toHaveBeenCalledWith("/objekt-dokument/objekte/o1/dokumente/expose.pdf");
  });

  it("stellt auf dem Handy den Dateinamen über die volle Breite und die Knöpfe darunter", async () => {
    /*
     * Christian am 23.09.2026: Ein langer Name wie „OdW_Stralsund_Gruen…“
     * stand Buchstabe für Buchstabe untereinander, weil der Name mit
     * Grundbreite null neben „In neuem Tab öffnen“ und „Herunterladen“ saß.
     * jsdom rechnet kein Layout, deshalb wachen hier die Klassen.
     */
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    await vorschauGeladen();
    const name = screen.getByTestId("vorschau-dateiname");
    expect(name.className).toContain("basis-full");
    expect(name.className).toContain("sm:basis-0");
    expect(name.className).toContain("min-w-0");
    expect(name.firstElementChild?.className).toContain("[overflow-wrap:anywhere]");
    expect(screen.getByTestId("vorschau-kopf").className).toContain("flex-wrap");
  });

  it("gliedert nach Oberbegriffen, mit Anzahl, nur die erste Gruppe ist aufgeklappt", async () => {
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    const liste = screen.getByRole("navigation", { name: "Dokumentenliste" });

    const gruppen = Array.from(liste.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"));
    expect(gruppen.map((g) => g.textContent)).toEqual(["Exposé und Beschreibung1", "Teilungserklärung1", "Grundbuch1", "Sonstiges1"]);
    expect(gruppen.map((g) => g.getAttribute("aria-expanded"))).toEqual(["true", "false", "false", "false"]);
    // Zugeklappte Gruppen zeigen ihre Dateien nicht.
    expect(within(liste).queryByText("Teilungserklärung", { selector: "li span" })).not.toBeInTheDocument();

    fireEvent.click(within(liste).getByRole("button", { name: /^Grundbuch/ }));
    expect(within(liste).getByText("GB 115615 - Friesenstr.")).toBeInTheDocument();
    await vorschauGeladen();
  });

  it("zeigt ein angeklicktes Dokument sofort rechts, ein Bild als Bild und eine PDF eingebettet", async () => {
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    fireEvent.click(screen.getByRole("button", { name: /Dokumente zu dieser Wohnung/ }));
    const liste = screen.getByRole("navigation", { name: "Dokumentenliste" });

    // Standardauswahl in der Wohnung: der Grundriss, ein Bild.
    const bild = await within(vorschau()).findByRole("img", { name: "Magdeburg_Friesenstraße_Grundriss_WE09" });
    expect(bild.getAttribute("src")).toBe(befristet("/objekt-dokument/objekte/o1/dokumente/grundriss.png"));
    expect(within(liste).getByText("Magdeburg_Friesenstraße_Grundriss_WE09").closest("button")).toHaveAttribute("aria-current", "true");

    fireEvent.click(within(liste).getByRole("button", { name: /^Mietverhältnis/ }));
    fireEvent.click(within(liste).getByText("7.2.8 Mietvertrag WE 09_23.02.2010"));
    expect(within(vorschau()).getByText("7.2.8 Mietvertrag WE 09_23.02.2010")).toBeInTheDocument();
    const rahmen = await within(vorschau()).findByTitle("Vorschau: 7.2.8 Mietvertrag WE 09_23.02.2010");
    expect(rahmen.getAttribute("src")).toContain("mv.pdf");
    expect(within(vorschau()).queryByRole("img")).not.toBeInTheDocument();
    // Die gewählte Zeile ist markiert, die vorige nicht mehr.
    expect(within(liste).getByText("7.2.8 Mietvertrag WE 09_23.02.2010").closest("button")).toHaveAttribute("aria-current", "true");
    expect(within(liste).getByText("Magdeburg_Friesenstraße_Grundriss_WE09").closest("button")).not.toHaveAttribute("aria-current");
  });

  it("schaltet zwischen Objekt und Wohnung um und wählt dort wieder das erste Dokument", async () => {
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    const objektKnopf = screen.getByRole("button", { name: /Dokumente zum Objekt/ });
    const wohnungKnopf = screen.getByRole("button", { name: /Dokumente zu dieser Wohnung/ });
    expect(objektKnopf).toHaveAttribute("aria-pressed", "true");
    expect(wohnungKnopf).toHaveAttribute("aria-pressed", "false");
    expect(objektKnopf).toHaveTextContent("4");
    expect(wohnungKnopf).toHaveTextContent("2");
    // Der Sammelordner gehört zum Objekt.
    expect(screen.getByRole("link", { name: /Objektunterlagen öffnen/ })).toHaveAttribute("href", "https://ordner.example/haus");

    fireEvent.click(wohnungKnopf);
    expect(wohnungKnopf).toHaveAttribute("aria-pressed", "true");
    const liste = screen.getByRole("navigation", { name: "Dokumentenliste" });
    expect(within(liste).queryByText("Exposé")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Objektunterlagen öffnen/ })).not.toBeInTheDocument();
    // Grundrisse stehen fachlich vor dem Mietverhältnis, also ist der Grundriss ausgewählt.
    expect(within(vorschau()).getByText("Magdeburg_Friesenstraße_Grundriss_WE09")).toBeInTheDocument();
    await within(vorschau()).findByRole("img");

    fireEvent.click(objektKnopf);
    expect(within(vorschau()).getByText("Exposé")).toBeInTheDocument();
    await vorschauGeladen();
  });

  it("zeigt ohne zweiten Bereich keinen Umschalter, nur die Überschrift", async () => {
    render(<DokumenteAnsicht bereiche={[bereiche()[0]]} />);
    expect(screen.queryByRole("group", { name: "Welche Dokumente" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Dokumente zum Objekt/ })).toHaveTextContent("4 Dateien");
    await vorschauGeladen();
  });

  it("sagt dezent unter dem Namen nur, wer die Unterlage sieht, ohne „Intern“ davor", async () => {
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    const liste = screen.getByRole("navigation", { name: "Dokumentenliste" });
    fireEvent.click(within(liste).getByRole("button", { name: /^Sonstiges/ }));
    fireEvent.click(within(liste).getByRole("button", { name: /^Teilungserklärung/ }));

    const zeile = (name: string) => within(liste).getByText(name, { selector: "li span" }).closest("li") as HTMLElement;
    expect(within(zeile("Kalkulation Einkauf")).getByText("Nur im CRM")).toBeInTheDocument();
    expect(within(zeile("Kalkulation Einkauf")).queryByText("Intern")).not.toBeInTheDocument();
    expect(within(zeile("Teilungserklärung")).getByText("Nur im CRM")).toBeInTheDocument();
    expect(within(zeile("Exposé")).getByText("Für Kunden freigegeben")).toBeInTheDocument();
    // Das widersprüchliche „Intern · Kunde sieht“ gibt es nicht mehr.
    expect(liste).not.toHaveTextContent("Intern·");
    await vorschauGeladen();
  });

  it("lädt jedes Dokument herunter, aus der Zeile und aus der Vorschau, mit Endung im Namen", async () => {
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    const liste = screen.getByRole("navigation", { name: "Dokumentenliste" });

    fireEvent.click(within(liste).getByRole("button", { name: "Exposé herunterladen" }));
    await waitFor(() => expect(speicher.unterlageHerunterladen).toHaveBeenCalledWith("/objekt-dokument/objekte/o1/dokumente/expose.pdf", "Exposé.pdf"));

    fireEvent.click(within(vorschau()).getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(speicher.unterlageHerunterladen).toHaveBeenCalledTimes(2));

    // Auch eine Datei aus einer anderen Gruppe, ohne sie vorher anzusehen.
    fireEvent.click(within(liste).getByRole("button", { name: /^Grundbuch/ }));
    fireEvent.click(within(liste).getByRole("button", { name: "GB 115615 - Friesenstr. herunterladen" }));
    await waitFor(() => expect(speicher.unterlageHerunterladen).toHaveBeenLastCalledWith("/objekt-dokument/objekte/o1/dokumente/gb.pdf", "GB 115615 - Friesenstr.pdf"));
    expect(within(vorschau()).getByText("Exposé")).toBeInTheDocument();
  });

  it("sagt Bescheid, wenn das Herunterladen nicht klappt", async () => {
    speicher.unterlageHerunterladen.mockResolvedValue(false);
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    fireEvent.click(within(vorschau()).getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(toastFehler).toHaveBeenCalled());
  });

  it("zeigt bei einer Datei, die sich nicht einbetten lässt, einen ruhigen Hinweis mit In neuem Tab öffnen", async () => {
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    const liste = screen.getByRole("navigation", { name: "Dokumentenliste" });
    fireEvent.click(within(liste).getByRole("button", { name: /^Sonstiges/ }));
    fireEvent.click(within(liste).getByText("Kalkulation Einkauf"));

    expect(await within(vorschau()).findByText("Diese Dateiart (XLSX) lässt sich hier nicht anzeigen.")).toBeInTheDocument();
    const links = within(vorschau()).getAllByRole("link", { name: /In neuem Tab öffnen/ });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", befristet("/objekt-dokument/objekte/o1/dokumente/kalk.xlsx"));
    expect(within(vorschau()).queryByTitle(/Vorschau:/)).not.toBeInTheDocument();
  });

  it("bettet eine Datei auf einem fremden Server nicht ein", async () => {
    const fremd = { schluessel: "objekt", titel: "Dokumente zum Objekt", eintraege: [dok("Energieausweis", "", { url: "https://tool.investagon.com/files/energie.pdf" })] };
    render(<DokumenteAnsicht bereiche={[fremd]} />);
    expect(await within(vorschau()).findByText("Diese Datei liegt auf einem fremden Server und lässt sich hier nicht anzeigen.")).toBeInTheDocument();
    expect(within(vorschau()).getByRole("link", { name: /In neuem Tab öffnen/ })).toHaveAttribute("href", "https://tool.investagon.com/files/energie.pdf");
    expect(within(vorschau()).queryByTitle(/Vorschau:/)).not.toBeInTheDocument();
  });

  it("meldet eine Datei, für die es keine Adresse gibt, und lädt auf Wunsch neu", async () => {
    speicher.resolveUnterlagenUrl.mockResolvedValueOnce(null);
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    expect(await within(vorschau()).findByText(/Die Datei ließ sich gerade nicht laden/)).toBeInTheDocument();

    fireEvent.click(within(vorschau()).getByRole("button", { name: /Erneut versuchen/ }));
    expect(await within(vorschau()).findByTitle("Vorschau: Exposé")).toBeInTheDocument();
  });

  it("zeigt eine späte Antwort für ein vorher gewähltes Dokument nicht an", async () => {
    let spaet: (wert: string) => void = () => {};
    speicher.resolveUnterlagenUrl.mockImplementationOnce(() => new Promise<string>((fertig) => { spaet = fertig; }));
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    const liste = screen.getByRole("navigation", { name: "Dokumentenliste" });
    fireEvent.click(within(liste).getByRole("button", { name: /^Grundbuch/ }));
    fireEvent.click(within(liste).getByText("GB 115615 - Friesenstr."));
    await within(vorschau()).findByTitle("Vorschau: GB 115615 - Friesenstr.");

    spaet(befristet("/alt/expose.pdf"));
    await new Promise((r) => setTimeout(r, 0));
    expect(within(vorschau()).getByTitle("Vorschau: GB 115615 - Friesenstr.").getAttribute("src")).toContain("gb.pdf");
  });

  it("legt auf schmalen Bildschirmen die Liste über die Vorschau und scrollt nach dem Klick zur Vorschau", async () => {
    stelleBreiteEin(true);
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    const liste = screen.getByRole("navigation", { name: "Dokumentenliste" });
    const raster = liste.parentElement as HTMLElement;

    // Zwei Spalten erst ab der Breakpoint-Grenze, darunter eine Spalte: Liste oben, Vorschau darunter.
    expect(raster.className).toContain("lg:grid-cols-");
    expect(raster.className).not.toMatch(/(^|\s)grid-cols-/);
    expect(liste.compareDocumentPosition(vorschau()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Lange Namen brechen um statt abgeschnitten zu werden.
    expect(within(liste).getByText("Exposé").className).toContain("break-words");
    expect(within(liste).getByText("Exposé").className).not.toContain("truncate");

    fireEvent.click(within(liste).getByText("Exposé"));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    await vorschauGeladen();
  });

  it("scrollt nebeneinander nicht, dort steht die Vorschau schon im Blick", async () => {
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Dokumentenliste" })).getByText("Exposé"));
    expect(scrollIntoView).not.toHaveBeenCalled();
    await vorschauGeladen();
  });

  it("nimmt auf der Objektseite die breitere Grenze, weil dort die Seitenleiste daneben steht", async () => {
    render(<DokumenteAnsicht bereiche={[bereiche()[0]]} nebeneinanderAb="xl" />);
    const raster = screen.getByRole("navigation", { name: "Dokumentenliste" }).parentElement as HTMLElement;
    expect(raster.className).toContain("xl:grid-cols-");
    expect(raster.className).not.toContain("lg:grid-cols-");
    await vorschauGeladen();
  });

  it("zeigt bei einem Bereich, der nur einen Sammelordner hat, den Ordner und keine leere Vorschau", () => {
    render(<DokumenteAnsicht bereiche={[{ schluessel: "objekt", titel: "Dokumente zum Objekt", eintraege: [], link: "https://ordner.example/haus", linkLabel: "Objektunterlagen öffnen" }]} />);
    expect(screen.getByRole("link", { name: /Objektunterlagen öffnen/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Vorschau" })).not.toBeInTheDocument();
    expect(screen.getByText(/nur der Sammelordner/)).toBeInTheDocument();
  });
});

/*
 * Die Dokumenten-Ampel im Reiter (Christian, 23.09.2026): Wer freigeben darf,
 * schaltet je Dokument „Für Kunden: frei / gesperrt", bei Rot zusätzlich
 * „geschwärzt geprüft". Admin und Inhaber dürfen immer, dazu die in der
 * Nutzerverwaltung gewählten Rollen, ohne Einstellung Vertriebsleiter und
 * Objektpartner. Geschrieben wird über das Freigabe-Modul, hier nachgebaut.
 */
describe("DokumenteAnsicht, Freigabe für Kunden", () => {
  function einzeln(d: EinheitUnterlage) {
    return [{ schluessel: "objekt", titel: "Dokumente zum Objekt", eintraege: [d] }];
  }
  const wirtschaftsplan = () => dok("Wirtschaftsplan 2025", "wp.pdf", {
    tabelle: "objekt_dokumente", freigabeSchalter: "bereit", ampel: "gelb", kundeSieht: false, kundenFreigabe: null,
  });
  const mietvertrag = () => dok("Mietvertrag WE 3", "mv.pdf", {
    art: "Wohnungsunterlagen", tabelle: "wohnungs_dokumente", freigabeSchalter: "bereit", ampel: "rot", kundeSieht: false,
  });

  it.each([["vertriebspartner"], ["backoffice"], ["kunde"], [null]])("zeigt der Rolle %s ohne Einstellung keinen Schalter", async (rolle) => {
    nutzer.rolle = rolle;
    render(<DokumenteAnsicht bereiche={einzeln(wirtschaftsplan())} />);
    expect(screen.queryByRole("group", { name: "Für Kunden" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ampel/)).not.toBeInTheDocument();
    await vorschauGeladen();
  });

  it.each([["vertriebsleiter"], ["objektpartner"]])("zeigt der Rolle %s den Schalter schon ohne Einstellung", async (rolle) => {
    nutzer.rolle = rolle;
    render(<DokumenteAnsicht bereiche={einzeln(wirtschaftsplan())} />);
    expect(screen.getByRole("group", { name: "Für Kunden" })).toBeInTheDocument();
    await vorschauGeladen();
  });

  it("folgt der Einstellung: zugeschaltet sieht den Schalter, abgewählt nicht", async () => {
    einstellung.wert = { rollen: ["vertriebspartner"] };
    nutzer.rolle = "vertriebspartner";
    const { unmount } = render(<DokumenteAnsicht bereiche={einzeln(wirtschaftsplan())} />);
    expect(screen.getByRole("group", { name: "Für Kunden" })).toBeInTheDocument();
    await vorschauGeladen();
    unmount();

    nutzer.rolle = "objektpartner";
    render(<DokumenteAnsicht bereiche={einzeln(wirtschaftsplan())} />);
    expect(screen.queryByRole("group", { name: "Für Kunden" })).not.toBeInTheDocument();
    await vorschauGeladen();
  });

  it.each([["admin"], ["inhaber"]])("zeigt %s den Schalter immer, auch wenn keine Rolle zugeschaltet ist", async (rolle) => {
    einstellung.wert = { rollen: [] };
    nutzer.rolle = rolle;
    render(<DokumenteAnsicht bereiche={einzeln(wirtschaftsplan())} />);
    expect(screen.getByRole("group", { name: "Für Kunden" })).toBeInTheDocument();
    await vorschauGeladen();
  });

  it("zeigt Admin die Ampel und schreibt die Freigabe über das Freigabe-Modul", async () => {
    nutzer.rolle = "admin";
    freigabe.setzeKundenFreigabe.mockResolvedValue({ ok: true, kundenFreigabe: "frei", geschwaerzt: false });
    render(<DokumenteAnsicht bereiche={einzeln(wirtschaftsplan())} />);

    const schalter = screen.getByRole("group", { name: "Für Kunden" });
    expect(within(vorschau()).getAllByText("Ampel gelb").length).toBeGreaterThan(0);
    expect(within(schalter).getByRole("button", { name: "gesperrt" })).toHaveAttribute("aria-pressed", "true");
    expect(within(vorschau()).getByText(/Gelb: geht erst nach deiner Freigabe/)).toBeInTheDocument();

    fireEvent.click(within(schalter).getByRole("button", { name: "frei" }));
    await waitFor(() => expect(freigabe.setzeKundenFreigabe).toHaveBeenCalledWith("objekt_dokumente", "d-Wirtschaftsplan 2025", "frei", false));
    await waitFor(() => expect(within(schalter).getByRole("button", { name: "frei" })).toHaveAttribute("aria-pressed", "true"));
    // Das Kennzeichen sagt jetzt ehrlich, dass Kunden die Unterlage sehen.
    const liste = screen.getByRole("navigation", { name: "Dokumentenliste" });
    expect(within(liste).getByText("Für Kunden freigegeben")).toBeInTheDocument();
    await vorschauGeladen();
  });

  it("bietet dem Inhaber dasselbe und setzt auf Wunsch die Grundregel wieder ein", async () => {
    nutzer.rolle = "inhaber";
    freigabe.setzeKundenFreigabe.mockResolvedValue({ ok: true, kundenFreigabe: null, geschwaerzt: false });
    render(<DokumenteAnsicht bereiche={einzeln({ ...wirtschaftsplan(), kundenFreigabe: "frei", kundeSieht: true })} />);
    fireEvent.click(within(vorschau()).getByRole("button", { name: "Grundregel" }));
    await waitFor(() => expect(freigabe.setzeKundenFreigabe).toHaveBeenCalledWith("objekt_dokumente", "d-Wirtschaftsplan 2025", null, false));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "Für Kunden" })).getByRole("button", { name: "gesperrt" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("lässt Rot erst nach „geschwärzt geprüft“ freigeben, mit Rückfrage im Projektstil", async () => {
    nutzer.rolle = "admin";
    freigabe.setzeKundenFreigabe.mockResolvedValue({ ok: true, kundenFreigabe: null, geschwaerzt: true });
    render(<DokumenteAnsicht bereiche={einzeln(mietvertrag())} />);
    const schalter = screen.getByRole("group", { name: "Für Kunden" });
    expect(within(schalter).getByRole("button", { name: "frei" })).toBeDisabled();
    expect(within(vorschau()).getByText(/gehen nie im Original hinaus/)).toBeInTheDocument();

    // Erst abgelehnt: nichts wird geschrieben.
    bestaetigen.mockResolvedValueOnce(false);
    fireEvent.click(within(vorschau()).getByRole("checkbox", { name: /geschwärzt geprüft/ }));
    await waitFor(() => expect(bestaetigen).toHaveBeenCalledTimes(1));
    expect(freigabe.setzeKundenFreigabe).not.toHaveBeenCalled();
    expect(bestaetigen.mock.calls[0][0]).toMatchObject({ confirmText: "Als geprüft markieren", cancelText: "Nicht markieren" });

    fireEvent.click(within(vorschau()).getByRole("checkbox", { name: /geschwärzt geprüft/ }));
    await waitFor(() => expect(freigabe.setzeKundenFreigabe).toHaveBeenCalledWith("wohnungs_dokumente", "d-Mietvertrag WE 3", null, true));
    await waitFor(() => expect(within(schalter).getByRole("button", { name: "frei" })).toBeEnabled());
    await vorschauGeladen();
  });

  it("meldet eine Ablehnung der Datenbank und lässt die Anzeige, wie sie war", async () => {
    nutzer.rolle = "admin";
    freigabe.setzeKundenFreigabe.mockResolvedValue({ ok: false, grund: "keine_berechtigung", text: "Umschalten dürfen nur Admin und Inhaber." });
    render(<DokumenteAnsicht bereiche={einzeln(wirtschaftsplan())} />);
    fireEvent.click(within(screen.getByRole("group", { name: "Für Kunden" })).getByRole("button", { name: "frei" }));
    await waitFor(() => expect(toastFehler).toHaveBeenCalledWith("Umschalten dürfen nur Admin und Inhaber."));
    expect(within(screen.getByRole("navigation", { name: "Dokumentenliste" })).getByText("Nur im CRM")).toBeInTheDocument();
    await vorschauGeladen();
  });

  it("sperrt den Schalter ohne Migration und sagt dem Admin, warum", async () => {
    nutzer.rolle = "admin";
    render(<DokumenteAnsicht bereiche={einzeln({ ...wirtschaftsplan(), freigabeSchalter: "migration_fehlt" })} />);
    const schalter = screen.getByRole("group", { name: "Für Kunden" });
    expect(within(schalter).getByRole("button", { name: "frei" })).toBeDisabled();
    expect(within(schalter).getByRole("button", { name: "gesperrt" })).toBeDisabled();
    expect(within(vorschau()).getByText(/nach der Migration 20260923170000_dokument_kundenfreigabe/)).toBeInTheDocument();
    await vorschauGeladen();
  });

  it("bietet bei einer Datei nur in den Einheitsdaten keinen Schalter, dort gilt die Grundregel", async () => {
    nutzer.rolle = "admin";
    const nurMeta = dok("Grundriss", "g.pdf", { art: "Wohnungsunterlagen", freigabeSchalter: "nur_grundregel", ampel: "gruen" });
    render(<DokumenteAnsicht bereiche={einzeln(nurMeta)} />);
    expect(within(screen.getByRole("group", { name: "Für Kunden" })).getByRole("button", { name: "gesperrt" })).toBeDisabled();
    expect(within(vorschau()).getByText(/es gilt die Grundregel der Ampel/)).toBeInTheDocument();
    await vorschauGeladen();
  });
});

/*
 * Der Kundenmodus für die Kundenansicht (Vertrag mit deren Agenten): nichts
 * Internes, nur was `darfZumKunden` erlaubt, Adressen nur über `adresseLaden`.
 */
describe("DokumenteAnsicht, Kundenmodus", () => {
  const signiert = (datei: string) => `https://x.supabase.co/storage/v1/object/sign/objekt-dokumente/${datei}?token=kunde`;
  const ohneAdresse = (name: string, teil: Partial<EinheitUnterlage> = {}): EinheitUnterlage =>
    ({ id: `k-${name}`, name, url: "", art: "Objektunterlagen", kundeSieht: true, tabelle: "objekt_dokumente", ...teil });

  function kundenBereiche() {
    return [
      {
        schluessel: "objekt", titel: "Dokumente zum Haus", link: "https://ordner.example/alles", linkLabel: "Objektunterlagen öffnen",
        eintraege: [
          ohneAdresse("Exposé"),
          ohneAdresse("Wirtschaftsplan 2025", { kundenFreigabe: "frei" }),
          ohneAdresse("Kalkulation Einkauf", { art: "Intern", internVonHand: true, kundeSieht: false }),
          ohneAdresse("Grundbuchauszug", { kundeSieht: false }),
          // Vergiftet: behauptet „Kunde sieht", ist aber ein ungeschwärzter Mietvertrag.
          ohneAdresse("Mietvertrag Scholtz", { kundeSieht: true, kundenFreigabe: "frei" }),
          // Vergiftet: gelb ohne Freigabe, trotzdem als sichtbar markiert.
          ohneAdresse("Hausgeldabrechnung 2024", { kundeSieht: true }),
        ],
      },
    ];
  }

  it("zeigt nur Freigegebenes, ohne Kennzeichen, Sammelordner und Schalter, auch für Admin", async () => {
    nutzer.rolle = "admin";
    const adresseLaden = vi.fn(async ({ id }: { id: string }) => signiert(`${id}.pdf`));
    render(<DokumenteAnsicht bereiche={kundenBereiche()} kundenModus adresseLaden={adresseLaden} />);
    const liste = screen.getByRole("navigation", { name: "Dokumentenliste" });

    fireEvent.click(within(liste).getByRole("button", { name: /^WEG und Hausgeld/ }));
    const namen = Array.from(liste.querySelectorAll("li")).map((li) => li.textContent);
    expect(namen).toEqual(["Exposé", "Wirtschaftsplan 2025"]);
    for (const verboten of ["Kalkulation Einkauf", "Grundbuchauszug", "Mietvertrag Scholtz", "Hausgeldabrechnung 2024", "Für Kunden freigegeben", "Nur im CRM", "Intern"]) {
      expect(screen.queryByText(verboten)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: /Objektunterlagen öffnen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Für Kunden" })).not.toBeInTheDocument();
    expect(screen.getByText(ROT_HINWEIS)).toBeInTheDocument();
    await vorschauGeladen();
  });

  it("holt Vorschau und Download ausschließlich über adresseLaden, nie über die Anmeldung", async () => {
    const adresseLaden = vi.fn(async ({ id }: { id: string }) => signiert(`${id}.pdf`));
    render(<DokumenteAnsicht bereiche={kundenBereiche()} kundenModus adresseLaden={adresseLaden} />);

    const rahmen = await within(vorschau()).findByTitle("Vorschau: Exposé");
    expect(rahmen.getAttribute("src")).toBe(`${signiert("k-Exposé.pdf")}#view=FitH`);
    expect(adresseLaden).toHaveBeenCalledWith({ id: "k-Exposé", tabelle: "objekt_dokumente" });
    expect(speicher.resolveUnterlagenUrl).not.toHaveBeenCalled();

    fireEvent.click(within(vorschau()).getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(speicher.adresseHerunterladen).toHaveBeenCalledWith(signiert("k-Exposé.pdf"), "Exposé.pdf"));
    expect(speicher.unterlageHerunterladen).not.toHaveBeenCalled();
    expect(speicher.resolveUnterlagenUrl).not.toHaveBeenCalled();
  });

  it("zeigt ohne adresseLaden keine Vorschau, statt auf die Anmeldung auszuweichen", async () => {
    render(<DokumenteAnsicht bereiche={kundenBereiche()} kundenModus />);
    expect(await within(vorschau()).findByText(/Die Datei ließ sich gerade nicht laden/)).toBeInTheDocument();
    expect(speicher.resolveUnterlagenUrl).not.toHaveBeenCalled();
  });

  it("zeigt den Satz zu Mietvertrag und Grundbuch auch, wenn der Server sie gar nicht mitschickt", async () => {
    const adresseLaden = vi.fn(async () => signiert("e.pdf"));
    const { unmount } = render(<DokumenteAnsicht kundenModus adresseLaden={adresseLaden}
      bereiche={[{ schluessel: "wohnung", titel: "Dokumente zur Wohnung", eintraege: [ohneAdresse("Grundriss WE 7", { tabelle: undefined })], rotZurueckgehalten: true }]} />);
    expect(screen.getByText(ROT_HINWEIS)).toBeInTheDocument();
    // Ohne Tabelle am Eintrag gilt die des Bereichs.
    await waitFor(() => expect(adresseLaden).toHaveBeenCalledWith({ id: "k-Grundriss WE 7", tabelle: "wohnungs_dokumente" }));
    unmount();

    render(<DokumenteAnsicht kundenModus adresseLaden={adresseLaden}
      bereiche={[{ schluessel: "objekt", titel: "Dokumente zum Haus", eintraege: [ohneAdresse("Exposé")] }]} />);
    expect(screen.queryByText(ROT_HINWEIS)).not.toBeInTheDocument();
    await vorschauGeladen();
  });

  it("sagt freundlich Bescheid, wenn in einem Bereich nichts zum Ansehen liegt", () => {
    render(<DokumenteAnsicht kundenModus bereiche={[{ schluessel: "wohnung", titel: "Dokumente zur Wohnung", eintraege: [ohneAdresse("Mietvertrag", { kundeSieht: false })] }]} />);
    expect(screen.getByText("Hier liegen noch keine Unterlagen zum Ansehen.")).toBeInTheDocument();
    expect(screen.getByText(ROT_HINWEIS)).toBeInTheDocument();
    expect(screen.queryByText(/Sammelordner/)).not.toBeInTheDocument();
  });
});

/*
 * Als ZIP herunterladen (Christian, 24.09.2026). Die Dateien kommen über
 * denselben nachgebauten Speicher wie oben, geladen wird über `fetch`.
 */
describe("DokumenteAnsicht: Als ZIP herunterladen", () => {
  const ZIP = { objektTitel: "Friesenstraße 5", weNr: "WE 09" };
  const holen = vi.fn();
  let gespeichert: string[] = [];

  beforeEach(() => {
    holen.mockReset().mockImplementation(async () => ({ ok: true, status: 200, blob: async () => new Blob(["pdf"]) }));
    vi.stubGlobal("fetch", holen);
    gespeichert = [];
    Object.defineProperty(URL, "createObjectURL", { writable: true, value: vi.fn(() => "blob:zip") });
    Object.defineProperty(URL, "revokeObjectURL", { writable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      gespeichert.push(this.download);
    });
    toastWeitere.hinweis.mockReset();
    toastWeitere.erfolg.mockReset();
    toastWeitere.warnung.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("zeigt Admin und Finanzierungsrolle den Knopf je Bereich und „Alles als ZIP“", async () => {
    for (const rolle of ["admin", "finanzierungspartner"]) {
      nutzer.rolle = rolle;
      const { unmount } = render(<DokumenteAnsicht bereiche={bereiche()} zip={ZIP} />);
      const knopf = screen.getByRole("button", { name: "Als ZIP herunterladen" });
      expect(knopf).toBeEnabled();
      expect(knopf).toHaveAttribute("title", "Dokumente zum Objekt als ZIP herunterladen");
      expect(screen.getByRole("button", { name: /Alles als ZIP/ })).toBeEnabled();
      await vorschauGeladen();
      unmount();
    }
  });

  it("zeigt der Kundenrolle keinen Knopf, im Kundenmodus niemandem", async () => {
    nutzer.rolle = "kunde";
    const { unmount } = render(<DokumenteAnsicht bereiche={bereiche()} zip={ZIP} />);
    expect(screen.queryByRole("button", { name: /als ZIP/i })).not.toBeInTheDocument();
    await vorschauGeladen();
    unmount();

    nutzer.rolle = "admin";
    render(<DokumenteAnsicht bereiche={bereiche()} zip={ZIP} kundenModus adresseLaden={async () => null} />);
    expect(screen.queryByRole("button", { name: /als ZIP/i })).not.toBeInTheDocument();
  });

  it("zeigt ohne Objektangaben keinen Knopf", async () => {
    nutzer.rolle = "admin";
    render(<DokumenteAnsicht bereiche={bereiche()} />);
    expect(screen.queryByRole("button", { name: /als ZIP/i })).not.toBeInTheDocument();
    await vorschauGeladen();
  });

  it("zeigt auf der Objektseite nur den Knopf für den einen Bereich", async () => {
    nutzer.rolle = "admin";
    render(<DokumenteAnsicht bereiche={[bereiche()[0]]} zip={{ objektTitel: "Friesenstraße 5" }} />);
    expect(screen.getByRole("button", { name: "Als ZIP herunterladen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Alles als ZIP/ })).not.toBeInTheDocument();
    await vorschauGeladen();
  });

  it("packt alles, zeigt den Fortschritt und speichert unter sprechendem Namen", async () => {
    nutzer.rolle = "admin";
    // Die erste Datei hält an, bis der Test sie freigibt: So ist der Fortschritt zu sehen.
    let freigeben: () => void = () => {};
    const erste = new Promise<void>((r) => { freigeben = r; });
    holen.mockImplementationOnce(async () => {
      await erste;
      return { ok: true, status: 200, blob: async () => new Blob(["pdf"]) };
    });
    render(<DokumenteAnsicht bereiche={bereiche()} zip={ZIP} />);
    await vorschauGeladen();

    fireEvent.click(screen.getByRole("button", { name: /Alles als ZIP/ }));
    expect(await screen.findByText("0 von 6 Dateien")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Als ZIP herunterladen" })).toBeDisabled();
    freigeben();

    await waitFor(() => expect(toastWeitere.erfolg).toHaveBeenCalledWith("6 Dateien als ZIP heruntergeladen."));
    expect(gespeichert).toHaveLength(1);
    expect(gespeichert[0]).toMatch(/^Unterlagen Friesenstraße 5 WE 09 \d{4}-\d{2}-\d{2}\.zip$/);
    await waitFor(() => expect(screen.queryByTestId("zip-fortschritt")).not.toBeInTheDocument());
    // Die Adressen kamen über denselben Weg wie beim Einzeldownload.
    expect(speicher.resolveUnterlagenUrl).toHaveBeenCalledWith("/objekt-dokument/objekte/o1/dokumente/mv.pdf");
  });

  it("nennt fehlende Dateien im Toast und bricht den Rest nicht ab", async () => {
    nutzer.rolle = "finanzierungspartner";
    holen.mockImplementation(async (url: string) => (url.includes("gb.pdf")
      ? { ok: false, status: 403, blob: async () => new Blob([]) }
      : { ok: true, status: 200, blob: async () => new Blob(["pdf"]) }));
    render(<DokumenteAnsicht bereiche={[bereiche()[0]]} zip={{ objektTitel: "Friesenstraße 5" }} />);
    await vorschauGeladen();

    fireEvent.click(screen.getByRole("button", { name: "Als ZIP herunterladen" }));
    await waitFor(() => expect(toastWeitere.warnung).toHaveBeenCalledWith(
      "3 von 4 Dateien in der ZIP-Datei. 1 fehlt, die Gründe stehen in „Nicht enthalten.txt“.",
    ));
    expect(gespeichert).toHaveLength(1);
  });

  it("lässt sich abbrechen und speichert dann nichts", async () => {
    nutzer.rolle = "admin";
    holen.mockImplementation((_url: string, init?: { signal?: AbortSignal }) => new Promise((_, ablehnen) => {
      init?.signal?.addEventListener("abort", () => ablehnen(Object.assign(new Error("abgebrochen"), { name: "AbortError" })));
    }));
    render(<DokumenteAnsicht bereiche={bereiche()} zip={ZIP} />);
    await vorschauGeladen();

    fireEvent.click(screen.getByRole("button", { name: /Alles als ZIP/ }));
    await screen.findByText("0 von 6 Dateien");
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    await waitFor(() => expect(toastWeitere.hinweis).toHaveBeenCalledWith("Download abgebrochen, es wurde nichts gespeichert."));
    expect(gespeichert).toHaveLength(0);
    await waitFor(() => expect(screen.queryByTestId("zip-fortschritt")).not.toBeInTheDocument());
  });
});
