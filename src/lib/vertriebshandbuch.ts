/**
 * Das Vertriebshandbuch: der Kundenabwicklungsprozess von Anfang bis Ende.
 *
 * Warum es diese Datei gibt: Ein Vertriebspartner sieht im CRM immer nur den
 * Ausschnitt, in dem er gerade steht. Was davor und danach passiert, wer wann
 * eine Meldung bekommt und ab wann etwas eskaliert, stand bisher nirgends
 * zusammen. Genau diese Transparenz soll das Handbuch herstellen.
 *
 * **Jede Angabe hier ist aus dem laufenden System belegt**, nicht aus der
 * Erinnerung geschrieben. Wo eine Zahl steht, steht die Fundstelle dabei.
 * Wer etwas am Prozess aendert, aendert es hier mit, sonst erzaehlt das
 * Handbuch bald eine andere Geschichte als das System.
 *
 * Der Text ist für Vertriebspartner geschrieben, nicht für Entwickler.
 * Keine Kundennamen, keine echten Zahlen aus dem Bestand.
 */

import leadKontaktAnlegen from "@/assets/handbuch/lead-kontakt-anlegen.png";

export interface HandbuchTabelle {
  kopf: string[];
  zeilen: string[][];
}

/**
 * Eine nummerierte Markierung auf einem Bildschirmfoto.
 *
 * `x` und `y` sind Prozentwerte, gemessen von der linken oberen Ecke des
 * Bildes. Prozent statt Pixel, damit die Markierung mitwandert, wenn das Bild
 * kleiner dargestellt wird.
 */
export interface HandbuchMarkierung {
  nr: number;
  x: number;
  y: number;
  text: string;
}

/**
 * Ein Bildschirmfoto aus dem laufenden System.
 *
 * Die Bilder werden aus der echten Oberfläche aufgenommen, nicht gemalt, und
 * sie zeigen nie Kundendaten. Deshalb sind es leere Formulare und Dialoge und
 * keine gefüllten Listen.
 */
export interface HandbuchBild {
  /** Fertig importiertes Bild, damit der Build den Pfad prüft. */
  bild: string;
  alt: string;
  bildunterschrift?: string;
  markierungen?: HandbuchMarkierung[];
}

export interface HandbuchBlock {
  /** Eindeutig im ganzen Handbuch, dient als Sprungmarke. */
  id: string;
  titel: string;
  /**
   * Die Frage, die dieser Block beantwortet, in der Sprache der Partner.
   * Die Suche gewichtet sie hoeher als den Fliesstext, damit "wann bekomme
   * ich eine Glocke" den richtigen Block findet und nicht die zwanzig
   * Stellen, an denen das Wort Glocke sonst noch vorkommt.
   */
  frage?: string;
  absaetze: string[];
  liste?: string[];
  tabelle?: HandbuchTabelle;
  /** Bildschirmfotos, die den Ablauf zeigen. Stehen unter dem Text. */
  bilder?: HandbuchBild[];
  /** Ein Satz, der besonders leicht schiefgeht. */
  achtung?: string;
  /**
   * Woher die Angabe stammt.
   *
   * **Wird dem Leser nicht angezeigt.** Christian hat das am 11.09.2026
   * gestrichen: Ein Vertriebspartner will wissen, wie der Prozess laeuft, und
   * nicht, in welcher Datei das steht. Die Angabe bleibt hier trotzdem
   * stehen, denn wer den Text spaeter pflegt, muss nachsehen koennen, woran
   * eine Zahl haengt. Sie ist Pflegewissen, keine Anzeige.
   */
  quelle?: string;
  /** Zusaetzliche Suchbegriffe, die im Text selbst nicht vorkommen. */
  schlagworte?: string[];
}

/** Ein Sprungknopf: die Stelle im CRM, an der dieser Abschnitt gelebt wird. */
export interface HandbuchZiel {
  label: string;
  /** Eine Adresse im CRM. Es gibt einen Test, der prueft, dass es sie gibt. */
  url: string;
}

export interface HandbuchAbschnitt {
  id: string;
  titel: string;
  /** Ein Satz unter der Ueberschrift in der Seitenleiste. */
  kurz: string;
  /**
   * Die Stellen im CRM, an denen dieser Abschnitt stattfindet.
   *
   * Bewusst Sprungknoepfe statt Bildschirmfotos. Ein Bild von heute zeigt
   * morgen etwas anderes, ein Knopf fuehrt immer dorthin, wo es wirklich
   * passiert. Entscheidung Christians vom 11.09.2026.
   */
  ziele?: HandbuchZiel[];
  bloecke: HandbuchBlock[];
}

/**
 * Die Kette der Stufen fuer das Ablaufbild oben auf der Seite.
 *
 * `automatik` sagt, was den Uebergang in die **naechste** Stufe ausloest, wenn
 * er von allein geschieht. Steht dort nichts, zieht ein Mensch die Stufe
 * weiter.
 */
export interface ProzessStufe {
  /** Die Beschriftung im Bild. */
  titel: string;
  /** Der Abschnitt, zu dem ein Klick springt. */
  abschnitt: string;
  /** Was den Uebergang zur naechsten Stufe von allein ausloest. */
  automatik?: string;
}

export const PROZESS_KETTE: ProzessStufe[] = [
  { titel: "Lead", abschnitt: "lead", automatik: "Erster Anruf protokolliert" },
  { titel: "Kontakt und Termin", abschnitt: "lead" },
  { titel: "Erstgespräch", abschnitt: "gespraeche" },
  { titel: "Beratungsgespräch", abschnitt: "gespraeche" },
  { titel: "Selbstauskunft", abschnitt: "selbstauskunft", automatik: "Kunde unterschreibt" },
  { titel: "Objektauswahl", abschnitt: "objekt", automatik: "Reservierung erstellt" },
  { titel: "Reservierung", abschnitt: "reservierung", automatik: "Kunde unterschreibt die PDF" },
  { titel: "Bonitätsunterlagen", abschnitt: "bonitaet", automatik: "Alle Unterlagen freigegeben" },
  { titel: "Finanzierung", abschnitt: "finanzierung", automatik: "Notartermin gesetzt" },
  { titel: "Notar", abschnitt: "notar" },
  { titel: "Fälligkeit", abschnitt: "notar" },
  { titel: "Abrechnung", abschnitt: "notar" },
  { titel: "Abgeschlossen", abschnitt: "notar" },
];

export const HANDBUCH_STAND = "11.09.2026";

export const VERTRIEBSHANDBUCH: HandbuchAbschnitt[] = [
  {
    id: "ueberblick",
    titel: "Der Weg im Überblick",
    kurz: "Alle Stufen von der Anlage bis zum Abschluss",
    ziele: [{ label: "Zur Pipeline", url: "/pipeline" }],
    bloecke: [
      {
        id: "ueberblick-kette",
        titel: "Die Kette, an der alles hängt",
        frage: "Wie läuft der Prozess von Anfang bis Ende ab?",
        absaetze: [
          "Ein Kunde durchläuft im CRM eine feste Folge von Stufen. Die Stufe ist nicht nur eine Anzeige: An ihr hängen die Erinnerungen, die Eskalationen, die Farbe der Ampel und das, was der Kunde in seinem Portal sieht. Wer die Stufe kennt, weiss, was als Nächstes passiert und wer gerade am Zug ist.",
          "Die tragende Kette lautet: Neuer Lead, Kontaktversuche, Erreicht, Erstgespräch, Beratungsgespräch, Selbstauskunft, Objektauswahl, Reservierung, Bonitätsunterlagen, Finanzierung, Notar, Fälligkeit, Abrechnung, Abgeschlossen. Daneben stehen Sonderzustände wie Nicht erreicht, Follow-Up, die beiden NoShow-Stufen, Verloren und Archiviert.",
          "Zwei Dinge daran werden oft falsch erinnert. Erstens: Die Bonitätsunterlagen liegen **hinter** der Reservierung, nicht davor. Zweitens: Kaufpreis, Objekt und Abwicklungsstand hängen am **Investment**, nicht am Kontakt. Ein Kunde kann mehrere Investments haben, jedes mit eigenem Objekt, eigenem Preis und eigener Stufe.",
        ],
        quelle: "src/lib/pipelineStufen.ts, src/lib/kontaktPipeline.ts",
        schlagworte: ["pipeline", "stufen", "ablauf", "prozess", "uebersicht", "reihenfolge"],
      },
      {
        id: "ueberblick-automatik",
        titel: "Was von allein weiterrückt",
        frage: "Muss ich die Stufe von Hand weiterziehen?",
        absaetze: [
          "An vielen Stellen rückt der Vorgang von selbst weiter, sobald das auslösende Ereignis eintritt. Du musst dort nichts ziehen, und du solltest es auch nicht: Ziehst du von Hand vor, stimmt die Stufe nicht mehr mit dem überein, was tatsächlich vorliegt, und die Erinnerungen laufen auf den falschen Stand.",
        ],
        tabelle: {
          kopf: ["Ereignis", "Neue Stufe"],
          zeilen: [
            ["Erster Anruf protokolliert", "Kontaktversuche"],
            ["Selbstauskunft unterschrieben", "Objektauswahl"],
            ["Reservierungsvereinbarung erstellt", "Reservierung"],
            ["Reservierung vom Kunden unterschrieben", "Bonitätsunterlagen"],
            ["Alle Bonitätsunterlagen freigegeben", "Finanzierung"],
            ["Notartermin mit Datum und Uhrzeit gesetzt", "Notar"],
          ],
        },
        achtung: "Follow-Up nach der Objektvorstellung setzt nur ein Mensch. Keine Automatik bewegt einen Kunden dorthin, und zurück nach Objektauswahl zieht ihn ebenfalls keine.",
        quelle: "Automatik in KundenDetail, Regeln in src/lib/pipelineStufen.ts",
        schlagworte: ["automatisch", "auto-advance", "weiterruecken", "stufenwechsel"],
      },
    ],
  },
  {
    id: "lead",
    titel: "1. Der Lead kommt herein",
    kurz: "Zuweisung, eigener Kontakt, CSV-Import",
    ziele: [{ label: "Zur Leadverwaltung", url: "/lead-verwaltung" }, { label: "Zu meinen Leads", url: "/meine-leads" }, { label: "Zu allen Kontakten", url: "/alle-kontakte" }],
    bloecke: [
      {
        id: "lead-wege",
        titel: "Drei Wege in das System",
        frage: "Wie kommt ein Kunde ins CRM?",
        absaetze: [
          "**Zugewiesener Lead.** Die Gesellschaft weist einen Lead nach den vereinbarten Voraussetzungen einem Partner zu. Der Lead landet in deiner Leadverwaltung, du bekommst eine Meldung, und die Uhr läuft ab diesem Moment.",
          "**Eigener Kontakt.** Du legst den Kunden selbst an. Das ist der Weg für Empfehlungen, eigene Netzwerke und alles, was nicht aus der Gesellschaft kommt.",
          "**CSV-Import.** Mehrere Kontakte auf einmal, über den Import in der Leadverwaltung. Gedacht für bestehende Listen, nicht für den Alltag.",
          "Der Unterschied ist nicht nur organisatorisch: Ob ein Kontakt ein Eigenkontakt oder ein Gesellschaftskontakt ist, entscheidet später über die Provision und darüber, wem der Kontakt gehört. Eigenkontakte sind die, die du selbst angelegt oder per CSV eingespielt hast.",
        ],
        bilder: [
          {
            bild: leadKontaktAnlegen,
            alt: "Dialog Neuen Kontakt anlegen mit den Pflichtfeldern",
            bildunterschrift: "Kontakte, oben rechts auf Kontakt anlegen klicken. So sieht der Dialog aus.",
            markierungen: [
              { nr: 1, x: 18, y: 18, text: "Anrede, Vorname, Nachname. Die Anrede steuert später die Anrede in jeder Mail." },
              { nr: 2, x: 26, y: 30, text: "E-Mail und Telefon sind Pflicht. Ohne E-Mail lassen sich Selbstauskunft und Portal nicht versenden." },
              { nr: 3, x: 26, y: 43, text: "Quelle wählen. Sie entscheidet mit darüber, ob der Kontakt als Eigenkontakt zählt." },
              { nr: 4, x: 8, y: 91, text: "Anlegen. Der Kontakt startet auf der Stufe Neuer Lead." },
            ],
          },
        ],
        quelle: "Leadverwaltung, Vertriebspartner-Vertrag",
        schlagworte: ["lead", "zuweisung", "csv", "import", "eigenkontakt", "anlegen", "neuer kunde"],
      },
      {
        id: "lead-speed",
        titel: "Die ersten Minuten entscheiden",
        frage: "Wie schnell muss ich einen neuen Lead anrufen?",
        absaetze: [
          "Ein zugewiesener Lead soll innerhalb von fünf Minuten angerufen werden. Das ist keine Floskel, sondern der Grund, warum die Stufe **Zugewiesen** schon nach einem Tag orange und nach drei Tagen rot wird.",
          "Sobald du den ersten Anruf protokollierst, rückt der Lead automatisch auf **Kontaktversuche**. Das passiert nur bei Anruf und Anrufprotokoll, nicht bei einer Notiz.",
        ],
        quelle: "src/lib/inactivityThresholds.ts, Schnellaktionen im Kundenprofil",
        schlagworte: ["speed to lead", "fuenf minuten", "erster anruf", "zugewiesen"],
      },
      {
        id: "lead-nicht-erreicht",
        titel: "Wenn niemand abnimmt",
        frage: "Was passiert, wenn ich den Lead nicht erreiche?",
        absaetze: [
          "Jeder erfolglose Versuch gehört über den Gesprächsausgang **Nicht erreicht** dokumentiert. Der Kontakt verschwindet danach für eine festgelegte Wartezeit aus der Liste und taucht von selbst wieder auf. Die Wartezeit wächst mit jedem Versuch, bis zu 72 Stunden.",
          "Das ist kein Verstecken, sondern eine Staffel: Dreimal hintereinander zur selben Stunde anzurufen bringt nichts, und ein Lead, der dauernd oben steht, blockiert den Blick auf die anderen.",
          "Nach dem ersten, vierten und zehnten erfolglosen Versuch bekommt der Lead automatisch eine kurze Mail vom zuständigen Partner, auch wenn jemand anderes angerufen hat: zuerst eine persönliche Vorstellung mit Terminlink, dann eine kurze Erinnerung, zum Schluss die ehrliche Frage, ob das Thema geschlossen werden soll. Antworten landen beim Partner. Wechselt der Partner, beginnt die Folge für den neuen Partner von vorn.",
          "In der Stufe **Nicht erreicht** wird es nach einem Tag orange, nach drei Tagen rot, und nach zehn Tagen ist es keine Erinnerung mehr, sondern eine Entscheidung: weiterführen, verlieren oder archivieren.",
        ],
        quelle: "src/lib/kontaktversuchSchedule.ts, src/lib/nichtErreichtMails.ts, supabase/functions/_shared/pipeline-schwellen.ts",
        schlagworte: ["nicht erreicht", "wartezeit", "gespraechsausgang", "wiedervorlage", "mail an den lead"],
      },
    ],
  },
  {
    id: "gespraeche",
    titel: "2. Erst- und Beratungsgespräch",
    kurz: "Skript, Präsentation, Überleitung",
    ziele: [{ label: "Zur Beratungspräsentation", url: "/praesentation" }, { label: "Zur Vertriebsakademie", url: "/vertriebsakademie" }],
    bloecke: [
      {
        id: "gespraeche-skript",
        titel: "Das Erstgesprächsskript",
        frage: "Welche Hilfe bekomme ich für das Erstgespräch?",
        absaetze: [
          "Für das Erstgespräch steht ein Skript bereit. Es führt durch die Qualifizierung und endet mit dem Termin für das Beratungsgespräch. Das Skript ist eine Empfehlung, keine Pflicht, aber es hat einen praktischen Nebeneffekt: Was du darin erfasst, steht später im Profil und muss nicht zweimal getippt werden.",
          "Nach dem Termin gehört das Ergebnis eingetragen: erschienen, verschoben oder No-Show. Ein No-Show setzt die Stufe auf **EG NoShow**, und dort wird es schon nach einem Tag orange.",
        ],
        quelle: "Erstgespraechsskript im Kundenprofil",
        schlagworte: ["erstgespraech", "skript", "leitfaden", "qualifizierung", "noshow"],
      },
      {
        id: "gespraeche-praesentation",
        titel: "Die Beratungspräsentation und die Überleitung",
        frage: "Wie komme ich vom Beratungsgespräch in die Selbstauskunft?",
        absaetze: [
          "Für das Beratungsgespräch gibt es die Beratungspräsentation im CRM. Sie führt durch das Konzept und **endet bewusst mit der Überleitung in die Selbstauskunft**. Das ist der Kern der Empfehlung: Die Selbstauskunft wird nicht nachgereicht, sondern im selben Gespräch begonnen, solange der Kunde noch im Thema ist.",
          "Wir empfehlen ausdrücklich, mit den Präsentationen und den Daten aus dem CRM zu arbeiten statt mit eigenen Unterlagen. Nicht aus Prinzip, sondern weil alles, was im System entsteht, später automatisch weiterläuft: in die Objektauswahl, in die Bankprüfung, in das Kundenportal.",
        ],
        quelle: "Beratungspraesentation im Kundenprofil",
        schlagworte: ["beratungsgespraech", "praesentation", "ueberleitung", "selbstauskunft"],
      },
    ],
  },
  {
    id: "selbstauskunft",
    titel: "3. Die Selbstauskunft",
    kurz: "Drei Wege, zwei Erinnerungen, eine Aufgabe",
    ziele: [{ label: "Zu allen Kontakten", url: "/alle-kontakte" }],
    bloecke: [
      {
        id: "sa-wege",
        titel: "Drei Wege, in dieser Reihenfolge",
        frage: "Wie fülle ich die Selbstauskunft aus?",
        absaetze: [
          "**Gemeinsam im Gespräch.** Der beste Weg. Du gehst sie mit dem Kunden durch und er unterschreibt digital.",
          "**An den Kunden senden.** Er bekommt einen Link und füllt sie in Ruhe selbst aus. Das ist der Weg, wenn der Termin endet, bevor alle Zahlen beisammen sind.",
          "**Als PDF.** Nur wenn die ersten beiden Wege nicht funktionieren. Das PDF muss danach wieder ins System, sonst rechnet niemand damit.",
          "Die Selbstauskunft ist die Grundlage für alles Weitere: Aus ihr ergeben sich der Investitionsrahmen, die Bonitätsklasse und vor allem die Liste der Unterlagen, die die Bank später sehen will. Ohne sie steht diese Liste nicht fest.",
        ],
        achtung: "Die Selbstauskunft gehört zum Investment, nicht zum Kunden. Ein zweites Investment bekommt eine eigene. Es wird nichts aus einem früheren Kauf übernommen, ohne dass es sichtbar gekennzeichnet ist.",
        quelle: "Selbstauskunft im Kundenprofil, src/lib/bankpruefungListe.ts",
        schlagworte: ["selbstauskunft", "sa", "pdf", "unterschrift", "bonitaetsklasse"],
      },
      {
        id: "sa-erinnerungen",
        titel: "Was passiert, wenn der Kunde nicht ausfüllt",
        frage: "Wird der Kunde an die Selbstauskunft erinnert?",
        absaetze: [
          "Ja, zweimal, und danach bist du dran. Der Takt beginnt mit dem Versand der Einladung.",
        ],
        tabelle: {
          kopf: ["Wann", "Was passiert", "An wen"],
          zeilen: [
            ["Sofort", "Einladung mit Ausfüll-Link", "Kunde, E-Mail"],
            ["Tag 4", "Erste Erinnerung, freundlich", "Kunde, E-Mail"],
            ["Tag 10", "Zweite Erinnerung, mit Hilfsangebot", "Kunde, E-Mail"],
            ["Tag 14", "Aufgabe: bitte persönlich nachfragen", "Zuständiger Partner"],
          ],
        },
        achtung: "Sobald der Kunde unterschreibt, verfallen alle noch offenen Erinnerungen. Niemand bekommt eine Mahnung für etwas, das er längst erledigt hat.",
        quelle: "supabase/functions/send-sa-invitation/index.ts",
        schlagworte: ["erinnerung", "mahnung", "sa reminder", "tag 4", "tag 10", "tag 14"],
      },
    ],
  },
  {
    id: "objekt",
    titel: "4. Objektauswahl und Vorstellung",
    kurz: "Das Objekt im Investment eintragen",
    ziele: [{ label: "Zu allen Kontakten", url: "/alle-kontakte" }],
    bloecke: [
      {
        id: "objekt-auswahl",
        titel: "Objekt im Investment eintragen",
        frage: "Wie kommt das Objekt zum Kunden?",
        absaetze: [
          "Über das Kundenprofil, einen anderen Weg gibt es nicht. Du öffnest den Kunden, gehst in sein **Investment** und dort in die **Objektauswahl**. Mit **Objekt eintragen** öffnet sich ein Dialog, du bleibst dabei im Investment.",
          "Im Dialog trägst du Adresse, Wohneinheit und Kaufpreis ein, dazu die Kennzahlen wie Wohnfläche, Zimmer, Etage, Kaltmiete und Hausgeld sowie die Angaben zum Verkäufer. Die Angaben gelten für genau dieses Investment. Der Kunde sieht sie in seinem Portal, und der Kaufpreis fließt in die Pipeline. Steht der Vorgang noch davor, rückt er mit dem Speichern auf **Objektauswahl**.",
          "Danach geht es mit der **Reservierung** weiter. Die Reservierungsvereinbarung übernimmt, was du hier eingetragen hast.",
          "Den Objektbereich mit Objektliste, Objektanlage und Einheitenspiegel pflegt vorerst nur die Verwaltung. Du brauchst ihn für deinen Ablauf nicht.",
        ],
        quelle: "Objektauswahl im Investment, src/components/kunden/ObjektDatenDialog.tsx",
        schlagworte: ["objekt", "objekt eintragen", "objektauswahl", "expose", "objektvorstellung", "einheit", "wohnung", "kaufpreis"],
      },
      {
        id: "objekt-followup",
        titel: "Wenn der Kunde noch überlegt",
        frage: "Was mache ich, wenn sich der Kunde nicht entscheidet?",
        absaetze: [
          "Dann setzt du die Stufe **Follow-Up nach Objektvorstellung** von Hand. Sie ist die einzige Stufe, die keine Automatik jemals setzt, und das mit Absicht: Ob jemand überlegt oder abgesprungen ist, hört man im Gespräch, das erkennt kein System.",
          "Die Ampel läuft dort wie in der Objektauswahl: nach sieben Tagen orange, nach zehn rot, nach vierzehn ist eine Entscheidung fällig.",
        ],
        quelle: "src/lib/pipelineStufen.ts",
        schlagworte: ["follow up", "objektvorstellung", "ueberlegen", "unentschlossen"],
      },
    ],
  },
  {
    id: "reservierung",
    titel: "5. Die Reservierung",
    kurz: "Formular, Unterschrift, vier Eskalationsstufen",
    ziele: [{ label: "Zu den Reservierungen", url: "/reservierung" }, { label: "Zur Abwicklung", url: "/abwicklung" }],
    bloecke: [
      {
        id: "res-ablauf",
        titel: "Vom Formular zur unterschriebenen PDF",
        frage: "Wie reserviere ich eine Einheit?",
        absaetze: [
          "Hat der Kunde sich entschieden, erstellst du die Reservierungsvereinbarung. Damit rückt der Vorgang auf **Reservierung**, und die Einheit ist für diesen Kunden blockiert.",
          "Der Kunde unterschreibt digital. Sobald die unterschriebene PDF am Investment im Abschnitt Reservierung liegt, ist die Reservierung abgeschlossen und der Vorgang rückt auf **Bonitätsunterlagen**. Eine zusätzliche Bestätigung durch die Verwaltung braucht es nicht.",
          "Reservieren dürfen Admin, Inhaber, Vertriebsleitung und Vertriebspartner. Andere Rollen sehen den Knopf nicht, und die Datenbank lässt es auch dann nicht zu, wenn jemand den Weg darum herum sucht.",
        ],
        achtung: "Der Reservierungslink läuft nicht mehr ab. Früher waren es sieben Tage, und wer sich spät entschied, klickte ins Leere.",
        quelle: "src/lib/reservierungsRechte.ts, Migration 20260911090000",
        schlagworte: ["reservierung", "reservieren", "unterschrift", "signatur", "blockiert"],
      },
      {
        id: "res-eskalation",
        titel: "Wenn die Unterschrift ausbleibt",
        frage: "Was passiert, wenn der Kunde die Reservierung nicht unterschreibt?",
        absaetze: [
          "Hier hängt ein Objekt für den Kunden fest, deshalb fällt nichts still unter den Tisch. Der Dienst läuft täglich und arbeitet vier Stufen ab, höchstens eine je Tag und Vorgang.",
        ],
        tabelle: {
          kopf: ["Wann", "Was passiert", "An wen"],
          zeilen: [
            ["Tag 2", "Erinnerung, freundlich", "Kunde, E-Mail"],
            ["Tag 5", "Erinnerung, deutlicher", "Kunde, E-Mail"],
            ["Tag 10", "Erinnerung mit Ausstiegsangebot", "Kunde, E-Mail"],
            ["Tag 14", "Aufgabe und Glocke", "Zuständiger Berater"],
          ],
        },
        quelle: "Migration 20260822120000_reservierung_eskalation.sql",
        schlagworte: ["eskalation", "erinnerung", "reservierung", "nicht unterschrieben"],
      },
    ],
  },
  {
    id: "bonitaet",
    titel: "6. Die Bonitätsunterlagen",
    kurz: "Hochladen, prüfen, freigeben",
    ziele: [{ label: "Zur Abwicklung", url: "/abwicklung" }, { label: "Zu allen Kontakten", url: "/alle-kontakte" }],
    bloecke: [
      {
        id: "bon-wege",
        titel: "Zwei Wege hinein, einer hindurch",
        frage: "Wie kommen die Bonitätsunterlagen ins System?",
        absaetze: [
          "**Der Kunde lädt selbst hoch.** Dafür schaltest du ihm das Kundenportal frei. Der Bereich dafür liegt unterhalb des Bonitätscheck-Blocks im Kundenprofil.",
          "**Du lädst hoch.** Schickt der Kunde dir seine Unterlagen, legst du sie für ihn ein.",
          "Welcher Weg, ist dir überlassen. **Nicht überlassen ist, dass die Unterlagen ins System gehören.** Nur was hier liegt, kann intern weiterverarbeitet werden: geprüft, freigegeben, an die Bank gegeben. Unterlagen in einem Postfach oder einer Cloud existieren für den Prozess nicht.",
        ],
        achtung: "Welche Unterlagen gebraucht werden, ist **keine feste Liste**. Sie hängt an der Beschäftigungsart des Kunden. Ein Selbständiger bringt statt Arbeitsvertrag drei Jahre Bilanzen, Steuererklärung und Steuerbescheid, ein Beamter Ernennungsurkunde und Besoldungsbescheide. Nenne im Gespräch nie eine Anzahl, sondern die fehlende Unterlage beim Namen.",
        quelle: "src/lib/bankpruefungDocs.ts, src/lib/bankpruefungListe.ts",
        schlagworte: ["bonitaet", "unterlagen", "hochladen", "kundenportal", "bankpruefung", "dokumente"],
      },
      {
        id: "bon-freigabe",
        titel: "Prüfen und freigeben",
        frage: "Wer gibt die Unterlagen frei und was passiert dann?",
        absaetze: [
          "Die Freigabe machst du selbst im Kundenordner, über die finale Prüfung. Jedes Pflichtdokument muss auf freigegeben stehen. Hochgeladen allein reicht nicht.",
          "Sind alle freigegeben, passiert dreierlei auf einmal: Der Vorgang rückt auf **Finanzierung**, der Finanzierungspartner wird gerufen, und der Kunde bekommt seine Nachricht. Der Ruf an den Finanzierungspartner geht genau einmal je Investment hinaus.",
          "Wird etwas abgelehnt, bekommt der Kunde eine Mail mit dem Grund und kann neu hochladen.",
        ],
        achtung: "Bis zum 11.09.2026 wurde der Finanzierungspartner schon mit der unterschriebenen Reservierung gerufen. Er bekam damit eine Aufgabe, an der er nicht arbeiten konnte. Das ist behoben: Gerufen wird erst nach der vollständigen Freigabe.",
        quelle: "src/lib/bonitaetFreigabeMeldung.ts, src/lib/finanzierungFreigabe.ts",
        schlagworte: ["freigabe", "pruefung", "finale pruefung", "abgelehnt", "finanzierungspartner"],
      },
    ],
  },
  {
    id: "finanzierung",
    titel: "7. Die Finanzierung",
    kurz: "Eigenfinanzierung oder unser Gegenangebot",
    ziele: [{ label: "Zur Abwicklung", url: "/abwicklung" }],
    bloecke: [
      {
        id: "fin-wege",
        titel: "Zwei Wege zur Finanzierung",
        frage: "Kann der Kunde seine eigene Bank mitbringen?",
        absaetze: [
          "Ja. Der Kunde kann eine Eigenfinanzierung anfragen und sein Angebot hochladen. Ebenso können wir über unseren Finanzierungspartner ein Gegenangebot bewirken. Beides nebeneinander ist der Normalfall, nicht die Ausnahme.",
          "Die Angebote liegen am Investment und erscheinen im Kundenportal, sobald sie freigegeben sind. Der Kunde sieht dort Bank, Darlehenssumme, Zins und Tilgung.",
          "Lädt der Finanzierungspartner das finale Darlehensangebot und den Vertrag hoch, rückt die Stufe weiter Richtung Notar.",
        ],
        quelle: "Finanzierungsbereich am Investment",
        schlagworte: ["finanzierung", "eigenfinanzierung", "angebot", "darlehen", "bank", "zins"],
      },
      {
        id: "fin-sperre",
        titel: "Warum die Finanzierung manchmal gesperrt aussieht",
        frage: "Warum steht bei Finanzierung, dass sie noch nicht freigegeben ist?",
        absaetze: [
          "Im Kundenprofil öffnet sich die Finanzierung, sobald ein Objekt eingetragen und die Reservierung unterschrieben ist, auch während die Bonitätsunterlagen noch geprüft werden. So kann der Finanzierungspartner das Angebot schon hochladen. Ist sie noch gesperrt, nennt der Hinweis an der Karte den Grund, etwa die fehlende Unterschrift.",
          "Im Kundenportal sieht der Kunde die Finanzierung erst, wenn alle Bonitätsunterlagen hochgeladen und freigegeben sind. Bis dahin steht dort ein fester Hinweis, dass sie nach der Prüfung der Unterlagen freigegeben wird. Welche Unterlage fehlt, sieht er im Bereich Bonitätsunterlagen.",
          "Wird eine Pflichtunterlage nach dieser Freigabe abgelehnt oder gelöscht, bleibt die Finanzierung offen. Der Finanzierungspartner bekommt dazu eine Benachrichtigung.",
        ],
        quelle: "src/lib/investmentFreischaltung.ts und src/lib/finanzierungFreigabe.ts",
        schlagworte: ["gesperrt", "noch nicht freigegeben", "warum", "wartet"],
      },
    ],
  },
  {
    id: "notar",
    titel: "8. Notar und Abwicklung",
    kurz: "Aufnahmebogen, Termin, Fälligkeit, Abrechnung",
    ziele: [{ label: "Zur Abwicklung", url: "/abwicklung" }, { label: "Zur Provisionsabrechnung", url: "/provisionsabrechnung" }],
    bloecke: [
      {
        id: "notar-bogen",
        titel: "Der Notaraufnahmebogen",
        frage: "Was muss vor dem Notartermin ausgefüllt werden?",
        absaetze: [
          "Vor dem Termin wird der Notaraufnahmebogen ausgefüllt. Er ist die Voraussetzung dafür, dass im Kundenportal überhaupt Notardaten erscheinen: Ohne ihn zeigt das Portal nichts an, auch wenn intern schon etwas eingetragen ist.",
        ],
        quelle: "Notarbereich am Investment",
        schlagworte: ["notar", "aufnahmebogen", "kaufvertrag"],
      },
      {
        id: "notar-termin",
        titel: "Gesetzter Termin oder Vorschläge",
        frage: "Wie wird der Notartermin abgestimmt?",
        absaetze: [
          "Zwei Wege. Entweder der Termin steht und wird eingetragen, oder es gehen mehrere Vorschläge an den Kunden, aus denen er in seinem Portal einen auswählt, in Rücksprache mit dir.",
          "Ein vom Kunden bestätigter Termin hat Vorrang vor eingetragenen Daten. Und solange der Termin in der Zukunft liegt, gilt die Stufe als laufend, nicht als abgeschlossen.",
          "Die Koordinierung mit dem Notariat läuft über das Backoffice.",
        ],
        quelle: "Notarbereich am Investment, Kundenportal",
        schlagworte: ["notartermin", "vorschlaege", "auswahl", "termin", "beurkundung"],
      },
      {
        id: "notar-danach",
        titel: "Fälligkeit, Abrechnung, Abschluss",
        frage: "Was passiert nach dem Notartermin?",
        absaetze: [
          "Nach der Beurkundung folgt die **Fälligkeit**: Das Fälligstellungsschreiben des Notars wird hinterlegt und der Zahlungseingang überwacht. Danach die **Abrechnung**: Die Provisionsabrechnung wird erstellt und die Zahlung verfolgt. Zuletzt steht der Vorgang auf **Abgeschlossen**, und der Kunde geht in die Bestandsbetreuung über.",
          "Wichtig für dich: Der Provisionsanspruch **entsteht** mit der Reservierung und wird mit dem Notartermin **fällig**. Der Abrechnungsmonat richtet sich nach dem Notartermin.",
          "In diesen drei Stufen wird überwiegend auf Geld und auf Dritte gewartet. Die Ampel ist deshalb geduldiger: zehn Tage orange, zwanzig rot, und erst nach dreissig Tagen ist eine Entscheidung fällig.",
        ],
        quelle: "src/lib/abschlussDefinition.ts, Provisionsabrechnung",
        schlagworte: ["faelligkeit", "abrechnung", "provision", "abgeschlossen", "bestandskunde"],
      },
    ],
  },
  {
    id: "glocke",
    titel: "Meldungen an dich",
    kurz: "Glocke und Inbox, wann und wofür",
    ziele: [{ label: "Zur Inbox", url: "/inbox" }],
    bloecke: [
      {
        id: "glocke-unterschied",
        titel: "Glocke oder Aufgabe, der Unterschied",
        frage: "Was ist der Unterschied zwischen Glocke und Inbox?",
        absaetze: [
          "Die **Glocke** ist eine Mitteilung. Du siehst sie beim nächsten Blick ins CRM, und wenn du sie angeklickt hast, ist sie weg.",
          "Die **Aufgabe in der Inbox** bleibt stehen, bis du sie erledigst. Sie wird dort eingesetzt, wo etwas liegen bleiben würde, wenn es niemand aufhebt.",
          "Deshalb kommen an den wichtigen Stellen beide zusammen, und bei den Eskalationen zusätzlich eine Mail. Drei Wege, weil sie Verschiedenes leisten.",
        ],
        schlagworte: ["glocke", "benachrichtigung", "inbox", "aufgabe", "meldung"],
      },
      {
        id: "glocke-wann",
        titel: "Wobei du eine Meldung bekommst",
        frage: "Wann bekomme ich als Vertriebspartner eine Glocke oder eine Aufgabe?",
        absaetze: [
          "Die wichtigsten Auslöser entlang des Prozesses:",
        ],
        tabelle: {
          kopf: ["Ereignis", "Was du bekommst"],
          zeilen: [
            ["Ein Lead wird dir zugewiesen", "Glocke"],
            ["Ein Termin wurde gebucht", "Glocke"],
            ["Die Selbstauskunft wurde verschickt", "Glocke"],
            ["Der Kunde hat die Selbstauskunft unterschrieben", "Glocke"],
            ["Selbstauskunft nach 14 Tagen offen", "Aufgabe"],
            ["Die Reservierung ist eingegangen", "Glocke"],
            ["Reservierung nach 14 Tagen nicht unterschrieben", "Aufgabe und Glocke"],
            ["Eine Einheit wurde reserviert", "Glocke"],
            ["Der Kunde hat alle Dokumente hochgeladen", "Glocke"],
            ["Das Prüfungsergebnis wurde versendet", "Glocke"],
            ["Der Notartermin wurde gesetzt", "Glocke"],
            ["Die Stufe hat sich geändert", "Glocke"],
            ["Ein Follow-Up wurde erstellt", "Glocke"],
            ["Der Kaufpreis ist fällig", "Glocke"],
            ["Lead in seiner Stufe zu lange still", "Aufgabe"],
            ["Montags: deine liegengebliebenen Vorgänge", "Bericht per Mail"],
          ],
        },
        quelle: "src/lib/bellNotifications.ts",
        schlagworte: ["wann glocke", "benachrichtigung", "aufgabe", "inbox", "meldung", "ausloeser"],
      },
    ],
  },
  {
    id: "kunde-meldungen",
    titel: "Meldungen an den Kunden",
    kurz: "Welche Mails der Kunde bekommt",
    ziele: [{ label: "Zu allen Kontakten", url: "/alle-kontakte" }],
    bloecke: [
      {
        id: "kunde-mails",
        titel: "Was beim Kunden ankommt",
        frage: "Welche E-Mails bekommt der Kunde automatisch?",
        absaetze: [
          "Der Kunde bekommt nur an klar umrissenen Stellen Post, und jede Mail trägt deinen Namen als Ansprechpartner, nicht einen anonymen Absender.",
        ],
        tabelle: {
          kopf: ["Anlass", "Was der Kunde bekommt"],
          zeilen: [
            ["Selbstauskunft verschickt", "Einladung mit Ausfüll-Link"],
            ["Selbstauskunft offen, Tag 4 und Tag 10", "Erinnerung"],
            ["Selbstauskunft unterschrieben", "Bestätigung"],
            ["Reservierung zur Unterschrift", "Link zur Signatur"],
            ["Reservierung offen, Tag 2, 5 und 10", "Erinnerung, zuletzt mit Ausstiegsangebot"],
            ["Reservierung unterschrieben", "Bestätigung"],
            ["Unterlagen eingereicht", "Eingangsbestätigung"],
            ["Prüfung abgeschlossen", "Ergebnis, mit Grund bei Ablehnung"],
            ["Bonität freigegeben", "Nachricht, dass die Finanzierung beginnt"],
            ["Portalzugang freigeschaltet", "Zugangsdaten"],
            ["Notaraufnahmebogen erstellt", "Nachricht"],
            ["Notartermin zur Auswahl", "Vorschläge zum Auswählen"],
            ["Notartermin bestätigt", "Bestätigung mit Datum und Uhrzeit"],
            ["Termin steht bevor", "Erinnerung"],
            ["Geburtstag", "Glückwunsch"],
          ],
        },
        achtung: "Im Kundenportal sieht der Kunde zusätzlich seine nächsten Schritte. Diese Texte sind aufeinander abgestimmt: Nach der Reservierung steht dort, dass als Nächstes die Bonitätsunterlagen kommen, und nicht mehr die Finanzierung.",
        quelle: "supabase/functions/_shared/transactional-email-templates/",
        schlagworte: ["kunde", "e-mail", "mail", "benachrichtigung", "portal", "naechste schritte"],
      },
    ],
  },
  {
    id: "eskalation",
    titel: "Erinnerungen und Eskalation",
    kurz: "Was täglich läuft und wann die Führung mitliest",
    ziele: [{ label: "Zu den Follow-Ups", url: "/follow-ups" }, { label: "Zur Pipeline", url: "/pipeline" }],
    bloecke: [
      {
        id: "esk-dienste",
        titel: "Was jeden Tag von allein läuft",
        frage: "Welche automatischen Dienste laufen im Hintergrund?",
        absaetze: [
          "Mehrere Dienste laufen nachts und früh am Morgen. Die Uhrzeiten sind deutsche Sommerzeit.",
        ],
        tabelle: {
          kopf: ["Uhrzeit", "Dienst", "Was er tut"],
          zeilen: [
            ["05:00", "Lead-Eskalation", "Aufgabe für liegengebliebene Leads, ab der finalen Schwelle zusätzlich an die Führung"],
            ["05:30", "Inaktivitäts-Erinnerung", "Glocke für jeden, der mindestens einen roten Vorgang hat"],
            ["06:00", "Follow-Up-Mahnung", "Überfällige Follow-Ups, ab drei Tagen sieht es die Führung mit"],
            ["06:30 montags", "Pipeline-Mahnreport", "Deine liegengebliebenen Vorgänge per Mail, die Führung bekommt dieselbe Aufstellung für ihren Bereich"],
            ["08:20", "Signatur-Erinnerung", "24 Stunden vor Ablauf an den Kunden, beim Ablauf eine Aufgabe an dich"],
            ["11:00", "Reservierungs-Eskalation", "Die vier Stufen bei offener Reservierung"],
            ["03:00", "Nachtprüfung", "Sucht Widersprüche in den Daten, meldet sie morgens an die Verwaltung"],
          ],
        },
        quelle: "Migration 20260807170000_eskalationsdienste_zeitplan.sql und weitere",
        schlagworte: ["eskalation", "erinnerung", "automatisch", "nachts", "dienst", "cron", "mahnung"],
      },
      {
        id: "esk-schwellen",
        titel: "Ab wann etwas eskaliert",
        frage: "Nach wie vielen Tagen eskaliert ein Vorgang?",
        absaetze: [
          "Jede Stufe hat drei Schwellen. **Orange** heisst: sieh mal nach. **Rot** heisst: es ist überfällig. Die **finale Schwelle** heisst: hier ist keine Erinnerung mehr fällig, sondern eine Entscheidung, nämlich weiterführen, verlieren oder archivieren. Ab der finalen Schwelle liest die Führung mit.",
          "Die Werte sind nicht willkürlich: Vorne im Prozess geht es um Reaktionsgeschwindigkeit, hinten stecken echte Wartezeiten auf Bank, Notar und Zahlung.",
        ],
        tabelle: {
          kopf: ["Stufe", "Orange", "Rot", "Entscheidung fällig"],
          zeilen: [
            ["Neuer Lead", "2 Tage", "4 Tage", "7 Tage"],
            ["Zugewiesen", "1 Tag", "3 Tage", "7 Tage"],
            ["Nicht erreicht", "1 Tag", "3 Tage", "10 Tage"],
            ["Erreicht", "1 Tag", "3 Tage", "7 Tage"],
            ["Erstgespräch geplant", "3 Tage", "7 Tage", "14 Tage"],
            ["EG NoShow", "1 Tag", "3 Tage", "7 Tage"],
            ["Beratungsgespräch", "3 Tage", "7 Tage", "14 Tage"],
            ["BG NoShow", "1 Tag", "3 Tage", "7 Tage"],
            ["Selbstauskunft", "3 Tage", "7 Tage", "14 Tage"],
            ["Objektauswahl", "7 Tage", "10 Tage", "14 Tage"],
            ["Follow-Up Objekt", "7 Tage", "10 Tage", "14 Tage"],
            ["Reservierung", "10 Tage", "20 Tage", "30 Tage"],
            ["Bonitätsunterlagen", "7 Tage", "10 Tage", "14 Tage"],
            ["Finanzierung", "10 Tage", "20 Tage", "30 Tage"],
            ["Notar", "10 Tage", "20 Tage", "30 Tage"],
            ["Fälligkeit", "10 Tage", "20 Tage", "30 Tage"],
            ["Abrechnung", "10 Tage", "20 Tage", "30 Tage"],
          ],
        },
        achtung: "Gezählt wird ab der letzten Aktivität an diesem Vorgang, nicht ab dem Anlegen. Eine Notiz zählt als Aktivität. Wer nur eine Notiz schreibt, um die Ampel zu beruhigen, verschiebt das Problem, er löst es nicht.",
        quelle: "supabase/functions/_shared/pipeline-schwellen.ts, src/lib/inactivityThresholds.ts",
        schlagworte: ["schwellen", "tage", "orange", "rot", "ueberfaellig", "eskalationsstufe", "fuehrung"],
      },
    ],
  },
  {
    id: "ampel",
    titel: "Die Ampel am Namen",
    kurz: "Was der farbige Punkt bedeutet",
    ziele: [{ label: "Zur Pipeline", url: "/pipeline" }, { label: "Zu allen Kontakten", url: "/alle-kontakte" }],
    bloecke: [
      {
        id: "ampel-bedeutung",
        titel: "Der Punkt hinter dem Namen",
        frage: "Was bedeutet die Inaktivitätsanzeige im Kundenprofil hinter dem Namen?",
        absaetze: [
          "Der farbige Hinweis hinter dem Namen zeigt, **wie lange an diesem Vorgang nichts passiert ist**, gemessen an der Stufe, in der er steht. Er sagt nichts über den Kunden aus und nichts über die Qualität des Leads, nur über die Zeit.",
          "**Keine Farbe** heisst: alles im Rahmen. **Orange** heisst: die erste Schwelle dieser Stufe ist überschritten, sieh mal nach. **Rot** heisst: die zweite Schwelle ist überschritten, und du erscheinst damit in der Inaktivitäts-Erinnerung um 5:30 Uhr und im Montagsbericht.",
          "Die Schwellen sind je Stufe verschieden. Vier Tage in Neuer Lead sind rot, vier Tage in Reservierung sind völlig normal. Deshalb färbt sich dieselbe Wartezeit an zwei Kunden unterschiedlich.",
          "Nicht jede Stufe hat eine Ampel. Abgeschlossen, Verloren und Archiviert haben keine, und Follow-Up wird in Stunden gemessen statt in Tagen: nach 24 Stunden orange, nach 48 rot.",
        ],
        achtung: "Zurücksetzen lässt sich die Ampel nur durch echte Bewegung: eine Aktivität, ein Stufenwechsel, ein Kontakt. Es gibt keinen Knopf, der sie ausschaltet.",
        quelle: "src/lib/inactivityThresholds.ts",
        schlagworte: ["ampel", "inaktivitaet", "farbe", "punkt", "orange", "rot", "hinter dem namen", "tage ohne"],
      },
    ],
  },
  {
    id: "aktion",
    titel: "Aktion erstellen",
    kurz: "Was der Knopf im Kundenprofil auslöst",
    ziele: [{ label: "Zu allen Kontakten", url: "/alle-kontakte" }],
    bloecke: [
      {
        id: "aktion-arten",
        titel: "Was hinter Aktion erstellen steckt",
        frage: "Was ist bei Aktion erstellen im Kundenprofil zu beachten?",
        absaetze: [
          "Über **Aktion erstellen** hältst du fest, was mit dem Kunden passiert ist: Anruf, Notiz, E-Mail, Meeting, Aufgabe, Termin. Jeder Eintrag landet in der Aktivitätenliste des Kunden und ist damit für alle nachvollziehbar, die den Vorgang sehen dürfen.",
          "Drei Dinge, die dabei mehr auslösen, als es aussieht:",
        ],
        liste: [
          "**Der erste protokollierte Anruf** schiebt einen zugewiesenen Lead automatisch auf Kontaktversuche. Das gilt nur für Anruf und Anrufprotokoll, nicht für eine Notiz.",
          "**Jede Aktivität setzt die Inaktivitäts-Ampel zurück.** Das ist gewollt, wenn wirklich etwas passiert ist. Es ist eine schlechte Idee, wenn die Notiz nur geschrieben wird, damit die Farbe verschwindet: Der Vorgang steht danach genauso still, nur sieht es niemand mehr.",
          "**E-Mail** öffnet dein Mailprogramm und hält den Vorgang zugleich in den Aktivitäten fest. Der Inhalt der Mail landet nicht im CRM, nur die Tatsache, dass du geschrieben hast.",
          "**Meeting** öffnet mit Videocall-Freigabe die normale Meeting-Maske samt Videoraum, ohne Freigabe einen schlichten Dialog, der nur den Termin einträgt.",
        ],
        achtung: "Ein Gesprächsausgang ist kein Selbstzweck. Nicht erreicht steuert die Wartestaffel und blendet den Kontakt für eine Weile aus. Wer das nicht dokumentiert, sieht denselben Kontakt am nächsten Tag wieder oben und ruft zur selben Uhrzeit noch einmal an.",
        quelle: "Schnellaktionen im Kundenprofil",
        schlagworte: ["aktion erstellen", "aktivitaet", "anruf", "notiz", "meeting", "termin", "protokoll"],
      },
    ],
  },
  {
    id: "grundsaetze",
    titel: "Drei Grundsätze",
    kurz: "Was oft falsch erinnert wird",
    ziele: [{ label: "Zur Pipeline", url: "/pipeline" }],
    bloecke: [
      {
        id: "grundsatz-investment",
        titel: "Alles Geld hängt am Investment",
        frage: "Warum steht der Kaufpreis nicht am Kunden?",
        absaetze: [
          "Ein Kunde kann mehrere Käufe haben. Deshalb hängen Objekt, Kaufpreis, Notartermin, Finanzierung und Abwicklungsstand am **Investment** und nicht am Kontakt. Der Wert am Kontakt ist nur ein Rückfall für Altbestände.",
          "Praktisch heisst das: Wähle immer zuerst das Investment, dann die Stufe. Zahlen, die ohne Investment angezeigt werden, sind bestenfalls eine Summe und schlimmstenfalls die des falschen Kaufs.",
        ],
        schlagworte: ["investment", "kaufpreis", "mehrere kaeufe", "zweites investment"],
      },
      {
        id: "grundsatz-portal",
        titel: "Das Kundenportal zeigt dasselbe wie du siehst",
        frage: "Sieht der Kunde in seinem Portal dasselbe wie ich?",
        absaetze: [
          "Im Kern ja, aber in seiner Sprache. Dieselbe Stufe erzeugt bei dir eine Handlungsanweisung und bei ihm eine Erklärung. Steht bei dir Bonität vervollständigen, steht bei ihm, welche Unterlage noch fehlt.",
          "Nicht alles ist sofort sichtbar. Notardaten erscheinen erst nach dem Aufnahmebogen und einer ausdrücklichen Freigabe. Unterlagen sieht er erst, wenn sie freigeschaltet sind.",
        ],
        schlagworte: ["kundenportal", "portal", "kunde sieht", "transparenz"],
      },
      {
        id: "grundsatz-system",
        titel: "Was nicht im System steht, gibt es nicht",
        frage: "Muss wirklich alles ins CRM?",
        absaetze: [
          "Für den Prozess: ja. Unterlagen in einem Postfach können nicht geprüft werden. Ein Anruf, der nicht protokolliert ist, beruhigt keine Ampel und zählt in keiner Auswertung. Ein Termin, der nur im eigenen Kalender steht, löst keine Erinnerung aus.",
          "Das ist keine Kontrolle, sondern der Grund, warum der Rest von allein läuft. Jede Automatik in diesem Handbuch hängt an einer Eintragung, die jemand gemacht hat.",
        ],
        schlagworte: ["dokumentation", "pflege", "warum eintragen", "datenqualitaet"],
      },
    ],
  },
];
