/**
 * Rechenkern für den Steuer- & Eignungscheck.
 *
 * Eingabe ist das JAHRESBRUTTO. Früher war es das Jahresnetto, aus dem per
 * Intervallhalbierung ein passendes Brutto gesucht wurde. Das war zwar sauber
 * gerechnet, löste aber ein Problem, das die Frage selbst erzeugt hat: Jeder
 * kennt sein Bruttogehalt, kaum jemand sein Jahresnetto auf den Euro. Wich die
 * echte Abrechnung vom Modell ab (andere Krankenkasse, betriebliche
 * Altersvorsorge, Freibeträge, Nebeneinkünfte), landete der Rechner beim
 * falschen Brutto und damit beim falschen Grenzsteuersatz.
 *
 * Der Tarif, die Abschreibungssätze und die Kaufnebenkosten kommen aus den
 * zentralen Modulen und werden hier nicht noch einmal eingetippt:
 *   src/lib/einkommensteuer.ts   § 32a EStG, Soli
 *   src/lib/afaSaetze.ts         § 7 Abs. 4, § 7 Abs. 5a, § 7b EStG
 *   src/lib/grunderwerbsteuer.ts Grunderwerbsteuer je Bundesland
 *
 * Alle übrigen Sätze sind Stand 2026 und gehören einmal jährlich geprüft.
 */

import {
  grenzsteuersatzProzent,
  solidaritaetszuschlag,
  tariflicheEst,
  type Steuerjahr,
  type Veranlagung,
} from "@/lib/einkommensteuer";
import {
  ANSCHAFFUNGSNAH_GRENZE,
  BEWEGLICH_NUTZUNGSDAUER,
  DEGRESSIV_SATZ,
  SONDER_7B_JAHRE,
  SONDER_7B_SATZ,
  linearerAfaSatz,
} from "@/lib/afaSaetze";
import { kaufnebenkostenProzent } from "@/lib/grunderwerbsteuer";
import { SOLLZINS, tilgungsplan } from "@/lib/finanzierung";

/* ────────────────────────────────────────────────────────────────────────
 * GESETZLICHE WERTE — Stand 2026, einmal jährlich prüfen.
 * Geprüft am 26.07.2026 gegen Bundesregierung (Beitragsbemessungsgrenzen)
 * und veröffentlichte Tarifeckwerte 2026.
 * ──────────────────────────────────────────────────────────────────────── */

/** Steuerjahr, für das dieser Rechner ausgelegt ist. */
const STEUERJAHR: Steuerjahr = 2026;

/* Sozialversicherung, Arbeitnehmeranteil */
const BBG_RENTE = 101400; // Renten- und Arbeitslosenversicherung, 8.450 €/Monat
const BBG_KRANKEN = 69750; // Kranken- und Pflegeversicherung, 5.812,50 €/Monat
const SATZ_RENTE = 0.093;
const SATZ_ARBEITSLOS = 0.013;
const SATZ_KRANKEN = 0.073 + 0.0145; // hälftiger Beitrag plus durchschnittlicher Zusatzbeitrag
const SATZ_PFLEGE = 0.018;
const ZUSCHLAG_KINDERLOS = 0.006;

/* Pauschalen & Freibeträge */
const WERBUNGSKOSTEN_PAUSCHALE = 1230;
const SONDERAUSGABEN_PAUSCHALE = 36;
/**
 * Kinderfreibetrag je Kind, beide Elternteile zusammen.
 *
 * 2026 setzt er sich zusammen aus dem Freibetrag für das sächliche
 * Existenzminimum von 3.414 Euro je Elternteil und dem Freibetrag für
 * Betreuung, Erziehung und Ausbildung (BEA) von unverändert 1.464 Euro je
 * Elternteil. Je Elternteil also 4.878 Euro, zusammen 9.756 Euro
 * (§ 32 Abs. 6 EStG in der Fassung des Steuerfortentwicklungsgesetzes).
 * 2025 waren es noch 3.336 + 1.464 = 4.800 je Elternteil, zusammen 9.600.
 */
export const FREIBETRAG_KIND = 9756;
/** Entlastungsbetrag für Alleinerziehende, § 24b EStG (Steuerklasse II). */
const ENTLASTUNG_ALLEINERZIEHEND = 4260;
/** Erhöhungsbetrag je weiterem Kind, § 24b Abs. 2 Satz 2 EStG. */
const ENTLASTUNG_JE_WEITEREM_KIND = 240;

export type Steuerklasse = "I" | "II" | "III" | "IV" | "V";
export type Hebelziel = "maximal" | "ausgewogen" | "vorsichtig";

/* ── Beschäftigungsverhältnis ──────────────────────────────────────────────
 * Auf die Einkommensteuer hat es keinen Einfluss: Der Tarif nach § 32a EStG
 * kennt keine Einkunftsart, ein Euro zu versteuerndes Einkommen kostet den
 * Beamten genauso viel wie den Selbstständigen. Deshalb ändert es die
 * Steuerzahlen dieses Rechners bewusst NICHT.
 *
 * Es entscheidet aber darüber, welches Objekt überhaupt finanzierbar ist, und
 * das ist die Frage, an der ein Kauf tatsächlich scheitert. Banken rechnen mit
 * dem Einkommen, das sie anerkennen, nicht mit dem, das auf der Abrechnung
 * steht: Beim Selbstständigen mitteln sie den Gewinn aus zwei bis drei Jahren
 * und bewerten ihn vorsichtig, beim Beamten geben sie längere Laufzeiten und
 * günstigere Zinsen.
 *
 * Genau das bildet `anerkennung` ab, und nur das. Es ist eine dokumentierte
 * Annahme über die Bankpraxis, keine Messung. Die Oberfläche nennt den Faktor
 * und das daraus anerkannte Einkommen deshalb offen.
 */
export type BeschaeftigungId =
  | "angestellt"
  | "freiberuflich"
  | "selbststaendig"
  | "gmbh_gf"
  | "beamter";

export interface Beschaeftigung {
  id: BeschaeftigungId;
  titel: string;
  unterzeile: string;
  /** Anteil des Bruttoeinkommens, den eine Bank erfahrungsgemäß anerkennt. */
  anerkennung: number;
  /** Wie die Bank dieses Einkommen sieht, ein Satz für die Ergebnisseite. */
  einschaetzung: string;
  /** Was zusätzlich zu den üblichen Nachweisen verlangt wird. */
  unterlagen: string;
}

export const BESCHAEFTIGUNGEN: Record<BeschaeftigungId, Beschaeftigung> = {
  angestellt: {
    id: "angestellt",
    titel: "Angestellt, unbefristet",
    unterzeile: "Festes Arbeitsverhältnis ohne Befristung.",
    anerkennung: 1,
    einschaetzung:
      "Dein Einkommen gilt als sicher. Es ist der Normalfall, an dem Banken ihre Konditionen ausrichten.",
    unterlagen: "Die letzten drei Gehaltsabrechnungen und der Arbeitsvertrag genügen in der Regel.",
  },
  freiberuflich: {
    id: "freiberuflich",
    titel: "Freiberuflich",
    unterzeile: "Etwa Arzt, Anwalt, Berater oder Ingenieur.",
    anerkennung: 0.85,
    einschaetzung:
      "Banken mitteln deinen Gewinn aus mehreren Jahren. Schwache Jahre ziehen den Schnitt nach unten, deshalb wird vorsichtiger gerechnet als beim Angestellten.",
    unterlagen:
      "Einnahmenüberschussrechnungen und Steuerbescheide der letzten zwei bis drei Jahre, dazu die aktuelle betriebswirtschaftliche Auswertung.",
  },
  selbststaendig: {
    id: "selbststaendig",
    titel: "Selbstständig",
    unterzeile: "Gewerbe oder Einzelunternehmen.",
    anerkennung: 0.8,
    einschaetzung:
      "Banken sehen hier das größte Schwankungsrisiko. Sie erkennen einen Teil des Gewinns nicht an und verlangen häufig mehr Eigenkapital.",
    unterlagen:
      "Bilanzen oder Einnahmenüberschussrechnungen und Steuerbescheide der letzten zwei bis drei Jahre, dazu die aktuelle betriebswirtschaftliche Auswertung.",
  },
  gmbh_gf: {
    id: "gmbh_gf",
    titel: "GmbH-Geschäftsführer",
    unterzeile: "Mit mehr als 50 Prozent der Anteile.",
    anerkennung: 0.8,
    einschaetzung:
      "Mit der Mehrheit der Anteile giltst du der Bank als selbstständig, nicht als angestellt. Das Geschäftsführergehalt allein reicht ihr als Nachweis nicht.",
    unterlagen:
      "Jahresabschlüsse der Gesellschaft und Steuerbescheide der letzten zwei bis drei Jahre, dazu der Geschäftsführervertrag.",
  },
  beamter: {
    id: "beamter",
    titel: "Beamter",
    unterzeile: "Öffentlicher Dienst, verbeamtet.",
    anerkennung: 1.05,
    einschaetzung:
      "Das sicherste Einkommen, das eine Bank kennt. Du bekommst die längsten Laufzeiten und die günstigsten Zinsen, dasselbe Gehalt trägt deshalb etwas mehr.",
    unterlagen: "Die letzten drei Bezügemitteilungen und die Ernennungsurkunde genügen in der Regel.",
  },
};

/** Vorbelegung, wenn nichts angegeben ist. */
export const BESCHAEFTIGUNG_STANDARD: BeschaeftigungId = "angestellt";

export function beschaeftigungFuer(id?: BeschaeftigungId | null): Beschaeftigung {
  return BESCHAEFTIGUNGEN[id ?? BESCHAEFTIGUNG_STANDARD] ?? BESCHAEFTIGUNGEN.angestellt;
}

/**
 * Das Einkommen, mit dem eine Bank rechnet.
 *
 * Nur diese Größe entscheidet über die Objektempfehlung. Die Steuerrechnung
 * läuft unverändert über das volle Bruttoeinkommen.
 */
export function anerkanntesEinkommen(brutto: number, id?: BeschaeftigungId | null): number {
  return Math.max(0, brutto) * beschaeftigungFuer(id).anerkennung;
}

/**
 * Steuerklasse zu Veranlagungsart.
 *
 * Wichtig für das Verständnis der Zahlen: Die Lohnsteuerklasse bestimmt nur den
 * monatlichen Lohnsteuerabzug, nicht die Jahressteuerschuld. Für die
 * Steuerersparnis einer Immobilie zählt die Veranlagung. Klasse I und II sind
 * Einzelveranlagung (Grundtarif). Die Klassen III, IV und V kommen nur bei
 * Ehepaaren vor und bedeuten Zusammenveranlagung, also Splitting nach
 * § 32a Abs. 5 EStG. Wer Klasse V hat, hat einen Partner mit Klasse III.
 *
 * Weil das Splitting die Steuer des Paares berechnet, unterscheiden sich III,
 * IV und V nicht durch den Tarif, sondern durch das Einkommen des Partners.
 * Deshalb fragt der Rechner es ab, siehe partnerBruttoVorschlag.
 */
export const VERANLAGUNG: Record<Steuerklasse, Veranlagung> = {
  I: "grund",
  II: "grund",
  III: "splitting",
  IV: "splitting",
  V: "splitting",
};

/**
 * Vorbelegung für das Jahresbrutto des Partners, als Vielfaches des eigenen.
 *
 * Faustregel der Lohnsteuer: Die Kombination III/V lohnt sich, wenn ein
 * Partner rund 60 Prozent des gemeinsamen Einkommens verdient, sonst ist IV/IV
 * die bessere Wahl. Genau diese 60 zu 40 stehen hier: Wer Klasse III hat,
 * verdient die 60 Prozent, sein Partner die 40, also zwei Drittel des eigenen
 * Bruttos. Bei Klasse V ist es umgekehrt, der Partner verdient das
 * Anderthalbfache. Bei IV verdienen beide etwa gleich viel.
 *
 * Das sind Startwerte, keine Messwerte. In der Oberfläche ist das Feld
 * änderbar und der Hinweis nennt die Annahme ausdrücklich.
 */
export const PARTNER_FAKTOR: Record<Steuerklasse, number> = {
  I: 0,
  II: 0,
  III: 2 / 3,
  IV: 1,
  V: 1.5,
};

export function partnerBruttoVorschlag(brutto: number, klasse: Steuerklasse): number {
  if (VERANLAGUNG[klasse] !== "splitting") return 0;
  return Math.max(0, brutto) * PARTNER_FAKTOR[klasse];
}

/**
 * Kirchensteuersatz je Bundesland: 8 Prozent in Bayern und Baden-Württemberg.
 *
 * Maßgeblich ist der WOHNSITZ des Steuerpflichtigen, nicht die Lage einer
 * Immobilie. Ohne Angabe gelten 9 Prozent, also der ungünstigere Satz: Lieber
 * eine Steuerlast, die etwas zu hoch angesetzt ist, als eine Ersparnis, die
 * sich später als zu klein herausstellt.
 */
export function kirchensteuersatzFuer(bundeslandId?: string | null): number {
  return bundeslandId === "by" || bundeslandId === "bw" ? 0.08 : 0.09;
}

export interface SteuerEingaben {
  /** Jahresbrutto der eingebenden Person. */
  jahresbrutto: number;
  steuerklasse: Steuerklasse;
  /**
   * Jahresbrutto des Partners. Nur bei Zusammenveranlagung (III, IV, V)
   * wirksam. Ohne Angabe wird der Vorschlag aus PARTNER_FAKTOR genommen.
   */
  partnerBrutto?: number;
  kinder: number;
  kirchensteuer: boolean;
  /**
   * Bundesland des WOHNSITZES. Es bestimmt den Kirchensteuersatz und, solange
   * keine Vorgabe mitkommt, auch die Kaufnebenkosten.
   */
  bundesland?: string;
  /**
   * Fester Satz für die Kaufnebenkosten, in Prozent vom Kaufpreis.
   *
   * Warum es diese Vorgabe gibt: Die Grunderwerbsteuer richtet sich nach der
   * LAGE der Immobilie, der Kirchensteuersatz nach dem WOHNSITZ. Ein einziges
   * Feld „Bundesland“ kann also nicht beides beantworten. Wer ein Objekt noch
   * gar nicht kennt, etwa die Strecke des Steuerrechners, gibt hier den
   * Höchstsatz vor (siehe `KAUFNEBENKOSTEN_HOECHSTSATZ`) und schreibt das auf
   * die Seite. Wer die Lage kennt, lässt das Feld weg und bekommt wie bisher
   * den Satz des Bundeslands.
   */
  nebenkostenProzentVorgabe?: number;
  /** Bereits vorhandene Anlageobjekte, deren Steuervorteile schon genutzt sind. */
  bestehendeImmobilien: number;
  /** Wie viel der Steuerlast soll umgelenkt werden. */
  hebelziel: Hebelziel;
  /**
   * Beschäftigungsverhältnis. Ohne Angabe gilt `angestellt`, damit ältere
   * Aufrufer (etwa die Beraterseite) unverändert dasselbe Ergebnis bekommen.
   */
  beschaeftigung?: BeschaeftigungId;
}

export interface Steuerlast {
  est: number;
  soli: number;
  kirche: number;
  summe: number;
}

/** Einkommensteuer nach der Veranlagungsart der Steuerklasse. */
export function einkommensteuer(zvE: number, klasse: Steuerklasse): number {
  return tariflicheEst(Math.max(0, zvE), STEUERJAHR, VERANLAGUNG[klasse]);
}

/**
 * Gesamte Steuerlast aus einem zu versteuernden Einkommen.
 *
 * Die gezahlte Kirchensteuer ist selbst Sonderausgabe (§ 10 Abs. 1 Nr. 4 EStG)
 * und mindert das zu versteuernde Einkommen. Daraus entsteht ein Kreisbezug,
 * der hier iterativ aufgelöst wird. Er konvergiert schnell, weil je Schritt nur
 * noch Kirchensteuersatz mal Grenzsteuersatz übrig bleibt, also unter vier
 * Prozent. Vereinfachung: abziehbar ist streng genommen die im Jahr geleistete
 * Zahlung, hier wird die Kirchensteuer desselben Jahres angesetzt.
 */
export function steuerlastAusZvE(zvE: number, e: SteuerEingaben): Steuerlast {
  const basis = Math.max(0, zvE);
  const satz = e.kirchensteuer ? kirchensteuersatzFuer(e.bundesland) : 0;

  let kirche = 0;
  let est = einkommensteuer(basis, e.steuerklasse);
  for (let i = 0; satz > 0 && i < 8; i++) {
    kirche = est * satz;
    est = einkommensteuer(basis - kirche, e.steuerklasse);
  }
  if (satz > 0) kirche = est * satz;

  const so = solidaritaetszuschlag(est, STEUERJAHR, VERANLAGUNG[e.steuerklasse]);
  return { est, soli: so, kirche, summe: est + so + kirche };
}

/** Arbeitnehmeranteil der Sozialversicherung aus dem Bruttojahresgehalt. */
export function sozialabgaben(brutto: number, kinder: number): number {
  const rvBasis = Math.min(Math.max(0, brutto), BBG_RENTE);
  const kvBasis = Math.min(Math.max(0, brutto), BBG_KRANKEN);
  const pflege = SATZ_PFLEGE + (kinder === 0 ? ZUSCHLAG_KINDERLOS : 0);
  return rvBasis * (SATZ_RENTE + SATZ_ARBEITSLOS) + kvBasis * (SATZ_KRANKEN + pflege);
}

/**
 * Einkünfte einer Person nach Werbungskosten, Sonderausgabenpauschale und
 * Vorsorgeaufwendungen. Noch ohne Kinder- und Alleinerziehendenfreibetrag,
 * die stehen dem Paar beziehungsweise der Person einmal zu, nicht je Gehalt.
 */
function einkuenfteNachAbzuegen(brutto: number): number {
  const b = Math.max(0, brutto);
  if (b <= 0) return 0;
  const rvBasis = Math.min(b, BBG_RENTE);
  const kvBasis = Math.min(b, BBG_KRANKEN);
  // Vorsorgeaufwendungen: Rentenbeiträge voll, Kranken-/Pflegebasisanteil abziehbar.
  const vorsorge = rvBasis * SATZ_RENTE + kvBasis * (SATZ_KRANKEN * 0.96 + SATZ_PFLEGE);
  return Math.max(0, b - WERBUNGSKOSTEN_PAUSCHALE - SONDERAUSGABEN_PAUSCHALE - vorsorge);
}

/**
 * Anteil des vollen Kinderfreibetrags, der hier anzusetzen ist.
 *
 * Bei Zusammenveranlagung steht dem Paar der volle Betrag zu. Bei Einzel-
 * veranlagung, also Klasse I und II, nur die Hälfte, solange der andere
 * Elternteil seine Hälfte nicht übertragen hat (§ 32 Abs. 6 EStG). Genau das
 * war vorher falsch: Der volle Betrag wurde unabhängig von der Steuerklasse
 * abgezogen, das zu versteuernde Einkommen fiel bei Ledigen zu niedrig aus.
 */
export function kinderfreibetragAnteil(klasse: Steuerklasse): number {
  return VERANLAGUNG[klasse] === "splitting" ? 1 : 0.5;
}

/**
 * Zu versteuerndes Einkommen aus dem Jahresbrutto.
 *
 * Bei Zusammenveranlagung ist das Ergebnis das gemeinsame zu versteuernde
 * Einkommen beider Partner, denn nur darauf lässt sich das Splitting anwenden.
 */
export function zvEAusBrutto(brutto: number, e: SteuerEingaben): number {
  const splitting = VERANLAGUNG[e.steuerklasse] === "splitting";
  const partnerBrutto = splitting
    ? (e.partnerBrutto ?? partnerBruttoVorschlag(brutto, e.steuerklasse))
    : 0;

  let zvE = einkuenfteNachAbzuegen(brutto) + einkuenfteNachAbzuegen(partnerBrutto);
  zvE -= e.kinder * FREIBETRAG_KIND * kinderfreibetragAnteil(e.steuerklasse);

  if (e.steuerklasse === "II") {
    zvE -=
      ENTLASTUNG_ALLEINERZIEHEND +
      Math.max(0, e.kinder - 1) * ENTLASTUNG_JE_WEITEREM_KIND;
  }
  return Math.max(0, zvE);
}

/** Grenzsteuersatz am aktuellen zvE, analytisch nach § 32a EStG. */
export function grenzsteuersatz(zvE: number, klasse: Steuerklasse): number {
  return grenzsteuersatzProzent(zvE, STEUERJAHR, VERANLAGUNG[klasse]) / 100;
}

/**
 * Anteil des Gebäudes am Kaufpreis.
 *
 * Nur das Gebäude wird abgeschrieben, der Grund und Boden nicht. Der Anteil
 * entscheidet deshalb unmittelbar über die Höhe der Abschreibung.
 *
 * 80 Prozent, festgelegt am 17.09.2026. Vorher standen hier drei verschiedene
 * Werte: 70 Prozent beim typisierten Objekt, 62 Prozent bei Neubau und
 * WG-Konzept. Der Anteil ist in Wahrheit eine Frage des Bodenrichtwerts und
 * schwankt von Lage zu Lage erheblich, bei innerstädtischen Eigentumswohnungen
 * liegt er üblicherweise zwischen 70 und 85 Prozent. Der angesetzte Wert steht
 * offen in den Annahmen, damit jeder sieht, worauf die Abschreibung beruht.
 */
export const GEBAEUDEANTEIL = 0.8;

/* ── Was ein Vermieter wirklich trägt ──────────────────────────────────────
 * Hier standen bis zum 17.09.2026 pauschal 0,27 Prozent des Kaufpreises, bei
 * einer Wohnung für 340.000 Euro also 77 Euro im Monat. Das ist etwa die
 * Hälfte dessen, was anfällt, und es hat die Seite an zwei Stellen zu freundlich
 * aussehen lassen: Der eigene Anteil an den Monatskosten war zu klein, und der
 * steuerliche Verlust ebenfalls.
 *
 * Jetzt stehen die drei Posten einzeln da, jeder mit seiner Herleitung.
 */

/** Verwaltergebühr je Wohnung, marktüblich rund 30 Euro im Monat. */
const OBJEKT_VERWALTUNG_JAHR = 360;

/**
 * Instandhaltungsrücklage, 0,5 Prozent des Gebäudewerts im Jahr.
 *
 * Bei der typisierten Wohnung sind das rund 100 Euro im Monat und liegt damit
 * in der Größenordnung der üblichen Faustregel von einem Euro je Quadratmeter.
 * Steuerlich ist die Zuführung zur Rücklage streng genommen erst abziehbar,
 * wenn sie verbaut wird. Das Modell behandelt sie vereinfachend als laufenden
 * Aufwand, weil sie über zehn Jahre im Schnitt auch verbaut wird. Diese
 * Vereinfachung steht in den Annahmen auf der Seite.
 */
const OBJEKT_RUECKLAGE_ANTEIL = 0.005;

/**
 * Mietausfallwagnis, 2 Prozent der Jahreskaltmiete nach § 29 II. BV.
 *
 * Es ist keine Ausgabe, sondern Miete, die nicht hereinkommt. Deshalb mindert
 * es die Einnahmen und steht nicht bei den Kosten.
 */
const OBJEKT_MIETAUSFALL = 0.02;

/* ── Die drei Anlageklassen mit typischen Objekten ─────────────────────────
 * Preise und Kennzahlen sind die real angebotenen Groessenordnungen.
 * Die Klassen unterscheiden sich deutlich: Neubau hat den staerksten
 * Steuerhebel, das WG-Konzept die hoechste Miete und damit den kleineren
 * steuerlichen Verlust. Das wird bewusst so ausgewiesen.
 *
 * Die Abschreibung wird NICHT als fertiger Prozentsatz eingetragen, sondern
 * aus den gesetzlichen Saetzen in afaSaetze.ts zusammengesetzt. Vorher standen
 * hier Mischwerte ohne Herleitung, unter anderem 2,5 Prozent fuer Bestand,
 * obwohl dieser Satz nur fuer Gebaeude vor 1925 gilt. */

export type AssetklassenId = "neubau" | "bestand" | "wg";

export interface Assetklasse {
  id: AssetklassenId;
  titel: string;
  kurz: string;
  /** Typischer Kaufpreis eines Objekts dieser Klasse. */
  preis: number;
  /** Anteil des Gebaeudes am Kaufpreis, nur darauf gibt es Abschreibung. */
  gebaeudeanteil: number;
  /** Fertigstellungsjahr, bestimmt den linearen Satz nach § 7 Abs. 4 EStG. */
  baujahr: number;
  /** Degressive AfA nach § 7 Abs. 5a EStG anstelle der linearen. */
  degressiv: boolean;
  /** Sonderabschreibung Mietwohnungsneubau nach § 7b EStG, erste vier Jahre. */
  sonder7b: boolean;
  /** Anschaffungskosten der Moeblierung, linear ueber die uebliche Nutzungsdauer. */
  moeblierung: number;
  /** Mischzins der Finanzierung. */
  zins: number;
  /** Bruttomietrendite auf den Kaufpreis. */
  mietrendite: number;
  erklaerung: string;
}

/** Nutzungsdauer der Moeblierung aus der amtlichen AfA-Tabelle. */
const MOEBEL_NUTZUNGSDAUER =
  BEWEGLICH_NUTZUNGSDAUER.find((b) => b.key === "moebel")?.jahre ?? 10;

export const ASSETKLASSEN: Record<AssetklassenId, Assetklasse> = {
  neubau: {
    id: "neubau",
    titel: "Neubau",
    kurz: "Der stärkste Steuerhebel",
    preis: 350000,
    gebaeudeanteil: GEBAEUDEANTEIL,
    baujahr: 2026,
    // 5 % degressiv nach § 7 Abs. 5a plus 5 % Sonderabschreibung nach § 7b
    degressiv: true,
    sonder7b: true,
    moeblierung: 0,
    zins: SOLLZINS,
    mietrendite: 0.036,
    erklaerung:
      "Erstbezug mit voller Gewährleistung. Im ersten Jahr darfst du 10 Prozent des Gebäudewerts abschreiben, das ist der größte Steuereffekt, den es aktuell gibt.",
  },
  bestand: {
    id: "bestand",
    titel: "Sanierter Bestand",
    kurz: "Der günstige Einstieg",
    preis: 180000,
    gebaeudeanteil: GEBAEUDEANTEIL,
    // Fertigstellung 1925 bis 2022, also 2 % linear nach § 7 Abs. 4 EStG
    baujahr: 1990,
    degressiv: false,
    sonder7b: false,
    moeblierung: 0,
    zins: SOLLZINS,
    mietrendite: 0.045,
    erklaerung:
      "Gewachsene Lage, vorhandene Mieter, kleinster Kapitaleinsatz. Der Steuereffekt ist geringer als beim Neubau, dafür ist der Einstieg deutlich leichter.",
  },
  wg: {
    id: "wg",
    titel: "WG- & Co-Living-Konzept",
    kurz: "Die höchste Miete",
    preis: 550000,
    gebaeudeanteil: GEBAEUDEANTEIL,
    // Fertigstellung ab 2023, also 3 % linear, dazu die Moeblierung ueber zehn Jahre
    baujahr: 2024,
    degressiv: false,
    sonder7b: false,
    moeblierung: 30000,
    zins: SOLLZINS,
    mietrendite: 0.055,
    erklaerung:
      "Mehrere möblierte Zimmer in einer Wohnung, all-inclusive vermietet. Bringt die höchste Miete, der Steuereffekt fällt dafür kleiner aus als beim Neubau.",
  },
};

/**
 * Der Verlauf der Abschreibung über die Jahre, für eine Assetklasse.
 *
 * Er ersetzt die Abkürzung, mit der die Mikroseite bis zum 17.09.2026
 * gerechnet hat: Dort wurde die Abschreibung des ERSTEN Jahres genommen und
 * die Zehnjahresersparnis als ihr Fünffaches gesetzt, mit der Begründung, die
 * Sonderabschreibung laufe nach vier Jahren aus. Die Begründung stimmt, die
 * Zahl war geraten.
 *
 * Gerechnet wird jetzt so, wie das Gesetz es vorsieht:
 *
 *   Degressiv (§ 7 Abs. 5a EStG)  fünf Prozent vom RESTBUCHWERT, also jedes
 *                                 Jahr etwas weniger. Sobald die lineare
 *                                 Abschreibung auf den Restwert über die
 *                                 verbleibende Nutzungsdauer mehr hergibt,
 *                                 wird gewechselt. Das ist das übliche und
 *                                 zulässige Vorgehen.
 *   Sonder (§ 7b EStG)            fünf Prozent der ursprünglichen
 *                                 Bemessungsgrundlage, vier Jahre lang,
 *                                 zusätzlich. Sie mindert den Restbuchwert mit.
 *   Linear (§ 7 Abs. 4 EStG)      fester Satz auf die Anschaffungskosten.
 *   Möblierung                    linear über die Nutzungsdauer aus der
 *                                 amtlichen AfA-Tabelle.
 */
export function afaVerlauf(k: Assetklasse, jahre: number = BETRACHTUNG_JAHRE): number[] {
  const gebaeude = k.preis * k.gebaeudeanteil;
  const linearSatz = linearerAfaSatz(k.baujahr).satz;
  const gesamtdauer = linearSatz > 0 ? 100 / linearSatz : jahre;

  let restbuchwert = gebaeude;
  return Array.from({ length: jahre }, (_, i) => {
    const jahr = i + 1;
    const sonder =
      k.sonder7b && jahr <= SONDER_7B_JAHRE ? gebaeude * (SONDER_7B_SATZ / 100) : 0;

    let regulaer: number;
    if (k.degressiv) {
      const degressiv = restbuchwert * (DEGRESSIV_SATZ / 100);
      const linearAufRest = restbuchwert / Math.max(1, gesamtdauer - i);
      regulaer = Math.max(degressiv, linearAufRest);
    } else {
      regulaer = gebaeude * (linearSatz / 100);
    }

    const gebaeudeAfa = Math.min(regulaer + sonder, Math.max(0, restbuchwert));
    restbuchwert = Math.max(0, restbuchwert - gebaeudeAfa);

    const moebel =
      k.moeblierung > 0 && jahr <= MOEBEL_NUTZUNGSDAUER
        ? k.moeblierung / MOEBEL_NUTZUNGSDAUER
        : 0;
    return gebaeudeAfa + moebel;
  });
}

/** Abschreibung im ersten Jahr, aus den Sätzen in afaSaetze.ts zusammengesetzt. */
export function afaErstesJahr(k: Assetklasse): number {
  return afaVerlauf(k, 1)[0];
}

/**
 * Was ein Vermieter an laufenden, nicht umlagefähigen Kosten trägt.
 *
 * Eine Herleitung für alle Objekte dieses Moduls, damit typisiertes Objekt und
 * Assetklassen nicht wieder auseinanderlaufen. Bei den Assetklassen standen
 * vorher feste Beträge von 720, 480 und 1.200 Euro im Jahr, also 0,2 bis
 * 0,27 Prozent des Kaufpreises. Das ist etwa die Hälfte dessen, was anfällt.
 */
export function laufendeKosten(preis: number, gebaeudeanteil: number): {
  verwaltung: number;
  ruecklage: number;
  summe: number;
} {
  const verwaltung = OBJEKT_VERWALTUNG_JAHR;
  const ruecklage = preis * gebaeudeanteil * OBJEKT_RUECKLAGE_ANTEIL;
  return { verwaltung, ruecklage, summe: verwaltung + ruecklage };
}

/**
 * Die Kaltmiete, mit der gerechnet wird: Sollmiete minus Mietausfallwagnis.
 * Das Wagnis ist keine Ausgabe, sondern Miete, die nicht hereinkommt, deshalb
 * mindert es die Einnahmen und steht nicht bei den Kosten.
 */
export function vereinnahmteKaltmiete(preis: number, mietrendite: number): number {
  return preis * mietrendite * (1 - OBJEKT_MIETAUSFALL);
}

/** Steuerlicher Verlust aus Vermietung im ersten Jahr für ein Objekt. */
export function verlustProObjekt(k: Assetklasse): number {
  const afa = afaErstesJahr(k);
  const zinsen = k.preis * k.zins;
  const miete = vereinnahmteKaltmiete(k.preis, k.mietrendite);
  return miete - afa - zinsen - laufendeKosten(k.preis, k.gebaeudeanteil).summe; // negativ = Verlust
}

/**
 * Wertzuwachs über zehn Jahre, als Anteil am Kaufpreis.
 *
 * Aus der realen Kalkulation abgeleitet (Basis: 440.000 Euro Neubau), das sind
 * rund zwei Prozent im Jahr. Eine Modellannahme und keine Zusage, und auf der
 * Seite steht sie auch so.
 *
 * Die frühere Schwesterquote `nettoLiquiditaet10J` ist ersatzlos weg: Sie kam
 * aus derselben fremden Kalkulation, wurde auf beliebige Objekte übertragen
 * und war positiv, obwohl dieselben Seiten eine monatliche Zuzahlung auswiesen.
 * Liquidität wird jetzt überall aus den eigenen Cashflows gerechnet. Auch die
 * Tilgungsquote ist weg, sie kommt aus `finanzierung.ts`.
 */
export const QUOTEN = {
  wertsteigerung10J: 96358 / 440000,
};

const HEBEL_ANTEIL: Record<Hebelziel, number> = {
  maximal: 1,
  ausgewogen: 0.5,
  vorsichtig: 0.25,
};

/** Zeitraum, für den dieser Rechner Aussagen trifft. */
export const BETRACHTUNG_JAHRE = 10;

/** Eine Zeile des Jahresverlaufs. Alle Betraege in Euro. */
export interface VerlaufJahr {
  jahr: number;
  /** Steuerersparnis in genau diesem Jahr. */
  ersparnis: number;
  /** Steuerersparnis von Jahr 1 bis hierher. */
  ersparnisKumuliert: number;
  /** Getilgte Schulden bis hierher. */
  tilgung: number;
  /** Wertzuwachs bis hierher. */
  wertsteigerung: number;
  /**
   * Vermoegenszuwachs bis hierher: getilgte Schulden plus Wertzuwachs plus der
   * aufgelaufene Zahlungsstrom, abzueglich des eigenen Einsatzes. Startet
   * deshalb im Minus, denn die Kaufnebenkosten fallen sofort an.
   */
  vermoegen: number;
}

/**
 * Der Weg ueber die zehn Jahre, Jahr fuer Jahr.
 *
 * Bewusst KEINE zweite Rechnung: Alle Werte stammen aus dem Klassenplan in
 * `berechne`, hier werden sie nur aufaddiert.
 *
 * Vorher lief das ueber Gewichte, und die hingen an `ersparnisFaktor10J`, also
 * an einer gesetzten 5 fuer den Neubau und 8,5 fuer die uebrigen Klassen. Beide
 * Zahlen waren geraten. Jetzt ergibt sich der Verlauf aus der Abschreibung, die
 * das Gesetz vorgibt, und aus dem Zinsverlauf des Darlehens. Der Knick nach dem
 * vierten Jahr, wenn die Sonderabschreibung nach § 7b EStG auslaeuft, steht
 * damit nicht mehr als Annahme drin, sondern faellt von selbst heraus.
 */
export function jahresverlauf(r: Ergebnis): VerlaufJahr[] {
  const zeilen: VerlaufJahr[] = [];
  let ersparnisKumuliert = 0;
  let tilgung = 0;
  let liquiditaet = 0;

  for (const z of r.plan) {
    ersparnisKumuliert += z.ersparnis;
    tilgung += z.tilgung;
    liquiditaet += z.cashflowNachSteuer;
    const wertsteigerung = (r.wertsteigerung10J * z.jahr) / BETRACHTUNG_JAHRE;
    zeilen.push({
      jahr: z.jahr,
      ersparnis: z.ersparnis,
      ersparnisKumuliert,
      tilgung,
      wertsteigerung,
      vermoegen: tilgung + wertsteigerung + liquiditaet - r.eigenkapital,
    });
  }
  return zeilen;
}

export interface Ergebnis {
  /** Eingegebenes Jahresbrutto. */
  brutto: number;
  /** Angesetztes Jahresbrutto des Partners, 0 ohne Zusammenveranlagung. */
  partnerBrutto: number;
  /** Wird mit Splitting gerechnet? */
  veranlagung: Veranlagung;
  /** Zu versteuerndes Einkommen aus dem Gehalt, bei Splitting das gemeinsame. */
  zvE: number;
  /**
   * Verlust, den bereits vorhandene Objekte schon heute erzeugen. Er mindert
   * das zu versteuernde Einkommen, bevor das neue Objekt überhaupt wirkt.
   */
  bereitsGenutzt: number;
  /**
   * Das zu versteuernde Einkommen, mit dem tatsächlich gerechnet wird, also
   * `zvE` minus `bereitsGenutzt`. Genau dieser Wert gehört auf die Seite, denn
   * an ihm hängen Steuerlast, Grenzsteuersatz und jede Ersparnis.
   */
  zvEHeute: number;
  /** Grenzsteuersatz am `zvEHeute`. */
  grenzsteuersatz: number;
  /** Angesetzter Kinderfreibetrag insgesamt. */
  kinderfreibetrag: number;
  /** Steuerlast heute. */
  vorher: Steuerlast;
  /** Steuerlast mit genau einem Objekt der empfohlenen Klasse. */
  nachher: Steuerlast;
  steuer10J: number;
  klasse: Assetklasse;
  /** Angegebenes Beschäftigungsverhältnis. */
  beschaeftigung: Beschaeftigung;
  /** Das Einkommen, mit dem eine Bank rechnet. Nur das steuert die Empfehlung. */
  anerkanntesEinkommen: number;
  /**
   * Die Spanne aus den zwei Abschreibungswegen am typisierten Objekt.
   *
   * Sie hängt NICHT am Beschäftigungsverhältnis und nicht an einer
   * Objektklasse, sondern nur am Einkommen und an den Steuerangaben. Genau das
   * macht sie zur allgemeinen Grössenordnung, auf die sich die öffentliche
   * Ergebnisseite stützt.
   */
  spanne: Spanne;
  /** Abschreibung im ersten Jahr für ein Objekt. */
  afaJahr1: number;
  /** Steuerersparnis pro Jahr durch ein Objekt. */
  ersparnisJahr: number;
  /** Steuerersparnis über zehn Jahre durch ein Objekt. */
  ersparnis10J: number;
  /** Wie viele solcher Objekte nötig wären, um das Hebelziel zu erreichen. */
  anzahlFuerZiel: number;
  tilgung10J: number;
  wertsteigerung10J: number;
  anteilAmObjekt: number;
  /** Kaufnebenkosten in Prozent, je Bundesland. */
  nebenkostenProzent: number;
  eigenkapital: number;
  ersparnisFuerRaten: number;
  /**
   * Zahlungsstrom ueber zehn Jahre, Steuerersparnis eingerechnet. NEGATIV
   * heisst: Du hast zugezahlt. Der Name stammt aus der Zeit, als hier eine
   * Quote stand, die immer positiv war.
   */
  freieLiquiditaet10J: number;
  vermoegenszuwachs: number;
  /** Der Zehnjahresplan der empfohlenen Assetklasse, Jahr fuer Jahr. */
  plan: ObjektJahr[];
  /** Vermoegen nach zehn Jahren aus genau diesem Plan. */
  vermoegen: Vermoegen;
}

/**
 * Welche Klasse passt.
 *
 * Die Reihenfolge folgt der Sache, nicht dem Preis: Wer Steuern zahlt,
 * bekommt den stärksten Steuerhebel, also Neubau. Wer schon mehrere Objekte
 * hält, hat diesen Hebel weitgehend ausgeschöpft, für den zählt ab da die
 * Mietrendite, also das WG-Konzept. Kleinere Einkommen starten im Bestand,
 * weil dort der Kapitaleinsatz am geringsten ist.
 *
 * Maßgeblich ist das von der Bank ANERKANNTE Einkommen, nicht das Brutto: Ein
 * Objekt, das keine Finanzierung bekommt, ist keine Empfehlung, egal wie gut
 * der Steuerhebel wäre. Deshalb landet ein Selbstständiger mit 85.000 Euro
 * beim Bestand, ein Angestellter mit demselben Betrag beim Neubau.
 */
function empfohleneKlasse(anerkannt: number, bestehendeImmobilien: number): Assetklasse {
  if (bestehendeImmobilien >= 2 && anerkannt >= 90000) return ASSETKLASSEN.wg;
  if (anerkannt >= 70000) return ASSETKLASSEN.neubau;
  return ASSETKLASSEN.bestand;
}

/* ── Die zwei Abschreibungswege und die Spanne daraus ──────────────────────
 * Der Gesetzgeber gibt den linearen Satz nach der Fertigstellung vor
 * (§ 7 Abs. 4 Satz 1 EStG). Wer eine kürzere tatsächliche Nutzungsdauer
 * nachweist, darf schneller abschreiben (§ 7 Abs. 4 Satz 2 EStG). Der Nachweis
 * ist ein Gutachten, das ist keine Formsache und kostet Geld.
 *
 * Genau daraus entsteht die Spanne, die die öffentliche Ergebnisseite zeigt:
 * das untere Ende mit dem gesetzlichen Satz, den jeder bekommt, das obere Ende
 * mit dem nachgewiesenen. Beide Enden sind gerechnet, keines ist gerundet oder
 * geschätzt.
 *
 * Beides gilt nur für gebrauchte Gebäude: Für einen Neubau ist eine
 * Restnutzungsdauer von 25 Jahren nicht zu begründen. Deshalb ist das
 * typisierte Objekt unten eine gebrauchte Eigentumswohnung.
 *
 * Der richtige Bezugspunkt ist das Gesetz, nicht die ImmoWertV. Bis zum
 * 17.09.2026 stellte diese Seite die Restnutzungsdauer nach dem Modell der
 * ImmoWertV als Maßstab dar, für die Wohnung von 1990 also 44 Jahre und
 * 2,27 Prozent. Das war verkehrt herum: 44 Jahre stammen aus der
 * Verkehrswertermittlung und sagen über die Steuer nichts. Maßstab ist die
 * Nutzungsdauer, die hinter dem gesetzlichen Satz steht, und die nennt
 * § 7 Abs. 4 Satz 2 EStG ausdrücklich, siehe `typisierteNutzungsdauer`.
 */

/**
 * Nutzungsdauer, die hinter dem gesetzlichen Satz steckt.
 *
 * § 7 Abs. 4 Satz 2 EStG nennt sie selbst: weniger als 33 Jahre in den Fällen
 * von Satz 1 Nr. 1 und Nr. 2 Buchstabe a (3 Prozent), weniger als 50 Jahre bei
 * Nr. 2 Buchstabe b (2 Prozent), weniger als 40 Jahre bei Nr. 2 Buchstabe c
 * (2,5 Prozent). Erst wenn die tatsächliche Nutzungsdauer darunter liegt, ist
 * ein höherer Satz überhaupt zulässig.
 *
 * Für das typisierte Objekt von 1990 sind das 2 Prozent und damit 50 Jahre.
 */
export function typisierteNutzungsdauer(gesetzlicherSatz: number): number {
  if (gesetzlicherSatz >= 3) return 33;
  if (gesetzlicherSatz >= 2.5) return 40;
  return 50;
}

/**
 * Restnutzungsdauer, mit der diese Seite rechnet.
 *
 * 25 Jahre, das sind vier Prozent Abschreibung im Jahr. Festgelegt am
 * 17.09.2026. Das ist eine ENTSCHEIDUNG und keine Herleitung.
 *
 * Was jeder wissen muss, der die Zahl sieht, und was deshalb auch auf der
 * Seite steht: Der gesetzliche Satz sind zwei Prozent nach § 7 Abs. 4 Satz 1
 * Nr. 2 Buchstabe b EStG, das entspricht 50 Jahren, und die bekommt jeder ohne
 * Nachweis. Vier Prozent gibt es nur, wenn die tatsächliche Nutzungsdauer
 * kürzer ist als diese 50 Jahre und das auch nachgewiesen wird
 * (§ 7 Abs. 4 Satz 2 EStG). Der Nachweis läuft praktisch über ein Gutachten
 * zum konkreten Gebäude. Der Abstand von 50 auf 25 Jahre ist genau das, was
 * dieses Gutachten tragen muss.
 */
export const RESTNUTZUNGSDAUER_ANSATZ = 25;

/**
 * Umsatzsteuer auf Handwerkerleistungen.
 *
 * Ein Vermieter ohne Option zur Umsatzsteuer kann die Vorsteuer nicht ziehen.
 * Sie gehört deshalb zum Aufwand und ist mit abziehbar. Genau darum sind
 * 15 Prozent netto 17,85 Prozent brutto.
 */
const UMSATZSTEUER = 0.19;

/**
 * Sicherheitsabstand zur 15-Prozent-Grenze.
 *
 * § 6 Abs. 1 Nr. 1a EStG kennt keine Toleranz: Wird die Grenze auch nur um
 * einen Euro überschritten, werden ALLE Aufwendungen der drei Jahre zu
 * Herstellungskosten, nicht nur der überschiessende Teil. Wer auf den Cent
 * genau plant, riskiert also alles für nichts. Deshalb rechnet diese Seite mit
 * 90 Prozent der Grenze und nicht mit 100.
 */
export const ANSCHAFFUNGSNAH_SICHERHEIT = 0.9;

/** Ein Abschreibungsweg, gerechnet für ein Jahr. */
export interface AfaWeg {
  /** Abschreibungssatz auf den Gebäudewert, in Prozent. */
  satz: number;
  /** Abschreibung im Jahr, Gebäude und gegebenenfalls Möblierung. */
  afaJahr: number;
  /** Steuerlicher Verlust aus Vermietung, positiv angegeben. */
  verlust: number;
  /** Steuerersparnis im Jahr, über die Differenzmethode. */
  ersparnisJahr: number;
}

export interface Erhaltungsaufwand {
  /**
   * Angesetzter Aufwand netto: 15 Prozent des Gebäudewerts nach
   * § 6 Abs. 1 Nr. 1a EStG, davon 90 Prozent als Sicherheitsabstand.
   * Bezogen sind die 15 Prozent auf drei Jahre nach dem Kauf.
   */
  grenzeNetto: number;
  /** Derselbe Aufwand brutto, also das, was tatsächlich bezahlt und abgezogen wird. */
  bruttoAufwand: number;
  /** Anteil am Gebäudewert, brutto, in Prozent. */
  anteilProzent: number;
  /**
   * Steuerersparnis im ersten Jahr, zusätzlich zum laufenden Effekt, gerechnet
   * auf dem regulären Abschreibungsweg.
   */
  ersparnisEinmaligRegulaer: number;
  /** Derselbe Aufwand auf dem erhöhten Weg. */
  ersparnisEinmaligErhoeht: number;
  /**
   * Der grössere der beiden Werte. Genau dieser steht als "bis zu" auf der
   * Ergebnisseite, denn der Erhaltungsaufwand bekommt bewusst KEINE Spanne:
   * Sein unteres Ende wäre null, und eine Spanne von null bis X sagt nichts.
   * Was er hat, ist eine echte gesetzliche Obergrenze, nämlich die 15 Prozent
   * aus § 6 Abs. 1 Nr. 1a EStG. Also wird der Höchstwert ausgewiesen und
   * daneben gesagt, dass er nur entsteht, wenn solche Arbeiten anfallen.
   *
   * Welcher der beiden Wege gewinnt, ist nicht vorherbestimmt: Meistens der
   * reguläre, weil der kleinere laufende Verlust den Abzug höher im Tarif
   * ansetzen lässt. In der Milderungszone des Solidaritätszuschlags kann es
   * aber umgekehrt sein. Deshalb steht hier ein Maximum und keine Annahme.
   */
  ersparnisEinmalig: number;
}

/* ── Das typisierte Objekt ─────────────────────────────────────────────────
 * Die öffentliche Ergebnisseite nennt keinen Immobilientyp mehr. Eine
 * Abschreibung gibt es aber nur zu einem Gebäude, also braucht die Rechnung
 * weiterhin ein Objekt. Es ist deshalb typisiert und steht offen unter dem
 * Ergebnis: eine gebrauchte, vermietete Eigentumswohnung.
 *
 * Gebraucht, weil nur dort beide Abschreibungswege nebeneinander stehen: Für
 * einen Neubau ist eine Restnutzungsdauer von 25 Jahren nicht zu begründen,
 * ohne gebrauchtes Gebäude gäbe es also kein oberes Ende der Spanne.
 *
 * Der Kaufpreis hängt am Jahresbrutto, mit dem Vierfachen als Faustregel und
 * einem Deckel nach unten wie nach oben. Ein fester Preis für alle wäre
 * entweder für kleine Einkommen nicht finanzierbar oder für grosse zu klein.
 * Bewusst eine GERADE, keine Stufe: Eine Schwelle würde dieselbe Klippe
 * erzeugen, die vorher zwischen angestellt und selbstständig lag, wo die
 * ausgewiesene Ersparnis bei 85.000 Euro von 8.218 auf 719 Euro fiel.
 */
export const OBJEKT_PREIS_FAKTOR = 4;
export const OBJEKT_PREIS_MIN = 180000;
export const OBJEKT_PREIS_MAX = 600000;
/** Fertigstellung 1925 bis 2022, also 2 Prozent linear nach § 7 Abs. 4 EStG. */
export const OBJEKT_BAUJAHR = 1990;
const OBJEKT_GEBAEUDEANTEIL = GEBAEUDEANTEIL;
const OBJEKT_ZINS = SOLLZINS;
const OBJEKT_MIETRENDITE = 0.045;

export interface TypisiertesObjekt {
  preis: number;
  gebaeudeanteil: number;
  gebaeudewert: number;
  baujahr: number;
  zins: number;
  mietrendite: number;
  /** Kaltmiete im Jahr nach Soll, also Kaufpreis mal Mietrendite. */
  kaltmieteSoll: number;
  /** Abschlag für das Mietausfallwagnis. */
  mietausfall: number;
  /** Kaltmiete, mit der das Modell rechnet: Soll minus Mietausfallwagnis. */
  kaltmiete: number;
  /** Verwaltung im Jahr. */
  verwaltung: number;
  /** Instandhaltungsrücklage im Jahr. */
  ruecklage: number;
  /** Laufende abzugsfähige Nebenkosten, Verwaltung plus Rücklage. */
  nebenkosten: number;
}

/** Kaufpreis des typisierten Objekts, auf volle 10.000 Euro gerundet. */
export function typisierterKaufpreis(jahresbrutto: number): number {
  const roh = Math.max(0, jahresbrutto) * OBJEKT_PREIS_FAKTOR;
  const begrenzt = Math.min(OBJEKT_PREIS_MAX, Math.max(OBJEKT_PREIS_MIN, roh));
  return Math.round(begrenzt / 10000) * 10000;
}

export function typisiertesObjekt(jahresbrutto: number): TypisiertesObjekt {
  const preis = typisierterKaufpreis(jahresbrutto);
  const gebaeudewert = preis * OBJEKT_GEBAEUDEANTEIL;
  const kaltmieteSoll = preis * OBJEKT_MIETRENDITE;
  /* Dieselben Helfer wie bei den Assetklassen, damit die beiden Modelle nicht
     wieder mit verschiedenen Kosten rechnen. */
  const kosten = laufendeKosten(preis, OBJEKT_GEBAEUDEANTEIL);
  const kaltmiete = vereinnahmteKaltmiete(preis, OBJEKT_MIETRENDITE);
  const mietausfall = kaltmieteSoll - kaltmiete;
  const verwaltung = kosten.verwaltung;
  const ruecklage = kosten.ruecklage;
  return {
    preis,
    gebaeudeanteil: OBJEKT_GEBAEUDEANTEIL,
    gebaeudewert,
    baujahr: OBJEKT_BAUJAHR,
    zins: OBJEKT_ZINS,
    mietrendite: OBJEKT_MIETRENDITE,
    kaltmieteSoll,
    mietausfall,
    kaltmiete,
    verwaltung,
    ruecklage,
    nebenkosten: kosten.summe,
  };
}

/** Eine Von-bis-Angabe. Beide Enden sind gerechnet, keines ist gerundet. */
export interface Spannbreite {
  von: number;
  bis: number;
}

/**
 * Ein Jahr am typisierten Objekt, vollständig durchgerechnet.
 *
 * Das ersetzt die frühere Abkürzung über Gewichte und feste Faktoren. Der
 * Grund steht in `objektplan`.
 */
export interface ObjektJahr {
  jahr: number;
  /** Restschuld zu Beginn des Jahres. */
  restschuld: number;
  zinsen: number;
  tilgung: number;
  /** Vereinnahmte Kaltmiete, also Soll minus Mietausfallwagnis. */
  miete: number;
  /** Nicht umlagefähige Kosten, Verwaltung plus Rücklage. */
  kosten: number;
  afa: number;
  /** Steuerlicher Verlust aus Vermietung, positiv angegeben. */
  verlust: number;
  ersparnis: number;
  /** Miete minus Zins, Tilgung und Kosten. Negativ heisst: du zahlst zu. */
  cashflowVorSteuer: number;
  /** Derselbe Betrag mit der Steuerersparnis. */
  cashflowNachSteuer: number;
}

/** Was in zehn Jahren an Vermögen entsteht, auf einem Abschreibungsweg. */
export interface Vermoegen {
  /** Getilgte Schulden. Geld, das aus der Rate in dein Eigentum wandert. */
  tilgung: number;
  /** Wertzuwachs nach der Modellannahme. */
  wertsteigerung: number;
  /** Tilgung plus Wertzuwachs. Der reine Vermögensaufbau. */
  aufbau: number;
  /**
   * Summe aller Cashflows nach Steuer. NEGATIV heisst: Du hast über die Jahre
   * zugezahlt. Genau hier stand vorher eine Quote aus einer fremden
   * Kalkulation, die das Vorzeichen umdrehte.
   */
  liquiditaet: number;
  /** Kaufnebenkosten, der Einsatz beim Kauf. */
  eigenkapital: number;
  /** Aufbau plus Liquidität minus Einsatz. Was unter dem Strich bleibt. */
  netto: number;
  /** Restschuld nach zehn Jahren. */
  restschuld: number;
  /** Summe der Steuerersparnis über die zehn Jahre. */
  ersparnis: number;
}

/** Die Spanne, die die öffentliche Ergebnisseite zeigt. */
export interface Spanne {
  /** Das Objekt, mit dem gerechnet wurde. Steht offen unter dem Ergebnis. */
  objekt: TypisiertesObjekt;
  /** Unteres Ende: der gesetzliche Satz, den jeder ohne Nachweis bekommt. */
  regulaer: AfaWeg & { grund: string; paragraf: string };
  /** Oberes Ende: nur mit anerkanntem Gutachten zur Restnutzungsdauer. */
  erhoeht: AfaWeg & { restnutzungsdauer: number };
  /** Wie viel die erhöhte Abschreibung im Jahr mehr bringt. */
  mehrProJahr: number;
  /** Steuerersparnis im ersten Jahr, von bis. */
  jahr1: Spannbreite;
  /** Steuerersparnis über zehn Jahre, von bis. */
  zehnJahre: Spannbreite;
  /**
   * Der Zehnjahresplan des LEITWEGS, Jahr für Jahr, also mit dem angesetzten
   * Satz von `RESTNUTZUNGSDAUER_ANSATZ`. Mit ihm rechnet und führt die Seite.
   */
  plan: ObjektJahr[];
  /** Derselbe Plan mit dem gesetzlichen Satz, also die abgesicherte Untergrenze. */
  planSicher: ObjektJahr[];
  /** Vermögen nach zehn Jahren, gerechnet auf dem Leitweg. */
  vermoegen: Vermoegen;
  /**
   * Nutzungsdauer, die hinter dem gesetzlichen Satz steht, also 50 Jahre bei
   * zwei Prozent. Sie ist der Maßstab, an dem sich der angesetzte Satz misst.
   */
  nutzungsdauerGesetzlich: number;
  /**
   * Wie viele Jahresersparnisse in den zehn Jahren stecken. Früher eine feste
   * 8,5, jetzt das Ergebnis der Rechnung. Steht auf der Seite als Herleitung.
   */
  faktor10J: number;
  erhaltung: Erhaltungsaufwand;
}

/**
 * Der Zehnjahresplan des typisierten Objekts, Jahr für Jahr.
 *
 * Vorher lief das über zwei Abkürzungen, und beide waren falsch:
 *
 *   1  Die Zehnjahresersparnis war das 8,5-fache des ersten Jahres, eine feste
 *      Zahl mit der Begründung „die Zinsen sinken mit der Tilgung“. Rechnet man
 *      es mit genau der Tilgung nach, die dieses Modell selbst ansetzt, kommt
 *      das 7,4-fache heraus. Die Begründung stimmte, die Zahl nicht.
 *   2  Die frei verfügbare Liquidität war eine Quote aus einer fremden
 *      Kalkulation (440.000 Euro Neubau) und wurde auf ein Bestandsobjekt
 *      übertragen. Sie war positiv, obwohl dieselbe Seite eine Zeile weiter
 *      oben eine monatliche Zuzahlung auswies.
 *
 * Beide Abkürzungen sind weg. Der Tilgungsverlauf ist derselbe wie bisher, er
 * bleibt an `QUOTEN.tilgung10J` kalibriert, damit sich an der ausgewiesenen
 * Tilgung nichts ändert. Alles andere folgt daraus:
 *
 *   Zinsen        Restschuld mal Zins, die Restschuld sinkt mit der Tilgung
 *   Verlust       Miete minus Zinsen, Abschreibung und Kosten
 *   Ersparnis     über `ersparnisAus`, also die Differenzmethode
 *   Cashflow      Miete minus Zins, Tilgung und Kosten, plus Ersparnis
 *
 * Eine Mietanpassung kennt dieses Modell nicht, die Miete bleibt rechnerisch
 * gleich. Das ist die vorsichtige Richtung und steht in den Annahmen.
 */
/** Was der Plan über das Objekt wissen muss. Mehr braucht er nicht. */
export interface PlanBasis {
  /** Kaufpreis, zugleich die Darlehenssumme: Finanziert wird der Kaufpreis. */
  preis: number;
  /** Vereinnahmte Kaltmiete im Jahr, also nach Mietausfallwagnis. */
  kaltmiete: number;
  /** Nicht umlagefähige Kosten im Jahr. */
  nebenkosten: number;
  zins: number;
}

/**
 * Der eigentliche Plan. Er gilt für beide Modelle dieses Moduls, für das
 * typisierte Objekt der Hauptseite genauso wie für die Assetklassen der
 * Mikroseite. Nur die Abschreibung unterscheidet sie, und die kommt als fertige
 * Liste herein.
 */
export function planAus(
  b: PlanBasis,
  afaJeJahr: number[],
  ersparnisAus: (minderung: number) => number,
): ObjektJahr[] {
  const darlehen = tilgungsplan(b.preis, afaJeJahr.length, b.zins);

  return afaJeJahr.map((afa, i) => {
    const d = darlehen[i];
    const ueberschuss = b.kaltmiete - afa - d.zinsen - b.nebenkosten;
    const verlust = Math.max(0, -ueberschuss);
    const ersparnis = ersparnisAus(verlust);
    const cashflowVorSteuer = b.kaltmiete - d.zinsen - d.tilgung - b.nebenkosten;
    return {
      jahr: d.jahr,
      restschuld: d.restschuld,
      zinsen: d.zinsen,
      tilgung: d.tilgung,
      miete: b.kaltmiete,
      kosten: b.nebenkosten,
      afa,
      verlust,
      ersparnis,
      cashflowVorSteuer,
      cashflowNachSteuer: cashflowVorSteuer + ersparnis,
    };
  });
}

/** Der Plan des typisierten Objekts auf einem der beiden Abschreibungswege. */
export function objektplan(
  o: TypisiertesObjekt,
  satz: number,
  ersparnisAus: (minderung: number) => number,
): ObjektJahr[] {
  const afa = o.gebaeudewert * (satz / 100);
  return planAus(o, Array.from({ length: BETRACHTUNG_JAHRE }, () => afa), ersparnisAus);
}

/**
 * Der Plan einer Assetklasse. Dieselbe Rechnung, nur mit einer Abschreibung,
 * die sich von Jahr zu Jahr ändert: degressiv beim Neubau, dazu die
 * Sonderabschreibung in den ersten vier Jahren.
 */
export function klassenplan(
  k: Assetklasse,
  ersparnisAus: (minderung: number) => number,
): ObjektJahr[] {
  return planAus(
    {
      preis: k.preis,
      kaltmiete: vereinnahmteKaltmiete(k.preis, k.mietrendite),
      nebenkosten: laufendeKosten(k.preis, k.gebaeudeanteil).summe,
      zins: k.zins,
    },
    afaVerlauf(k),
    ersparnisAus,
  );
}

/** Summe einer Spalte des Plans. */
const summe = (plan: ObjektJahr[], feld: (z: ObjektJahr) => number) =>
  plan.reduce((s, z) => s + feld(z), 0);

/** Das Vermögen nach zehn Jahren aus einem Plan. */
export function vermoegenAusPlan(
  preis: number,
  plan: ObjektJahr[],
  nebenkostenProzent: number,
): Vermoegen {
  const tilgung = summe(plan, (z) => z.tilgung);
  const wertsteigerung = preis * QUOTEN.wertsteigerung10J;
  const liquiditaet = summe(plan, (z) => z.cashflowNachSteuer);
  const eigenkapital = preis * (nebenkostenProzent / 100);
  const aufbau = tilgung + wertsteigerung;
  return {
    tilgung,
    wertsteigerung,
    aufbau,
    liquiditaet,
    eigenkapital,
    netto: aufbau + liquiditaet - eigenkapital,
    restschuld: preis - tilgung,
    ersparnis: summe(plan, (z) => z.ersparnis),
  };
}

/** Eine Zeile des Spannenverlaufs. Alle Beträge in Euro. */
export interface SpanneJahr {
  jahr: number;
  von: number;
  bis: number;
  vonKumuliert: number;
  bisKumuliert: number;
}

/**
 * Der Verlauf der Spanne, Jahr für Jahr, mit jährlichen Stützstellen.
 *
 * Er liest jetzt nur noch die beiden Pläne aus, statt daneben eine zweite
 * Rechnung mit Gewichten zu führen. Bewusst genau `BETRACHTUNG_JAHRE` Punkte:
 * Der Zinsverlauf ist auf zehn Jahre gerechnet, weiter trägt er nicht.
 */
export function spannenverlauf(s: Spanne): SpanneJahr[] {
  const zeilen: SpanneJahr[] = [];
  let vonKumuliert = 0;
  let bisKumuliert = 0;
  for (let i = 0; i < s.plan.length; i++) {
    const von = s.planSicher[i].ersparnis;
    const bis = s.plan[i].ersparnis;
    vonKumuliert += von;
    bisKumuliert += bis;
    zeilen.push({ jahr: s.plan[i].jahr, von, bis, vonKumuliert, bisKumuliert });
  }
  return zeilen;
}

/**
 * Die beiden Abschreibungswege und der Erhaltungsaufwand am typisierten Objekt.
 *
 * `ersparnisAus` ist die Differenzmethode des jeweiligen Falls: Sie bekommt
 * eine Minderung des zu versteuernden Einkommens und liefert die Steuer, die
 * dadurch wegfällt. So bleibt die Progression erhalten, statt platt mit dem
 * Grenzsteuersatz multipliziert zu werden. Genau darum sind beide Enden der
 * Spanne echte Rechenergebnisse.
 */
function spanneAusWegen(
  objekt: TypisiertesObjekt,
  ersparnisAus: (minderung: number) => number,
  nebenkostenProzent: number,
): Spanne {
  const gesetzlich = linearerAfaSatz(objekt.baujahr);

  const satzRegulaer = gesetzlich.satz;
  /* Nach unten ist die erhöhte Abschreibung nie schlechter als die gesetzliche,
     sonst wäre der Nachweis sinnlos. */
  const restnutzungsdauer = RESTNUTZUNGSDAUER_ANSATZ;
  const satzErhoeht = Math.max(satzRegulaer, 100 / restnutzungsdauer);

  /* Der SICHERE Weg mit dem gesetzlichen Satz und der LEITWEG mit dem
     angesetzten. Seit dem 17.09.2026 fuehrt die Seite mit dem Leitweg, deshalb
     heisst dessen Plan `plan` und der andere `planSicher`. Ausgewiesen werden
     weiterhin beide, und an der Zahl des Leitwegs steht immer die Bedingung. */
  const planSicher = objektplan(objekt, satzRegulaer, ersparnisAus);
  const plan = objektplan(objekt, satzErhoeht, ersparnisAus);

  const a = planSicher[0];
  const b = plan[0];
  const zehnJahreVon = summe(planSicher, (z) => z.ersparnis);
  const zehnJahreBis = summe(plan, (z) => z.ersparnis);

  /* Erhaltungsaufwand im ersten Jahr, zusätzlich zum laufenden Verlust.
     Bezugsgröße ist die 15-Prozent-Grenze aus afaSaetze.ts, mit dem
     Sicherheitsabstand aus ANSCHAFFUNGSNAH_SICHERHEIT. */
  const grenzeNetto =
    objekt.gebaeudewert * ANSCHAFFUNGSNAH_GRENZE * ANSCHAFFUNGSNAH_SICHERHEIT;
  const bruttoAufwand = grenzeNetto * (1 + UMSATZSTEUER);
  const ersparnisEinmaligRegulaer = Math.max(
    0,
    ersparnisAus(a.verlust + bruttoAufwand) - a.ersparnis,
  );
  const ersparnisEinmaligErhoeht = Math.max(
    0,
    ersparnisAus(b.verlust + bruttoAufwand) - b.ersparnis,
  );

  return {
    objekt,
    regulaer: {
      satz: satzRegulaer,
      afaJahr: a.afa,
      verlust: a.verlust,
      ersparnisJahr: a.ersparnis,
      grund: gesetzlich.grund,
      paragraf: gesetzlich.paragraf,
    },
    erhoeht: {
      satz: satzErhoeht,
      afaJahr: b.afa,
      verlust: b.verlust,
      ersparnisJahr: b.ersparnis,
      restnutzungsdauer,
    },
    mehrProJahr: Math.max(0, b.ersparnis - a.ersparnis),
    jahr1: { von: a.ersparnis, bis: b.ersparnis },
    zehnJahre: { von: zehnJahreVon, bis: zehnJahreBis },
    plan,
    planSicher,
    vermoegen: vermoegenAusPlan(objekt.preis, plan, nebenkostenProzent),
    /* Der Faktor gehoert zum Leitweg, denn dessen Zahlen stehen oben. */
    faktor10J: b.ersparnis > 0 ? zehnJahreBis / b.ersparnis : 0,
    /* Die Nutzungsdauer hinter dem gesetzlichen Satz, also der Maßstab aus
       § 7 Abs. 4 Satz 2 EStG. Sie steht in den Annahmen neben der angesetzten,
       damit der Abstand sichtbar ist, den ein Gutachten tragen muesste. */
    nutzungsdauerGesetzlich: typisierteNutzungsdauer(satzRegulaer),
    erhaltung: {
      grenzeNetto,
      bruttoAufwand,
      anteilProzent:
        ANSCHAFFUNGSNAH_GRENZE * ANSCHAFFUNGSNAH_SICHERHEIT * (1 + UMSATZSTEUER) * 100,
      ersparnisEinmaligRegulaer,
      ersparnisEinmaligErhoeht,
      ersparnisEinmalig: Math.max(ersparnisEinmaligRegulaer, ersparnisEinmaligErhoeht),
    },
  };
}

export function berechne(e: SteuerEingaben): Ergebnis {
  const brutto = Math.max(0, e.jahresbrutto);
  const veranlagung = VERANLAGUNG[e.steuerklasse];
  const partnerBrutto =
    veranlagung === "splitting"
      ? Math.max(0, e.partnerBrutto ?? partnerBruttoVorschlag(brutto, e.steuerklasse))
      : 0;

  const eingaben: SteuerEingaben = { ...e, jahresbrutto: brutto, partnerBrutto };
  const zvE = zvEAusBrutto(brutto, eingaben);

  /*
   * Bereits vorhandene Objekte haben einen Teil des Hebels aufgebraucht.
   *
   * Hier standen bis zum 17.09.2026 pauschal 20.000 Euro je Objekt. Die Zahl
   * war nirgends hergeleitet und nirgends auf der Seite genannt, und sie war
   * viel zu gross: Bei 85.000 Euro Jahresbrutto und der Antwort „drei oder
   * mehr“ zog sie 60.000 Euro vom zu versteuernden Einkommen ab. Die Steuer
   * fiel auf null, und die ganze Ergebnisseite zeigte lauter Nullen, bis hin
   * zu „Heute führst du ab 0 Euro Steuern im Jahr“.
   *
   * Jetzt ist der Abzug hergeleitet: Wer schon Objekte hält, hat daraus
   * Verluste in der Grössenordnung, die auch das typisierte Objekt erzeugt.
   * Genau diesen Verlust setzt das Modell je bestehendem Objekt an. Damit ist
   * die Zahl erklärbar, sie steht auf der Seite, und sie kann das Ergebnis
   * nicht mehr auf null ziehen.
   */
  const objekt = typisiertesObjekt(brutto);
  const verlustJeBestand = objektplan(objekt, 100 / RESTNUTZUNGSDAUER_ANSATZ, () => 0)[0].verlust;
  const bereitsGenutzt = Math.max(0, e.bestehendeImmobilien) * verlustJeBestand;
  const zvEHeute = Math.max(0, zvE - bereitsGenutzt);
  const vorher = steuerlastAusZvE(zvEHeute, eingaben);

  /* Der Grenzsteuersatz gehört an die Stelle, an der auch gerechnet wird, also
     an das zvE NACH den bestehenden Objekten. Vorher zeigte die Seite den Satz
     am vollen zvE und die Ersparnis am gekürzten, und beides passte nicht
     zusammen. */
  const gs = grenzsteuersatz(zvEHeute, e.steuerklasse);

  const beschaeftigung = beschaeftigungFuer(e.beschaeftigung);
  const anerkannt = anerkanntesEinkommen(brutto, e.beschaeftigung);
  const klasse = empfohleneKlasse(anerkannt, e.bestehendeImmobilien);
  const verlust = verlustProObjekt(klasse); // negativ

  /* Wirkung von genau EINEM Objekt dieser Klasse. */
  const zvENachEinemObjekt = Math.max(0, zvEHeute + verlust);
  const nachher = steuerlastAusZvE(zvENachEinemObjekt, eingaben);
  const ersparnisJahr = Math.max(0, vorher.summe - nachher.summe);

  /* Steuerersparnis nach der Differenzmethode: einmal die Steuer ohne, einmal
     mit der Minderung, und die Differenz. NICHT Minderung mal Grenzsteuersatz,
     das rechnet den Progressionsverlauf weg und faellt bei grossen Betraegen
     zu hoch aus. */
  const ersparnisAus = (minderung: number) =>
    Math.max(
      0,
      vorher.summe - steuerlastAusZvE(Math.max(0, zvEHeute - Math.max(0, minderung)), eingaben).summe,
    );

  // Eine Vorgabe schlägt das Bundesland: Sie kommt von einem Aufrufer, der
  // weiß, dass er die Lage der Immobilie noch gar nicht kennt.
  const nebenkostenProzent = e.nebenkostenProzentVorgabe ?? kaufnebenkostenProzent(e.bundesland);
  const spanne = spanneAusWegen(objekt, ersparnisAus, nebenkostenProzent);

  /*
   * Der Zehnjahresplan der empfohlenen Assetklasse, auf dem die Mikroseite
   * steht. Er ersetzt drei Abkuerzungen auf einen Schlag:
   *
   *   1  `ersparnis10J` war `ersparnisJahr` mal einem gesetzten Faktor, 5 beim
   *      Neubau und 8,5 sonst. Jetzt ist es die Summe der zehn Jahre.
   *   2  `freieLiquiditaet10J` kam aus `QUOTEN.nettoLiquiditaet10J`, einer
   *      Quote aus einer fremden Kalkulation. Sie war POSITIV, obwohl dasselbe
   *      Modell eine monatliche Zuzahlung ergibt. Jetzt ist es die Summe der
   *      eigenen Cashflows, und sie darf negativ sein.
   *   3  `tilgung10J` kam aus `QUOTEN.tilgung10J`. Jetzt aus dem Tilgungsplan
   *      in `finanzierung.ts`, mit dem Zins und der Tilgung, die ueberall
   *      gelten.
   */
  const plan = klassenplan(klasse, ersparnisAus);
  const vermoegen = vermoegenAusPlan(klasse.preis, plan, nebenkostenProzent);
  const ersparnis10J = vermoegen.ersparnis;

  /* Wie viele Objekte waeren fuer das gewaehlte Ziel noetig? */
  const zielSteuer = vorher.summe * (1 - HEBEL_ANTEIL[e.hebelziel]);
  let anzahl = 0;
  for (let n = 1; n <= 40; n++) {
    const neuesZvE = Math.max(0, zvEHeute + n * verlust);
    anzahl = n;
    if (steuerlastAusZvE(neuesZvE, eingaben).summe <= zielSteuer) break;
  }

  const preis = klasse.preis;
  const afaJahr1 = afaErstesJahr(klasse);
  const tilgung10J = vermoegen.tilgung;
  const wertsteigerung10J = vermoegen.wertsteigerung;
  const eigenkapital = vermoegen.eigenkapital;
  const freieLiquiditaet10J = vermoegen.liquiditaet;
  /* Wie viel der Ersparnis in die Luecke zwischen Miete und Rate geht: genau
     so viel, wie der Zahlungsstrom VOR Steuer im Minus liegt, hoechstens aber
     die ganze Ersparnis. Reicht sie nicht, bleibt der Rest beim Kaeufer, und
     genau dann ist `freieLiquiditaet10J` negativ. */
  const lueckeVorSteuer = Math.max(0, -plan.reduce((a, z) => a + z.cashflowVorSteuer, 0));
  const ersparnisFuerRaten = Math.min(ersparnis10J, lueckeVorSteuer);
  const anteilAmObjekt = vermoegen.aufbau;

  return {
    brutto,
    partnerBrutto,
    veranlagung,
    zvE,
    bereitsGenutzt,
    zvEHeute,
    grenzsteuersatz: gs,
    kinderfreibetrag: e.kinder * FREIBETRAG_KIND * kinderfreibetragAnteil(e.steuerklasse),
    vorher,
    nachher,
    steuer10J: vorher.summe * 10,
    klasse,
    beschaeftigung,
    anerkanntesEinkommen: anerkannt,
    spanne,
    afaJahr1,
    ersparnisJahr,
    ersparnis10J,
    anzahlFuerZiel: anzahl,
    tilgung10J,
    wertsteigerung10J,
    anteilAmObjekt,
    nebenkostenProzent,
    eigenkapital,
    ersparnisFuerRaten,
    freieLiquiditaet10J,
    vermoegenszuwachs: vermoegen.netto,
    plan,
    vermoegen,
  };
}
