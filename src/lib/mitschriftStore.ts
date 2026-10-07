/**
 * Datenzugriff fuer die Gespraechs-Mitschriften.
 *
 * Bewusst nicht ueber `dataCache`: Eine Mitschrift ist ein sehr grosser
 * Datensatz, den fast niemand braucht. Sie beim Start der App fuer alle
 * Kontakte in den Arbeitsspeicher zu ziehen waere Verschwendung. Sie wird
 * geholt, wenn jemand die Kundenakte oeffnet, und sonst nie. Dasselbe Muster
 * wie in `videoraumStore.ts`.
 *
 * Die Tabelle kommt aus der Migration
 * `20260804210000_gespraech_mitschriften.sql`. Solange die nicht gelaufen ist,
 * liefert jede Abfrage hier eine leere Liste statt eines Fehlers, damit die
 * Kundenakte auch ohne sie vollstaendig funktioniert.
 */

import { supabase } from "@/integrations/supabase/client";
import { isTestAccount } from "./dbStoreHelper";
import { addAktivitaetSicher } from "./aktivitaetenStore";
import { mitschriftAlsText, modellId, type MitschriftZeile } from "./mitschrift";
import { baueMitschriftKurzfassung } from "./mitschriftZusammenfassung";

const db = supabase as any;

const TABELLE = "gespraech_mitschriften";

export interface MitschriftEintrag {
  id: string;
  raumId: string | null;
  kontaktId: string | null;
  investmentId: string | null;
  aktivitaetId: string | null;
  gastgeberId: string;
  begonnenAt: string | null;
  beendetAt: string | null;
  dauerSekunden: number;
  zeilen: MitschriftZeile[];
  volltext: string;
  zusammenfassung: string;
  modell: string | null;
  createdAt: string;
}

/** Zeilen robust einlesen, auch wenn im JSONB Unerwartetes steht. */
function leseZeilen(roh: unknown): MitschriftZeile[] {
  if (!Array.isArray(roh)) return [];
  return roh
    .map((z: any) => ({
      zeitpunkt: Number.isFinite(Number(z?.zeitpunkt)) ? Number(z.zeitpunkt) : 0,
      sprecher: typeof z?.sprecher === "string" ? z.sprecher : "",
      text: typeof z?.text === "string" ? z.text : "",
    }))
    .filter((z) => z.text !== "");
}

function ausZeile(r: any): MitschriftEintrag {
  return {
    id: r.id,
    raumId: r.raum_id ?? null,
    kontaktId: r.kontakt_id ?? null,
    investmentId: r.investment_id ?? null,
    aktivitaetId: r.aktivitaet_id ?? null,
    gastgeberId: r.gastgeber_id,
    begonnenAt: r.begonnen_at ?? null,
    beendetAt: r.beendet_at ?? null,
    dauerSekunden: Number(r.dauer_sekunden) || 0,
    zeilen: leseZeilen(r.zeilen),
    volltext: r.volltext || "",
    zusammenfassung: r.zusammenfassung || "",
    modell: r.modell ?? null,
    createdAt: r.created_at,
  };
}

/**
 * Alle Mitschriften eines Kontakts, neueste zuerst.
 *
 * Fehlt die Tabelle oder greift die Zugriffsregel, kommt eine leere Liste
 * zurueck. Die Kundenakte soll deswegen nicht kaputtgehen.
 */
export async function ladeMitschriften(kontaktId: string): Promise<MitschriftEintrag[]> {
  if (!kontaktId || isTestAccount()) return [];
  try {
    const { data, error } = await db
      .from(TABELLE)
      .select("*")
      .eq("kontakt_id", kontaktId)
      .order("beendet_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.warn("Mitschriften nicht geladen:", error.message);
      return [];
    }
    return (data || []).map(ausZeile);
  } catch (e) {
    console.warn("Mitschriften nicht geladen:", e);
    return [];
  }
}

/**
 * Alle Mitschriften zu bestimmten Videoräumen, neueste zuerst.
 *
 * Der Weg über den Raum statt über den Kontakt, für alles, was kein Kontakt
 * ist. Ein Bewerbergespräch ist genau so ein Fall: Der Raum trägt bewusst
 * keine Kontaktkennung ("Ein Bewerber ist kein Kontakt", Migration
 * 20260908160000), und ohne diesen Weg wäre die Mitschrift zwar gespeichert,
 * aber nirgends wiederzufinden.
 *
 * Wer sie sehen darf, entscheidet die Zeilensicherheit auf
 * `gespraech_mitschriften`: die Gastgeberin des Gesprächs und Admin
 * beziehungsweise Inhaber. Für alle anderen kommt hier schlicht eine leere
 * Liste zurück, hier wird keine eigene Regel erfunden.
 */
export async function ladeMitschriftenZuRaeumen(raumIds: string[]): Promise<MitschriftEintrag[]> {
  const ids = raumIds.filter(Boolean);
  if (ids.length === 0 || isTestAccount()) return [];
  try {
    const { data, error } = await db
      .from(TABELLE)
      .select("*")
      .in("raum_id", ids)
      .order("beendet_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      console.warn("Mitschriften zum Raum nicht geladen:", error.message);
      return [];
    }
    return (data || []).map(ausZeile);
  } catch (e) {
    console.warn("Mitschriften zum Raum nicht geladen:", e);
    return [];
  }
}

export interface MitschriftSpeichern {
  zeilen: MitschriftZeile[];
  kontaktId?: string | null;
  investmentId?: string | null;
  raumId?: string | null;
  begonnenAt?: string | null;
  dauerSekunden?: number;
  /** Titel der Aktivitaet in der Kundenakte, sonst eine sachliche Vorgabe. */
  titel?: string;
  /** Name des Beraters fuer die Aktivitaet. */
  von?: string;
}

/**
 * Legt die Mitschrift ab und traegt sie in die Kundenakte ein.
 *
 * Zwei Schritte, in dieser Reihenfolge:
 *   1. Der volle Text kommt in `gespraech_mitschriften`.
 *   2. In der Kundenakte entsteht eine Aktivitaet der Art
 *      `meeting_protokoll` mit der Kurzfassung. Die Aktivitaets-Kennung wird
 *      anschliessend an der Mitschrift vermerkt.
 *
 * Faellt Schritt 1 aus, weil die Migration noch nicht gelaufen ist, entsteht
 * trotzdem die Aktivitaet mit der Kurzfassung. Lieber eine Notiz in der Akte
 * als gar nichts, das Gespraech laesst sich schliesslich nicht wiederholen.
 */
export async function speichereMitschrift(
  eingabe: MitschriftSpeichern,
): Promise<MitschriftEintrag | null> {
  const zeilen = Array.isArray(eingabe.zeilen) ? eingabe.zeilen.filter((z) => z?.text?.trim()) : [];
  if (zeilen.length === 0) return null;

  const kurz = baueMitschriftKurzfassung(zeilen, { dauerSekunden: eingabe.dauerSekunden });
  const volltext = mitschriftAlsText(zeilen);
  const titel = eingabe.titel?.trim() || "Mitschrift des Videogespraechs";

  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));

  let gespeichert: MitschriftEintrag | null = null;
  if (user?.id && !isTestAccount()) {
    try {
      const { data, error } = await db
        .from(TABELLE)
        .insert({
          raum_id: eingabe.raumId || null,
          kontakt_id: eingabe.kontaktId || null,
          investment_id: eingabe.investmentId || null,
          gastgeber_id: user.id,
          begonnen_at: eingabe.begonnenAt || null,
          beendet_at: new Date().toISOString(),
          dauer_sekunden: Math.round(eingabe.dauerSekunden || kurz.dauerSekunden || 0),
          zeilen,
          volltext,
          zusammenfassung: kurz.text,
          modell: modellId(),
        })
        .select()
        .single();
      if (error) throw error;
      gespeichert = ausZeile(data);
    } catch (e) {
      console.warn("Mitschrift nicht gespeichert, Kundenakte bekommt trotzdem eine Notiz:", e);
    }
  }

  if (eingabe.kontaktId) {
    const aktivitaet = await addAktivitaetSicher({
      kundeId: eingabe.kontaktId,
      art: "meeting_protokoll",
      beschreibung: titel,
      // Ohne gespeicherte Mitschrift ist die Aktivitaet die einzige Spur des
      // Gespraechs. Dann kommt der volle Text mit hinein.
      details: gespeichert
        ? [kurz.kennzahlen, kurz.text].filter(Boolean).join("\n")
        : [kurz.kennzahlen, "", volltext].filter(Boolean).join("\n"),
      dauer: kurz.kennzahlen || undefined,
      von: eingabe.von,
    });

    if (gespeichert && aktivitaet?.id) {
      try {
        await db.from(TABELLE).update({ aktivitaet_id: aktivitaet.id }).eq("id", gespeichert.id);
        gespeichert = { ...gespeichert, aktivitaetId: aktivitaet.id };
      } catch (e) {
        console.warn("Mitschrift nicht mit der Aktivitaet verknuepft:", e);
      }
    }
  }

  return gespeichert;
}
