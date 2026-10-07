/**
 * Die Strecke des AfA-Rechners.
 *
 * Hier stehen die Antworten und die Regeln darueber, welche Frage wann kommt
 * und welche entfaellt. Nicht aber die Rechnung: Gerechnet wird ausschliesslich
 * in `afaRechnung.ts`. Diese Datei uebersetzt nur die Antworten in dessen
 * Eingaben. Das Vorbild ist `steuerrechnerStrecke.ts`.
 *
 * Warum eine eigene Datei und nicht alles in der Komponente: Die Reihenfolge
 * der Ansichten, die Verzweigung und die Uebersetzung in den Rechenkern sind
 * pruefbare Regeln. In einer Komponente waeren sie es nicht.
 */
import {
  createDefaultModZeitraeume,
  migrateObjektart,
  nebenkostenBetrag,
  nebenkostensatzFuerBundesland,
  type AfaEingaben,
} from "@/lib/afaRechnung";
import { gndFuerObjektart } from "@/lib/restnutzungsdauer";

/* ── Was fuer ein Objekt? ───────────────────────────────────────────────── */

/**
 * Die erste Frage, und die einzige, die den weiteren Weg aendert.
 *
 * Ein Neubau kann nicht kernsaniert sein, und anschaffungsnahe
 * Herstellungskosten nach § 6 Abs. 1 Nr. 1a EStG gibt es bei ihm nicht: Die
 * Vorschrift setzt die Anschaffung eines bestehenden Gebaeudes voraus. Deshalb
 * entfaellt beim Neubau der ganze Schritt zur Sanierung, statt ihn leer
 * anzuzeigen.
 */
export type Gebaeudeart = "bestand" | "neubau" | "denkmal";

export interface GebaeudeartWahl {
  id: Gebaeudeart;
  titel: string;
  unterzeile: string;
}

export const GEBAEUDEARTEN: GebaeudeartWahl[] = [
  {
    id: "bestand",
    titel: "Bestandsimmobilie",
    unterzeile: "Ein gebrauchtes Gebäude, gekauft wie es steht.",
  },
  {
    id: "neubau",
    titel: "Neubau",
    unterzeile: "Fertigstellung ab 2023, damit drei Prozent lineare AfA.",
  },
  {
    id: "denkmal",
    titel: "Denkmal oder Sanierungsgebiet",
    unterzeile: "Der Sanierungsanteil wird gesondert abgeschrieben, § 7i und § 7h EStG.",
  },
];

export function gebaeudeartTitel(id: Gebaeudeart | null): string {
  return GEBAEUDEARTEN.find((g) => g.id === id)?.titel ?? "";
}

/* ── Der Grundstuecksanteil ─────────────────────────────────────────────── */

/**
 * Anhaltspunkte fuer den Grundstuecksanteil.
 *
 * Das ist der Wert, an dem die ganze Rechnung haengt: Was Boden ist, wird nicht
 * abgeschrieben. Ein zu niedriger Ansatz vergroessert den Gebaeudeanteil und
 * damit die ausgewiesene AfA. Die Spannen sind Erfahrungswerte und ersetzen
 * weder die Kaufpreisaufteilung im Notarvertrag noch die Arbeitshilfe des
 * Bundesfinanzministeriums.
 */
export const BODENANTEIL_ANHALT: { lage: string; spanne: string; vorschlag: number }[] = [
  { lage: "Eigentumswohnung, einfache Lage", spanne: "10 bis 20 %", vorschlag: 15 },
  { lage: "Eigentumswohnung, mittlere Lage", spanne: "20 bis 30 %", vorschlag: 25 },
  { lage: "Eigentumswohnung, gefragte Lage", spanne: "30 bis 50 %", vorschlag: 35 },
  { lage: "Haus mit eigenem Grundstück", spanne: "30 bis 60 %", vorschlag: 40 },
];

/* ── Die Antworten ──────────────────────────────────────────────────────── */

export interface AfaAntworten {
  /** `null` heisst: noch nicht beantwortet. Es gibt bewusst keine Vorbelegung. */
  gebaeudeart: Gebaeudeart | null;
  /** Label aus OBJEKTART_GND, bestimmt die Gesamtnutzungsdauer. */
  objektart: string;
  baujahr: number;
  kaufpreis: number;
  /** Nur fuer den Quadratmeterpreis und die Pruefung nach § 7b EStG. */
  wohnflaeche: number;
  /** Anschrift, nur zur Zuordnung. Die PLZ leitet zusaetzlich das Bundesland ab. */
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  bundesland: string;
  /** Nebenkostensatz in Prozent. `null` heisst: der Satz des Bundeslands gilt. */
  nebenkostenPct: number | null;
  /** Nebenkosten in Euro. `null` heisst: aus dem Satz gerechnet. */
  nebenkostenManuell: number | null;
  bodenAnteilPct: number;
  /** Miteigentumsanteil in Promille. Nur zur Herleitung des Bodenwerts. */
  miteigentumsanteil: number;
  kernsaniert: boolean;
  kernsanierungJahr?: number;
  kernsanierungUmfang: string;
  /** Erhaltungsaufwand gesamt in Euro. */
  erhaltungsaufwand: number;
  /** Verteilung nach § 82b EStDV, ein bis fuenf Jahre. */
  erhaltungsaufwandJahre: number;
  gutachtenVorhanden: boolean;
  rndManuell: number;
  afaSatzManuell: number;
  gutachterQuelle: string;
  /**
   * Wurde ueberhaupt modernisiert?
   *
   * Der Schalter steht vor den acht Einzelangaben. Solange er aus ist, gilt die
   * Voreinstellung und die Rechnung faellt aus wie ohne jede Modernisierung.
   * Acht Auswahlfelder auf einmal waeren sonst die groesste Huerde der Strecke.
   */
  modernisiert: boolean;
  /** Die acht Modernisierungselemente nach Anlage 2 ImmoWertV. */
  modZeitraeume: Record<string, string>;
  /** Nur fuer den Ueberschlag der Steuerwirkung, nicht fuer die AfA selbst. */
  grenzsteuersatz: number;
  /** Sanierungsanteil beim Denkmal, nur fuer die Modellvergleiche. */
  denkmalSanierungsanteil: number;
}

/** Was ein aufrufendes Objekt vorbelegen darf. */
export interface AfaVorbelegung {
  kaufpreis?: number;
  baujahr?: number;
  wohnflaeche?: number;
  erhaltungsaufwand?: number;
  bundesland?: string;
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
}

export function standardAntworten(vor: AfaVorbelegung = {}): AfaAntworten {
  return {
    gebaeudeart: null,
    objektart: "Eigentumswohnung (ETW)",
    baujahr: vor.baujahr && vor.baujahr > 0 ? vor.baujahr : 0,
    kaufpreis: vor.kaufpreis && vor.kaufpreis > 0 ? vor.kaufpreis : 0,
    wohnflaeche: vor.wohnflaeche && vor.wohnflaeche > 0 ? Math.round(vor.wohnflaeche * 100) / 100 : 0,
    strasse: vor.strasse || "",
    hausnummer: vor.hausnummer || "",
    plz: vor.plz || "",
    ort: vor.ort || "",
    bundesland: vor.bundesland || "andere",
    nebenkostenPct: null,
    nebenkostenManuell: null,
    // 20 Prozent ist der Wert, mit dem der Rechner bisher gestartet ist.
    bodenAnteilPct: 20,
    // 1000 Promille, also das ganze Haus. Derselbe Startwert wie in der Maske.
    miteigentumsanteil: 1000,
    kernsaniert: false,
    kernsanierungJahr: undefined,
    kernsanierungUmfang: "",
    erhaltungsaufwand: vor.erhaltungsaufwand && vor.erhaltungsaufwand > 0 ? vor.erhaltungsaufwand : 0,
    erhaltungsaufwandJahre: 1,
    gutachtenVorhanden: false,
    rndManuell: 0,
    afaSatzManuell: 0,
    gutachterQuelle: "",
    modernisiert: false,
    modZeitraeume: createDefaultModZeitraeume(),
    grenzsteuersatz: 42,
    denkmalSanierungsanteil: 0,
  };
}

/* ── Abgeleitete Werte ──────────────────────────────────────────────────── */

/** Der angesetzte Nebenkostensatz in Prozent. */
export function nebenkostensatz(a: AfaAntworten): number {
  if (a.nebenkostenPct !== null && a.nebenkostenPct > 0) return a.nebenkostenPct;
  return nebenkostensatzFuerBundesland(a.bundesland);
}

/** Die angesetzten Kaufnebenkosten in Euro. */
export function nebenkosten(a: AfaAntworten): number {
  if (a.nebenkostenManuell !== null && a.nebenkostenManuell >= 0) return a.nebenkostenManuell;
  return nebenkostenBetrag(a.kaufpreis, nebenkostensatz(a));
}

/** Kaufpreis je Quadratmeter Wohnflaeche, 0 ohne Flaeche. */
export function quadratmeterpreis(a: AfaAntworten): number {
  if (!(a.wohnflaeche > 0)) return 0;
  return Math.round((a.kaufpreis / a.wohnflaeche) * 100) / 100;
}

/** Uebersetzt die Antworten in die Eingaben des Rechenkerns. */
export function zuEingaben(a: AfaAntworten): AfaEingaben {
  return {
    objektart: migrateObjektart(a.objektart),
    kaufpreis: Math.max(0, a.kaufpreis),
    nebenkosten: nebenkosten(a),
    bodenAnteilPct: a.bodenAnteilPct,
    sanierungskosten: Math.max(0, a.erhaltungsaufwand),
    baujahr: a.baujahr,
    // Ohne den Schalter gilt die Voreinstellung. Damit rechnet die Strecke
    // genauso wie vor dem Einbau dieser Frage, solange niemand etwas eintraegt.
    modZeitraeume: a.modernisiert ? a.modZeitraeume : createDefaultModZeitraeume(),
    kernsanierungAktiv: a.kernsaniert,
    kernsanierungJahr: a.kernsanierungJahr,
    afaModus: a.gutachtenVorhanden ? "gutachten" : "berechnen",
    afaSatzManuell: a.afaSatzManuell,
    rndManuell: a.rndManuell,
  };
}

/* ── Die Ansichten ──────────────────────────────────────────────────────── */

export type AfaSchrittId =
  | "objekt"
  | "preis"
  | "lage"
  | "grundstueck"
  | "sanierung"
  | "modernisierung"
  | "gutachten";

export const ALLE_SCHRITTE: AfaSchrittId[] = [
  "objekt",
  "preis",
  "lage",
  "grundstueck",
  "sanierung",
  "modernisierung",
  "gutachten",
];

/**
 * Kleinste Schwelle der Tabelle 3 in Anlage 2 ImmoWertV.
 *
 * Unterhalb dieses relativen Gebaeudealters gilt in JEDER Punktezeile schlicht
 * Gesamtnutzungsdauer minus Alter. Modernisierungen aendern dann nichts, egal
 * wie viele Punkte zusammenkommen.
 */
const KLEINSTE_SCHWELLE_PROZENT = 10;

/**
 * Wirkt sich die Modernisierungsbewertung ueberhaupt aus?
 *
 * Drei Gruende, aus denen die Frage sinnlos waere:
 *   1. Ohne Baujahr gibt es kein Gebaeudealter und damit keine Schwelle.
 *   2. Bei einem jungen Gebaeude liegt das relative Alter unter jeder Schwelle
 *      der Tabelle 3. Dann gilt Gesamtnutzungsdauer minus Alter, die Punkte
 *      bleiben ohne Folge. Bei einem Neubau ist das immer so.
 *   3. Eine Kernsanierung der letzten fuenf Jahre hebt die Punkte ohnehin auf
 *      das Hoechstmass. Mehr als voll geht nicht.
 */
export function modernisierungWirkt(a: AfaAntworten, stichjahr = new Date().getFullYear()): boolean {
  if (a.gebaeudeart === "neubau") return false;
  const effektivesBaujahr = a.kernsaniert && a.kernsanierungJahr ? a.kernsanierungJahr : a.baujahr;
  if (!effektivesBaujahr || effektivesBaujahr <= 1000 || effektivesBaujahr > stichjahr) return false;
  if (a.kernsaniert && a.kernsanierungJahr && stichjahr - a.kernsanierungJahr < 5) return false;
  const alter = Math.max(0, stichjahr - effektivesBaujahr);
  const relativesAlter = (alter / gndFuerObjektart(migrateObjektart(a.objektart))) * 100;
  return relativesAlter >= KLEINSTE_SCHWELLE_PROZENT;
}

/**
 * Aus welchen Ansichten besteht die Strecke, in dieser Reihenfolge?
 *
 * Zwei Schritte koennen entfallen. Der Grundsatz dahinter ist derselbe wie beim
 * Steuerrechner: Was nicht ausgewertet wird, wird auch nicht gefragt.
 *
 * Die Sanierung entfaellt beim Neubau. Er kann nicht kernsaniert sein, und die
 * 15-Prozent-Grenze des § 6 Abs. 1 Nr. 1a EStG setzt die Anschaffung eines
 * bestehenden Gebaeudes voraus.
 *
 * Die Modernisierung entfaellt, wenn sie an der Restnutzungsdauer nichts
 * aendern kann, siehe `modernisierungWirkt`.
 */
export function schritte(a: AfaAntworten): AfaSchrittId[] {
  return ALLE_SCHRITTE.filter((s) => {
    if (s === "sanierung") return a.gebaeudeart !== "neubau";
    if (s === "modernisierung") return modernisierungWirkt(a);
    return true;
  });
}

/** Wird im Sanierungsschritt ueberhaupt nach einer Kernsanierung gefragt? */
export function fragtNachKernsanierung(a: AfaAntworten): boolean {
  return a.gebaeudeart !== "neubau";
}

/** Ist die Ansicht beantwortet, darf es also weitergehen? */
export function schrittBeantwortet(schritt: AfaSchrittId, a: AfaAntworten): boolean {
  switch (schritt) {
    case "objekt":
      // Ohne Baujahr gibt es kein Gebaeudealter und damit keine
      // Restnutzungsdauer. Weiterzugehen haette hier keinen Sinn.
      return a.gebaeudeart !== null && a.baujahr > 0;
    case "preis":
      return a.kaufpreis > 0;
    case "lage":
      // "Anderes / unbekannt" ist eine gueltige Antwort, dann stehen die
      // Nebenkosten bei null und der Nutzer traegt sie selbst ein.
      return true;
    case "grundstueck":
      return a.bodenAnteilPct > 0;
    case "sanierung":
      // Nein fuehrt weiter. Ja braucht das Jahr, sonst wirkt der Schalter nicht.
      return !a.kernsaniert || !!(a.kernsanierungJahr && a.kernsanierungJahr > 0);
    case "modernisierung":
      // Nichts modernisiert ist eine gueltige Antwort und der Startwert.
      return true;
    case "gutachten":
      return !a.gutachtenVorhanden || a.rndManuell > 0 || a.afaSatzManuell > 0;
    default:
      return true;
  }
}

/** Ist die ganze Strecke beantwortet? */
export function streckeVollstaendig(a: AfaAntworten): boolean {
  return schritte(a).every((s) => schrittBeantwortet(s, a));
}

/* ── Wo wird welche Angabe gefragt? ─────────────────────────────────────── */

/**
 * Die Merkliste, an der `afaStrecke.test.ts` prueft, dass nichts durchrutscht.
 *
 * Vorgeschichte: Beim Umbau von der Maske auf die Strecke sind die acht
 * Modernisierungselemente stillschweigend aus den Fragen verschwunden und nur
 * noch auf der Ergebnisseite gelandet. Wer sie nicht sieht, fuellt sie nicht
 * aus und bekommt ohne Warnung das Ergebnis fuer ein unmodernisiertes Gebaeude.
 *
 * Damit das nicht wieder geschieht, steht hier zu JEDER Antwort, in welchem
 * Schritt sie gefragt wird. `"ergebnis"` heisst: nur auf der Ergebnisseite. Das
 * ist ausschliesslich fuer Angaben zulaessig, die nicht in `berechneAfa`
 * eingehen. Der Test erzwingt beides: die Vollstaendigkeit dieser Liste (durch
 * den Record-Typ schon der Uebersetzer) und die Regel zu `"ergebnis"`.
 */
export const ANGABE_IM_SCHRITT: Record<keyof AfaAntworten, AfaSchrittId | "ergebnis"> = {
  gebaeudeart: "objekt",
  objektart: "objekt",
  baujahr: "objekt",
  kaufpreis: "preis",
  wohnflaeche: "preis",
  strasse: "lage",
  hausnummer: "lage",
  plz: "lage",
  ort: "lage",
  bundesland: "lage",
  nebenkostenPct: "lage",
  nebenkostenManuell: "lage",
  bodenAnteilPct: "grundstueck",
  miteigentumsanteil: "grundstueck",
  kernsaniert: "sanierung",
  kernsanierungJahr: "sanierung",
  kernsanierungUmfang: "sanierung",
  erhaltungsaufwand: "sanierung",
  erhaltungsaufwandJahre: "sanierung",
  denkmalSanierungsanteil: "sanierung",
  modernisiert: "modernisierung",
  modZeitraeume: "modernisierung",
  gutachtenVorhanden: "gutachten",
  rndManuell: "gutachten",
  afaSatzManuell: "gutachten",
  gutachterQuelle: "gutachten",
  // Der Grenzsteuersatz geht nicht in die Abschreibung ein, er multipliziert
  // nur das Ergebnis. Deshalb steht er allein auf der Ergebnisseite.
  grenzsteuersatz: "ergebnis",
};

/**
 * Woraus speist sich jede Eingabe des Rechenkerns?
 *
 * Der Uebersetzer haelt diese Liste vollstaendig, weil sie jeden Schluessel von
 * `AfaEingaben` verlangt. Der Test verbindet sie mit `ANGABE_IM_SCHRITT` und
 * stellt damit sicher: Was gerechnet wird, wird auch gefragt.
 */
export const RECHNUNG_AUS_ANGABE: Record<Exclude<keyof AfaEingaben, "stichjahr">, (keyof AfaAntworten)[]> = {
  objektart: ["objektart"],
  kaufpreis: ["kaufpreis"],
  nebenkosten: ["kaufpreis", "bundesland", "nebenkostenPct", "nebenkostenManuell"],
  bodenAnteilPct: ["bodenAnteilPct"],
  sanierungskosten: ["erhaltungsaufwand"],
  baujahr: ["baujahr"],
  modZeitraeume: ["modernisiert", "modZeitraeume"],
  kernsanierungAktiv: ["kernsaniert"],
  kernsanierungJahr: ["kernsanierungJahr"],
  afaModus: ["gutachtenVorhanden"],
  afaSatzManuell: ["afaSatzManuell"],
  rndManuell: ["rndManuell"],
};
