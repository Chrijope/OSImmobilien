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

export type KalenderTyp = "google" | "apple";

export interface KalenderVerknuepfung {
  typ: KalenderTyp;
  eventId: string;
  url?: string;
}

export interface TerminDaten {
  titel: string;
  beschreibung?: string;
  ort?: string;
  /** Beginn als ISO-Zeitpunkt. */
  start: string;
  dauerMinuten?: number;
}

interface GoogleEinstellung { connected?: boolean }

/**
 * Welchen Kalender hat dieser Nutzer verbunden?
 *
 * Achtung, die beiden liegen an unterschiedlichen Stellen: Google steckt im
 * JSONB-Feld `einstellungen`, Apple in einer eigenen Spalte `apple_calendar`
 * derselben Zeile. Wer beides verbunden hat, bekommt seine CRM-Termine in
 * Google, weil dort die Erneuerung des Zugangs zuverlaessiger laeuft.
 */
export function verbundenerKalender(): KalenderTyp | null {
  const google = getUserSetting<GoogleEinstellung | null>("google_calendar", null);
  if (google?.connected) return "google";

  const benutzerId = getCurrentUserId();
  const zeilen = cacheGet("user_settings") as Array<{ user_id?: string; apple_calendar?: { connected?: boolean } }>;
  const zeile = zeilen.find((r) => !benutzerId || r.user_id === benutzerId);
  if (zeile?.apple_calendar?.connected) return "apple";
  return null;
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

function funktionsName(typ: KalenderTyp): string {
  return typ === "google" ? "google-calendar" : "apple-calendar";
}

export async function legeTerminAn(
  daten: TerminDaten,
  schalter: SyncSchalter = "termine",
): Promise<KalenderVerknuepfung | null> {
  const typ = verbundenerKalender();
  if (!typ || !abgleichAktiv(schalter)) return null;

  try {
    const { data, error } = await supabase.functions.invoke(funktionsName(typ), {
      body: {
        action: "create-event",
        titel: daten.titel,
        beschreibung: daten.beschreibung,
        ort: daten.ort,
        start: daten.start,
        dauerMinuten: daten.dauerMinuten ?? 60,
      },
    });
    if (error) throw error;
    const antwort = data as { ok?: boolean; eventId?: string; error?: string };
    if (antwort?.error || !antwort?.eventId) {
      console.warn("Kalendereintrag nicht angelegt:", antwort?.error);
      return null;
    }
    return { typ, eventId: antwort.eventId };
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
    const { data, error } = await supabase.functions.invoke(funktionsName(verknuepfung.typ), {
      body: {
        action: "update-event",
        eventId: verknuepfung.eventId,
        calendarUrl: verknuepfung.url,
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
    const { data, error } = await supabase.functions.invoke(funktionsName(verknuepfung.typ), {
      body: {
        action: "delete-event",
        eventId: verknuepfung.eventId,
        calendarUrl: verknuepfung.url,
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
