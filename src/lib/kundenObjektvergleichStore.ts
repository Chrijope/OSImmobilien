/**
 * Gespeicherte persönliche Objektvergleiche (Christian, 28.10.2026).
 *
 * Liegen in `investment_berechnungen` mit gefüllter Spalte `vergleich`
 * (Migration 20261028220000), damit dieselben Rechte gelten wie für jede
 * Berechnung. Gespeichert wird am Investment des Kunden; ohne Kunde und
 * Investment lässt sich ein Vergleich erstellen und herunterladen, aber nicht
 * speichern.
 */
import { supabase } from "@/integrations/supabase/client";
import { vergleichAusJson, type KundenObjektvergleich } from "@/lib/investmentrechner/kundenObjektvergleich";

// Die Spalte ist neuer als die erzeugten Supabase-Typen, wie in investmentBerechnungenStore.ts.
const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface GespeicherterVergleich {
  id: string;
  name: string;
  investmentId: string;
  kontaktId: string;
  geaendertAm: string;
  vergleich: KundenObjektvergleich;
}

function zeile(z: Record<string, unknown>): GespeicherterVergleich | null {
  const vergleich = vergleichAusJson(z.vergleich);
  if (!vergleich) return null;
  return {
    id: String(z.id), name: String(z.name || ""), investmentId: String(z.investment_id),
    kontaktId: String(z.kontakt_id), geaendertAm: String(z.geaendert_am || ""), vergleich,
  };
}

const SPALTEN = "id, name, investment_id, kontakt_id, geaendert_am, vergleich";

/** Alle Vergleiche eines Kunden, der neueste zuerst. */
export async function ladeVergleiche(kontaktId: string): Promise<GespeicherterVergleich[]> {
  const { data, error } = await db.from("investment_berechnungen").select(SPALTEN)
    .eq("kontakt_id", kontaktId).not("vergleich", "is", null).order("geaendert_am", { ascending: false });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(zeile).filter((v): v is GespeicherterVergleich => !!v);
}

export async function ladeVergleich(id: string): Promise<GespeicherterVergleich | null> {
  const { data, error } = await db.from("investment_berechnungen").select(SPALTEN).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? zeile(data as Record<string, unknown>) : null;
}

/** Neu anlegen (ohne `id`) oder überschreiben; liefert die Kennung. */
export async function speichereVergleich(v: KundenObjektvergleich, name: string, id?: string | null): Promise<string> {
  if (!v.kontaktId || !v.investmentId) throw new Error("Zum Speichern bitte zuerst Kunde und Investment wählen.");
  const felder = { name, vergleich: v, investment_id: v.investmentId, kontakt_id: v.kontaktId, wohnung_id: v.einheiten[0]?.wohnungId ?? null };
  if (id) {
    const { error } = await db.from("investment_berechnungen").update(felder).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await db.from("investment_berechnungen").insert(felder).select("id").single();
  if (error) throw error;
  return String((data as { id: string }).id);
}

export async function loescheVergleich(id: string): Promise<void> {
  const { error } = await db.from("investment_berechnungen").delete().eq("id", id);
  if (error) throw error;
}
