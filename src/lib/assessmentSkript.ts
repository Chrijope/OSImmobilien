/**
 * Erstgesprächsskript (Bewerbermanagement).
 *
 * Das komplette Gesprächsskript liegt hier als typisierte Datenstruktur:
 * die zehn Punkte mit ihren Sprechtexten, die Felder, die Profil-Einordnung
 * mit ihren Vertiefungsblöcken, die Einwandbehandlung und die Scoring-Logik.
 * Die Tab-Komponente (ErstgespraechsTab) rendert nur noch aus dieser Struktur.
 *
 * Aufbau: erst kennenlernen (Punkt 1 bis 5), dann vorstellen (Punkt 6),
 * dann Verdienst und Formales (Punkt 7). Die harten Kriterien
 * (Zeit, Gewerbe und 34c) sind bewusst unauffällig in die passenden
 * Punkte eingebettet und stehen nicht als Prüfblock vorneweg.
 *
 * Das Erstgespräch klärt nur, ob der Bewerber passt. Konditionen wie
 * Provisionssätze und Leadpreise gehören bewusst erst ins Kooperations-
 * beziehungsweise Closing-Gespräch und stehen deshalb nicht mehr hier.
 *
 * Alle Beträge stammen aus den Konstanten in lizenzPakete.ts und sind
 * bewusst NICHT hartcodiert.
 */

import { getLizenzPaket } from "./lizenzPakete";
import { BESCHAEFTIGUNGSARTEN } from "./beschaeftigungsarten";

// ── Abgeleitete Beträge ──

/** Einheitlicher Provisionssatz in Prozent (aus dem Paket "Vertriebspartner"). */
export const PROVISION_PROZENT = getLizenzPaket("junior")?.provisionssatz ?? 4;

/** Beispielkaufpreis für die Provisionsrechnung im Konditionen-Sprechtext. */
export const BEISPIEL_KAUFPREIS_EUR = 300_000;

/** Provision beim Beispielkaufpreis (abgeleitet, nicht hartcodiert). */
export const BEISPIEL_PROVISION_EUR = Math.round((BEISPIEL_KAUFPREIS_EUR * PROVISION_PROZENT) / 100);

const fmt = (n: number) => n.toLocaleString("de-DE");

/**
 * Buchungslink fuer das Kooperationsgespraech (Punkt 10, Closing-Termin).
 *
 * Bewusst fuer alle derselbe Link: Das Kooperationsgespraech laeuft ueber die
 * HR Managerin, nicht ueber den persoenlichen Kalender des Interviewers.
 * Frueher galt hier der Buchungslink aus dem eigenen Profil mit diesem Wert
 * als Rueckfall, dadurch landete der Termin im falschen Kalender.
 */
export const CLOSING_BUCHUNGSLINK = "https://calendly.com/sarah-kaiser-thom-more/gespraechstermin";

// ── Antworten (werden in bewerber.meta.erstgespraechSkript.assessment gespeichert) ──

export type AssessmentPfad = "immo" | "findi" | "vertrieb" | "quereinsteiger";
export type AssessmentEmpfehlung = "A" | "B" | "C";

export type AssessmentAntworten = {
  /** Punkt 1: Notiz Ersteindruck */
  ersteindruck?: string;
  /** Punkt 2: Beschäftigungsart (Werte aus beschaeftigungsarten.ts) */
  beschaeftigungsart?: string;
  /** Punkt 2: Branche */
  branche?: string;
  /** Punkt 2: freie Notizen zum Werdegang */
  werdegang?: string;
  /** Punkt 3: Profil-Einordnung, Mehrfachwahl möglich */
  pfade?: AssessmentPfad[];
  // Punkt 3, Pfad A Immobilienerfahren
  immoSchwerpunkt?: "" | "makler" | "bautraeger" | "kapitalanlage" | "verwaltung";
  immoAbschluesseProJahr?: string;
  immoWechselgrund?: string;
  immoNetzwerk?: "" | "ja" | "nein";
  // Punkt 3, Pfad B Finanzdienstleister
  findiSparten?: string[];
  findiBestand?: string;
  // Punkt 3, Pfad C Vertriebserfahren
  vertriebBranche?: string;
  vertriebErfolge?: string;
  vertriebKaltakquise?: "" | "ja" | "nein";
  vertriebLernbereitschaft?: string;
  // Punkt 3, Pfad D Quereinsteiger
  querBeruf?: string;
  querErfolg?: string;
  querWarumVertrieb?: string;
  querBelastbarkeit?: number;
  /** Punkt 4: Ziele (wird mit dem Profil synchronisiert) */
  ziele?: string;
  /** Punkt 4: Einkommensziel in Euro pro Monat (Freitext-Zahl) */
  einkommensziel?: string;
  /**
   * Punkt 5: Motivation (wird mit dem Profil synchronisiert).
   * Der Schlüssel heißt weiterhin `antrieb`, damit bereits erfasste
   * Antworten aus der Vorfassung erhalten bleiben.
   */
  antrieb?: string;
  /** Punkt 5: verfügbare Zeit pro Woche (hartes Kriterium) */
  zeitProWoche?: "" | "unter_10" | "10_bis_20" | "vollzeit";
  /** Punkt 6: Notiz Reaktion / Rückfragen */
  vorstellungNotiz?: string;
  /** Punkt 7a: Reaktion auf die Provision */
  konditionenReaktion?: string;
  /**
   * Veraltet: Monatsgebühr und Lead-Kauf werden im Erstgespräch nicht mehr
   * gefragt; die Gebühr gibt es seit dem 07.09.2026 gar nicht mehr, der
   * Lead-Kauf gehört ins persönliche Gespräch. Die Schlüssel bleiben nur
   * bestehen, damit bereits erfasste Antworten weiter lesbar sind. Sie fließen
   * nicht mehr in Scoring oder KO-Punkte ein.
   */
  systemgebuehrOk?: "" | "ja" | "rueckfragen" | "nein";
  systemgebuehrNotiz?: string;
  leadKaufInteresse?: "" | "ja" | "vielleicht" | "nein";
  leadKaufNotiz?: string;
  /**
   * Punkt 7d: Stand der Gewerbeerlaubnis nach Paragraf 34c (hartes Kriterium).
   * Schlüssel bleibt `bereitschaft34c` wegen bereits erfasster Antworten.
   */
  bereitschaft34c?: "" | "vorhanden" | "beantragt" | "wuerde_beantragen" | "lehnt_ab";
  /** Punkt 8: Notiz zur Einwandbehandlung */
  einwandNotiz?: string;
  /** Punkt 9: Gesamteindruck 1 bis 5 Sterne (synchron mit bewerber.bewertung) */
  gesamteindruck?: number;
  /** Punkt 9: Zielklarheit 1 bis 5 */
  zielklarheit?: number;
  /** Punkt 9: HR kann die automatische Empfehlung übersteuern */
  empfehlungOverride?: "" | AssessmentEmpfehlung;
  /** Punkt 9: Begründung zur Bewertung / Übersteuerung */
  empfehlungBegruendung?: string;
};

/** Gibt es überhaupt schon Assessment-Antworten? (Für Badges in der Übersicht) */
export function hatAssessmentDaten(a: AssessmentAntworten | undefined | null): boolean {
  if (!a) return false;
  return Object.entries(a).some(([, v]) => {
    if (v == null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "number") return v > 0;
    return true;
  });
}

// ── Felder ──

export type AssessmentFeldTyp = "auswahl" | "mehrfach" | "text" | "notiz" | "zahl" | "janein" | "skala";

export type AssessmentFeld = {
  key: keyof AssessmentAntworten;
  label: string;
  typ: AssessmentFeldTyp;
  /** Wörtlicher Sprechtext direkt an dieser Frage */
  frage?: string;
  optionen?: { value: string; label: string }[];
  placeholder?: string;
};

// ── Profil-Einordnung (Punkt 3): Kacheln plus Vertiefungsblock ──

export type AssessmentPfadDef = {
  id: AssessmentPfad;
  /** Kachel-Beschriftung */
  label: string;
  /** Kurzbeschreibung auf der Kachel */
  beschreibung: string;
  /** Pfadgewicht fürs Scoring (A am stärksten, D am schwächsten) */
  punkte: number;
  sprechtext: string;
  /** Regie-Hinweis für den Gesprächsführer, kein Sprechtext */
  hinweis?: string;
  /** Wortlaut zum Regie-Hinweis, wenn der Punkt platziert wird */
  hinweisWortlaut?: string;
  felder: AssessmentFeld[];
};

export const ASSESSMENT_PFADE: AssessmentPfadDef[] = [
  {
    id: "immo",
    label: "Immobilienerfahren",
    beschreibung: "Bereits im Immobilienvertrieb oder der Immobilienwirtschaft tätig",
    punkte: 30,
    sprechtext:
      "Das ist spannend, du bringst also schon Immobilienerfahrung mit. Erzähl mir kurz: Was genau hast du gemacht, wie viele Abschlüsse waren das ungefähr, und was ist der Grund, dass du dich verändern möchtest?",
    felder: [
      {
        key: "immoSchwerpunkt", label: "Schwerpunkt", typ: "auswahl",
        optionen: [
          { value: "makler", label: "Makler" },
          { value: "bautraeger", label: "Bauträgervertrieb" },
          { value: "kapitalanlage", label: "Kapitalanlage" },
          { value: "verwaltung", label: "Verwaltung" },
        ],
      },
      { key: "immoAbschluesseProJahr", label: "Abschlüsse pro Jahr", typ: "zahl", placeholder: "z. B. 12" },
      { key: "immoWechselgrund", label: "Wechselgrund", typ: "notiz", placeholder: "Warum will er oder sie wechseln?" },
      { key: "immoNetzwerk", label: "Eigenes Netzwerk", typ: "janein" },
    ],
  },
  {
    id: "findi",
    label: "Finanzdienstleister",
    beschreibung: "Versicherung, Baufinanzierung oder Vermögensberatung",
    punkte: 25,
    sprechtext:
      "Aus der Finanzdienstleistung, das passt bei uns richtig gut zusammen. Deine Kunden vertrauen dir bereits bei Geldthemen, und die Kapitalanlage-Immobilie ist für viele davon die logische Erweiterung. Erzähl mir kurz: In welcher Sparte bist du unterwegs, und wie groß ist dein Kundenstamm?",
    hinweis:
      "Regie: Den Ausblick auf das kommende Produkt hier kurz platzieren, nicht ausführen. Details gehören ins persönliche Gespräch.",
    hinweisWortlaut:
      "Und noch etwas, das für dich besonders interessant sein dürfte: Wir bringen zeitnah ein weiteres Produkt an den Start, das genau zu deinem Profil passt, stornofrei, geringe Gebühr, hohe Provision. Details dazu bekommst du im persönlichen Gespräch.",
    felder: [
      {
        key: "findiSparten", label: "Sparte", typ: "mehrfach",
        optionen: [
          { value: "versicherung", label: "Versicherung" },
          { value: "baufinanzierung", label: "Baufinanzierung" },
          { value: "vermoegensberatung", label: "Vermögensberatung" },
          { value: "34d_34f", label: "34d oder 34f vorhanden" },
        ],
      },
      { key: "findiBestand", label: "Kundenstamm", typ: "notiz", placeholder: "Wie groß ist der Kundenstamm?" },
    ],
  },
  {
    id: "vertrieb",
    label: "Vertriebserfahren",
    beschreibung: "Vertriebserfahrung außerhalb der Immobilie",
    punkte: 18,
    sprechtext:
      "Vertrieb bleibt Vertrieb, das ist eine gute Grundlage. Immobilie ist allerdings erklärungsbedürftiger als vieles andere. Was hast du bisher verkauft, was waren deine besten Ergebnisse, und wie schnell arbeitest du dich in ein neues Produkt ein?",
    felder: [
      { key: "vertriebBranche", label: "Branche", typ: "text", placeholder: "z. B. Telekommunikation, Kfz, Energie" },
      { key: "vertriebErfolge", label: "Erfolge", typ: "notiz", placeholder: "Was waren die besten Ergebnisse?" },
      { key: "vertriebKaltakquise", label: "Kaltakquise", typ: "janein" },
      { key: "vertriebLernbereitschaft", label: "Eindruck Lernbereitschaft", typ: "notiz", placeholder: "Wie schnell arbeitet er oder sie sich ein?" },
    ],
  },
  {
    id: "quereinsteiger",
    label: "Quereinsteiger",
    beschreibung: "Noch keine Vertriebserfahrung",
    punkte: 8,
    sprechtext:
      "Alles klar, dann kommst du also nicht aus dem Vertrieb. Das ist bei uns kein Ausschlusskriterium, im Gegenteil: Einige unserer erfolgreichsten Partner sind Quereinsteiger. Ich sage dir aber ehrlich, dass die Hürde am Anfang höher ist, weil du Produkt und Verkauf gleichzeitig lernst. Was wir dafür suchen, ist Erfolgshunger. Woran machst du fest, dass du den mitbringst?",
    felder: [
      { key: "querBeruf", label: "Beruf", typ: "text", placeholder: "Aktueller oder letzter Beruf" },
      { key: "querErfolg", label: "Größter Erfolg", typ: "notiz", placeholder: "Worauf ist er oder sie stolz?" },
      { key: "querWarumVertrieb", label: "Warum Vertrieb, warum jetzt", typ: "notiz" },
      { key: "querBelastbarkeit", label: "Belastbarkeit", typ: "skala" },
    ],
  },
];

export function getPfadDef(id: AssessmentPfad): AssessmentPfadDef {
  return ASSESSMENT_PFADE.find((p) => p.id === id) ?? ASSESSMENT_PFADE[3];
}

/** Der stärkste gewählte Pfad zählt (A vor B vor C vor D). */
export function staerksterPfad(pfade: AssessmentPfad[] | undefined): AssessmentPfadDef | null {
  if (!pfade || pfade.length === 0) return null;
  const gewaehlt = ASSESSMENT_PFADE.filter((p) => pfade.includes(p.id));
  if (gewaehlt.length === 0) return null;
  return gewaehlt.reduce((max, p) => (p.punkte > max.punkte ? p : max), gewaehlt[0]);
}

// ── Leistungstabelle (Punkt 6) ──

export const LEISTUNGSTABELLE_SPALTEN = ["Was du von uns bekommst", "Was es dir spart"] as const;

export const LEISTUNGSTABELLE: { leistung: string; ersparnis: string }[] = [
  { leistung: "Eigenes CRM und Kundenverwaltung", ersparnis: "spart teure Software-Lizenzen und Entwicklungskosten" },
  { leistung: "Objektzugang und Investagon", ersparnis: "spart eigene Objektakquise und Kalkulationsaufbau" },
  { leistung: "Qualifizierte Leads auf Wunsch", ersparnis: "spart den Start bei null" },
  { leistung: "Etablierte Marke", ersparnis: "spart Markenaufbau von mehreren tausend Euro" },
  { leistung: "Academy und Mentoring", ersparnis: "spart teure externe Schulungen" },
  { leistung: "Backoffice, Finanzierung, Rechtliches", ersparnis: "spart eigene Verwaltung und Rechtsberatung" },
];

// ── Folien (Teil 1 des Präsentationsdecks) ──

/** Karte auf einer Teil-1-Folie: Überzeile, optional Titel und Text. */
export type AssessmentFolieKarte = {
  ueber: string;
  titel?: string;
  text?: string;
  /** Blau hinterlegte Akzentfläche */
  aktiv?: boolean;
  /** Überzeile gedimmt statt in Akzentfarbe */
  ueberGedimmt?: boolean;
};

/**
 * Folienmetadaten einer Station. Aus ihnen leitet erstgespraechFolien.ts die
 * Teil-1-Folien des Präsentationsdecks ab (Videocall mit Bildschirmfreigabe).
 * Die Sprechtexte bleiben in der Station; die Folie zeigt nur Titel, Karten
 * und Stichworte, nie Regie oder Score. Der Bewerber sieht sie, deshalb
 * stehen hier keine Fragen im Wortlaut des Skripts und keine internen Werte.
 *
 * Kleine Auszeichnung in Texten: *Sterne* heben ein Wort in Akzentfarbe
 * hervor, das Glanzwort des Titels steht getrennt in `glanz`.
 */
export type AssessmentFolie = {
  /** Eindeutige Folien-Id im Deck (praesentationsDeck.ts) */
  id: string;
  /** Titel in der Kopfzeile der Präsentation */
  kopfzeile: string;
  /** Überzeile in Versalien */
  kicker: string;
  /** Titel ohne Anrede, endet mit Satzzeichen */
  titel: string;
  /** Das eine Wort oder die Wortgruppe im Titel, das im Glanz-Verlauf steht */
  glanz: string;
  /** Der Vorname wird vor dem Satzzeichen des Titels eingefügt */
  anrede?: boolean;
  /** Deckblatt: großer Titel, schmale Folie */
  deckblatt?: boolean;
  /** Schmale Folie (wie das Deckblatt, aber mit normalem Titel) */
  schmal?: boolean;
  untertitel?: string;
  /** Karten; bei Station 3 leer, sie kommen aus ASSESSMENT_PFADE */
  karten?: AssessmentFolieKarte[];
  /** Stichworte als Chips; bei Station 8 leer, sie kommen aus ASSESSMENT_EINWAENDE */
  stichworte?: string[];
  /** Großer Satz unter Karten oder Stichworten */
  gross?: string;
  /** Der große Satz eine Stufe kleiner, damit er in eine Zeile passt */
  grossKompakt?: boolean;
  /** Frage über den Antwortoptionen */
  frage?: string;
  /** Antwortoptionen als leise Chips (nur die, die der Bewerber sehen soll) */
  optionen?: string[];
  /** Ruhiger Satz am Ende */
  satz?: string;
  /** Hervorgehobene Überleitung zu Teil 2 (nur die letzte Folie von Teil 1) */
  ueberleitung?: { ueber: string; satz: string; glanz: string; unterzeile: string };
  /** Abschließende Pille (nur das Deckblatt) */
  schluss?: string;
};

// ── Die zehn Punkte des Gesprächs ──

/** Unterblock innerhalb eines Punktes (Punkt 7 hat zwei davon). */
export type AssessmentBlock = {
  key: string;
  titel: string;
  sprechtexte: string[];
  felder?: AssessmentFeld[];
};

export type AssessmentStation = {
  nummer: number;
  key: string;
  /** Titel im Skript */
  titel: string;
  /** Kurztitel für den Kurzüberblick oben */
  kurz: string;
  /** Ein einzelner Sprechtext */
  sprechtext?: string;
  /** Mehrere Sprechblöcke nacheinander */
  sprechtexte?: string[];
  felder?: AssessmentFeld[];
  /** Unterblöcke mit eigenen Sprechtexten und Feldern */
  bloecke?: AssessmentBlock[];
  /**
   * Folie im Präsentationsdeck. Fehlt sie, hat die Station keine Folie:
   * Punkt 6 (Wer wir sind) geht in Teil 2 auf, Punkt 9 (Einschätzung) und
   * Punkt 10 (Terminbuchung) sind interne Zwischenstopps der Moderation.
   */
  folie?: AssessmentFolie;
};

export const ASSESSMENT_STATIONEN: AssessmentStation[] = [
  {
    nummer: 1,
    key: "einstieg",
    titel: "Einstieg und Rahmen",
    kurz: "Einstieg und Rahmen",
    sprechtext:
      "Hallo {vorname}, hier ist {beraterName} von MOREImmo, schön dass es klappt. Passt es gerade für 15 bis 30 Minuten? ... Sehr gut. Dieses Erstgespräch dient dazu, dass wir uns beide kennenlernen: Du weißt aktuell ja noch nicht viel über uns, deshalb wirst du im Laufe des Gesprächs erfahren, wer wir sind, was wir machen und was wir dir in einer vertrieblichen Zusammenarbeit bieten. Genauso wichtig ist für uns aber auch, wer du bist, woher du kommst und was du bisher gemacht hast. Ich sage dir ganz offen: Wir führen aktuell viele dieser Gespräche und arbeiten am Ende nur mit wenigen zusammen. Deshalb schauen wir heute in Ruhe, ob es auf beiden Seiten passt, und am Ende sage ich dir ehrlich, wie es weitergeht. Einverstanden?",
    felder: [
      { key: "ersteindruck", label: "Notiz Ersteindruck", typ: "notiz", placeholder: "Stimme, Energie, Gesprächsbereitschaft, Umfeld ..." },
    ],
    // Deckblatt des Gesamtdecks: rahmt Teil 1 und Teil 2, nicht nur das
    // Erstgespräch.
    folie: {
      id: "einstieg",
      kopfzeile: "Dein Gespräch mit MOREImmo",
      kicker: "Dein Gespräch mit MOREImmo",
      titel: "Schön, dass es klappt.",
      glanz: "klappt",
      anrede: true,
      deckblatt: true,
      untertitel:
        "Zwei Teile, ein Gespräch. Erst lernen wir dich kennen: wo du stehst und wohin du willst. Dann zeigst du uns, ob es passt, und wir zeigen dir, wie eine Zusammenarbeit mit MOREImmo konkret aussieht.",
      karten: [
        { ueber: "Teil 1 · Über dich", text: "Deine Ausgangslage. Dein Profil. Deine Ziele. Deine Motivation. Deine Fragen.", aktiv: true },
        { ueber: "Teil 2 · Über uns", text: "System. Produkte. Ein echter Deal. Deine Zahlen. Konditionen. Dein Start.", ueberGedimmt: true },
      ],
      schluss: "Offen auf beiden Seiten. Am Ende weißt du, wie es weitergeht.",
    },
  },
  {
    nummer: 2,
    key: "ausgangslage",
    titel: "Deine Ausgangslage",
    kurz: "Deine Ausgangslage",
    sprechtext:
      "Dann hol mich gerne mal ab: Was machst du aktuell beruflich, in welcher Branche bist du tätig, und wie sieht dein Werdegang bis hierher aus?",
    felder: [
      {
        // Das Feld meint den Einstiegswunsch aus der Bewerbung, nicht die
        // aktuelle Taetigkeit. Der Sprechtext stellt die Frage ausdruecklich,
        // damit im Gespraech nicht die Ausgangslage eingetragen wird.
        key: "beschaeftigungsart", label: "Gewünschte Zusammenarbeit mit MOREImmo", typ: "auswahl",
        frage: "Und wie stellst du dir die mögliche Zusammenarbeit mit uns vor: eher nebenberuflich oder hauptberuflich?",
        optionen: BESCHAEFTIGUNGSARTEN.map((a) => ({ value: a.id, label: a.label })),
      },
      { key: "branche", label: "Branche", typ: "text", placeholder: "z. B. Versicherung, Handwerk, IT" },
      { key: "werdegang", label: "Notizen Werdegang", typ: "notiz", placeholder: "Stationen, Dauer, Auffälligkeiten ..." },
    ],
    folie: {
      id: "ausgangslage",
      kopfzeile: "Deine Ausgangslage",
      kicker: "Deine Ausgangslage",
      titel: "Hol mich mal ab.",
      glanz: "ab",
      anrede: true,
      karten: [
        { ueber: "Aktuell", titel: "Was machst du heute beruflich?", text: "Angestellt, selbstständig, in Umbruch: alles ist ein guter Startpunkt." },
        { ueber: "Branche", titel: "In welcher Branche bist du unterwegs?", text: "Versicherung, Handwerk, IT, Handel: die Nähe zum Kunden zählt." },
        { ueber: "Werdegang", titel: "Wie sieht dein Weg bis hierher aus?", text: "Stationen, Dauer, das eine Kapitel, auf das du stolz bist." },
      ],
      gross: "Und wie stellst du dir die Zusammenarbeit mit uns vor: *nebenberuflich* oder *hauptberuflich*?",
      grossKompakt: true,
    },
  },
  {
    nummer: 3,
    key: "profil",
    titel: "Profil-Einordnung und Vertiefung",
    kurz: "Profil-Einordnung und Vertiefung",
    // Kacheln (ASSESSMENT_PFADE) plus der passende Vertiefungsblock.
    // Die Karten der Folie kommen ebenfalls aus ASSESSMENT_PFADE
    // (erstgespraechFolien.ts), deshalb stehen hier keine.
    folie: {
      id: "profil",
      kopfzeile: "Profil-Einordnung",
      kicker: "Profil-Einordnung",
      titel: "Wo kommst du her?",
      glanz: "her",
      satz: "Kein Pfad ist ein Ausschlusskriterium. Einige unserer erfolgreichsten Partner sind Quereinsteiger. Was wir suchen, ist *Erfolgshunger*.",
    },
  },
  {
    nummer: 4,
    key: "ziele",
    titel: "Ziele",
    kurz: "Ziele",
    sprechtext:
      "Wenn wir mal in die Zukunft schauen: Was möchtest du in den nächsten ein bis drei Jahren beruflich und finanziell erreichen? Was sind deine konkreten Ziele, also Umsatz, Karriere, Lebensstil?",
    felder: [
      { key: "ziele", label: "Ziele", typ: "notiz", placeholder: "Umsatz, Karriere, Lebensstil ..." },
      { key: "einkommensziel", label: "Einkommensziel (Euro pro Monat)", typ: "zahl", placeholder: "z. B. 8000" },
      { key: "zielklarheit", label: "Zielklarheit", typ: "skala" },
    ],
    folie: {
      id: "ziele",
      kopfzeile: "Deine Ziele",
      kicker: "Deine Ziele",
      titel: "Wo willst du in ein bis drei Jahren stehen?",
      glanz: "stehen",
      schmal: true,
      stichworte: ["Umsatz", "Karriere", "Lebensstil"],
      gross: "Beruflich. Finanziell. *Konkret.*",
      satz: "Je klarer dein Ziel, desto ehrlicher können wir dir sagen, ob der Weg über MOREImmo dorthin führt.",
    },
  },
  {
    nummer: 5,
    key: "motivation",
    titel: "Motivation",
    kurz: "Motivation",
    sprechtext:
      "Was hat dich konkret an MOREImmo gereizt? Warum hast du dich gerade bei uns gemeldet und nicht woanders? Und was erhoffst du dir von einer Zusammenarbeit mit uns?",
    felder: [
      { key: "antrieb", label: "Motivation", typ: "notiz", placeholder: "Was treibt ihn oder sie wirklich an?" },
      {
        key: "zeitProWoche", label: "Verfügbare Zeit pro Woche", typ: "auswahl",
        frage: "Und wie viel Zeit kannst du dafür pro Woche einplanen?",
        optionen: [
          { value: "unter_10", label: "Unter 10 Std" },
          { value: "10_bis_20", label: "10 bis 20 Std" },
          { value: "vollzeit", label: "Vollzeit" },
        ],
      },
    ],
    folie: {
      id: "motivation",
      kopfzeile: "Motivation",
      kicker: "Motivation",
      titel: "Warum MOREImmo, warum jetzt?",
      glanz: "warum jetzt",
      karten: [
        { ueber: "Der Reiz", titel: "Was hat dich an MOREImmo gereizt?" },
        { ueber: "Die Wahl", titel: "Warum bei uns und nicht woanders?" },
        { ueber: "Die Erwartung", titel: "Was erhoffst du dir von der Zusammenarbeit?" },
      ],
      frage: "Und wie viel Zeit kannst du dafür pro Woche einplanen?",
      // Ausgeschrieben statt "Std", weil der Bewerber die Folie liest.
      optionen: ["Unter 10 Stunden", "10 bis 20 Stunden", "Vollzeit"],
    },
  },
  {
    nummer: 6,
    key: "werWirSind",
    titel: "Wer wir sind und wie eine Zusammenarbeit aussieht",
    kurz: "Wer wir sind und wie die Zusammenarbeit aussieht",
    sprechtexte: [
      "Bevor wir konkret werden, hole ich dich kurz ab: wer wir sind, was wir machen und wie eine Zusammenarbeit mit uns aussehen kann. MOREImmo ist ein Kapitalanlage-Vertrieb. Wir sprechen die besser verdienenden Menschen in Deutschland an, also Unternehmer, Ärzte, High Experts, und zeigen ihnen über ein Immobilien-Investment die Möglichkeit, ihre Steuer zu optimieren und Vermögen aufzubauen.",
      "Unsere Zielgruppe verdient typischerweise 80.000, 90.000, 100.000 Euro und mehr und bringt eine sehr gute Bonität mit. Bei den Objekten sind wir stark auf Bayern fokussiert, München und Umland, Augsburg und Nürnberg, haben aber auch ausgewählte Objekte deutschlandweit. Wir decken dabei drei Assetklassen ab: sanierten Bestand, meist mit erhöhtem Restnutzungsdauer-Gutachten und Erhaltungsaufwand, WG- und Co-Living-Konzepte, und Neubau im KfW-40-QNG-Standard mit KfW-Kredit, bester Energieeffizienz und Nachhaltigkeit. Am Ende entscheidet immer der Kunde mit seinen Zielen, welche Strategie zu ihm passt.",
      "Da wir unser Vertriebsteam erweitern, suchen wir motivierte, lernwillige und erfolgshungrige Partner, gern mit Know-how aus dem Immobilien- oder Finanzbereich. Und du bist bei uns nicht auf dich allein gestellt, sondern bekommst ein komplettes System an die Hand:",
    ],
    felder: [
      { key: "vorstellungNotiz", label: "Notiz Reaktion", typ: "notiz", placeholder: "Was hat ihn oder sie interessiert? Welche Rückfragen kamen?" },
    ],
  },
  {
    nummer: 7,
    key: "konditionen",
    titel: "Konditionen und Machbarkeit",
    kurz: "Konditionen und Machbarkeit",
    bloecke: [
      {
        key: "verdienst",
        titel: "Was du verdienst",
        sprechtexte: [
          `Zu den Konditionen, damit du weißt, woran du bist: Bei uns bekommen alle Partner ${PROVISION_PROZENT} Prozent Provision vom Kaufpreis, und zwar unabhängig davon, ob der Kunde aus deinem eigenen Netzwerk kommt oder ob du Leads über uns beziehst. Bei einem Kaufpreis von ${fmt(BEISPIEL_KAUFPREIS_EUR)} Euro sind das ${fmt(BEISPIEL_PROVISION_EUR)} Euro für einen einzigen Abschluss. Es gibt bei uns keine Stufen, die du dir erst verdienen musst, und keine Einstiegsprovision, die kleiner ist als die der anderen. Jeder startet mit demselben Satz.`,
        ],
        felder: [
          { key: "konditionenReaktion", label: "Notiz Reaktion", typ: "notiz", placeholder: "Wie reagiert er oder sie auf die Provision?" },
        ],
      },
      {
        key: "formales",
        titel: "Formales",
        sprechtexte: [
          "Noch ein formaler Punkt, damit du weißt, wie die Zusammenarbeit rechtlich aussieht: Du arbeitest bei uns als freier Handelsvertreter, also selbstständig auf Provisionsbasis und nicht angestellt. Dafür brauchst du ein eigenes Gewerbe, und für die Vermittlung zusätzlich eine Gewerbeerlaubnis nach Paragraf 34c. Falls eines von beidem noch fehlt, ist das kein Hindernis, wir unterstützen dich beim Antrag. Wie sieht es bei dir aus?",
        ],
        felder: [
          {
            key: "bereitschaft34c", label: "Gewerbe und Erlaubnis 34c", typ: "auswahl",
            optionen: [
              { value: "vorhanden", label: "Vorhanden" },
              { value: "beantragt", label: "Beantragt" },
              { value: "wuerde_beantragen", label: "Würde beantragen" },
              { value: "lehnt_ab", label: "Lehnt ab" },
            ],
          },
        ],
      },
    ],
    // Auf der Folie steht nur das Formale (Block "formales"). Die Provision
    // aus dem Block "verdienst" kommt erst in Teil 2 (Folien Zwei Wege und
    // Preis), im Deck-Modus wird sie hier nicht gesprochen. Die Option
    // "Lehnt ab" fehlt bewusst, sie ist ein Bewertungsmerkmal, kein Angebot.
    folie: {
      id: "machbarkeit",
      kopfzeile: "Machbarkeit",
      kicker: "Machbarkeit",
      titel: "Was du formal mitbringst.",
      glanz: "mitbringst",
      karten: [
        { ueber: "Rechtlich", titel: "Freier Handelsvertreter", text: "Selbstständig auf Provisionsbasis, nicht angestellt. Du bestimmst Tempo und Umfang." },
        { ueber: "Voraussetzung 1", titel: "Eigenes Gewerbe", text: "Ein angemeldetes Gewerbe, über das du deine Provisionen abrechnest." },
        { ueber: "Voraussetzung 2", titel: "Erlaubnis nach Paragraf 34c", text: "Die Gewerbeerlaubnis für die Vermittlung von Immobilien." },
      ],
      frage: "Wie sieht es bei dir aus?",
      optionen: ["Vorhanden", "Beantragt", "Würde ich beantragen"],
      satz: "Fehlt davon noch etwas: *kein Hindernis*, wir unterstützen dich beim Antrag.",
    },
  },
  {
    nummer: 8,
    key: "einwaende",
    titel: "Einwandbehandlung",
    kurz: "Einwandbehandlung",
    felder: [
      { key: "einwandNotiz", label: "Notiz", typ: "notiz", placeholder: "Welche Einwände kamen? Wie hat er oder sie reagiert?" },
    ],
    // Letzte Folie von Teil 1 und zugleich die Brücke zu Teil 2. Die
    // Stichworte kommen aus ASSESSMENT_EINWAENDE (erstgespraechFolien.ts).
    // Ob Teil 2 direkt folgt oder später als eigener Termin, entscheidet die
    // HR-Managerin in der Moderation, der Bewerber sieht keine Weiche.
    folie: {
      id: "einwaende",
      kopfzeile: "Deine Fragen",
      kicker: "Einwände sind willkommen",
      titel: "Was willst du jetzt wissen?",
      glanz: "wissen",
      anrede: true,
      satz: "Jede Frage ist erlaubt, und es gibt keine falsche. Deine eigenen Kunden bleiben deine, so viel vorab.",
      ueberleitung: {
        ueber: "Und jetzt",
        satz: "Jetzt zeige ich dir, wie das bei uns konkret aussieht.",
        glanz: "konkret",
        unterzeile: "System. Produkte. Ein echter Deal. Deine Zahlen. Konditionen. Dein Start. Alles schwarz auf weiß.",
      },
    },
  },
  {
    nummer: 9,
    key: "einschaetzung",
    titel: "Einschätzung und Empfehlung",
    kurz: "Einschätzung und Empfehlung",
    felder: [
      { key: "gesamteindruck", label: "Gesamteindruck", typ: "skala" },
      { key: "empfehlungBegruendung", label: "Begründung / Anmerkung", typ: "notiz", placeholder: "Warum diese Einschätzung?" },
    ],
  },
  {
    nummer: 10,
    key: "naechsterSchritt",
    titel: "Nächster Schritt und Verabschiedung",
    kurz: "Nächster Schritt und Verabschiedung",
    sprechtexte: [
      "{vorname}, ich habe einen guten Eindruck von dir. Der nächste Schritt wäre unser persönliches Gespräch. Da gehen wir alles nochmal in der Tiefe und im Detail durch: Wie die Zusammenarbeit bei uns konkret aussieht, wir rechnen mit deinen Zahlen, du siehst wie ein Deal bei uns von der ersten Anfrage bis zur Provision abläuft, und wir sprechen über die nächsten Schritte für dich persönlich.",
      "Damit du weißt, wie es danach weitergeht: Der Vertrag wird erst nach diesem Folgetermin ausgestellt, wenn für uns beide klar ist, dass es passt. Sobald er uns unterschrieben vorliegt, vereinbaren wir deinen Onboarding-Termin. Da schalten wir deine Zugänge frei, richten deine persönliche MOREImmo E-Mail-Adresse ein, und dann kann es losgehen.",
      "Ich buche dich direkt ein. Was passt dir besser, {vorschlagA} oder {vorschlagB}? ... Perfekt, du bekommst die Einladung per Mail. Bereite gern zwei, drei Fragen vor, die dir wichtig sind. Danke für das offene Gespräch, {vorname}, wir sehen uns am {datum}. Bis dahin!",
    ],
  },
];

export function getStation(nummer: number): AssessmentStation {
  return ASSESSMENT_STATIONEN.find((s) => s.nummer === nummer) ?? ASSESSMENT_STATIONEN[0];
}

/** Statischer Kurzüberblick für das Kästchen oben im Tab. */
export const ASSESSMENT_KURZUEBERBLICK = ASSESSMENT_STATIONEN
  .map((s) => `${s.nummer} ${s.kurz}`)
  .join(" · ");

/** Ersetzt {platzhalter} im Sprechtext; unbekannte Platzhalter bleiben als [Name] sichtbar. */
export function fuellePlatzhalter(text: string, werte: Record<string, string | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = werte[key];
    if (v && v.trim() !== "") return v;
    const fallback: Record<string, string> = {
      vorname: "[Vorname]",
      beraterName: "[Dein Name]",
      vorschlagA: "[Vorschlag A]",
      vorschlagB: "[Vorschlag B]",
      datum: "[Datum]",
    };
    return fallback[key] ?? `[${key}]`;
  });
}

// ── Einwandbehandlung (Punkt 8) ──

export type AssessmentEinwand = { id: string; einwand: string; antwort: string };

export const ASSESSMENT_EINWAENDE: AssessmentEinwand[] = [
  {
    // Die haeufigste Kostenfrage im Erstgespraech. Sie ersetzt die frueheren
    // Einwaende "zu teuer" und "nichts investieren": Im Erstgespraech wird
    // bewusst kein Preis genannt, Konditionen gehoeren ins
    // Kooperationsgespraech, siehe Kopfkommentar dieser Datei.
    id: "kosten",
    einwand: "Was kostet mich die Zusammenarbeit mit euch?",
    antwort:
      "Richtig gute Frage, und sie zeigt mir, dass du echtes Interesse hast und schon wissen willst, wie die Zusammenarbeit mit uns im Detail funktioniert. Genau dafür haben wir unser zweites Gespräch, das persönliche Gespräch: Da gehen wir gemeinsam in die Tiefe, rechnen mit deinen Zahlen und du siehst alle Konditionen schwarz auf weiß. Heute geht es mir erst einmal darum, dass wir uns kennenlernen und schauen, ob es grundsätzlich zwischen uns passt.",
  },
  {
    id: "leadpaket",
    einwand: "Was kosten die Leads?",
    antwort:
      "Gute Frage, die gehört ins persönliche Gespräch. Da rechnen wir mit deinen Zahlen und gehen alle Konditionen im Detail durch. Zwei Dinge kann ich dir heute schon sagen: Leads sind bei uns freiwillig, viele starten mit dem eigenen Netzwerk, und der Provisionssatz ist in beiden Fällen derselbe.",
  },
  {
    id: "keineErfahrung",
    einwand: "Ich habe keine Erfahrung in dem Bereich.",
    antwort:
      "Das ist bei uns oft sogar ein Vorteil, weil du dir nichts abgewöhnen musst. Du bekommst die komplette Ausbildung über unsere Academy, einen persönlichen Mentor und ein erprobtes System. Viele unserer erfolgreichsten Partner kommen nicht aus dem Immobilienbereich. Wichtig ist nicht, was du heute kannst, sondern dass du bereit bist zu lernen und dranzubleiben.",
  },
  {
    id: "gehalt",
    einwand: "Ich brauche ein sicheres Gehalt.",
    antwort:
      "Verstehe ich absolut, Sicherheit ist wichtig. Deshalb empfehlen wir auch niemandem, sofort den Hauptjob zu kündigen. Viele unserer Partner starten nebenberuflich, bauen sich Provisionen auf und steigen erst voll ein, wenn die Zahlen passen. So behältst du deine Sicherheit und baust dir trotzdem dein zweites Standbein auf.",
  },
  {
    id: "ueberlegen",
    einwand: "Ich muss das erst überlegen.",
    antwort:
      "Völlig fair, dass du dir das überlegen möchtest. Damit ich dich dabei nicht im Regen stehen lasse: Woran genau machst du deine Entscheidung fest? Ist es das Geld, das Thema Immobilien, die Selbstständigkeit, oder das Gefühl, dass es gerade nicht in dein Leben passt? Wenn ich weiß, woran es liegt, kann ich dir ehrlich sagen, ob es überhaupt Sinn ergibt, weiterzureden.",
  },
  {
    // Die wichtigste Frage für erfahrene Bewerber. Sie stand vorher nirgends
    // im Gespräch, obwohl der Vertrag sie regelt. Wer die Antwort erst beim
    // Lesen des Vertrags findet, unterschreibt nicht mehr.
    id: "eigeneKunden",
    einwand: "Was ist mit den Kunden, die ich selbst mitbringe?",
    antwort:
      "Gute und wichtige Frage, die kläre ich gerne sofort. Die bleiben deine. Wir unterscheiden im Vertrag klar zwischen zwei Sorten Kontakten: Alles, was aus unseren Leads, unserem Marketing oder unserem Bestand kommt, gehört zu MOREImmo. Und alles, was du selbst mitbringst oder ohne unsere Mittel gewinnst, bleibt bei dir, auch wenn wir irgendwann nicht mehr zusammenarbeiten. Du kennzeichnest solche Kontakte im CRM einfach als Eigenkontakt, und was du schon vorher hattest, kannst du uns am Anfang als Liste geben. Solange du sie über uns vermittelst, laufen sie natürlich durch unser System, sonst könnten wir dir keine Provision abrechnen. Aber der Kunde selbst wandert nicht in unseren Besitz.",
  },
  {
    id: "gebiet",
    einwand: "Bekomme ich ein festes Gebiet?",
    antwort:
      "Nein, und das ist bewusst so. Es gibt bei uns keinen Gebietsschutz. Du kannst von überall aus akquirieren und bundesweit Interessenten und Kunden gewinnen, niemand hält dir eine Postleitzahl frei und niemand nimmt dir eine weg. Maßgeblich ist allein, wer einen Kontakt zuerst im CRM erfasst. Das ist für dich der fairere Weg, weil du damit nicht an eine Region gebunden bist, in der du vielleicht gar kein Netzwerk hast.",
  },
  {
    id: "nebenberuflich",
    einwand: "Kann ich das auch nebenberuflich machen?",
    antwort:
      "Grundsätzlich ja. Wie viel Zeit du realistisch brauchst und ob das zu deiner Situation passt, schauen wir uns gemeinsam an. Sag mir einfach, wie deine Woche aussieht, dann sage ich dir ehrlich, ab wann es schwierig wird. Wir empfehlen niemandem, sofort den Hauptjob zu kündigen.",
  },
];

// ── Scoring (Punkt 9) ──

/**
 * Punkteverteilung (maximal 100):
 * - Profil-Einordnung (stärkster gewählter Pfad): max. 30
 * - harte Kriterien: max. 30 (Zeit 16, Gewerbe und 34c 14)
 * - Zielklarheit (1 bis 5): mal 5, max. 25
 * - Gesamteindruck (1 bis 5 Sterne): mal 3, max. 15
 *
 * Die frühere Monatsgebühr wird im Erstgespräch nicht mehr abgefragt, es gibt
 * sie seit dem 07.09.2026 nicht mehr. Ihre bisherigen 8 Punkte sind auf die beiden
 * verbliebenen harten Kriterien verteilt, damit die Skala weiterhin bei 100
 * endet und die Schwellen unverändert gelten.
 *
 * Empfehlung: ab 70 Punkten A (Einladen), ab 45 B (Follow-Up), darunter C (Absage).
 * Harte Regel: zwei oder mehr gerissene Kriterien setzen die Empfehlung immer auf C.
 * HR kann die Empfehlung übersteuern (empfehlungOverride).
 */
export const SCORE_SCHWELLE_A = 70;
export const SCORE_SCHWELLE_B = 45;

const KO_PUNKTE = {
  zeit: { vollzeit: 16, "10_bis_20": 11, unter_10: 0 } as Record<string, number>,
  erlaubnis34c: { vorhanden: 14, beantragt: 14, wuerde_beantragen: 10, lehnt_ab: 0 } as Record<string, number>,
};

export type AssessmentScore = {
  /** Gesamtpunkte 0 bis 100 */
  punkte: number;
  maxPunkte: number;
  /** Labels der gerissenen harten Kriterien */
  koRot: string[];
  /** Automatische Empfehlung (ohne Übersteuerung) */
  empfehlungAuto: AssessmentEmpfehlung;
  /** Wirksame Empfehlung (inkl. HR-Übersteuerung) */
  empfehlung: AssessmentEmpfehlung;
  uebersteuert: boolean;
  /** Kurze Begründungszeile für die Anzeige */
  begruendung: string;
};

export const EMPFEHLUNG_LABELS: Record<AssessmentEmpfehlung, string> = {
  A: "A · Einladen",
  B: "B · Follow-Up",
  C: "C · Absage",
};

/**
 * Beschriftung der Handlungsknöpfe in Punkt 9.
 * Gebucht wird erst in Punkt 10, deshalb steht bei A kein Buchen-Aufruf mehr,
 * sondern nur der Hinweis, wo der Termin vereinbart wird.
 */
export const EMPFEHLUNG_HANDLUNG: Record<AssessmentEmpfehlung, string> = {
  A: "A · Einladen (Termin folgt in Punkt 10)",
  B: "B · Follow-Up-Termin setzen",
  C: "C · Absage",
};

/** Gerissene harte Kriterien ermitteln (Zeit aus Punkt 5, Gewerbe und 34c aus Punkt 7). */
export function ermittleKoRot(a: AssessmentAntworten): string[] {
  const rot: string[] = [];
  if (a.zeitProWoche === "unter_10") rot.push("Unter 10 Std pro Woche");
  if (a.bereitschaft34c === "lehnt_ab") rot.push("Kein Gewerbe, keine 34c-Bereitschaft");
  return rot;
}

export function berechneAssessmentScore(a: AssessmentAntworten): AssessmentScore {
  const pfad = staerksterPfad(a.pfade);
  const pfadPunkte = pfad?.punkte ?? 0;

  const koPunkte =
    (KO_PUNKTE.zeit[a.zeitProWoche ?? ""] ?? 0) +
    (KO_PUNKTE.erlaubnis34c[a.bereitschaft34c ?? ""] ?? 0);

  const zielklarheit = Math.min(5, Math.max(0, a.zielklarheit ?? 0)) * 5;
  const eindruck = Math.min(5, Math.max(0, a.gesamteindruck ?? 0)) * 3;

  const punkte = pfadPunkte + koPunkte + zielklarheit + eindruck;

  const koRot = ermittleKoRot(a);
  let empfehlungAuto: AssessmentEmpfehlung;
  if (koRot.length >= 2) {
    empfehlungAuto = "C";
  } else if (punkte >= SCORE_SCHWELLE_A) {
    empfehlungAuto = "A";
  } else if (punkte >= SCORE_SCHWELLE_B) {
    empfehlungAuto = "B";
  } else {
    empfehlungAuto = "C";
  }

  const override: AssessmentEmpfehlung | null = a.empfehlungOverride ? a.empfehlungOverride : null;
  const empfehlung = override ?? empfehlungAuto;

  const teile: string[] = [];
  if (koRot.length >= 2) {
    teile.push(`${koRot.length} gerissene harte Kriterien: ${koRot.join(", ")}`);
  } else {
    teile.push(`${punkte} von 100 Punkten`);
    if (pfad) teile.push(`Profil ${pfad.label}`);
    if (koRot.length === 1) teile.push(`1 gerissenes hartes Kriterium: ${koRot[0]}`);
  }
  if (override) teile.push(`von HR auf ${override} gesetzt`);

  return {
    punkte,
    maxPunkte: 100,
    koRot,
    empfehlungAuto,
    empfehlung,
    uebersteuert: !!override,
    begruendung: teile.join(" · "),
  };
}
