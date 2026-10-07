/**
 * Abwesenheit mit Vertretung.
 *
 * Bewusst ein direkter Supabase-Zugriff und nicht `dataCache`: Die Tabelle
 * `abwesenheiten` entsteht erst mit der Migration 20260807150000. Eine Tabelle
 * in die Ladeliste des Zwischenspeichers aufzunehmen, die es in der Datenbank
 * noch nicht gibt, reisst beim Start den gesamten Realtime-Kanal mit. Dasselbe
 * Muster nutzen `WebhookAudit.tsx` und `SessionAnomalien.tsx`.
 */
import { supabase } from "@/integrations/supabase/client";

/*
 * Die erzeugten Supabase-Typen kennen `abwesenheiten` noch nicht, die Tabelle
 * entsteht erst mit der Migration. Bis dahin derselbe Behelf wie in
 * partnerUnterlagenStore und anderswo im Projekt.
 */
const db = supabase as unknown as {
  from: (t: string) => any;
};

/** Name der Migration, die diese Tabelle anlegt. Wird dem Nutzer genannt. */
export const ABWESENHEIT_MIGRATION = "20260807150000_abwesenheit_und_vertretung.sql";

export interface Abwesenheit {
  id: string;
  user_id: string;
  /** Erster Tag der Abwesenheit, Format JJJJ-MM-TT. Zaehlt mit. */
  von: string;
  /** Letzter Tag der Abwesenheit, Format JJJJ-MM-TT. Zaehlt mit. */
  bis: string;
  vertretung_id: string | null;
  notiz: string | null;
}

interface DbFehler {
  code?: string;
  message?: string;
}

/**
 * Fehlt die Tabelle, ist die Migration noch nicht gelaufen. Postgres meldet
 * das als 42P01, PostgREST als PGRST205, und je nach Weg kommt nur der Text
 * an. Deshalb alle drei pruefen.
 */
export function istTabelleUnbekannt(fehler: DbFehler | null | undefined): boolean {
  if (!fehler) return false;
  if (fehler.code === "42P01" || fehler.code === "PGRST205" || fehler.code === "42703") return true;
  return /does not exist|schema cache/i.test(fehler.message || "");
}

export interface LadeErgebnis {
  eintraege: Abwesenheit[];
  /** Die Migration fehlt. Die Oberflaeche zeigt dann einen Hinweis statt Knoepfe. */
  migrationFehlt: boolean;
  fehler: string | null;
}

/** Alle Abwesenheiten einer Person, neueste zuerst. */
export async function ladeAbwesenheiten(userId: string): Promise<LadeErgebnis> {
  const { data, error } = await db
    .from("abwesenheiten")
    .select("id, user_id, von, bis, vertretung_id, notiz")
    .eq("user_id", userId)
    .order("von", { ascending: false });

  if (error) {
    if (istTabelleUnbekannt(error)) {
      return { eintraege: [], migrationFehlt: true, fehler: null };
    }
    return { eintraege: [], migrationFehlt: false, fehler: error.message };
  }
  return { eintraege: (data as unknown as Abwesenheit[]) || [], migrationFehlt: false, fehler: null };
}

/** Alle heute laufenden Abwesenheiten, unabhaengig von der Person. */
export async function ladeAktiveAbwesenheiten(): Promise<LadeErgebnis> {
  const heute = heutigesDatum();
  const { data, error } = await db
    .from("abwesenheiten")
    .select("id, user_id, von, bis, vertretung_id, notiz")
    .lte("von", heute)
    .gte("bis", heute);

  if (error) {
    if (istTabelleUnbekannt(error)) {
      return { eintraege: [], migrationFehlt: true, fehler: null };
    }
    return { eintraege: [], migrationFehlt: false, fehler: error.message };
  }
  return { eintraege: (data as unknown as Abwesenheit[]) || [], migrationFehlt: false, fehler: null };
}

export interface SpeicherEingabe {
  id?: string;
  userId: string;
  von: string;
  bis: string;
  vertretungId: string | null;
  notiz: string;
}

export interface SpeicherErgebnis {
  ok: boolean;
  /** Bereits uebersetzte Meldung fuer den Nutzer. */
  meldung?: string;
}

/** Legt eine Abwesenheit an oder aendert eine vorhandene. */
export async function speichereAbwesenheit(eingabe: SpeicherEingabe): Promise<SpeicherErgebnis> {
  const zeile = {
    user_id: eingabe.userId,
    von: eingabe.von,
    bis: eingabe.bis,
    vertretung_id: eingabe.vertretungId,
    notiz: eingabe.notiz.trim() || null,
  };

  const { error } = eingabe.id
    ? await db.from("abwesenheiten").update(zeile).eq("id", eingabe.id)
    : await db.from("abwesenheiten").insert(zeile);

  if (!error) return { ok: true };
  return { ok: false, meldung: fehlerText(error) };
}

export async function loescheAbwesenheit(id: string): Promise<SpeicherErgebnis> {
  const { error } = await db.from("abwesenheiten").delete().eq("id", id);
  if (!error) return { ok: true };
  return { ok: false, meldung: fehlerText(error) };
}

/**
 * Uebersetzt die Antwort der Datenbank in einen Satz, mit dem jemand etwas
 * anfangen kann. Die Pruefungen aus der Migration melden sich als
 * Ausnahmetext, die Zugriffskontrolle als leeres Ergebnis.
 */
function fehlerText(fehler: DbFehler): string {
  if (istTabelleUnbekannt(fehler)) {
    return `Die Datenbank kennt die Abwesenheiten noch nicht. Erst muss die Migration ${ABWESENHEIT_MIGRATION} ausgeführt werden.`;
  }
  const text = fehler.message || "";
  if (/abwesenheiten_zeitraum_gueltig/.test(text)) {
    return "Das Enddatum liegt vor dem Startdatum.";
  }
  if (/abwesenheiten_nicht_selbst/.test(text)) {
    return "Du kannst dich nicht selbst vertreten.";
  }
  if (/bereits eine Abwesenheit/.test(text)) {
    return "Für diesen Zeitraum ist bereits eine Abwesenheit eingetragen.";
  }
  if (/interner Nutzer/.test(text)) {
    return "Die gewählte Vertretung ist kein interner Nutzer.";
  }
  if (fehler.code === "42501" || /row-level security/i.test(text)) {
    return "Dafür fehlt dir die Berechtigung.";
  }
  return text || "Unbekannter Fehler.";
}

/** Heutiges Datum als JJJJ-MM-TT in lokaler Zeit, nicht in UTC. */
export function heutigesDatum(): string {
  const d = new Date();
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const tag = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${monat}-${tag}`;
}

/** Laeuft diese Abwesenheit heute? Beide Tage zaehlen mit. */
export function laeuftHeute(eintrag: Abwesenheit, heute = heutigesDatum()): boolean {
  return eintrag.von <= heute && eintrag.bis >= heute;
}

/** Deutsche Anzeige eines JJJJ-MM-TT-Datums. */
export function datumAnzeige(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

/**
 * Ist dieser Partner an einem Tag abwesend, und wenn ja, wie lange?
 *
 * Gebraucht von der Leadverteilung: Ein Lead, der an einen Abwesenden geht,
 * liegt bis zu dessen Rückkehr unbearbeitet. Christian hat am 14.09.2026
 * verfügt, dass die Zuweisung in diesem Zeitraum nicht möglich sein soll.
 *
 * Bewusst eine reine Funktion über einer schon geladenen Liste. Die
 * Zuweisung läuft an mehreren Stellen, und jede einzeln die Datenbank fragen
 * zu lassen hieße, bei einer Massenzuweisung hundert Abfragen zu schicken.
 */
export function abwesenheitAmTag(
  abwesenheiten: Abwesenheit[],
  userId: string,
  tag = heutigesDatum(),
): Abwesenheit | null {
  const id = (userId || "").trim();
  if (!id) return null;
  return abwesenheiten.find((a) => a.user_id === id && laeuftHeute(a, tag)) || null;
}

/**
 * Der Satz für die Oberfläche, wenn eine Zuweisung daran scheitert.
 *
 * Nennt den Zeitraum, denn ohne ihn bleibt die Frage offen, wann es denn
 * ginge. Ist eine Vertretung hinterlegt, gehört sie in denselben Satz: Dann
 * weiß derjenige, der zuweist, sofort, an wen stattdessen.
 */
export function abwesenheitGrundText(eintrag: Abwesenheit, vertretungName = ""): string {
  const zeitraum = `${datumAnzeige(eintrag.von)} bis ${datumAnzeige(eintrag.bis)}`;
  const vertretung = vertretungName.trim();
  return vertretung
    ? `Abwesend von ${zeitraum}. Vertretung: ${vertretung}.`
    : `Abwesend von ${zeitraum}.`;
}
