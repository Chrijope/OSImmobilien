/**
 * Der Vorab-Score eines Bewerbers, berechnet aus dem eingereichten Bogen.
 *
 * Er misst NICHT das Gespräch (das tut `berechneAssessmentScore` in
 * `assessmentSkript.ts`), sondern nur das, was der Bewerber vorher schriftlich
 * angegeben hat. Er beantwortet genau eine Frage: **Wen laden wir zuerst ein?**
 * Er ist eine Reihenfolge und kein Urteil.
 *
 * ## Zwei Bögen, eine Skala
 *
 * Beide Bögen schreiben in dieselbe Spalte `bewerber_formular.antworten`:
 *
 *   - der alte Vorabbogen aus `bewerberFormular.ts`
 *   - das neue Kennenlernen aus `bewerberKennenlernen.ts`, erkennbar am
 *     gewählten Weg (`istKennenlernen`)
 *
 * Bewertet werden ausschließlich Merkmale, die es in mindestens einem der
 * beiden Bögen wirklich gibt. Was nur der alte Bogen fragt, ist als
 * `nurAltbogen` gekennzeichnet, was nur das Kennenlernen fragt, als
 * `nurKennenlernen`, und die Fragen der fünf Wege stehen je Weg getrennt.
 *
 * ## Am 08.09.2026 entfernt
 *
 * `erfahrungsdauer`, `immoSchwerpunkt` und `findiSparten`. Diese drei Fragen
 * stellt das Kennenlernen nicht mehr. Ein Wert aus dem alten Bogen und einer
 * aus dem neuen entstanden dadurch nicht auf derselben Grundlage und waren
 * nicht vergleichbar. Was sie gemessen haben, messen jetzt die Fragen des
 * jeweiligen Wegs: die Zahl der Abschlüsse auf Weg 1, der Beratungsschwerpunkt
 * auf Weg 2, die Verkaufserfahrung auf Weg 4.
 *
 * Ebenfalls entfallen ist der Bonus für ein eigenes Netzwerk beim Hintergrund.
 * Im Kennenlernen wird `netzwerk` aus `leadPraeferenz` abgeleitet, der Bonus
 * hätte dieselbe Aussage ein zweites Mal gezählt. Das eigene Netzwerk trägt
 * jetzt allein `leadPraeferenz`.
 *
 * ## So wird gerechnet
 *
 *   1. Für diesen Bewerber wird ermittelt, welche Merkmale sein Bogen ihm
 *      überhaupt vorgelegt hat (`merkmaleFuer`). Ein Quereinsteiger wird nicht
 *      an den Fragen des Immobilienverkäufers gemessen und umgekehrt.
 *   2. Jede beantwortete Frage bringt Punkte und erhöht zugleich die
 *      erreichbare Höchstzahl. Eine unbeantwortete Frage zählt in keiner der
 *      beiden Summen. Wer eine Frage nie gesehen hat oder eine freiwillige
 *      leer lässt, wird dafür also nicht bestraft.
 *   3. Die Summe wird auf 0 bis 100 umgerechnet, bezogen auf genau die Fragen,
 *      die er beantwortet hat. Damit sind alle fünf Wege vergleichbar, obwohl
 *      sie verschieden viele Punkte hergeben.
 *   4. Einstufung: A ab 80 (sehr passend), B ab 60 (passend), darunter C
 *      (mit Vorbehalt).
 *   5. `posten` gibt die Aufschlüsselung zurück: jedes Merkmal mit der Antwort
 *      des Bewerbers, seinen Punkten und dem, was dort erreichbar war. Die
 *      HR-Managerin sieht damit, woraus sich die Zahl ergibt, und nicht nur
 *      die Zahl.
 *
 * Zum Justieren reicht es, die Punkte in `MERKMALE` und `WEG_MERKMALE` oder
 * die beiden Schwellen zu ändern.
 */

import {
  FORMULAR_FRAGEN,
  antwortText as antwortTextAlt,
  frageSichtbar as frageSichtbarAlt,
  getFrage,
  type FormularAntworten,
} from "./bewerberFormular";
import {
  WEGE,
  ansichtenFuer,
  antwortText as antwortTextNeu,
  frageSichtbar as frageSichtbarNeu,
  istKennenlernen,
  type WegId,
} from "./bewerberKennenlernen";

export type VorabEinstufung = "A" | "B" | "C";

/**
 * Ab so vielen von 100 Punkten gilt die Einstufung.
 *
 * Bis zum 08.09.2026 lagen sie bei 75 und 50. Die Skala trägt seither mehr
 * Merkmale, und ein ernsthafter Bewerber bedient fast alle davon: Er hat
 * verstanden, dass es kein Fixum gibt, er nennt ein Ziel, er markiert Themen.
 * Dieselbe Eignung ergibt damit eine höhere Zahl. Die Schwellen sind deshalb
 * mitgezogen, sonst wäre A keine Auszeichnung mehr, sondern der Normalfall.
 */
export const VORAB_SCHWELLE_A = 80;
export const VORAB_SCHWELLE_B = 60;

export const VORAB_EINSTUFUNG_LABELS: Record<VorabEinstufung, string> = {
  A: "A · sehr passend",
  B: "B · passend",
  C: "C · mit Vorbehalt",
};

/** Auf welchem der beiden Bögen ein Score beruht. */
export type BogenHerkunft = "kennenlernen" | "vorabbogen" | "unbekannt";

/**
 * Woher der Score stammt, seit dem 16.09.2026.
 *
 * ## Warum die naheliegenden Merkmale nicht taugen
 *
 * Das Kennzeichen `bogen: "kennenlernen"`, das der Versand beim Anlegen der
 * Zeile setzt, überlebt das Abschicken nicht: `submit-bewerber-formular`
 * ersetzt die ganze Spalte `antworten` durch die zod-geprüften Angaben, und
 * `bogen` steht in diesem Schema nicht. An einer eingereichten Zeile ist es
 * also immer weg. `istKennenlernZeile` aus `kennenlernenLink.ts` bleibt
 * trotzdem richtig, denn dort geht es um offene, noch nicht abgeschickte
 * Zeilen. Für einen Score, den es nur nach dem Abschicken gibt, ist es das
 * falsche Merkmal.
 *
 * ## Woran es stattdessen hängt
 *
 * An den Schlüsseln der Antworten selbst. Beide Bögen schicken ausschließlich
 * die Schlüssel ihres eigenen Katalogs: Der frühere Vorabbogen baut sein Paket
 * in `antwortenZumSenden` aus `FORMULAR_FRAGEN`, der Kennenlernbogen aus
 * seinen eigenen Ansichten (`KENNENLERNEN_KEYS`). Ein Schlüssel, den nur einer
 * der beiden Kataloge kennt, ist deshalb ein Beleg und keine Vermutung.
 *
 * Wie sicher das ist: Beide Listen enthalten Pflichtfragen, die jeder Bogen in
 * jeder seiner Fassungen gestellt hat. Im Vorabbogen sind das `beschaeftigung`
 * und `taetigkeit`, seit der allerersten Fassung vom 19.08.2026. Im
 * Kennenlernbogen ist es die Weiche `weg`, seit seiner ersten Fassung vom
 * 06.09.2026; ohne Antwort darauf bleibt der Weiter-Knopf gesperrt. Ein
 * eingereichter Bogen ohne jedes dieser Merkmale ist damit nicht vorgesehen.
 *
 * `unbekannt` ist trotzdem ein eigener Zustand und keine Notlüge: Eine falsche
 * Kennzeichnung wäre schlechter als gar keine, weil die HR-Managerin danach
 * entscheidet, wen sie zuerst einlädt.
 *
 * Nach dem Einreichungsdatum wird bewusst nicht gefragt, obwohl es den
 * Kennenlernbogen erst seit dem 06.09.2026 gibt. Das wäre eine zweite Wahrheit
 * neben den Antworten, und sie wäre schwächer: Sie hinge an einer Zahl im
 * Kalender statt an dem, was der Bewerber wirklich ausgefüllt hat.
 */
export const NUR_KENNENLERNBOGEN: string[] = [
  "weg",
  "wegAntwort1",
  "wegAntwort1Frei",
  "wegAntwort2",
  "wegAntwort2Frei",
  "wegAntwort3",
  "passung",
  "verstaendnisFixum",
  "verstaendnisProvision",
  "arbeitsform",
  "leadErfahrung",
  "leadQuote",
  "gewerbe",
  "erlaubnis34c",
  "erlaubnis34cBegruendung",
  "themen",
  "eigeneFrage",
];

/**
 * Schlüssel, die nur der frühere Vorabbogen schreiben kann.
 *
 * `motivation` steht mit darin, obwohl der Katalog die Frage längst nicht mehr
 * stellt. In den Akten vom August 2026 steht ihre Antwort aber noch, und dort
 * ist sie ein Beleg.
 *
 * `erreichbarkeit` steht ausdrücklich NICHT darin, obwohl es danach aussieht.
 * Der Kennenlernbogen hat diese Frage bis zum 08.09.2026 ebenfalls gestellt,
 * sie steht seither in seinen `ALTFRAGEN`. Als Merkmal würde sie einen frühen
 * Kennenlernbogen zum Vorabbogen erklären. Das ist die Falle, die dieser
 * Kommentar offenhält.
 */
export const NUR_VORABBOGEN: string[] = [
  "region",
  "beschaeftigung",
  "taetigkeit",
  "erfahrungsdauer",
  "immoSchwerpunkt",
  "findiSparten",
  "erwartung",
  "einsatz",
  "motivation",
];

export function bogenHerkunft(antworten: FormularAntworten | null | undefined): BogenHerkunft {
  if (!antworten) return "unbekannt";
  const hat = (keys: string[]) => keys.some((k) => istBeantwortet(antworten[k]));
  // Der Kennenlernbogen zuerst: Er ist der ausführlichere, und beide Listen
  // können nach Lage der Dinge nicht gleichzeitig zutreffen.
  if (hat(NUR_KENNENLERNBOGEN)) return "kennenlernen";
  if (hat(NUR_VORABBOGEN)) return "vorabbogen";
  return "unbekannt";
}

/** Ein bewertetes Merkmal, also eine Frage mit Punkten. */
export type VorabMerkmal = {
  /** Schlüssel in `bewerber_formular.antworten`. */
  key: string;
  /** Beschriftung in der Aufschlüsselung. */
  label: string;
  /** Punkte je Antwortwert. Fehlt ein Wert, bringt er null Punkte. */
  punkte?: Record<string, number>;
  /**
   * Mehrfachauswahl: Die Häkchen werden addiert statt das beste zu nehmen.
   * Gedeckelt auf `maxPunkte`.
   */
  summiert?: boolean;
  /** Freitext: eigene Bewertung, weil es keine Antwortliste gibt. */
  bewerteText?: (text: string) => number;
  /**
   * Was in der Aufschlüsselung anstelle der Antwort steht.
   *
   * Nur für Freitexte gesetzt, deren Wortlaut in eine Punkteliste nicht
   * hineingehört: Er wäre zu lang, und in der Vorwissen-Karte stünde er
   * daneben ein zweites Mal. Was er geschrieben hat, liest man dort im
   * Original, hier zählt nur, dass er es getan hat.
   */
  kurzform?: string;
  /** Was hier höchstens erreichbar ist. Steht ausdrücklich da, nicht abgeleitet. */
  maxPunkte: number;
  /** Diese Frage stellt nur der alte Vorabbogen. */
  nurAltbogen?: boolean;
  /** Diese Frage stellt nur das neue Kennenlernen. */
  nurKennenlernen?: boolean;
  /** Freiwillig: Fehlt die Antwort, gilt der Bogen deswegen nicht als unvollständig. */
  freiwillig?: boolean;
  /** Warum das Merkmal zählt. Steht als Erklärung in der Aufschlüsselung. */
  warum: string;
};

/** Punkte für ein Freitextfeld, gestuft nach dem, was wirklich dasteht. */
function textPunkte(text: string, kurz: number, mittel: number, lang: number): number {
  const t = text.trim();
  if (t.length >= 120) return lang;
  if (t.length >= 40) return mittel;
  return kurz;
}

/** Die erste Zahl in einem Text, etwa die 2 aus „2 von 10". */
function ersteZahl(text: string): number | null {
  const treffer = text.match(/\d+(?:[.,]\d+)?/);
  if (!treffer) return null;
  const zahl = Number(treffer[0].replace(",", "."));
  return Number.isFinite(zahl) ? zahl : null;
}

/**
 * Die getippte Quote „Abschlüsse aus zehn Leads".
 *
 * Sie ist eine Behauptung und keine Messung, deshalb wird sie bewusst flach
 * bewertet und nach oben gedeckelt.
 *
 * Die volle Punktzahl gibt es für eine plausible Quote, also für zwei bis fünf
 * von zehn: Der Teamdurchschnitt liegt bei gut zwei von zehn, wer dort liegt,
 * ist gut. Eine Zahl weit darüber bringt weniger, nicht weil sie falsch sein
 * muss, sondern weil sie unbelegt ist und ins Gespräch gehört. Wer null
 * angibt, hat ehrlich geantwortet und wird dafür nicht abgestraft, bekommt
 * aber auch keine Erfahrung gutgeschrieben, die sich nie in Abschlüssen
 * gezeigt hat.
 *
 * Die übliche, ehrliche Antwort bringt damit die volle Zahl. Das ist Absicht:
 * Das Feld ist freiwillig, und wer es ausfüllt, soll dadurch nicht schlechter
 * dastehen als jemand, der es überspringt.
 */
function leadQuotePunkte(text: string): number {
  const zahl = ersteZahl(text);
  if (zahl === null) return 4;
  if (zahl <= 0) return 3;
  if (zahl < 2) return 5;
  if (zahl <= 5) return 6;
  return 4;
}

/**
 * Die Merkmale, die beide Bögen oder nur einer von beiden kennt.
 *
 * Gewichtung in Worten:
 *   stark   Zeit pro Woche (18), Herkunft der ersten Kunden (10), Perspektive (10)
 *   mittel  Start (8), Gewerbe und 34c (8), der gewählte Weg (8), die beiden
 *           Verständnisfragen (je 5), Einkommensziel (6)
 *   leicht  Passung (4), eigene Themen (3), eigene Frage (3), Freitexte (2)
 */
export const MERKMALE: VorabMerkmal[] = [
  {
    key: "zeitProWoche",
    label: "Zeit pro Woche",
    maxPunkte: 18,
    punkte: { vollzeit: 18, "10_bis_20": 11, unter_10: 2 },
    warum:
      "Wer zwanzig Stunden mitbringt, führt früher Gespräche und kommt schneller in die ersten " +
      "Abschlüsse. Der Bogen nennt es selbst die einzige Angabe, die eine Zusammenarbeit " +
      "praktisch unmöglich machen kann.",
  },
  {
    /*
     * Der gewählte Weg, bewusst mit kleiner Spanne.
     *
     * Das Haus sucht ausdrücklich beide: „die einen, weil sie ihr Handwerk
     * beherrschen, die anderen, weil sie hier anfangen und es richtig lernen
     * wollen." Ein Quereinsteiger darf daran deshalb nicht scheitern. Zwischen
     * bester und schwächster Antwort liegen vier Punkte von rund hundert; wer
     * neu anfängt, kann trotzdem die oberste Stufe erreichen. Unterschieden
     * wird stattdessen INNERHALB des Wegs, siehe `WEG_MERKMALE`.
     *
     * Im Kennenlernen wird der Wert aus dem Weg abgeleitet, im alten Bogen war
     * es eine eigene Mehrfachauswahl. `netzwerk` steht mit null darin, weil es
     * keine Branche ist: Das eigene Netzwerk trägt `leadPraeferenz`.
     */
    key: "hintergrund",
    label: "Hintergrund",
    maxPunkte: 8,
    /*
     * `immo_umfeld` ist seit dem 09.09.2026 der Wert von Weg 4, „Ich kenne
     * Immobilien, aber nicht aus dem Verkauf". Vorher schrieb Weg 4 denselben
     * Wert wie Weg 1, und wer nie eine Wohnung verkauft hat, bekam dieselben
     * acht Punkte wie jemand mit zwölf Abschlüssen im Jahr. Sieben Punkte
     * liegen bewusst zwischen Immobilienverkauf und Vertrieb: Die Kenntnis des
     * Objekts zählt, der fehlende Verkauf kostet einen Punkt.
     */
    punkte: { immo: 8, immo_umfeld: 7, findi: 7, vertrieb: 6, quereinsteiger: 4, netzwerk: 0 },
    warum:
      "Ein Immobilienverkäufer bringt anderes mit als ein Quereinsteiger. Die Spanne ist bewusst " +
      "klein, weil wir beide suchen.",
  },
  {
    key: "perspektive",
    label: "Perspektive",
    maxPunkte: 10,
    punkte: { sofort_haupt: 10, spaeter_haupt: 8, dauerhaft_neben: 4, unklar: 1 },
    warum: "Wer den Schwerpunkt hierher verlegen will, geht intensiver in die Zusammenarbeit.",
  },
  {
    /*
     * Die Herkunft der ersten Kunden, und die Reihenfolge ist begründet.
     *
     * „Beides" ist die stärkste Antwort: Der Partner fängt sofort im eigenen
     * Netzwerk an UND ist bereit, in Leads zu investieren. Zwei Quellen, der
     * schnellste Start, und er trägt einen Teil des Aufwands selbst.
     *
     * „Eigenes Netzwerk" steht knapp davor vor „offen für Leads", nicht
     * dahinter: Er bringt eigene Abschlüsse mit, ohne dass wir Leads stellen
     * müssen, und er hängt nicht an unserem Nachschub. Die Bereitschaft zu
     * investieren ist trotzdem ein starkes Zeichen, deshalb liegt „Leads" nur
     * einen Punkt darunter und deutlich über allem, was keinen Plan nennt.
     *
     * „Weiß ich noch nicht" ist die schwächste Antwort: kein Netzwerk, keine
     * Investitionsbereitschaft, kein Akquiseplan.
     */
    key: "leadPraeferenz",
    label: "Herkunft der ersten Kunden",
    maxPunkte: 10,
    punkte: { beides: 10, eigen: 8, leads: 7, unklar: 1 },
    warum:
      "Beides ist am stärksten: eigenes Netzwerk und Bereitschaft, in Leads zu investieren. Wer " +
      "gar keinen Weg nennt, hat noch keinen Plan, woher sein erstes Gespräch kommt.",
  },
  {
    key: "startzeitpunkt",
    label: "Start",
    maxPunkte: 8,
    punkte: { sofort: 8, vier_wochen: 6, zwei_drei_monate: 3, umschauen: 0 },
    warum: "Sofort ist besser als „ich schaue mich erst einmal um“.",
  },
  {
    /*
     * Gewerbe und Erlaubnis in einem Merkmal.
     *
     * Das Kennenlernen fragt beides getrennt und setzt den Sammelwert beim
     * Absenden zusammen (`gewerbe34cAbgeleitet`), der alte Bogen fragt ihn
     * direkt. Bewertet wird deshalb der Sammelwert: So entsteht aus beiden
     * Bögen dieselbe Zahl.
     *
     * Mit einer Verfeinerung: Der Sammelwert kennt „ist beantragt" nicht und
     * wirft ihn mit „noch nicht vorhanden" zusammen. Wer den Antrag laufen hat,
     * bekäme damit dieselbe Bewertung wie jemand, der noch gar nichts getan
     * hat, obwohl er Wochen weiter ist. `verfeinereErlaubnis` holt den
     * Unterschied aus der Rohantwort zurück, sofern sie vorliegt. Ältere Bögen
     * ohne diese Angabe bleiben beim Sammelwert.
     */
    key: "gewerbe34c",
    label: "Gewerbe und 34c",
    maxPunkte: 8,
    punkte: {
      beides: 8,
      gewerbe_und_beantragt: 7,
      nur_gewerbe: 5,
      nur_beantragt: 4,
      keines: 2,
      im_gespraech: 1,
    },
    warum:
      "Wer die Erlaubnis nach Paragraf 34c hat, kann sofort loslegen. Wer sie beantragen muss, " +
      "braucht dafür Wochen. Ein laufender Antrag zählt deshalb mehr als gar keiner.",
  },
  {
    key: "einkommensziel",
    label: "Einkommensziel",
    maxPunkte: 6,
    punkte: { ueber_10000: 6, "5000_10000": 6, "2000_5000": 3, bis_2000: 1, unklar: 1 },
    warum:
      "Ein Ziel ab 5.000 Euro entspricht etwa einem Abschluss alle zwei Monate und trägt die " +
      "Zusammenarbeit. Ein sehr kleines Ziel und gar kein Ziel sagen dasselbe: Es ist noch nicht " +
      "durchgerechnet.",
  },
  {
    key: "verstaendnisFixum",
    label: "Verständnis Fixum",
    maxPunkte: 5,
    nurKennenlernen: true,
    punkte: { nein: 5, ja: 0 },
    warum:
      "Wer verstanden hat, dass es kein festes Monatsgehalt gibt, springt später nicht ab. Die " +
      "falsche Antwort ist kein Ausschluss, sie kostet nur diese Punkte.",
  },
  {
    key: "verstaendnisProvision",
    label: "Verständnis Provision",
    maxPunkte: 5,
    nurKennenlernen: true,
    punkte: { nein: 5, ja: 0 },
    warum:
      "Wer weiß, dass ein übergebener Kontakt nicht von selbst zur Provision wird, erwartet nichts " +
      "Falsches von Leads.",
  },
  {
    /*
     * Bewusst leicht gewichtet. Der Bogen verspricht dem Bewerber ausdrücklich
     * „ein fehlendes Häkchen ist kein Ausschluss". Wer ehrlich nur zwei von
     * vier setzt, darf dafür nicht abstürzen.
     */
    key: "passung",
    label: "Grundsätzliche Passung",
    maxPunkte: 4,
    nurKennenlernen: true,
    freiwillig: true,
    summiert: true,
    punkte: { selbststaendig: 1, variabel: 1, akquise: 1, zeitplan: 1 },
    warum: "Je mehr er für sich entschieden hat, desto weniger bleibt im Gespräch offen.",
  },
  {
    key: "themen",
    label: "Eigene Themen",
    maxPunkte: 3,
    nurKennenlernen: true,
    freiwillig: true,
    summiert: true,
    punkte: {
      verdienst: 1, kosten: 1, zeit: 1, einstieg: 1, objekte: 1, formales: 1, leads: 1,
    },
    warum: "Wer konkrete Themen markiert, hat sich mit der Sache beschäftigt.",
  },
  {
    key: "eigeneFrage",
    label: "Eigene Frage",
    maxPunkte: 3,
    nurKennenlernen: true,
    freiwillig: true,
    bewerteText: (t) => textPunkte(t, 2, 3, 3),
    kurzform: "eigene Frage gestellt",
    warum: "Eine eigene Frage ist die einzige Angabe im ganzen Bogen, die wir nicht erraten können.",
  },
  {
    key: "leadErfahrung",
    label: "Bisherige Arbeit mit Leads",
    maxPunkte: 4,
    nurKennenlernen: true,
    freiwillig: true,
    bewerteText: (t) => textPunkte(t, 2, 3, 4),
    kurzform: "Lead-Erfahrung beschrieben",
    warum:
      "Wer schon mit gekauften oder zugeteilten Leads gearbeitet hat, weiß, was Geschwindigkeit " +
      "und Nachfassen bedeuten. Steht auf den Wegen 1 bis 4 und ist dort freiwillig.",
  },
  {
    key: "leadQuote",
    label: "Abschlüsse aus zehn Leads",
    maxPunkte: 6,
    nurKennenlernen: true,
    freiwillig: true,
    bewerteText: leadQuotePunkte,
    warum:
      "Eine getippte Quote ist eine Behauptung und keine Messung. Sie zählt deshalb gedeckelt: " +
      "eine plausible Zahl bringt am meisten, eine sehr hohe weniger.",
  },
  {
    key: "erwartung",
    label: "Erwartung an uns",
    maxPunkte: 2,
    nurAltbogen: true,
    freiwillig: true,
    bewerteText: (t) => textPunkte(t, 1, 2, 2),
    kurzform: "Erwartung beschrieben",
    warum: "Wer schreibt statt zu überspringen, hat sich Mühe gegeben.",
  },
  {
    key: "einsatz",
    label: "Was er einbringt",
    maxPunkte: 2,
    nurAltbogen: true,
    freiwillig: true,
    bewerteText: (t) => textPunkte(t, 1, 2, 2),
    kurzform: "Einsatz beschrieben",
    warum: "Wer schreibt statt zu überspringen, hat sich Mühe gegeben.",
  },
];

/**
 * Die Fragen der fünf Wege.
 *
 * Sie tragen auf jedem Weg dieselben Schlüssel `wegAntwort1` bis
 * `wegAntwort3`, meinen aber jedes Mal etwas anderes. Deshalb stehen sie je
 * Weg getrennt und nicht in `MERKMALE`.
 *
 * Jeder Weg gibt genau zwanzig Punkte her. Das ist Absicht: Der Weg selbst
 * verschiebt die Skala damit nicht, unterschieden wird innerhalb des Wegs.
 * Genau deshalb kann ein starker Quereinsteiger dieselbe Stufe erreichen wie
 * ein starker Immobilienverkäufer.
 */
export const WEG_MERKMALE: Record<WegId, VorabMerkmal[]> = {
  weg1: [
    {
      key: "wegAntwort1",
      label: "Abschlüsse im letzten Jahr",
      maxPunkte: 12,
      punkte: { ueber_10: 12, "4_bis_10": 10, "1_bis_3": 6, keine: 1 },
      warum:
        "Die Zahl der Abschlüsse sagt mehr über die Erfahrung als die Zahl der Jahre. Ersetzt die " +
        "frühere Frage nach der Erfahrungsdauer.",
    },
    {
      key: "wegAntwort3",
      label: "Käufertyp heute",
      maxPunkte: 8,
      punkte: { anleger: 8, gemischt: 6, eigennutzer: 2 },
      warum:
        "Bei uns kauft niemand zum Einziehen. Wer heute schon Kapitalanleger berät, führt genau " +
        "unser Gespräch. Ersetzt die frühere Frage nach dem Immobilien-Schwerpunkt.",
    },
  ],
  weg2: [
    {
      key: "wegAntwort1",
      label: "Beratungsschwerpunkte",
      maxPunkte: 6,
      punkte: { baufi: 6, kapitalanlage: 6, steuern: 5, vorsorge: 4, versicherung: 2, sonstiges: 1 },
      warum:
        "Baufinanzierung und Kapitalanlage liegen unserem Thema am nächsten. Ersetzt die frühere " +
        "Frage nach den Beratungsfeldern.",
    },
    {
      key: "wegAntwort2",
      label: "Eigene Kundengewinnung",
      maxPunkte: 6,
      punkte: { bestand: 6, empfehlung: 5, marketing: 5, gemischt: 4, firma: 1 },
      warum:
        "Bei uns gewinnt er seine Kunden selbst. Wer das heute schon tut, muss es nicht erst lernen.",
    },
    {
      key: "wegAntwort3",
      label: "Immobilie in der Beratung",
      maxPunkte: 8,
      punkte: { regelmaessig: 8, gelegentlich: 6, nie_frage_kommt: 4, nie: 1 },
      warum: "Wer die Immobilie schon eingebaut hat, braucht dafür keinen neuen Gesprächsanlass.",
    },
  ],
  weg3: [
    {
      key: "wegAntwort1",
      label: "Was er heute verkauft",
      maxPunkte: 4,
      bewerteText: (t) => textPunkte(t, 2, 4, 4),
      warum: "Vertrieb ist nicht gleich Vertrieb. Wer es genau beschreibt, hat es auch getan.",
    },
    {
      key: "wegAntwort2",
      label: "Länge des Verkaufszyklus",
      maxPunkte: 8,
      punkte: { monate: 8, laenger: 8, wochen: 5, tag: 1 },
      warum:
        "Vom ersten Gespräch bis zur Beurkundung vergehen acht bis zehn Wochen. Wer lange Zyklen " +
        "gewohnt ist, hält das aus; genau daran stolpern erfahrene Vertriebler am häufigsten.",
    },
    {
      key: "wegAntwort3",
      label: "Herkunft der Kunden",
      maxPunkte: 8,
      punkte: { selbst: 8, gemischt: 6, firma: 1 },
      warum: "Wer seine Kunden bisher gestellt bekam, fängt bei uns mit dem Schwersten an.",
    },
  ],
  weg4: [
    {
      key: "wegAntwort1",
      label: "Berührung mit Immobilien",
      maxPunkte: 7,
      punkte: { eigenbestand: 7, finanzierung: 7, bewertung: 6, vermietung: 4, verwaltung: 4, bau: 4 },
      warum:
        "Eigener Bestand und Finanzierung liegen dem Investmentgespräch am nächsten. Was er weiß, " +
        "kann man nicht schnell nachlernen.",
    },
    {
      key: "wegAntwort2",
      label: "Verkaufserfahrung",
      maxPunkte: 7,
      punkte: { regelmaessig: 7, beraten: 5, gelegentlich: 3, nichts: 1 },
      warum: "Was fehlt, ist der Verkauf. Er ist lernbar, aber er kostet Zeit.",
    },
    {
      key: "wegAntwort3",
      label: "Was bisher bremste",
      maxPunkte: 6,
      punkte: { jetzt: 6, nicht_gebraucht: 4, gelegenheit: 3, zutrauen: 1 },
      warum: "„Nichts, ich will es jetzt“ ist eine Entscheidung. Fehlendes Zutrauen ist eine offene Frage.",
    },
  ],
  weg5: [
    {
      key: "wegAntwort1",
      label: "Was ihn reizt",
      maxPunkte: 6,
      punkte: { aufbau: 6, verdienst: 6, thema: 4, selbststaendig: 3, menschen: 2 },
      warum:
        "Etwas aufbauen wollen und verdienen wollen tragen einen Provisionsvertrieb. Die übrigen " +
        "Gründe sind gute Gründe, aber sie halten allein keine acht Wochen ohne Geld durch.",
    },
    {
      key: "wegAntwort2",
      label: "Zeitliche Reserve",
      maxPunkte: 8,
      punkte: { egal: 8, "6_bis_12": 8, "3_bis_6": 5, sonstiges: 4, unter_3: 1 },
      warum:
        "Vom ersten Beratungsgespräch bis zur ersten Provision vergehen acht bis zehn Wochen, " +
        "davor liegt die Lernzeit. Wer weniger als drei Monate durchhält, gerät unter Druck.",
    },
    {
      key: "wegAntwort3",
      label: "Lernweise",
      maxPunkte: 6,
      punkte: { ausprobieren: 6, gemischt: 6, zuschauen: 5, lesen: 4 },
      warum:
        "Alle vier funktionieren bei uns. Wer selbst ausprobiert, sitzt am schnellsten im ersten " +
        "eigenen Gespräch. Die Spanne ist deshalb klein.",
    },
  ],
};

/**
 * Kurzformen für die Aufschlüsselung und die Begründungszeile.
 *
 * Nur dort nötig, wo die Beschriftung im Bogen ein ganzer Satz ist. Fehlt hier
 * ein Eintrag, gilt der Wortlaut aus dem Bogen.
 */
const ANTWORT_KURZ: Record<string, Record<string, string>> = {
  zeitProWoche: { vollzeit: "Vollzeit", "10_bis_20": "10 bis 20 Std", unter_10: "unter 10 Std" },
  hintergrund: {
    immo: "Immobilienbranche",
    immo_umfeld: "Immobilien, aber nicht aus dem Verkauf",
    findi: "Finanzberatung",
    vertrieb: "Vertriebserfahrung",
    quereinsteiger: "Quereinsteiger",
    netzwerk: "eigenes Netzwerk",
  },
  perspektive: {
    sofort_haupt: "sofort hauptberuflich",
    spaeter_haupt: "später hauptberuflich",
    dauerhaft_neben: "dauerhaft nebenberuflich",
    unklar: "Perspektive offen",
  },
  leadPraeferenz: {
    eigen: "eigenes Netzwerk",
    leads: "offen für Leads",
    beides: "Netzwerk und Leads",
    unklar: "Akquise offen",
  },
  startzeitpunkt: {
    sofort: "Start sofort",
    vier_wochen: "Start in 4 Wochen",
    zwei_drei_monate: "Start in 2 bis 3 Monaten",
    umschauen: "schaut sich um",
  },
  gewerbe34c: {
    gewerbe_und_beantragt: "Gewerbe ja, 34c beantragt",
    nur_beantragt: "34c beantragt, Gewerbe noch nicht",
    beides: "Gewerbe und 34c da",
    nur_gewerbe: "Gewerbe ja, 34c nein",
    keines: "Gewerbe und 34c offen",
    im_gespraech: "Formales im Gespräch",
  },
  einkommensziel: {
    bis_2000: "Ziel bis 2.000 Euro",
    "2000_5000": "Ziel 2.000 bis 5.000 Euro",
    "5000_10000": "Ziel 5.000 bis 10.000 Euro",
    ueber_10000: "Ziel über 10.000 Euro",
    unklar: "Ziel offen",
  },
  verstaendnisFixum: { nein: "kein Fixum erwartet", ja: "erwartet ein Fixum" },
  verstaendnisProvision: { nein: "Provision verstanden", ja: "erwartet Provision je Kontakt" },
  passung: {
    selbststaendig: "selbstständig",
    variabel: "trägt Schwankungen",
    akquise: "akquiriert selbst",
    zeitplan: "Zeitplan trägt",
  },
};

/** Ein Posten der Aufschlüsselung: ein Merkmal mit Antwort und Punkten. */
export type VorabPosten = {
  key: string;
  label: string;
  /** Die Antwort des Bewerbers, lesbar und auf Listenlänge gekürzt. */
  antwort: string;
  punkte: number;
  maxPunkte: number;
  /** Warum das Merkmal zählt. */
  warum: string;
};

export type VorabScore = {
  /** 0 bis 100, bezogen auf die beantworteten Fragen. */
  punkte: number;
  /** Rohpunkte, wie sie die Tabelle ergeben hat. */
  rohPunkte: number;
  /** Was mit den beantworteten Fragen höchstens erreichbar gewesen wäre. */
  maxPunkte: number;
  einstufung: VorabEinstufung;
  /** Auf welchem Bogen der Score beruht. Siehe `bogenHerkunft`. */
  herkunft: BogenHerkunft;
  /** Kurze Begründungszeile, etwa "Vollzeit, sofort hauptberuflich". */
  begruendung: string;
  /** Die vollständige Aufschlüsselung, in der Reihenfolge der Tabelle. */
  posten: VorabPosten[];
  /** Beschriftungen der Pflichtfragen, die er offen gelassen hat. */
  luecken: string[];
  /** Mindestens eine gestellte Pflichtfrage blieb unbeantwortet. */
  unvollstaendig: boolean;
  /** Wie viele Pflichtfragen beantwortet wurden, und wie viele gestellt waren. */
  beantwortet: number;
  sichtbar: number;
};

function istBeantwortet(wert: unknown): boolean {
  if (Array.isArray(wert)) return wert.length > 0;
  return typeof wert === "string" && wert.trim() !== "";
}

/**
 * Die Merkmale, die dieser Bogen dem Bewerber wirklich vorgelegt hat.
 *
 * Niemand wird an einer Frage gemessen, die er nie gesehen hat: Der alte Bogen
 * kennt die Verständnisfragen nicht, das Kennenlernen kennt die beiden alten
 * Freitexte nicht, und die Fragen eines Wegs stellt nur dieser eine Weg.
 */
export function merkmaleFuer(antworten: FormularAntworten): VorabMerkmal[] {
  const neu = istKennenlernen(antworten);
  const wegId = typeof antworten.weg === "string" ? (antworten.weg as WegId) : null;
  const liste = MERKMALE.filter((m) => {
    if (m.nurKennenlernen && !neu) return false;
    if (m.nurAltbogen && neu) return false;
    return true;
  });
  const wegMerkmale = wegId && WEG_MERKMALE[wegId] ? WEG_MERKMALE[wegId] : [];
  return [...liste, ...wegMerkmale];
}

/** Punkte eines Merkmals für die gegebene Antwort. */
function punkteFuer(merkmal: VorabMerkmal, wert: string | string[]): number {
  if (merkmal.bewerteText) {
    const text = Array.isArray(wert) ? wert.join(" ") : wert;
    return Math.min(merkmal.maxPunkte, Math.max(0, merkmal.bewerteText(text)));
  }
  const tabelle = merkmal.punkte ?? {};
  const werte = Array.isArray(wert) ? wert : [wert];
  const roh = merkmal.summiert
    ? werte.reduce((summe, w) => summe + (tabelle[w] ?? 0), 0)
    : Math.max(0, ...werte.map((w) => tabelle[w] ?? 0));
  return Math.min(merkmal.maxPunkte, Math.max(0, roh));
}

/**
 * Die Antwort des Bewerbers als lesbarer Text.
 *
 * Zuerst die Kurzform aus `ANTWORT_KURZ`, sonst der Wortlaut aus dem Bogen,
 * den er tatsächlich vor sich hatte. Beim Kennenlernen zählt dabei die
 * sichtbare Fassung einer Frage: `leadPraeferenz` steht dort in zwei Fassungen
 * da, und der Quereinsteiger hat die andere gelesen.
 */
function antwortLesbar(key: string, antworten: FormularAntworten): string {
  const wert = antworten[key];
  if (wert == null) return "";
  const kurz = ANTWORT_KURZ[key];
  if (kurz) {
    const werte = Array.isArray(wert) ? wert : [wert];
    const texte = werte.map((w) => kurz[w]).filter(Boolean);
    if (texte.length > 0) return texte.join(", ");
  }

  if (istKennenlernen(antworten)) {
    let ersatz = "";
    for (const ansicht of ansichtenFuer(antworten)) {
      for (const frage of ansicht.fragen ?? []) {
        if (frage.key !== key) continue;
        const text = antwortTextNeu(frage, antworten);
        if (frageSichtbarNeu(frage, antworten)) return text;
        if (!ersatz) ersatz = text;
      }
    }
    if (ersatz) return ersatz;
  }

  const alt = getFrage(key);
  if (alt && frageSichtbarAlt(alt, antworten)) return antwortTextAlt(alt, antworten);
  return Array.isArray(wert) ? wert.join(", ") : wert;
}

/** Für die Aufschlüsselung und die Begründungszeile: eine Zeile, keine Erzählung. */
function gekuerzt(text: string, laenge = 60): string {
  const t = text.trim();
  return t.length <= laenge ? t : `${t.slice(0, laenge - 1).trimEnd()}…`;
}

export function einstufungFuer(punkte: number): VorabEinstufung {
  if (punkte >= VORAB_SCHWELLE_A) return "A";
  if (punkte >= VORAB_SCHWELLE_B) return "B";
  return "C";
}

/**
 * Die Begründungszeile: die stärksten Angaben, dann die schwächsten.
 *
 * Sie ersetzt die Aufschlüsselung nicht, sie ist der erste Blick. Gewählt wird
 * nach dem Anteil der erreichten Punkte, sortiert nach dem Gewicht des
 * Merkmals, damit oben steht, was am meisten trägt.
 */
function begruendungAus(posten: VorabPosten[]): string[] {
  const nachGewicht = [...posten].sort((a, b) => b.maxPunkte - a.maxPunkte);
  const anteil = (p: VorabPosten) => (p.maxPunkte > 0 ? p.punkte / p.maxPunkte : 0);

  const stark = nachGewicht.filter((p) => anteil(p) >= 0.7).slice(0, 4).map((p) => p.antwort);
  const schwach = nachGewicht.filter((p) => anteil(p) <= 0.34).slice(0, 2).map((p) => p.antwort);

  const teile = [...stark];
  if (schwach.length > 0) teile.push(`schwächer: ${schwach.join(" und ")}`);
  return teile.filter((t) => t.trim() !== "");
}

/**
 * Berechnet den Vorab-Score. Gibt `null`, wenn kein Bogen vorliegt oder keine
 * einzige bewertete Frage beantwortet wurde. Dann gibt es nichts zu zeigen,
 * und die Oberfläche sagt "Fragebogen noch nicht beantwortet".
 */
/**
 * Holt den laufenden 34c-Antrag aus der Rohantwort zurück.
 *
 * Der Bogen kennt fünf Antworten (ja, beantragt, nein, will nicht, unklar),
 * der Sammelwert nur vier Zustände. „Beantragt" fällt darin mit „nein"
 * zusammen. Für die Auswahl macht es aber einen Unterschied von mehreren
 * Wochen, ob der Antrag läuft oder noch niemand ihn gestellt hat.
 *
 * Nur eine Verfeinerung, keine zweite Wahrheit: Liegt die Rohantwort nicht vor,
 * etwa im alten Vorabbogen, bleibt es beim Sammelwert.
 */
export function verfeinereErlaubnis(antworten: FormularAntworten): FormularAntworten {
  const erlaubnis = typeof antworten.erlaubnis34c === "string" ? antworten.erlaubnis34c : "";
  if (erlaubnis !== "beantragt") return antworten;
  const gewerbe = typeof antworten.gewerbe === "string" ? antworten.gewerbe : "";
  return {
    ...antworten,
    gewerbe34c: gewerbe === "ja" ? "gewerbe_und_beantragt" : "nur_beantragt",
  };
}

export function berechneVorabScore(rohAntworten: FormularAntworten | null | undefined): VorabScore | null {
  if (!rohAntworten) return null;
  const antworten = verfeinereErlaubnis(rohAntworten);

  const merkmale = merkmaleFuer(antworten);
  const posten: VorabPosten[] = [];
  const luecken: string[] = [];
  let roh = 0;
  let max = 0;
  let sichtbar = 0;
  let beantwortet = 0;

  for (const merkmal of merkmale) {
    if (!merkmal.freiwillig) sichtbar += 1;
    const wert = antworten[merkmal.key];
    if (!istBeantwortet(wert)) {
      if (!merkmal.freiwillig) luecken.push(merkmal.label);
      continue;
    }
    if (!merkmal.freiwillig) beantwortet += 1;

    const p = punkteFuer(merkmal, wert);
    roh += p;
    max += merkmal.maxPunkte;
    posten.push({
      key: merkmal.key,
      label: merkmal.label,
      antwort: merkmal.kurzform ?? gekuerzt(antwortLesbar(merkmal.key, antworten)),
      punkte: p,
      maxPunkte: merkmal.maxPunkte,
      warum: merkmal.warum,
    });
  }

  if (posten.length === 0 || max === 0) return null;

  const punkte = Math.round((roh / max) * 100);
  const unvollstaendig = beantwortet < sichtbar;
  const teile = begruendungAus(posten);
  if (unvollstaendig) teile.push(`unvollständig, ${beantwortet} von ${sichtbar} Fragen`);

  return {
    punkte,
    rohPunkte: roh,
    maxPunkte: max,
    einstufung: einstufungFuer(punkte),
    herkunft: bogenHerkunft(antworten),
    begruendung: teile.join(", "),
    posten,
    luecken,
    unvollstaendig,
    beantwortet,
    sichtbar,
  };
}

/**
 * Alle Antwortoptionen, die es in den beiden Bögen zu einem Merkmal gibt.
 *
 * Nur für die Prüfung gedacht: Sie soll auffallen lassen, wenn im Bogen eine
 * neue Option dazukommt, für die niemand Punkte vergeben hat.
 */
export function optionenZuMerkmal(key: string, wegId?: WegId): string[] {
  if (wegId) {
    const weg = WEGE.find((w) => w.id === wegId);
    const werte = new Set<string>();
    for (const ansicht of weg?.ansichten ?? []) {
      for (const frage of [ansicht.frage, ansicht.folgefrage]) {
        if (frage?.key !== key) continue;
        for (const o of frage.optionen ?? []) werte.add(o.value);
      }
    }
    return [...werte];
  }
  const alt = FORMULAR_FRAGEN.find((f) => f.key === key);
  const werte = new Set<string>((alt?.optionen ?? []).map((o) => o.value));
  for (const ansicht of ansichtenFuer({})) {
    for (const frage of ansicht.fragen ?? []) {
      if (frage.key !== key) continue;
      for (const o of frage.optionen ?? []) werte.add(o.value);
    }
  }
  return [...werte];
}
