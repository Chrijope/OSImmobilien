/**
 * Alle Texte und Zahlen der öffentlichen Seite „Partner werden“ (/partner-werden).
 *
 * ZAHLEN PRÜFEN: Jede Kennzahl, die wir heute nicht belegen können, steht hier
 * als Platzhalter im Format „[ZAHL PRÜFEN: Vorschlag]“. Die Seite hebt jeden
 * Platzhalter gelb hervor (`MitPlatzhaltern`), damit keiner unbemerkt live
 * geht. Ersetzen heißt: den ganzen Ausdruck in eckigen Klammern durch den
 * echten Wert tauschen, etwa „[ZAHL PRÜFEN: 14]“ durch „10“. Der Test
 * `partnerWerden.test.ts` listet die offenen Platzhalter.
 *
 * Belegt und deshalb ohne Platzhalter:
 *   - „20+ Partner“ (Angabe von Christian, 30.09.2026),
 *   - „über 10 Jahre Immobilienerfahrung“ und „rund 20 Spezialisten“, wörtlich
 *     von osimmobilien.netlify.app (`lib/handbuch/firma.ts`),
 *   - die Kundenstimmen, wörtlich von osimmobilien.netlify.app.
 *
 * Aufbau nach der Seite eines Wettbewerbers, nur Reihenfolge und Zweck der
 * Abschnitte. Texte eigen, Zahlen des Wettbewerbers nicht übernommen.
 *
 * Standorte: München, Nürnberg, Augsburg, Hof und Leipzig (Christian,
 * 30.09.2026; Fürth und Magdeburg bleiben weg). Die Zahl der Objekte je
 * Standort kommt live aus der Edge Function `partner-standorte`, gezählt
 * nach `_shared/partner-standorte.ts`. „91 Objekte im Angebot“ ist Christians
 * feste Vorgabe vom 30.09.2026.
 *
 * Rechtsbefunde vom 30.09.2026: drei Wege (R1), keine Provisionsangabe auf
 * der Seite (B), Auszahlungsfrist nur beim Tippgeber (R3), dazu G1 bis G7:
 * keine Beratungszusage außer beim Tippgeber, „wir begleiten die
 * Finanzierungsanfrage“ statt „wir finanzieren“, „Angebot“ statt „Bestand“,
 * geschlechtsneutrale Zielgruppen.
 *
 * Wortwahl: Du-Form, keine Begriffe mit Statusrisiko (Weisung, Anstellung,
 * Arbeitszeit und Ähnliches), keine Einkommens- oder Renditeversprechen.
 */
import { FIRMEN_KENNZAHLEN, KUNDENSTIMMEN } from "@/lib/handbuch/firma";

/** Das Muster eines Platzhalters. Die Seite markiert jeden Treffer gelb. */
export const PLATZHALTER_MUSTER = /\[(?:ZAHL PRÜFEN|BILD FEHLT):[^\]]*\]/g;

/** Die Zahlen an einer Stelle. */
export const ZAHLEN = {
  beurkundungenProJahr: "[ZAHL PRÜFEN: 100+]",
  amMarktSeit: "[ZAHL PRÜFEN: 2015]",
  bundeslaender: "[ZAHL PRÜFEN: 8]",
  partner: "20+",
  tageBisAuszahlung: "[ZAHL PRÜFEN: 14]",
  objekteGesamt: "91",
};

/** Der Satz zur Vergütung bei Vertriebspartner und Portfolio-Partner (R3). */
export const VERGUETUNG_FAELLIG =
  "Deine Vergütung wird fällig, wenn der Kauf beurkundet ist und die Provision des Verkäufers bei uns eingegangen ist. Wie und wann wir auszahlen, steht in deiner schriftlichen Vereinbarung.";

export const HERO = {
  augenbraue: "OS Immobilien · Partnerprogramm",
  h1a: "OS Immobilien, dein starker Partner",
  h1b: "für Kapitalanlage-Immobilien",
  lead:
    "Schwerpunkt Bayern, ausgewählte Objekte und ein Team, das dich begleitet. Ob du nur Kontakte weitergibst, deine Kunden selbst betreust oder mit deinem Vertrieb arbeitest: Du wählst den Weg, der zu dir passt.",
  karten: [
    {
      weg: "tippgeber" as const,
      wer: "Für alle aus Finanzberatung, Versicherung und Vertrieb",
      titel: "Tippgeber werden",
      text: "Du gibst Kontakte weiter. Beratung und Abwicklung übernehmen wir, deine Vergütung vereinbaren wir einzeln.",
    },
    {
      weg: "vertriebspartner" as const,
      wer: "Für alle aus Finanzberatung, Versicherung und Vertrieb",
      titel: "Vertriebspartner werden",
      text: "Du begleitest deine Kunden selbst, als selbstständiger Handelsvertreter. Voraussetzung ist eine Erlaubnis nach §\u00a034c GewO, sofern deine Tätigkeit sie erfordert.",
    },
    {
      weg: "portfolio" as const,
      wer: "Für Immobilienvertriebe mit eigenem Team",
      titel: "Portfolio-Partner werden",
      text: "Zugang zu unserem Objektangebot und unseren Werkzeugen für dein Team.",
    },
  ],
  haken: [
    { t: "Echtes Angebot", x: "Ausgewählte Objekte, laufend aktualisiert." },
    { t: "Wir begleiten", x: "Reservierung und Notartermin, die Finanzierungsanfrage mit unseren Finanzierungspartnern." },
    { t: "Klare Vereinbarung", x: "Alles Wichtige steht schriftlich fest, bevor du startest." },
    { t: "Fester Ansprechpartner", x: "Ein Mensch, den du erreichst, statt einer Hotline." },
  ],
  bildAlt: "Wohnhaus aus unserem Angebot",
  kennzahlen: [
    { wert: ZAHLEN.partner, text: "Partner im Netzwerk" },
    { wert: FIRMEN_KENNZAHLEN[0]?.wert ?? "über 10 Jahre", text: FIRMEN_KENNZAHLEN[0]?.text ?? "Immobilienerfahrung" },
  ],
};

/**
 * Unsere Standorte. `x` und `y` sind Punkte in der Deutschlandkarte von
 * osimmobilien.netlify.app (`assets/deutschlandLaender.ts`, viewBox 591.5 × 800.5), dort
 * übernommen für München, Nürnberg, Augsburg und Leipzig. Hof ist aus
 * Länge und Breite gerechnet (11,92° O, 50,31° N) mit derselben Umrechnung,
 * die die vier übernommenen Punkte ergeben: x = 270 + 60,9 · (Länge − 10),
 * y = 163 + 98,7 · (53,55 − Breite). `seite` sagt, wo das Namensschild steht.
 */
export const STANDORTE = [
  {
    name: "München",
    slug: "muenchen",
    bayern: true,
    x: 366,
    y: 697,
    seite: "unten" as const,
    text: "Landeshauptstadt mit hoher Nachfrage nach Wohnraum und knappem Angebot, vor allem bei kleinen Wohnungen und WG-Konzepten.",
  },
  {
    name: "Nürnberg",
    slug: "nuernberg",
    bayern: true,
    x: 336,
    y: 568,
    seite: "links" as const,
    text: "Zweitgrößte Stadt Bayerns, geprägt von Hochschulen, Industrie und einem stabilen Mietmarkt.",
  },
  {
    name: "Augsburg",
    slug: "augsburg",
    bayern: true,
    x: 325,
    y: 674,
    seite: "links" as const,
    text: "Drittgrößte Stadt Bayerns, mit Industrie, Hochschule und guter Anbindung an München.",
  },
  {
    name: "Hof",
    slug: "hof",
    bayern: true,
    x: 387,
    y: 483,
    seite: "rechts" as const,
    text: "Oberfränkische Stadt an der Grenze zu Sachsen und Thüringen, mit niedrigen Einstiegspreisen und oft ganzen Häusern mit mehreren Einheiten.",
  },
  {
    name: "Leipzig",
    slug: "leipzig",
    bayern: false,
    x: 415,
    y: 381,
    seite: "rechts" as const,
    text: "Eine der am stärksten gewachsenen Großstädte Deutschlands, mit viel Altbau aus der Gründerzeit.",
  },
];

export const STANDORTE_TEXTE = {
  augenbraue: "Wo wir tätig sind",
  h2: "Echtes Angebot statt Versprechen",
  lead: "Unsere Objekte stehen in Städten, die wir kennen. Hier ein Ausschnitt aus dem aktuellen Angebot.",
  weitere: "und weitere",
  weitereText: "Dazu Objekte unter anderem in Würzburg, Coburg, Berlin und Brandenburg.",
  tipp: "Tipp: Wähle einen Standort auf der Karte, um mehr über ihn zu lesen.",
  /** Hinter der Zahl, die live aus dem CRM kommt. */
  objekteEins: "Objekt im Angebot",
  objekteViele: "Objekte im Angebot",
};

export const ZAHLEN_TEXTE = {
  augenbraue: "Zahlen, die für sich sprechen",
  h2: "Ein etablierter Partner, kein Nebenprojekt",
  kacheln: [
    { wert: ZAHLEN.beurkundungenProJahr, text: "Beurkundungen pro Jahr" },
    { wert: ZAHLEN.amMarktSeit, text: "am Markt seit" },
    { wert: ZAHLEN.bundeslaender, text: "Bundesländer mit Objekten" },
    { wert: ZAHLEN.partner, text: "Partner im Netzwerk" },
    { wert: ZAHLEN.tageBisAuszahlung, text: "Tage bis zur Auszahlung für Tippgeber" },
  ],
  cta: "Jetzt unverbindlich eintragen",
};

export const KONZEPT = {
  augenbraue: "Das Konzept",
  h2: "Wie sich eine Kapitalanlage-Immobilie rechnen kann",
  lead: "Drei Bausteine, die deine Kunden im Gespräch verstehen wollen. Wie sie im Einzelfall zusammenspielen, rechnen wir für jeden Kunden einzeln.",
  karten: [
    {
      t: "Miete trägt einen großen Teil",
      x: "Mieteinnahmen decken bei unseren Objekten oft einen großen Teil der Rate. Wie groß der eigene Anteil bleibt, zeigt die Rechnung für den einzelnen Kunden.",
    },
    {
      t: "Finanzierung bei guter Bonität auch ohne Eigenkapital",
      x: "Manche Banken finanzieren bei guter Bonität den Kaufpreis und einen Teil der Nebenkosten. Das entscheidet die Bank nach Prüfung der Unterlagen. Eine Finanzierung ohne Eigenkapital erhöht Rate und Risiko.",
    },
    {
      t: "Steuerliche Wirkung",
      x: "Abschreibung und Werbungskosten mindern das zu versteuernde Einkommen. Wie stark, hängt vom persönlichen Steuersatz ab.",
    },
  ],
  hinweis:
    "Keine Steuer- oder Anlageberatung. Eine Finanzierung setzt eine Bonitätsprüfung durch die Bank voraus; wir geben keine Finanzierungszusage. Für steuerliche Fragen ist ein Steuerberater zuständig.",
};

export const UEBER_UNS = {
  augenbraue: "Über uns",
  h2: "Das Bindeglied zwischen Bauträger und Anleger",
  absaetze: [
    "OS Immobilien bringt Objekte von Bauträgern und Eigentümern mit Menschen zusammen, die Vermögen aufbauen wollen. Wir wählen die Objekte aus, rechnen sie für den einzelnen Kunden durch und begleiten den Kauf bis nach dem Notartermin.",
    "Für Partner heißt das: Als Tippgeber musst du kein Immobilienprofi sein, du gibst nur den Kontakt weiter. Als Vertriebspartner oder Vertrieb bekommst du Objekte, Unterlagen und Werkzeuge für deine eigenen Gespräche.",
  ],
  kennzahlen: [
    ...FIRMEN_KENNZAHLEN,
    { wert: ZAHLEN.objekteGesamt, text: "Objekte im Angebot" },
  ],
  punkte: [
    "Ausgewählte Objekte aus mehreren Regionen, laufend aktualisiert",
    "Reservierung und Notartermin, die Finanzierungsanfrage begleiten wir mit unseren Finanzierungspartnern",
    "Ein CRM mit Rechnern, Exposés und Präsentationen für deine Gespräche",
  ],
  teamfoto: "[BILD FEHLT: Teamfoto]",
};

/**
 * Stimmen unserer Kunden, also von Käufern, nicht von Partnern. Wörtlich von
 * osimmobilien.netlify.app (`OS Immobilien-Website/src/components/TestimonialsSection.tsx`,
 * gelesen am 30.09.2026), mit Namenskürzel und Ort wie dort. Ausgewählt sind
 * Stimmen ohne Steuer- oder Tempoversprechen, wie auf der Handbuch-Seite.
 */
export const STIMMEN = [
  ...KUNDENSTIMMEN,
  {
    name: "Markus H.",
    ort: "Ingolstadt",
    text: "Als Unternehmer war mir klar: Immobilien gehören ins Portfolio. Aber die Umsetzung allein? Keine Chance. Christian und sein Team haben mir den kompletten Prozess abgenommen, von der Objektauswahl bis zum Notar. Ich war beeindruckt, wie reibungslos alles lief.",
  },
  {
    name: "Michael G.",
    ort: "Landshut",
    // Gekürzt (Rechtsbefund G5): Der Satz über „Verkäufer“ und „Berater“ ist entfallen.
    text: "Die Transparenz, die Struktur, die Nachbetreuung: alles auf höchstem Niveau. Ich plane bereits mein zweites Objekt mit dem Team.",
  },
];

export const STIMMEN_TEXTE = {
  augenbraue: "Unsere Kunden",
  h2: "Das sagen unsere Kunden",
  lead: "Wem du uns empfiehlst, der soll gut aufgehoben sein. So erleben Käufer die Zusammenarbeit mit uns.",
  fuss: "Stimmen von Kunden, die über OS Immobilien eine Immobilie gekauft haben, von osimmobilien.netlify.app, teils gekürzt. Es sind keine Stimmen von Partnern.",
};

export const ABLAUF = {
  augenbraue: "So einfach ist die Zusammenarbeit",
  h2: "In vier Schritten zum Partner",
  umschalter: { tippgeber: "Für Tippgeber", vertriebspartner: "Für Vertriebspartner", portfolio: "Für Vertriebe" },
  tippgeber: [
    { t: "Trag dich ein", x: "Name, Kontakt und dein Bereich. Das dauert rund eine Minute." },
    { t: "Wir lernen uns kennen", x: "In einem unverbindlichen Gespräch erklären wir dir, wie ein Tipp abläuft und was du dabei tust." },
    {
      t: "Du gibst den Tipp",
      x: "Bemerkst du Interesse, fragst du deinen Kunden, ob wir uns melden dürfen. Mit seinem Einverständnis gibst du uns den Kontakt. Beratung und Abwicklung übernehmen wir, die Finanzierungsanfrage begleiten wir mit unseren Finanzierungspartnern.",
    },
    {
      t: "Auszahlung",
      x: `Nach Beurkundung und Zahlungseingang erhältst du deine Vergütung, in der Regel innerhalb von ${ZAHLEN.tageBisAuszahlung} Tagen. Die Einzelheiten stehen in deiner Vereinbarung.`,
    },
  ],
  vertriebspartner: [
    { t: "Trag dich ein", x: "Name, Kontakt und ein paar Angaben zu deiner Erfahrung. Das dauert rund eine Minute." },
    {
      t: "Kennenlernen und Vereinbarung",
      x: "Wir sprechen über deine Erlaubnis, deine Kunden und die Zusammenarbeit als selbstständiger Handelsvertreter. Alles Wichtige steht danach schriftlich fest.",
    },
    {
      t: "Du begleitest deine Kunden",
      x: "Du stellst deinen Kunden passende Objekte vor, mit Exposés, Rechnern und Präsentationen aus unserem CRM. Die Finanzierungsanfrage begleiten wir mit unseren Finanzierungspartnern.",
    },
    { t: "Abwicklung und Vergütung", x: `Wir begleiten Reservierung und Notartermin. ${VERGUETUNG_FAELLIG}` },
  ],
  portfolio: [
    { t: "Trag euch ein", x: "Name, Kontakt und ein paar Angaben zu eurem Vertrieb. Das dauert rund eine Minute." },
    { t: "Kennenlernen und Portfolio-Zugang", x: "Wir stellen unser Angebot vor und richten euch den Zugang zu Objekten und Unterlagen ein." },
    { t: "Objekte deinen Kunden vorstellen", x: "Mit Exposés, Rechnern und Präsentationen aus unserem CRM, auf Wunsch mit unserer Unterstützung im Gespräch." },
    { t: "Abwicklung und Vergütung", x: `Wir begleiten Reservierung und Notartermin. ${VERGUETUNG_FAELLIG}` },
  ],
};

export const FAQ = {
  augenbraue: "Häufige Fragen",
  h2: "Was Partner vorher wissen wollen",
  text: "Deine Frage ist nicht dabei? Trag dich ein, wir rufen dich an.",
  fragen: [
    {
      f: "Was unterscheidet Tippgeber und Vertriebspartner?",
      a: "Als Tippgeber gibst du nur Kontakte weiter. Beratung und Abwicklung übernehmen wir, deine Vergütung vereinbaren wir einzeln. Als Vertriebspartner begleitest du deine Kunden selbst, als selbstständiger Handelsvertreter. Dafür brauchst du eine Erlaubnis nach §\u00a034c GewO, sofern deine Tätigkeit sie erfordert.",
    },
    {
      f: "Wann wird meine Vergütung fällig?",
      a: `Als Tippgeber erhältst du deine Vergütung nach Beurkundung und Zahlungseingang, in der Regel innerhalb von ${ZAHLEN.tageBisAuszahlung} Tagen. Als Vertriebspartner oder Portfolio-Partner gilt: ${VERGUETUNG_FAELLIG}`,
    },
    {
      f: "Muss ich Immobilien-Fachwissen mitbringen? (Tippgeber)",
      a: "Nein. Als Tippgeber stellst du mit dem Einverständnis deines Kunden den Kontakt her. Beratung und Abwicklung übernimmt unser Team. Für die reine Weitergabe eines Kontakts ist in der Regel keine Erlaubnis nötig. Wo die Grenze liegt, erklären wir dir im Gespräch.",
    },
    {
      f: "Wie viele Objekte stehen zur Verfügung? (Vertriebe)",
      a: `Aktuell sind es ${ZAHLEN.objekteGesamt} Objekte in ${ZAHLEN.bundeslaender} Bundesländern, von einzelnen Wohnungen bis zu ganzen Häusern. Das Angebot ändert sich laufend; im Kennenlernen zeigen wir dir den aktuellen Stand.`,
    },
    {
      f: "In welchen Regionen seid ihr aktiv?",
      a: "Unser Schwerpunkt liegt in Bayern, vor allem in München, Nürnberg, Augsburg und Hof. Dazu kommen Objekte unter anderem in Leipzig, Würzburg und Berlin. Deine Kunden müssen nicht in der Nähe der Objekte wohnen.",
    },
    {
      f: "Wie funktioniert die Finanzierung ohne Eigenkapital?",
      a: "Bei guter Bonität finanzieren manche Banken den Kaufpreis und einen Teil der Nebenkosten. Ob und zu welchen Bedingungen, entscheidet allein die Bank nach Prüfung der Unterlagen. Eine Finanzierung ohne Eigenkapital erhöht Rate und Risiko. Wir begleiten die Anfrage mit unseren Finanzierungspartnern, eine Zusage können wir nicht geben.",
    },
    {
      f: "Wie lange gibt es OS Immobilien schon?",
      a: `Hinter OS Immobilien stehen über 10 Jahre Immobilienerfahrung und ein Team von rund 20 Spezialisten. Am Markt sind wir seit ${ZAHLEN.amMarktSeit}.`,
    },
  ],
};

export const ABSCHLUSS = {
  augenbraue: "Partnerprogramm",
  h2: "Jetzt Partner werden",
  unter: "Name, Kontakt, Rolle, in 60 Sekunden",
  knopf: "Jetzt Partner werden",
};

export const SEITE = {
  titel: "Partner werden bei OS Immobilien",
  beschreibung: "Als Tippgeber, Vertriebspartner oder Portfolio-Partner mit OS Immobilien zusammenarbeiten: ausgewählte Objekte, Schwerpunkt Bayern, ein fester Ansprechpartner.",
  kopfKnopf: "Partner werden",
};

/** Alle offenen Platzhalter, für den Test und für den Bericht. */
export function offenePlatzhalter(): string[] {
  const alles = JSON.stringify({ ZAHLEN, HERO, STANDORTE, ZAHLEN_TEXTE, KONZEPT, UEBER_UNS, ABLAUF, FAQ });
  return [...new Set(alles.match(PLATZHALTER_MUSTER) ?? [])];
}
