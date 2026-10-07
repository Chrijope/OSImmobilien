/**
 * Welche Felder eine Mailvorlage erwartet, als Typ.
 *
 * ## Warum es diese Datei gibt
 *
 * Absender und Vorlage haben sich bisher auf nichts geeinigt. Der Absender
 * schickt `templateData: Record<string, any>`, die Vorlage liest Props mit
 * ihren eigenen Namen. Stimmen die beiden Namenslisten nicht ueberein, faellt
 * das nirgends auf: Die Mail geht hinaus, die unbekannten Felder werden
 * verworfen, die erwarteten sind leer. Bemerkt wird es erst, wenn jemandem
 * die Mail beim Empfaenger komisch vorkommt.
 *
 * Genau das ist bei "Die Kaufpreisfaelligkeit steht fest" passiert. Der
 * Absender schickte `dokumentUrl` und `hochgeladenVon`, beides kannte die
 * Vorlage nicht. Umgekehrt fehlten `faelligkeitsdatum` und der Link, die sie
 * erwartete. Ergebnis: eine Mail ohne Datum, ohne Link und mit dem Betreff
 * aus dem Rueckfall.
 *
 * Hier steht die Feldliste je Vorlage genau einmal. Die Vorlage nimmt sie als
 * ihre Props, der Absender nimmt sie ueber `src/lib/mailVersand.ts`. Ein
 * falscher oder fehlender Feldname ist damit ein Fehler bei `npx tsc` und
 * nicht mehr eine stille Luecke in der Mail.
 *
 * ## Warum eine eigene .ts-Datei und nicht die .tsx der Vorlage
 *
 * Die Vorlagen sind TSX und laden React ueber `npm:react@18.3.1`. Diese
 * Angabe versteht nur Deno; der Vite-Build der Anwendung kann eine Vorlage
 * deshalb nicht einlesen. Eine reine Typdatei ohne Importe laesst sich
 * dagegen von beiden Seiten lesen. Dasselbe Muster gibt es schon bei
 * `supabase/functions/_shared/berater-namensabgleich.ts`.
 *
 * ## Wie sie waechst
 *
 * Bewusst nicht auf einen Schlag fuer alle Vorlagen. Jede Vorlage kommt dann
 * dazu, wenn ihre Aufrufstelle ohnehin angefasst wird. Was hier fehlt, laeuft
 * weiter wie bisher, ungeprueft, aber unveraendert. Eine Vorlage aufnehmen
 * heisst: hier einen Eintrag anlegen, in der .tsx `type Props =
 * MailFelder['<name>']` setzen und die Aufrufstelle auf
 * `sendeVorlagenMail` umstellen.
 *
 * Pflicht oder optional richtet sich danach, ob die Mail ohne das Feld noch
 * taugt. `faelligkeitsdatum` ist Pflicht, weil ohne Datum auch der Betreff
 * nicht mehr stimmt.
 */

export interface MailFelder {
  /**
   * Interne Meldung: Der Nachweis zur Kaufpreisfaelligkeit liegt im
   * Kundenordner. Geht ans Büro (office@more.immo), nicht an den Kunden.
   */
  "faelligkeit-hochgeladen": {
    /** Vor- und Nachname des Kunden, um den es geht. */
    kundeName: string;
    /** Schon lesbar formatiert, etwa "22. September 2026". Leer, wenn am Investment nichts eingetragen ist. */
    faelligkeitsdatum: string;
    objektName?: string;
    wohnungName?: string;
    /** Direktlink auf den hochgeladenen Nachweis, befristet gueltig. */
    dokumentUrl?: string;
    /** Wer die Datei hochgeladen hat. */
    hochgeladenVon?: string;
    /** Die Kundenakte im CRM. Absichtlich nicht das Kundenportal, die Mail geht nach innen. */
    crmUrl?: string;
  };

  /**
   * Kundenmail: Der Notartermin steht fest. Sie-Form, weil Notar zur
   * Gruppe F gehoert.
   *
   * Frueher ging sie nicht an den Kunden, sondern fest an eine fremde
   * Adresse, und der Absender schickte `terminDatum` und `terminUhrzeit`.
   * Die Vorlage liest `datum` und `uhrzeit`, beides kam deshalb nie an.
   */
  "notartermin-geplant": {
    /** Vor- und Nachname, steht in der Anrede „Guten Tag …“. */
    kundeName: string;
    /** Schon lesbar formatiert, etwa "Donnerstag, 15. Oktober 2026". Ohne Datum stimmt der Betreff nicht. */
    datum: string;
    /** "10:00", die Vorlage haengt " Uhr" an. */
    uhrzeit?: string;
    notarName?: string;
    notarAdresse?: string;
    objektName?: string;
    wohnungName?: string;
    /** Link ins Kundenportal. */
    portalUrl?: string;
    /**
     * Der zustaendige Vertriebspartner. `send-transactional-email` loest ihn
     * gegen die Datenbank auf und setzt daraus `berater`, siehe
     * `_shared/ansprechpartner.ts`. Fehlt er, steht der Absender darunter.
     */
    beraterUserId?: string;
    /** Wird serverseitig gefuellt, der Absender schickt ihn nicht selbst. */
    berater?: MailAnsprechpartner;
    /**
     * Ein schon freigegebener Termin wurde geaendert und erneut freigegeben.
     * Die Mail sagt dann, dass der bisherige Termin nicht mehr gilt.
     */
    geaendert?: boolean;
  };

  /**
   * Interne Meldung: Fuer einen Kunden wurde ein Notartermin eingetragen.
   * Geht an den zustaendigen Vertriebspartner und ans Buero, nie an den
   * Kunden. Der Kunde bekommt `notartermin-geplant`.
   */
  "notartermin-benachrichtigung": {
    kundeName: string;
    /** Schon lesbar formatiert. */
    terminDatum: string;
    terminUhrzeit?: string;
    /** Name des zustaendigen Vertriebspartners. */
    vertriebspartner?: string;
    notarName?: string;
    notarAdresse?: string;
    notarEmail?: string;
    objektName?: string;
    wohnungName?: string;
    /** Wie bei `notartermin-geplant`: der Termin wurde geaendert. */
    geaendert?: boolean;
  };

  /**
   * Interne Meldung: Der Kunde hat im Portal einen der vorgeschlagenen
   * Notartermine bestaetigt. Geht an den zustaendigen Vertriebspartner und
   * ans Buero.
   */
  "notartermin-bestaetigt": {
    kundeName: string;
    /** Schon lesbar formatiert. */
    datum: string;
    uhrzeit?: string;
    /** Nur beim Vertriebspartner, fuer die Anrede mit Vornamen. Das Buero bekommt „Hallo,“. */
    vpName?: string;
    /** Die Kundenakte im CRM. */
    kundeLink?: string;
  };
}

/**
 * Felder, die send-transactional-email bei Kundenvorlagen selbst setzt
 * (Plan Kundensprache, Etappe 2). Der Absender schickt sie nicht, er gibt
 * hoechstens `kontaktId` oder `sprache` im Auftrag mit, siehe
 * `src/lib/mailVersand.ts`.
 */
export interface SpracheFelder {
  /** "de" oder "en". Fehlt sie, gilt Deutsch. */
  sprache?: "de" | "en";
  /** "Herr" oder "Frau" fuer die foermliche englische Anrede, siehe `foermlich` in `_anrede.ts`. */
  kundeAnrede?: string;
}

/**
 * Ansprechpartner unter einer Kundenmail. Dieselbe Form wie `Ansprechpartner`
 * in `_layout.tsx`, hier ohne Import, damit die Datei fuer Vite lesbar bleibt.
 */
export interface MailAnsprechpartner {
  name?: string;
  rolle?: string;
  telefon?: string;
  email?: string;
  bildUrl?: string;
}
