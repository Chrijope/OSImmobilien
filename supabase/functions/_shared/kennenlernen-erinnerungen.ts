/**
 * Die Erinnerungskette des neuen Bewerberprozesses.
 *
 * Einladung und zwei Erinnerungen, danach ist Schluss:
 *
 *   | Tag 0  | Eingangsmail mit dem Link zum Kennenlernen | Bewerber |
 *   | Tag 3  | Erste Erinnerung, freundlich, mit Abmeldeknopf | Bewerber |
 *   | Tag 11 | Letzte Erinnerung, schließt das Verfahren | Bewerber |
 *   | danach | nichts |
 *
 * **Tag 8 ist seit dem 26.09.2026 entfallen** (Christians Entscheidung). Ein
 * Bewerber, der nicht reagiert, bekommt damit höchstens drei Mails: die
 * Einladung, Tag 3 und Tag 11. Die Stufen im Vermerk behalten trotzdem ihre
 * Nummern: Stufe 1 heißt „Tag 3 ist hinaus", Stufe 3 „Tag 11 ist hinaus".
 * Stufe 2 steht nur noch in Akten, die Tag 8 vor der Umstellung bekommen
 * haben. Neu vergeben wird sie nicht, und für die Rechnung ist sie dasselbe
 * wie Stufe 1: Als Nächstes kommt Tag 11.
 *
 * **Die Nachfass-Mail startet die Kette nicht neu.** Bis zum 26.09.2026 setzte
 * `send-bewerber-nachfass` den Anker `gesendetAm` auf den Tag der Sammelmail,
 * und die Erinnerungen liefen danach ein zweites Mal. Jetzt ist sie eine
 * einzelne Mail; verschickte Erinnerungen bleiben verschickt. Nur die
 * Nachfass-Sperre unten hält die Kette für einen Tag an, damit beides nicht
 * am selben Vormittag ankommt.
 *
 * **Tag 11 war bis zum 14.09.2026 eine Bitte an die HR-Managerin, anzurufen.**
 * Die Kette endete damit bei einem Menschen, der den Anruf erst noch machen
 * musste, und meistens machte ihn niemand. Jetzt bekommt der Bewerber eine
 * dritte, freundliche Mail, und sein Stand wandert gleichzeitig auf
 * „Kein Interesse". Der Fall endet damit sichtbar statt still.
 *
 * **Wer nicht von selbst endet, wird kenntlich gemacht.** Zwei Gruppen enden
 * nicht automatisch: wer gebeten hat, nicht angerufen zu werden, und wer
 * gesagt hat „ich melde mich selbst". Beide lagen bis zum 14.09.2026
 * unsichtbar im Eingang, ohne Kennzeichen und ohne dass noch etwas geschah.
 * `wartetAufEntscheidung` gibt ihnen einen Grund im Klartext, den Liste und
 * Akte anzeigen.
 *
 * **Es gibt eine Kette, nicht zwei.** Ob jemand gar nicht angefangen hat oder
 * unterbrochen wurde, ändert nur den Text, nicht den Zeitplan. Zwei parallele
 * Ketten wären der sichere Weg zu zwei Mails an einem Tag.
 *
 * **Warum die Stufe und nicht ein Zeitstempel.** Der alte Bogen merkt sich in
 * `bewerber_formular.erinnerung_am` genau eine Erinnerung. Damit ist eine
 * zweite Stufe nicht darstellbar. Diese Datei rechnet deshalb aus dem
 * Versanddatum und einer Stufe, die im Meta-Feld des Bewerbers liegt. Ohne
 * Migration.
 *
 * Diese Datei entscheidet nur, **ob** etwas fällig ist. Verschickt wird
 * nichts hier; das macht die Oberfläche beziehungsweise der Zeitplan, also
 * `send-bewerber-kennenlernen-erinnerungen`.
 *
 * **Warum sie unter `_shared` liegt.** Der Zeitplan läuft in Deno und kann von
 * dort nicht in `src` greifen. Die Anwendung liest sie über
 * `src/lib/kennenlernenErinnerungen.ts`, das nichts tut, als sie
 * weiterzureichen. So gibt es die Stoppbedingungen genau einmal. Zwei
 * Fassungen derselben Regel laufen sonst auseinander, und das fällt erst auf,
 * wenn ein abgelehnter Bewerber eine Erinnerung bekommt.
 */

/** Die erste Erinnerung. */
export const ERINNERUNG_TAG_1 = 3;
/**
 * Die letzte Erinnerung. Der Name bleibt `_3`, obwohl sie seit dem 26.09.2026
 * die zweite ist: Vorlage, Trackingart und Vermerk heißen ebenfalls „3", und
 * alte Akten tragen diese Namen.
 */
export const ERINNERUNG_TAG_3 = 11;

/**
 * Wie weit die Kette bei diesem Bewerber schon gelaufen ist.
 *
 * 0 nichts, 1 Tag 3 ist hinaus, 3 Tag 11 ist hinaus. 2 kommt nur noch in
 * Akten vor, die vor dem 26.09.2026 die entfallene Tag-8-Mail bekamen.
 */
export type ErinnerungStufe = 0 | 1 | 2 | 3;

export type KettenStand = {
  /** Wann die Eingangsmail hinausging, ISO. Fehlt sie, läuft keine Kette. */
  gesendetAm?: string | null;
  /** Status der Zeile in `bewerber_formular`: offen, eingereicht, ersetzt, abgelaufen. */
  formularStatus?: string | null;
  /** Ablauf des Links, ISO. */
  laeuftAbAm?: string | null;
  /** Pipelinestufe des Bewerbers. */
  bewerberStatus?: string | null;
  /** Läuft schon ein Erstgespräch? Termin, Skript oder Assessment liegen vor. */
  erstgespraechLaeuft?: boolean;
  /**
   * Hat der Bewerber dem Anruf widersprochen? Gilt nur für Tag 11.
   *
   * Den Anruf gibt es seit dem 14.09.2026 nicht mehr, die Angabe bleibt
   * trotzdem: Wer einmal gesagt hat, dass er nicht behelligt werden will,
   * bekommt auch nicht ungefragt den Stand „Kein Interesse" verpasst. Die
   * dritte Mail bekommt er sehr wohl, siehe `darfFallSchliessen`.
   */
  anrufWidersprochen?: boolean;
  /**
   * Bis wann der Bewerber selbst pausiert hat, ISO. Leer bei einer Pause ohne
   * Erinnerung („ich melde mich selbst"), und die endet nicht von allein.
   */
  pausiertBis?: string | null;
  /**
   * Hat der Bewerber überhaupt jemals pausiert?
   *
   * Die Frage, ob gerade pausiert wird, beantwortet allein `pausiert()`. Dieses
   * Feld sagt nur, ob es überhaupt eine Pause gibt, und ist damit der Schalter
   * für `pausiert()` selbst. Wer damit eine Stufe abschaltet, schaltet sie für
   * immer ab, auch lange nach dem Ende der Pause.
   */
  pauseGesetzt?: boolean;
  /** Wann die Pause gesetzt wurde, ISO. Nur für die Anzeige „seit X Tagen". */
  pauseGesetztAm?: string | null;
  /**
   * Wann zuletzt eine Sammelmail von Hand hinausging, ISO. Die jüngere der
   * beiden Wellen, siehe `juengsteNachfassMail`.
   */
  nachfassMailAm?: string | null;
  /** Wie weit die Kette gelaufen ist. */
  stufe?: ErinnerungStufe;
};

export type FaelligeErinnerung = "keine" | "tag3" | "tag11";

/** Warum die Kette steht. Leer, wenn sie läuft. */
export type StoppGrund =
  | "abgeschickt"
  | "abgemeldet"
  | "kein_interesse"
  | "abgelehnt"
  | "erstgespraech"
  | "link_abgelaufen"
  | "anruf_widersprochen"
  | "pausiert"
  | "fertig"
  | "keine_mail";

export const STOPP_TEXTE: Record<StoppGrund, string> = {
  abgeschickt: "Das Kennenlernen ist abgeschickt.",
  abgemeldet: "Der Bewerber hat sich abgemeldet.",
  kein_interesse: "Es steht auf „Kein Interesse“.",
  abgelehnt: "Der Bewerber ist abgelehnt.",
  erstgespraech: "Ein Gespräch läuft bereits.",
  link_abgelaufen: "Der Link ist abgelaufen. Ein neuer geht nur auf Zuruf hinaus.",
  anruf_widersprochen: "Der Bewerber hat dem Anruf widersprochen.",
  pausiert: "Der Bewerber hat selbst pausiert. Eine Pause ist keine Absage.",
  fertig: "Die Kette ist durchgelaufen. Danach kommt nichts mehr.",
  keine_mail: "Es ist noch keine Eingangsmail hinausgegangen.",
};

/** Ganze Tage zwischen zwei Zeitpunkten, nie negativ. */
export function tageSeit(iso: string | null | undefined, jetzt: Date): number {
  if (!iso) return -1;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return -1;
  return Math.floor((jetzt.getTime() - start.getTime()) / 86_400_000);
}

/** Läuft die selbst gewählte Pause gerade noch? */
export function pausiert(stand: KettenStand, jetzt: Date = new Date()): boolean {
  if (!stand.pauseGesetzt) return false;
  // Ohne Erinnerungsdatum hat der Bewerber gesagt: „Ich melde mich selbst."
  // Dann endet die Pause nicht von allein, und wir schweigen weiter.
  if (!stand.pausiertBis) return true;
  const ziel = new Date(stand.pausiertBis);
  if (Number.isNaN(ziel.getTime())) return true;
  return ziel > jetzt;
}

/**
 * Warum die Kette bei diesem Bewerber steht. `null`, wenn sie läuft.
 *
 * Sieben Bedingungen, jede einzeln wirksam. Der Widerspruch gegen den Anruf
 * gilt nur für Tag 11 und wird deshalb erst dort geprüft.
 *
 * **Die siebte ist die selbst gewählte Pause**, und sie ist der Grund, warum
 * der Satz auf dem Pausenbildschirm überhaupt stimmen darf: „Eine Pause ist
 * keine Absage, und ein Anruf kommt deswegen nicht." Bis zu dieser Fassung
 * setzte die Pause nur einen Bildschirmzustand, der Server erfuhr davon
 * nichts, und der Bewerber bekam Tag 3, Tag 8 und an Tag 11 den Anruf.
 */
export function stoppGrund(stand: KettenStand, jetzt: Date = new Date()): StoppGrund | null {
  if (!stand.gesendetAm) return "keine_mail";
  if (stand.formularStatus === "eingereicht") return "abgeschickt";
  const status = stand.bewerberStatus || "";
  if (status === "KeinInteresse") return "kein_interesse";
  if (status === "Abgelehnt") return "abgelehnt";
  if (stand.erstgespraechLaeuft) return "erstgespraech";
  if (status && status !== "Eingang") return "erstgespraech";
  if (pausiert(stand, jetzt)) return "pausiert";
  if (stand.laeuftAbAm && new Date(stand.laeuftAbAm) < jetzt) return "link_abgelaufen";
  if ((stand.stufe ?? 0) >= 3) return "fertig";
  return null;
}

/**
 * Was heute fällig ist.
 *
 * Prüft zusätzlich die Nachfass-Welle: Die HR-Managerin verschickt sie von
 * Hand an alle in der Stufe Eingang, und beide sprechen dieselben Menschen an.
 * Wer an einem Vormittag beides bekommt, hält uns für eine Maschine. Deshalb
 * ruht die Erinnerung einen Tag lang, wenn die Nachfass-Mail gerade hinausging.
 *
 * Mehr tut die Nachfass-Mail an der Kette nicht. Sie verschiebt weder den
 * Anker noch den Zähler; was danach fällig ist, bleibt fällig.
 */
export const NACHFASS_SPERRE_TAGE = 1;

export function faelligeErinnerung(stand: KettenStand, jetzt: Date = new Date()): FaelligeErinnerung {
  if (stoppGrund(stand, jetzt)) return "keine";

  // Der Merker der Nachfass-Welle. Ohne diese Prüfung kommen beide am selben Tag.
  const seitNachfass = tageSeit(stand.nachfassMailAm, jetzt);
  if (seitNachfass >= 0 && seitNachfass < NACHFASS_SPERRE_TAGE) return "keine";

  const tage = tageSeit(stand.gesendetAm, jetzt);
  const stufe = stand.stufe ?? 0;

  if (stufe < 1 && tage >= ERINNERUNG_TAG_1) return "tag3";
  /*
   * Tag 8 gibt es seit dem 26.09.2026 nicht mehr. Der Übergang ergibt sich
   * ohne Sonderfall: Wer bei der Umstellung zwischen Tag 3 und Tag 8 stand
   * (Stufe 1), bekommt an Tag 11 die letzte Mail. Wer Tag 8 schon hatte
   * (Stufe 2), ebenso. Keine Mail fällt aus, keine kommt doppelt, denn
   * Stufe 3 beendet die Kette in `stoppGrund`.
   */
  if (stufe < 3 && tage >= ERINNERUNG_TAG_3) {
    /*
     * Hier stand bis zum 14.09.2026 eine zweite, eigene Prüfung, und sie
     * fragte `stand.pauseGesetzt`, also ob überhaupt jemals pausiert wurde.
     * Die allgemeinen Stopps oben fragen dagegen `pausiert(stand, jetzt)`,
     * also ob gerade pausiert wird. Aus den beiden verschiedenen Fragen wurde
     * ein stiller Fehler: Wer eine Pause mit Erinnerungsdatum setzte, bekam
     * nach deren Ablauf wieder die Erinnerungen, aber Tag 11 blieb für immer
     * abgeschaltet. Sein Fall lag danach ohne Abschluss im Eingang, und
     * niemand sah es.
     *
     * Jetzt gilt an allen Stellen dieselbe Frage, und sie steht genau einmal,
     * nämlich oben in `stoppGrund`: Eine laufende Pause und eine Pause ohne
     * Erinnerungsdatum („ich melde mich selbst") halten die ganze Kette an,
     * eine abgelaufene Pause hält gar nichts mehr an.
     *
     * Auch der Widerspruch gegen den Anruf hält diese Mail nicht mehr auf.
     * `anrufWidersprochen` heißt „interessiert, aber bitte nicht anrufen", und
     * eine Mail ist kein Anruf. Sie sagt diesem Bewerber sogar genau das, was
     * er hören will: dass wir uns nicht mehr von allein melden. Nur den
     * Statuswechsel darf sie bei ihm nicht auslösen, und darüber entscheidet
     * `darfFallSchliessen`.
     */
    return "tag11";
  }
  return "keine";
}

/**
 * Darf die letzte Erinnerung den Fall auch schließen, also den Stand auf
 * „Kein Interesse" setzen?
 *
 * Nein bei „bitte nicht anrufen". Dieser Bewerber hat gesagt, dass er
 * interessiert ist und nur den Anruf nicht möchte. Ihn auf „Kein Interesse"
 * zu setzen schriebe das Gegenteil dessen in die Akte, was er uns gesagt hat.
 * Die Mail bekommt er, den Schlussstrich zieht bei ihm ein Mensch.
 *
 * Eine laufende Pause muss hier nicht mehr geprüft werden: Wer pausiert,
 * bekommt schon die Mail nicht, und ohne Mail gibt es auch keinen
 * Statuswechsel.
 */
export function darfFallSchliessen(stand: KettenStand): boolean {
  return !stand.anrufWidersprochen;
}

/**
 * Welchen Wortlaut die Erinnerung an Tag 3 bekommt.
 *
 * Derselbe Auslöser, derselbe Tag, nur ein anderer Text: Ein begonnener Bogen
 * steht weiterhin auf `offen`, deshalb greift dieselbe Abfrage.
 */
export function erinnerungWortfassung(hatAngefangen: boolean): "nicht_begonnen" | "unterbrochen" {
  return hatAngefangen ? "unterbrochen" : "nicht_begonnen";
}

/** Wann die nächste Nachricht dran wäre, als Datum. Leer, wenn nichts mehr kommt. */
export function naechsterSchrittAm(stand: KettenStand, jetzt: Date = new Date()): string {
  if (stoppGrund(stand, jetzt)) return "";
  const start = stand.gesendetAm ? new Date(stand.gesendetAm) : null;
  if (!start || Number.isNaN(start.getTime())) return "";
  const stufe = stand.stufe ?? 0;
  const tage = stufe === 0 ? ERINNERUNG_TAG_1 : ERINNERUNG_TAG_3;
  const ziel = new Date(start.getTime() + tage * 86_400_000);
  return ziel.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Beschriftung der fälligen Nachricht, für die Oberfläche. */
export const FAELLIG_TEXTE: Record<Exclude<FaelligeErinnerung, "keine">, string> = {
  tag3: `Erste Erinnerung, Tag ${ERINNERUNG_TAG_1}`,
  tag11: `Letzte Erinnerung, Tag ${ERINNERUNG_TAG_3}, schließt den Fall`,
};

// ── Wer auf eine Entscheidung von Hand wartet ─────────────────────────────
//
// Der Regelfall endet an Tag 11 von selbst: dritte Mail hinaus, Stand auf
// „Kein Interesse", der Fall ist sichtbar zu. Zwei Gruppen enden nicht von
// selbst, und genau die blieben bis zum 14.09.2026 unsichtbar im Eingang
// liegen: Sie sahen aus wie jeder frische Bewerber, nur geschah bei ihnen
// nichts mehr. Diese Rechnung macht sie kenntlich.

/** Warum ein Bewerber auf eine Entscheidung von Hand wartet. */
export type WartetGrund = "meldet_sich_selbst" | "nicht_anrufen" | "ohne_abschluss";

export type WartetStand = {
  grund: WartetGrund;
  /** Der Grund im Klartext, für die Liste und die Akte. */
  text: string;
  /** Seit wie vielen Tagen. -1, wenn sich kein Datum lesen lässt. */
  seitTagen: number;
};

/** „, seit 34 Tagen". Leer, wenn kein Datum vorliegt. */
function seitText(tage: number): string {
  if (tage < 0) return "";
  if (tage === 0) return ", seit heute";
  if (tage === 1) return ", seit einem Tag";
  return `, seit ${tage} Tagen`;
}

/**
 * Wartet dieser Bewerber auf eine Entscheidung von Hand? `null`, wenn nicht.
 *
 * Drei Voraussetzungen, alle drei notwendig: Die Kette ist überhaupt gelaufen,
 * der Bogen ist nicht abgeschickt (sonst liegt etwas zum Ansehen vor, und die
 * Akte zeigt die Entscheidung ohnehin an), und der Bewerber steht noch im
 * Eingang. Wer den Eingang verlassen hat, ist bereits entschieden.
 *
 * Danach bleiben genau die Fälle, in denen von selbst nichts mehr geschieht:
 *
 * 1. **„Ich melde mich selbst."** Eine Pause ohne Erinnerungsdatum endet nicht
 *    von allein, und das ist so gewollt. Sichtbar sein muss sie trotzdem.
 * 2. **„Bitte nicht anrufen."** Die dritte Mail ist hinaus, der Stand bleibt
 *    aber absichtlich stehen, siehe `darfFallSchliessen`.
 * 3. **Die Kette ist durch, der Fall aber offen.** Das passiert, wenn die
 *    dritte Mail nicht hinausging: Dann bleibt der Stand ebenfalls stehen.
 */
export function wartetAufEntscheidung(stand: KettenStand, jetzt: Date = new Date()): WartetStand | null {
  if (!stand.gesendetAm) return null;
  if (stand.formularStatus === "eingereicht") return null;
  if ((stand.bewerberStatus || "") !== "Eingang") return null;

  if (pausiert(stand, jetzt) && !stand.pausiertBis) {
    const seit = tageSeit(stand.pauseGesetztAm || stand.gesendetAm, jetzt);
    return { grund: "meldet_sich_selbst", text: `Meldet sich selbst${seitText(seit)}`, seitTagen: seit };
  }

  if ((stand.stufe ?? 0) >= 3) {
    const seit = tageSeit(stand.gesendetAm, jetzt);
    if (stand.anrufWidersprochen) {
      return { grund: "nicht_anrufen", text: `Möchte nicht angerufen werden${seitText(seit)}`, seitTagen: seit };
    }
    return {
      grund: "ohne_abschluss",
      text: `Alle Erinnerungen sind hinaus, der Fall wurde aber nicht geschlossen${seitText(seit)}`,
      seitTagen: seit,
    };
  }

  return null;
}

// ── Vom Datenbankzeile zum Kettenstand ────────────────────────────────────
//
// Alles ab hier ist für den Zeitplan gebaut und bewusst hier und nicht in der
// Function: Genau an dieser Übersetzung entsteht der Fehler, den niemand
// bemerkt. Wer den Bewerberstatus nicht einliest, schickt einem abgelehnten
// Bewerber weiter Erinnerungen, und die Function selbst lässt sich nicht
// testen. Diese Datei schon.

/** Die Zeile aus `bewerbungen`, so weit die Kette sie braucht. */
export type BewerberDaten = {
  status?: string | null;
  meta?: Record<string, unknown> | null;
};

/** Die jüngste Zeile aus `bewerber_formular`, so weit die Kette sie braucht. */
export type FormularDaten = {
  status?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  antworten?: Record<string, unknown> | null;
};

/** Der Block `meta.kennenlernen`, immer als Objekt, nie undefined. */
export function kennenlernenBlock(meta?: Record<string, unknown> | null): Record<string, unknown> {
  const roh = meta?.kennenlernen;
  return roh && typeof roh === "object" && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
}

/**
 * Läuft schon ein Gespräch? Großzügig geprüft, wie in
 * `send-bewerber-formular-erinnerungen`: Im Zweifel lieber keine Erinnerung
 * als eine überflüssige an jemanden, mit dem längst jemand telefoniert hat.
 */
export function erstgespraechLaeuftLaut(meta?: Record<string, unknown> | null): boolean {
  if (!meta) return false;
  if (meta.erstgespraechDatum) return true;
  if (meta.closingTerminDatum) return true;

  const skript = meta.erstgespraechSkript as Record<string, unknown> | undefined;
  if (!skript || typeof skript !== "object") return false;
  if (skript.durchgefuehrtAm) return true;

  const inhaltlich = (wert: unknown): boolean => {
    if (wert == null) return false;
    if (typeof wert === "string") return wert.trim() !== "";
    if (Array.isArray(wert)) return wert.length > 0;
    if (typeof wert === "number") return wert > 0;
    if (typeof wert === "object") return Object.values(wert as Record<string, unknown>).some(inhaltlich);
    return Boolean(wert);
  };

  if (inhaltlich(skript.assessment)) return true;
  return ["ausgangslage", "ziele", "motivation", "vorErfahrung", "naechsterSchritt"]
    .some((feld) => inhaltlich(skript[feld]));
}

/**
 * Hat der Bewerber das Kennenlernen begonnen?
 *
 * Heute weiß der Server das nicht: Der Zwischenstand liegt im localStorage des
 * Bewerbers, die Datenbank sieht die Antworten erst beim Absenden. Deshalb
 * fällt die Antwort fast immer auf „noch nicht begonnen“, und genau so ist der
 * Wortlaut der Mail auch gemeint. Gespeicherte Teilantworten werden trotzdem
 * gelesen, damit die zweite Wortfassung von selbst greift, sobald der Bogen
 * seinen Zwischenstand einmal serverseitig ablegt.
 */
export function hatAngefangen(formular?: FormularDaten | null): boolean {
  const antworten = formular?.antworten;
  if (!antworten || typeof antworten !== "object") return false;
  return Object.keys(antworten).length > 0;
}

/**
 * Ab welchem Tag die Kette zählt: ab der Einladung oder ab dem Ende der Pause.
 *
 * Nach einer abgelaufenen Pause zählt sie ab dem Tag der selbst gewählten
 * Erinnerung weiter, nicht mehr ab dem Tag der Einladung.
 *
 * Ohne diese Verschiebung wären am Tag der Pause sofort alle Stufen fällig:
 * Wer sich am dritten Tag für einen Monat vertagt, stünde danach bei Tag 33
 * und bekäme Erinnerung, letzte Erinnerung und Schlussmail am selben Morgen.
 * So bekommt er stattdessen genau das, was er sich bestellt hat: eine
 * Erinnerung an dem Tag, den er selbst gewählt hat.
 *
 * Steht ausdrücklich als eigene Funktion hier, weil die Oberfläche denselben
 * Versatz rechnen muss. Rechnete sie ihn selbst nach, zeigte sie nach jeder
 * Pause ein anderes Fälligkeitsdatum an als der Zeitplan verschickt.
 */
export function startTagNachPause(
  eingeladenAm: string | null | undefined,
  pausiertBis: string | null | undefined,
): string | null {
  if (!eingeladenAm) return null;
  if (!pausiertBis) return eingeladenAm;
  const ende = new Date(pausiertBis);
  const start = new Date(eingeladenAm);
  if (Number.isNaN(ende.getTime()) || Number.isNaN(start.getTime())) return eingeladenAm;
  return ende > start ? pausiertBis : eingeladenAm;
}

/**
 * Die jüngere der beiden Sammelmails, ISO, oder `null`.
 *
 * Es gab zwei Wellen: die erste zur Terminbuchung (`meta.nachfassMailAm`) und
 * seit dem 12.09.2026 die zum Kennenlernen (`meta.klNachfassMailAm`). Die
 * Sperre las bis zum 26.09.2026 nur die erste. Aufgefallen ist das nicht, weil
 * die zweite die Kette ohnehin neu startete. Seit sie das nicht mehr tut, muss
 * die Sperre beide kennen, sonst kommen Sammelmail und Erinnerung am selben Tag.
 */
export function juengsteNachfassMail(...werte: unknown[]): string | null {
  let juengste: string | null = null;
  let juengsteZeit = -Infinity;
  for (const wert of werte) {
    if (typeof wert !== "string" || wert.trim() === "") continue;
    const zeit = new Date(wert).getTime();
    if (Number.isNaN(zeit)) continue;
    if (zeit > juengsteZeit) {
      juengste = wert;
      juengsteZeit = zeit;
    }
  }
  return juengste;
}

/**
 * Der Kettenstand eines Bewerbers, gelesen aus seiner Zeile und seinem Bogen.
 *
 * Die Stufe steht in `meta.kennenlernen.erinnerungStufe` und wird
 * ausschließlich von der Edge Function geschrieben, wie der Versandvermerk
 * der Einladung daneben.
 */
export function kettenStand(
  bewerber: BewerberDaten,
  formular?: FormularDaten | null,
): KettenStand {
  const meta = (bewerber.meta || {}) as Record<string, unknown>;
  const block = kennenlernenBlock(meta);
  const stufeRoh = Number(block.erinnerungStufe ?? 0);
  const stufe = (Number.isFinite(stufeRoh) ? Math.min(3, Math.max(0, Math.trunc(stufeRoh))) : 0) as ErinnerungStufe;

  /*
   * Die selbst gewählte Pause, geschrieben von der Edge Function
   * `bewerber-seite`. Ein leeres `erinnerungAm` heißt „ich melde mich selbst".
   */
  const pause = block.pause && typeof block.pause === "object" && !Array.isArray(block.pause)
    ? (block.pause as Record<string, unknown>)
    : null;
  const pauseGesetztAm = pause && typeof pause.gesetztAm === "string" && pause.gesetztAm !== ""
    ? pause.gesetztAm
    : null;
  const pauseGesetzt = !!pauseGesetztAm;
  const pausiertBis = pause && typeof pause.erinnerungAm === "string" ? pause.erinnerungAm : null;

  const eingeladenAm = typeof block.gesendetAm === "string" ? block.gesendetAm : null;
  const gesendetAm = startTagNachPause(eingeladenAm, pausiertBis);

  return {
    /*
     * Ausschließlich der Vermerk der Einladung, kein Rückfall auf das Alter
     * des Bogens. Beide Abläufe schreiben in dieselbe Tabelle
     * `bewerber_formular`; wer ersatzweise das Anlagedatum nähme, ließe die
     * Kette über jeden Bewerber des alten Vorabbogens laufen, und die bekämen
     * Mails zu einem Kennenlernen, das sie nie gesehen haben.
     */
    gesendetAm,
    formularStatus: formular?.status ?? null,
    laeuftAbAm: formular?.expires_at ?? null,
    bewerberStatus: bewerber.status ?? null,
    erstgespraechLaeuft: erstgespraechLaeuftLaut(meta),
    anrufWidersprochen: block.anrufWidersprochen === true,
    pausiertBis,
    pauseGesetzt,
    pauseGesetztAm,
    nachfassMailAm: juengsteNachfassMail(meta.nachfassMailAm, meta.klNachfassMailAm),
    stufe,
  };
}

/**
 * Der neue Block `meta.kennenlernen` nach einer verschickten Nachricht.
 *
 * Die Stufe steigt, und der Zeitpunkt wird festgehalten. Beides zusammen ist
 * der Versandvermerk: Ohne ihn schickt der nächste Lauf dieselbe Mail noch
 * einmal, denn die Tage sind dann immer noch vergangen.
 */
export function vermerkNachVersand(
  block: Record<string, unknown>,
  versandt: Exclude<FaelligeErinnerung, "keine">,
  jetztIso: string,
  versandOk: boolean,
): Record<string, unknown> {
  const felder: Record<Exclude<FaelligeErinnerung, "keine">, { stufe: ErinnerungStufe; zeit: string; ok: string }> = {
    tag3: { stufe: 1, zeit: "erinnerung1Am", ok: "erinnerung1Ok" },
    // Tag 8 (Stufe 2, `erinnerung2Am`) ist am 26.09.2026 entfallen. Alte
    // Akten behalten ihren Vermerk, neu geschrieben wird er nicht mehr.
    // Hieß bis zum 14.09.2026 `hrMitteilungAm`. Gelesen hat das Feld nie
    // jemand, entschieden wird allein über `erinnerungStufe`; alte Akten
    // behalten ihren alten Vermerk daneben stehen.
    tag11: { stufe: 3, zeit: "erinnerung3Am", ok: "erinnerung3Ok" },
  };
  const feld = felder[versandt];
  return {
    ...block,
    erinnerungStufe: feld.stufe,
    [feld.zeit]: jetztIso,
    [feld.ok]: versandOk,
  };
}
