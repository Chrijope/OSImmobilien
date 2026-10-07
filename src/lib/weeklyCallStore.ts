import { supabase } from "@/integrations/supabase/client";
import {
  CALL_SCHNITT_MINUTE,
  CALL_SCHNITT_STUNDE,
  CALL_WOCHENTAG,
  type CallRunde,
} from "@/lib/weeklyCallZeit";

/**
 * Punkte für den Weekly Sales Call.
 *
 * Seit dem 26.08.2026 sieht jeder Teilnehmer alle Punkte eines Calls, vorher
 * nur seine eigenen. Die Umstellung steckt allein in der Datenbankfunktion
 * `weekly_call_punkte_lesen`, hier war dafür nichts zu ändern.
 *
 * Bewusst nicht über `dataCache`: Der lädt ganze Tabellen samt aller Spalten in
 * den Browser, und damit läge die Verfasser-ID jedes Punktes in jedem Client.
 * Anonym wäre die Liste dann nur optisch. Gelesen wird deshalb ausschließlich
 * über die Datenbankfunktionen, die keine Verfasser herausgeben, sondern nur
 * das Kennzeichen "von mir". Dasselbe Muster nutzt `videoraumStore.ts`.
 *
 * Seit dem 05.10.2026 gibt es zwei Calls am Montag (19:00 Lead-Berater, 19:30
 * Vertriebspartner), und jeder Punkt gehört zu genau einem (`call_runde`). Wer
 * welchen Call sieht, entscheidet die Datenbank (`weekly_call_runden`), ohne
 * Angabe eines Calls liefert sie alle eigenen.
 *
 * Solange die Migration 20261005160000 nicht gelaufen ist, gibt es weder die
 * Spalte noch die neuen Parameter. Dann bleiben Lesen und Eintragen aus, statt
 * auf die alte, ungetrennte Liste zurückzufallen; die Seite zeigt einen
 * ruhigen Hinweis.
 *
 * Nichts wird gelöscht. Jeder Punkt trägt den Termin des Calls, für den er
 * gedacht war. Die Karte zeigt den anstehenden Call, ältere bleiben als
 * Rückschau erhalten.
 */

export interface WeeklyCallPunkt {
  id: string;
  text: string;
  callTermin: string;
  /** Eigener Punkt? Nur dann lässt er sich ändern oder löschen. */
  vonMir: boolean;
  besprochen: boolean;
  erstelltAm: string;
}

export interface WeeklyCallTermin {
  callTermin: string;
  anzahl: number;
}

export interface WeeklyCallProtokoll {
  callTermin: string;
  aufzeichnungUrl?: string;
  dokumentPfad?: string;
  dokumentName?: string;
  notiz?: string;
}

/** Höchstlänge eines Punktes, gleich der Prüfung in der Datenbank. */
export const PUNKT_MAX_ZEICHEN = 300;

/**
 * Der Call, zu dem ein Zeitpunkt gehört.
 *
 * Wochentag und Schnitt stehen in `weeklyCallZeit.ts`. Der Schnitt liegt für
 * beide Calls um 20:30, eine Stunde nach dem Start um 19:30. Dieselbe Regel
 * wie `weekly_call_woche()` in der Datenbank und `naechsterWeeklyCall()` in
 * der Karte. Wer hier etwas ändert, muss es dort ebenfalls tun.
 */
export function aktuellerCallTermin(jetzt: Date = new Date()): string {
  const d = new Date(jetzt);
  const abstand = (CALL_WOCHENTAG - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + abstand);
  d.setHours(CALL_SCHNITT_STUNDE, CALL_SCHNITT_MINUTE, 0, 0);
  if (jetzt.getTime() > d.getTime()) d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Die Punkte eines Calls, ohne Verfasser.
 *
 * `runde` beschränkt auf einen der beiden Calls, ohne Angabe kommen alle, die
 * der Nutzer sehen darf.
 *
 * Wirft nie. Bei jedem Fehler, auch wenn Migration 20261005160000 noch nicht
 * gelaufen ist, gibt es `null`. Bewusst kein Rückfall auf die alte, gemeinsame
 * Liste: Die zeigte jedem die Punkte beider Calls.
 */
export async function ladePunkte(termin?: string, runde?: CallRunde): Promise<WeeklyCallPunkt[] | null> {
  try {
    const { data, error } = await (supabase as any).rpc("weekly_call_punkte_lesen", {
      _termin: termin ?? null,
      _runde: runde ?? null,
    });
    if (error) return null;
    return ((data || []) as any[]).map((z) => ({
      id: z.id,
      text: z.text,
      callTermin: z.call_termin,
      vonMir: !!z.von_mir,
      besprochen: !!z.besprochen,
      erstelltAm: z.created_at,
    }));
  } catch {
    return null;
  }
}

/** Alle Calls, zu denen es Punkte (des Calls `runde`) oder ein Protokoll gibt, neueste zuerst. */
export async function ladeTermine(runde?: CallRunde): Promise<WeeklyCallTermin[]> {
  try {
    const { data, error } = await (supabase as any).rpc("weekly_call_termine", { _runde: runde ?? null });
    if (error) return [];
    return ((data || []) as any[]).map((z) => ({
      callTermin: z.call_termin,
      anzahl: Number(z.anzahl) || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Trägt einen Punkt für den Call `runde` ein. Die Datenbank prüft, ob man ihn
 * sieht. Ohne die Spalte `call_runde` schlägt es fehl, und das ist gewollt:
 * Ein Punkt ohne Call landete später beim falschen.
 */
export async function legePunktAn(text: string, runde: CallRunde): Promise<boolean> {
  const sauber = text.trim();
  if (!sauber || sauber.length > PUNKT_MAX_ZEICHEN) return false;
  const { data: sitzung } = await supabase.auth.getUser();
  const uid = sitzung?.user?.id;
  if (!uid) return false;
  const { error } = await (supabase as any)
    .from("weekly_call_punkte")
    .insert({ user_id: uid, text: sauber, call_runde: runde });
  return !error;
}

export async function aenderePunkt(id: string, text: string): Promise<boolean> {
  const sauber = text.trim();
  if (!sauber || sauber.length > PUNKT_MAX_ZEICHEN) return false;
  const { error } = await (supabase as any)
    .from("weekly_call_punkte")
    .update({ text: sauber })
    .eq("id", id);
  return !error;
}

export async function loeschePunkt(id: string): Promise<boolean> {
  const { error } = await (supabase as any).from("weekly_call_punkte").delete().eq("id", id);
  return !error;
}

export async function hakePunktAb(id: string, besprochen: boolean): Promise<boolean> {
  const { error } = await (supabase as any).rpc("weekly_call_punkt_abhaken", {
    _id: id,
    _besprochen: besprochen,
  });
  return !error;
}

export async function ladeProtokoll(termin: string): Promise<WeeklyCallProtokoll | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("weekly_call_protokolle")
      .select("call_termin, aufzeichnung_url, dokument_pfad, dokument_name, notiz")
      .eq("call_termin", termin)
      .maybeSingle();
    if (error || !data) return null;
    return {
      callTermin: data.call_termin,
      aufzeichnungUrl: data.aufzeichnung_url || undefined,
      dokumentPfad: data.dokument_pfad || undefined,
      dokumentName: data.dokument_name || undefined,
      notiz: data.notiz || undefined,
    };
  } catch {
    return null;
  }
}

export async function speichereProtokoll(
  termin: string,
  werte: Partial<Omit<WeeklyCallProtokoll, "callTermin">>,
): Promise<boolean> {
  const { data: sitzung } = await supabase.auth.getUser();
  const { error } = await (supabase as any).from("weekly_call_protokolle").upsert(
    {
      call_termin: termin,
      ...(werte.aufzeichnungUrl !== undefined ? { aufzeichnung_url: werte.aufzeichnungUrl || null } : {}),
      ...(werte.dokumentPfad !== undefined ? { dokument_pfad: werte.dokumentPfad || null } : {}),
      ...(werte.dokumentName !== undefined ? { dokument_name: werte.dokumentName || null } : {}),
      ...(werte.notiz !== undefined ? { notiz: werte.notiz || null } : {}),
      gepflegt_von: sitzung?.user?.id || null,
    },
    { onConflict: "call_termin" },
  );
  return !error;
}

/** Lädt Transkript oder Zusammenfassung hoch und merkt sich den Pfad. */
export async function ladeDokumentHoch(termin: string, datei: File): Promise<boolean> {
  const endung = datei.name.split(".").pop()?.toLowerCase() || "pdf";
  const pfad = `${termin}/${crypto.randomUUID()}.${endung}`;
  const { error } = await supabase.storage.from("weekly-call").upload(pfad, datei, {
    contentType: datei.type || "application/pdf",
    upsert: false,
  });
  if (error) return false;
  return speichereProtokoll(termin, { dokumentPfad: pfad, dokumentName: datei.name });
}

/**
 * Weitere Anhänge zu einem Call, neben Transkript und Zusammenfassung.
 *
 * Bewusst ohne eigene Tabelle: Die Dateien liegen im selben Ablageordner unter
 * "<Calltermin>/anhaenge/" und werden von dort gelesen. Der ursprüngliche
 * Dateiname steht hinter einem doppelten Unterstrich im Dateinamen, davor
 * steht eine Zufallskennung, damit sich gleichnamige Dateien nicht überholen.
 */
export interface WeeklyCallAnhang {
  pfad: string;
  name: string;
  groesse?: number;
}

const ANHANG_TRENNER = "__";

export async function ladeAnhaenge(termin: string): Promise<WeeklyCallAnhang[]> {
  try {
    const { data, error } = await supabase.storage
      .from("weekly-call")
      .list(`${termin}/anhaenge`, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
    if (error || !data) return [];
    return data
      .filter((d) => d.name && d.name !== ".emptyFolderPlaceholder")
      .map((d) => ({
        pfad: `${termin}/anhaenge/${d.name}`,
        name: d.name.split(ANHANG_TRENNER).slice(1).join(ANHANG_TRENNER) || d.name,
        groesse: (d as any)?.metadata?.size,
      }));
  } catch {
    return [];
  }
}

export async function ladeAnhangHoch(termin: string, datei: File): Promise<string | null> {
  const sicher = datei.name.replace(/[^\w.\- ]+/g, "_");
  const pfad = `${termin}/anhaenge/${crypto.randomUUID()}${ANHANG_TRENNER}${sicher}`;
  const { error } = await supabase.storage.from("weekly-call").upload(pfad, datei, {
    contentType: datei.type || "application/octet-stream",
    upsert: false,
  });
  // Die Ablage lässt nur bestimmte Dateiarten zu. Die Meldung wandert nach
  // oben, damit der Nutzer den Grund sieht und nicht nur ein "hat nicht
  // geklappt".
  return error ? error.message || "Upload fehlgeschlagen" : null;
}

export async function loescheAnhang(pfad: string): Promise<boolean> {
  const { error } = await supabase.storage.from("weekly-call").remove([pfad]);
  return !error;
}

/**
 * Zeitlich begrenzte Adresse zum Öffnen des Dokuments.
 *
 * Der Ablageordner ist nicht öffentlich, ein fester Link würde also nicht
 * funktionieren.
 */
export async function dokumentAdresse(pfad: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from("weekly-call")
      .createSignedUrl(pfad, 60 * 60);
    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

/** "24.08.2026" für die Überschrift eines Calls. */
export function formatCallTermin(termin: string): string {
  const [j, m, t] = termin.split("-").map(Number);
  if (!j || !m || !t) return termin;
  return new Date(j, m - 1, t).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
