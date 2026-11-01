import { supabase } from "@/integrations/supabase/client";
import { getUserSetting } from "@/lib/userSettingsCache";
import { cacheGet } from "@/lib/dataCache";
import { getCurrentUserId } from "@/lib/currentUser";

/**
 * Termine aus dem CRM in den eigenen Kalender des Mitarbeiters schreiben.
 *
 * Jeder verbindet in den Einstellungen entweder Google oder iCloud, beides
 * geht auch gleichzeitig. Wer nichts verbindet, merkt von diesem Modul
 * nichts: Dann bleibt der Termin wie bisher nur im CRM.
 *
 * Grundsatz: Der Kalenderabgleich darf nie den eigentlichen Vorgang
 * aufhalten. Wenn iCloud gerade zickt, ist der Termin trotzdem angelegt.
 * Deshalb meldet dieses Modul Fehler nur in der Konsole zurueck und wirft
 * nichts nach oben.
 */

/** „apple“ steht in älteren Verknüpfungen für iCloud, neue heißen „caldav“. */
export type KalenderTyp = "google" | "apple" | "microsoft" | "caldav";

export interface KalenderVerknuepfung {
  typ: KalenderTyp;
  eventId: string;
  url?: string;
  /** Seit 01.11.2026: die Verbindung, in der der Eintrag steht. */
  verbindungId?: string;
}

export interface TerminDaten {
  titel: string;
  beschreibung?: string;
  ort?: string;
  /** Beginn als ISO-Zeitpunkt. */
  start: string;
  dauerMinuten?: number;
}

/** Eine Zeile aus `kalender_verbindungen`, ohne Zugangsdaten (die liegen im Tresor). */
export interface KalenderVerbindung {
  id: string;
  art: "google" | "microsoft" | "caldav" | "abo";
  konto: string;
  kalender: { id: string; name: string; primary?: boolean }[];
  schreibziel: boolean;
  letzter_fehler: string | null;
}

let verbindungen: KalenderVerbindung[] | null = null;

/**
 * Die verbundenen Kalender des Nutzers, einmal geladen und dann gemerkt.
 * Mit `neu` nach einer Änderung frisch aus der Datenbank. Fehler ergeben eine
 * leere Liste: Der Kalenderabgleich darf nie den eigentlichen Vorgang aufhalten.
 */
export async function ladeKalenderVerbindungen(neu = false): Promise<KalenderVerbindung[]> {
  if (verbindungen && !neu) return verbindungen;
  try {
    const { data } = await supabase
      .from("kalender_verbindungen" as never)
      .select("id, art, konto, kalender, schreibziel, letzter_fehler")
      .order("erstellt_am");
    verbindungen = (data as unknown as KalenderVerbindung[]) ?? [];
  } catch {
    verbindungen = verbindungen ?? [];
  }
  return verbindungen;
}

/**
 * Wohin neue CRM-Termine geschrieben werden: die Art des Kalenders, der als
 * Ziel gewählt ist (in den Einstellungen unter Kalender). Vor dem ersten
 * Laden null; `legeTerminAn` lädt deshalb vorher.
 */
export function verbundenerKalender(): KalenderTyp | null {
  const ziel = verbindungen?.find((v) => v.schreibziel && v.art !== "abo");
  return ziel ? (ziel.art as KalenderTyp) : null;
}

/**
 * Die Schalter unter Einstellungen, Kalender, Abschnitt Synchronisation.
 * Jeder Schalter steuert genau eine Art von Eintrag.
 */
export type SyncSchalter = "termine" | "followUp";

/**
 * Soll der Abgleich fuer diese Art von Eintrag laufen?
 *
 * Standard ist an: Wer einen Kalender verbindet, will seine Termine und
 * Erinnerungen auch dort sehen. Nur ein ausdrueckliches `false` schaltet ab.
 */
export function abgleichAktiv(schalter: SyncSchalter): boolean {
  const kalender = getUserSetting<{ syncOptionen?: Partial<Record<SyncSchalter, boolean>> } | null>(
    "kalender",
    null,
  );
  return kalender?.syncOptionen?.[schalter] !== false;
}

/** Kurzform fuer den Schalter "Termine automatisch eintragen". */
export function terminAbgleichAktiv(): boolean {
  return abgleichAktiv("termine");
}

export async function legeTerminAn(
  daten: TerminDaten,
  schalter: SyncSchalter = "termine",
): Promise<KalenderVerknuepfung | null> {
  if (!abgleichAktiv(schalter)) return null;
  await ladeKalenderVerbindungen();
  if (!verbundenerKalender()) return null;

  try {
    const { data, error } = await supabase.functions.invoke("kalender", {
      body: {
        aktion: "anlegen",
        titel: daten.titel,
        beschreibung: daten.beschreibung,
        ort: daten.ort,
        start: daten.start,
        dauerMinuten: daten.dauerMinuten ?? 60,
      },
    });
    if (error) throw error;
    const antwort = data as { ok?: boolean; eventId?: string; verbindungId?: string; typ?: KalenderTyp; error?: string };
    if (antwort?.error || !antwort?.eventId) {
      console.warn("Kalendereintrag nicht angelegt:", antwort?.error);
      return null;
    }
    return { typ: antwort.typ ?? "google", eventId: antwort.eventId, verbindungId: antwort.verbindungId };
  } catch (fehler) {
    console.warn("Kalendereintrag nicht angelegt:", fehler);
    return null;
  }
}

export async function aendereTermin(
  verknuepfung: KalenderVerknuepfung,
  daten: TerminDaten,
): Promise<boolean> {
  if (!terminAbgleichAktiv()) return false;
  try {
    const { data, error } = await supabase.functions.invoke("kalender", {
      body: {
        aktion: "aendern",
        typ: verknuepfung.typ,
        verbindungId: verknuepfung.verbindungId,
        eventId: verknuepfung.url || verknuepfung.eventId,
        titel: daten.titel,
        beschreibung: daten.beschreibung,
        ort: daten.ort,
        start: daten.start,
        dauerMinuten: daten.dauerMinuten ?? 60,
      },
    });
    if (error) throw error;
    return Boolean((data as { ok?: boolean })?.ok);
  } catch (fehler) {
    console.warn("Kalendereintrag nicht geändert:", fehler);
    return false;
  }
}

export async function loescheTermin(verknuepfung: KalenderVerknuepfung): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("kalender", {
      body: {
        aktion: "loeschen",
        typ: verknuepfung.typ,
        verbindungId: verknuepfung.verbindungId,
        eventId: verknuepfung.url || verknuepfung.eventId,
      },
    });
    if (error) throw error;
    return Boolean((data as { ok?: boolean })?.ok);
  } catch (fehler) {
    console.warn("Kalendereintrag nicht gelöscht:", fehler);
    return false;
  }
}

/**
 * Datum und Uhrzeit, wie sie im CRM an einer Aktivitaet stehen, zu einem
 * Zeitpunkt zusammensetzen. Fehlt die Uhrzeit, nehmen wir neun Uhr, sonst
 * landet der Termin um Mitternacht im Kalender.
 */
export function terminZeitpunkt(faelligAm?: string, uhrzeit?: string): string | null {
  if (!faelligAm) return null;
  const tag = faelligAm.slice(0, 10);
  const zeit = /^\d{1,2}:\d{2}/.test(uhrzeit ?? "") ? (uhrzeit as string).slice(0, 5) : "09:00";
  const zeitpunkt = new Date(`${tag}T${zeit.padStart(5, "0")}:00`);
  if (Number.isNaN(zeitpunkt.getTime())) return null;
  return zeitpunkt.toISOString();
}

/** Ein Follow-up ist eine kurze Erinnerung, kein Beratungsgespraech. */
const FOLLOW_UP_DAUER_MINUTEN = 30;

/**
 * Ein Follow-up in die Form bringen, die der Kalender braucht.
 *
 * Bewusst als reine Umrechnung ohne Datenbank und ohne Netz, damit sie sich
 * pruefen laesst. Ohne brauchbares Faelligkeitsdatum kommt null zurueck, dann
 * wird nichts eingetragen.
 */
export function followUpTerminDaten(followUp: {
  titel?: string;
  beschreibung?: string;
  kundeName?: string;
  faelligAm?: string;
  uhrzeit?: string;
}): TerminDaten | null {
  const start = terminZeitpunkt(followUp.faelligAm, followUp.uhrzeit);
  if (!start) return null;

  const titel = (followUp.titel || "").trim();
  const kunde = (followUp.kundeName || "").trim();
  const beschreibung = (followUp.beschreibung || "").trim();
  // Ohne eigenen Titel bleibt es beim schlichten "Follow-up", sonst stünde
  // "Follow-up: Follow-up" im Kalender.
  const kopf = titel ? `Follow-up: ${titel}` : "Follow-up";

  return {
    titel: kunde ? `${kopf} (${kunde})` : kopf,
    beschreibung: beschreibung || undefined,
    start,
    dauerMinuten: FOLLOW_UP_DAUER_MINUTEN,
  };
}

/** Aus "60 Minuten", "1,5 Std", "45" die Minutenzahl herausziehen. */
export function dauerInMinuten(dauer?: string, standard = 60): number {
  if (!dauer) return standard;
  const text = dauer.toLowerCase().replace(",", ".");
  const zahl = parseFloat(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(zahl) || zahl <= 0) return standard;
  if (/std|stunde|h\b/.test(text)) return Math.round(zahl * 60);
  return Math.round(zahl);
}
