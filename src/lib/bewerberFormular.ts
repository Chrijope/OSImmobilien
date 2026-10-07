/**
 * Der Vorab-Fragebogen, den der Bewerber nach seiner Bewerbung per Mail bekommt.
 *
 * Diese Datei ist die einzige Quelle für drei Orte:
 *   1. die öffentliche Formularseite (BewerberFormularPublic)
 *   2. die Vorwissen-Karte im Erstgesprächs-Tab
 *   3. die schmalen Hinweisstreifen an den Punkten des Erstgesprächsskripts
 *
 * Aufbau bewusst nach dem Vorbild von `assessmentSkript.ts`, damit beide
 * Strukturen gleich zu lesen sind.
 *
 * Zwei Grundsätze, die den ganzen Katalog tragen:
 *
 * Erstens ist das Formular ein Geschenk an das Gespräch, keine Hürde davor.
 * Jede Frage darf übersprungen werden, das Skript funktioniert ohne eine
 * einzige Antwort genauso wie bisher.
 *
 * Zweitens setzt keine Antwort jemals ein Skriptfeld von selbst und fließt nie
 * unmittelbar in die Punktzahl ein. Zwei der drei harten Kriterien (Zeit und
 * Paragraf 34c) kommen aus diesem Formular, und zwei gerissene harte Kriterien
 * erzwingen im Scoring die Empfehlung C. Niemand darf vor dem ersten Telefonat
 * auf Absage stehen, weil er schriftlich vorsichtig geantwortet hat. Die
 * Antwort erscheint als gekennzeichneter Vorschlag, die HR-Managerin bestätigt
 * ihn mit einem Klick. Dieser Klick ist zugleich der Moment, in dem sie die
 * Aussage im Gespräch bestätigt bekommt.
 */

import type { AssessmentAntworten, AssessmentPfad } from "./assessmentSkript";

/** Fassung des Einwilligungstextes, wird je Einreichung mitgespeichert. */
export const EINWILLIGUNG_VERSION = "2026-08-v1";

export const EINWILLIGUNG_TEXT =
  "Ich bin einverstanden, dass OS Immobilien meine Angaben zur Bearbeitung meiner Bewerbung " +
  "speichert und verwendet. Meine Angaben sind freiwillig. Ich kann mein Einverständnis " +
  "jederzeit formlos widerrufen, zum Beispiel per Mail an os@os-immobilien.com.";

/** Gültigkeit des persönlichen Links in Tagen. */
export const FORMULAR_GUELTIG_TAGE = 14;

/** Nach so vielen Tagen geht die eine Erinnerung, sofern noch nichts vorliegt. */
export const FORMULAR_ERINNERUNG_NACH_TAGEN = 3;

export type FormularFragenTyp = "auswahl" | "mehrfach" | "text" | "textarea";

/**
 * Die fünf Blöcke des Fragebogens. Der Name steht im Wizard als kleine
 * Zeile über der Frage, damit der Bewerber weiß, wo er gerade ist.
 */
export const FORMULAR_BLOECKE = {
  person: "Wer du bist und woher",
  mitbringen: "Was du mitbringst",
  vorhaben: "Was du vorhast",
  erwartung: "Erwartung und Einsatz",
  formales: "Formales und Erreichbarkeit",
} as const;

export type FormularBlock = keyof typeof FORMULAR_BLOECKE;

export type FormularOption = {
  value: string;
  label: string;
  /** Kleines Symbol auf der Kachel, nur dort gesetzt, wo es die Auswahl schneller macht. */
  emoji?: string;
  /**
   * Vertiefungsfrage im Wortlaut, die die HR-Managerin im Gespräch stellt,
   * wenn genau diese Antwort gewählt wurde. Steht als grauer Sprechtext im
   * Hinweisstreifen am passenden Skriptpunkt.
   */
  vertiefung?: string;
};

export type FormularFrage = {
  /** Schlüssel in `bewerber_formular.antworten`. */
  key: string;
  /** Nummer, wie der Bewerber sie sieht. */
  nummer: number;
  /** Block, zu dem die Frage gehört, siehe FORMULAR_BLOECKE. */
  block: FormularBlock;
  /** Der Fragetext, wörtlich so, wie der Bewerber ihn liest. */
  frage: string;
  /** Erklärender Satz unter der Frage. */
  hinweis?: string;
  typ: FormularFragenTyp;
  optionen?: FormularOption[];
  /**
   * Nur für Einzelauswahl: "skala" zeigt die Optionen als Stufen auf einer
   * Linie statt als Kacheln. Eine Option mit dem Wert "unklar" steht dabei
   * als Extra-Feld unter der Skala, damit die Linie sauber bleibt.
   */
  darstellung?: "skala";
  placeholder?: string;
  maxLaenge?: number;
  /** Kurzform für die Vorwissen-Karte, etwa "Zeit pro Woche". */
  kurz: string;
  /**
   * Nur anzeigen, wenn die genannte Frage einen dieser Werte enthält. Bedingte
   * Fragen erscheinen erst, wenn die Vorauswahl passt. Mehrere Werte wirken
   * als "oder": Die Frage nach der Erfahrungsdauer gilt für jede Art von
   * Erfahrung, nicht nur für die Immobilienbranche.
   */
  nurWenn?: { key: string; enthaelt: string | string[] };
  /** Nummer der Station im Erstgesprächsskript, auf die die Frage einzahlt. */
  station: number;
  /**
   * Zielfeld im Assessment, falls die Antwort per Knopf übernommen werden darf.
   * Fehlt es, ist die Antwort reine Anzeige (etwa Erreichbarkeit).
   */
  zielFeld?: keyof AssessmentAntworten;
  /** Ausdrücklich freiwillig, wird im Formular so gekennzeichnet. */
  freiwillig?: boolean;
};

/**
 * Übersetzt einen Formularwert in den Wert, den das Assessment-Feld erwartet.
 * Gibt `null` zurück, wenn es keine sinnvolle Entsprechung gibt; dann erscheint
 * im Skript nur der Hinweis und kein Übernehmen-Knopf.
 */
export type WertUebersetzer = (wert: unknown) => unknown | null;

export const FORMULAR_FRAGEN: FormularFrage[] = [
  // ── Block 1: Wer du bist und woher ──
  {
    key: "region",
    nummer: 1,
    block: "person",
    frage: "Wo bist du zu Hause?",
    hinweis: "Postleitzahl und Ort genügen.",
    typ: "text",
    placeholder: "z. B. 83022 Rosenheim",
    maxLaenge: 80,
    kurz: "Region",
    station: 2,
  },
  {
    key: "beschaeftigung",
    nummer: 2,
    block: "person",
    frage: "Was machst du gerade beruflich?",
    typ: "auswahl",
    kurz: "Beschäftigung",
    station: 2,
    zielFeld: "beschaeftigungsart",
    optionen: [
      // Emojis wie im Lead-Funnel der Landingpage: Sie machen die acht
      // Kacheln auf dem Handy auf einen Blick unterscheidbar.
      { value: "angestellt", label: "Angestellt", emoji: "💼", vertiefung: "Du bist angestellt. Ist das für dich ein Zustand, den du beenden willst, oder soll das erst einmal nebeneinander laufen?" },
      { value: "selbststaendig", label: "Selbstständig", emoji: "🏠", vertiefung: "Du bist selbstständig. Wie viel Luft hast du neben deinem laufenden Geschäft wirklich?" },
      { value: "freiberuflich", label: "Freiberuflich", emoji: "✏️", vertiefung: "Freiberuflich unterwegs. Passt das zeitlich zusammen oder wäre das eine Ablösung?" },
      { value: "arbeitslos", label: "Zurzeit ohne Anstellung", emoji: "🔎", vertiefung: "Du suchst gerade neu. Was ist dir bei der nächsten Sache besonders wichtig?" },
      { value: "student", label: "Student", emoji: "🎓", vertiefung: "Du studierst. Wie sieht dein Semester zeitlich aus?" },
      { value: "ausbildung", label: "In Ausbildung", emoji: "🛠️", vertiefung: "Du bist in Ausbildung. Wann bist du damit durch?" },
      { value: "rentner", label: "Rentner", emoji: "🌅", vertiefung: "Was reizt dich daran, jetzt noch einmal etwas Eigenes aufzubauen?" },
      { value: "sonstiges", label: "Etwas anderes", emoji: "✨" },
    ],
  },
  {
    key: "taetigkeit",
    nummer: 3,
    block: "person",
    frage: "Und was genau machst du da? Ein Satz reicht.",
    typ: "text",
    placeholder: "z. B. Baufinanzierungsberater bei einer Sparkasse",
    maxLaenge: 120,
    kurz: "Tätigkeit",
    station: 2,
    zielFeld: "branche",
  },

  // ── Block 2: Was du mitbringst ──
  {
    key: "hintergrund",
    nummer: 4,
    block: "mitbringen",
    frage: "Was davon trifft auf dich zu?",
    hinweis: "Mehrfachauswahl möglich.",
    typ: "mehrfach",
    kurz: "Hintergrund",
    station: 3,
    // Die Pfade werden bewusst nur vorgeschlagen, nie gesetzt. Siehe Kopf.
    zielFeld: "pfade",
    optionen: [
      // Die Beschriftungen sind aus der Sicht des Bewerbers formuliert und
      // heißen absichtlich nicht wie die internen Pfadnamen. Wer sich selbst
      // als "Quereinsteiger" einordnen muss, stuft sich herab und antwortet
      // defensiv. Dieselbe Haltung nimmt das Skript in Punkt 3 ein.
      { value: "immo", label: "Ich arbeite oder arbeitete in der Immobilienbranche" },
      { value: "findi", label: "Ich bin in der Finanz- oder Versicherungsberatung unterwegs" },
      { value: "vertrieb", label: "Ich habe Vertriebserfahrung in einer anderen Branche" },
      { value: "quereinsteiger", label: "Vertrieb ist für mich neu, ich will es lernen" },
      { value: "netzwerk", label: "Ich habe ein eigenes Netzwerk, dem ich so etwas anbieten könnte" },
    ],
  },
  {
    /*
     * Das "wie lange" fehlte bisher ganz.
     *
     * Ob jemand seit acht Monaten oder seit zwölf Jahren verkauft, stand
     * nirgends, obwohl es die Einordnung stärker prägt als die Branche selbst.
     * Erscheint nur bei tatsächlicher Erfahrung: Ein Quereinsteiger bekommt die
     * Frage nie zu sehen und muss sich nicht erklären.
     */
    key: "erfahrungsdauer",
    nummer: 5,
    block: "mitbringen",
    frage: "Wie lange machst du das schon?",
    hinweis: "Gemeint ist deine Zeit im Vertrieb oder in der Immobilienbranche insgesamt.",
    typ: "auswahl",
    kurz: "Erfahrung",
    station: 3,
    nurWenn: { key: "hintergrund", enthaelt: ["immo", "findi", "vertrieb"] },
    optionen: [
      { value: "unter_1", label: "Weniger als ein Jahr", vertiefung: "Du bist noch nicht lange dabei. Was hat dich in die Branche gebracht?" },
      { value: "1_bis_3", label: "Ein bis drei Jahre", vertiefung: "Ein bis drei Jahre, du kennst das Geschäft also. Was läuft heute gut und was fehlt dir?" },
      { value: "3_bis_10", label: "Drei bis zehn Jahre", vertiefung: "Drei bis zehn Jahre, das ist echte Erfahrung. Was ist der Grund, dass du dich jetzt verändern willst?" },
      { value: "ueber_10", label: "Über zehn Jahre", vertiefung: "Über zehn Jahre in der Branche. Dann bringst du ein Netzwerk mit. Wie groß ist dein Kundenstamm heute?" },
    ],
  },
  {
    key: "immoSchwerpunkt",
    nummer: 6,
    block: "mitbringen",
    frage: "In welchem Bereich der Immobilienbranche bist du unterwegs?",
    typ: "auswahl",
    kurz: "Immobilien-Schwerpunkt",
    station: 3,
    zielFeld: "immoSchwerpunkt",
    nurWenn: { key: "hintergrund", enthaelt: "immo" },
    optionen: [
      { value: "makler", label: "Makler", vertiefung: "Als Makler kennst du den Verkauf. Wie oft geht es bei dir um Kapitalanlage statt Eigennutzung?" },
      { value: "bautraeger", label: "Bauträgervertrieb", vertiefung: "Bauträgervertrieb, das liegt sehr nah an dem, was wir machen. Wie viele Einheiten hast du im letzten Jahr vermittelt?" },
      { value: "kapitalanlage", label: "Kapitalanlage", vertiefung: "Kapitalanlage, das ist genau unser Feld. Sag mal, wie viele Einheiten hast du im letzten Jahr vermittelt und was ist der Grund, dass du dich verändern willst?" },
      { value: "verwaltung", label: "Verwaltung", vertiefung: "Verwaltung ist eine ganz andere Ecke als Vertrieb. Was reizt dich am Verkauf?" },
      { value: "sonstiges", label: "Etwas anderes" },
    ],
  },
  {
    key: "findiSparten",
    nummer: 7,
    block: "mitbringen",
    frage: "In welchen Bereichen berätst du?",
    hinweis: "Mehrfachauswahl möglich.",
    typ: "mehrfach",
    kurz: "Beratungsfelder",
    station: 3,
    zielFeld: "findiSparten",
    nurWenn: { key: "hintergrund", enthaelt: "findi" },
    optionen: [
      { value: "versicherung", label: "Versicherung" },
      { value: "baufinanzierung", label: "Baufinanzierung", vertiefung: "Baufinanzierung heißt, du sitzt täglich mit Leuten zusammen, die über Immobilien nachdenken. Wie oft kommt dabei das Thema Kapitalanlage auf?" },
      { value: "vermoegensberatung", label: "Vermögensberatung" },
      { value: "erlaubnis", label: "Ich habe bereits eine Erlaubnis nach 34d oder 34f", vertiefung: "Du hast schon eine Erlaubnis. Dann kennst du den Weg. Die 34c ist derselbe Antrag, nur ein anderes Formular. Wie groß ist dein Kundenstamm heute?" },
    ],
  },

  // ── Block 3: Was du vorhast ──
  {
    key: "zeitProWoche",
    nummer: 8,
    block: "vorhaben",
    frage: "Wie viel Zeit könntest du pro Woche für den Aufbau einplanen?",
    typ: "auswahl",
    kurz: "Zeit pro Woche",
    station: 5,
    zielFeld: "zeitProWoche",
    optionen: [
      { value: "unter_10", label: "Weniger als 10 Stunden, erst einmal nebenher", vertiefung: "Du hast weniger als zehn Stunden angegeben. Erzähl mir, wie dein Alltag aussieht, dann schauen wir gemeinsam, ob das reicht. Ich sage dir ehrlich, ab wann es schwierig wird." },
      { value: "10_bis_20", label: "10 bis 20 Stunden, das ist mir wichtig", vertiefung: "Du hast zehn bis zwanzig Stunden angegeben. Wie sehen die in deiner Woche konkret aus?" },
      { value: "vollzeit", label: "Vollzeit, ich will das hauptberuflich machen", vertiefung: "Du willst das hauptberuflich machen. Was müsste in den ersten drei Monaten passieren, damit das für dich trägt?" },
    ],
  },
  {
    /*
     * Die Stunden sagen, was heute geht. Die Perspektive sagt, wohin er will.
     * Das ist nicht dasselbe: Jemand kann mit zehn Stunden starten und trotzdem
     * den Sprung planen. Genau diese Unterscheidung trägt die Closing-
     * Präsentation mit "nebenberuflich, im besten Fall hauptberuflich".
     */
    key: "perspektive",
    nummer: 9,
    block: "vorhaben",
    frage: "Und langfristig, wohin soll es gehen?",
    typ: "auswahl",
    kurz: "Perspektive",
    station: 5,
    optionen: [
      { value: "dauerhaft_neben", label: "Dauerhaft nebenberuflich, als zweites Standbein", vertiefung: "Du willst dauerhaft nebenberuflich bleiben. Das geht bei uns, aber es verändert das Tempo. Was ist dein Ziel damit?" },
      { value: "spaeter_haupt", label: "Nebenberuflich starten, perspektivisch hauptberuflich", vertiefung: "Du willst nebenberuflich starten und später umsteigen. Woran würdest du merken, dass der Zeitpunkt für den Wechsel da ist?" },
      { value: "sofort_haupt", label: "Von Anfang an hauptberuflich", vertiefung: "Du willst von Anfang an hauptberuflich einsteigen. Was müsste in den ersten Monaten passieren, damit das trägt?" },
      { value: "unklar", label: "Das will ich erst einmal schauen", vertiefung: "Du willst es erst einmal schauen. Völlig in Ordnung. Was müsste passieren, damit du sagst: Das mache ich groß?" },
    ],
  },
  {
    /*
     * Zahlt direkt auf zwei Dinge ein: auf das Lead-Paket im Closing und auf
     * das Folgegespräch mit Christian Kurz, das im Vertragsreiter angeboten
     * wird. Wer hier "bereitgestellte Leads" wählt, ist genau dieser Fall, und
     * das steht schon vor dem ersten Telefonat fest.
     */
    key: "leadPraeferenz",
    nummer: 10,
    block: "vorhaben",
    frage: "Möchtest du lieber mit bereitgestellten Leads arbeiten oder eigenständig Kunden gewinnen?",
    typ: "auswahl",
    kurz: "Leads oder eigene Akquise",
    station: 6,
    optionen: [
      { value: "leads", label: "Vor allem mit bereitgestellten Leads", vertiefung: "Du willst vor allem mit bereitgestellten Leads arbeiten. Erzähl mir, wie du dir das vorstellst, dann sage ich dir, wie es bei uns wirklich läuft." },
      { value: "eigen", label: "Vor allem im eigenen Netzwerk", vertiefung: "Du willst im eigenen Netzwerk arbeiten. Wie viele Menschen kommen dafür in Frage, und hast du das schon einmal gemacht?" },
      { value: "beides", label: "Beides gemischt", vertiefung: "Beides gemischt, das ist bei uns der Normalfall. Womit würdest du anfangen?" },
      { value: "unklar", label: "Weiß ich noch nicht", vertiefung: "Du bist dir noch nicht sicher. Lass uns beides kurz durchgehen, dann merkst du selbst, was dir liegt." },
    ],
  },
  {
    key: "einkommensziel",
    nummer: 11,
    block: "vorhaben",
    frage: "Was möchtest du damit im Monat verdienen, wenn es läuft?",
    hinweis: "Tippe auf die Stufe, die zu deinem Ziel passt. Es geht um das Ziel, nicht um dein heutiges Einkommen.",
    typ: "auswahl",
    darstellung: "skala",
    kurz: "Einkommensziel",
    station: 4,
    zielFeld: "einkommensziel",
    optionen: [
      // Bewusst Spannen statt einer freien Zahl: Eine Zahleneingabe ist eine
      // Tastaturfrage und wirkt wie eine Prüfung. Gefragt wird nach dem Ziel,
      // nicht nach dem heutigen Einkommen. Das Ziel beantwortet man gerne.
      { value: "bis_2000", label: "Bis 2.000 Euro", vertiefung: "Du hast bis 2.000 Euro angegeben. Lass uns kurz rechnen: Ein einziger Abschluss bringt bei 300.000 Euro Kaufpreis rund 12.000 Euro. Womit hast du gerechnet?" },
      { value: "2000_5000", label: "2.000 bis 5.000 Euro", vertiefung: "Du hast 2.000 bis 5.000 Euro angegeben. Bei vier Prozent auf 300.000 Euro sind das 12.000 Euro pro Abschluss. Du bräuchtest also etwa alle drei Monate einen. Traust du dir das zu?" },
      { value: "5000_10000", label: "5.000 bis 10.000 Euro", vertiefung: "Du hast 5.000 bis 10.000 Euro angegeben. Rechnen wir das kurz gemeinsam durch: Bei vier Prozent auf 300.000 Euro sind das 12.000 Euro pro Abschluss. Du brauchst also grob einen Abschluss alle zwei Monate. Traust du dir das zu?" },
      { value: "ueber_10000", label: "Mehr als 10.000 Euro", vertiefung: "Mehr als 10.000 Euro im Monat heißt grob ein Abschluss pro Monat. Das ist machbar, aber es ist Arbeit. Wie stellst du dir den Weg dahin vor?" },
      { value: "unklar", label: "Weiß ich noch nicht", vertiefung: "Du hast noch keine Zahl im Kopf. Lass uns von hinten anfangen: Was müsstest du im Monat verdienen, damit es sich für dich lohnt?" },
    ],
  },

  // ── Block 4: Erwartung und Einsatz ──
  //
  // Ersetzt die frühere Frage "Was hat dich an OS Immobilien gereizt?". Beide
  // Antworten zusammen zeigen die Erwartungshaltung, bevor jemand Zeit im
  // Telefonat verbrennt. Wer beim Einsatz nur "Motivation" schreibt, ist ein
  // anderer Fall als jemand, der drei feste Abende nennt.
  {
    key: "erwartung",
    nummer: 12,
    block: "erwartung",
    frage: "Was erwartest du von uns als Partner?",
    hinweis: "Zwei, drei Sätze genügen. Du kannst das auch überspringen, wir sprechen ohnehin darüber.",
    typ: "textarea",
    maxLaenge: 400,
    kurz: "Erwartung an uns",
    station: 6,
    freiwillig: true,
  },
  {
    key: "einsatz",
    nummer: 13,
    block: "erwartung",
    frage: "Und was bringst du dafür ein?",
    hinweis: "Auch hier genügen zwei, drei Sätze.",
    typ: "textarea",
    maxLaenge: 400,
    kurz: "Was er einbringt",
    station: 5,
    freiwillig: true,
  },

  // ── Block 5: Formales und Erreichbarkeit ──
  {
    key: "gewerbe34c",
    nummer: 14,
    block: "formales",
    frage: "Bei uns arbeitest du als freier Handelsvertreter. Dafür brauchst du ein Gewerbe und für die Vermittlung eine Erlaubnis nach Paragraf 34c. Wie sieht es bei dir aus?",
    hinweis: "Falls etwas fehlt, ist das kein Hindernis. Wir unterstützen dich beim Antrag.",
    typ: "auswahl",
    kurz: "Gewerbe und 34c",
    station: 7,
    zielFeld: "bereitschaft34c",
    optionen: [
      // Bewusst ohne die Möglichkeit "das will ich nicht". Das Skriptfeld kennt
      // den Wert "lehnt ab", der ein rotes Kriterium auslöst. Diese Option wäre
      // eine Einladung, sich selbst auszuschließen, bevor jemand erklärt hat,
      // worum es geht. Ablehnung ist eine Reaktion auf eine Erklärung.
      { value: "beides", label: "Gewerbe und 34c habe ich beides", vertiefung: "Du hast beides schon. Dann sind wir da in zehn Sekunden durch." },
      { value: "nur_gewerbe", label: "Gewerbe habe ich, 34c noch nicht", vertiefung: "Das Gewerbe hast du, die 34c fehlt noch. Die dauert ein paar Wochen und wir helfen dir beim Antrag. Ist das für dich ein Thema oder eher eine Formalie?" },
      { value: "keines", label: "Beides habe ich noch nicht", vertiefung: "Dir fehlt beides, das ist bei uns der Normalfall. Das Gewerbe machst du online in zwanzig Minuten, die 34c dauert ein paar Wochen und wir begleiten dich dabei. Ist das für dich ein Thema oder eher eine Formalie?" },
      { value: "im_gespraech", label: "Das möchte ich im Gespräch klären", vertiefung: "Du wolltest das Thema Gewerbe im Gespräch klären. Was genau möchtest du dazu wissen?" },
    ],
  },
  {
    key: "startzeitpunkt",
    nummer: 15,
    block: "formales",
    frage: "Ab wann könntest du starten?",
    typ: "auswahl",
    kurz: "Start",
    station: 10,
    optionen: [
      { value: "sofort", label: "Sofort" },
      { value: "vier_wochen", label: "In den nächsten vier Wochen" },
      { value: "zwei_drei_monate", label: "In zwei bis drei Monaten" },
      { value: "umschauen", label: "Ich schaue mich erst einmal um", vertiefung: "Du hast geschrieben, du schaust dich erst einmal um. Das ist völlig in Ordnung. Was müsste passieren, damit aus Umschauen ein Entschluss wird?" },
    ],
  },
  {
    key: "erreichbarkeit",
    nummer: 16,
    block: "formales",
    frage: "Wann erreichen wir dich am besten?",
    hinweis: "Mehrfachauswahl möglich.",
    typ: "mehrfach",
    kurz: "Erreichbar",
    station: 1,
    optionen: [
      { value: "vormittags", label: "Vormittags bis 12 Uhr" },
      { value: "mittags", label: "Mittags 12 bis 14 Uhr" },
      { value: "nachmittags", label: "Nachmittags 14 bis 18 Uhr" },
      { value: "abends", label: "Abends ab 18 Uhr" },
    ],
  },
];

/** Die Telefonnummer wird getrennt geführt, sie ist keine Katalogfrage. */
export const FORMULAR_TELEFON_LABEL = "Unter dieser Nummer, richtig?";

export type FormularAntworten = Record<string, string | string[]>;

/** Ist die Frage nach der aktuellen Auswahl überhaupt sichtbar? */
export function frageSichtbar(frage: FormularFrage, antworten: FormularAntworten): boolean {
  if (!frage.nurWenn) return true;
  const wert = antworten[frage.nurWenn.key];
  if (!Array.isArray(wert)) return false;
  const erwartet = Array.isArray(frage.nurWenn.enthaelt)
    ? frage.nurWenn.enthaelt
    : [frage.nurWenn.enthaelt];
  return erwartet.some((e) => wert.includes(e));
}

/** Alle Fragen, die dem Bewerber bei dieser Auswahl angezeigt werden. */
export function sichtbareFragen(antworten: FormularAntworten): FormularFrage[] {
  return FORMULAR_FRAGEN.filter((f) => frageSichtbar(f, antworten));
}

/** Wurde die Frage beantwortet? Leerer Text und leere Auswahl zählen nicht. */
export function frageBeantwortet(frage: FormularFrage, antworten: FormularAntworten): boolean {
  const wert = antworten[frage.key];
  if (Array.isArray(wert)) return wert.length > 0;
  return typeof wert === "string" && wert.trim() !== "";
}

/**
 * Die Antworten, wie sie an die Speicherfunktion gehen.
 *
 * Nur sichtbare und tatsächlich beantwortete Fragen, mit denselben Schlüsseln
 * und Typen wie im Katalog. Wer zuerst Immobilienerfahrung angibt, die
 * Zusatzfrage beantwortet und dann die Erfahrung wieder abwählt, schickt die
 * verwaiste Antwort nicht mit. Die Vorwissen-Karte und der Vorab-Score sehen
 * dadurch genau das, was der Bewerber zuletzt vor Augen hatte.
 */
export function antwortenZumSenden(antworten: FormularAntworten): FormularAntworten {
  const ergebnis: FormularAntworten = {};
  for (const frage of sichtbareFragen(antworten)) {
    if (!frageBeantwortet(frage, antworten)) continue;
    const wert = antworten[frage.key];
    ergebnis[frage.key] = Array.isArray(wert) ? [...wert] : wert.trim();
  }
  return ergebnis;
}

/**
 * Die angegebene Erreichbarkeit als Satzteil für die Danke-Seite, etwa
 * "nachmittags zwischen 14 und 18 Uhr". Leer, wenn nichts angegeben ist.
 */
export function wunschzeitText(antworten: FormularAntworten): string {
  const wert = antworten["erreichbarkeit"];
  if (!Array.isArray(wert)) return "";
  const texte: Record<string, string> = {
    vormittags: "vormittags bis 12 Uhr",
    mittags: "mittags zwischen 12 und 14 Uhr",
    nachmittags: "nachmittags zwischen 14 und 18 Uhr",
    abends: "abends ab 18 Uhr",
  };
  // In der Reihenfolge des Katalogs, nicht in der Reihenfolge des Antippens.
  const reihenfolge = getFrage("erreichbarkeit")?.optionen?.map((o) => o.value) ?? [];
  const teile = reihenfolge.filter((v) => wert.includes(v)).map((v) => texte[v]).filter(Boolean);
  if (teile.length <= 1) return teile[0] ?? "";
  return `${teile.slice(0, -1).join(", ")} oder ${teile[teile.length - 1]}`;
}

export function getFrage(key: string): FormularFrage | undefined {
  return FORMULAR_FRAGEN.find((f) => f.key === key);
}

/** Die lesbare Beschriftung eines Antwortwerts, etwa "10 bis 20 Stunden". */
/**
 * Werte, die nur der Kennenlernbogen ableitet, samt lesbarer Beschriftung.
 *
 * Sie stehen bewusst nicht in den Optionen der Frage: Dort würde jeder Eintrag
 * zu einer Kachel, und der alte Vorabbogen bekäme ein Ankreuzfeld, das niemand
 * bestellt hat. Ohne diese Liste stünde in der Vorwissen-Karte aber „immo_umfeld"
 * statt eines Satzes.
 */
const ABGELEITETE_LABELS: Record<string, string> = {
  immo_umfeld: "Kennt Immobilien, aber nicht aus dem Verkauf",
};

/**
 * Wie ein Hintergrundwert auf einen Pfad des Erstgesprächsskripts abbildet.
 *
 * Nur nötig, wo der Kennenlernbogen feiner unterscheidet als das Skript. Weg 4
 * bekommt seit dem 09.09.2026 einen eigenen Hintergrundwert, damit der
 * Vorab-Score ihn von Weg 1 trennen kann. Für das Gespräch bleibt es beim Pfad
 * „Immobilienerfahren": Die Fragen dort passen weiterhin, und ohne diese
 * Zuordnung bekäme Weg 4 gar keinen Pfad mehr vorgeschlagen.
 */
const HINTERGRUND_ZU_PFAD: Record<string, string> = {
  immo_umfeld: "immo",
};

export function optionLabel(frage: FormularFrage, value: string): string {
  return frage.optionen?.find((o) => o.value === value)?.label ?? ABGELEITETE_LABELS[value] ?? value;
}

/** Antwort einer Frage als lesbarer Text, Mehrfachauswahl mit Komma getrennt. */
export function antwortText(frage: FormularFrage, antworten: FormularAntworten): string {
  const wert = antworten[frage.key];
  if (wert == null) return "";
  if (Array.isArray(wert)) return wert.map((v) => optionLabel(frage, v)).join(", ");
  if (frage.typ === "auswahl") return optionLabel(frage, wert);
  return wert;
}

/** Die Vertiefungsfrage zur gegebenen Antwort, falls hinterlegt. */
export function vertiefungZu(frage: FormularFrage, antworten: FormularAntworten): string {
  const wert = antworten[frage.key];
  if (wert == null) return "";
  const werte = Array.isArray(wert) ? wert : [wert];
  for (const w of werte) {
    const v = frage.optionen?.find((o) => o.value === w)?.vertiefung;
    if (v) return v;
  }
  return "";
}

/**
 * Übersetzt eine Formularantwort in den Wert, den das Assessment-Feld erwartet.
 * Gibt `null`, wenn es keine tragfähige Entsprechung gibt. Dann zeigt der
 * Hinweisstreifen im Skript nur die Angabe und keinen Übernehmen-Knopf.
 */
export function alsAssessmentWert(
  frage: FormularFrage,
  antworten: FormularAntworten,
): unknown | null {
  const wert = antworten[frage.key];
  if (wert == null || (Array.isArray(wert) && wert.length === 0) || wert === "") return null;

  switch (frage.key) {
    case "beschaeftigung": {
      // "Etwas anderes" trägt keine Information, die ins Feld gehört.
      return wert === "sonstiges" ? null : optionLabel(frage, String(wert));
    }
    case "taetigkeit":
      return String(wert);
    case "hintergrund": {
      // "netzwerk" ist kein Pfad, sondern ein eigenes Feld. Es fällt hier raus.
      // "immo_umfeld" kennt nur der Kennenlernbogen, siehe HINTERGRUND_ZU_PFAD.
      const pfade = (wert as string[])
        .filter((v) => v !== "netzwerk")
        .map((v) => HINTERGRUND_ZU_PFAD[v] ?? v) as AssessmentPfad[];
      return pfade.length > 0 ? [...new Set(pfade)] : null;
    }
    case "immoSchwerpunkt":
      return wert === "sonstiges" ? null : String(wert);
    case "findiSparten": {
      // Die Erlaubnis ist keine Sparte, sie zahlt auf Punkt 7d ein.
      const sparten = (wert as string[]).filter((v) => v !== "erlaubnis");
      return sparten.length > 0 ? sparten : null;
    }
    case "zeitProWoche":
      return String(wert);
    case "einkommensziel": {
      // Das Skriptfeld ist ein Freitext. Die Spanne wird als Text übernommen,
      // die HR-Managerin schärft im Gespräch nach.
      return wert === "unklar" ? null : optionLabel(frage, String(wert));
    }
    case "gewerbe34c": {
      // "im_gespraech" ist bewusst ohne Entsprechung: Ein Auffangwert darf kein
      // hartes Kriterium setzen. "lehnt_ab" kann aus dem Formular nie entstehen.
      const karte: Record<string, string> = {
        beides: "vorhanden",
        nur_gewerbe: "wuerde_beantragen",
        keines: "wuerde_beantragen",
      };
      return karte[String(wert)] ?? null;
    }
    default:
      return null;
  }
}

/** Hat der Bewerber ein eigenes Netzwerk angegeben? Zahlt auf `immoNetzwerk`. */
export function hatNetzwerk(antworten: FormularAntworten): boolean {
  const wert = antworten["hintergrund"];
  return Array.isArray(wert) && wert.includes("netzwerk");
}

/**
 * Die vier bis fünf Kurzmarken für den ersten Blick auf die Vorwissen-Karte.
 * Bewusst knapp gehalten, sie sollen in eine Zeile passen.
 */
export function kurzmarken(antworten: FormularAntworten): string[] {
  const marken: string[] = [];
  const text = (key: string): string => {
    const wert = antworten[key];
    return typeof wert === "string" ? wert.trim() : "";
  };
  const kurzform = (key: string, karte: Record<string, string>) => {
    const wert = antworten[key];
    if (typeof wert !== "string") return;
    const eintrag = karte[wert];
    if (eintrag) marken.push(eintrag);
  };

  // Region zuerst: Sie entscheidet, wer den Bewerber uebernimmt.
  const region = text("region");
  if (region) marken.push(region);

  const beschaeftigung = getFrage("beschaeftigung");
  if (beschaeftigung && antworten["beschaeftigung"]) {
    const t = antwortText(beschaeftigung, antworten);
    if (t) marken.push(t);
  }

  const taetigkeit = text("taetigkeit");
  if (taetigkeit) marken.push(taetigkeit);

  kurzform("erfahrungsdauer", {
    unter_1: "unter 1 Jahr dabei",
    "1_bis_3": "1 bis 3 Jahre dabei",
    "3_bis_10": "3 bis 10 Jahre dabei",
    ueber_10: "über 10 Jahre dabei",
  });

  kurzform("zeitProWoche", {
    unter_10: "unter 10 Std",
    "10_bis_20": "10 bis 20 Std",
    vollzeit: "Vollzeit",
  });

  kurzform("perspektive", {
    dauerhaft_neben: "dauerhaft nebenberuflich",
    spaeter_haupt: "später hauptberuflich",
    sofort_haupt: "sofort hauptberuflich",
    unklar: "Perspektive offen",
  });

  kurzform("leadPraeferenz", {
    leads: "will Leads",
    eigen: "eigenes Netzwerk",
    beides: "Leads und eigenes Netzwerk",
    unklar: "Akquise offen",
  });

  kurzform("startzeitpunkt", {
    sofort: "Start sofort",
    vier_wochen: "Start in 4 Wochen",
    zwei_drei_monate: "Start in 2 bis 3 Monaten",
    umschauen: "schaut sich um",
  });

  kurzform("gewerbe34c", {
    beides: "Gewerbe und 34c da",
    nur_gewerbe: "Gewerbe ja, 34c nein",
    keines: "Gewerbe und 34c offen",
    im_gespraech: "34c im Gespräch klären",
  });

  return marken.filter(Boolean);
}

/**
 * Die Formularfrage, die auf ein bestimmtes Assessment-Feld einzahlt.
 * Damit hängt sich der Hinweisstreifen im Skript von selbst an die richtige
 * Stelle, ohne dass jeder Punkt einzeln verdrahtet werden muss.
 */
export function frageFuerFeld(feldKey: string): FormularFrage | undefined {
  return FORMULAR_FRAGEN.find((f) => f.zielFeld === feldKey);
}

/** Alle Fragen, die auf eine bestimmte Station des Skripts einzahlen. */
export function fragenZuStation(station: number): FormularFrage[] {
  return FORMULAR_FRAGEN.filter((f) => f.station === station);
}

/**
 * Die Fragen einer Station, die an keinem einzelnen Skriptfeld hängen.
 *
 * Fragen mit `zielFeld` erscheinen bereits als Streifen direkt über der
 * Eingabe, in die sie übernommen werden können. Alle anderen hätten sonst gar
 * keinen Ort im Gespräch: Region, Erfahrungsdauer, Perspektive, Leadwunsch und
 * die beiden Freitexte zu Erwartung und Einsatz. Sie stehen deshalb als Block
 * unter der Überschrift der Station, zu der sie gehören.
 */
export function fragenOhneFeldZuStation(station: number): FormularFrage[] {
  return FORMULAR_FRAGEN.filter((f) => f.station === station && !f.zielFeld);
}

/** Liegt überhaupt eine Antwort vor? */
export function hatAntworten(antworten: FormularAntworten | null | undefined): boolean {
  if (!antworten) return false;
  return Object.values(antworten).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "",
  );
}
