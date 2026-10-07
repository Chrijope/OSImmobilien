/**
 * Teil 2 des Erstgesprächs: „Closing direkt anschließen".
 *
 * Optionaler Direktweg hinter einem Schalter (Standard AUS): Ist der Bewerber
 * warm und hat Zeit, führt die HR-Managerin das persönliche Gespräch direkt im
 * Anschluss an Punkt 9, statt in Punkt 10 einen Closing-Termin zu buchen.
 *
 * Die Gesprächsabschnitte folgen Folie für Folie der Closing-Präsentation
 * (src/pages/ClosingPraesentationEntwurf.tsx), in derselben Reihenfolge und
 * Dramaturgie. Die Folie „OS Immobilien in Zahlen" fehlt bewusst: Sie erscheint
 * auch in der Präsentation nur mit gepflegten Kennzahlen
 * (closingPraesentationZahlen.ts), und solange dort nichts gepflegt ist,
 * gehört sie auch nicht ins Skript.
 *
 * Ehrlichkeitsregel wie im Drehbuch der Präsentation: keine erfundenen Zahlen,
 * keine Einkommensversprechen. Alle Beträge kommen aus den Konstanten in
 * lizenzPakete.ts und assessmentSkript.ts. Die abgeschaltete
 * Overhead-Provision, die vier Altpakete und der Tippgeber kommen im
 * Direktweg nicht vor (Tippgeber bleibt nur im Reiter Closing wählbar).
 *
 * Datenhaltung: Die reinen Gesprächsnotizen liegen im Meta-JSON unter
 * erstgespraechSkript.closingDirekt (keine Migration nötig). Entscheidung,
 * Paketwahl, Zahlungsweise, Vertragsanschrift, Rechnungsadresse und andere
 * Vertriebe schreibt die Komponente (ClosingDirektTeil.tsx) über
 * updateBewerber in EXAKT dieselben Bewerber-Felder wie der ClosingTab,
 * damit es keine zweite Wahrheit gibt. Der Vertrag selbst wird weiterhin
 * ausschließlich im Reiter Closing erzeugt.
 */

import {
  GESTELLT_ZUSATZ_KURZ,
  LEAD_PAKET_PREIS, LEAD_PAKET_ANZAHL, LEAD_EINZELPREIS,
  WAEHLBARE_LIZENZ_PAKETE, ZAHLUNGSWEISEN, getLizenzPaket, type LizenzPaket,
} from "./lizenzPakete";
import { PROVISION_PROZENT, BEISPIEL_KAUFPREIS_EUR, BEISPIEL_PROVISION_EUR } from "./assessmentSkript";

const fmt = (n: number) => n.toLocaleString("de-DE");

/** Beispielkaufpreis des echten Falls (wie Folie „Ein echter Deal"). */
export const DIREKT_FALL_KAUFPREIS_EUR = 350_000;
/** Vergütung im echten Fall, abgeleitet aus dem einheitlichen Satz. */
export const DIREKT_FALL_PROVISION_EUR = Math.round((DIREKT_FALL_KAUFPREIS_EUR * PROVISION_PROZENT) / 100);
/** Jahresrechnung bei einem Abschluss pro Monat zum Beispielkaufpreis aus Punkt 7. */
export const DIREKT_JAHR_PROVISION_EUR = BEISPIEL_PROVISION_EUR * 12;

/**
 * Pakete, die im Direktweg zur Wahl stehen: die wählbaren Pakete ohne den
 * Tippgeber. Der Tippgeber ist kein Vertriebsstart und bleibt bewusst dem
 * Reiter Closing vorbehalten.
 */
export const DIREKT_PAKETE: LizenzPaket[] = WAEHLBARE_LIZENZ_PAKETE.filter((p) => !p.istTippgeber);

/**
 * Buchungslink für den Folge-Call bei Geschäftsführung. In dem
 * Termin wird abgestimmt, ob ein Partner Leads GESTELLT bekommt, ohne dafür
 * zu zahlen. Der Leadkauf selbst braucht keinen Call, er steht jedem Partner
 * offen. Eine Quelle für alle Stellen: den Lead-Paket-Kasten im ClosingTab
 * und die Einblendungen in Teil 2 des Erstgesprächs. Der Wert ist der bisher
 * im ClosingTab hinterlegte Link. (Der Konstantenname bleibt aus
 * Kompatibilitätsgründen, der ClosingTab importiert ihn.)
 */
export const LEAD_QUALIFIZIERUNG_BUCHUNGSLINK =
  "https://calendly.com/office-more/vertriebspartnerschaft-more-immo";

// ── Gespeicherte Daten (Meta-JSON in erstgespraechSkript.closingDirekt) ──

/** Reine Gesprächsnotizen des Teil 2, je Abschnitt. */
export type ClosingDirektNotizen = {
  /** Einstieg: Reaktion auf den Vorschlag, direkt weiterzumachen */
  einstiegReaktion?: string;
  /** Einzelkämpfer: was er oder sie davon selbst kennt */
  chaosNotiz?: string;
  /** Vision: was gezündet hat */
  visionNotiz?: string;
  /** Werte: welcher Wert angesprochen hat */
  werteNotiz?: string;
  /** System: welche Bausteine besonders interessieren */
  systemNotiz?: string;
  /** Produkte und Standorte: Rückfragen */
  produkteNotiz?: string;
  /** Deal-Prozess: Rückfragen und Sicherheit */
  dealNotiz?: string;
  /** Partnerstimmen: welche Geschichte gepasst hat */
  stimmenNotiz?: string;
  /** Echter Fall: Reaktion auf die Zahl */
  fallNotiz?: string;
  /** Rechner: seine Annahme Abschlüsse pro Monat */
  rechnerAbschluesse?: string;
  /**
   * Veraltet: Der Kaufpreis wird nicht mehr abgefragt, er richtet sich beim
   * echten Deal nach der Bonität des Kunden. Der Schlüssel bleibt nur, damit
   * bereits erfasste Antworten lesbar bleiben.
   */
  rechnerKaufpreis?: string;
  /** Rechner: seine Rechnung und sein Zieleinkommen in seinen Worten */
  rechnerNotiz?: string;
  /** Zwei Wege: Leads, eigenes Netzwerk oder beides */
  wegeNotiz?: string;
  /** Preis: Reaktion auf die Konditionen und den Leadkanal */
  preisReaktion?: string;
  /** Erwartungen: seine Ziele in seinen Worten */
  erwartungenZiele?: string;
  /** Erwartungen: passt es auf beiden Seiten? */
  erwartungenNotiz?: string;
  /** Start: offene Punkte (Gewerbe, 34c, Zeitplan) */
  startNotiz?: string;
  /** Gesprächsabschluss: Stimmung und Absprachen am Ende */
  abschlussNotiz?: string;
};

export type ClosingDirektDaten = {
  /** Der Schalter. Fehlt er oder ist er false, ändert sich am Gespräch NICHTS. */
  aktiv?: boolean;
  /** Keys der abgehakten Abschnitte */
  abgehakt?: string[];
  notizen?: ClosingDirektNotizen;
  /**
   * Die Weiche im Startfahrplan-Abschnitt: "direkt" = will sofort starten,
   * weiter zur Entscheidung. "unterlagen" = möchte überlegen und bittet um
   * Unterlagen, dann Startfahrplan senden und Follow-up vereinbaren.
   */
  startWeiche?: "" | "direkt" | "unterlagen";
  /** Wurde der Folge-Call zu gestellten Leads eingeblendet/angeboten? */
  qualiCallAngeboten?: boolean;
};

/** Ist der Direktweg eingeschaltet? Standard ist AUS. */
export function istClosingDirektAktiv(d: ClosingDirektDaten | undefined | null): boolean {
  return d?.aktiv === true;
}

/**
 * Ist das Closing im Direktweg erledigt? Dann wird Punkt 10 (Termin buchen)
 * durch den Hinweis auf den Reiter Closing ersetzt.
 */
export function istClosingDirektErledigt(
  closingEntscheidung: string | undefined,
  paketwahl: string | undefined,
): boolean {
  return closingEntscheidung === "ja" && !!(paketwahl ?? "").trim();
}

/**
 * Wurde Teil 2 komplett durchlaufen? Maßgeblich für die Wahl der
 * Startfahrplan-Fassung (startfahrplanVersand.ts): Nur nach einem kompletten
 * Teil 2 geht die erweiterte Fassung raus, die das ganze Gespräch nachzeichnet.
 *
 * Komplett heißt eines von dreien, jeweils bei eingeschaltetem Direktweg:
 *   1. Die Entscheidung ist gefallen (Ja plus Paket, istClosingDirektErledigt).
 *   2. Die Startfahrplan-Weiche steht auf "unterlagen". Sie sitzt am Ende der
 *      Inhaltsstrecke; wer sie setzt, hat die Präsentation durchgesprochen,
 *      auch wenn noch keine Entscheidung erfasst ist. Genau dieser Versand
 *      verspricht im Sprechtext "da steht alles drin, was wir heute
 *      besprochen haben".
 *   3. Alle Abschnitte sind abgehakt, als förmlicher Nachweis ohne die
 *      beiden Abkürzungen oben.
 */
export function istClosingDirektKomplett(
  d: ClosingDirektDaten | undefined | null,
  closingEntscheidung: string | undefined,
  paketwahl: string | undefined,
): boolean {
  if (!istClosingDirektAktiv(d)) return false;
  if (istClosingDirektErledigt(closingEntscheidung, paketwahl)) return true;
  if (d?.startWeiche === "unterlagen") return true;
  const abgehakt = new Set(d?.abgehakt ?? []);
  return CLOSING_DIREKT_ABSCHNITTE.every((a) => abgehakt.has(a.key));
}

/**
 * Status-Sprung des Direktwegs: Bei Entscheidung Ja plus gewähltem Paket
 * springt der Bewerber direkt auf die Stufe Paketwahl, der Closing-Schritt
 * wird übersprungen. Dieselbe Zielstufe wie im ClosingTab (dort: Closing zu
 * Paketwahl); hier zusätzlich aus Eingang und Erstgespräch heraus, denn genau
 * das ist der Direktweg. Liefert den Zielstatus oder null, wenn nichts zu tun
 * ist (fremde Stufen werden nie angefasst).
 */
export function closingDirektStatusSprung(
  status: string,
  closingEntscheidung: string | undefined,
  paketwahl: string | undefined,
): "Paketwahl" | null {
  if (!istClosingDirektErledigt(closingEntscheidung, paketwahl)) return null;
  if (status === "Eingang" || status === "Erstgespraech" || status === "Closing") return "Paketwahl";
  return null;
}

// ── Die Gesprächsabschnitte (Folie für Folie) ──

export type ClosingDirektFeld = {
  key: keyof ClosingDirektNotizen;
  label: string;
  typ: "notiz" | "text";
  placeholder?: string;
};

/**
 * Abschluss-Variante je nach Ausgang des Gesprächs. Die Komponente zeigt die
 * passende Variante (siehe passendeAbschlussVarianten), sonst alle.
 * "unterlagen" ist der Weg über die Startfahrplan-Weiche: Zusammenfassung
 * kommt per Mail, fester Rückruftermin als Follow-up.
 */
export type ClosingDirektVariante = {
  key: "ja" | "bedenkzeit" | "nein" | "unterlagen";
  titel: string;
  sprechtext: string;
};

/**
 * Wählt die anzuzeigenden Abschluss-Varianten: Eine erfasste Entscheidung hat
 * Vorrang, danach zählt die Unterlagen-Weiche, ohne beides bleiben alle
 * Varianten sichtbar.
 */
export function passendeAbschlussVarianten(
  varianten: ClosingDirektVariante[],
  closingEntscheidung: string | undefined,
  startWeiche: string | undefined,
): ClosingDirektVariante[] {
  if (closingEntscheidung) return varianten.filter((v) => v.key === closingEntscheidung);
  if (startWeiche === "unterlagen") return varianten.filter((v) => v.key === "unterlagen");
  return varianten;
}

/**
 * Zielstatus für das Follow-up der Unterlagen-Weiche. Dieselbe Regel wie die
 * FollowUpCard im Bewerbungsmanagement: Aus späteren Stufen (Paketwahl und
 * folgende) sowie aus abgelehnten Zuständen wird nicht mehr gewechselt.
 */
export function followUpStatusZiel(status: string): "FollowUp" | null {
  const nichtWechseln = [
    "FollowUp", "Paketwahl", "Vertrag", "Rechnung", "Nutzer_anlegen", "Aktiv",
    "Abgelehnt", "KeinInteresse",
  ];
  return nichtWechseln.includes(status) ? null : "FollowUp";
}

/** Einwand samt souveräner Antwort, gleicher Stil wie Punkt 8 in Teil 1. */
export type ClosingDirektEinwand = {
  einwand: string;
  antwort: string;
};

export type ClosingDirektAbschnitt = {
  /** Interner Schlüssel, auch für die Abhak-Liste */
  key: string;
  /** id der zugehörigen Folie in ClosingPraesentationEntwurf.tsx */
  folieId: string;
  /** Titel der Folie, zur Orientierung im Skript */
  folieTitel: string;
  /** Titel des Gesprächsabschnitts */
  titel: string;
  /** Ausformulierte Sprechtexte, wörtliche Rede mit Du-Ansprache */
  sprechtexte: string[];
  /** Abschluss-Varianten je Entscheidung (nur der letzte Abschnitt) */
  varianten?: ClosingDirektVariante[];
  /** Regieanweisung für die HR-Managerin, kein Sprechtext */
  hinweis?: string;
  /** Passende Einwandbehandlungen, aufklappbar wie in Punkt 8 von Teil 1 */
  einwaende?: ClosingDirektEinwand[];
  /** Kontextbezogene Notizfelder (Meta-JSON) */
  felder?: ClosingDirektFeld[];
  /**
   * Zusätzlicher Spezialblock der Komponente:
   * - "paketwahl": Paketkarten (Vertriebspartner, Lead-Berater) plus Zahlungsweise
   *   und die Einblendung des Folge-Calls zu gestellten Leads
   * - "startWeiche": Will direkt starten oder bittet um Unterlagen
   *   (Startfahrplan-Versand plus Follow-up)
   * - "entscheidung": Ja / Nein / Bedenkzeit plus Schlussfelder (Adressen, andere Vertriebe)
   * - "gespraechsabschluss": Varianten-Anzeige, Hinweis auf den Reiter Closing
   *   und die zweite Einblendung des Folge-Calls
   */
  spezial?: "paketwahl" | "startWeiche" | "entscheidung" | "gespraechsabschluss";
};

export const CLOSING_DIREKT_ABSCHNITTE: ClosingDirektAbschnitt[] = [
  {
    key: "einstieg",
    folieId: "cover",
    folieTitel: "Persönliches Gespräch",
    titel: "Der Direktvorschlag",
    sprechtexte: [
      "{vorname}, eigentlich wäre jetzt der Punkt, an dem wir einen zweiten Termin ausmachen. Ich sage dir aber ehrlich: Das Gespräch mit dir hat mich überzeugt, und ich merke, dass du gerade voll im Thema bist. Wenn du noch etwa 30 Minuten Zeit hast, gehen wir jetzt alles im Detail und in der Tiefe miteinander durch, und am Ende des Gesprächs sehen wir gemeinsam, wie die Reise bei uns weitergeht. Passt das für dich?",
      "Sehr gut. Dann legen wir los: Du siehst, wie eine Zusammenarbeit mit OS Immobilien konkret aussieht, wir rechnen mit deinen Zahlen, und am Ende sprechen wir offen darüber, ob wir gemeinsam starten.",
    ],
    hinweis:
      "Regie: Den Direktweg nur anbieten, wenn der Bewerber wirklich Zeit hat und warm ist. Wirkt er gehetzt oder zögerlich, lieber wie gewohnt über Punkt 10 den Closing-Termin buchen. Ein gutes zweites Gespräch schlägt ein gehetztes erstes.",
    felder: [
      { key: "einstiegReaktion", label: "Reaktion auf den Direktvorschlag", typ: "notiz", placeholder: "Hat er oder sie Zeit? Wie ist die Energie?" },
    ],
  },
  {
    key: "einzelkaempfer",
    folieId: "chaos",
    folieTitel: "Chaos gegen System",
    titel: "Was Einzelkämpfer wirklich erwartet",
    sprechtexte: [
      "Bevor wir über uns reden, lass uns kurz ehrlich auf den Markt schauen. Die meisten, die im Immobilienvertrieb alleine starten, verkaufen nicht. Sie verwalten Probleme: ständig neue Objekte suchen, jeden Bauträger einzeln prüfen, Wirtschaftlichkeitsberechnungen bauen, Finanzierungen organisieren, Unterlagen einsammeln, Notartermine koordinieren, und nebenbei noch CRM, Marketing und Leads komplett selbst aufbauen. Jeder Deal ist ein Einzelkampf.",
      "Und genau daran scheitern die meisten, nicht am Verkaufen. Der Engpass ist fast nie der Vertrieb, der Engpass ist die Infrastruktur dahinter. Wer die alleine aufbauen will, verliert Monate, oft Jahre, bevor der erste Euro fließt. Hand aufs Herz: Wie viel davon willst du wirklich selbst stemmen?",
    ],
    felder: [
      { key: "chaosNotiz", label: "Was davon kennt er oder sie selbst?", typ: "notiz", placeholder: "Eigene Erfahrungen mit dem Einzelkampf, Schmerzpunkte ..." },
    ],
  },
  {
    key: "vision",
    folieId: "vision",
    folieTitel: "Du machst Vertrieb, wir den Rest",
    titel: "Das Gegenbild",
    sprechtexte: [
      "Jetzt dreh das Bild einmal um. Stell dir vor, du machst nur noch die drei Dinge, für die es dich wirklich braucht: Du gewinnst Kunden. Du berätst. Du schließt ab. Alles andere baut OS Immobilien um dich herum, also Produkte, Finanzierung, Technologie, Marketing, Backoffice und Vertriebs-Know-how. Das heißt für dich: Du musst keine eigene Firma mit fünfzehn verschiedenen Dienstleistern hochziehen. Du steigst in ein laufendes System ein und fängst dort an, wo andere erst nach Jahren ankommen.",
    ],
    felder: [
      { key: "visionNotiz", label: "Reaktion auf das Bild", typ: "notiz", placeholder: "Was hat gezündet? Welche Rückfragen kamen?" },
    ],
  },
  {
    key: "werte",
    folieId: "werte",
    folieTitel: "Wofür wir stehen",
    titel: "Mission und Werte",
    sprechtexte: [
      "Damit du weißt, mit wem du es zu tun hast: Wir wollen Immobilieninvestment einfacher, transparenter und erfolgreicher machen. Dahinter stehen fünf Werte, die wir im Alltag wirklich leben. Performance: Wir wollen Ergebnisse und messen Termine, Beratungen und Abschlüsse. Verantwortung: Wir behandeln Kundengeld wie unser eigenes und verkaufen keine Immobilie, nur weil sie verfügbar ist. Transparenz: Der Kunde sieht echte Kosten, Cashflows und Annahmen. Partnerschaft: Wir unterstützen dich beim Deal, statt dir nur ein Exposé zu schicken. Und Fortschritt: Immobilienvertrieb muss nicht funktionieren wie vor zwanzig Jahren. Genau daran wirst du uns später messen können.",
    ],
    felder: [
      { key: "werteNotiz", label: "Welcher Wert hat angesprochen?", typ: "notiz", placeholder: "Woran ist er oder sie hängen geblieben?" },
    ],
  },
  {
    key: "system",
    folieId: "system",
    folieTitel: "Das OS Immobilien System",
    titel: "Das System im Detail",
    sprechtexte: [
      "Konkret bekommst du von uns ein komplettes System an die Hand: ein CRM für Kunden, Leads, Pipeline und Follow-ups. Investagon, um Investmentcases professionell zu berechnen und zu präsentieren. Zugang zu ausgewählten Kapitalanlageimmobilien. Finanzierungspartner und passende Banklösungen. Ein Backoffice, das dich bei Dokumenten, Reservierung, Finanzierung und Notar unterstützt. Fertige Vertriebsunterlagen, also Präsentationen, Exposés und Kalkulationen. Trainings für Produkt, Finanzierung und Sales. Und eine Community, die dich bei konkreten Kundenfällen unterstützt. Wir kennen den Verkaufsprozess, nicht nur das Objekt. Was davon ist für dich am wichtigsten?",
    ],
    felder: [
      { key: "systemNotiz", label: "Welche Bausteine interessieren besonders?", typ: "notiz", placeholder: "CRM, Leads, Backoffice, Training ..." },
    ],
  },
  {
    key: "produkte",
    folieId: "objekte-standorte",
    folieTitel: "Produkte und Standorte",
    titel: "Echte Objekte an starken Standorten",
    sprechtexte: [
      "Zu den Produkten: Wir sind stark auf Bayern fokussiert, also München und Umland, Augsburg und Nürnberg, dazu ausgewählte Objekte deutschlandweit und immer wieder Offmarket-Objekte außerhalb der Portale. Drei Objekttypen decken wir ab: sanierten Bestand, meist mit erhöhtem Restnutzungsdauer-Gutachten und Erhaltungsaufwand, also echter steuerlicher Substanz. Energieeffizienten Neubau im KfW-40-QNG-Standard mit KfW-Kredit. Und WG- und Co-Living-Konzepte für Kunden mit stärkerem Renditefokus. Ganz wichtig dabei: Nicht das Produkt steht zuerst, der Kunde steht zuerst. Aus seinen Zielen ergibt sich die Strategie, und daraus das passende Objekt.",
    ],
    felder: [
      { key: "produkteNotiz", label: "Rückfragen zu Objekten und Standorten", typ: "notiz", placeholder: "Regionale Nähe, Objekttypen, eigene Kontakte ..." },
    ],
  },
  {
    key: "dealprozess",
    folieId: "dealprozess",
    folieTitel: "Vom Kunden zur Provision",
    titel: "Der Deal-Prozess",
    sprechtexte: [
      "Damit du siehst, wie ein Deal bei uns wirklich läuft, gehe ich die acht Stationen einmal mit dir durch. Ein Lead kommt rein. Du qualifizierst ihn: Einkommen, Steuerklasse, Eigenkapital, Bonität und Ziel. Daraus entsteht die Strategie: Finanzierung, Cashflow, Steuerwirkung, Rendite. Dann zeigst du das passende Objekt als Investmentcase. Die Finanzierung wird gesichert, es folgt das Closing, dann der Notartermin, und am Ende steht deine Provision. Du führst den Kunden, das System trägt die Abwicklung. Kannst du dir vorstellen, diesen Weg mit einem Kunden zu gehen?",
    ],
    felder: [
      { key: "dealNotiz", label: "Rückfragen zum Prozess", typ: "notiz", placeholder: "Wo fühlt er oder sie sich sicher, wo nicht?" },
    ],
  },
  {
    key: "partnerstimmen",
    folieId: "partnerstimmen",
    folieTitel: "Partnerstimmen",
    titel: "Die, die schon losgelegt haben",
    sprechtexte: [
      "Und du wärst damit nicht der Erste. Wir haben Partner, die genau vor deiner Entscheidung standen: Leute aus der Finanzdienstleistung, Quereinsteiger aus dem Außendienst, erfahrene Banker. Was sie gemeinsam haben: Sie haben sich entschieden, mit System zu arbeiten statt alleine. Und bei einigen kamen die ersten Abschlüsse schon in den ersten Monaten. Ich erzähle dir gern von ein, zwei konkreten Beispielen, die zu deinem Profil passen.",
    ],
    hinweis:
      "Regie: Nur die echten Partnerstimmen aus der Closing-Präsentation verwenden und die Geschichte wählen, die zum Profil des Bewerbers passt. Keine Namen, Zahlen oder Erfolge erfinden, erfundener sozialer Beweis zerstört die Glaubwürdigkeit an ihrer empfindlichsten Stelle.",
    felder: [
      { key: "stimmenNotiz", label: "Welche Geschichte hat gepasst?", typ: "notiz", placeholder: "Reaktion, Identifikation, Zweifel ..." },
    ],
  },
  {
    key: "echterFall",
    folieId: "echter-fall",
    folieTitel: "Ein echter Deal",
    titel: "Ein echter Fall, echte Zahlen",
    sprechtexte: [
      `Jetzt rechnen wir, denn am Ende muss sich das für dich lohnen. Ein typischer Fall aus unserem Alltag: Ein Kunde mit 4.500 Euro netto im Monat will Vermögen aufbauen und Steuern optimieren. Er kauft eine Wohnung für ${fmt(DIREKT_FALL_KAUFPREIS_EUR)} Euro, voll finanziert. Deine Vergütung bei unseren ${PROVISION_PROZENT} Prozent: ${fmt(DIREKT_FALL_PROVISION_EUR)} Euro. Für einen einzigen Abschluss. Ein Kunde, ein Objekt, ein Abschluss, so läuft ein Deal bei uns.`,
    ],
    hinweis:
      "Regie: Immer dazu sagen, dass das eine Beispielrechnung ist, abhängig von Provisionsbasis und Dealstruktur, vor Kosten und Steuern. Kein Einkommensversprechen, das verbietet unser Drehbuch ausdrücklich.",
    felder: [
      { key: "fallNotiz", label: "Reaktion auf die Zahl", typ: "notiz", placeholder: "Überrascht, skeptisch, motiviert?" },
    ],
  },
  {
    key: "rechner",
    folieId: "rechner",
    folieTitel: "Deine Zahlen",
    titel: "Seine Zahlen und der Preis des Wartens",
    sprechtexte: [
      `Und jetzt machen wir dieselbe Rechnung mit deinen Zahlen. Du hast mir vorhin dein Einkommensziel genannt. Rechnen wir rückwärts: Wie viele Abschlüsse im Monat traust du dir realistisch zu? ... Zur Einordnung: Im ersten Jahr sind ein bis zwei Abschlüsse im Monat ein realistisches Ziel. Den Kaufpreis legen wir dabei bewusst nicht fest, denn der richtet sich beim echten Deal immer nach der Bonität deines Kunden und danach, in welcher Höhe er finanzierbar ist. Für unsere Rechnung nehmen wir deshalb einen Beispielwert von ${fmt(BEISPIEL_KAUFPREIS_EUR)} Euro.`,
      `Schon ein einziger Abschluss im Monat bei diesem Beispielwert von ${fmt(BEISPIEL_KAUFPREIS_EUR)} Euro sind ${fmt(BEISPIEL_PROVISION_EUR)} Euro Vergütung, aufs Jahr gerechnet ${fmt(DIREKT_JAHR_PROVISION_EUR)} Euro, vor Kosten und Steuern. Und jetzt der Gedanke, den ich dir mitgeben will: Jeder Monat, den du wartest, ist ein Monat, in dem diese Rechnung für dich bei null steht. Die Kunden und die Objekte warten nicht auf deinen Startzeitpunkt, die kauft in der Zwischenzeit jemand anderes.`,
    ],
    hinweis:
      "Regie: Nur nach dem Abschlusstempo fragen, nicht nach dem Kaufpreis. Der Kaufpreis richtet sich beim echten Deal nach der Bonität des Kunden, gerechnet wird mit dem festen Beispielwert. Auch hier gilt: Beispielrechnung, kein Einkommensversprechen.",
    einwaende: [
      {
        einwand: "Was ist, wenn ich in den ersten Monaten keinen Abschluss mache?",
        antwort:
          "Ehrliche Antwort: Das kann am Anfang passieren, der Anlauf dauert erfahrungsgemäß zwei bis drei Monate, und niemand bei uns verspricht dir ein Einkommen. Genau deshalb bekommst du von Tag eins das komplette System, die Trainings und Ansprechpartner für deine ersten Kundenfälle, damit dein erster Abschluss nicht vom Zufall abhängt, sondern von deiner Aktivität. Was du reinsteckst, bestimmt das Tempo.",
      },
    ],
    felder: [
      { key: "rechnerAbschluesse", label: "Seine Annahme: Abschlüsse pro Monat", typ: "text", placeholder: "z. B. 1 bis 2" },
      { key: "rechnerNotiz", label: "Seine Rechnung in seinen Worten", typ: "notiz", placeholder: "Zieleinkommen, wie er oder sie selbst rechnet ..." },
    ],
  },
  {
    key: "zweiWege",
    folieId: "zwei-wege",
    folieTitel: "Zwei Wege, ein Satz",
    titel: "Zwei Wege, ein System",
    sprechtexte: [
      `Zum Verdienstmodell selbst: Es gibt zwei Wege und ein System dahinter. Der erste Weg sind eigene Kunden aus deinem Netzwerk, damit startet der Großteil unserer Partner. Der zweite Weg ist die Arbeit mit Leads aus unserem Marketingsystem: Wenn du schneller ins Tun kommen willst, kannst du dir jederzeit qualifizierte Leads dazukaufen, die Zahlen dazu zeige ich dir gleich beim Preis. Das Entscheidende für dich: Bei uns gilt für beide Wege derselbe Satz, ${PROVISION_PROZENT} Prozent auf jeden Abschluss. Keine Stufen bei der Provision, keine kleinere Einstiegsprovision, jeder Partner startet mit demselben Satz. Wie sieht es bei dir aus: Wie stark ist dein eigenes Netzwerk, und ist die Arbeit mit Leads etwas für dich?`,
    ],
    hinweis:
      "Regie: Die Zahlen zum Leadkauf kommen erst im Preis-Abschnitt, hier reicht der Überblick. Und merk dir deinen Eindruck: Macht der Bewerber einen richtig starken Eindruck, kannst du im Preis-Abschnitt den Folge-Call bei Geschäftsführer Christian einblenden, in dem abgestimmt wird, ob er Leads gestellt bekommt, ohne dafür zu zahlen.",
    felder: [
      { key: "wegeNotiz", label: "Sein Weg: Netzwerk, Leads oder beides", typ: "notiz", placeholder: "Netzwerk, Interesse am Leadkauf ..." },
    ],
  },
  {
    key: "preis",
    folieId: "preis",
    folieTitel: "Was es kostet",
    titel: "Was es kostet und welches Paket passt",
    sprechtexte: [
      "Jetzt zur Frage, die du dir wahrscheinlich schon die ganze Zeit stellst: Was kostet dich das? Vorweg, was es nicht ist: Wir sind kein Strukturvertrieb ohne Produkt. Deine Vergütung kommt aus echten Immobilienabschlüssen mit echten Kunden, nicht aus dem Anwerben neuer Partner.",
      `Konkret, und das ist die wichtigste Zahl: Für alles, was du zum Arbeiten brauchst, zahlst du nichts. Das CRM, die Objektzugänge, Exposés, Preislisten, Skripte und alle Pflichtschulungen stellen wir dir kostenlos, dauerhaft. Das ist keine Aktion, das steht so im Vertrag.`,
      `Und es geht noch weiter: Auch ${GESTELLT_ZUSATZ_KURZ} stellen wir dir, ohne eigenen Vertrag und ohne Monatsgebühr. Es gibt bei uns kein laufendes Entgelt, keinen Einmalbetrag und keine Mindestlaufzeit. Der Handelsvertretervertrag läuft auf unbestimmte Zeit mit den gesetzlichen Kündigungsfristen. Was du bei uns bezahlst, ist genau eine Sache, und die ist freiwillig: Leads.`,
      `Und dann gibt es noch die Arbeit mit Leads, als optionalen Beschleuniger für deinen Start: Jeder Partner kann bei uns Leads kaufen, ${fmt(LEAD_PAKET_PREIS)} Euro netto für ${LEAD_PAKET_ANZAHL} qualifizierte Leads, jederzeit erneut buchbar, einzelne Leads für ${fmt(LEAD_EINZELPREIS)} Euro pro Stück, und der Betrag geht eins zu eins ins Werbebudget. Ein Muss ist das nicht, dein eigenes Netzwerk reicht völlig für den Start. Aber wenn du von Anfang an mehr Gespräche führen willst, steht dir dieser Kanal jederzeit offen.`,
    ],
    hinweis:
      "Regie: Der Leadkauf steht jedem Partner offen, dafür braucht es keinen Call und keine Freigabe. Etwas anderes sind gestellte Leads: Macht der Bewerber einen richtig starken Eindruck (reine Ermessenssache), kannst du unten den Folge-Call bei Geschäftsführer Christian einblenden und direkt buchen lassen. In dem Termin wird abgestimmt, ob der Partner Leads gestellt bekommt, ohne dafür zu zahlen. Das Paket Lead-Berater nur dort anbieten, wo es vorgesehen ist: Dort werden Leads zur Unterstützung gestellt, nach Verfügbarkeit und ohne Anspruch auf eine bestimmte Menge, ein Leadpaket-Kauf ist dann nicht vorgesehen. Nichts versprechen, was nicht im Vertrag steht.",
    einwaende: [
      {
        einwand: "Wo ist der Haken? Andere Vertriebe verlangen eine Systemgebühr, ihr nicht.",
        antwort:
          "Es gibt keinen. Für das, was du zum Arbeiten brauchst, verlangen wir nichts, und das steht "
          + "so im Vertrag: CRM, Objektzugang, Exposés, Preislisten, Skripte, Pflichtschulungen. Dazu "
          + "Training über die Pflichtmodule hinaus, deine eigene Landingpage, Marketing- und "
          + "Verkaufsunterlagen für deine Akquisition, Coaching, Community und Support mit fester "
          + "Reaktionszeit. Das müsstest du dir sonst selbst zusammenkaufen und über Monate aufbauen. "
          + "Wir verdienen nicht an einer Gebühr, wir verdienen mit dir am Abschluss. Deshalb haben wir "
          + "das größte Interesse daran, dass du schnell abschließt.",
      },
      {
        einwand: "Gibt es eine Laufzeit oder eine Mindestbindung?",
        antwort:
          "Nein. Der Handelsvertretervertrag hat keine Mindestlaufzeit, da gelten die gesetzlichen Kündigungsfristen: im ersten Jahr ein Monat zum Monatsende. Es gibt auch keine Gebühr, an die eine Laufzeit hängen könnte. Wir setzen trotzdem bewusst auf langfristige Partnerschaften, denn es dauert etwa drei bis dreieinhalb Monate, bis das ganze Rad ins Rollen kommt, also bis Training, erste Kundenfälle, Finanzierung und Notar einmal komplett durchlaufen sind. Du bekommst von uns ab Tag eins die komplette Infrastruktur gestellt, und der Erfolg unserer Partner ist unser gesamter Erfolg. Genau darum unterstützen wir dich in jedem Bereich, so gut es geht, damit deine ersten Erfolgserlebnisse schnell kommen.",
      },
    ],
    felder: [
      { key: "preisReaktion", label: "Reaktion auf Konditionen und Leadkanal", typ: "notiz", placeholder: "Einwände, Zustimmung, Rückfragen ..." },
    ],
    spezial: "paketwahl",
  },
  {
    key: "erwartungen",
    folieId: "selbstcheck",
    folieTitel: "Passt das zu dir?",
    titel: "Erwartungen auf Augenhöhe",
    sprechtexte: [
      "Bevor wir zur Entscheidung kommen, einmal Klartext auf Augenhöhe, denn die Zusammenarbeit trägt nur, wenn beide Seiten liefern. Was wir von dir erwarten: Du betreibst den Vertrieb ernsthaft, nebenberuflich oder im besten Fall hauptberuflich. Du gewinnst aktiv Kunden und wartest nicht auf Zuteilung. Du arbeitest mit unseren Prozessen und im CRM. Und du übernimmst Verantwortung für deine Ergebnisse. Was du dafür von uns bekommst: System, Produktzugang und Finanzierungspartner ab Tag eins. Backoffice und Support für Abwicklung und Papierkram. Trainings und Begleitung für deine Beratung. Und klare Vergütungssätze, schriftlich im Vertrag.",
      "Und genauso ehrlich: OS Immobilien passt nicht zu dir, wenn du ein passives Einkommen ohne Arbeit suchst, wenn du erwartest, dass Leads automatisch zu Abschlüssen werden, oder wenn du nur kurz etwas ausprobieren willst. Deshalb meine Frage an dich, in deinen Worten: Was willst du hier für dich erreichen?",
    ],
    felder: [
      { key: "erwartungenZiele", label: "Seine Ziele in seinen Worten", typ: "notiz", placeholder: "Wörtlich mitschreiben, das ist der Stoff für den Abschluss ..." },
      { key: "erwartungenNotiz", label: "Passt es auf beiden Seiten?", typ: "notiz", placeholder: "Dein Eindruck: liefert er oder sie, was wir erwarten?" },
    ],
  },
  {
    key: "start",
    folieId: "start",
    folieTitel: "Dein Start",
    titel: "Der Startfahrplan",
    sprechtexte: [
      "Und damit du genau weißt, wie es weitergeht, hier dein Startfahrplan: Im Anschluss an unser Gespräch senden wir dir noch einmal eine Zusammenfassung von allem, was wir gemeinsam besprochen haben. Und sobald du startest, sieht dein Weg so aus: Der Vertrag kommt digital zur Unterschrift. An Tag eins folgt dein Onboarding. In der ersten Woche bekommst du Systemzugang, CRM und Investagon, deine eigene OS Immobilien E-Mail-Adresse, deine persönliche Erfolgsstrategie mit Zielplanung und das Produkt- und Beratungstraining. In Woche zwei arbeitest du an den ersten Kundenfällen, und danach läuft der Prozess: Beratung, Objekt, Finanzierung, Notar. Du weißt also genau, was nach deiner Unterschrift passiert. Zwei Dinge brauchst du formal, das hatten wir vorhin schon: dein eigenes Gewerbe und die Erlaubnis nach Paragraf 34c. Falls davon noch etwas fehlt, ist das kein Hindernis, wir unterstützen dich beim Antrag.",
    ],
    hinweis:
      "Regie: Spür hier hin, wie heiß der Bewerber ist, und wähle unten die Weiche. Will er direkt starten, geh ohne Umweg weiter zur Entscheidung, ein Versand ist dann nicht nötig. Möchte er es sich überlegen und bittet um Unterlagen, versende den Startfahrplan und vereinbare sofort ein Follow-up mit festem Datum und fester Uhrzeit, an dem du anrufst und nach der Entscheidung fragst.",
    einwaende: [
      {
        einwand: "Schaffe ich das überhaupt neben meinem Hauptjob?",
        antwort:
          "Ehrlich: Es braucht verlässliche Zeit, aber keinen Kündigungsbrief. Die meisten unserer Partner starten nebenberuflich, legen sich feste Blöcke in der Woche für Kundengespräche zurecht und wachsen aus den ersten Abschlüssen heraus. Wir empfehlen niemandem, sofort den Hauptjob zu kündigen. Wichtig ist nur, dass deine geplanten Stunden pro Woche wirklich stattfinden, dann trägt das System den Rest der Abwicklung.",
      },
    ],
    felder: [
      { key: "startNotiz", label: "Offene Punkte zum Start", typ: "notiz", placeholder: "Gewerbe, 34c, Zeitplan, Nebenberuf ..." },
    ],
    spezial: "startWeiche",
  },
  {
    key: "entscheidung",
    folieId: "abschluss",
    folieTitel: "Dein nächster Schritt",
    titel: "Die Entscheidung",
    sprechtexte: [
      "{vorname}, du hast jetzt alles gesehen, was du für eine Entscheidung brauchst: das System, die Produkte, den Prozess, deine Zahlen und die Konditionen. Ich sage dir offen: Ich kann mir die Zusammenarbeit mit dir gut vorstellen, sonst hätte ich dir dieses Gespräch nicht direkt angeboten. Und genauso offen: Wir führen viele dieser Gespräche und arbeiten am Ende bewusst nur mit wenigen zusammen. Deshalb frage ich dich ganz direkt: Lass es uns gemeinsam machen. Bist du dabei?",
      "Wenn du dabei bist, nehmen wir jetzt zusammen deine Daten für den Vertrag auf, und du bekommst ihn im Anschluss digital zur Unterschrift. Und noch etwas, das dir wichtig sein dürfte: Was du hier aufbaust, gehört dir. Deine eigenen Kunden bleiben deine, auch wenn wir irgendwann nicht mehr zusammenarbeiten sollten.",
    ],
    hinweis:
      "Regie: Bei Bedenkzeit nicht ins Leere laufen lassen. Frage, woran genau die Entscheidung hängt, und vereinbare sofort einen festen Rückruftermin. Eine Bedenkzeit ohne Termin ist ein verlorener Bewerber. Bei einem Nein wertschätzend bleiben und die Absage über Punkt 9 abwickeln.",
    einwaende: [
      {
        einwand: "Ich bin noch bei einem anderen Vertrieb. Geht das überhaupt?",
        antwort:
          "Danke, dass du das offen ansprichst, genau so soll es sein, denn das ist überhaupt kein Problem, das halten wir einfach transparent fest. Sobald wir gleich deine Daten aufnehmen, schalten wir direkt hier den Regler von der exklusiven Zusammenarbeit um und tragen die Vertriebe ein, für die du aktuell tätig bist. Dein Vertrag bekommt dann die Individualfassung, in der genau das sauber geregelt ist. Entscheidend ist volle Transparenz von Anfang an.",
      },
    ],
    spezial: "entscheidung",
  },
  {
    // Die Beendigung des Gesprächs gehört mit ins Skript: Der Bewerber soll
    // mit einem klaren Bild auflegen, was als Nächstes passiert. Fachlich
    // gehört der Moment noch zur Abschluss-Folie (dort ist es der
    // Willkommensmoment nach dem Handschlag), deshalb dieselbe folieId.
    key: "gespraechsabschluss",
    folieId: "abschluss",
    folieTitel: "Dein nächster Schritt (Willkommensmoment)",
    titel: "Der Gesprächsabschluss",
    sprechtexte: [],
    varianten: [
      {
        key: "ja",
        titel: "Bei Ja: Vertrag kommt per Mail",
        sprechtext:
          "Dann machen wir es fest, {vorname}. Willkommen bei OS Immobilien, ich freue mich wirklich auf die Zusammenarbeit mit dir. So geht es jetzt weiter: Ich erstelle im Nachgang deinen Vertrag mit genau den Konditionen, die wir gerade besprochen haben, und sende ihn dir per Mail zu. Du schaust in Ruhe drüber und unterschreibst digital, da drängt dich niemand. Sobald uns deine Unterschrift vorliegt, melden wir uns wegen deines Onboarding-Termins, und dann starten wir gemeinsam deinen Startfahrplan: Zugänge, deine OS Immobilien E-Mail-Adresse, deine Erfolgsstrategie und dein erstes Training. Wenn dir beim Lesen des Vertrags eine Frage kommt, ruf mich einfach an. Danke dir für das offene Gespräch, wir lesen und hören uns!",
      },
      {
        key: "unterlagen",
        titel: "Bei Unterlagen-Wunsch: Zusammenfassung kommt, fester Rückruf steht",
        sprechtext:
          "Dann machen wir es so, {vorname}: Du bekommst von mir im Anschluss deinen Startfahrplan als Zusammenfassung per Mail, da steht alles drin, was wir heute besprochen haben. Schau es dir in Ruhe an und besprich es mit den Menschen, die dir wichtig sind. Und damit du nicht mit offenen Fragen sitzen bleibst, haben wir unseren Telefontermin fest vereinbart: Da rufe ich dich an, du sagst mir, wie du dich entschieden hast, und wenn es ein Ja ist, machen wir direkt alles Weitere fertig. Danke dir für das offene Gespräch, wir hören uns zum vereinbarten Termin!",
      },
      {
        key: "bedenkzeit",
        titel: "Bei Bedenkzeit: fester Rückruf",
        sprechtext:
          "Alles gut, {vorname}, eine Entscheidung dieser Größe darf sacken. Wichtig ist mir nur, dass wir sauber im Gespräch bleiben: Wir haben unseren Rückruftermin fest vereinbart, da melde ich mich bei dir und wir klären genau die Punkte, an denen deine Entscheidung hängt. Bis dahin bekommst du von mir nichts aufgedrängt. Schreib dir gern auf, was dir durch den Kopf geht, dann steigen wir beim Telefonat genau da wieder ein. Danke dir für das offene Gespräch, wir hören uns zum vereinbarten Termin!",
      },
      {
        key: "nein",
        titel: "Bei Nein: wertschätzende Verabschiedung",
        sprechtext:
          "Danke für deine klare und ehrliche Antwort, {vorname}, das schätze ich sehr, denn eine Zusammenarbeit ergibt nur Sinn, wenn beide Seiten voll dahinterstehen. Ich habe dich als angenehmen Gesprächspartner erlebt, und wenn sich deine Situation irgendwann ändert, darfst du dich jederzeit wieder bei uns melden. Ich wünsche dir für deinen Weg alles Gute, danke für deine Zeit!",
      },
    ],
    hinweis:
      "Regie: Die passende Variante sprechen, je nachdem wie das Gespräch ausgegangen ist. Bei Ja gilt: Der Vertrag wird im Reiter Closing erzeugt und von dort versendet, nichts davon passiert noch im Gespräch. Nur zusagen, was auch so abläuft. Macht der Bewerber einen richtig starken Eindruck (reine Ermessenssache), kannst du hier zusätzlich den Folge-Call bei Christian einblenden und direkt buchen lassen: Dort wird abgestimmt, ob er Leads gestellt bekommt, ohne dafür zu zahlen.",
    felder: [
      { key: "abschlussNotiz", label: "Notiz zum Gesprächsabschluss", typ: "notiz", placeholder: "Stimmung am Ende, letzte Absprachen, offene Fragen ..." },
    ],
    spezial: "gespraechsabschluss",
  },
];

export function getClosingDirektAbschnitt(key: string): ClosingDirektAbschnitt | null {
  return CLOSING_DIREKT_ABSCHNITTE.find((a) => a.key === key) ?? null;
}

// ── Teil-2-Daten für die KI-Zusammenfassung ──

/** Die Bewerber-Felder, in die Teil 2 seine Ergebnisse schreibt (siehe Kopfkommentar). */
export type ClosingDirektErgebnisFelder = {
  closingEntscheidung?: string;
  paketwahl?: string;
  zahlungsweise?: string;
  andereVertriebe?: string;
};

const ENTSCHEIDUNG_TEXTE: Record<string, string> = {
  ja: "Ja, will starten",
  nein: "Nein",
  bedenkzeit: "Bedenkzeit, fester Rückruftermin vereinbart",
};

const START_WEICHE_TEXTE: Record<string, string> = {
  direkt: "Will direkt starten",
  unterlagen: "Möchte überlegen und bittet um Unterlagen (Startfahrplan per Mail plus Follow-up)",
};

/**
 * Baut die Teil-2-Daten für die KI-Zusammenfassung des Erstgesprächs: nur was
 * wirklich erfasst wurde (abgehakte Abschnitte, gefüllte Notizen, gesetzte
 * Entscheidungen), mit den sprechenden Labels des Skripts statt der internen
 * Schlüssel. Leere Abschnitte tauchen bewusst nicht auf, damit sie den
 * KI-Prompt nicht verwässern.
 */
export function baueClosingDirektKiDaten(
  d: ClosingDirektDaten,
  ergebnis: ClosingDirektErgebnisFelder,
): Record<string, unknown> {
  const abgehakt = new Set(d.abgehakt ?? []);
  const notizen = d.notizen ?? {};

  const abschnitte = CLOSING_DIREKT_ABSCHNITTE
    .map((a) => {
      const abschnittNotizen: Record<string, string> = {};
      for (const f of a.felder ?? []) {
        const wert = (notizen[f.key] ?? "").trim();
        if (wert) abschnittNotizen[f.label] = wert;
      }
      return {
        titel: a.titel,
        besprochen: abgehakt.has(a.key),
        ...(Object.keys(abschnittNotizen).length > 0 ? { notizen: abschnittNotizen } : {}),
      };
    })
    .filter((a) => a.besprochen || "notizen" in a);

  // Der veraltete Kaufpreis-Schlüssel hängt an keinem Feld mehr, Bestandsdaten
  // sollen aber weiter in die Zusammenfassung einfließen.
  const altKaufpreis = (notizen.rechnerKaufpreis ?? "").trim();

  const weiche = START_WEICHE_TEXTE[d.startWeiche ?? ""];
  const entscheidung = ENTSCHEIDUNG_TEXTE[ergebnis.closingEntscheidung ?? ""];
  const paket = getLizenzPaket(ergebnis.paketwahl);
  const zahlungsweise = ZAHLUNGSWEISEN.find((z) => z.id === ergebnis.zahlungsweise)?.label;

  return {
    ...(abschnitte.length > 0 ? { abschnitte } : {}),
    ...(altKaufpreis ? { rechnerKaufpreisAltesSkript: altKaufpreis } : {}),
    ...(weiche ? { startfahrplanWeiche: weiche } : {}),
    ...(entscheidung ? { entscheidung } : {}),
    ...(paket ? { paketwahl: paket.titel } : {}),
    ...(zahlungsweise ? { zahlungsweise } : {}),
    ...((ergebnis.andereVertriebe ?? "").trim()
      ? { andereVertriebe: (ergebnis.andereVertriebe ?? "").trim() }
      : {}),
    ...(d.qualiCallAngeboten ? { folgeCallGestellteLeadsAngeboten: true } : {}),
  };
}
