/**
 * Das Kennenlernen: zwanzig Ansichten in sieben Kapiteln, fünf Wege.
 *
 * Das ist die Fassung aus dem freigegebenen Sollzustand vom 07.09.2026. Er
 * ersetzt den Vorabbogen nicht, er steht daneben: Der alte Katalog in
 * `bewerberFormular.ts` bleibt unverändert in Betrieb, dieser hier gehört zum
 * neuen Bewerberprozess.
 *
 * ## Woher die zwanzig kommen
 *
 * Bis zum 06.09.2026 waren es einundzwanzig. Drei sind entfallen: „Was es
 * kostet" und „Was die Servicevereinbarung abnimmt" (das Haus stellt diese
 * Leistungen seit dem 07.09.2026 ohne Entgelt) und „Was du sonst noch
 * mitbringst", weil sie die Weiche fast wörtlich wiederholte.
 * Dafür bekommt jeder Weg drei eigene Ansichten statt zwei, der
 * Finanzberater-Weg vier. Damit waren es neunzehn. Am 08.09.2026 kam in
 * Kapitel 6 die Ansicht „Leads, wenn du schneller anfangen willst" dazu, auf
 * der alles zum Thema Lead an einer Stelle steht. Macht zwanzig, auf Weg 2
 * einundzwanzig. Die Kapitelzählung bleibt „Kapitel n von 7".
 *
 * ## Drei Grundsätze, die den ganzen Bogen tragen
 *
 * **Erstens der Spannungsbogen.** Seit dem 09.09.2026 sind Kapitel 2 und 3
 * getauscht: erst wer du bist, dann wer wir sind, dann der Nutzen, dann die
 * Konditionen. Der Grund ist, dass der Bogen ab der Weiche ohnehin nur noch
 * zeigt, was zum Bewerber passt; stand die Frage erst auf Ansicht 5, las er
 * vorher vier Bildschirme, die für ihn nicht ausgewählt waren. Der Satz zur
 * Firma steht deshalb jetzt auf Ansicht 1, damit die Berufsfrage nicht vor der
 * Vorstellung kommt. Auf Ansicht 1 steht kein einziger Betrag, nur der Satz zur
 * Art der Zusammenarbeit und der Ausstieg. Die erste Zahl zum eigenen Verdienst
 * steht in Kapitel 5.
 *
 * **Zweitens ein Thema je Ansicht.** Und: Die Rückmeldung zu einer Frage
 * erscheint erst nach der Antwort. Ein Kasten, der die Antwort schon
 * kommentiert, bevor sie gegeben ist, liest sich wie eine Vorgabe.
 *
 * **Drittens keine Punktzahl für den Bewerber.** Weder Zahl noch Buchstabe
 * noch Farbe. Der Überblick am Ende gibt seine eigenen Angaben zurück,
 * geordnet, und sonst nichts.
 *
 * ## Die Schlüssel
 *
 * Die Antworten liegen in derselben Spalte `bewerber_formular.antworten` wie
 * beim alten Bogen. Wo eine Frage dasselbe misst, trägt sie bewusst denselben
 * Schlüssel, damit Vorwissen-Karte und `bewerberVorabScore.ts` unverändert
 * weiterrechnen: `zeitProWoche`, `perspektive`, `leadPraeferenz`,
 * `einkommensziel`, `startzeitpunkt` und `hintergrund`. `gewerbe34c` und
 * `hintergrund` werden beim Absenden aus den neuen Angaben abgeleitet, siehe
 * `antwortenZumSenden`.
 *
 * `erreichbarkeit` stand bis zum 08.09.2026 ebenfalls in dieser Reihe. Der
 * Bogen fragt sie nicht mehr; ältere Einreichungen behalten die Angabe, siehe
 * `ALTFRAGEN`. Der alte Vorabbogen fragt sie unverändert weiter.
 */

import { GRUND_MAX } from "./bewerberSeite";
import {
  LEAD_ABSCHLUESSE_JE_10_BEZUG,
  LEAD_ABSCHLUESSE_JE_10_TEXT,
  LEAD_EINZELPREIS,
  LEAD_PAKET_ANZAHL,
  LEAD_PAKET_PREIS,
  LEAD_PAKET_PREIS_PRO_LEAD,
} from "./lizenzPakete";
import { PROVISION_PROZENT, BEISPIEL_KAUFPREIS_EUR, BEISPIEL_PROVISION_EUR } from "./assessmentSkript";

/** Fassung des Bogens, wird je Einreichung mitgespeichert. */
export const KENNENLERNEN_FASSUNG = "2026-09-v3";

/** Gültigkeit des persönlichen Links in Tagen. Wie beim alten Bogen. */
/*
 * Sechs Monate, seit dem 14.09.2026. Begruendung steht beim Zwilling in
 * `supabase/functions/_shared/bewerber-kennenlernen-mail.ts`; ein Test haelt
 * beide Zahlen zusammen.
 */
export const KENNENLERNEN_GUELTIG_TAGE = 180;

/**
 * Aus 180 wird „sechs Monate", aus 14 „14 Tage".
 *
 * Zwilling von `gueltigkeitText` in
 * `supabase/functions/_shared/bewerber-kennenlernen-mail.ts`. Beide Seiten
 * müssen denselben Zeitraum gleich benennen, sonst liest der Bewerber in der
 * Mail etwas anderes als auf seiner Seite im CRM.
 */
export function gueltigkeitText(tage: number): string {
  const monate = Math.round(tage / 30);
  if (tage < 30 || Math.abs(monate * 30 - tage) > 2) return `${tage} Tage`;
  const woerter = ["null", "einen Monat", "zwei Monate", "drei Monate", "vier Monate",
    "fünf Monate", "sechs Monate", "sieben Monate", "acht Monate", "neun Monate",
    "zehn Monate", "elf Monate", "zwölf Monate"];
  return woerter[monate] || `${monate} Monate`;
}

/**
 * Wie der Termin heißt, überall dort, wo der Bewerber ihn liest.
 *
 * Entscheidung E1 vom 07.09.2026, neu gefasst am 08.09.2026: Der Termin heißt
 * nicht mehr nach der Kooperation, sondern nach dem, was er ist. Intern
 * behält die Terminart ihren Schlüssel (`anlass = 'bewerbergespraech'`), nur
 * die Anzeige ändert sich. Steht als Konstante hier, damit das Wort nicht an
 * zwanzig Stellen einzeln gepflegt werden muss.
 *
 * Zwei Schreibweisen, weil beide gebraucht werden: als Eigenname groß, im
 * Fließtext klein gebeugt. „Dein persönliches Gespräch" mit großem P wäre
 * falsch, deshalb gibt es `GESPRAECH_NAME_KLEIN` daneben.
 */
export const GESPRAECH_NAME = "Persönliches Gespräch";

/** Derselbe Name im Fließtext, etwa „ein persönliches Gespräch". */
export const GESPRAECH_NAME_KLEIN = "persönliches Gespräch";

/**
 * Und gebeugt, für „im", „zum", „nach dem", „zu einem".
 *
 * Zwei Formen statt einer, weil das Deutsche sie verlangt: „Dein persönliches
 * Gespräch", aber „im persönlichen Gespräch". Eine einzige Konstante hätte an
 * der Hälfte der Stellen den falschen Fall.
 */
export const GESPRAECH_NAME_DATIV = "persönlichen Gespräch";

/**
 * Was das Gespräch ist, in einem Satzteil.
 *
 * Der kurze Name allein sagt einem Bewerber, der ihn zum ersten Mal liest,
 * noch nichts. Überall dort, wo er zum ersten Mal davon hört, also in der
 * Einladungsmail und auf der Buchungsseite, steht deshalb dieser Zusatz
 * dahinter. In Betreffzeilen und Kalendereinträgen bleibt es beim kurzen
 * Namen.
 */
export const GESPRAECH_BESCHREIBUNG =
  "in dem wir uns näher kennenlernen und alles Weitere zur Zusammenarbeit " +
  "besprechen, auch wie ein Start für dich individuell aussehen kann";

/**
 * Höchstlänge einer Freitextergänzung zu einer Auswahl, etwa hinter „Etwas
 * anderes". Steht hier oben, weil die Wege sie schon benutzen.
 */
export const FREITEXT_MAX = 160;

function euro(n: number): string {
  return n.toLocaleString("de-DE");
}

// ───────────────────────────── Die sieben Kapitel ─────────────────────────

export type KapitelNummer = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const KENNENLERNEN_KAPITEL: { nummer: KapitelNummer; name: string }[] = [
  { nummer: 1, name: "Ankommen" },
  { nummer: 2, name: "Wer du bist" },
  { nummer: 3, name: "Wer wir sind" },
  { nummer: 4, name: "Was wir bieten" },
  { nummer: 5, name: "Die Konditionen" },
  { nummer: 6, name: "Dein Einstieg" },
  { nummer: 7, name: "Abschluss" },
];

/**
 * Die Nummern der beiden getauschten Kapitel, als Konstante.
 *
 * Gebraucht werden sie an drei Stellen: an den Ansichten selbst, beim
 * Einsetzen der Wegansichten in `ansichtenFuer` und in einem Satz auf der
 * Leadansicht, der auf die Zielgruppe zurückverweist. Stünde die Zahl dort von
 * Hand, zeigte der Verweis nach dem nächsten Tausch auf das falsche Kapitel.
 */
export const KAPITEL_WER_DU_BIST: KapitelNummer = 2;
export const KAPITEL_WER_WIR_SIND: KapitelNummer = 3;

/** Die Zeile oben rechts, etwa „Kapitel 2 von 7 · Wer du bist". */
export function kapitelZeile(nummer: KapitelNummer): string {
  const k = KENNENLERNEN_KAPITEL.find((x) => x.nummer === nummer);
  return k ? `Kapitel ${k.nummer} von 7 · ${k.name}` : "";
}

// ───────────────────────────── Die Motive ─────────────────────────────────

/**
 * Die Motive je Ansicht (Punkt P2).
 *
 * Gezeichnet werden sie in `components/bewerberformular/KennenlernenMotive`.
 * Hier steht nur, welches wohin gehört: Der Inhalt des Bogens bestimmt das
 * Bild, nicht umgekehrt.
 */
export type MotivId =
  | "pfad"
  | "zielkarten"
  | "personen"
  | "haeuser"
  | "wege"
  | "zaehler"
  | "sanduhr"
  | "beratungstisch"
  | "faecher"
  | "lupe"
  | "netz"
  | "produktkarten"
  | "koffer"
  | "baustelle"
  | "bremse"
  | "kompass"
  | "waage"
  | "buch"
  | "staffelstab"
  | "werkzeugwand"
  | "uhren"
  | "wochenraster"
  | "kalenderblatt"
  | "siegel"
  | "sprechblasen"
  | "abhakliste"
  | "bildschirme"
  | "monat";

// ───────────────────────────── Die fünf Wege ──────────────────────────────

export type WegId = "weg1" | "weg2" | "weg3" | "weg4" | "weg5";

export type KennenlernenOption = {
  value: string;
  label: string;
  emoji?: string;
};

export type FragenTyp = "auswahl" | "mehrfach" | "text" | "textarea";

/**
 * Ein Kasten, der nach einer bestimmten Antwort einfährt.
 *
 * Zwei Töne, und der Unterschied ist inhaltlich: „hinweis" (bernstein) sagt,
 * dass etwas anders ist als angenommen, und ist ausdrücklich kein Fehler.
 * „info" (blau) ergänzt eine Auskunft, etwa den Preis der Leads.
 */
export type AntwortHinweis = {
  /** Bei welchen Antworten der Kasten einfährt. */
  werte: string[];
  ton: "hinweis" | "info";
  titel: string;
  text: string;
};

export type KennenlernenFrage = {
  /** Schlüssel in `bewerber_formular.antworten`. */
  key: string;
  typ: FragenTyp;
  frage: string;
  hinweis?: string;
  optionen?: KennenlernenOption[];
  /** Einzelauswahl als Schieberegler statt als Kacheln. */
  darstellung?: "skala";
  placeholder?: string;
  maxLaenge?: number;
  /** Kurzform für die Übersicht in der Akte, etwa „Zeit pro Woche". */
  kurz: string;
  /** Ausdrücklich freiwillig, wird im Bogen so gekennzeichnet. */
  freiwillig?: boolean;
  /**
   * Die Frage erscheint erst, wenn eine andere so beantwortet ist. Solange sie
   * nicht sichtbar ist, hält sie den Weiter-Knopf auch nicht auf.
   *
   * `wert` darf auch eine Liste sein, dann genügt einer davon. Gebraucht wird
   * das für Fragen, die auf zwei Wegen zugleich stehen, etwa die Frage nach
   * der bisherigen Arbeit mit Leads auf Weg 1 und Weg 4. Bewusst dasselbe
   * Feld und keine zweite Bedingungsart daneben.
   */
  zeigtWenn?: { key: string; wert: string | string[] };
  /** Der Kasten, der nach der Antwort einfährt. */
  antwortHinweis?: AntwortHinweis;
};

/** Eine der drei (auf Weg 2 vier) eigenen Ansichten eines Wegs. */
export type WegAnsicht = {
  id: string;
  /** Die eigene Überschrift. Bis zum 07.09.2026 war sie für alle Wege dieselbe. */
  titel: string;
  motiv: MotivId;
  absaetze?: string[];
  punkte?: { titel: string; text: string }[];
  frage?: KennenlernenFrage;
  /**
   * Eine zweite Frage, die erst nach einer bestimmten Antwort erscheint.
   *
   * Gedacht für die Freitextergänzung zu „Etwas anderes": Sie trägt ein
   * `zeigtWenn` auf die Hauptfrage und benutzt damit genau dasselbe Muster wie
   * die Begründung zur Erlaubnis auf der Ansicht zu Gewerbe und Erlaubnis. Ein
   * zweites Muster daneben gibt es bewusst nicht.
   */
  folgefrage?: KennenlernenFrage;
  /** Fährt erst ein, wenn die Frage beantwortet ist. */
  rueckmeldung?: { titel: string; text: string };
  /** Fester blauer Kasten, unabhängig von einer Antwort. */
  fuss?: string;
};

export type Weg = {
  id: WegId;
  /** Wie der Bewerber sich selbst beschreibt, auf der Weiche. */
  label: string;
  /** Kurzform für die Akte. */
  kurz: string;
  /**
   * Der Wert, der zusätzlich in `hintergrund` landet, damit der Vorab-Score
   * unverändert weiterrechnet.
   */
  hintergrund: string;
  /** Die eigenen Ansichten dieses Wegs, in ihrer Reihenfolge. */
  ansichten: WegAnsicht[];
};

export const WEGE: Weg[] = [
  {
    id: "weg1",
    label: "Ich verkaufe schon Immobilien",
    kurz: "verkauft schon Immobilien",
    hintergrund: "immo",
    ansichten: [
      {
        id: "weg1-erfahrung",
        titel: "Deine Erfahrung, genauer",
        motiv: "zaehler",
        frage: {
          key: "wegAntwort1",
          typ: "auswahl",
          frage: "Wie viele Abschlüsse hast du im letzten Jahr gemacht?",
          hinweis: "Die Zahl der Abschlüsse sagt mehr über die Erfahrung als die Zahl der Jahre.",
          kurz: "Abschlüsse im letzten Jahr",
          optionen: [
            { value: "keine", label: "Noch keinen" },
            { value: "1_bis_3", label: "1 bis 3" },
            { value: "4_bis_10", label: "4 bis 10" },
            { value: "ueber_10", label: "Mehr als 10" },
          ],
        },
        rueckmeldung: {
          titel: "Gut zu wissen",
          text: "Erfahrung zählt bei uns, aber sie ist keine Eintrittskarte und kein Ausschluss.",
        },
      },
      {
        id: "weg1-zeit",
        titel: "Was dich heute Zeit kostet",
        motiv: "sanduhr",
        frage: {
          key: "wegAntwort2",
          typ: "mehrfach",
          frage: "Was kostet dich heute am meisten Zeit, ohne dass du daran verdienst?",
          hinweis: "Mehrfachauswahl. Genau darüber reden wir im Gespräch zuerst.",
          kurz: "Zeitfresser heute",
          optionen: [
            { value: "objektsuche", label: "Objekte suchen und prüfen" },
            { value: "unterlagen", label: "Unterlagen und Exposés bauen" },
            { value: "finanzierung", label: "Finanzierung organisieren" },
            { value: "abwicklung", label: "Abwicklung bis zum Notar" },
            { value: "akquise", label: "Kunden überhaupt erst finden" },
            { value: "verwaltung", label: "Verwaltung und Nachhalten" },
          ],
        },
        rueckmeldung: {
          titel: "Das meiste davon fällt bei uns weg",
          text:
            "Was du gerade markiert hast, macht bei uns das Backoffice, das Objektteam oder das System. " +
            "Du führst den Kunden, wir tragen die Abwicklung.",
        },
      },
      {
        id: "weg1-kaeufer",
        titel: "Und wer kauft bei dir?",
        motiv: "beratungstisch",
        frage: {
          key: "wegAntwort3",
          typ: "auswahl",
          frage: "Welche Käufer hast du heute vor allem?",
          kurz: "Käufertyp heute",
          optionen: [
            { value: "eigennutzer", label: "Eigennutzer, die einziehen wollen" },
            { value: "anleger", label: "Kapitalanleger" },
            { value: "gemischt", label: "Beides gemischt" },
          ],
        },
        rueckmeldung: {
          titel: "Bei uns kauft niemand zum Einziehen",
          text:
            "Unsere Kunden kaufen eine Rendite und einen Steuereffekt, und das ändert das Gespräch: " +
            `weniger Besichtigung, mehr Rechnung. Genau das zeigen wir dir im ${GESPRAECH_NAME_DATIV}.`,
        },
      },
    ],
  },
  {
    id: "weg2",
    label: "Ich berate zu Geld, aber nicht zu Immobilien",
    kurz: "berät zu Geld, nicht zu Immobilien",
    hintergrund: "findi",
    ansichten: [
      {
        id: "weg2-beratung",
        titel: "Deine Beratung, genauer",
        motiv: "faecher",
        frage: {
          key: "wegAntwort1",
          typ: "mehrfach",
          frage: "Wozu berätst du heute konkret?",
          hinweis: "Mehrfachauswahl möglich.",
          kurz: "Beratungsschwerpunkte",
          optionen: [
            { value: "baufi", label: "Baufinanzierung" },
            { value: "vorsorge", label: "Altersvorsorge" },
            { value: "kapitalanlage", label: "Kapitalanlage und Wertpapiere" },
            { value: "versicherung", label: "Versicherungen" },
            { value: "steuern", label: "Steuern und Vermögensplanung" },
            { value: "sonstiges", label: "Etwas anderes" },
          ],
        },
        folgefrage: {
          key: "wegAntwort1Frei",
          typ: "text",
          frage: "Und was ist das?",
          placeholder: "Ein paar Worte genügen.",
          maxLaenge: FREITEXT_MAX,
          kurz: "Etwas anderes, und zwar",
          zeigtWenn: { key: "wegAntwort1", wert: "sonstiges" },
        },
        rueckmeldung: {
          titel: "Du führst diese Gespräche längst",
          text:
            "Über Geld zu sprechen ist der Teil, der den meisten schwerfällt, und der ist bei dir schon da.",
        },
      },
      {
        id: "weg2-kunden",
        titel: "Deine Kunden",
        motiv: "beratungstisch",
        frage: {
          key: "wegAntwort2",
          typ: "auswahl",
          frage: "Wie gewinnst du heute eigene Kunden?",
          kurz: "Eigene Kundengewinnung",
          optionen: [
            { value: "empfehlung", label: "Vor allem über Empfehlungen" },
            { value: "bestand", label: "Aus einem eigenen Bestand" },
            { value: "firma", label: "Die Kunden kommen von der Firma" },
            { value: "marketing", label: "Über eigenes Marketing" },
            { value: "gemischt", label: "Gemischt" },
          ],
        },
        rueckmeldung: {
          titel: "Ein Punkt, der oft übersehen wird",
          text:
            "Eine Erlaubnis nach Paragraf 34d oder 34f ist etwas anderes als die nach 34c und ersetzt " +
            "sie nicht. Wie das bei dir aussieht, klären wir in Kapitel 6.",
        },
      },
      {
        id: "weg2-baustein",
        titel: "Immobilie als Baustein",
        motiv: "buch",
        frage: {
          key: "wegAntwort3",
          typ: "auswahl",
          frage: "Hast du Immobilien als Kapitalanlage schon einmal in eine Beratung eingebaut?",
          kurz: "Immobilie in der Beratung",
          optionen: [
            { value: "regelmaessig", label: "Ja, regelmäßig" },
            { value: "gelegentlich", label: "Gelegentlich" },
            { value: "nie_frage_kommt", label: "Noch nie, aber die Frage kommt" },
            { value: "nie", label: "Noch nie" },
          ],
        },
        rueckmeldung: {
          titel: "Der Baustein, der im Depot fehlt",
          text:
            "Für deine Kunden ist die Immobilie oft genau das. Du musst dafür kein Immobilienprofi " +
            "werden: Objekt, Rechnung und Abwicklung kommen von uns.",
        },
      },
      {
        id: "weg2-zweitprodukt",
        titel: "Ein zweites Produkt, das zu dir passt",
        motiv: "produktkarten",
        absaetze: [
          "Neben dem Immobilienvertrieb haben wir ein Produkt aus der Finanzwelt im Programm, das für " +
            "dich als Berater besonders interessant ist. Drei Dinge daran, ohne heute schon ins Detail " +
            "zu gehen:",
        ],
        punkte: [
          { titel: "Stornofrei", text: "Deine Provision bleibt deine. Keine Stornohaftung, keine Rückrechnung nach Jahren." },
          { titel: "Bestandsprovision", text: "Du verdienst nicht nur beim Abschluss, sondern laufend, solange der Vertrag läuft." },
          { titel: "Ehrlich für den Kunden", text: "Geringe Kosten im Produkt, deshalb leicht zu erklären und leicht zu empfehlen." },
        ],
        fuss:
          `Welches Produkt das ist und wie es zu deiner Beratung passt, zeigen wir dir im ${GESPRAECH_NAME_DATIV}. ` +
          "Dorthin bringen wir die Zahlen mit.",
      },
    ],
  },
  {
    id: "weg3",
    label: "Ich bin im Vertrieb, mit einem anderen Produkt",
    kurz: "Vertrieb mit anderem Produkt",
    hintergrund: "vertrieb",
    ansichten: [
      {
        id: "weg3-produkt",
        titel: "Dein Produkt heute",
        motiv: "koffer",
        frage: {
          key: "wegAntwort1",
          typ: "text",
          frage: "Was verkaufst du heute?",
          hinweis: "Ein Satz genügt. Vertrieb ist nicht gleich Vertrieb.",
          placeholder: "z. B. Softwarelizenzen an mittelständische Betriebe",
          maxLaenge: 160,
          kurz: "Was er heute verkauft",
        },
        rueckmeldung: {
          titel: "Vertrieb ist nicht gleich Vertrieb",
          text: "Aber wer verkaufen kann, bringt das Schwerste schon mit.",
        },
      },
      {
        id: "weg3-tempo",
        titel: "Dein Tempo heute",
        motiv: "sanduhr",
        frage: {
          key: "wegAntwort2",
          typ: "auswahl",
          frage: "Wie lange dauert bei dir ein Verkauf, vom ersten Kontakt bis zum Abschluss?",
          hinweis: "Die Länge des Zyklus ist die Stelle, an der erfahrene Vertriebler am häufigsten stolpern.",
          kurz: "Länge des Verkaufszyklus",
          optionen: [
            { value: "tag", label: "Am selben Tag" },
            { value: "wochen", label: "Ein paar Wochen" },
            { value: "monate", label: "Zwei bis drei Monate" },
            { value: "laenger", label: "Länger als drei Monate" },
          ],
        },
        rueckmeldung: {
          titel: "Bei uns dauert es länger, und das ist der eigentliche Unterschied",
          text:
            "Ein Immobilieninvestment ist keine Entscheidung von heute auf morgen. Vom Beratungsbeginn " +
            "bis zur ersten Provision vergehen im Schnitt acht bis zehn Wochen.",
        },
      },
      {
        id: "weg3-herkunft",
        titel: "Woher deine Kunden kommen",
        motiv: "beratungstisch",
        frage: {
          key: "wegAntwort3",
          typ: "auswahl",
          frage: "Woher kommen deine Kunden heute?",
          kurz: "Herkunft der Kunden",
          optionen: [
            { value: "firma", label: "Die Firma stellt sie" },
            { value: "selbst", label: "Ich gewinne sie selbst" },
            { value: "gemischt", label: "Gemischt" },
          ],
        },
        rueckmeldung: {
          titel: "Bei uns gewinnst du deine Kunden selbst",
          text:
            "Und wir helfen dir dabei: mit Akademie, eigener Landingpage, Community und auf Wunsch mit " +
            "Leads. Was das konkret heißt, siehst du in Kapitel 4.",
        },
      },
    ],
  },
  {
    id: "weg4",
    label: "Ich kenne Immobilien, aber nicht aus dem Verkauf",
    kurz: "kennt Immobilien, nicht den Verkauf",
    /*
     * Ein eigener Wert seit dem 09.09.2026, vorher stand hier „immo".
     *
     * Weg 1 und Weg 4 ergaben denselben Hintergrundwert, und der Unterschied
     * zwischen „verkauft schon Immobilien" und „kennt Immobilien, hat aber nie
     * verkauft" lebte nur im Feld `weg` weiter. Im Vorab-Score zählte beides
     * acht Punkte. Jetzt zählt Weg 4 sieben, also zwischen Immobilienverkauf
     * (8) und Vertrieb (6). Die Punkte stehen in `bewerberVorabScore.ts`.
     *
     * Für das Erstgesprächsskript bleibt es beim Pfad „immo": Der Wert wird in
     * `alsAssessmentWert` zurückübersetzt, sonst bekäme Weg 4 gar keinen Pfad
     * mehr vorgeschlagen.
     */
    hintergrund: "immo_umfeld",
    ansichten: [
      {
        id: "weg4-erfahrung",
        titel: "Deine Immobilienerfahrung, genauer",
        motiv: "baustelle",
        frage: {
          key: "wegAntwort1",
          typ: "mehrfach",
          frage: "Womit hast du an einer Immobilie schon zu tun gehabt?",
          hinweis: "Mehrfachauswahl möglich.",
          kurz: "Berührung mit Immobilien",
          optionen: [
            { value: "verwaltung", label: "Verwaltung und Bewirtschaftung" },
            { value: "bau", label: "Bau und Sanierung" },
            { value: "bewertung", label: "Bewertung und Gutachten" },
            { value: "vermietung", label: "Vermietung" },
            { value: "finanzierung", label: "Finanzierung" },
            { value: "eigenbestand", label: "Eigener Bestand" },
          ],
        },
        rueckmeldung: {
          titel: "Was du weißt, kann man nicht schnell nachlernen",
          text: "Wer eine Immobilie von innen kennt, ist im Beratungsgespräch sofort glaubwürdig.",
        },
      },
      {
        id: "weg4-verkauf",
        titel: "Und der Verkauf?",
        motiv: "lupe",
        frage: {
          key: "wegAntwort2",
          typ: "auswahl",
          frage: "Wie viel hast du schon selbst verkauft?",
          kurz: "Verkaufserfahrung",
          optionen: [
            { value: "nichts", label: "Verkauft habe ich noch nichts" },
            { value: "gelegentlich", label: "Gelegentlich, nebenbei" },
            { value: "beraten", label: "Beraten ja, abgeschlossen selten" },
            { value: "regelmaessig", label: "Regelmäßig, nur nicht mit Immobilien" },
          ],
        },
        rueckmeldung: {
          titel: "Was fehlt, ist der Verkauf, und genau der ist lernbar",
          text:
            `Wie wir dich dabei begleiten, machen wir im ${GESPRAECH_NAME_DATIV} konkret, mit Namen und Terminen.`,
        },
      },
      {
        id: "weg4-bremse",
        titel: "Was dich bisher gebremst hat",
        motiv: "bremse",
        frage: {
          key: "wegAntwort3",
          typ: "auswahl",
          frage: "Was hat dich bisher vom Verkaufen abgehalten?",
          kurz: "Was bisher bremste",
          optionen: [
            { value: "nicht_gebraucht", label: "Ich habe es schlicht nicht gebraucht" },
            { value: "zutrauen", label: "Ich traue es mir noch nicht zu" },
            { value: "gelegenheit", label: "Es fehlte die Gelegenheit" },
            { value: "jetzt", label: "Nichts, ich will es jetzt" },
          ],
        },
        rueckmeldung: {
          titel: "Fast jeder bei uns hat so angefangen",
          text:
            "Fachwissen da, Verkauf neu. Deshalb sitzt du bei deinen ersten Kunden nicht allein im " +
            "Gespräch, sondern mit uns.",
        },
      },
    ],
  },
  {
    id: "weg5",
    label: "Beides ist neu für mich",
    kurz: "Immobilien und Vertrieb neu",
    hintergrund: "quereinsteiger",
    ansichten: [
      {
        id: "weg5-motivation",
        titel: "Was dich hierher bringt",
        motiv: "kompass",
        punkte: [
          {
            titel: "Was ein Kapitalanlage-Vertrieb macht",
            text:
              "Wir helfen Menschen, ihre Wünsche und Ziele mit einem Immobilieninvestment zu erfüllen: " +
              "Steuern sparen, Vermögen aufbauen, fürs Alter und für die nächste Generation vorsorgen. " +
              "Eingezogen wird dabei nie, die Wohnung ist vermietet, und der Mieter zahlt sie zum größten " +
              "Teil ab. Deine Arbeit ist deshalb weniger Besichtigung und mehr Beratung: zuhören, rechnen, " +
              "erklären, abschließen.",
          },
        ],
        frage: {
          key: "wegAntwort1",
          typ: "auswahl",
          frage: "Was reizt dich an dieser Arbeit am meisten?",
          kurz: "Was ihn reizt",
          optionen: [
            { value: "selbststaendig", label: "Selbst bestimmen, wie viel ich arbeite" },
            { value: "verdienst", label: "Was ich verdienen kann" },
            /*
             * „Mit Menschen arbeiten" stand hier bis zum 08.09.2026 und sagte
             * über den, der es anklickt, nichts aus: Es trifft auf jeden
             * zweiten Beruf zu. Der Wert bleibt `menschen`, sonst gingen
             * bereits abgeschickte Bögen verloren.
             */
            { value: "menschen", label: "Menschen bei einer großen Entscheidung begleiten" },
            { value: "thema", label: "Das Thema Immobilien selbst" },
            { value: "aufbau", label: "Etwas Eigenes aufbauen" },
          ],
        },
        rueckmeldung: {
          titel: "Ein guter Grund",
          text: "Und keiner davon setzt voraus, dass du schon etwas von Immobilien verstehst.",
        },
      },
      {
        id: "weg5-reserve",
        titel: "Ehrlich gerechnet",
        motiv: "sanduhr",
        /*
         * Der Absatz steht vor der Frage und nicht danach: Die Sorge, dafür
         * kündigen zu müssen, entsteht beim Lesen der Frage und nicht beim
         * Beantworten. Er gehört nur hierher, weil nur auf diesem Weg jemand
         * sitzt, der noch gar nicht weiß, ob das etwas für ihn ist.
         */
        absaetze: [
          "Vorweg, damit die nächste Frage nicht falsch ankommt: Wer angestellt ist, soll dafür nicht " +
            "kündigen. Fast alle fangen bei uns nebenbei an, sehen in Ruhe, ob es etwas für sie ist, " +
            "und verschieben den Schwerpunkt erst dann, wenn es trägt. Die Frage zielt also nicht auf " +
            "deinen Mut, sondern nur darauf, wie viel Zeit du dir für den Anfang geben kannst.",
        ],
        frage: {
          key: "wegAntwort2",
          typ: "auswahl",
          frage: "Wie lange könntest du durchhalten, bevor daraus Geld werden muss?",
          hinweis: "Ehrlich geantwortet ist hier mehr wert als optimistisch.",
          kurz: "Zeitliche Reserve",
          optionen: [
            { value: "unter_3", label: "Weniger als 3 Monate" },
            { value: "3_bis_6", label: "3 bis 6 Monate" },
            { value: "6_bis_12", label: "6 bis 12 Monate" },
            { value: "egal", label: "Das spielt bei mir keine Rolle" },
            { value: "sonstiges", label: "Bei mir liegt es anders" },
          ],
        },
        folgefrage: {
          key: "wegAntwort2Frei",
          typ: "text",
          frage: "Wie liegt es bei dir?",
          placeholder: "Ein Satz genügt.",
          maxLaenge: FREITEXT_MAX,
          kurz: "Zeitliche Reserve, und zwar",
          zeigtWenn: { key: "wegAntwort2", wert: "sonstiges" },
        },
        rueckmeldung: {
          titel: "Danke für die ehrliche Antwort",
          text:
            "Der Anfang ist bei allen gleich: Das Rad muss erst ins Laufen kommen. Von deinem ersten " +
            "Beratungsgespräch bis zur ersten Provisionszahlung vergehen im Schnitt acht bis zehn Wochen, " +
            "davor liegt die Zeit, in der du lernst und deine ersten Kunden gewinnst. Wer das weiß, plant " +
            `richtig, und genau dabei helfen wir dir im ${GESPRAECH_NAME_DATIV}.`,
        },
      },
      {
        id: "weg5-lernen",
        titel: "Wie du am besten lernst",
        motiv: "buch",
        frage: {
          key: "wegAntwort3",
          typ: "auswahl",
          frage: "Wie lernst du am liebsten?",
          kurz: "Lernweise",
          optionen: [
            { value: "zuschauen", label: "Zuschauen bei echten Gesprächen" },
            { value: "ausprobieren", label: "Selbst ausprobieren, mit Rückmeldung" },
            { value: "lesen", label: "Erst lesen, dann machen" },
            { value: "gemischt", label: "Gemischt" },
          ],
        },
        rueckmeldung: {
          titel: "Gut, das merken wir uns für deinen Start",
          text:
            "Bei uns gibt es alle drei: die Vertriebsakademie zum Lesen und Üben, echte Gespräche zum " +
            "Zuschauen, und deine ersten eigenen mit uns an deiner Seite.",
        },
      },
    ],
  },
];

export function getWeg(id?: string | null): Weg | undefined {
  return WEGE.find((w) => w.id === id);
}

/**
 * Ein vorausgewählter Weg aus der Adresse, etwa `?weg=weg2`.
 *
 * Die Stellenanzeige leitet Finanzdienstleister mit `?weg=weg2` („Ich berate
 * zu Geld") in ihren Bogen. Der Bogen setzt den Weg dann beim ersten Öffnen,
 * und nur, wenn noch kein Entwurf auf dem Gerät liegt. Der Bewerber sieht die
 * Auswahl trotzdem und kann sie ändern. Nur bekannte Wege gehen durch.
 */
export function wegAusAdresse(suche: string): string | undefined {
  try {
    return getWeg(new URLSearchParams(suche).get("weg"))?.id;
  } catch {
    return undefined;
  }
}

/** Alle Fragen eines Wegs, in ihrer Reihenfolge. */
export function wegFragen(weg: Weg): KennenlernenFrage[] {
  return weg.ansichten.map((a) => a.frage).filter((f): f is KennenlernenFrage => !!f);
}

// ───────────────────────────── Die Ansichten ──────────────────────────────

export type AnsichtArt = "erzaehlen" | "frage" | "ueberblick" | "abschluss";

/** Zwei Spalten nebeneinander, für „So läuft eine Abwicklung bei uns ab". */
export type AnsichtSpalte = { titel: string; punkte: string[] };

/**
 * Wo der Anschlusssatz auf der Ansicht steht.
 *
 * `vorsatz` als erster Absatz, noch vor den festen. Gebraucht auf „Gewerbe und
 * Erlaubnis", wo der Hinweis vor der Antwort gelesen sein muss und nicht
 * danach. `anschluss` als letzter Absatz, hinter den festen. `unten` unter dem
 * ganzen Inhalt, vor dem Fußkasten.
 */
export type AnschlussStelle = "vorsatz" | "anschluss" | "unten";

/**
 * Ein Textstück, das je Gruppe wechselt, während alles darum herum für jeden
 * wörtlich gleich bleibt.
 *
 * Die Leitregel des Umbaus: Tatsachen sind für alle gleich, der Anschluss ist
 * individuell. Was über MOREImmo, die Kunden, die Objekte und die Provision
 * gesagt wird, liest jede Gruppe identisch; nur der Satz, der sagt, was das
 * für diese Person bedeutet, wechselt. Deshalb steht der Anschluss als
 * eigenes, kleines Feld neben den festen Absätzen und nicht als fünfte Fassung
 * der ganzen Ansicht: Eine Tatsache in fünf Fassungen läuft mit der Zeit
 * auseinander, und dann steht in zwei Akten dasselbe Haus verschieden
 * beschrieben.
 *
 * Es ist bewusst dasselbe Muster, das der Bogen für Gruppenabhängigkeit schon
 * benutzt: Die Gruppe steht in `antworten.weg`, ausgewertet wird sie über
 * `getWeg`, genau wie in `ansichtenFuer`. Ein zweites System daneben gibt es
 * nicht.
 */
export type WegAnschluss = {
  stelle: AnschlussStelle;
  /**
   * Der feste Halbsatz, der die Fassung einleitet, für alle Gruppen gleich.
   *
   * Gebraucht auf „Wer wir sind", wo der Gruppensatz den festen Satz
   * fortsetzt. Ohne dieses Feld stünde die Einleitung fünfmal da, und damit
   * wäre eine Tatsache fünfmal gepflegt.
   */
  auftakt?: string;
  /** Nur bei `unten`: Mit Titel wird daraus ein eigener Kasten, ohne ein Absatz. */
  titel?: string;
  /** Eine Fassung je Gruppe. Fehlt eine, meldet es die Typprüfung. */
  fassungen: Record<WegId, string>;
};

export type Ansicht = {
  /** Bleibt gleich, auch wenn sich die Nummer je Weg verschiebt. */
  id: string;
  /** Nummer, wie der Bewerber sie sieht. Wird in `ansichtenFuer` gesetzt. */
  nummer: number;
  kapitel: KapitelNummer;
  art: AnsichtArt;
  titel: string;
  motiv: MotivId;
  /** Was der Bewerber liest. */
  absaetze?: string[];
  /** Aufzählung mit Überschrift je Punkt. */
  punkte?: { titel: string; text: string }[];
  /** Zwei Spalten, „Das machst du" und „Das machen wir". */
  spalten?: AnsichtSpalte[];
  /** Die Fragen dieser Ansicht, in der Reihenfolge, in der sie dastehen. */
  fragen?: KennenlernenFrage[];
  /** Fester blauer Kasten unter dem Inhalt. */
  fuss?: string;
  /** Fährt erst ein, wenn die Fragen dieser Ansicht beantwortet sind. */
  rueckmeldung?: { titel: string; text: string };
  /** Der eine Satz, der je Gruppe wechselt. Alles andere bleibt wörtlich gleich. */
  anschluss?: WegAnschluss;
};

/** Die Stelle, an der die drei bis vier Ansichten des Wegs eingesetzt werden. */
const WEG_PLATZHALTER = "__weg__";

/**
 * Was am ersten Tag bereitsteht und nichts kostet.
 *
 * Zehn Bausteine als Werkzeugwand. Bis zum 06.09.2026 waren sechs davon der
 * Inhalt eines eigenen Vertrags mit Monatsentgelt; seither stellt das Haus sie
 * ebenso. Die Titel sind für den Bewerber geschrieben und nicht aus dem
 * Vertragstext übernommen: „Training und Schulung über die Pflichtmodule
 * hinaus" ist eine Vertragsformulierung, „Die Vertriebsakademie" ist eine
 * Antwort auf die Frage, was er bekommt.
 */
export const BAUSTEINE_TAG_EINS: { titel: string; text: string }[] = [
  { titel: "Das CRM", text: "Kunden, Leads, Pipeline und Wiedervorlagen an einer Stelle." },
  { titel: "Investagon", text: "Objekte suchen, Investmentfälle rechnen und dem Kunden zeigen." },
  { titel: "Die Objektzugänge", text: "Off-Market-Objekte aus erster Hand vom Bauträger." },
  { titel: "Die Finanzierungspartner", text: "Banken und Lösungen, die zu unseren Fällen passen." },
  { titel: "Das Backoffice", text: "Unterlagen, Reservierung, Finanzierung und Notar." },
  { titel: "Fertige Unterlagen", text: "Präsentationen, Exposés und Kalkulationen." },
  {
    titel: "Die Vertriebsakademie",
    text: "Pflichtmodule und Aufbaukurse, Verkaufstraining, Steuer- und Finanzierungswissen.",
  },
  {
    titel: "Deine eigene Landingpage",
    text: "Für deine eigenen Marketingmaßnahmen, mit Vorlagen für Social Media und Anzeigen.",
  },
  {
    titel: "Community und Coaching",
    text: "Partner-Community, Veranstaltungen und persönliche Begleitung.",
  },
  { titel: "Support", text: "Ein Team, das erreichbar ist." },
];

/**
 * Der Wortlaut zu Gewerbe und Erlaubnis, in der geprüften Fassung.
 *
 * Bewusst ohne Zeitpunkt, der an die erste Provision knüpft, ohne Angabe, wie
 * lange eine Gewerbeanmeldung dauert, und ohne die Aussage, dass eine
 * Begleitung aus dem Haus eine eigene Erlaubnis ersetzt.
 */
export const GEWERBE_WORTLAUT =
  "Für das Kennenlernen brauchst du noch keine Nachweise. Vor Aufnahme deiner Tätigkeit klären wir " +
  "mit dir, welche Anmeldung und Erlaubnis erforderlich sind. Bis dahin sind nur die für deinen " +
  "Status freigegebenen Schritte möglich.";

/** Höchstlänge der Begründung, wenn jemand die Erlaubnis grundsätzlich nicht will. */
export const ERLAUBNIS_BEGRUENDUNG_MAX = 300;

/**
 * Der Vorsatz zu Gewerbe und Erlaubnis für die drei Gruppen, denen beides neu
 * ist: anderer Vertrieb, kennt Immobilien, beides neu.
 *
 * Steht einmal hier und wird dreimal eingesetzt. Dreimal abgeschrieben liefe
 * er auseinander, sobald jemand eine der drei Stellen ändert.
 */
const NEU_FUER_DICH_VORSATZ =
  "Wenn dir beides neu ist: Das ist der Normalfall bei einem Einstieg und kein Ausschluss. Was in " +
  "deinem Fall nötig ist, sagen wir dir im Gespräch.";

/**
 * Der Kasten, der nach der Wahl der Startart einfährt.
 *
 * Er steht an beiden Fassungen der Frage nach dem Start, deshalb hier einmal
 * und nicht zweimal. Er nannte bis zum 08.09.2026 Paketpreis und Einzelpreis;
 * beide stehen jetzt allein auf der folgenden Ansicht, sonst laufen sie
 * irgendwann auseinander.
 */
const LEADANGEBOT_FOLGT: AntwortHinweis = {
  werte: ["leads", "beides"],
  ton: "info",
  titel: "Dazu gleich mehr",
  text:
    "Auf der nächsten Ansicht steht, wie Leads bei uns laufen und was sie kosten. Pflicht sind " +
    "sie nie.",
};

/**
 * Hinweis und Platzhalter der Frage nach der bisherigen Arbeit mit Leads.
 *
 * Sie steht in zwei Fassungen im Bogen, weil der Einleitungshalbsatz je Weg
 * wechselt. Alles andere ist wörtlich gleich und steht deshalb hier einmal:
 * Zwei abgeschriebene Fassungen desselben Hinweises laufen auseinander, und
 * der Satz zum Einzelfall ist genau der, der nicht auseinanderlaufen darf.
 */
const LEAD_ERFAHRUNG_HINWEIS =
  "Nur ausfüllen, wenn du wirklich schon mit gekauften oder zugeteilten Leads gearbeitet hast. " +
  "Wer eine gute Quote und echte Erfahrung mitbringt, dem weisen wir auch Leads zu, ohne dass er " +
  "ein Paket kauft. Das entscheiden wir im Einzelfall, ohne Garantie und ohne Anspruch darauf. " +
  "Der übliche Weg bleibt das Paket oben.";

const LEAD_ERFAHRUNG_PLATZHALTER =
  "Woher die Leads kamen, wie schnell du sie erreicht hast, wie du nachgefasst hast.";

/**
 * Die feste Reihenfolge der Ansichten, ohne die des Wegs.
 *
 * Der Platzhalter steht dort, wo `ansichtenFuer` die drei (auf Weg 2 vier)
 * eigenen Ansichten einsetzt. Die Nummern vergibt `ansichtenFuer`, weil sie
 * sich je Weg verschieben.
 */
const ANSICHTEN_ROH: Omit<Ansicht, "nummer">[] = [
  // ── Kapitel 1 · Ankommen ──
  {
    id: "ankommen",
    kapitel: 1,
    art: "erzaehlen",
    titel: "Schön, dass du da bist",
    motiv: "pfad",
    absaetze: [
      /*
       * Der erste Satz stand bis zum 09.09.2026 auf „Wer wir sind" und ist mit
       * dem Kapiteltausch nach vorn gewandert. Ohne ihn beantwortete der
       * Bewerber die Frage nach seinem Beruf, ohne die Firma benannt bekommen
       * zu haben.
       */
      "MOREImmo ist ein Kapitalanlage-Vertrieb aus Rosenheim.",
      "Das hier ist eine selbstständige Tätigkeit auf Provision und keine Anstellung. Das sagen wir " +
        "gleich am Anfang, damit du weißt, worum es geht.",
      "Die nächsten Minuten gehören dir: Klick dich durch, und wo wir dich etwas fragen, antworte so, " +
        "wie es ist. Am Ende schickst du uns deine Angaben, wenn du willst.",
      "Du kannst jederzeit pausieren und später an derselben Stelle weitermachen.",
      // Und der Satz, der die Frage begründet, die unmittelbar folgt.
      "Als Erstes fragen wir dich, wo du herkommst. Danach zeigen wir dir nur, was zu dir passt, und " +
        "fragen dich nur, was zu dir passt.",
    ],
    fuss: "Sieben kurze Kapitel. Das Tempo bestimmst du.",
  },

  // ── Kapitel 2 · Wer du bist ──
  {
    id: "weiche",
    kapitel: KAPITEL_WER_DU_BIST,
    art: "frage",
    titel: "Jetzt bist du dran",
    motiv: "wege",
    absaetze: [
      "Ab hier richtet sich das Kennenlernen nach dir. Sag uns, wo du herkommst, dann fragen wir dich " +
        "nur, was zu dir passt.",
    ],
    fragen: [{
      key: "weg",
      typ: "auswahl",
      frage: "Was beschreibt dich am besten?",
      hinweis: "Eine Antwort. Sie entscheidet, was wir dich als Nächstes fragen.",
      kurz: "Der gewählte Weg",
      optionen: WEGE.map((w) => ({ value: w.id, label: w.label })),
    }],
  },
  // Hier stehen die drei bis vier Ansichten des gewählten Wegs.
  { id: WEG_PLATZHALTER, kapitel: KAPITEL_WER_DU_BIST, art: "frage", titel: "", motiv: "wege" },

  // ── Kapitel 3 · Wer wir sind ──
  {
    id: "wersind",
    kapitel: KAPITEL_WER_WIR_SIND,
    art: "erzaehlen",
    titel: "Wer wir sind",
    motiv: "zielkarten",
    absaetze: [
      // Der Satz zur Firma steht seit dem 09.09.2026 auf Ansicht 1 und hier
      // nicht mehr: Er muss vor der Frage nach dem Beruf stehen, nicht danach.
      "Wir helfen Menschen, ihre persönlichen Wünsche und Ziele mit einem Immobilieninvestment zu " +
        "erreichen.",
      "Die meisten kommen mit zwei Zielen zu uns: weniger Steuern zahlen und Vermögen aufbauen. " +
        "Dahinter steckt fast immer mehr: fürs Alter vorsorgen, den Kindern etwas hinterlassen, " +
        "unabhängiger vom Gehalt werden, oder einfach das Geld arbeiten lassen, das sonst auf dem " +
        "Konto liegt.",
      "Dafür suchen wir das passende Objekt, rechnen es ehrlich durch und begleiten den Kunden bis zum " +
        "Notar und darüber hinaus.",
    ],
    /*
     * Der Schlusssatz galt bis zum 08.09.2026 dem Quereinsteiger, danach
     * beiden Sorten Leser zugleich: „die einen, weil sie ihr Handwerk
     * beherrschen …, die anderen, weil sie hier anfangen". Das war nötig,
     * solange an dieser Stelle noch nicht feststand, wer liest. Seit die
     * Weiche auf Ansicht 2 steht, wissen wir es. Aus einem Satz für zwei
     * Sorten Leser werden deshalb seit dem 09.09.2026 fünf Sätze für je einen.
     */
    anschluss: {
      stelle: "anschluss",
      auftakt: "Weil wir unser Vertriebsteam erweitern, suchen wir Partner,",
      fassungen: {
        weg1: "die ihr Handwerk beherrschen und dafür ein Produkt und eine Abwicklung brauchen, die mithalten.",
        weg2: "die beraten können und ihren Kunden jetzt auch die Immobilie zeigen wollen, ohne dafür das " +
          "Haus zu wechseln.",
        weg3: "die verkaufen können und dieses Handwerk auf ein Produkt legen wollen, bei dem ein einzelner " +
          "Abschluss zählt.",
        weg4: "die von Immobilien etwas verstehen und den Schritt an den Tisch des Kunden gehen wollen.",
        weg5: "die hier anfangen und es von Grund auf richtig lernen wollen.",
      },
    },
  },
  {
    id: "zielgruppe",
    kapitel: KAPITEL_WER_WIR_SIND,
    art: "erzaehlen",
    titel: "Unsere Zielgruppe",
    motiv: "personen",
    absaetze: [
      "Unsere Kunden sind Unternehmer, Ärzte, gefragte Fachleute, Selbstständige und Angestellte mit " +
        "gutem Einkommen.",
      "In der Regel verdienen sie ab 3.500 Euro netto im Monat und haben ein gutes fünfstelliges " +
        "Erspartes auf der Seite. Damit ist die Finanzierung tragbar und die Bank sagt gern ja.",
    ],
    /*
     * Der dritte Absatz lautete bis zum 09.09.2026 für alle gleich: „Warum wir
     * dir das jetzt schon sagen: damit du weißt, mit wem du sprechen wirst …".
     * Er sagt jeder Gruppe etwas anderes, weil dieselbe Kundschaft für einen
     * Makler eine Warnung ist und für einen Finanzberater eine Bestätigung.
     * Die beiden Absätze darüber sind Tatsachen und bleiben wörtlich.
     */
    anschluss: {
      stelle: "anschluss",
      fassungen: {
        weg1: "Für dich ist daran vor allem eines wichtig: Das ist nicht dein heutiger Käufer. Wer bei uns " +
          "kauft, zieht nicht ein, sondern rechnet. Küche und Grundriss entscheiden hier nichts.",
        weg2: "Das sind die Kunden, mit denen du heute schon sprichst. Der Unterschied ist nicht der Mensch, " +
          "es ist das, was du ihm zeigen kannst.",
        weg3: "Das Gespräch, das du führst, ist dasselbe wie heute. Anders ist der Betrag: Über eine Summe " +
          "in dieser Größe entscheidet niemand nebenbei und fast niemand allein.",
        weg4: "Das sind nicht die Mieter und nicht die Handwerker, mit denen du sonst zu tun hast. Es sind " +
          "Leute, die eine Rechnung sehen wollen und danach eine Entscheidung treffen. Die Rechnung " +
          "kannst du.",
        weg5: "Damit du weißt, mit wem du sprechen wirst: keine Laufkundschaft, sondern Leute, die gut " +
          "verdienen und wenig Zeit haben. Das klingt nach einer hohen Hürde. Es ist leichter, als es " +
          "aussieht, weil sie ein echtes Problem haben und eine Antwort suchen.",
      },
    },
  },
  {
    id: "typen",
    kapitel: KAPITEL_WER_WIR_SIND,
    art: "erzaehlen",
    titel: "Unsere Immobilien-Typen",
    motiv: "haeuser",
    punkte: [
      { titel: "Sanierter Bestand", text: "Meist mit erhöhtem Restnutzungsdauer-Gutachten und Erhaltungsaufwand, also echter steuerlicher Substanz." },
      { titel: "Neubau im KfW-40-QNG-Standard", text: "Mit KfW-Kredit, bester Energieeffizienz und Nachhaltigkeit." },
      { titel: "WG und Co-Living", text: "Für Kunden mit stärkerem Renditefokus." },
    ],
    absaetze: [
      "Unser Schwerpunkt ist Bayern: München und Umland, Augsburg und Nürnberg. Dazu ausgewählte " +
        "Objekte deutschlandweit.",
      "Alle unsere Objekte sind Off-Market. Du findest sie auf keinem Portal, weil wir sie aus erster " +
        "Hand vom Bauträger bekommen und direkt an unsere Kunden vermitteln. Das ist der Grund, warum " +
        "unsere Kunden mit uns sprechen und nicht mit einem Portal.",
    ],
    fuss: "Nicht das Produkt steht zuerst, der Kunde steht zuerst. Aus seinen Zielen ergibt sich die Strategie und daraus das passende Objekt.",
  },

  // ── Kapitel 4 · Was wir bieten ──
  {
    id: "abwicklung",
    kapitel: 4,
    art: "erzaehlen",
    titel: "So läuft eine Abwicklung bei uns ab",
    motiv: "staffelstab",
    spalten: [
      { titel: "Das machst du", punkte: ["Kunden gewinnen", "Erstgespräch und Beratung", "Objekt vorstellen", "Abschluss"] },
      { titel: "Das machen wir", punkte: ["Objekte beschaffen", "Finanzierung", "Notar und Unterlagen", "Abwicklung und Support"] },
    ],
    absaetze: [
      "Der Umkehrschluss ist der Punkt: Alles, was nicht Gespräch ist, kostet dich bei uns keine Zeit. " +
        "Du konzentrierst dich auf das, woran du verdienst.",
    ],
    /*
     * Die Aufteilung selbst ist eine Tatsache und steht für alle gleich da.
     * Was sich unterscheidet, ist allein, wie viele der fünf Schritte für den
     * Leser neu sind, und das weiß niemand besser als seine eigene Gruppe.
     */
    anschluss: {
      stelle: "unten",
      titel: "Und was das für dich heißt",
      fassungen: {
        weg1: "Von diesen fünf Schritten machst du heute wahrscheinlich alle fünf selbst. Hier bleiben dir " +
          "zwei, und es sind die zwei, für die du bezahlt wirst.",
        weg2: "Drei der fünf Schritte machst du in deiner Beratung längst. Neu sind für dich das Objekt und " +
          "die steuerliche Seite.",
        weg3: "Vier der fünf Schritte kennst du, nur mit anderem Inhalt. Neu ist, dass zwischen deinem " +
          "Abschluss und deinem Geld eine Bank und ein Notartermin stehen, und dass beide nicht in " +
          "deiner Hand liegen.",
        weg4: "Zwei der fünf Schritte sind für dich neu: das Ansprechen und das Beratungsgespräch. Genau " +
          "bei diesen beiden ist am Anfang jemand aus dem Haus dabei.",
        weg5: "Alle fünf Schritte sind für dich neu. Zwei davon übernimmt ohnehin das Haus, beim dritten " +
          "ist am Anfang jemand dabei. Neu und allein bist du nur beim Ansprechen.",
      },
    },
  },
  {
    id: "tageins",
    kapitel: 4,
    art: "erzaehlen",
    titel: "Was ab Tag 1 bereitsteht",
    motiv: "werkzeugwand",
    absaetze: [
      "Alles davon bekommst du von uns gestellt. Ohne Servicevereinbarung, ohne Monatsgebühr, ohne " +
        "Einstiegsgebühr.",
    ],
    punkte: BAUSTEINE_TAG_EINS,
    /*
     * Der Kasten sagte bis zum 08.09.2026 zum dritten Mal, dass alles nichts
     * kostet. Das steht schon in der Überschrift des Absatzes darüber. Jetzt
     * beantwortet er die Frage, die nach so einer Liste tatsächlich offen
     * bleibt: Was davon ist Pflicht, was ist freiwillig, und was habe ich
     * davon. Der Paragraf bleibt darin, er ist der Grund für die erste Hälfte.
     */
    fuss:
      "Warum das so ist: Wer als Handelsvertreter vermittelt, bekommt seine Arbeitsmittel vom " +
      "Unternehmen gestellt, so steht es in Paragraf 86a Handelsgesetzbuch. Das Übrige auf dieser " +
      "Liste, von der Vertriebsakademie bis zur eigenen Landingpage, schuldet uns das Gesetz nicht. " +
      "Das legen wir dazu, weil du damit früher beim ersten Kundengespräch bist, und darauf kommt es " +
      "für uns beide an.",
  },

  // ── Kapitel 5 · Die Konditionen ──
  {
    id: "verdienst",
    kapitel: 5,
    art: "erzaehlen",
    titel: "Was du verdienst",
    motiv: "uhren",
    absaetze: [
      `Alle Partner bekommen ${PROVISION_PROZENT} Prozent Provision vom Kaufpreis, unabhängig davon, ob ` +
        "der Kunde aus deinem eigenen Netzwerk kommt oder über uns. Keine Stufen, keine kleinere " +
        "Einstiegsprovision.",
      `Bei einem Kaufpreis von ${euro(BEISPIEL_KAUFPREIS_EUR)} Euro sind das ${euro(BEISPIEL_PROVISION_EUR)} Euro für einen Abschluss.`,
    ],
    punkte: [
      {
        titel: "1. Bis zu deinem ersten Kunden",
        text: "Hängt an dir: an deinem Training und daran, wie schnell du die ersten Gespräche führst.",
      },
      /*
       * Die beiden Titel nannten bis zum 08.09.2026 die Unterschrift als
       * Wendepunkt. Gemeint war immer der Notartermin: Der Kaufvertrag wird
       * beurkundet, eine Unterschrift unter einem zugeschickten Papier gibt es
       * dabei nicht. Nicht zu verwechseln mit der Unterschrift unter dem
       * eigenen Partnervertrag, die an ganz anderer Stelle steht.
       */
      {
        titel: "2. Vom ersten Gespräch bis zum Notar",
        text: "Hängt am Kunden, am Objekt und an der Bank. Im Schnitt acht bis zehn Wochen.",
      },
      {
        titel: "3. Vom Notar bis zu deinem Geld",
        text: "Deine Provision wird fällig, sobald der Kaufpreis fällig ist. Das ist meist einige Wochen nach der Beurkundung.",
      },
      /*
       * Hier standen bis zum 08.09.2026 Paketpreis und Einzelpreis. Beides
       * steht jetzt vollständig auf der Ansicht „Leads, wenn du schneller
       * anfangen willst" in Kapitel 6, und nur dort. Ein Preis an zwei Stellen
       * läuft irgendwann auseinander, und gemerkt wird es zuerst vom Bewerber.
       */
      {
        titel: "Und wenn du Leads willst",
        text:
          "Leads kannst du bei uns freiwillig dazubuchen, um schneller in die ersten Gespräche zu " +
          "kommen. Pflicht sind sie nie. Was sie kosten und was im Schnitt daraus wird, steht in " +
          "Kapitel 6.",
      },
    ],
    /*
     * Ein einzelner Einordnungssatz, und zwar unter den drei Uhren und vor dem
     * Fußkasten. Er ordnet ein, was die Zahlen darüber für den Leser bedeuten,
     * und behauptet dabei nichts über sein heutiges Einkommen: Wir kennen aus
     * dem Bogen nur, was er angekreuzt hat. Sätze wie „mehr, als du heute
     * verdienst" sind deshalb ausgeschlossen. Der Satz für die erste Gruppe
     * nennt den Provisionssatz ausgeschrieben; ein Test hält ihn an
     * `PROVISION_PROZENT` fest, damit er nicht stehen bleibt, wenn der Satz
     * sich ändert.
     */
    anschluss: {
      stelle: "unten",
      fassungen: {
        weg1: "Vier Prozent vom Kaufpreis, ohne Stufen und ohne Teilung mit einem Büro. Wo sich das " +
          "gegenüber dem einordnet, was du heute bekommst, rechnen wir im Gespräch gemeinsam durch.",
        weg2: "Ein einzelner Abschluss hat hier eine andere Größenordnung als das, was du gewohnt bist. " +
          "Dafür sind es weniger Abschlüsse im Jahr, und der Weg dahin ist länger.",
        weg3: "Ein Abschluss zählt hier mehr, dafür brauchst du länger für ihn. Deshalb stehen die drei " +
          "Uhren oben getrennt nebeneinander und nicht als eine Zahl.",
        weg4: "Das ist kein Zusatzverdienst nebenbei. Ein Abschluss trägt, aber er kommt erst, wenn du " +
          "regelmäßig Gespräche führst.",
        weg5: "Bis daraus regelmäßiges Geld wird, vergehen Monate. Deshalb fragen wir dich gleich, wie " +
          "lange du durchhalten könntest, und deshalb soll dafür niemand kündigen.",
      },
    },
    fuss:
      "Drei Strecken, drei Uhren. Deshalb nennen wir keine Wochenzahl für alles zusammen. Was wir aus " +
      "Erfahrung sagen können: Wer regelmäßig Gespräche führt, hat nach acht bis zehn Wochen seinen " +
      "ersten Abschluss und kurz darauf seine erste Provision.",
  },
  /*
   * Die Erwartung steht unmittelbar hinter dem Verdienst und nicht am Ende
   * des Bogens. Wer gerade gelesen hat, was er bekommt, liest hier, was
   * dafür vorausgesetzt wird; als Nachtrag im Abschlusskapitel wäre es ein
   * Kleingedrucktes, und genau danach soll es nicht aussehen.
   *
   * Der Maßstab ist eine Zahl aus dem Vertrag (§ 12 Absatz 1a) und keine
   * Zielvorgabe des Hauses. Deshalb sagt der Text, was er ist, nennt den
   * Grund für die Länge des Zeitraums und lässt jeden Drohton weg. Die Zahl
   * steht hier in Worten; gezählt wird im CRM nichts.
   */
  {
    id: "erwartung",
    kapitel: 5,
    art: "erzaehlen",
    titel: "Was wir erwarten",
    motiv: "monat",
    absaetze: [
      "Wir setzen keine Umsatzziele und geben dir keine Wochenquote vor. Eine einzige Erwartung steht " +
        "im Vertrag, und wir sagen sie dir lieber jetzt als später: In zwei aufeinanderfolgenden " +
        "Quartalen soll mindestens ein Kaufvertrag beim Notar beurkundet werden.",
      "Das ist ein halbes Jahr für einen Abschluss. Wir haben den Zeitraum bewusst so lang gewählt, " +
        "weil unser Verkaufszyklus lang ist: Vom ersten Gespräch bis zum Notar vergehen im Schnitt " +
        "acht bis zehn Wochen, und Bank, Kunde und Objekt bestimmen das Tempo mit.",
    ],
    punkte: [
      {
        titel: "Ein Abschluss in zwei Quartalen",
        text: "Gemeint ist die notarielle Beurkundung, nicht die Anzahl deiner Gespräche und nicht dein Umsatz.",
      },
      {
        titel: "Dein erstes Quartal zählt nicht mit",
        text: "Das Quartal, in dem du anfängst, bleibt außen vor. Gezählt wird erst ab dem folgenden.",
      },
      {
        titel: "Krankheit und Elternzeit zählen nicht mit",
        text: "Nachgewiesene Arbeitsunfähigkeit, Mutterschutz, Elternzeit und vergleichbare Verhinderungen bleiben außen vor.",
      },
      {
        titel: "Vorher wird geredet",
        text:
          "Bleiben zwei Quartale ohne Beurkundung, melden wir uns schriftlich und du hast zwei Wochen " +
          "Zeit, uns deine Sicht zu schildern. Erst danach entscheidet sich, wie es weitergeht.",
      },
    ],
    rueckmeldung: {
      titel: "Für wen das keine Hürde ist",
      text:
        "Wer regelmäßig Gespräche führt, liegt deutlich darüber. Der Maßstab richtet sich an Karteileichen, " +
        "nicht an dich: Wir wollen Partner, die wirklich verkaufen, und dafür halten wir dir die " +
        "Objekte, die Finanzierung und das Backoffice frei.",
    },
    fuss:
      "Wo das steht: in Paragraf 12 Absatz 1a deines Vertrages. Dort steht auch, dass bereits verdiente " +
      "Provisionen und dein gesetzlicher Ausgleichsanspruch davon unberührt bleiben.",
  },

  // ── Kapitel 6 · Dein Einstieg ──
  {
    id: "passung",
    kapitel: 6,
    art: "frage",
    titel: "Passt das grundsätzlich für dich?",
    motiv: "waage",
    fragen: [{
      key: "passung",
      typ: "mehrfach",
      frage: "Was davon hast du für dich entschieden?",
      hinweis: "Setze nur, was wirklich zutrifft. Ein fehlendes Häkchen ist kein Ausschluss.",
      kurz: "Grundsätzliche Passung",
      // Freiwillig, seit dem 07.09.2026. Vorher war die Frage Pflicht, und der
      // Hinweis darunter behauptete das Gegenteil.
      freiwillig: true,
      optionen: [
        { value: "selbststaendig", label: "Selbstständig arbeiten passt für mich" },
        { value: "variabel", label: "Schwankende Einnahmen kann ich tragen" },
        { value: "akquise", label: "Ich bin bereit, selbst Kunden zu gewinnen" },
        { value: "zeitplan", label: "Mein Zeitplan trägt das" },
      ],
    }, {
      key: "verstaendnisFixum",
      typ: "auswahl",
      frage: "Ist ein festes monatliches Einkommen Bestandteil dieser Zusammenarbeit?",
      hinweis: "Zwei kurze Verständnisfragen. Eine falsche Antwort löst eine Erklärung aus und keine Bewertung.",
      kurz: "Verständnis Fixum",
      optionen: [
        { value: "ja", label: "Ja" },
        { value: "nein", label: "Nein" },
      ],
      antwortHinweis: {
        werte: ["ja"],
        ton: "hinweis",
        titel: "Nein, das ist bei uns nicht der Fall",
        /*
         * „Volle Freiheit in deiner Zeit" stand hier bis zum 10.09.2026 und
         * las sich seit dem Tätigkeitsmaßstab wie eine Zusage, dass gar
         * nichts erwartet wird. Wahr ist der erste Teil: Wann er arbeitet,
         * bestimmt er. Was zusammenkommen soll, steht in Kapitel 5, und
         * darauf verweist der Satz jetzt.
         */
        text:
          "Du arbeitest mit uns ausschließlich als selbstständiger Handelsvertreter: kein Fixum, keine " +
          `Anstellung, dafür ${PROVISION_PROZENT} Prozent auf jeden Abschluss und freie Zeiteinteilung. ` +
          "Wann du arbeitest, bestimmst du selbst; was dabei zusammenkommen soll, steht in Kapitel 5. " +
          "Wenn das für dich passt, wähle Nein.",
      },
    }, {
      key: "verstaendnisProvision",
      typ: "auswahl",
      frage: "Führt ein übergebener Kontakt automatisch zu einer Provision?",
      kurz: "Verständnis Provision",
      optionen: [
        { value: "ja", label: "Ja" },
        { value: "nein", label: "Nein" },
      ],
      antwortHinweis: {
        werte: ["ja"],
        ton: "hinweis",
        titel: "Nicht automatisch",
        text:
          "Ein Kontakt ist ein Gespräch, kein Abschluss. Provision gibt es, wenn der Kunde kauft, und " +
          "dafür braucht es dein Gespräch, deine Beratung und deinen Abschluss. Genau das ist der Teil, " +
          "der bei uns deiner bleibt.",
      },
    }],
  },
  {
    id: "zeit",
    kapitel: 6,
    art: "frage",
    titel: "Wie viel Zeit hast du?",
    motiv: "wochenraster",
    fragen: [{
      key: "zeitProWoche",
      typ: "auswahl",
      frage: "Wie viel Zeit könntest du pro Woche für den Aufbau einplanen?",
      hinweis: "Die einzige Angabe, die eine Zusammenarbeit praktisch unmöglich machen kann.",
      kurz: "Zeit pro Woche",
      optionen: [
        { value: "unter_10", label: "Weniger als 10 Stunden, erst einmal nebenher" },
        { value: "10_bis_20", label: "10 bis 20 Stunden, das ist mir wichtig" },
        { value: "vollzeit", label: "Vollzeit, ich will das hauptberuflich machen" },
      ],
    }, {
      key: "perspektive",
      typ: "auswahl",
      frage: "Und langfristig, wohin soll es gehen?",
      kurz: "Perspektive",
      optionen: [
        { value: "dauerhaft_neben", label: "Dauerhaft nebenberuflich, als zweites Standbein" },
        { value: "spaeter_haupt", label: "Nebenberuflich starten, perspektivisch hauptberuflich" },
        { value: "sofort_haupt", label: "Von Anfang an hauptberuflich" },
        { value: "unklar", label: "Das will ich erst einmal schauen" },
      ],
    }, {
      /*
       * Die dritte Frage dieser Ansicht, seit dem 09.09.2026, für alle fünf
       * Gruppen gleich.
       *
       * Sie holt genau das ein, was an einer sechsten Gruppe „angestellt bei
       * Bank oder Sparkasse" wirklich anders gewesen wäre, kostet aber eine
       * Frage statt fünf zusätzlicher Textfassungen. Nebentätigkeits-
       * genehmigung und Wettbewerbsverbot waren vorher nirgends angesprochen,
       * obwohl beides einen Start verhindern kann.
       *
       * Sie zählt bewusst NICHT im Vorab-Score: Sie klärt eine Voraussetzung
       * und misst keine Eignung. Angestellt zu sein ist kein Minus. Deshalb
       * steht `arbeitsform` in keinem Merkmal von `bewerberVorabScore.ts`.
       */
      key: "arbeitsform",
      typ: "auswahl",
      frage: "Wie arbeitest du heute?",
      hinweis: "Das entscheidet, was wir vor einem Start miteinander klären müssen.",
      kurz: "Wie er heute arbeitet",
      optionen: [
        { value: "angestellt", label: "Ich bin angestellt" },
        { value: "selbststaendig", label: "Ich bin selbstständig" },
        { value: "beides", label: "Beides nebeneinander" },
        { value: "keins", label: "Zurzeit keins von beidem" },
      ],
      antwortHinweis: {
        werte: ["angestellt"],
        ton: "hinweis",
        titel: "Zwei Dinge klären wir vorher",
        text:
          "Dann brauchst du vor dem Start eine Nebentätigkeitsgenehmigung deines Arbeitgebers, und " +
          "wir schauen uns an, ob dein Vertrag ein Wettbewerbsverbot enthält. Beides klären wir im " +
          "Gespräch, und beides ist sehr oft unproblematisch.",
      },
    }],
  },
  {
    id: "interessenten",
    kapitel: 6,
    art: "frage",
    /*
     * Der Titel nennt beide Fragen dieser Ansicht. Die erste steht in zwei
     * Fassungen da, eine für die Wege 1 bis 4 und eine für den Quereinsteiger,
     * siehe unten. Gefragt wird sie damit auf allen fünf Wegen.
     */
    titel: "Deine ersten Kunden und dein Ziel",
    motiv: "netz",
    fragen: [{
      key: "leadPraeferenz",
      typ: "auswahl",
      frage: "Womit willst du starten?",
      hinweis:
        "Wir fragen das nicht, um dir etwas zu verkaufen, sondern um zu wissen, woher dein erstes " +
        "Gespräch kommt. Beide Wege funktionieren bei uns, und keiner ist der bessere.",
      kurz: "Womit er startet",
      /*
       * Diese Fassung setzt ein bestehendes Netzwerk oder Bestandskunden
       * voraus. Der Quereinsteiger auf Weg 5 bekommt deshalb die Fassung
       * darunter, mit denselben Werten und anderen Worten.
       */
      zeigtWenn: { key: "weg", wert: ["weg1", "weg2", "weg3", "weg4"] },
      optionen: [
        { value: "eigen", label: "Ich habe ein eigenes Netzwerk oder Bestandskunden, damit fange ich an" },
        { value: "leads", label: "Ich bin grundsätzlich offen für Leads von euch" },
        { value: "beides", label: "Beides: Ich fange im eigenen Netzwerk an und bin für Leads offen" },
        { value: "unklar", label: "Das weiß ich noch nicht" },
      ],
      antwortHinweis: LEADANGEBOT_FOLGT,
    }, {
      /*
       * Dieselbe Frage für den Quereinsteiger, in seinen Worten.
       *
       * **Warum eine zweite Frage und nicht nur ein `zeigtWenn`.** Die
       * Bedingung entscheidet, ob eine Frage dasteht, nicht wie sie
       * beschriftet ist. Anders beschriftet gehört sie aber: „Ich habe ein
       * eigenes Netzwerk oder Bestandskunden" trifft auf Weg 5 fast nie zu.
       * Wer neu anfängt, hat keine Bestandskunden, wohl aber einen
       * Bekanntenkreis, und ob er dort anfangen will, ist eine echte Frage.
       * Die erste Fassung unverändert vorzusetzen hieße, ihm etwas zu
       * unterstellen, was er gar nicht hat.
       *
       * **Warum trotzdem derselbe Schlüssel und dieselben vier Werte.** Daran
       * hängen der Vorab-Score (`bewerberVorabScore.ts`), die Kurzmarken in
       * der Akte, die Ableitung von `hintergrund` beim Absenden und das
       * Merkmal „Akquiseplan erkennbar" im Videocall. Ein eigener Schlüssel
       * hätte all das ein zweites Mal gebraucht, und der Bogen des
       * Quereinsteigers galt weiterhin als unvollständig, weil der alte
       * Katalog `leadPraeferenz` als sichtbare Frage zählt.
       *
       * Zwei Fragen mit einem Schlüssel sind im Bogen die Ausnahme. Die drei
       * Stellen, die davon wissen müssen, sagen es an Ort und Stelle:
       * `antwortenZumSenden`, `kennenlernenUeberblick` und `frageZu` in
       * `supabase/functions/_shared/bewerber-kennenlernen-ueberblick.ts`.
       */
      key: "leadPraeferenz",
      typ: "auswahl",
      frage: "Wo würdest du deine ersten Gespräche suchen?",
      hinweis:
        "Es gibt hier keine richtige Antwort, und nichts davon ist eine Zusage. Wir wollen nur " +
        "wissen, woher dein erstes Gespräch kommen könnte. Alle Wege funktionieren bei uns.",
      kurz: "Womit er startet",
      zeigtWenn: { key: "weg", wert: "weg5" },
      optionen: [
        { value: "eigen", label: "Erst einmal im Bekanntenkreis, bei Familie, Freunden und Kollegen" },
        { value: "leads", label: "Lieber mit Leads von euch, außerhalb meines Umfelds" },
        { value: "beides", label: "Beides: im Bekanntenkreis anfangen und dazu Leads" },
        { value: "unklar", label: "Das weiß ich noch nicht" },
      ],
      antwortHinweis: LEADANGEBOT_FOLGT,
    }, {
      key: "einkommensziel",
      typ: "auswahl",
      darstellung: "skala",
      frage: "Was möchtest du damit im Monat verdienen, wenn es läuft?",
      hinweis: "Es geht um das Ziel, nicht um dein heutiges Einkommen.",
      kurz: "Einkommensziel",
      optionen: [
        { value: "bis_2000", label: "Bis 2.000 Euro" },
        { value: "2000_5000", label: "2.000 bis 5.000 Euro" },
        { value: "5000_10000", label: "5.000 bis 10.000 Euro" },
        { value: "ueber_10000", label: "Mehr als 10.000 Euro" },
        { value: "unklar", label: "Weiß ich noch nicht" },
      ],
    }],
  },
  /*
   * Die Leadansicht, seit dem 08.09.2026.
   *
   * Sie steht bewusst hier und nicht in Kapitel 5: Erst sagt der Bewerber eine
   * Ansicht vorher, womit er starten will, dann liest er das Angebot dazu. Und
   * sie steht bewusst allen offen, auch dem, der im eigenen Netzwerk anfängt.
   * Sonst hinge die Zahl der Ansichten an einer Antwort, und der Bewerber läse
   * mitten im Bogen „von 20" statt „von 21".
   *
   * Alle Preise zum Thema Lead stehen ab jetzt nur noch hier. Die Konditionen
   * in Kapitel 5 verweisen darauf, nennen aber keine Zahl mehr.
   */
  {
    id: "leadangebot",
    kapitel: 6,
    art: "frage",
    titel: "Leads, wenn du schneller anfangen willst",
    /*
     * Dasselbe Motiv wie auf der Ansicht „Unsere Zielgruppe", weil es um genau
     * dieselben Menschen geht und der Text sich ausdrücklich darauf beruft.
     */
    motiv: "personen",
    absaetze: [
      "Leads sind bei uns freiwillig. Niemand muss welche kaufen, niemand bekommt schlechtere " +
        "Konditionen, weil er keine will, und wer im eigenen Netzwerk anfängt, braucht diese Ansicht " +
        "nicht.",
      "Wozu es sie gibt: um dich und dein Geschäft zu beschleunigen und schneller die ersten " +
        "Erfolgserlebnisse zu haben.",
    ],
    punkte: [
      {
        titel: "Was ein Lead bei uns ist",
        text:
          // Der Verweis zeigt auf „Unsere Zielgruppe". Das Kapitel dahinter hat
          // beim Tausch vom 09.09.2026 die Nummer gewechselt, deshalb steht die
          // Zahl hier nicht von Hand.
          `Ein Interessent aus genau der Zielgruppe, die du in Kapitel ${KAPITEL_WER_WIR_SIND} gelesen hast: Einkommen und ` +
          "Erspartes stimmen, die Bonität ist gut, er ist gut erreichbar, und er will investieren. Mit " +
          "so jemandem kannst du direkt ins Gespräch gehen, gut beraten und gute Abschlüsse erzielen.",
      },
      {
        titel: "Das Paket",
        text:
          `${euro(LEAD_PAKET_PREIS)} Euro netto für ${LEAD_PAKET_ANZAHL} Leads, das sind ` +
          `${euro(LEAD_PAKET_PREIS_PRO_LEAD)} Euro je Lead.`,
      },
      {
        titel: "Danach einzeln nachbuchbar",
        text:
          `Ist das Paket aufgebraucht, kannst du einzelne Leads dazukaufen, ${euro(LEAD_EINZELPREIS)} ` +
          "Euro je Lead. Keine Abnahmepflicht, keine Mindestmenge, keine Laufzeit.",
      },
      {
        titel: "Was im Schnitt daraus wird",
        text:
          `Aus ${LEAD_ABSCHLUESSE_JE_10_BEZUG} Leads werden bei uns im Schnitt ` +
          `${LEAD_ABSCHLUESSE_JE_10_TEXT} Abschlüsse. Das ist unser Teamdurchschnitt und keine Zusage: ` +
          "Ein Lead ist ein Gespräch, kein Abschluss, und was daraus wird, hängt an deiner Beratung.",
      },
    ],
    /*
     * Die dritte Tür, seit dem 09.09.2026 auf den Wegen 1 bis 4.
     *
     * Sie steht unter dem Angebot und nicht daneben, sie ist freiwillig, und
     * sie verlangt zwei eigene Angaben statt eines Klicks. Wer sie geht, tut
     * das aus Erfahrung und nicht aus Bequemlichkeit. Der Regelfall bleibt das
     * Paket darüber, und genau das sagt der Hinweis auch.
     *
     * **Warum sie seit dem 09.09.2026 auch Weg 2 und Weg 3 sehen.**
     * Finanzberater und Vertriebler kaufen sehr oft Leads, und die Frage nach
     * der Quote aus zehn Leads ist eine der aussagekräftigsten im ganzen
     * Bogen. Weg 5 bleibt ausdrücklich außen vor: Wer noch nie mit Leads
     * gearbeitet hat, kann dazu nichts sagen.
     *
     * Die erste Frage steht deshalb in zwei Fassungen da, wie `leadPraeferenz`
     * auf der Ansicht „Deine ersten Kunden und dein Ziel". Nur der
     * Einleitungshalbsatz wechselt, alles andere bleibt wörtlich gleich, und
     * beide schreiben in denselben Schlüssel, damit Score, Akte und Mail
     * unverändert weiterrechnen.
     */
    fragen: [{
      key: "leadErfahrung",
      typ: "textarea",
      frage: "Du kommst aus der Immobilienbranche: Wie hast du bisher mit Leads gearbeitet?",
      hinweis: LEAD_ERFAHRUNG_HINWEIS,
      placeholder: LEAD_ERFAHRUNG_PLATZHALTER,
      maxLaenge: 500,
      kurz: "Bisherige Arbeit mit Leads",
      freiwillig: true,
      zeigtWenn: { key: "weg", wert: ["weg1", "weg4"] },
    }, {
      // Dieselbe Frage für die Wege 2 und 3, nur mit anderem Einleitungshalbsatz.
      key: "leadErfahrung",
      typ: "textarea",
      frage: "Du arbeitest im Vertrieb: Wie hast du bisher mit Leads gearbeitet?",
      hinweis: LEAD_ERFAHRUNG_HINWEIS,
      placeholder: LEAD_ERFAHRUNG_PLATZHALTER,
      maxLaenge: 500,
      kurz: "Bisherige Arbeit mit Leads",
      freiwillig: true,
      zeigtWenn: { key: "weg", wert: ["weg2", "weg3"] },
    }, {
      /*
       * Die zweite Frage braucht keine zweite Fassung: Sie nennt keinen Beruf
       * und liest sich auf allen vier Wegen gleich.
       */
      key: "leadQuote",
      typ: "text",
      frage: "Und wie viele Abschlüsse hast du im Schnitt aus zehn Leads gemacht?",
      hinweis: "Deine eigene Zahl, so wie sie ist. Wir sprechen im Gespräch darüber, wie sie zustande kam.",
      placeholder: "z. B. 2 von 10",
      maxLaenge: 40,
      kurz: "Abschlüsse aus zehn Leads",
      freiwillig: true,
      zeigtWenn: { key: "weg", wert: ["weg1", "weg2", "weg3", "weg4"] },
    }],
    fuss:
      "Ein Leadpaket ist nie Voraussetzung für die Zusammenarbeit. Deine Provision ist dieselbe, " +
      "egal ob dein Kunde aus deinem Netzwerk kommt oder über einen Lead.",
  },
  {
    id: "start",
    kapitel: 6,
    art: "frage",
    titel: "Wann könntest du anfangen?",
    motiv: "kalenderblatt",
    fragen: [{
      key: "startzeitpunkt",
      typ: "auswahl",
      frage: "Ab wann könntest du starten?",
      kurz: "Start",
      optionen: [
        { value: "sofort", label: "Sofort" },
        { value: "vier_wochen", label: "In den nächsten vier Wochen" },
        { value: "zwei_drei_monate", label: "In zwei bis drei Monaten" },
        { value: "umschauen", label: "Ich schaue mich erst einmal um" },
      ],
    }],
  },
  {
    id: "erlaubnis",
    kapitel: 6,
    art: "frage",
    titel: "Gewerbe und Erlaubnis",
    motiv: "siegel",
    absaetze: [GEWERBE_WORTLAUT],
    /*
     * Drei Fassungen für fünf Gruppen, und der Vorsatz steht über den Fragen,
     * nicht darunter: Gelesen sein muss er vor der Antwort.
     *
     * Warum drei und nicht fünf: In dieser einen Frage unterscheiden sich die
     * Gruppen 3, 4 und 5 nicht, alle drei bringen in aller Regel weder Gewerbe
     * noch Erlaubnis mit. Sie teilen sich deshalb denselben Wortlaut. Fünf
     * Einträge stehen trotzdem da, damit die Typprüfung jede Gruppe erzwingt
     * und keine stillschweigend leer ausgeht.
     *
     * Neu ist am Vorsatz für die zweite Gruppe allein die Handlungsanweisung
     * „Antworte hier bitte nur für die 34c". Die Abgrenzung selbst steht schon
     * heute unter der Frage. Ohne die Anweisung kreuzt ein Berater mit einer
     * 34d guten Gewissens „Ja, habe ich" an, und diese Fehlbedienung ist heute
     * möglich.
     */
    anschluss: {
      stelle: "vorsatz",
      fassungen: {
        weg1: "Wahrscheinlich hast du beides längst. Dann bist du hier in zehn Sekunden fertig.",
        weg2: "Wichtig für dich, bevor du antwortest: Eine Zulassung nach 34d oder 34f deckt diese " +
          "Tätigkeit nicht ab. Für die Vermittlung von Immobilien braucht es die Erlaubnis nach 34c. " +
          "Antworte hier bitte nur für die 34c.",
        weg3: NEU_FUER_DICH_VORSATZ,
        weg4: NEU_FUER_DICH_VORSATZ,
        weg5: NEU_FUER_DICH_VORSATZ,
      },
    },
    fragen: [{
      key: "gewerbe",
      typ: "auswahl",
      frage: "Hast du ein Gewerbe angemeldet?",
      kurz: "Gewerbe",
      optionen: [
        { value: "ja", label: "Ja, habe ich" },
        { value: "beantragt", label: "Ist beantragt" },
        { value: "nein", label: "Noch nicht" },
        { value: "unklar", label: "Das möchte ich im Gespräch klären" },
      ],
    }, {
      key: "erlaubnis34c",
      typ: "auswahl",
      frage: "Und eine Erlaubnis nach Paragraf 34c?",
      hinweis: "Eine Erlaubnis nach 34d oder 34f ist etwas anderes und ersetzt sie nicht.",
      kurz: "Erlaubnis 34c",
      optionen: [
        { value: "ja", label: "Ja, habe ich" },
        { value: "beantragt", label: "Ist beantragt" },
        { value: "nein", label: "Noch nicht vorhanden" },
        { value: "will_nicht", label: "Möchte ich grundsätzlich nicht" },
        { value: "unklar", label: "Das möchte ich im Gespräch klären" },
      ],
    }, {
      // Fährt nur bei „Möchte ich grundsätzlich nicht" ein, und dann als
      // Pflichtfeld: Genau dieser Satz entscheidet, wo das Gespräch anfängt.
      key: "erlaubnis34cBegruendung",
      typ: "textarea",
      frage: "Magst du uns kurz sagen, warum?",
      hinweis: "Das ist kein Ausschluss. Es hilft uns, im Gespräch beim richtigen Punkt anzufangen.",
      placeholder: "Ein Satz genügt.",
      maxLaenge: ERLAUBNIS_BEGRUENDUNG_MAX,
      kurz: "Warum keine Erlaubnis",
      zeigtWenn: { key: "erlaubnis34c", wert: "will_nicht" },
    }],
  },
  {
    id: "themen",
    kapitel: 6,
    art: "frage",
    titel: "Deine eigenen Themen",
    motiv: "sprechblasen",
    fragen: [{
      key: "themen",
      typ: "mehrfach",
      frage: "Worüber möchtest du im Gespräch zuerst reden?",
      hinweis: "Mehrfachauswahl. Was du hier markierst, steht im Termin ganz oben.",
      kurz: "Eigene Themen",
      freiwillig: true,
      optionen: [
        { value: "verdienst", label: "Verdienst und Rechenwege" },
        { value: "kosten", label: "Leads und Kosten" },
        { value: "zeit", label: "Zeit und Vereinbarkeit" },
        { value: "einstieg", label: "Einstieg, Training und Begleitung" },
        { value: "objekte", label: "Objekte und Standorte" },
        { value: "formales", label: "Gewerbe, Erlaubnis, Formales" },
        { value: "leads", label: "Leads und Kundengewinnung" },
      ],
    }, {
      key: "eigeneFrage",
      typ: "textarea",
      frage: "Hast du eine eigene Frage an uns?",
      hinweis: "Die einzige Angabe im ganzen Kennenlernen, die wir nicht erraten können.",
      maxLaenge: 500,
      kurz: "Eigene Frage",
      freiwillig: true,
    }],
  },

  // ── Kapitel 7 · Abschluss ──
  {
    id: "ueberblick",
    kapitel: 7,
    art: "ueberblick",
    titel: "Das hast du uns erzählt",
    motiv: "abhakliste",
    absaetze: [
      "So möchtest du starten, das bringst du mit, das klären wir im Gespräch. Jede Zeile lässt sich " +
        "noch ändern, bevor du absendest.",
    ],
  },
  /*
   * Die letzte Ansicht, seit dem 08.09.2026 ohne Kalender.
   *
   * Bis dahin hieß sie „Dein persönliches Gespräch" und führte direkt in die
   * Terminwahl: Wer den Bogen absendete, buchte sich anschließend selbst eine
   * Zeit. Damit war der Termin vergeben, bevor irgendjemand die Antworten
   * gelesen hatte, und die Auswahl nach dem Bewerberscore lief leer. Eingeladen
   * wird jetzt aus dem Bewerberprofil heraus, und der Bogen endet hier.
   */
  {
    id: "abschluss",
    kapitel: 7,
    art: "abschluss",
    titel: "Fast geschafft",
    motiv: "bildschirme",
  },
];

/**
 * Die zwanzig Ansichten ohne gewählten Weg, mit Nummern.
 *
 * Drei davon sind Platzhalter ohne Frage. Das ist der Zustand vor der Weiche
 * und richtig so: Vorher weiß niemand, was dort stehen wird, wohl aber, wie
 * viele es sein werden.
 */
export const ANSICHTEN: Ansicht[] = ansichtenFuer({});

/*
 * Die Ansicht, auf der zum ersten Mal Zahlen zum eigenen Verdienst stehen.
 *
 * Sie war früher das Ziel eines Nebenwegs von Ansicht 1 aus, den die
 * Oberfläche seit dem 08.09.2026 nicht mehr anbietet. Die Marke bleibt
 * trotzdem, aber aus einem anderen Grund: Ein Test hält damit den
 * Spannungsbogen fest, dass vor dieser Ansicht keine Zahl zum Verdienst
 * fällt. Ohne sie müsste diese Position von Hand gepflegt werden, und genau
 * das ist im Bewerberprozess schon mehrfach schiefgegangen.
 */
export const KONDITIONEN_ID = "verdienst";

/** Ihre Nummer, solange kein Weg gewählt ist. */
export const KONDITIONEN_ANSICHT =
  ANSICHTEN.find((a) => a.id === KONDITIONEN_ID)?.nummer ?? 11;

// ─────────────────── Antworten, Ableitungen und Auswertung ────────────────

export type KennenlernenAntworten = Record<string, string | string[]>;

/** Alle Schlüssel, die dieser Bogen schreiben kann. */
export const KENNENLERNEN_KEYS: string[] = [
  "weg",
  "hintergrund",
  "wegAntwort1",
  "wegAntwort1Frei",
  "wegAntwort2",
  "wegAntwort2Frei",
  "wegAntwort3",
  "passung",
  "verstaendnisFixum",
  "verstaendnisProvision",
  "zeitProWoche",
  "perspektive",
  "arbeitsform",
  "leadPraeferenz",
  "leadErfahrung",
  "leadQuote",
  "einkommensziel",
  "startzeitpunkt",
  "gewerbe",
  "erlaubnis34c",
  "erlaubnis34cBegruendung",
  "themen",
  "eigeneFrage",
  // Abgeleitet beim Absenden, damit die alten Auswertungen weiterrechnen.
  "gewerbe34c",
];

/**
 * Fragen, die der Bogen nicht mehr stellt, deren Antworten aber in älteren
 * Einreichungen stehen.
 *
 * Die Frage nach der Erreichbarkeit ist am 08.09.2026 ersatzlos entfallen, weil
 * der Bewerber sich damals seinen Termin selbst aussuchte und uns deshalb nicht
 * mehr sagen musste, wann wir ihn anrufen dürfen. Seit der Bogen ohne
 * Terminwahl endet, rufen wir wieder selbst an; ob die Frage zurückkommt, ist
 * offen. Wegwerfen lässt sich die Angabe ohnehin nicht, denn in den Akten der
 * Bewerber, die den Bogen vorher
 * ausgefüllt haben, steht sie. Ohne diese Liste stünde ihre Antwort zwar noch
 * in der Datenbank, wäre in der Akte aber nicht mehr zu sehen.
 *
 * Der Bogen selbst benutzt diese Liste nicht. Sie ist reine Anzeige.
 */
export const ALTFRAGEN: KennenlernenFrage[] = [
  {
    key: "erreichbarkeit",
    typ: "mehrfach",
    frage: "Wann erreichen wir dich am besten?",
    kurz: "Erreichbar",
    optionen: [
      { value: "vormittags", label: "Vormittags bis 12 Uhr" },
      { value: "mittags", label: "Mittags 12 bis 14 Uhr" },
      { value: "nachmittags", label: "Nachmittags 14 bis 18 Uhr" },
      { value: "abends", label: "Abends ab 18 Uhr" },
    ],
  },
];

/**
 * Die Ansichten für genau diesen Bewerber, mit eingesetztem Weg und
 * fortlaufenden Nummern.
 *
 * Zwanzig Ansichten, auf Weg 2 einundzwanzig. Deshalb wird hier durchnummeriert und
 * nicht im Katalog: Die Nummer, die der Bewerber oben rechts liest, hängt an
 * seiner eigenen Antwort auf der Weiche.
 */
export function ansichtenFuer(antworten: KennenlernenAntworten): Ansicht[] {
  const weg = getWeg(typeof antworten.weg === "string" ? antworten.weg : undefined);

  const liste: Omit<Ansicht, "nummer">[] = [];
  for (const a of ANSICHTEN_ROH) {
    if (a.id !== WEG_PLATZHALTER) {
      liste.push(a);
      continue;
    }
    if (!weg) {
      /*
       * Vor der Weiche ist noch nicht bekannt, was hier stehen wird, die Zahl
       * der Ansichten aber schon: drei. Deshalb stehen hier drei Platzhalter
       * und nicht einer. Sonst läse der Bewerber auf Ansicht 1 „Ansicht 1 von
       * 18" und nach seiner Antwort plötzlich „von 20", und der Nebenweg zu
       * den Konditionen führte vorher auf eine andere Nummer als nachher.
       * Erreichbar sind die Platzhalter nicht: Ohne Antwort bleibt der
       * Weiter-Knopf auf der Weiche gesperrt.
       */
      for (let i = 1; i <= 3; i += 1) liste.push({ ...a, id: `${WEG_PLATZHALTER}${i}` });
      continue;
    }
    for (const w of weg.ansichten) {
      liste.push({
        id: w.id,
        kapitel: KAPITEL_WER_DU_BIST,
        art: w.frage ? "frage" : "erzaehlen",
        titel: w.titel,
        motiv: w.motiv,
        ...(w.absaetze ? { absaetze: w.absaetze } : {}),
        ...(w.punkte ? { punkte: w.punkte } : {}),
        ...(w.frage ? { fragen: [w.frage, ...(w.folgefrage ? [w.folgefrage] : [])] } : {}),
        ...(w.rueckmeldung ? { rueckmeldung: w.rueckmeldung } : {}),
        ...(w.fuss ? { fuss: w.fuss } : {}),
      });
    }
  }

  return liste.map((a, i) => ({ ...a, nummer: i + 1 }));
}

/** Die Nummer einer Ansicht auf dem Weg dieses Bewerbers. */
export function ansichtNummer(ansichten: Ansicht[], id: string): number {
  return ansichten.find((a) => a.id === id)?.nummer ?? 1;
}

/**
 * Der Anschlusssatz dieser Ansicht, in der Fassung der gewählten Gruppe.
 *
 * Ohne gewählte Gruppe gibt es keinen. Vor der Weiche wissen wir nicht, wer
 * liest, und eine sechste Fassung für diesen Fall wäre eine sechste Fassung,
 * die gepflegt werden müsste. Erreichbar ist der Fall nicht: Die Weiche steht
 * auf Ansicht 2 und sperrt den Weiter-Knopf, bis geantwortet ist.
 */
export function anschlussFuer(ansicht: Ansicht, antworten: KennenlernenAntworten): string | null {
  const anschluss = ansicht.anschluss;
  if (!anschluss) return null;
  const weg = getWeg(typeof antworten.weg === "string" ? antworten.weg : undefined);
  if (!weg) return null;
  const fassung = anschluss.fassungen[weg.id];
  if (!fassung) return null;
  return anschluss.auftakt ? `${anschluss.auftakt} ${fassung}` : fassung;
}

/** Die Absätze der Ansicht, mit dem Anschluss an seiner Stelle. */
export function absaetzeFuer(ansicht: Ansicht, antworten: KennenlernenAntworten): string[] {
  const feste = ansicht.absaetze ?? [];
  const stelle = ansicht.anschluss?.stelle;
  if (stelle !== "vorsatz" && stelle !== "anschluss") return feste;
  const text = anschlussFuer(ansicht, antworten);
  if (!text) return feste;
  return stelle === "vorsatz" ? [text, ...feste] : [...feste, text];
}

/**
 * Was unter dem Inhalt steht: mit Titel als Kasten, ohne Titel als Absatz.
 *
 * Der Kasten auf der Abwicklungsansicht steht in kürzerer Fassung auch auf der
 * Arbeitsteilungsfolie des Gesprächs. Damit die Zahl der neuen Schritte nicht
 * zweimal gepflegt wird, holt die Folie ihren Satz hier ab und ergänzt ihn,
 * statt ihn abzuschreiben.
 */
export function anschlussUnten(
  ansicht: Ansicht,
  antworten: KennenlernenAntworten,
): { titel?: string; text: string } | null {
  if (ansicht.anschluss?.stelle !== "unten") return null;
  const text = anschlussFuer(ansicht, antworten);
  if (!text) return null;
  return { titel: ansicht.anschluss.titel, text };
}

/**
 * Ist diese Frage gerade sichtbar?
 *
 * Eine bedingte Frage, die noch nicht dasteht, darf den Weiter-Knopf auch
 * nicht aufhalten.
 *
 * Bei einer Mehrfachauswahl genügt es, dass der auslösende Wert unter den
 * markierten ist. Sonst könnte eine Freitextergänzung nur an einer
 * Einfachauswahl hängen, und genau die erste, die wir brauchten, hängt an
 * einer Mehrfachauswahl.
 *
 * Nennt die Bedingung mehrere Werte, genügt einer davon. Damit hängt eine
 * Frage auch an zwei Wegen zugleich, ohne dass es dafür eine zweite
 * Bedingungsart bräuchte.
 */
export function frageSichtbar(frage: KennenlernenFrage, antworten: KennenlernenAntworten): boolean {
  if (!frage.zeigtWenn) return true;
  const erlaubt = Array.isArray(frage.zeigtWenn.wert) ? frage.zeigtWenn.wert : [frage.zeigtWenn.wert];
  const wert = antworten[frage.zeigtWenn.key];
  if (Array.isArray(wert)) return wert.some((v) => erlaubt.includes(v));
  return typeof wert === "string" && erlaubt.includes(wert);
}

/** Alle sichtbaren Fragen einer Ansicht, in der Reihenfolge, in der sie dastehen. */
export function fragenDerAnsicht(
  ansicht: Ansicht,
  antworten: KennenlernenAntworten = {},
): KennenlernenFrage[] {
  return (ansicht.fragen ?? []).filter((f) => frageSichtbar(f, antworten));
}

/** Ist die Frage beantwortet? Eine leere Antwort bleibt offen. */
export function frageBeantwortet(frage: KennenlernenFrage, antworten: KennenlernenAntworten): boolean {
  const wert = antworten[frage.key];
  if (Array.isArray(wert)) return wert.length > 0;
  return typeof wert === "string" && wert.trim() !== "";
}

/**
 * Steht die Rückmeldung dieser Ansicht schon an?
 *
 * Erst nach der Antwort, nicht davor. Hat die Ansicht gar keine Frage, wie die
 * vierte Ansicht auf Weg 2, steht sie sofort.
 */
export function rueckmeldungFaellig(ansicht: Ansicht, antworten: KennenlernenAntworten): boolean {
  if (!ansicht.rueckmeldung) return false;
  const fragen = fragenDerAnsicht(ansicht, antworten);
  if (fragen.length === 0) return true;
  return fragen.every((f) => frageBeantwortet(f, antworten));
}

/** Der Kasten, der nach der Antwort auf diese Frage einfährt, falls einer dran ist. */
export function antwortHinweisFuer(
  frage: KennenlernenFrage,
  antworten: KennenlernenAntworten,
): AntwortHinweis | null {
  const h = frage.antwortHinweis;
  if (!h) return null;
  const wert = antworten[frage.key];
  if (typeof wert !== "string") return null;
  return h.werte.includes(wert) ? h : null;
}

/** Die lesbare Beschriftung eines Antwortwerts. */
export function optionLabel(frage: KennenlernenFrage, value: string): string {
  return frage.optionen?.find((o) => o.value === value)?.label ?? value;
}

/** Antwort einer Frage als lesbarer Text, Mehrfachauswahl mit Komma getrennt. */
export function antwortText(frage: KennenlernenFrage, antworten: KennenlernenAntworten): string {
  const wert = antworten[frage.key];
  if (wert == null) return "";
  if (Array.isArray(wert)) return wert.map((v) => optionLabel(frage, v)).join(", ");
  if (frage.typ === "auswahl") return optionLabel(frage, wert);
  return wert;
}

/**
 * Die Dauer des persönlichen Gesprächs, in Minuten.
 *
 * Sie folgt dem Klärungsbedarf und nicht dem Hintergrund: Wer keine Themen
 * markiert und keine eigene Frage stellt, bekommt die kurze Fassung, sonst die
 * lange. Der Bewerber sieht die tatsächliche Dauer, bevor er bestätigt.
 *
 * Am 08.09.2026 sind beide Zahlen gesunken, von 30 auf 25 und von 45 auf 35:
 * Die Arbeitsprobe ist aus dem Gespräch herausgenommen worden. Dieselben
 * Zahlen stehen in der Datenbank, siehe `bewerber_termin_dauer` und die Dauer
 * der Terminart; ändert sich hier etwas, gehört dort eine Migration dazu.
 */
export const DAUER_KURZ_MINUTEN = 25;
export const DAUER_LANG_MINUTEN = 35;

export function gespraechsDauerMinuten(antworten: KennenlernenAntworten): number {
  const themen = antworten.themen;
  const hatThemen = Array.isArray(themen) && themen.length > 0;
  const frage = antworten.eigeneFrage;
  const hatFrage = typeof frage === "string" && frage.trim() !== "";
  return hatThemen || hatFrage ? DAUER_LANG_MINUTEN : DAUER_KURZ_MINUTEN;
}

/**
 * Der passende nächste Schritt, aus dem Bogen abgeleitet.
 *
 * Sechs Fälle, jeder mit genau einer nächsten Handlung. Die einfache
 * Verzweigung „bucht oder bucht nicht" reicht nicht: Eine offene
 * Startvoraussetzung ist etwas anderes als ein Missverständnis, und beides ist
 * etwas anderes als ein Ausstieg.
 */
export type NaechsterSchritt =
  | "buchen"
  | "grundsatz_unklar"
  | "voraussetzung_offen"
  | "nicht_passend"
  | "unterbrochen"
  | "nicht_jetzt";

export function naechsterSchritt(antworten: KennenlernenAntworten): NaechsterSchritt {
  // Wer die Erlaubnis grundsätzlich ablehnt, hat eine offene Voraussetzung und
  // keinen Ausschluss. Der pauschale Ausschluss ist ausdrücklich nicht gewollt.
  if (antworten.erlaubnis34c === "will_nicht") return "voraussetzung_offen";
  // Ein Missverständnis bei den beiden Verständnisfragen führt zur Erklärung,
  // nicht zur Bewertung.
  if (antworten.verstaendnisFixum === "ja" || antworten.verstaendnisProvision === "ja") {
    return "grundsatz_unklar";
  }
  if (antworten.erlaubnis34c === "unklar" || antworten.gewerbe === "unklar") return "voraussetzung_offen";
  if (antworten.startzeitpunkt === "umschauen") return "nicht_jetzt";
  return "buchen";
}

export const SCHRITT_TEXTE: Record<NaechsterSchritt, { titel: string; text: string }> = {
  buchen: {
    // Bewusst nicht wie die Überschrift der Ansicht: Ein Kasten, der die H1
    // wiederholt, sagt nichts.
    titel: "Was jetzt kommt",
    text:
      "Wir gehen im Gespräch durch, was du markiert hast, und klären die letzten Fragen. Danach " +
      "starten wir gemeinsam.",
  },
  grundsatz_unklar: {
    titel: "Eine Sache klären wir vorher kurz",
    text:
      "Es gibt bei uns kein festes Monatsgehalt, und ein übergebener Kontakt führt nicht von selbst zu " +
      "einer Provision. Beides gehört zur Selbstständigkeit dazu. Wenn das für dich passt, gehen wir es " +
      "im Gespräch gemeinsam durch.",
  },
  voraussetzung_offen: {
    titel: "Erst klären, dann alles Weitere",
    text:
      "Bei dir ist eine Startvoraussetzung noch offen. Das ist kein Ausschluss: Wir klären zuerst, was " +
      "in deinem Fall nötig ist und womit du beginnen darfst. Danach geht es weiter.",
  },
  nicht_passend: {
    titel: "Das passt gerade nicht zusammen",
    text: "Danke, dass du bis hierher gelesen hast. Du kannst das Kennenlernen jederzeit beenden.",
  },
  unterbrochen: {
    titel: "Du kannst hier weitermachen",
    text: "Dein Zwischenstand ist gespeichert. Kein Grund zur Eile.",
  },
  nicht_jetzt: {
    titel: "Vielleicht ist jetzt nicht der Zeitpunkt",
    text:
      "Du hast geschrieben, dass du dich erst einmal umschaust. Du kannst uns deine Angaben trotzdem " +
      "schicken oder pausieren und dich später selbst erinnern lassen. Ein Anruf kommt deswegen nicht.",
  },
};

/**
 * Der Abschluss des Bogens, seit dem 08.09.2026 ohne Terminwahl.
 *
 * ## Warum der Bewerber sich nicht mehr selbst bucht
 *
 * Vorher endete der Bogen im Kalender: Wer absendete, suchte sich sofort eine
 * Zeit aus. Damit stand der Termin, bevor irgendjemand seine Antworten gelesen
 * hatte. Gewollt ist das Gegenteil, nämlich nach dem Bewerberscore auszuwählen
 * und die besten gezielt einzuladen. Eingeladen wird deshalb aus dem
 * Bewerberprofil heraus, und die Buchungsstrecke steht unverändert dahinter,
 * nur eben erst nach unserer Einladung.
 *
 * ## Was der Text leisten muss
 *
 * Zwei Dinge, und beide sind heikel. Der Bewerber darf nicht im Ungewissen
 * bleiben, also sagt der Text, wann er ungefähr hört und worüber. Und er darf
 * sich nicht abgelehnt fühlen, nur weil er nicht sofort buchen kann.
 *
 * Was hier bewusst **nicht** steht: keine Frist in Tagen. Zugesagt ist nur,
 * was der Ablauf wirklich hergibt. Die HR-Managerin wird an Tag 3 und Tag 7
 * daran erinnert, dass ein Bogen auf ihre Entscheidung wartet (siehe
 * `supabase/functions/_shared/bewerber-buchung-erinnerung.ts`), und beide
 * Ausgänge, Einladung wie Absage, haben eine eigene Mail. „In der Regel ein
 * paar Tage" deckt sich damit. Ein festes Datum wäre ein Versprechen, das
 * niemand einhalten kann.
 *
 * Und für den Fall, dass doch nichts kommt, nennt der Schluss einen Weg, den
 * der Bewerber selbst gehen kann.
 */
export const ABSCHLUSS_TEXTE = {
  /**
   * Der Satz über der Liste, noch vor dem Absenden.
   *
   * Er sagt nur, was der Klick auslöst. Alles, was danach geschieht, steht
   * unter der Liste in `nachNotizen`: erst was wir mitnehmen, dann was folgt.
   */
  vorAbsenden:
    "Wenn du absendest, gehen deine Antworten zu uns, und wir sehen sie uns in Ruhe an.",
  /** Die Überschrift über den drei Punkten aus seinen eigenen Angaben. */
  notizenTitel: "Das haben wir uns notiert",
  /**
   * Der Absatz unter der Liste, immer noch vor dem Absenden.
   *
   * Hier steht zum ersten Mal, was das Gespräch überhaupt ist. Der kurze Name
   * allein sagt einem Bewerber nichts, deshalb ausgeschrieben. Und beide
   * Ausgänge, damit das Schweigen keiner wird.
   */
  nachNotizen:
    "Danach melden wir uns bei dir, per E-Mail oder telefonisch. In der Regel dauert das ein paar " +
    `Tage. Passt es aus unserer Sicht, laden wir dich zu einem ${GESPRAECH_NAME_DATIV} ein, in dem ` +
    "wir uns näher kennenlernen und besprechen, wie ein Start für dich aussehen könnte. Und wenn " +
    "es nicht passt, hörst du auch das von uns.",
  /** Die Beschriftung des Absendeknopfes. Sie sagt nur noch, was der Klick tut. */
  knopf: "Angaben absenden",
  /** Die Überschrift nach dem Absenden. Der Vorname kommt aus der Seite dazu. */
  titel: "Danke",
  /** Die Überschrift, wenn der Bogen schon früher abgeschickt wurde. */
  titelSchonFrueher: "Das hast du schon erledigt",
  /**
   * Der erste Absatz nach dem Absenden.
   *
   * Bewusst nicht derselbe Wortlaut wie vor dem Absenden. Dort stand eine
   * Ankündigung, hier steht eine Bestätigung: Die Angaben sind da, und jetzt
   * sind wir am Zug. Zweimal derselbe Satz hintereinander läse sich wie ein
   * Fehler in der Seite.
   */
  text:
    "Deine Angaben sind bei uns. Jetzt sind wir am Zug: Wir lesen sie in Ruhe und entscheiden " +
    "danach, wie es mit dir weitergeht.",
  /**
   * Der zweite Absatz. Beide Ausgänge, damit das Schweigen keiner wird.
   *
   * Er ergänzt um das, was vor dem Absenden noch nicht dastand: dass die
   * Einladung einen Link trägt und er sich die Zeit selbst aussucht.
   */
  weiter:
    "Hören wirst du von uns in jedem Fall, per E-Mail oder telefonisch, meist innerhalb weniger " +
    "Tage. Passt es, bekommst du eine Einladung mit einem Link, über den du dir Tag und Uhrzeit " +
    `für dein ${GESPRAECH_NAME_KLEIN} selbst aussuchst. Wenn es nicht passt, sagen wir dir auch das.`,
  /** Der Schluss. Er nennt den Weg für den Fall, dass gar nichts kommt. */
  fuss:
    "Du bekommst gleich eine E-Mail mit deinen Angaben. Wenn etwas nicht stimmt oder du länger " +
    "nichts von uns hörst, antworte einfach darauf.",
  /** Was jemand liest, der seinen Link ein zweites Mal öffnet. */
  schonFrueher: "Deine Angaben liegen uns vor. Wenn sich etwas geändert hat, schreib uns einfach.",
};

// ───────────────────────────── Der Ausstieg (P11) ─────────────────────────

/**
 * Der Ausstieg, erreichbar von jeder Ansicht und vom Abschluss.
 *
 * Abgrenzung zur Pause: Pause heißt „später wieder erinnern", kein Interesse
 * heißt „nie wieder melden". Deshalb steht der Ausstieg nicht in derselben
 * Liste wie die Pausenwahlen.
 */
export const AUSSTIEG_TEXTE = {
  /** Die kleine Zeile unter Zurück und Weiter. */
  link: "Passt nicht für dich? Kein Interesse",
  titel: "Schade, aber danke für die Offenheit",
  text:
    "Magst du uns kurz sagen, woran es liegt? Ein Satz genügt, und er hilft uns wirklich. Pflicht ist " +
    "er nicht.",
  platzhalter: "Zum Beispiel: Der Zeitpunkt passt gerade nicht.",
  beenden: "Bewerbung beenden",
  weiter: "Doch weitermachen",
  fuss: "Wir melden uns dann nicht mehr. Du kannst dich später jederzeit wieder melden.",
};

/**
 * Höchstlänge des Grundes.
 *
 * Nicht abgeschrieben, sondern aus `bewerber-seite` übernommen: Die Function
 * weist einen längeren Text mit einem Fehler ab, und der Bewerber sähe nur,
 * dass sein Klick nichts bewirkt.
 */
export const AUSSTIEG_GRUND_MAX = GRUND_MAX;

// ───────────────────────────── Der Überblick ──────────────────────────────

/**
 * Der Überblick auf der vorletzten Ansicht: seine eigenen Angaben, geordnet,
 * ohne Wertung.
 *
 * Drei Gruppen, wie im Bogen beschrieben. Seit dem 07.09.2026 stehen auch die
 * beiden Verständnisfragen, die dritte Wegfrage und die Begründung zur
 * Erlaubnis darin: Sie fehlten, und der Bewerber konnte deshalb genau die
 * Angaben nicht mehr korrigieren, über die im Gespräch als Erstes geredet
 * wird. Seit dem 08.09.2026 stehen die Freitexte hinter „Etwas anderes"
 * ebenfalls hier, sonst wäre das Geschriebene nirgends zu lesen.
 *
 * Die Erreichbarkeit fehlt seit dem 08.09.2026, weil der Bogen sie nicht mehr
 * fragt. Ältere Einreichungen behalten ihre Antwort, siehe `ALTFRAGEN`.
 *
 * Nicht mehr darin steht `hintergrund`. Der Wert wird beim Absenden aus dem
 * gewählten Weg abgeleitet und nicht mehr gefragt; als eigene Zeile stünde im
 * Überblick ein Satz, den der Bewerber nie gesagt hat.
 */
export type UeberblickZeile = { ansicht: number; label: string; wert: string };
export type UeberblickGruppe = { titel: string; zeilen: UeberblickZeile[] };

export const UEBERBLICK_GRUPPEN: { titel: string; keys: string[] }[] = [
  {
    titel: "So möchtest du starten",
    keys: ["zeitProWoche", "perspektive", "leadPraeferenz", "einkommensziel", "startzeitpunkt"],
  },
  {
    titel: "Das bringst du mit",
    keys: [
      "weg",
      "wegAntwort1",
      "wegAntwort1Frei",
      "wegAntwort2",
      "wegAntwort2Frei",
      "wegAntwort3",
      "passung",
      // Die dritte Tür: eigene Erfahrung, deshalb hierher und nicht zum Start.
      "leadErfahrung",
      "leadQuote",
    ],
  },
  {
    titel: "Das klären wir im Gespräch",
    keys: [
      "verstaendnisFixum",
      "verstaendnisProvision",
      /*
       * „Wie arbeitest du heute?" steht hier und nicht bei „So möchtest du
       * starten": Die Frage misst keine Eignung, sie nennt eine
       * Voraussetzung, die vor dem Start geklärt werden muss. Genau das ist
       * der Zweck dieser Gruppe.
       */
      "arbeitsform",
      "gewerbe",
      "erlaubnis34c",
      "erlaubnis34cBegruendung",
      "themen",
      "eigeneFrage",
    ],
  },
];

export function kennenlernenUeberblick(antworten: KennenlernenAntworten): UeberblickGruppe[] {
  const ansichten = ansichtenFuer(antworten);
  const bauen = (a: Ansicht, f: KennenlernenFrage): UeberblickZeile | null => {
    const wert = antwortText(f, antworten);
    return wert ? { ansicht: a.nummer, label: f.kurz, wert } : null;
  };

  const zeile = (key: string): UeberblickZeile | null => {
    /*
     * Zwei Fragen dürfen sich einen Schlüssel teilen, siehe `leadPraeferenz`
     * auf der Ansicht „Deine ersten Kunden und dein Ziel". Maßgeblich ist
     * dann die Fassung, die dieser Bewerber wirklich gesehen hat, sonst
     * stünde im Überblick die Beschriftung des anderen Wegs. Ist keine
     * sichtbar, gilt die erste: Eine ältere Einreichung, deren Bedingung
     * heute nicht mehr zutrifft, soll ihre Angabe nicht verlieren.
     */
    let ersatz: UeberblickZeile | null = null;
    for (const a of ansichten) {
      for (const f of a.fragen ?? []) {
        if (f.key !== key) continue;
        if (frageSichtbar(f, antworten)) return bauen(a, f);
        if (!ersatz) ersatz = bauen(a, f);
      }
    }
    return ersatz;
  };

  return UEBERBLICK_GRUPPEN.map((g) => ({
    titel: g.titel,
    zeilen: g.keys.map(zeile).filter((z): z is UeberblickZeile => !!z),
  })).filter((g) => g.zeilen.length > 0);
}

/**
 * Was beim Absenden an die Function geht.
 *
 * Leere Antworten fallen weg, und zwei Werte werden abgeleitet, damit die
 * bestehenden Auswertungen unverändert weiterrechnen:
 *
 *   - `hintergrund` bekommt den Wert des gewählten Wegs, und `netzwerk`,
 *     wenn der Bewerber im eigenen Netzwerk akquirieren will. Der alte Bogen
 *     hatte beides in einer einzigen Mehrfachauswahl.
 *   - `gewerbe34c` wird aus den beiden getrennten Fragen zusammengesetzt.
 *     `bewerberVorabScore.ts` und die Vorwissen-Karte lesen diesen Schlüssel.
 *
 * Und weggeworfen wird jede bedingte Antwort, deren Bedingung nicht mehr
 * zutrifft, weil der Bewerber seine Wahl nachträglich geändert hat. Sonst
 * stünde im Profil ein Satz, warum er die Erlaubnis nicht will, obwohl er sie
 * hat, oder ein Freitext hinter einem „Etwas anderes", das gar nicht mehr
 * markiert ist. Bis zum 08.09.2026 stand hier nur die Begründung zur
 * Erlaubnis; seit es mehrere bedingte Fragen gibt, wird gefragt statt
 * aufgezählt.
 */
export function antwortenZumSenden(antworten: KennenlernenAntworten): KennenlernenAntworten {
  const raus: KennenlernenAntworten = {};
  for (const [key, wert] of Object.entries(antworten)) {
    if (Array.isArray(wert)) {
      if (wert.length > 0) raus[key] = wert;
    } else if (typeof wert === "string" && wert.trim() !== "") {
      raus[key] = wert.trim();
    }
  }

  /*
   * Gefragt wird nach dem Schlüssel und nicht nach der einzelnen Frage: Auf
   * der Ansicht „Deine ersten Kunden und dein Ziel" stehen zwei Fassungen von
   * `leadPraeferenz`, und je Weg ist genau eine davon sichtbar. Über die
   * einzelne Frage geprüft löschte die unsichtbare Fassung die Antwort, die
   * die sichtbare gerade entgegengenommen hat.
   */
  for (const ansicht of ansichtenFuer(raus)) {
    const sichtbar = new Set(fragenDerAnsicht(ansicht, raus).map((f) => f.key));
    for (const frage of ansicht.fragen ?? []) {
      if (frage.zeigtWenn && !sichtbar.has(frage.key)) delete raus[frage.key];
    }
  }

  const weg = getWeg(typeof raus.weg === "string" ? raus.weg : undefined);
  const hintergrund = new Set(Array.isArray(raus.hintergrund) ? raus.hintergrund : []);
  if (weg) hintergrund.add(weg.hintergrund);
  if (raus.leadPraeferenz === "eigen" || raus.leadPraeferenz === "beides") hintergrund.add("netzwerk");
  if (hintergrund.size > 0) raus.hintergrund = [...hintergrund];

  const abgeleitet = gewerbe34cAbgeleitet(raus);
  if (abgeleitet) raus.gewerbe34c = abgeleitet;

  return raus;
}

/**
 * Setzt die beiden getrennten Fragen zum alten Sammelwert zusammen.
 *
 * `lehnt_ab` kann daraus bewusst nicht entstehen: Der Wert löst im Assessment
 * ein hartes Kriterium aus, und niemand soll vor dem ersten Gespräch darauf
 * stehen, weil er schriftlich vorsichtig geantwortet hat. Wer die Erlaubnis
 * grundsätzlich nicht will, landet auf `im_gespraech`.
 */
export function gewerbe34cAbgeleitet(antworten: KennenlernenAntworten): string | null {
  const gewerbe = typeof antworten.gewerbe === "string" ? antworten.gewerbe : "";
  const erlaubnis = typeof antworten.erlaubnis34c === "string" ? antworten.erlaubnis34c : "";
  if (!gewerbe && !erlaubnis) return null;
  if (gewerbe === "unklar" || erlaubnis === "unklar" || erlaubnis === "will_nicht") return "im_gespraech";
  const hatGewerbe = gewerbe === "ja";
  const hatErlaubnis = erlaubnis === "ja";
  if (hatGewerbe && hatErlaubnis) return "beides";
  if (hatGewerbe) return "nur_gewerbe";
  return "keines";
}

/**
 * Stammen diese Antworten aus dem neuen Kennenlernen?
 *
 * Beide Bögen schreiben in dieselbe Spalte. Der gewählte Weg gibt es nur hier,
 * er ist deshalb das Erkennungsmerkmal. Ohne Migration und ohne zweite Tabelle.
 */
export function istKennenlernen(antworten: KennenlernenAntworten | null | undefined): boolean {
  if (!antworten) return false;
  return typeof antworten.weg === "string" && !!getWeg(antworten.weg);
}

/**
 * Die markierten Themen als lesbare Beschriftungen.
 *
 * Steht hier und nicht in der Seite, weil dieselbe Liste auch in der Akte und
 * in der Mail auftaucht. Ein Wert wie „kosten" gehört in die Datenbank, nicht
 * vor die Augen eines Menschen.
 */
export function themenLabels(antworten: KennenlernenAntworten): string[] {
  const werte = Array.isArray(antworten.themen) ? antworten.themen : [];
  const frage = ANSICHTEN.flatMap((a) => a.fragen ?? []).find((f) => f.key === "themen");
  if (!frage) return werte;
  return werte.map((v) => optionLabel(frage, v));
}

/** Die Kurzmarken für den ersten Blick in der Akte. */
export function kennenlernenKurzmarken(antworten: KennenlernenAntworten): string[] {
  const marken: string[] = [];
  const weg = getWeg(typeof antworten.weg === "string" ? antworten.weg : undefined);
  if (weg) marken.push(weg.kurz);

  const karte = (key: string, werte: Record<string, string>) => {
    const wert = antworten[key];
    if (typeof wert === "string" && werte[wert]) marken.push(werte[wert]);
  };
  karte("zeitProWoche", {
    unter_10: "unter 10 Std",
    "10_bis_20": "10 bis 20 Std",
    vollzeit: "Vollzeit",
  });
  karte("perspektive", {
    dauerhaft_neben: "dauerhaft nebenberuflich",
    spaeter_haupt: "später hauptberuflich",
    sofort_haupt: "sofort hauptberuflich",
    unklar: "Perspektive offen",
  });
  karte("leadPraeferenz", {
    leads: "will Leads",
    eigen: "eigenes Netzwerk",
    beides: "Leads und eigenes Netzwerk",
    unklar: "Akquise offen",
  });
  karte("startzeitpunkt", {
    sofort: "Start sofort",
    vier_wochen: "Start in 4 Wochen",
    zwei_drei_monate: "Start in 2 bis 3 Monaten",
    umschauen: "schaut sich um",
  });

  const themen = antworten.themen;
  if (Array.isArray(themen) && themen.length > 0) marken.push(`${themen.length} eigene Themen`);
  marken.push(`${gespraechsDauerMinuten(antworten)} Minuten Termin`);
  return marken;
}

// ───────────────────────────── Der Monatskalender (P4) ────────────────────

/*
 * Die Terminwahl zeigt seit dem 07.09.2026 einen Monat statt einer Liste von
 * Tagen. Sie steht seit dem 08.09.2026 nicht mehr am Ende des Bogens, sondern
 * allein in der Buchungsstrecke `BewerberKooperationsgespraech.tsx`, die der
 * Bewerber erst über unsere Einladung erreicht. Die Rechnung dazu steht hier
 * und nicht in der Seite, damit sie ohne
 * Browser prüfbar ist. Gerechnet wird durchgehend auf Zeichenketten der Form
 * „YYYY-MM-DD", wie überall in der Terminlogik: Ein `Date` trüge eine Zone mit
 * sich, und die des Browsers ist hier die falsche.
 */

const MONATSNAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export const WOCHENTAGE_KURZ_MO = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Der Monat eines Tages, als „YYYY-MM". */
export function monatVon(tag: string): string {
  return tag.slice(0, 7);
}

/** Einen Monat um ganze Monate verschieben. */
export function monatPlus(monat: string, schritt: number): string {
  const [jahr, m] = monat.split("-").map(Number);
  const d = new Date(Date.UTC(jahr, m - 1 + schritt, 1));
  return d.toISOString().slice(0, 7);
}

/** „September 2026". */
export function monatName(monat: string): string {
  const [jahr, m] = monat.split("-").map(Number);
  return `${MONATSNAMEN[m - 1] ?? ""} ${jahr}`;
}

/**
 * Das Raster eines Monats, Montag zuerst.
 *
 * Volle Wochen, damit die Spalten stimmen. Tage aus dem Vor- und Folgemonat
 * stehen mit `imMonat: false` darin und werden blass und ohne Beschriftung
 * gezeigt.
 */
export type Kalendertag = { tag: string; imMonat: boolean };

export function monatsRaster(monat: string): Kalendertag[] {
  const [jahr, m] = monat.split("-").map(Number);
  const erster = new Date(Date.UTC(jahr, m - 1, 1));
  // getUTCDay: 0 ist Sonntag. Die Woche beginnt bei uns am Montag.
  const versatz = (erster.getUTCDay() + 6) % 7;
  const tageImMonat = new Date(Date.UTC(jahr, m, 0)).getUTCDate();
  const wochen = Math.ceil((versatz + tageImMonat) / 7);

  const raster: Kalendertag[] = [];
  for (let i = 0; i < wochen * 7; i += 1) {
    const d = new Date(Date.UTC(jahr, m - 1, 1 - versatz + i));
    const tag = d.toISOString().slice(0, 10);
    raster.push({ tag, imMonat: tag.slice(0, 7) === monat });
  }
  return raster;
}

/** Die Nummer eines Tages im Monat, für die Beschriftung. */
export function tagesZahl(tag: string): number {
  return Number(tag.slice(8, 10));
}
