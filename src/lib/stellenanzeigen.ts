/**
 * Die öffentliche Stellenanzeige: die beiden offenen Partnerschaften samt
 * Wortlaut.
 *
 * Warum fest im Code und nicht aus der Stellenverwaltung
 * (`getStellen()` in `bewerbungStore.ts`): Diese Verwaltung speichert nur im
 * Browser dessen, der sie pflegt (`localStorage`, Schlüssel `mi_stellen`). Ein
 * Bewerber sieht davon nichts, er bekäme immer die Voreinstellung aus dem
 * Code. Eine Anzeige, die HR dort ändert, käme also nie bei einem Besucher an.
 * Solange die Stellen keine eigene Tabelle haben, ist diese Datei die einzige
 * Stelle, an der ein geänderter Text wirklich öffentlich wird.
 *
 * Die Texte sind an drei Hausregeln gebunden, und `stellenanzeigen.test.ts`
 * hält sie fest:
 *
 *   1  Beide Wege sind selbstständig. Keine Sprache aus dem Arbeitsvertrag,
 *      also nichts, was nach Anstellung klingt (Statusrisiko, siehe
 *      `.claude/agents/hr-management.md`).
 *   2  Keine Verdienstversprechen, keine Zahlen zur Provision, keine Garantien
 *      (UWG; `vertragKlauseln.ts` § 6 Absatz 3). Die Provision nennt die
 *      Landingpage aus demselben Grund nicht.
 *   3  Der Tippgeber stellt nur den Kontakt her. Er berät nicht, stellt keine
 *      Objekte vor und nennt keine Preise (`vertragKlauseln.ts` § 1 Absatz 3a,
 *      `tippgeberVertragPdf.ts` § 2 Absatz 3).
 *
 * Jede Leistung unter „Was wir dir bieten" ist belegt, die Quelle steht als
 * Kommentar daneben.
 */

export type StellenWeg = "vertriebspartner" | "tippgeber" | "finanzdienstleister";

/**
 * Ein Vorteil im Kasten „Ein zweites Produkt neben der Immobilie", nur bei der
 * Stelle für Finanzdienstleister.
 */
export type ProduktPunkt = { titel: string; text: string };

/**
 * Der Kasten zum zweiten Produkt. Das Produkt bleibt namenlos, im Code wie auf
 * der Seite: Name, Konditionen und die Frage der Erlaubnis gehören in das
 * Gespräch mit der Geschäftsleitung (`bewerberVideocall.ts`,
 * `ZWEITES_PRODUKT_SCHLUSSSATZ`), nicht in eine öffentliche Anzeige.
 */
export type ZweitesProdukt = {
  titel: string;
  einleitung: string;
  punkte: ProduktPunkt[];
  /** Die Renditezeile samt Risikohinweis. `null` blendet beides aus. */
  rendite: { punkt: ProduktPunkt; risikohinweis: string } | null;
  fuss: string;
};

export type StellenMerkmal = {
  /** Kurzer Name des Merkmals, für Bildschirmleser und Tooltip. */
  art: "standort" | "zeit" | "bereich" | "start";
  label: string;
  wert: string;
};

export type Stellenanzeige = {
  /** Adresszusatz, etwa `#tippgeber`, öffnet die Karte direkt. */
  slug: string;
  /** Geht als `stelleId` an `submit-bewerbung`, höchstens 80 Zeichen. */
  stelleId: string;
  /** Geht als `stelleTitel` an `submit-bewerbung`. HR filtert im Bewerberprozess danach. */
  titel: string;
  /** Welcher Formularweg: bestimmt Beschriftungen und die Überleitung. */
  weg: StellenWeg;
  /** Geht als `beschaeftigungsart` an `submit-bewerbung`. */
  taetigkeit: string;
  /** Die kleine Zeile über dem Titel auf der Kachel. */
  marke: string;
  /** Zwei Sätze auf der geschlossenen Kachel. */
  kurz: string;
  merkmale: StellenMerkmal[];
  werWirSind: string;
  deineRolle: string;
  aufgaben: string[];
  mitbringen: string[];
  bieten: string[];
  /** Platzhalter im Feld „Erfahrung" des Formulars. */
  erfahrungPlatzhalter: string;
  /** Nur bei der Stelle für Finanzdienstleister. */
  zweitesProdukt?: ZweitesProdukt;
};

/**
 * Die Renditezeile der Stelle für Finanzdienstleister.
 *
 * **Offen zur rechtlichen Prüfung.** Christian will die Aussage „Rendite im
 * zweistelligen Bereich pro Jahr" in der Anzeige. Im Haus gibt es dafür keine
 * Quelle (gesucht am 24.09.2026), und die Akademie warnt selbst vor
 * zweistelligen Renditezahlen (`vertriebsakademieContent.ts`). Deshalb so
 * vorsichtig wie möglich, ohne Zahl, mit Risikohinweis direkt darunter.
 *
 * Entfernen: die Zeile `rendite: FINANZPROFI_RENDITE,` unten auf `null`
 * setzen. Umformulieren: nur hier.
 */
export const FINANZPROFI_RENDITE: NonNullable<ZweitesProdukt["rendite"]> = {
  punkt: {
    titel: "Renditechancen für deine Kunden",
    text: "Mit Renditechancen im zweistelligen Bereich pro Jahr.",
  },
  risikohinweis:
    "Renditen sind nicht garantiert. Wertentwicklungen der Vergangenheit sind kein verlässlicher " +
    "Indikator für die Zukunft. Einzelheiten nur im persönlichen Gespräch.",
};

/** Die vier Merkmale sind bei beiden Stellen gleich (Christian, 24.09.2026). */
const MERKMALE: StellenMerkmal[] = [
  { art: "standort", label: "Standort", wert: "Remote" },
  /*
   * Christians Vorgabe hieß „Arbeitszeit". Das Wort ist Sprache aus dem
   * Arbeitsvertrag, deshalb heißt das Merkmal hier „Zeiteinteilung".
   * Ebenso „Bereich" statt „Abteilung": In eine Abteilung wird man
   * eingegliedert, ein Selbstständiger nicht.
   */
  { art: "zeit", label: "Zeiteinteilung", wert: "Freie Zeiteinteilung" },
  { art: "bereich", label: "Bereich", wert: "Vertrieb" },
  { art: "start", label: "Start", wert: "Ab sofort" },
];

export const STELLENANZEIGEN: Stellenanzeige[] = [
  {
    slug: "immobilienberater",
    stelleId: "stellenanzeige-immobilienberater",
    titel: "Selbstständiger Immobilienberater für Kapitalanlagen (m/w/d)",
    weg: "vertriebspartner",
    taetigkeit: "Selbstständig, Handelsvertreter",
    marke: "Beraten",
    kurz:
      "Du berätst Kapitalanleger zu geprüften Immobilien, mit eigenem Gewerbe und in deinem eigenen Rhythmus. " +
      "Objekte, CRM, Finanzierung und Abwicklung kommen von uns.",
    merkmale: MERKMALE,
    // Objektarten: vertragKlauseln.ts § 1 Absatz 1.
    werWirSind:
      "OS Immobilien vermittelt Kapitalanlageimmobilien: sanierte Bestandswohnungen, WG- und Co-Living-Konzepte " +
      "und energieeffiziente Neubauprojekte. Unsere Kunden wollen mit Immobilien langfristig Vermögen aufbauen. " +
      "Wir rechnen ihnen ehrlich vor, was eine Wohnung kostet und was sie leisten kann, erklären so lange, bis sie " +
      "ihre Entscheidung selbst begründen können, und bleiben auch nach dem Notartermin ansprechbar.",
    // Status: vertragKlauseln.ts § 1 Absatz 2, Vergütung § 2 Absatz 2.
    deineRolle:
      "Du bist selbstständiger Handelsvertreter nach §§ 84 ff. HGB, mit eigenem Gewerbe und in eigener " +
      "Verantwortung. Du gewinnst deine Kunden, berätst sie zu den Immobilien aus unserem Angebot und begleitest " +
      "sie bis zu ihrer Kaufentscheidung. Wann und von wo aus du arbeitest, entscheidest du selbst. Vergütet wirst " +
      "du ausschließlich erfolgsabhängig, über Provisionen auf die Käufe, die du vermittelst.",
    aufgaben: [
      "Du gewinnst Kunden aus deinem eigenen Netzwerk und über deine eigene Akquise.",
      "Du führst Erst- und Beratungsgespräche, am Telefon, per Video oder persönlich.",
      "Du stellst passende Objekte aus unserem geprüften Angebot vor und rechnest sie mit unseren Rechnern für deinen Kunden durch.",
      "Du hältst Kontakte und Gespräche in unserem CRM fest, damit nichts verloren geht.",
      // Finanzierung: vertragKlauseln.ts § 1 Absatz 3b.
      "Du begleitest deine Kunden bis zur Kaufentscheidung. Finanzierung und Abwicklung laufen über unsere Fachleute.",
    ],
    mitbringen: [
      "Freude am Gespräch mit Menschen und den Anspruch, ehrlich zu beraten.",
      "Unternehmerisches Denken: Du willst dein eigenes Geschäft aufbauen und dir deine Zeit selbst einteilen.",
      "Erfahrung im Vertrieb, in der Finanz- oder in der Immobilienbranche hilft dir. Als Quereinsteiger bist du ebenso willkommen.",
      /*
       * § 34c GewO: Die Unterstützung beim Antrag ist belegt in
       * `startfahrplanErweitertPdf.ts` („wir unterstützen dich beim Antrag"),
       * im FAQ der Landingpage und auf der Bewerberseite. Der letzte Satz folgt
       * `vertragKlauseln.ts` § 1 Absatz 3a: Ohne eigene Erlaubnis ist nur die
       * Tippgebertätigkeit erlaubt.
       */
      "Ein eigenes Gewerbe und die Erlaubnis nach § 34c GewO, die du für Beratung und Vermittlung brauchst. " +
        "Fehlt dir davon noch etwas, unterstützen wir dich beim Antrag. Bis die Erlaubnis vorliegt, berätst du nicht selbst.",
      "Ausdauer: Eine Immobilie kauft niemand an einem Abend. Zwischen dem ersten Gespräch und der Provision können Monate liegen.",
    ],
    bieten: [
      // vertragKlauseln.ts § 3 Absatz 1: Objektzugänge mit Exposés, Kalkulationen, Vertriebsunterlagen.
      "Zugang zu geprüften Kapitalanlageimmobilien mit Exposés, Kalkulationen und Vertriebsunterlagen.",
      // vertragKlauseln.ts § 3 Absatz 1: CRM unentgeltlich (§ 86a HGB).
      "Unser CRM mit Pipeline, Rechnern und Präsentationen, ohne Entgelt.",
      // vertragKonditionen.ts GESTELLTE_ZUSATZLEISTUNGEN: Training, Coaching und Vertriebsbegleitung.
      "Academy, Verkaufstraining und persönliche Begleitung beim Start.",
      // Landingpage: „Backoffice, Finanzierung und Abwicklung laufen weiter"; vertragKlauseln.ts § 1 Absatz 3b.
      "Finanzierung und Abwicklung über unsere Fachleute, damit du dich auf das Gespräch konzentrieren kannst.",
      // lizenzPakete.ts, Paket „lead_berater": nach Verfügbarkeit, ohne Stückzahl, ohne Anspruch.
      "Auf Wunsch Interessenten aus unserem Marketing, nach Verfügbarkeit und ohne feste Menge.",
      // vertragKonditionen.ts GESTELLTE_ZUSATZLEISTUNGEN: Landingpage und Marketingbaukasten.
      "Eine persönliche Landingpage und einen Marketingbaukasten für deine eigene Akquise.",
      // lizenzPakete.ts: „Einheitlich … auf Lead- und Eigenkontakte". Bewusst ohne Satz.
      "Eine erfolgsabhängige Provision, gleich hoch für deine eigenen Kunden und für Interessenten von uns. Die Konditionen besprechen wir persönlich mit dir.",
      // bewerber-startfahrplan-mail.ts STARTFAHRPLAN_KOSTEN; vertragKlauseln.ts § 2 Absatz 2.
      "Kein Einstiegsbetrag, kein laufendes Entgelt, keine Mindestlaufzeit.",
      // vertragKonditionen.ts GESTELLTE_ZUSATZLEISTUNGEN: „ohne Teilnahmepflicht".
      "Eine Partner-Community mit Austausch und Veranstaltungen, ohne Teilnahmepflicht.",
    ],
    erfahrungPlatzhalter: "z. B. 3 Jahre Vertrieb, Quereinsteiger aus der Gastronomie ...",
  },
  {
    slug: "tippgeber",
    stelleId: "stellenanzeige-tippgeber",
    titel: "Tippgeber für Kapitalanlageimmobilien (m/w/d)",
    weg: "tippgeber",
    taetigkeit: "Selbstständig, Tippgeber",
    marke: "Empfehlen",
    kurz:
      "Du kennst Menschen, die über eine Immobilie als Kapitalanlage nachdenken? " +
      "Du stellst den Kontakt her, alles Weitere übernehmen wir.",
    merkmale: MERKMALE,
    werWirSind:
      "OS Immobilien vermittelt Kapitalanlageimmobilien an Menschen, die mit Immobilien langfristig Vermögen aufbauen " +
      "wollen. Beratung, Objektauswahl, Finanzierung und Abwicklung liegen bei uns in einer Hand. Wir rechnen ehrlich, " +
      "erklären verständlich und bleiben nach dem Notartermin ansprechbar. Wer uns einen Kontakt anvertraut, kann sich " +
      "darauf verlassen, dass wir sorgfältig mit ihm umgehen.",
    /*
     * Die Grenze des Tippgebers steht wörtlich so im Vertrag
     * (`vertragKlauseln.ts` § 1 Absatz 3a, `tippgeberVertragPdf.ts` § 2).
     * Die Vergütung „halten wir mit dir persönlich fest" folgt
     * `bewerber-startfahrplan-mail.ts`; einen allgemeinen Satz gibt es nicht.
     */
    deineRolle:
      "Als Tippgeber stellst du nur den Kontakt her. Du nennst uns Menschen aus deinem Umfeld, die sich für eine " +
      "Kapitalanlageimmobilie interessieren, und zwar nur mit deren Einverständnis. Du berätst nicht, stellst keine " +
      "Objekte vor und nennst keine Preise oder Renditen. Das übernehmen wir. Du bist selbstständig tätig und " +
      "empfiehlst, wann es für dich passt. Führt ein Kontakt von dir zu einem notariellen Kaufvertrag, erhältst du " +
      "eine Vergütung, die wir vorher persönlich mit dir festhalten.",
    aufgaben: [
      "Du erkennst in deinem Umfeld Menschen, die sich für eine Immobilie als Kapitalanlage interessieren.",
      // tippgeberVertragPdf.ts § 5 Absatz 1 und 2: Einwilligung und Information vor der Weitergabe.
      "Du fragst sie, ob sie einverstanden sind, dass wir uns bei ihnen melden, und sagst ihnen, dass ihre Daten dafür an uns gehen.",
      // tippgeberVertragPdf.ts § 2 Absatz 1: Übermittlung ausschließlich über das Portal.
      "Du gibst den Kontakt über dein persönliches Tippgeberportal an uns weiter.",
      "Du verfolgst im Portal, wie es mit deinen Kontakten weitergeht.",
      "Alles Weitere überlässt du uns: Beratung, Objektvorstellung, Preise, Finanzierung und Abschluss.",
    ],
    mitbringen: [
      "Ein Umfeld, in dem über Geld, Vorsorge und Immobilien gesprochen wird, etwa im Beruf, im Verein oder im Freundeskreis.",
      "Ein Gespür dafür, wann eine Empfehlung passt, und die Gelassenheit, niemanden zu drängen.",
      // tippgeberVertragPdf.ts, Anlage 1 § 6: Verschwiegenheit.
      "Sorgfalt im Umgang mit Kontaktdaten und die Bereitschaft, Vertrauliches vertraulich zu behalten.",
      /*
       * `tippgeberVertragPdf.ts` § 8: Die reine Nachweistätigkeit ist nach
       * Auffassung der Parteien erlaubnisfrei, im Einzelfall aber nicht
       * ausgeschlossen. Deshalb „in der Regel". § 3 Absatz 2: Die Anmeldung
       * beim Finanzamt liegt beim Tippgeber.
       */
      "Keine Immobilienkenntnisse. Weil du nicht berätst, brauchst du für die reine Kontaktvermittlung in der Regel " +
        "keine Erlaubnis nach § 34c GewO. Die steuerliche Anmeldung deiner Tätigkeit übernimmst du selbst.",
    ],
    bieten: [
      "Kleiner Aufwand: Du stellst den Kontakt her, wir kümmern uns um alles Weitere.",
      // lizenzPakete.ts, Paket „tippgeber": Portal mit Status der Kontakte.
      "Dein eigener Zugang zum Tippgeberportal: Dort gibst du Kontakte weiter und siehst jederzeit, wo sie stehen.",
      // tippgeberVertragPdf.ts § 4 Absatz 2; lizenzPakete.ts: individuelle Vergütung.
      "Eine Vergütung für jeden Kontakt, der zu einem notariellen Kaufvertrag führt, vorher persönlich mit dir vereinbart.",
      // lizenzPakete.ts, Paket „tippgeber": kostenfrei, kein laufendes Entgelt.
      "Kostenfrei: kein Einstiegsbetrag und kein laufendes Entgelt.",
      "Keine Mindestmenge und keine festen Zeiten.",
      "Sorgfältige und ehrliche Betreuung deiner Kontakte, damit du mit gutem Gefühl empfehlen kannst.",
      // Landingpage, FAQ „Kann ich später Vertriebspartner werden?".
      "Wenn du später selbst beraten möchtest, zeigen wir dir den Weg zum selbstständigen Immobilienberater.",
    ],
    erfahrungPlatzhalter: "z. B. kaufmännischer Beruf, großes Netzwerk im Sportverein ...",
  },
  {
    slug: "finanzdienstleister",
    stelleId: "stellenanzeige-finanzdienstleister",
    titel: "Selbstständiger Immobilienberater für Kapitalanlagen mit Hintergrund in der Finanzdienstleistung (m/w/d)",
    weg: "finanzdienstleister",
    taetigkeit: "Selbstständig, Handelsvertreter, Finanzdienstleister",
    marke: "Für Finanzprofis",
    kurz:
      "Du berätst heute schon zu Geld, Vorsorge und Steuern? Erweitere dein Portfolio um geprüfte " +
      "Kapitalanlageimmobilien und um ein zweites Produkt, das stornofrei vergütet wird.",
    merkmale: MERKMALE,
    // „Der Baustein, der im Depot fehlt": bewerberKennenlernen.ts, Weg 2.
    werWirSind:
      "OS Immobilien vermittelt Kapitalanlageimmobilien: sanierte Bestandswohnungen, WG- und Co-Living-Konzepte " +
      "und energieeffiziente Neubauprojekte. Für viele Kunden aus der Finanzberatung ist die vermietete Immobilie " +
      "genau der Baustein, der im Depot noch fehlt. Wir rechnen ehrlich, erklären verständlich und bleiben auch " +
      "nach dem Notartermin ansprechbar.",
    // Status: vertragKlauseln.ts § 1 Absatz 2, Vergütung § 2 Absatz 2.
    deineRolle:
      "Du bist selbstständiger Handelsvertreter nach §§ 84 ff. HGB, mit eigenem Gewerbe und in eigener " +
      "Verantwortung. Du bringst mit, was im Immobilienvertrieb am schwersten zu lernen ist: Du sprichst mit " +
      "Menschen über Geld, Steuern und Vorsorge, und du hast einen eigenen Kundenbestand. Bei uns ergänzt du deine " +
      "Beratung um Kapitalanlageimmobilien und begleitest deine Kunden bis zu ihrer Kaufentscheidung. Wann und von " +
      "wo aus du arbeitest, entscheidest du selbst. Vergütet wirst du ausschließlich erfolgsabhängig.",
    aufgaben: [
      "Du sprichst deine Kunden auf die Immobilie als Kapitalanlage an, dort wo sie in ihre Planung passt.",
      "Du führst Beratungsgespräche, am Telefon, per Video oder persönlich.",
      "Du stellst passende Objekte aus unserem geprüften Angebot vor und rechnest sie mit unseren Rechnern für deinen Kunden durch.",
      "Du hältst Kontakte und Gespräche in unserem CRM fest, damit nichts verloren geht.",
      // Finanzierung: vertragKlauseln.ts § 1 Absatz 3b.
      "Du begleitest deine Kunden bis zur Kaufentscheidung. Finanzierung und Abwicklung laufen über unsere Fachleute.",
    ],
    mitbringen: [
      "Erfahrung in der Finanzdienstleistung, etwa als Finanz-, Versicherungs-, Bank- oder Vermögensberater.",
      "Einen eigenen Kundenbestand oder ein Netzwerk, mit dem du über Geld, Steuern und Vorsorge sprichst.",
      "Unternehmerisches Denken und den Anspruch, ehrlich zu beraten.",
      /*
       * § 34c GewO wie bei Stelle 1. Der Satz zu § 34d und § 34f steht so im
       * Kennenlernbogen, Weg 2 (`bewerberKennenlernen.ts`).
       */
      "Ein eigenes Gewerbe und die Erlaubnis nach § 34c GewO, die du für Beratung und Vermittlung von Immobilien " +
        "brauchst. Eine Erlaubnis nach § 34d oder § 34f ersetzt sie nicht. Fehlt sie dir noch, unterstützen wir dich " +
        "beim Antrag. Bis sie vorliegt, berätst du zu Immobilien nicht selbst.",
      "Ausdauer: Eine Immobilie kauft niemand an einem Abend. Zwischen dem ersten Gespräch und der Provision können Monate liegen.",
    ],
    bieten: [
      // bewerberKennenlernen.ts, Weg 2: „Objekt, Rechnung und Abwicklung kommen von uns."
      "Du musst kein Immobilienprofi werden: Objekt, Rechnung und Abwicklung kommen von uns.",
      // vertragKlauseln.ts § 3 Absatz 1.
      "Zugang zu geprüften Kapitalanlageimmobilien mit Exposés, Kalkulationen und Vertriebsunterlagen.",
      "Unser CRM mit Pipeline, Rechnern und Präsentationen, ohne Entgelt.",
      // vertragKonditionen.ts GESTELLTE_ZUSATZLEISTUNGEN.
      "Academy, Verkaufstraining und persönliche Begleitung beim Start.",
      "Eine persönliche Landingpage und einen Marketingbaukasten für deine eigene Akquise.",
      // lizenzPakete.ts: „Einheitlich … auf Lead- und Eigenkontakte". Bewusst ohne Satz.
      "Eine erfolgsabhängige Provision auf die Immobilie, gleich hoch für deine eigenen Kunden und für Interessenten von uns. Die Konditionen besprechen wir persönlich mit dir.",
      "Kein Einstiegsbetrag, kein laufendes Entgelt, keine Mindestlaufzeit.",
    ],
    erfahrungPlatzhalter: "z. B. 8 Jahre Versicherungsberatung, eigener Bestand ...",
    /*
     * Das zweite Produkt. Die Vorteile stehen so im Kennenlernbogen, Weg 2,
     * Ansicht „Ein zweites Produkt, das zu dir passt"; der Satz „keine
     * Bedingung für die Zusammenarbeit" steht so im Videocall
     * (`bewerberVideocall.ts`). Die Gespräche dazu führt Christian Kurz
     * (`bewerberprozessFreigabe.ts`).
     */
    zweitesProdukt: {
      titel: "Ein zweites Produkt neben der Immobilie",
      einleitung:
        "Neben der Immobilie haben wir ein Produkt aus der Finanzwelt im Programm, mit dem du deinen " +
        "Kundenbestand weiter wirtschaftlich betreuen kannst, ohne Stornorisiko.",
      punkte: [
        { titel: "Stornofreie Provision", text: "Deine Provision bleibt deine. Keine Stornohaftung, keine Rückrechnung nach Jahren." },
        { titel: "Sehr gute Bestandsprovision", text: "Du wirst nicht nur beim Abschluss vergütet, sondern laufend, solange der Vertrag läuft." },
      ],
      rendite: FINANZPROFI_RENDITE,
      fuss:
        "Welches Produkt das ist, wie es vergütet wird und was du dafür brauchst, besprechen wir persönlich " +
        "mit dir. Es ist keine Bedingung für die Zusammenarbeit.",
    },
  },
];

/**
 * Die Werte des Hauses, kurz gefasst für den Kopf der Seite.
 *
 * Die Titel stammen aus `KULTUR_WERTE` in `kulturContent.ts` und müssen dort
 * gleich lauten (Test). Die Texte sind eigene Kurzfassungen: Die langen
 * Fassungen sprechen vom „Team" und sind für die interne Kulturseite
 * geschrieben.
 */
export const STELLENANZEIGE_WERTE: { titel: string; text: string }[] = [
  { titel: "Ehrlich rechnen", text: "Wir nennen die Zahl, die stimmt, auch wenn eine andere freundlicher aussähe." },
  { titel: "Verstehen vor Zustimmung", text: "Am Ende eines Gesprächs steht ein informierter Mensch, kein überredeter." },
  { titel: "Verlässlich sein", text: "Ein zugesagter Rückruf findet statt. Eine offene Frage bleibt nicht liegen." },
  { titel: "Begleiten statt abschließen", text: "Mit dem Notartermin endet unsere Arbeit nicht. Dort fängt die Betreuung an." },
];

/** Die Texte im Kopf der Seite. Eigene Stelle, damit der Wortwächter sie mitprüft. */
export const STELLENANZEIGE_KOPF = {
  marke: "Partner werden bei OS Immobilien",
  titelZeile1: "Dein eigenes Geschäft.",
  titelZeile2: "Mit echten Objekten und uns im Rücken.",
  einleitung:
    "OS Immobilien vermittelt Kapitalanlageimmobilien an Menschen, die mit Immobilien Vermögen aufbauen wollen. " +
    "Dafür suchen wir selbstständige Partner, die so beraten und empfehlen, wie wir arbeiten: ehrlich, verständlich " +
    "und auf lange Sicht.",
  // Belegt: vertragKlauseln.ts § 1 Absatz 2 und 4, § 2 Absatz 2.
  fakten: ["Selbstständig mit eigenem Gewerbe", "Remote und bundesweit", "Kein Einstiegsbetrag"],
  werteTitel: "Wofür wir stehen",
  stellenMarke: "Offene Partnerschaften",
  stellenTitel: "Wo du bei uns einsteigen kannst",
  stellenEinleitung: "Drei Einstiege, alle selbstständig. Öffne eine Karte, um alles zu lesen.",
  stellenHinweis:
    "Alle drei Einstiege sind eine selbstständige Tätigkeit und werden ausschließlich erfolgsabhängig vergütet.",
} as const;

/**
 * Die Bestätigung für Tippgeber nach dem Absenden. Ehrlich: Es geht keine
 * Mail hinaus, das Team ruft an (Christian, 24.09.2026). Davor steht
 * „Danke, {Vorname}!".
 */
export const TIPPGEBER_BESTAETIGUNG = "Wir melden uns in den nächsten Tagen telefonisch bei dir.";

/**
 * Der Titel, den `submit-bewerbung` für Tippgeber selbst setzt. Beide müssen
 * gleich lauten, sonst sieht HR zwei verschiedene Tippgeber-Stellen (Test).
 */
export const TIPPGEBER_STELLE_TITEL = "Tippgeber für Kapitalanlageimmobilien (m/w/d)";

/** Ebenso für Finanzdienstleister: Diesen Titel setzt `submit-bewerbung` selbst. */
export const FINANZDIENSTLEISTER_STELLE_TITEL =
  "Selbstständiger Immobilienberater für Kapitalanlagen mit Hintergrund in der Finanzdienstleistung (m/w/d)";

/**
 * Das feste Feld `stelle`, das an `submit-bewerbung` geht. Der Berater aus
 * Stelle 1 schickt keins und läuft wie Landingpage und Karriereseite.
 */
export function stellenKennzeichen(stelle: Stellenanzeige): "tippgeber" | "finanzdienstleister" | undefined {
  if (stelle.weg === "tippgeber") return "tippgeber";
  if (stelle.weg === "finanzdienstleister") return "finanzdienstleister";
  return undefined;
}

/** Die Stelle zu einem Adresszusatz wie `#tippgeber`, sonst nichts. */
export function stelleZuSlug(slug: string | null | undefined): Stellenanzeige | undefined {
  const wert = (slug || "").replace(/^#/, "").trim().toLowerCase();
  if (!wert) return undefined;
  return STELLENANZEIGEN.find((s) => s.slug === wert);
}

/** Alle Texte einer Stelle, die Besucher zu sehen bekommen. Für den Wortwächter. */
export function sichtbareTexte(stelle: Stellenanzeige): string[] {
  return [
    stelle.titel,
    stelle.marke,
    stelle.kurz,
    ...stelle.merkmale.flatMap((m) => [m.label, m.wert]),
    stelle.werWirSind,
    stelle.deineRolle,
    ...stelle.aufgaben,
    ...stelle.mitbringen,
    ...stelle.bieten,
    stelle.erfahrungPlatzhalter,
    ...(stelle.zweitesProdukt
      ? [
          stelle.zweitesProdukt.titel,
          stelle.zweitesProdukt.einleitung,
          ...stelle.zweitesProdukt.punkte.flatMap((p) => [p.titel, p.text]),
          ...(stelle.zweitesProdukt.rendite
            ? [stelle.zweitesProdukt.rendite.punkt.titel, stelle.zweitesProdukt.rendite.punkt.text]
            : []),
          stelle.zweitesProdukt.fuss,
        ]
      : []),
  ];
}
