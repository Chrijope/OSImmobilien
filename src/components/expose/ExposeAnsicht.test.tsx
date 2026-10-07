import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ObjektData } from "@/lib/objekteStore";
import type { Standort } from "@/data/marktanalyseSeed";
import { annahmenVorbelegen, baueExposeInhalt, type Person } from "@/lib/exposeInhalt";
import { ExposeAnsicht, RECHNER_HINWEIS_OHNE_SPEICHERN } from "./ExposeAnsicht";
import { LEERE_ERGAENZUNG } from "./exposeInvestagon";

/**
 * Die Premium-Ansicht des Exposés seit dem 23.09.2026: Kopf nach der Vorlage,
 * Merkmal-Chips, Standortargumente, Arbeitgeber, Merkmale als Liste, der
 * abgehakte erste Schritt, der kurze Zeitstrahl, der Terminknopf mit
 * lesbarer Schrift und der Druck. Die Wirtschaftlichkeit samt „Für jeden
 * eingesetzten Euro“ prüft `ExposeRechner.test.tsx`.
 */

beforeAll(() => {
  // Radix Slider misst die Bahn, jsdom kennt keinen ResizeObserver.
  class RO { observe() { /* leer */ } unobserve() { /* leer */ } disconnect() { /* leer */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

const objekt = {
  id: "o1", titel: "Wohnen an der Blau", adresse: "Söflinger Str. 203", plz: "89077", ort: "Ulm", beschreibung: "", highlights: [],
  bildUrl: "", bilder: [], dokumente: [], videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0,
  renditeVon: 0, renditeBis: 0, sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01",
  afaDaten: { afaModell: "gutachten", afaSatz: 5.5, restnutzungsdauer: 18, grundstueckAnteil: 20 },
  globalDaten: { gesamtQm: 0, etagen: 4, baujahr: 1954, grundstueckQm: 0, verkaufspreis: 0, qmPreis: 0, rendite: 0, jahresnettomiete: 0, hausgeldMonat: 0, kaufnebenkosten: 0, grundstueckAnteil: 0, zustand: "Neubau" },
  meta: {
    objektart: "neubau",
    energieausweis: { art: "Verbrauchsausweis", kennwert: 121, energietraeger: "Gas" },
    standortargumente: [
      "Starker Wirtschaftsstandort. Große Arbeitgeber aus Industrie und Forschung.",
      "Wissenschaft. Universität und Hochschulen ziehen Fachkräfte an.",
      "Kaufkraft. Überdurchschnittliche Beschäftigung in der Region.",
      "Verkehr. A7, A8 und ICE-Halt.",
      "Nachfrage. Die Einwohnerzahl wächst seit Jahren.",
    ],
  },
  wohnungen: [
    // Etage „0“ ist das Erdgeschoss, wie Investagon es liefert.
    { id: "w7", weNr: "WE 7", etage: "0", lage: "", groesse: 65, zimmer: 3, mieteGesamt: 863, vkGesamt: 246800, qmPreis: 0, rendite: 0, vermietet: false, status: "frei", stellplatzPreis: 12000, investagonRaw: { object_balcony: true } },
  ],
} as unknown as ObjektData;
const w = objekt.wohnungen[0];

const standort = {
  id: "ulm", ags: "08421", name: "Ulm", bundesland: "Baden-Württemberg", lat: 0, lng: 0, einwohner: 130000, einwohner_trend_5j_pct: 2.9,
  arbeitslosenquote_pct: 3, kaufkraftindex: 105, bip_pro_kopf_eur: 0, kaufpreis_qm_wohnung_eur: 0, kaufpreis_qm_haus_eur: 0, miete_qm_eur: 12.1,
  leerstand_pct: 1.5, uni_stadt: true, oepnv_score: 4, top_arbeitgeber: [], highlights: ["Dieser Satz gehört nicht in die Argumente"], quellen: [],
} as unknown as Standort;

const partner: Person = { name: "Paula Partner", rolle: "Vertriebspartnerin", email: "paula@example.com", telefon: "+49 89 123", buchungslink: "https://cal.example/paula" };
const heute = new Date(2026, 8, 23);

/** Die gemessene Standortanalyse (schema 2), aus der die Mikrolage mit ihrer Quellenzeile kommt. */
const ANALYSE = {
  schema: 2, gemessen_am: "2026-09-20T10:00:00Z", objekt_koordinaten: { lat: 48.3969, lng: 9.9722 },
  mikrolage: { einkaufen: [{ name: "REWE", typ: "Supermarkt", entfernung_m: 159, lat: 48.3975, lng: 9.9735 }] },
  mikrolage_hinweis: "Entfernungen als Luftlinie, Einrichtungen aus OpenStreetMap.",
};

/*
 * Keine Anfrage an fremde Dienste: Die Karte nimmt ihren Punkt nur aus
 * gespeicherten Daten (Christian, 23.09.2026). Jede Anfrage aus der Ansicht
 * landet hier und fällt im Wächter unten auf.
 */
const anfragen: string[] = [];
beforeEach(() => {
  anfragen.length = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    anfragen.push(String(url));
    return { ok: false, status: 599, json: async () => ({}) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Die gespeicherte Lage am Objekt, wie Import oder Messung sie schreiben. */
const KOORDINATEN = { lat: 48.3969, lng: 9.9722, quelle: "investagon", am: "2026-09-23T20:00:00Z" };

function zeigen(opt: {
  arbeitgeber?: number; markt?: string[];
  /** Kurzbeschreibung, die als automatisch erstellt gekennzeichnet ist. */
  beschreibung?: string;
  analyse?: boolean;
  freitexte?: string[];
  rechnerHinweis?: ReactNode;
  gesperrt?: boolean;
  /** Andere Straße am Objekt, etwa leer oder ohne Straßennamen. */
  adresse?: string;
  /** Gespeicherte Lage `meta.koordinaten`. */
  koordinaten?: boolean;
} = {}) {
  const meta: Record<string, unknown> = { ...objekt.meta };
  if (opt.markt) meta.marktargumente = opt.markt;
  if (opt.beschreibung) { meta.kurzbeschreibung = opt.beschreibung; meta.texteAutomatisch = { kurzbeschreibung: true, standortargumente: true }; }
  if (opt.analyse) meta.standortanalyse = ANALYSE;
  if (opt.koordinaten) meta.koordinaten = KOORDINATEN;
  const o = { ...objekt, meta, ...(opt.adresse !== undefined ? { adresse: opt.adresse } : {}) } as unknown as ObjektData;
  const arbeitgeber = [
    { name: "Universitätsklinikum Ulm", branche: "Gesundheit", mitarbeiter: 8000, hauptsitz: true, quelle: null },
    { name: "Wieland-Werke", branche: "Industrie", mitarbeiter: 3000, hauptsitz: true, quelle: null },
    { name: "Universität Ulm", branche: "Wissenschaft", mitarbeiter: null, hauptsitz: true, quelle: null },
  ].slice(0, opt.arbeitgeber ?? 3);
  const inhalt = baueExposeInhalt({ objekt: o, wohnung: w, standort, standortArbeitgeber: arbeitgeber, ersteller: partner, heute });
  const annahmen = annahmenVorbelegen(o, w, null, heute).annahmen;
  return render(
    <MemoryRouter>
      <ExposeAnsicht
        inhalt={inhalt}
        rechner={{ annahmen, onAnnahmen: () => undefined, herkunft: {}, gesperrt: opt.gesperrt }}
        rechnerHinweis={opt.rechnerHinweis}
        investagon={{ ...LEERE_ERGAENZUNG, beschreibungen: opt.freitexte ?? [], merkmale: [{ bezeichnung: "Einbauküche", wert: "inklusive" }, { bezeichnung: "Kellerabteil", wert: "" }] }}
      />
    </MemoryRouter>,
  );
}

const text = (el: Element | null) => (el?.textContent ?? "").replace(/[\u00A0\u202F\s]+/g, " ").trim();

describe("Kopf nach der Vorlage", () => {
  it("zeigt groß die Adresse mit Wohneinheit, keinen eigenen Kasten mit der Wohneinheit", () => {
    const { container } = zeigen();
    expect(text(screen.getByTestId("kopf-ueberschrift"))).toBe("Söflinger Str. 203, 89077 Ulm, WE 7");
    expect(container.querySelector(".property-seal")).toBeNull();
    expect(text(container)).not.toContain("WOHNEINHEIT");
  });

  it("nennt in der Ortszeile jeden Begriff nur einmal", () => {
    zeigen();
    const teile = Array.from(screen.getByTestId("kopf-ortszeile").childNodes).map((n) => n.textContent ?? "").filter(Boolean);
    expect(teile).toEqual(["Ulm", "Neubau", "Erstvermietung"]);
  });

  it("stellt die Kennzahlen mit Karte links, Einwohner und Entwicklung rechts", () => {
    zeigen();
    const links = screen.getByTestId("start-kennzahlen");
    expect(text(links)).toContain("258.800 €");
    expect(text(links)).toContain("65,0 m²");
    const rechts = screen.getByTestId("start-standort");
    expect(within(rechts).getByTestId("start-einwohner")).toHaveTextContent("130.000");
    expect(within(rechts).getByTestId("start-wachstum")).toHaveTextContent("+2,9 %");
    // Kaufpreis und Rendite haben ihr eigenes Symbol, die Zahl steht dunkel wie alle anderen (siehe „Farben“).
    expect(links.querySelector(".stat-preis")).not.toBeNull();
    expect(links.querySelector(".stat-rendite")).not.toBeNull();
  });

  it("zeigt Merkmal-Chips wie die Vorlage, ohne „0“ und ohne Doppelungen", () => {
    zeigen();
    const chips = Array.from(screen.getByTestId("start-chips").querySelectorAll(".chip")).map((c) => text(c));
    expect(chips).toEqual(["Balkon", "Energieeffizienz Klasse D", "Stellplatz inklusive", "Erhöhte Abschreibung 5,50 %"]);
    expect(chips).not.toContain("0");
    expect(screen.getByTestId("start-chips").querySelector(".chip-betont")).toHaveTextContent("Erhöhte Abschreibung");
  });
});

/** Die Exposé-Gestaltung als Text, für Prüfungen der Regeln selbst (jsdom rechnet kein Layout). */
const css = () => readFileSync(resolve(__dirname, "premiumExpose.css"), "utf-8");
const rechnerCss = () => readFileSync(resolve(__dirname, "exposeRechner.css"), "utf-8");
/**
 * Deklarationen der ersten Regel mit genau diesem Selektor, die am Zeilenanfang
 * steht: die Grundregel, vor den Abweichungen für Handy und Druck.
 */
const regel = (text: string, selektor: string) =>
  text.match(new RegExp(`(?:^|\\n)${selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`))?.[1];
const leuchtdichte = (hex: string) => {
  const kanal = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * kanal[0] + 0.7152 * kanal[1] + 0.0722 * kanal[2];
};
const kontrast = (a: string, b: string) => {
  const [x, y] = [leuchtdichte(a), leuchtdichte(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe("Kopf bei jedem Exposé gleich: Bildband fester Höhe, Karte überlappt", () => {
  it("hält das Bildband auf fester Höhe, auch mit einem Hochformatbild", () => {
    const text = css();
    // Die Rasterzeile folgt der Höhe des Bandes statt der natürlichen Bildhöhe.
    expect(text).toContain(".premium-expose .photos{height:540px;grid-template-rows:minmax(0,1fr)}");
    // Das Bild füllt das Band, egal welches Seitenverhältnis.
    expect(text).toMatch(/\.premium-expose \.photos img\{width:100%;height:100%;object-fit:cover/);
    // Tablet und Handy kleiner, aber ebenso fest.
    expect(text).toContain("@media(max-width:1050px){.premium-expose .photos{height:420px}");
    expect(text).toContain("@media(max-width:800px){.premium-expose .photos{height:300px}");
    expect(text).toContain("@media(max-width:480px){.premium-expose .photos{height:240px}}");
  });

  it("zieht die Kopfkarte über die Unterkante des Bildes, nach den älteren Regeln", () => {
    const text = css();
    const neu = text.indexOf(".premium-expose .hero-card{margin:-80px 32px 0}");
    expect(neu).toBeGreaterThan(-1);
    // Die frühere Überlappung von 59 Pixel steht davor und wird damit überschrieben.
    expect(text.indexOf(".premium-expose .hero-card{margin:-59px 32px 0")).toBeLessThan(neu);
    expect(text).toContain(".premium-expose .hero-card{margin:-64px 17px 0}");
    expect(text).toContain(".premium-expose .hero-card{margin:-48px 8px 0}");
    // Im Druck steht die Karte unter dem Bild.
    expect(text).toContain("@media print{.premium-expose .hero-card{margin:12px 0 0}}");
  });

  it("baut den Kopf aus Bildband und Karte, die Karte mit Überschrift, Kennzahlen und Chips", () => {
    zeigen({ beschreibung: "Helle Wohnung im Erdgeschoss." });
    const kopf = screen.getByTestId("abschnitt-start");
    const [band, karte] = [kopf.querySelector(".photos"), kopf.querySelector(".hero-card")];
    expect(band).not.toBeNull();
    expect(karte).not.toBeNull();
    expect(band!.compareDocumentPosition(karte!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const id of ["kopf-ueberschrift", "kopf-ortszeile", "start-kennzahlen", "start-standort", "start-chips"]) {
      expect(karte!.contains(screen.getByTestId(id))).toBe(true);
    }
  });
});

describe("Beschreibung als eigener Textblock", () => {
  it("steht nicht mehr in der Kopfkarte, sondern direkt vor dem Investitionsstandort, mit Vermerk in der Quellenzeile", () => {
    zeigen({ beschreibung: "Helle Wohnung im Erdgeschoss eines gepflegten Hauses." });
    const block = screen.getByTestId("beschreibung-block");
    expect(screen.getByTestId("beschreibung")).toHaveTextContent("Helle Wohnung im Erdgeschoss eines gepflegten Hauses.");
    expect(block.closest(".hero-card")).toBeNull();
    expect(screen.getByTestId("abschnitt-start").querySelector(".hero-card [data-testid='beschreibung']")).toBeNull();
    // Nach der Karte, vor dem Standort, und dazwischen nichts anderes.
    const karte = screen.getByTestId("abschnitt-start").querySelector(".hero-card")!;
    expect(karte.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const standort = screen.getByTestId("abschnitt-standort");
    expect(block.compareDocumentPosition(standort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("abschnitt-start").nextElementSibling).toBe(standort);
    // Seit dem 24.09.2026 ohne Vermerk „Automatisch erstellt“, obwohl `get-expose` ihn als automatisch meldet.
    expect(screen.queryByTestId("beschreibung-hinweis")).not.toBeInTheDocument();
    expect(block).not.toHaveTextContent("Automatisch erstellt");
  });

  it("lässt den Block ohne Beschreibung weg", () => {
    zeigen();
    expect(screen.queryByTestId("beschreibung-block")).not.toBeInTheDocument();
  });
});

describe("Farben: kein Orange an Zahlen und Hervorhebungen", () => {
  it("vergibt im Exposé keine Akzentklasse mehr", () => {
    const { container } = zeigen({ beschreibung: "Text.", markt: ["Gefragter Arbeitsmarkt. Arbeitslosenquote 3,1 Prozent."] });
    expect(container.querySelectorAll("[class*='akzent']")).toHaveLength(0);
    // Die betonte Abschreibung ist blau hinterlegt, nicht orange.
    expect(screen.getByTestId("start-chips").querySelector(".chip-betont")).not.toBeNull();
  });

  it("nutzt die orangefarbenen Variablen in keiner Regel mehr, sie bleiben nur definiert", () => {
    const text = css();
    expect(text).not.toMatch(/var\(--akzent/);
    expect(text).toContain("--akzent:#BD550A");
    expect(rechnerCss()).not.toMatch(/akzent|#BD550A|#A34A08|189,\s*85,\s*10/i);
    // Kaufpreis und Rendite: Symbol blau, die Zahl erbt die dunkle Textfarbe.
    expect(regel(text, ".premium-expose .stat-preis .round,.premium-expose .stat-rendite .round")).toBe("background:var(--pale);color:#0466a9");
    expect(text).not.toMatch(/\.stat-preis strong|\.stat-rendite strong/);
  });

  it("hält bei den neuen blauen Hervorhebungen mindestens 4,5:1", () => {
    const text = css();
    const zahlung = regel(text, ".premium-expose .zeitplan-kasten.zahlung")!;
    const hinter = zahlung.match(/background:(#[0-9a-f]{6})/i)![1];
    const schrift = zahlung.match(/;color:(#[0-9a-f]{6})/i)![1];
    expect(kontrast(schrift, hinter)).toBeGreaterThanOrEqual(4.5);
    // Standortnummern und die betonte Abschreibung: #0466a9 auf dem hellen Blau --pale (#edf7fd).
    expect(kontrast("#0466a9", "#edf7fd")).toBeGreaterThanOrEqual(4.5);
    expect(regel(text, ".premium-expose .argument-nr")).toContain("background:var(--pale);color:#0466a9");
  });
});

describe("Besonderheiten und Merkmale als weiße Karten", () => {
  it("setzt beide Blöcke in eine Karte mit dem Rand und Schatten der übrigen Karten", () => {
    zeigen({ freitexte: ["Dach und Fassade wurden 2023 erneuert."] });
    for (const id of ["investagon-beschreibung", "investagon-merkmale"]) {
      const block = screen.getByTestId(id);
      const karte = block.querySelector(".expose-karte");
      expect(karte, id).not.toBeNull();
      // Die Überschrift steht über der Karte, der Inhalt und die Quelle in ihr.
      expect(karte!.querySelector("h3")).toBeNull();
      expect(karte!.querySelector(".quellenzeile")).toHaveTextContent("Quelle: Objektangaben des Anbieters.");
    }
    expect(screen.getByTestId("investagon-beschreibung").querySelector(".expose-karte .freitext")).toHaveTextContent("Dach und Fassade");
    expect(screen.getByTestId("investagon-merkmale").querySelector(".expose-karte .merkmal-liste")).not.toBeNull();
    const text = css();
    const karte = regel(text, ".premium-expose .expose-karte")!;
    const vorbild = regel(text, ".premium-expose .argument-zeile")!;
    expect(karte).toContain("background:#fff");
    for (const teil of ["border:1px solid #e5edf2", "border-radius:9px", "box-shadow:0 3px 12px #183c5603"]) {
      expect(karte).toContain(teil);
      expect(vorbild).toContain(teil);
    }
  });
});

describe("Quellenangaben einheitlich", () => {
  it("setzt jeden Quellen- und Herkunftsvermerk in dieselbe Klasse, keinen mehr als `caption`", () => {
    zeigen({
      beschreibung: "Helle Wohnung.",
      analyse: true,
      freitexte: ["Dach und Fassade wurden 2023 erneuert."],
      markt: ["Gefragter Arbeitsmarkt. Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026."],
    });
    for (const id of ["markt-quelle", "standort-quelle", "mikrolage-quelle"]) {
      expect(screen.getByTestId(id), id).toHaveClass("quellenzeile");
    }
    expect(screen.getByTestId("mikrolage-quelle")).toHaveTextContent("Entfernungen als Luftlinie");
    const vermerke = /^(Quelle:|Automatisch erstellt|Aus der Marktanalyse|Entfernungen als Luftlinie)/;
    const alle = Array.from(document.querySelectorAll(".premium-expose p"));
    const mitVermerk = alle.filter((p) => vermerke.test(text(p)));
    // Markt, Standort, Mikrolage, Besonderheiten, Merkmale. Beschreibung und
    // Standortargumente tragen seit dem 24.09.2026 keinen Vermerk „Automatisch erstellt“ mehr.
    expect(mitVermerk).toHaveLength(5);
    expect(document.querySelector(".premium-expose")).not.toHaveTextContent("Automatisch erstellt");
    expect(mitVermerk.every((p) => p.classList.contains("quellenzeile") && !p.classList.contains("caption"))).toBe(true);
  });

  it("definiert die Quellenzeile einmal, klein und gedämpft, lesbar auf hellem Grund", () => {
    const text = css();
    const zeile = regel(text, ".premium-expose .quellenzeile")!;
    expect(zeile).toContain("font-size:13px");
    const farbe = zeile.match(/color:(#[0-9a-f]{6})/i)![1];
    // Mindestens 4,5:1 auf dem hellgrauen Abschnitt und auf Weiß.
    expect(kontrast(farbe, "#f5f8fa")).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(farbe, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Keine ältere Regel für Absätze in den Freitexten überschreibt sie mehr (bis dahin 13 Pixel wie der Text).
    expect(text).not.toContain(".premium-expose .expose-freitexte p{");
    expect(regel(text, ".premium-expose .mikro-liste .mikro-quelle")).toBe("margin:18px 0 0");
  });
});

describe("Hinweis über dem Rechner", () => {
  it("sagt ohne eigenen Hinweis der Seite zentriert, dass hier nichts gespeichert wird", () => {
    zeigen();
    const satz = screen.getByTestId("rechner-hinweis");
    expect(satz).toHaveTextContent(RECHNER_HINWEIS_OHNE_SPEICHERN);
    expect(RECHNER_HINWEIS_OHNE_SPEICHERN).toBe("Die Regler sind zum Ausprobieren. Deine Einstellungen werden hier nicht gespeichert.");
    expect(satz).toHaveClass("rechner-hinweis-satz");
    expect(satz).toHaveClass("screen-only");
    // Er steht über dem Rechner.
    expect(satz.compareDocumentPosition(screen.getByTestId("expose-rechner")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(regel(css(), ".premium-expose .rechner-hinweis-satz,.premium-expose .rechner-hinweis [data-testid=\"speicher-status\"]")).toContain("text-align:center");
  });

  it("zentriert den mitgebrachten Speicherstand der internen Seite und doppelt ihn nicht", () => {
    zeigen({ rechnerHinweis: <p data-testid="speicher-status">Gespeichert am 23.09.26</p> });
    const status = screen.getByTestId("speicher-status");
    expect(status.closest(".rechner-hinweis")).not.toBeNull();
    expect(screen.queryByTestId("rechner-hinweis")).not.toBeInTheDocument();
  });

  it("verspricht keine Regler, wenn die Annahmen festgelegt sind", () => {
    zeigen({ gesperrt: true });
    expect(screen.queryByTestId("rechner-hinweis")).not.toBeInTheDocument();
  });
});

/*
 * Bis zum 23.09.2026 fiel der Abschnitt Mikrolage ohne gemessene Analyse ganz
 * weg, samt Karte und Kartenknopf im Kopf. Christian hielt die Karte für
 * gelöscht. Seitdem steht sie immer da, sobald die Adresse reicht.
 */
describe("Karte öffnen und Mikrolage", () => {
  it("steht mit Adresse auch ohne gemessene Analyse im Kopf und springt zum Abschnitt Mikrolage", () => {
    zeigen();
    const knopf = within(screen.getByTestId("start-kennzahlen")).getByRole("button", { name: /Karte öffnen/ });
    expect(knopf).toHaveAttribute("data-testid", "start-karte");
    expect(knopf.querySelector("strong")).toHaveTextContent("Karte öffnen");
    expect(knopf.querySelector("small")).toHaveTextContent("Lage und Umgebung");
    expect(knopf).not.toHaveTextContent("Karte anzeigen");
    // Aufbau wie die Kennzahl-Kacheln daneben, im Druck ausgeblendet.
    expect(knopf).toHaveClass("stat", "screen-only");
    expect(knopf.querySelector(".round svg")).not.toBeNull();
    const abschnitt = screen.getByTestId("abschnitt-mikrolage");
    const sprung = vi.fn();
    abschnitt.scrollIntoView = sprung;
    fireEvent.click(knopf);
    expect(sprung).toHaveBeenCalledTimes(1);
  });

  it("führt die Mikrolage wieder in der Abschnittsleiste und zählt sie mit", () => {
    zeigen();
    expect(screen.getByRole("navigation", { name: "Exposé-Abschnitte" }).querySelector("button[aria-label='Mikrolage']")).not.toBeNull();
    // Elf Abschnitte, ohne Grundriss (kein Plan) zehn.
    expect(screen.getByTestId("leiste-zaehler")).toHaveTextContent("1 / 10");
  });

  it("zeigt ohne Analyse mit gespeicherter Lage die Karte mit der Nadel des Objekts, rechts Adresse und Hinweis", () => {
    zeigen({ koordinaten: true });
    const [links, rechts] = Array.from(screen.getByTestId("mikrolage-aufbau").children);
    expect(links).toHaveAttribute("data-testid", "mikrolage-karte");
    expect(rechts).toHaveAttribute("data-testid", "mikrolage-ersatz");
    const feld = screen.getByTestId("mikrolage-karte-feld");
    expect(feld).toHaveAttribute("aria-label", "Karte der Umgebung von Söflinger Str. 203, 89077 Ulm");
    expect(feld.querySelectorAll(".leaflet-marker-icon")).toHaveLength(1);
    expect(screen.queryByTestId("mikrolage-karte-ersatz")).not.toBeInTheDocument();
    // Rechts keine leeren Listen, sondern Adresse und ein ruhiger Satz.
    expect(text(screen.getByTestId("mikrolage-adresse"))).toBe("Söflinger Str. 203, 89077 Ulm");
    expect(screen.getByTestId("mikrolage-ersatz-text")).toHaveTextContent("Die Auswertung der Umgebung liegt noch nicht vor.");
    for (const id of ["mikrolage-liste", "mikrolage-einkaufen", "mikrolage-freizeit", "mikrolage-infrastruktur", "mikrolage-quelle"]) {
      expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }
    expect(anfragen).toEqual([]);
  });

  it("zeigt ohne Analyse und ohne gespeicherte Lage keine Karte, sondern ruhig den Satz und den Weg zu OpenStreetMap", () => {
    zeigen();
    const ersatz = screen.getByTestId("mikrolage-karte-ersatz");
    expect(ersatz).toHaveTextContent("Die Karte zur Lage folgt.");
    const link = within(ersatz).getByRole("link", { name: "In OpenStreetMap ansehen" });
    expect(link.getAttribute("href")).toBe(`https://www.openstreetmap.org/search?query=${encodeURIComponent("Söflinger Str. 203, 89077 Ulm")}`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByTestId("mikrolage-karte-feld")).not.toBeInTheDocument();
    // Abschnitt und Knopf bleiben: Die Adresse ist da, nur die Karte folgt.
    expect(screen.getByTestId("start-karte")).toBeInTheDocument();
    expect(screen.getByTestId("mikrolage-adresse")).toHaveTextContent("Söflinger Str. 203, 89077 Ulm");
    // Kein Warnkasten, und niemand wurde gefragt.
    expect(screen.getByTestId("abschnitt-mikrolage").querySelector("[role='alert']")).toBeNull();
    expect(anfragen).toEqual([]);
  });

  it("nimmt mit Analyse und gespeicherter Lage den Mittelpunkt der Analyse", () => {
    zeigen({ analyse: true, koordinaten: true });
    expect(screen.getByTestId("mikrolage-liste")).toBeInTheDocument();
    expect(screen.queryByTestId("mikrolage-ersatz")).not.toBeInTheDocument();
    expect(screen.getByTestId("mikrolage-karte-feld").querySelectorAll(".leaflet-marker-icon").length).toBeGreaterThan(1);
  });

  it("bleibt mit gemessener Analyse wie bisher und fragt keinen Dienst", () => {
    zeigen({ analyse: true });
    const [links, rechts] = Array.from(screen.getByTestId("mikrolage-aufbau").children);
    expect(links).toHaveAttribute("data-testid", "mikrolage-karte");
    expect(rechts).toHaveAttribute("data-testid", "mikrolage-liste");
    expect(screen.getByTestId("mikrolage-karte-feld")).toBeInTheDocument();
    expect(screen.getByTestId("mikrolage-einkaufen")).toHaveTextContent("REWE");
    expect(screen.getByTestId("mikrolage-quelle")).toBeInTheDocument();
    expect(screen.queryByTestId("mikrolage-ersatz")).not.toBeInTheDocument();
    expect(screen.getByTestId("start-karte")).toHaveTextContent("Karte öffnen");
    expect(anfragen).toEqual([]);
  });

  it("fehlt ohne brauchbare Adresse ganz: kein leerer Kasten, kein Knopf, kein Eintrag in der Leiste", () => {
    for (const adresse of ["", "9a"]) {
      const { unmount } = zeigen({ adresse });
      expect(screen.queryByTestId("abschnitt-mikrolage"), adresse).not.toBeInTheDocument();
      expect(screen.queryByTestId("start-karte"), adresse).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Exposé-Abschnitte" }).querySelector("button[aria-label='Mikrolage']")).toBeNull();
      expect(screen.getByTestId("leiste-zaehler")).toHaveTextContent("1 / 9");
      unmount();
    }
    expect(anfragen).toEqual([]);
  });

  it("zeigt die Karte mit gespeicherter Lage auch ohne brauchbare Adresse", () => {
    zeigen({ adresse: "", koordinaten: true });
    expect(screen.getByTestId("mikrolage-karte-feld")).toBeInTheDocument();
    expect(screen.getByTestId("start-karte")).toBeInTheDocument();
  });

  it("gestaltet den Knopf wie eine Kennzahl, ohne eigene Farbe für die Beschriftung", () => {
    const text = css();
    expect(regel(text, ".premium-expose .stat-link")).toBe("border:0;background:transparent;padding:0;text-align:left;color:inherit");
    expect(text).not.toContain(".stat-link-text");
    expect(text).not.toMatch(/\.stat-link[^{]*\{[^}]*(akzent|#BD550A|orange)/i);
  });
});

describe("Investitionsstandort", () => {
  it("zeigt die fünf gepflegten Standortargumente nummeriert untereinander, nicht die Highlights des Standorts", () => {
    zeigen();
    const liste = screen.getByTestId("standort-argumente");
    expect(liste.tagName).toBe("OL");
    const punkte = Array.from(liste.querySelectorAll("li"));
    expect(punkte).toHaveLength(5);
    expect(punkte.map((li) => text(li.querySelector(".argument-nr")))).toEqual(["1", "2", "3", "4", "5"]);
    expect(text(punkte[0].querySelector("h3"))).toBe("Starker Wirtschaftsstandort");
    expect(text(liste)).not.toContain("Dieser Satz gehört nicht");
  });

  it("zeigt „Markt und Standort“ direkt nach den fünf Standortargumenten, mit Quellenzeile", () => {
    const markt = [
      "Gefragter Arbeitsmarkt. Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026.",
      "Wachsende Stadt. 130.000 Einwohner, Statistisches Landesamt, Stand 12/2025.",
      "Hochschulstandort. Rund 10.000 Studierende, Stadt Ulm, Stand 2025.",
    ];
    zeigen({ markt });
    const block = screen.getByTestId("markt-und-standort");
    expect(within(block).getByRole("heading", { name: "Markt und Standort" })).toBeInTheDocument();
    const punkte = Array.from(screen.getByTestId("markt-argumente").querySelectorAll("li"));
    expect(punkte.map((li) => text(li.querySelector("h3")))).toEqual(["Gefragter Arbeitsmarkt", "Wachsende Stadt", "Hochschulstandort"]);
    expect(text(punkte[0].querySelector("p"))).toBe("Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026.");
    // Symbol statt Nummer, damit niemand sie als sechstes bis achtes Standortargument liest.
    expect(punkte.every((li) => li.querySelector(".markt-symbol") && !li.querySelector(".argument-nr"))).toBe(true);
    expect(text(screen.getByTestId("markt-quelle"))).toBe("Aus der Marktanalyse, Quelle und Stand je Aussage.");
    // Reihenfolge: nach den Standortargumenten, vor den Arbeitgebern.
    const standortListe = screen.getByTestId("standort-argumente");
    expect(standortListe.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block.compareDocumentPosition(screen.getByTestId("standort-arbeitgeber")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lässt „Markt und Standort“ ohne Marktargumente weg", () => {
    zeigen();
    expect(screen.queryByTestId("markt-und-standort")).not.toBeInTheDocument();
    expect(screen.getByTestId("abschnitt-standort")).not.toHaveTextContent("Markt und Standort");
  });

  it("zeigt die Arbeitgeber als Liste, bei drei Einträgen ohne Loch", () => {
    zeigen();
    const liste = screen.getByTestId("standort-arbeitgeber");
    expect(liste.tagName).toBe("OL");
    expect(liste.querySelectorAll("li")).toHaveLength(3);
    expect(liste.querySelector(".grid")).toBeNull();
    expect(text(liste.querySelector("li"))).toContain("Universitätsklinikum Ulm");
    expect(text(liste.querySelector("li"))).toContain("8.000 Beschäftigte");
    // Die Quelle steht weiter klein darunter.
    expect(screen.getByTestId("abschnitt-standort")).toHaveTextContent("Quelle:");
  });
});

describe("Objektdaten, Schritte und Zeitstrahl", () => {
  it("zeigt Ausstattung und Merkmale immer untereinander als Liste", () => {
    zeigen();
    const block = screen.getByTestId("investagon-merkmale");
    const liste = block.querySelector("ul.merkmal-liste");
    expect(liste).not.toBeNull();
    expect(liste!.querySelectorAll("li")).toHaveLength(2);
    expect(block.querySelector(".services")).toBeNull();
  });

  it("hakt die Beratung im Zeitplan als erledigt ab, die Stationen bleiben nummeriert", () => {
    zeigen();
    const beratung = screen.getByTestId("zeitplan-erledigt");
    expect(beratung).toHaveClass("erledigt");
    expect(text(beratung.querySelector("h3"))).toBe("Beratung");
    expect(beratung).toHaveTextContent("Erledigt");
    expect(text(beratung.querySelector(".zeitplan-nr"))).toBe("");
    expect(beratung.querySelector(".zeitplan-nr svg")).not.toBeNull();
    expect(text(screen.getByTestId("zeitplan-station-1").querySelector(".zeitplan-nr"))).toBe("1");
  });

  it("führt Nächste Schritte und Zeitplan zusammen: ein Abschnitt, je Station Kasten und Erklärung", () => {
    zeigen();
    expect(screen.queryByTestId("abschnitt-naechste-schritte")).toBeNull();
    const abschnitt = screen.getByTestId("abschnitt-zeitplan");
    expect(text(abschnitt.querySelector(".section-head h2"))).toBe("Nächste Schritte und Zeitplan");
    expect(text(abschnitt.querySelector(".section-head span"))).toBe("Der Weg zum Eigentum");
    const plan = screen.getByTestId("zeitplan");
    expect(Array.from(plan.querySelectorAll("h3")).map((h) => text(h))).toEqual([
      "Beratung", "Reservierung", "Finanzierung", "Beantragung Kaufvertrag beim Notariat", "Notartermin", "Kaufpreisfälligkeit", "Übergabe an die Verwaltung",
    ]);
    expect(Array.from(plan.querySelectorAll(".zeitplan-kasten.zahlung")).map((k) => text(k))).toEqual(["Mit Anzahlung wirksam", "nach Regelung im Kaufvertrag"]);
    // Jede Station trägt ihre Erklärung, der Notar-Text ist auf Beantragung und Termin verteilt.
    expect(plan.querySelectorAll("[data-testid^='zeitplan-station-'] .zeitplan-text")).toHaveLength(6);
    expect(text(screen.getByTestId("zeitplan-station-3").querySelector(".zeitplan-text"))).toBe("Der Kaufvertrag geht dir vorab zu, wir besprechen ihn Punkt für Punkt.");
    expect(text(screen.getByTestId("zeitplan-station-4").querySelector(".zeitplan-text"))).toBe("Beurkundet wird beim Notar, vor Ort oder per Vollmacht.");
    expect(text(plan)).not.toMatch(/[–—]|\d ?- ?\d/);
  });
});

describe("Kontakt: Terminknopf", () => {
  it("setzt helle Schrift auf dunklem Blau, auch gegen die Linkregel des Exposés", () => {
    zeigen();
    const knopf = screen.getByTestId("kontakt-termin");
    expect(knopf).toHaveClass("kontakt-termin");
    expect(knopf).toHaveClass("text-white");
    expect(knopf).not.toHaveClass("text-primary-foreground");
    expect(knopf).toHaveAttribute("href", "https://cal.example/paula");
  });

  it("hat im Exposé-CSS eine Regel mit mindestens 4,5:1, die stärker ist als `.premium-expose a`", () => {
    const css = readFileSync(resolve(__dirname, "premiumExpose.css"), "utf-8");
    const regel = css.match(/\.premium-expose a\.kontakt-termin[^{]*\{([^}]*)\}/);
    expect(regel).not.toBeNull();
    const hinter = regel![1].match(/background:(#[0-9a-fA-F]{6})/)?.[1];
    const schrift = regel![1].match(/color:(#[0-9a-fA-F]{3,6})/)?.[1];
    expect(hinter).toBeDefined();
    expect(schrift).toBe("#fff");
    const lum = (hex: string) => {
      const kanal = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * kanal[0] + 0.7152 * kanal[1] + 0.0722 * kanal[2];
    };
    const kontrast = (1 + 0.05) / (lum(hinter!) + 0.05);
    expect(kontrast).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Druck", () => {
  it("blendet im Druck alles außerhalb des Exposés und die Bedienelemente aus, A4 hoch", () => {
    const css = readFileSync(resolve(__dirname, "premiumExpose.css"), "utf-8");
    expect(css).toMatch(/@page\{size:A4/);
    expect(css).toContain("body:has(.premium-expose) *:not(:has(.premium-expose)):not(.premium-expose):not(.premium-expose *){display:none!important}");
    expect(css).toContain(".premium-expose .mikro-karte{display:none!important}");
    expect(css).toMatch(/print-color-adjust:exact/);
  });

  it("zeigt Telefon und E-Mail des Partners für den Druck als Text", () => {
    zeigen();
    const kontakt = screen.getByTestId("abschnitt-kontakt");
    expect(kontakt.querySelector(".print-only")).toHaveTextContent("+49 89 123 · paula@example.com");
  });
});

/*
 * Wächter „kein Geodienst“ (Christian, 23.09.2026): Im Exposé, im Kundenlink
 * und in der Kundenansicht fragt der Browser des Besuchers keinen Dienst nach
 * einer Adresse. Sonst ginge seine IP-Adresse an Komoot oder Nominatim. Die
 * Lage kommt aus gespeicherten Daten (`meta.standortanalyse`,
 * `meta.koordinaten`), geladen werden nur die Kartenbilder von OpenStreetMap.
 */
describe("kein Geodienst im Browser des Besuchers", () => {
  const wurzel = resolve(__dirname, "../../..");
  const quellen = (ordner: string) =>
    (readdirSync(resolve(wurzel, ordner)) as string[])
      .filter((d) => /\.tsx?$/.test(d) && !/\.test\.tsx?$/.test(d))
      .map((d) => `${ordner}/${d}`);
  const dateien = [
    ...quellen("src/components/expose"),
    ...quellen("src/components/kundenansicht"),
    "src/pages/ExposePublic.tsx", "src/pages/KundenansichtPublic.tsx", "src/pages/KundenansichtObjekt.tsx",
    "src/pages/KundenansichtWohnung.tsx", "src/pages/KundenansichtVorschau.tsx",
    "src/lib/exposeInhalt.ts", "src/lib/exposePublicDaten.ts", "src/lib/kundenansichtDaten.ts", "src/lib/standortanalyse.ts",
  ];

  it("enthält keine Adresse eines Geodienstes und ruft keine Adresssuche auf", () => {
    expect(dateien.length).toBeGreaterThan(20);
    for (const datei of dateien) {
      const code = readFileSync(resolve(wurzel, datei), "utf-8");
      expect(code, datei).not.toMatch(/photon\.komoot|komoot\.io|nominatim|geocode\.|api\.mapbox|maps\.googleapis/i);
      expect(code, datei).not.toMatch(/\b(geocode|findeAdresse|geokodiere|messeStandort|lageDerAdresse)\s*\(/);
    }
  });

  it("fragt beim Aufbau ohne Analyse und ohne gespeicherte Lage niemanden", () => {
    zeigen();
    zeigen({ koordinaten: true });
    expect(anfragen).toEqual([]);
  });
});

describe("Karte auf dem Handy", () => {
  it("gibt den Zoomknöpfen mindestens 40 px Tippfläche, stärker als Leaflets 30 px", () => {
    const text = css();
    const block = text.match(/@media\(max-width:800px\)\{\.premium-expose \.mikro-karte \.leaflet-bar a\{([^}]*)\}\}/)?.[1] ?? "";
    expect(block).toContain("width:40px");
    expect(block).toContain("height:40px");
    expect(block).toContain("line-height:40px");
  });
});
