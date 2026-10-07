import type { VideoraumArt } from "@/lib/videoraumStore";
// Nur Typen: Ein Wertimport zöge den Supabase-Client und den Router in jede
// Seite, die diese Texte liest.
import type { Sprache, ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Die Anrede im Videoraum.
 *
 * Der Videoraum ist ein Haus mit zwei Türen. Durch die eine kommt ein Kunde,
 * durch die andere ein Bewerber, und beide sehen denselben Warteraum, dasselbe
 * Namensfenster und dieselben Hinweise. Bis zum 14.09.2026 wurde der Kunde
 * gesiezt und der Bewerber geduzt, und die Raumart entschied zwischen zwei
 * Wortlauten. Seit dem 15.09.2026 spricht das ganze Projekt per Du, also gibt
 * es hier nur noch eine Fassung.
 *
 * `anredeFuer` und `gastTexte` nehmen den Anlass weiterhin entgegen. Nicht,
 * weil er die Anrede noch ändert, sondern weil sich zwei Dinge weiter am
 * Anlass entscheiden: die Kopfzeile des Gesprächs (ein Bewerber führt kein
 * Beratungsgespräch) und der Satz unter der Begrüßung, wenn gleich ein Objekt
 * gezeigt wird.
 *
 * Diese Datei importiert `VideoraumArt` bewusst nur als Typ. Der Typ wird beim
 * Übersetzen entfernt, damit `videoraumStore.ts` seinerseits die Texte von
 * hier holen kann, ohne dass ein Ring aus zwei Modulen entsteht.
 */

/**
 * Die einzige Anrede, die es noch gibt. Der Typ bleibt, damit die Aufrufer
 * ihn weiter durchreichen können, und damit ein zurückkehrendes "sie" schon
 * beim Übersetzen auffällt und nicht erst im Warteraum.
 */
export type Anrede = "du";

/** Alle Texte, die der Gast im Videoraum zu sehen bekommt. */
export interface GastTexte {
  /** Überschrift der Ansprechpartner-Karte im Warteraum. */
  ansprechpartnerTitel: string;
  /** Steht am Raum kein Name, tritt dieser Platzhalter an seine Stelle. */
  ansprechpartnerPlatzhalter: string;
  /** Im Warteraum, wenn zum Anlass keine Agenda gepflegt ist. */
  agendaLeer: string;
  /** Der grüne Streifen über der Begrüßung. `{name}` ist der Rufname. */
  gleichDa: string;
  /** Der Satz unter der Begrüßung im Warteraum. */
  einrichten: string;
  /** Derselbe Satz, wenn gleich ein Objekt gezeigt wird. */
  einrichtenObjekt: string;
  /** Wartehinweis, wenn niemand mehr davor ist. */
  wartenGleich: string;
  /** Wartehinweis, solange drinnen noch gesprochen wird. */
  wartenNaechster: string;
  /** Wartehinweis mit Platz in der Schlange. `{position}` ist die Zahl. */
  wartenPosition: string;
  /**
   * Die Begrüßung im Namensfenster, in zwei Zeilen.
   *
   * Zwei Felder und nicht ein Satz mit einem Zeilenumbruch darin: Der Umbruch
   * ist Gestaltung und gehört in die Ansicht, nicht in den Text. Und ein
   * `<br />` in einer Zeichenkette wäre entweder Markup im Text oder es stünde
   * am Ende sichtbar auf der Seite.
   */
  begruessungOben: string;
  begruessungUnten: string;
  /** Der Absatz darunter. */
  einrichtenVorher: string;
  /** Beschriftung über der eigenen Vorschau. */
  nurEigenesBild: string;
  /** Beschriftung des Namensfeldes. */
  namensfeld: string;
  /** Nach dem Auflegen. */
  dankeAmEnde: string;
  /** Der Gastgeber hat den Raum gelöscht. */
  raumGeschlossen: string;
  /** Der Gastgeber hat abgewiesen. */
  nichtEingelassen: string;
  /** Warum der Knopf zum Teilen gesperrt ist. */
  teilenGesperrt: string;
  /** Am Rahmen des eigenen geteilten Bildschirms, solange geteilt wird. */
  teilenLaeuft: string;
  /** Der Gastgeber hat stummgeschaltet. `{name}` ist sein Name. */
  stummgeschaltet: string;
  /** Der Link führt ins Leere. */
  linkUngueltig: string;
  /** Der Link ist abgelaufen. */
  linkAbgelaufen: string;
  /** Das Gespräch ist schon vorbei. */
  schonBeendet: string;
  /** Das Namensfeld ist leer geblieben. */
  nameFehlt: string;
  /** Der Raum wird gerade zu oft geöffnet. */
  zuOft: string;
  /** Alles andere. */
  betretenFehlgeschlagen: string;
  /** Was in der Kopfzeile des Gesprächs steht, wenn es kein Objekt gibt. */
  gespraechTitel: string;
}

/**
 * Die Texte für Kunden und Bewerber.
 *
 * Nicht Wort für Wort aus der alten Sie-Fassung übersetzt: „Nutzen Sie die
 * Zeit" wurde zu „Nimm dir die Zeit", weil die wörtliche Fassung im Du steif
 * klingt. Der Ton ist derselbe wie im Kennenlernen und in den Mails, also
 * freundlich und knapp, und er verkauft nichts.
 *
 * Der Vitest-Wächter `duAnrede.test.ts` liest diese Werte und lässt kein
 * einziges Sie-Wort mehr hinein.
 */
export const DU_TEXTE: GastTexte = {
  ansprechpartnerTitel: "Dein Ansprechpartner",
  ansprechpartnerPlatzhalter: "Dein Ansprechpartner",
  agendaLeer: "Dein Ansprechpartner geht das Gespräch gleich mit dir durch.",
  gleichDa: "{name} ist gleich für dich da",
  einrichten: "Nimm dir die Zeit, um dich einzurichten.",
  einrichtenObjekt: "Gleich schauen wir uns dein Objekt gemeinsam an. Nimm dir die Zeit, um dich einzurichten.",
  wartenGleich: "Du wirst gleich eingelassen. Lass dieses Fenster bitte geöffnet.",
  wartenNaechster: "Gerade läuft noch ein Gespräch. Du bist als Nächster dran, lass dieses Fenster bitte geöffnet.",
  wartenPosition: "Vor dir wartet noch jemand. Du bist an Position {position}, lass dieses Fenster bitte geöffnet.",
  begruessungOben: "Schön, dass du",
  begruessungUnten: "da bist.",
  einrichtenVorher: "Bevor es losgeht, richte dich kurz ein. Dein Ansprechpartner sieht dich erst, wenn du den Raum betrittst.",
  nurEigenesBild: "Nur du siehst dieses Bild",
  namensfeld: "Dein Name",
  dankeAmEnde: "Danke für das Gespräch. Du kannst dieses Fenster jetzt schließen.",
  raumGeschlossen: "Der Raum wurde geschlossen. Melde dich bitte bei deinem Ansprechpartner.",
  nichtEingelassen: "Der Gastgeber konnte dich nicht einlassen. Melde dich bitte telefonisch.",
  teilenGesperrt: "Dein Ansprechpartner gibt das Teilen frei, wenn du etwas zeigen sollst.",
  teilenLaeuft: "Das sieht dein Ansprechpartner gerade",
  stummgeschaltet: "{name} hat dein Mikrofon stummgeschaltet. Über den Ton-Knopf kannst du es wieder einschalten.",
  linkUngueltig: "Dieser Link ist nicht mehr gültig. Melde dich bitte bei deinem Ansprechpartner, dann bekommst du einen neuen.",
  linkAbgelaufen: "Dieser Link ist abgelaufen. Melde dich bitte bei deinem Ansprechpartner, dann bekommst du einen neuen.",
  schonBeendet: "Dieses Gespräch wurde bereits beendet. Melde dich bitte bei deinem Ansprechpartner.",
  nameFehlt: "Bitte gib deinen Namen ein.",
  zuOft: "Gerade wird dieser Raum sehr oft geöffnet. Versuch es bitte in ein paar Minuten noch einmal.",
  betretenFehlgeschlagen: "Der Raum konnte gerade nicht betreten werden. Lade die Seite bitte neu oder melde dich bei deinem Ansprechpartner.",
  gespraechTitel: "Beratungsgespräch",
};

/**
 * Die Bewerberfassung: derselbe Wortlaut, nur die Kopfzeile heißt anders.
 *
 * Ein Bewerber führt kein Beratungsgespräch, sondern ein Kennenlerngespräch.
 * Das ist keine Frage der Anrede, sondern des Anlasses, deshalb bleibt diese
 * eine Abweichung, obwohl beide Fassungen sonst gleich sind.
 */
const BEWERBER_TEXTE: GastTexte = { ...DU_TEXTE, gespraechTitel: "Kennenlerngespräch" };

/**
 * Die englische Fassung (Kundensprache, Etappe 3, S6).
 *
 * Nach dem Glossar (`kundenspracheGlossar.ts`): Der Berater heißt „your
 * contact“, nie „advisor“. Britisches Englisch, freundliches, direktes „you“
 * mit Kurzformen, so wie die Du-Fassung.
 */
export const EN_TEXTE: GastTexte = {
  ansprechpartnerTitel: "Your contact",
  ansprechpartnerPlatzhalter: "Your contact",
  agendaLeer: "Your contact will go through the meeting with you in a moment.",
  gleichDa: "{name} will be with you shortly",
  einrichten: "Take your time to get settled.",
  einrichtenObjekt: "In a moment we'll look at your property together. Take your time to get settled.",
  wartenGleich: "You'll be let in shortly. Please keep this window open.",
  wartenNaechster: "Another meeting is still running. You're next, so please keep this window open.",
  wartenPosition: "Someone is still waiting ahead of you. You're number {position} in line, so please keep this window open.",
  begruessungOben: "Great to have",
  begruessungUnten: "you here.",
  einrichtenVorher: "Before we start, take a moment to get set up. Your contact will only see you once you enter the room.",
  nurEigenesBild: "Only you can see this image",
  namensfeld: "Your name",
  dankeAmEnde: "Thank you for the meeting. You can close this window now.",
  raumGeschlossen: "The room has been closed. Please get in touch with your contact.",
  nichtEingelassen: "The host couldn't let you in. Please get in touch by phone.",
  teilenGesperrt: "Your contact will enable sharing if you need to show something.",
  teilenLaeuft: "This is what your contact can see right now",
  stummgeschaltet: "{name} has muted your microphone. You can turn it back on with the sound button.",
  linkUngueltig: "This link is no longer valid. Please get in touch with your contact and you'll receive a new one.",
  linkAbgelaufen: "This link has expired. Please get in touch with your contact and you'll receive a new one.",
  schonBeendet: "This meeting has already ended. Please get in touch with your contact.",
  nameFehlt: "Please enter your name.",
  zuOft: "This room is being opened very often right now. Please try again in a few minutes.",
  betretenFehlgeschlagen: "The room couldn't be entered just now. Please reload the page or get in touch with your contact.",
  gespraechTitel: "Consultation",
};

const BEWERBER_TEXTE_EN: GastTexte = { ...EN_TEXTE, gespraechTitel: "Introductory meeting" };

/** Beide Fassungen, für den Vollständigkeitstest (`textdateiLuecken`). */
export const GAST_TEXTE: ZweiSprachen<GastTexte> = { de: DU_TEXTE, en: EN_TEXTE };

/**
 * Der alte Platzhalter aus der Sie-Fassung.
 *
 * Er wurde beim Anlegen eines Raums in den Gastgeber-Abzug geschrieben und
 * kann dort in älteren Räumen noch stehen. Der Warteraum muss ihn weiter
 * erkennen, sonst wird er wie ein Name zerlegt.
 */
const ALTER_PLATZHALTER = "Ihr Ansprechpartner";

/** Welche Anrede zu diesem Anlass gehört: seit dem 15.09.2026 immer das Du. */
export function anredeFuer(_art: VideoraumArt | null | undefined): Anrede {
  return "du";
}

/**
 * Die Texte zu einer Anrede. Es gibt nur noch eine, also je Sprache immer
 * dieselben. Ohne Sprache Deutsch, so wie auf den Buchungsseiten.
 */
export function texteFuerAnrede(_anrede: Anrede, sprache: Sprache = "de"): GastTexte {
  return sprache === "en" ? EN_TEXTE : DU_TEXTE;
}

/** Die Texte zu einem Anlass, der Normalweg. Ohne Sprache Deutsch. */
export function gastTexte(art: VideoraumArt | null | undefined, sprache: Sprache = "de"): GastTexte {
  if (sprache === "en") return art === "bewerbergespraech" ? BEWERBER_TEXTE_EN : EN_TEXTE;
  return art === "bewerbergespraech" ? BEWERBER_TEXTE : DU_TEXTE;
}

/**
 * Setzt Platzhalter wie `{name}` in einen Text ein.
 *
 * Die Texte oben sind bewusst reine Zeichenketten mit Platzhaltern und keine
 * Funktionen: Nur so kann der Wächter alle Werte durchgehen und prüfen, dass
 * kein Sie mehr darin steht.
 */
export function mitWerten(vorlage: string, werte: Record<string, string | number>): string {
  return Object.entries(werte).reduce(
    (text, [schluessel, wert]) => text.split(`{${schluessel}}`).join(String(wert)),
    vorlage,
  );
}

/**
 * Ist das der Platzhalter statt eines echten Namens?
 *
 * Der Warteraum zerlegt einen Namen in seinen Vornamen. Aus „Dein
 * Ansprechpartner" würde dabei „Dein ist gleich für dich da". Geprüft wird
 * auch der alte Platzhalter „Ihr Ansprechpartner", denn er kann in Räumen
 * stehen, die vor der Umstellung angelegt wurden.
 */
export function istPlatzhalterName(name: string | null | undefined): boolean {
  const wert = (name || "").trim();
  if (!wert) return true;
  return wert === DU_TEXTE.ansprechpartnerPlatzhalter
    || wert === EN_TEXTE.ansprechpartnerPlatzhalter
    || wert === ALTER_PLATZHALTER;
}
