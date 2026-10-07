/**
 * Was auf dem Schirm steht, wenn im Buchungskalender etwas nicht klappt.
 *
 * Bis zum 14.09.2026 stand dort ein einziger Satz: „Die Zeiten konnten nicht
 * gespeichert werden." Er trifft auf jede Ursache zu und hilft bei keiner. Die
 * HR-Managerin hat ihn tagelang gelesen, ohne zu erfahren, dass ihr schlicht
 * das Schreibrecht in der Datenbank fehlte. Sie hat es immer wieder versucht,
 * und Wiederholen war genau das Falsche.
 *
 * Dieselbe Entscheidung wie in `kennenlernenVersandMeldung.ts`: Die Deutung
 * des Fehlers liegt an einer Stelle, nicht in jedem Klickbehandler neu, und
 * sie unterscheidet die Lagen, die verschiedene nächste Schritte verlangen:
 *
 *   1. fehlendes Recht      Wiederholen hilft nie, es muss jemand freischalten
 *   2. fehlende Migration   die Datenbankfunktion ist noch nicht angelegt
 *   3. abgelaufene Anmeldung  ab und wieder anmelden
 *   4. ungültige Eingabe    die Zeiten selbst stimmen nicht
 *   5. Netzfehler           ein zweiter Versuch lohnt sich
 *
 * Seit dem 14.09.2026 deutet dasselbe Modul **alle** Schreibvorgänge des
 * Buchungskalenders, nicht mehr nur den Wochenplan. Der Grund ist der gleiche
 * Befund noch einmal: „Tag sperren" schreibt in dieselbe Tabelle
 * `buchung_verfuegbarkeiten` und hängt an derselben Einfügeregel, meldete aber
 * weiterhin blind „Der Tag konnte nicht gesperrt werden". Vor der Migration
 * 20260914140000 scheiterten beide aus demselben Grund, und nur einer der
 * beiden sagte es. Terminarten, Buchungslink und Absagen lagen genauso blind.
 *
 * Der Unterschied zwischen den Vorgängen ist nur der Wortlaut, nicht die
 * Deutung. Deshalb eine Tabelle mit Texten und eine einzige Deutung darüber,
 * statt fünf ähnlicher Funktionen nebeneinander.
 *
 * Der technische Wortlaut bleibt zusätzlich in der Browser-Konsole, dort
 * schreibt ihn die jeweilige Store-Funktion hin.
 */

/** Titel und Erklärung für den Hinweis auf dem Schirm. */
export interface ZeitenMeldung {
  titel: string;
  text: string;
}

/** Eine Rückfrage im Projektstil, wie `confirmDialog` sie erwartet. */
export interface BuchungRueckfrage {
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  variant: "destructive";
}

/** Postgres verweigert einen Schreibzugriff wegen Zeilensicherheit mit 42501. */
const CODE_KEIN_RECHT = "42501";

/** Ein `RAISE EXCEPTION` aus einer eigenen Datenbankfunktion. */
const CODE_EIGENE_MELDUNG = "P0001";

/**
 * Die Schreibvorgänge des Buchungskalenders.
 *
 * Sie unterscheiden sich in dem, was misslungen ist, und in dem, was danach
 * unverändert dasteht. Die Ursachen sind bei allen dieselben.
 */
export type BuchungVorgang =
  | "zeiten"
  | "tagSperren"
  | "sperreAufheben"
  | "terminartAnlegen"
  | "terminartAendern"
  | "terminartLoeschen"
  | "linkEinstellungen"
  | "linkAnlegen"
  | "buchungStatus";

interface VorgangTexte {
  /** Der Satz, wenn sich nichts Genaueres sagen lässt. */
  fehlschlag: string;
  /** Was nach dem gescheiterten Versuch unverändert dasteht. Beruhigt. */
  unveraendert: string;
  /** Was die Rolle konkret nicht darf. */
  rechtSatz: string;
  /** Der nächste Schritt, wenn das Recht fehlt. */
  rechtSchritt: string;
  /** Name der Datenbankfunktion, sofern der Vorgang über eine läuft. */
  funktion?: string;
}

/**
 * Der Hinweis auf die noch nicht eingespielte Freigabe.
 *
 * Er gilt für alles, was an `darf_videocall` hängt: eigene Zeiten, gesperrte
 * Tage und die Einstellungen des Buchungslinks. Diese drei Regeln tragen
 * dieselbe Bedingung, siehe Migration 20260827200000.
 */
const FREIGABE_HR =
  "Ein zweiter Versuch hilft deshalb nicht. Bitte gib Christian Bescheid: " +
  "In Supabase muss die Freigabe für die Rolle HR eingespielt werden " +
  "(Migration 20260914140000_hr_darf_zeiten_pflegen.sql).";

const BESCHEID = "Ein zweiter Versuch hilft deshalb nicht. Bitte gib Christian Bescheid.";

const TEXTE: Record<BuchungVorgang, VorgangTexte> = {
  zeiten: {
    fehlschlag: "Die Zeiten konnten nicht gespeichert werden",
    unveraendert: "Dein bisheriger Plan ist unverändert erhalten.",
    rechtSatz: "Deine Rolle darf im Buchungskalender bisher keine eigenen Zeiten anlegen.",
    rechtSchritt: FREIGABE_HR,
    funktion: "buchung_wochenplan_setzen",
  },
  tagSperren: {
    fehlschlag: "Der Tag konnte nicht gesperrt werden",
    unveraendert: "An deinen Zeiten hat sich nichts geändert.",
    rechtSatz:
      "Deine Rolle darf im Buchungskalender bisher keine eigenen Zeiten anlegen. " +
      "Ein gesperrter Tag ist genau so ein Eintrag, deshalb scheitert er aus demselben Grund " +
      "wie das Speichern der Wochenzeiten.",
    rechtSchritt: FREIGABE_HR,
  },
  sperreAufheben: {
    fehlschlag: "Die Sperre konnte nicht aufgehoben werden",
    unveraendert: "Der Tag bleibt vorerst gesperrt.",
    rechtSatz: "Deine Rolle darf diese Sperre nicht entfernen. Aufheben lassen sich nur eigene Sperren.",
    rechtSchritt: BESCHEID,
  },
  terminartAnlegen: {
    fehlschlag: "Die Terminart konnte nicht angelegt werden",
    unveraendert: "Es wurde nichts angelegt.",
    rechtSatz: "Deine Rolle darf im Buchungskalender keine eigenen Terminarten anlegen.",
    rechtSchritt:
      "Ein zweiter Versuch hilft deshalb nicht. Bitte gib Christian Bescheid: " +
      "In Supabase muss die Freigabe dafür eingespielt werden " +
      "(Migration 20260910143000_terminarten_anlegen_erweitern.sql).",
  },
  terminartAendern: {
    fehlschlag: "Die Änderung konnte nicht gespeichert werden",
    unveraendert: "Die Terminart steht unverändert da.",
    rechtSatz: "Deine Rolle darf diese Terminart nicht ändern. Ändern lassen sich nur die eigenen.",
    rechtSchritt: BESCHEID,
  },
  terminartLoeschen: {
    fehlschlag: "Die Terminart konnte nicht gelöscht werden",
    unveraendert: "Die Terminart ist unverändert vorhanden.",
    rechtSatz: "Terminarten löscht ausschließlich ein Administrator.",
    rechtSchritt: BESCHEID,
  },
  linkEinstellungen: {
    fehlschlag: "Der Buchungslink konnte nicht gespeichert werden",
    unveraendert: "Deine bisherigen Einstellungen sind unverändert erhalten.",
    rechtSatz:
      "Deine Rolle darf im Buchungskalender bisher keine eigenen Einstellungen anlegen. " +
      "Dieselbe Regel hält auch das Speichern der Zeiten auf.",
    rechtSchritt: FREIGABE_HR,
  },
  linkAnlegen: {
    fehlschlag: "Der Buchungslink konnte nicht angelegt werden",
    unveraendert: "Es wurde nichts angelegt, der Kunde hat nichts bekommen.",
    rechtSatz: "Deine Rolle darf diesen Buchungslink bisher nicht anlegen.",
    rechtSchritt:
      "Ein zweiter Versuch hilft deshalb nicht. Bitte gib Christian Bescheid: " +
      "In Supabase muss die Trennung von Terminseite und Videocall eingespielt werden " +
      "(Migration 20260927120000_videocall_nur_geschaeftsfuehrer.sql).",
  },
  buchungStatus: {
    fehlschlag: "Der Termin konnte nicht geändert werden",
    unveraendert: "Der Termin steht unverändert im Kalender.",
    rechtSatz: "Diesen Termin darf nur ändern, wer ihn selbst bekommen hat, oder ein Administrator.",
    rechtSchritt: BESCHEID,
  },
};

function textVon(fehler: unknown): string {
  if (!fehler) return "";
  if (fehler instanceof Error) return fehler.message;
  if (typeof fehler === "string") return fehler;
  const f = fehler as { message?: unknown; details?: unknown; hint?: unknown };
  return [f.message, f.details, f.hint].filter((t) => typeof t === "string").join(" ");
}

function codeVon(fehler: unknown): string {
  if (!fehler || typeof fehler !== "object") return "";
  const f = fehler as { code?: unknown };
  return typeof f.code === "string" ? f.code : "";
}

/** Verweigert die Datenbank den Schreibzugriff? */
export function fehlendesRecht(fehler: unknown): boolean {
  if (codeVon(fehler) === CODE_KEIN_RECHT) return true;
  const text = textVon(fehler).toLowerCase();
  return text.includes("row-level security")
    || text.includes("row level security")
    || text.includes("permission denied")
    || text.includes("not authorized");
}

/** Kam die Anfrage gar nicht erst bis zum Server? */
export function netzFehler(fehler: unknown): boolean {
  const text = textVon(fehler).toLowerCase();
  return text.includes("failed to fetch")
    || text.includes("networkerror")
    || text.includes("network error")
    || text.includes("load failed")
    || text.includes("timeout");
}

/**
 * Die Deutung eines gescheiterten Schreibversuchs in einem lesbaren Satz.
 *
 * Die Reihenfolge der Prüfungen ist Absicht: Das fehlende Recht steht vorn,
 * weil es der einzige Fall ist, in dem ein zweiter Versuch garantiert wieder
 * scheitert.
 */
export function buchungFehlerMeldung(fehler: unknown, vorgang: BuchungVorgang): ZeitenMeldung {
  const t = TEXTE[vorgang];
  const roh = textVon(fehler).trim();
  const code = codeVon(fehler);
  const klein = roh.toLowerCase();

  if (fehlendesRecht(fehler)) {
    return {
      titel: "Die Datenbank lässt das Speichern nicht zu",
      text: `${t.rechtSatz} ${t.rechtSchritt}`,
    };
  }

  if (klein.includes("nicht angemeldet") || code === "401" || klein.includes("jwt")) {
    return {
      titel: "Die Anmeldung gilt nicht mehr",
      text: "Bitte einmal ab und wieder anmelden, danach lässt sich wieder speichern.",
    };
  }

  // PGRST202 und 42883: die aufgerufene Datenbankfunktion gibt es noch nicht.
  // PGRST204 und 42703: die angesprochene Spalte fehlt. Beides heisst, dass
  // eine Migration in Supabase noch nicht gelaufen ist.
  if (code === "PGRST202" || code === "42883" || code === "PGRST204" || code === "42703"
    || /schema cache|does not exist/i.test(roh)) {
    return {
      titel: t.funktion ? "Die Speicherfunktion fehlt in Supabase" : "In Supabase fehlt noch eine Migration",
      text: t.funktion
        ? `Die Datenbankfunktion ${t.funktion} ist noch nicht angelegt. `
          + `Wiederholen hilft nicht, die Migration muss erst laufen. ${t.unveraendert}`
        : `Die Datenbank kennt das benötigte Feld oder die benötigte Funktion noch nicht. `
          + `Wiederholen hilft nicht, die Migration muss erst laufen. ${t.unveraendert}`,
    };
  }

  if (netzFehler(fehler)) {
    return {
      titel: "Die Verbindung kam nicht zustande",
      text: `Hier hilft ein zweiter Versuch. ${t.unveraendert}`,
    };
  }

  // Eigene Meldung aus der Datenbankfunktion, etwa zu einer kaputten Liste,
  // oder eine verletzte Prüfregel auf der Tabelle.
  if (code === CODE_EIGENE_MELDUNG || code === "23514" || code === "22007" || code === "22008") {
    return {
      titel: vorgang === "zeiten" ? "Die Zeiten sind so nicht gültig" : "Das lässt die Datenbank so nicht zu",
      text: roh
        ? `Meldung aus dem System: ${roh}`
        : t.unveraendert,
    };
  }

  return {
    titel: t.fehlschlag,
    text: roh
      ? `${t.unveraendert} Meldung aus dem System: ${roh}`
      : `${t.unveraendert} Der technische Wortlaut steht in der Browser-Konsole.`,
  };
}

/**
 * Der Wochenplan, der ursprüngliche Anlass dieses Moduls.
 *
 * Bleibt als eigener Name stehen, weil er an mehreren Stellen so gelesen wird
 * und weil „Zeiten" der Vorgang ist, um den es hier zuerst ging.
 */
export function zeitenFehlerMeldung(fehler: unknown): ZeitenMeldung {
  return buchungFehlerMeldung(fehler, "zeiten");
}

/**
 * Die ungültige Eingabe, die gar nicht erst zur Datenbank geht.
 *
 * Sie steht hier neben den übrigen Lagen, damit alle Meldungen dieser Maske
 * an einer Stelle nachzulesen sind.
 */
export function endeVorAnfangMeldung(tagName: string): ZeitenMeldung {
  return {
    titel: "Die Zeiten sind so nicht gültig",
    text: `${tagName}: Die Endzeit muss nach der Startzeit liegen.`,
  };
}

// ---------------------------------------------------------------------------
// Der stille Schaden: ein Buchungskalender, in dem niemand mehr buchen kann
// ---------------------------------------------------------------------------

/**
 * Zwei Angaben genügen, damit überhaupt jemand buchen kann: wenigstens ein
 * buchbarer Wochentag und wenigstens eine aktive Terminart. Fehlt eines von
 * beiden, zeigt der Buchungslink schlicht nichts an. Kaputt sieht dabei nichts
 * aus, es geht nur nichts.
 */
export interface BuchungsLage {
  /** Wie viele Wochentage sind buchbar? */
  buchbareTage: number;
  /** Wie viele Terminarten stehen auf aktiv? */
  aktiveTerminarten: number;
  /**
   * Hängt am Wochenplan dieser Person auch der Bewerberprozess?
   *
   * Wahr, wenn sie die Rolle `hr` trägt und eine aktive Terminart mit dem
   * Anlass `bewerbergespraech` hat. Dann wählt `bewerber_termin_gastgeber()`
   * genau sie aus, und ohne ihre Zeiten kann kein Bewerber mehr buchen.
   */
  istBewerberGastgeber: boolean;
}

/**
 * Der Satz, der die Folge benennt.
 *
 * Nicht „bist du sicher?", sondern was danach nicht mehr geht. Wer die
 * Rückfrage liest, soll ohne Nachdenken wissen, was er gerade abschaltet.
 */
function folgeSatz(istBewerberGastgeber: boolean): string {
  const grund =
    "Dein Buchungslink zeigt dann keine freien Termine mehr an, und niemand kann bei dir "
    + "einen Termin buchen.";
  return istBewerberGastgeber
    ? grund + " Auch Bewerber können dann kein Kennenlerngespräch mehr buchen, "
      + "der Bewerberprozess steht damit still."
    : grund;
}

/**
 * Die Rückfrage, bevor der letzte buchbare Wochentag verschwindet.
 *
 * Ohne sie war das der stillste Schaden der Seite: Wer alle Tage abwählte und
 * speicherte, bekam „Zeiten gespeichert." zu lesen und hatte seine
 * Erreichbarkeit gelöscht. Gemerkt hat es niemand, bis sich ein Bewerber
 * beschwerte.
 */
export function leererWochenplanRueckfrage(lage: Pick<BuchungsLage, "istBewerberGastgeber">): BuchungRueckfrage {
  return {
    title: "Danach kann niemand mehr einen Termin bei dir buchen",
    description:
      "Es ist kein einziger Wochentag mehr buchbar. Speicherst du jetzt, wird dein "
      + "kompletter Wochenplan gelöscht.\n\n"
      + folgeSatz(lage.istBewerberGastgeber)
      + "\n\nBereits gebuchte Termine bleiben bestehen. Willst du nur einzelne Tage frei "
      + `halten, nimm dafür „Gesperrte Tage".`,
    confirmText: "Wochenplan löschen",
    cancelText: "Zurück zum Plan",
    variant: "destructive",
  };
}

/**
 * Die Rückfrage, bevor die letzte aktive Terminart verschwindet.
 *
 * Dieselbe Wirkung wie ein leerer Wochenplan: Ohne etwas Buchbares zeigt der
 * Link nichts an. Der Weg dorthin ist nur ein anderer, ein Schalter statt
 * eines Speicherknopfes.
 */
export function letzteTerminartRueckfrage(params: {
  bezeichnung: string;
  /** Ausschalten oder löschen. */
  art: "ausschalten" | "loeschen";
  istBewerberGastgeber: boolean;
  /** Zusätzliche Warnung, etwa zu betroffenen persönlichen Links. */
  zusatz?: string;
}): BuchungRueckfrage {
  const verb = params.art === "ausschalten" ? "Schaltest du sie aus" : "Löschst du sie";
  return {
    title: "Danach kann niemand mehr einen Termin bei dir buchen",
    description:
      `„${params.bezeichnung}" ist deine letzte aktive Terminart. ${verb}, gibt es nichts mehr, `
      + "was gebucht werden kann.\n\n"
      + folgeSatz(params.istBewerberGastgeber)
      + (params.zusatz ? `\n\n${params.zusatz}` : ""),
    confirmText: params.art === "ausschalten" ? "Trotzdem ausschalten" : "Trotzdem löschen",
    cancelText: params.art === "ausschalten" ? "Aktiv lassen" : "Behalten",
    variant: "destructive",
  };
}

/**
 * Der dauerhafte Hinweis auf der Seite, nicht nur im Moment des Speicherns.
 *
 * Wer den Buchungskalender öffnet und nichts sieht, weiß sonst nicht, ob das
 * Absicht ist. Ein leerer Wochenplan sieht genauso aus wie ein noch nie
 * gepflegter. Gibt `null` zurück, wenn alles beisammen ist; dann steht auch
 * kein Kasten auf der Seite.
 */
export function buchungGesperrtHinweis(lage: BuchungsLage): ZeitenMeldung | null {
  const fehltZeit = lage.buchbareTage === 0;
  const fehltArt = lage.aktiveTerminarten === 0;
  if (!fehltZeit && !fehltArt) return null;

  const was = fehltZeit && fehltArt
    ? "Es ist kein Wochentag buchbar, und es gibt keine aktive Terminart."
    : fehltZeit
      ? "Es ist kein einziger Wochentag buchbar."
      : "Es gibt keine aktive Terminart.";

  const naechster = fehltZeit && fehltArt
    ? `Trag unter „Deine Zeiten" deine Wochentage ein und schalte eine Terminart aktiv.`
    : fehltZeit
      ? `Trag unter „Deine Zeiten" ein, wann du erreichbar bist, und speichere.`
      : `Schalte oben unter „Terminarten" wenigstens eine Terminart aktiv.`;

  return {
    titel: "Zurzeit kann niemand einen Termin bei dir buchen",
    text: `${was} ${folgeSatz(lage.istBewerberGastgeber)} ${naechster}`,
  };
}
