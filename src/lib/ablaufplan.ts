import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";

/**
 * Der Ablaufplan der Vertriebsakademie: der Gesamtablauf von "Neuer Lead"
 * bis "Provisionszahlung", allgemein zusammengefasst in acht Stationen.
 *
 * Jede Station buendelt eine oder mehrere echte Pipelinestufen aus
 * `PIPELINE_STUFEN`. Die Reihenfolge folgt der realen Pipeline, insbesondere
 * liegen die Bonitaetsunterlagen seit dem 06.08.2026 HINTER der Reservierung
 * (siehe kontaktPipeline.ts) und gehoeren deshalb zur Station Finanzierung.
 *
 * Die Zeitangaben je Termin sind die Vorgaben der Geschaeftsfuehrung fuer
 * diesen Ueberblick. Seite und PDF lesen beide aus diesem Modul, damit die
 * zwei Darstellungen nie auseinanderlaufen.
 */
export interface AblaufStation {
  id: string;
  titel: string;
  /** Zeitnote des Termins, etwa "ca. 15 Min.". Leer bei Stationen ohne Termin. */
  zeit?: string;
  /** Zusatz zur Zeitnote, etwa wer am Termin teilnimmt. */
  zeitZusatz?: string;
  beschreibung: string;
  /** Schluessel der zugeordneten Pipelinestufen aus PIPELINE_STUFEN. */
  stufen: string[];
  /**
   * Das Handwerk im CRM: welche Knoepfe der Partner an dieser Station
   * drueckt und was das System daraufhin von selbst tut.
   *
   * Bewusst je Station und nicht als eigenes Kapitel: Wer beim
   * Beratungsgespraech steht und wissen will, wie er den Termin eintraegt,
   * blaettert nicht in ein Handbuch. Er will es dort, wo er gerade liest.
   *
   * Jeder Satz muss im Code nachweisbar sein. Steht hier etwas, das das
   * System nicht tut, ist der Hinweis schlimmer als gar keiner.
   */
  imCrm?: string[];
}

/**
 * Gilt an jeder Station und steht deshalb einmal ueber dem Plan statt achtmal
 * darin. Die Ampel ist `InactivityAmpel` im Kundenprofil.
 */
export const ABLAUF_ORIENTIERUNG = {
  titel: "Wo du das alles findest",
  saetze: [
    "Fast alles passiert im Kundenprofil. Dorthin kommst du über „Alle Kontakte\" oder die Pipeline, indem du auf den Namen klickst.",
    "Oben im Profil stehen die Reiter: „Stammdaten\", „Dokumente\" und je Vorgang ein eigener Reiter „Investment 1\", „Investment 2\" und so weiter.",
    "Alles, was den Kunden als Person betrifft, steht unter „Stammdaten\". Alles, was zu einem konkreten Objekt gehört, im jeweiligen Investment-Reiter.",
    "Die Schnellaktionen wie „Anruf protokollieren\", „Aufgabe erstellen\" oder „Meeting erstellen\" erreichst du im Profil über die Schaltflächen oben.",
  ],
};

export const ABLAUF_GRUNDREGEL = {
  titel: "Die eine Regel, die über allem steht",
  saetze: [
    "Jeder Lead braucht einen Folgetermin oder eine Folgeaufgabe in der Zukunft. Immer. Ohne Ausnahme.",
    "Neben dem Namen im Kundenprofil steht dafür eine Ampel. Sie zeigt „Termin geplant\", „Aufgabe geplant\" oder „Follow-Up geplant\", sobald etwas in der Zukunft liegt.",
    "Steht dort nichts, liegt der Kunde still. Das sieht auch die Geschäftsleitung. Jede Aufgabe und jedes Meeting, das du anlegst, färbt diese Ampel.",
    "So rutscht niemand durch: Wer keinen nächsten Schritt hat, ist der Kunde, den man verliert.",
  ],
};

export const ABLAUF_STATIONEN: AblaufStation[] = [
  {
    id: "neuer-lead",
    titel: "Neuer Lead",
    beschreibung:
      "Der Lead kommt ins CRM und wird innerhalb von 24 Stunden kontaktiert. Wer nicht erreicht wird, bleibt über die automatische Wiedervorlage und das Follow-Up im Blick.",
    stufen: ["neuer_lead", "nicht_erreicht", "erreicht", "follow_up"],
    imCrm: [
      "Jeden Anruf protokollieren, auch den erfolglosen: im Kundenprofil über die Schaltfläche „Anruf protokollieren\" oben. Dort wählst du das Ergebnis aus, statt es als freie Notiz zu schreiben. Nur so zählt es das System mit.",
      "Der Lead bleibt in der Liste stehen und wird mit dem Zeitpunkt des nächsten Versuchs gekennzeichnet. Die Wartezeit steigt gestaffelt: nach dem ersten Versuch vier Stunden, danach jeweils der nächste Morgen, ab dem fünften Versuch 48 Stunden, ab dem elften 72 Stunden.",
      "Solange noch kein Beratungsgespräch stattgefunden hat, bekommt der Interessent nach dem ersten, vierten und zehnten erfolglosen Versuch eine kurze Mail vom zuständigen Partner, auch wenn jemand anderes angerufen hat: zuerst eine persönliche Vorstellung mit Erstgesprächs-Buchungslink, dann eine kurze Erinnerung, zum Schluss die Frage, ob das Thema geschlossen werden soll. Bei allen anderen Versuchen geht keine Mail.",
      "Kein Lead wird automatisch verloren gegeben. Auf „Verloren\" setzt ihn nur ein Mensch, mit Grund.",
      "Wer ans Telefon geht, gehört sofort auf „Erreicht\" gezogen oder direkt in einen Termin. Diese Stufe setzt das System nicht von selbst.",
    ],
  },
  {
    id: "erstgespraech",
    titel: "Erstgespräch",
    zeit: "ca. 15 bis 30 Min.",
    beschreibung:
      "Kurzer Kennenlern-Check am Telefon: Passt der Kunde, passt das Timing, passt das Konzept? Ziel ist der feste Termin für das Beratungsgespräch.",
    stufen: ["erstgespraech_geplant"],
    imCrm: [
      "Im Normalfall ist das Erstgespräch der Anruf selbst. Du führst es mit dem Erstgesprächsskript unter „Stammdaten\", Ziel ist der feste Termin für das Beratungsgespräch.",
      "Hat der Lead beim Anruf gerade keine Zeit, protokollierst du den Anruf mit dem Ergebnis „Erstgespräch vereinbart\" und trägst Datum und Uhrzeit ein. Deinen Erstgesprächs-Kalender öffnest du direkt aus demselben Fenster.",
      "Wichtig: Den Termin immer eintragen, auch wenn du ihn über den Kalender gebucht hast. Erst dann steht er im System, der Kunde rückt auf „Erstgespräch geplant\" und die Ampel im Profil zeigt „Termin geplant\".",
      "Erreichst du den Lead nicht, geht nach dem ersten, vierten und zehnten Versuch automatisch eine Mail im Namen des zuständigen Partners raus, die erste mit dessen Erstgesprächs-Buchungslink. Ab dem Beratungsgespräch werden diese Mails nie verschickt.",
    ],
  },
  {
    id: "beratungsgespraech",
    titel: "Beratungsgespräch",
    zeit: "ca. 1 Std.",
    beschreibung:
      "Die komplette Beratung mit Strategie, Zahlen und Konzept. Im Anschluss geht die Selbstauskunft zur Unterschrift an den Kunden.",
    stufen: ["beratungsgespraech", "selbstauskunft"],
    imCrm: [
      "Den Termin trägst du über die Karte „Beratungsgespräch vereinbaren\" ein, und zwar im Reiter des jeweiligen Investments, nicht unter „Stammdaten\". Nur so ist er dem richtigen Vorgang zugeordnet, wenn der Kunde mehrere hat. Der Kunde rückt damit automatisch auf die Stufe Beratungsgespräch.",
      "Nach dem Termin setzt du das Ergebnis in derselben Karte: Erschienen, No-Show oder Verschoben. Das ist kein Formalismus, daran hängen die nächsten Schritte.",
      "Bei No-Show erscheint oben im Profil ein Banner mit dem versäumten Termin, damit jeder sofort sieht, woran er ist. Er verschwindet von selbst, sobald du einen neuen Termin eingetragen hast.",
      "Bei No-Show wandert der Kunde auf die Stufe BG NoShow, du bekommst sofort eine Aufgabe und nach 24 und 48 Stunden eine Erinnerung, solange kein neuer Termin steht. Trägst du einen neuen ein, springt er automatisch zurück auf Beratungsgespräch.",
      "Sobald die Selbstauskunft zur Unterschrift beim Kunden liegt, rückt er von selbst auf die Stufe Selbstauskunft. Dafür musst du nichts weiter tun.",
    ],
  },
  {
    id: "objektauswahl",
    titel: "Objektvorstellung und Objektauswahl",
    zeit: "ca. 1 Std.",
    beschreibung:
      "Der Kunde bekommt das passende Objekt vorgestellt und sichert es sich mit der Reservierungsvereinbarung.",
    // "follow_up_objekt" ist die manuelle Follow-Up-Stufe nach der
    // Objektvorstellung und gehoert fachlich zu dieser Station.
    stufen: ["objektauswahl", "follow_up_objekt", "reservierung"],
    imCrm: [
      "Mit der unterschriebenen Selbstauskunft rückt der Kunde automatisch auf Objektauswahl. Ab hier siehst du die passenden Einheiten im Profil.",
      "Überlegt der Kunde nach der Objektvorstellung noch, ziehst du ihn in der Pipeline von Hand in die Spalte „Follow-Up\" und legst eine Aufgabe mit Rückruftermin an. Diese Stufe setzt keine Automatik, sie ist ausdrücklich deine Entscheidung.",
      "Die Reservierungsvereinbarung schickst du im Investment-Reiter über die Karte „Reservierung\". Ab dem Versand rückt der Kunde auf Reservierung, mit der Unterschrift weiter auf Bonitätsunterlagen.",
      "Bleibt die Unterschrift aus, erinnert das System den Kunden nach 2, 5 und 10 Tagen. Nach 14 Tagen bekommst du eine Aufgabe mit hoher Priorität. Der Link läuft dabei nicht ab.",
    ],
  },
  {
    id: "finanzierung",
    titel: "Finanzierung",
    zeit: "ca. 45 Min.",
    zeitZusatz: "zusammen mit der Finanzierungsabteilung",
    beschreibung:
      "Die Bonitätsunterlagen werden eingesammelt und freigegeben, danach findet das Finanzierungsgespräch zusammen mit der Finanzierungsabteilung statt.",
    stufen: ["bonitaetsunterlagen", "finanzierung"],
    imCrm: [
      "Die Bonitätsunterlagen lädst du im Investment-Reiter unter „Bonitätsunterlagen\" hoch und gibst sie dort selbst frei. Das macht immer der zuständige Vertriebspartner. Erst mit der vollständigen Freigabe rückt der Kunde automatisch auf Finanzierung.",
      "Steht eine Reservierung länger als vierzehn Tage ohne freigegebene Bonität, meldet das die Nachtprüfung. Das ist der Preis dafür, dass reserviert wird, bevor die Finanzierbarkeit feststeht.",
    ],
  },
  {
    id: "notar",
    titel: "Notartermin",
    zeit: "ca. 60 bis 90 Min.",
    beschreibung:
      "Der Kaufvertrag wird beim Notar beurkundet. Ab hier ist der Kauf verbindlich.",
    stufen: ["notar"],
    imCrm: [
      "Sobald Datum und Uhrzeit des Notartermins im Investment-Reiter stehen, rückt der Vorgang automatisch auf Notar.",
      "Ist der Termin vorbei, springt er von selbst weiter auf Kaufpreisfälligkeit. Du musst nichts nachziehen.",
    ],
  },
  {
    id: "faelligkeit",
    titel: "Kaufpreisfälligkeit",
    beschreibung:
      "Sobald alle Voraussetzungen erfüllt sind, stellt der Notar die Fälligkeit fest und die Bank zahlt den Kaufpreis aus.",
    stufen: ["faelligkeit"],
    imCrm: [
      "Das Fälligkeitsdatum und der Kaufpreiseingang werden im Investment-Reiter in der Karte „Abwicklung\" gepflegt.",
      "Beides verändert die Stufe bewusst nicht. Sie bleibt auf Kaufpreisfälligkeit, bis die Provisionsrechnung gestellt ist.",
    ],
  },
  {
    id: "provisionszahlung",
    titel: "Provisionszahlung",
    beschreibung:
      "Nach der Kaufpreisfälligkeit wird die Provision abgerechnet und ausgezahlt. Der Vorgang steht auf Abgeschlossen, der Kunde wird Bestandskunde.",
    stufen: ["abrechnung", "abgeschlossen"],
    imCrm: [
      "Mit dem Haken „Provisionsrechnung gestellt\" in der Karte „Abwicklung\" rückt der Vorgang auf Abrechnung.",
      "Mit „Auszahlung bestätigt\" steht er auf Abgeschlossen und der Kunde zählt als Bestandskunde. Ab dort beginnt die Nachbetreuung, siehe Kapitel 9.",
    ],
  },
];

/**
 * Abgestimmte Hausformulierung zur Gesamtdauer. Sie steht genauso in der
 * Closing-Praesentation und im Closing-FAQ und darf hier nicht abweichen.
 */
export const ABLAUF_GESAMTDAUER =
  "Die erste Provision fließt nach Kaufpreisfälligkeit, meist 8 bis 10 Wochen nach dem Erstkontakt mit dem Kunden.";

const STUFEN_LABELS = new Map<string, string>(
  PIPELINE_STUFEN.map((s) => [s.key, s.label]),
);

/** Anzeigename einer Pipelinestufe. Unbekannte Schluessel fallen auf sich selbst zurueck. */
export function ablaufStufenLabel(key: string): string {
  return STUFEN_LABELS.get(key) ?? key;
}
