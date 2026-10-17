/**
 * Projektsicht des Eigentümers je Objekt (17.10.2026): was der Ankauf und die
 * Aufteilung gekostet haben, was je Einheit an Marge bleibt, wie weit der
 * Abverkauf ist und wann Kaufpreise hereinkommen.
 *
 * Zwei Orte, weil `objekte.meta` jede interne Rolle lesen kann, auch
 * Vertriebspartner:
 *   - die Kalkulation (Geld) in der Tabelle `objekt_kalkulation`, lesen nur
 *     Admin, Inhaber und der Objektpartner am eigenen Objekt;
 *   - Meilensteine der Aufteilung und Reservierungsdauer in
 *     `objekte.meta.aufteilung`, damit auch das Backoffice die Fristen sieht.
 */
import { supabase } from "@/integrations/supabase/client";
import { cacheGet } from "./dataCache";

export type Meilenstein = "ankauf" | "abgeschlossenheit" | "teilungserklaerung" | "grundbuchblaetter" | "weg" | "verwalter" | "abnahme";

export const MEILENSTEINE: { schluessel: Meilenstein; titel: string }[] = [
  { schluessel: "ankauf", titel: "Ankauf (Besitzübergang)" },
  { schluessel: "abgeschlossenheit", titel: "Abgeschlossenheitsbescheinigung" },
  { schluessel: "teilungserklaerung", titel: "Teilungserklärung beurkundet" },
  { schluessel: "grundbuchblaetter", titel: "Wohnungsgrundbücher angelegt" },
  { schluessel: "weg", titel: "WEG entstanden" },
  { schluessel: "verwalter", titel: "Verwalter bestellt" },
  { schluessel: "abnahme", titel: "Abnahme Gemeinschaftseigentum" },
];

export interface ObjektKalkulation {
  ankaufpreis?: number;
  ankaufNebenkosten?: number;
  aufteilungskosten?: number;
  sanierung?: number;
  sonstigeKosten?: number;
  /** Vertriebsprovision in Prozent vom Kaufpreis. */
  provisionProzent?: number;
}

export interface ObjektAufteilung {
  /** Wie lange eine Reservierung gilt; leer heißt: keine Ablauffrist. */
  reservierungTage?: number;
  meilensteine?: Partial<Record<Meilenstein, string>>;
}

export function aufteilungAusMeta(meta: unknown): ObjektAufteilung {
  const a = (meta as { aufteilung?: ObjektAufteilung } | null)?.aufteilung;
  return a && typeof a === "object" ? a : {};
}

export function aufteilungFuerObjekt(objektId: string): ObjektAufteilung {
  return aufteilungAusMeta(cacheGet("objekte").find((o: { id: string }) => o.id === objektId)?.meta);
}

/** Kalkulationen der Objekte; ohne Recht liefert die Datenbank einfach keine Zeile. */
export async function kalkulationenLaden(objektIds: string[]): Promise<Map<string, ObjektKalkulation>> {
  const m = new Map<string, ObjektKalkulation>();
  if (!objektIds.length) return m;
  const { data, error } = await (supabase as any).from("objekt_kalkulation").select("objekt_id, daten").in("objekt_id", objektIds);
  if (error) throw error;
  for (const z of (data ?? []) as { objekt_id: string; daten: ObjektKalkulation }[]) m.set(z.objekt_id, z.daten ?? {});
  return m;
}

export async function kalkulationSpeichern(objektId: string, daten: ObjektKalkulation): Promise<void> {
  const { error } = await (supabase as any).from("objekt_kalkulation")
    .upsert({ objekt_id: objektId, daten, geaendert_am: new Date().toISOString() }, { onConflict: "objekt_id" });
  if (error) throw error;
}

export function projektKosten(p: ObjektKalkulation): number {
  return (p.ankaufpreis ?? 0) + (p.ankaufNebenkosten ?? 0) + (p.aufteilungskosten ?? 0) + (p.sanierung ?? 0) + (p.sonstigeKosten ?? 0);
}

export interface MargeEinheit { kostenanteil: number; provision: number; marge: number; margeProzent: number | null }
export interface MargeQuelle { id: string; kaufpreis: number | null; mea: number | null; flaeche: number | null }

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Kosten nach MEA auf die Einheiten verteilen, wie die Teilungserklärung das
 * Grundstück verteilt. Fehlt auch nur einer Einheit die MEA, nach Wohnfläche,
 * damit die Summe der Anteile immer die ganzen Kosten ergibt.
 * Ohne erfasste Kosten gibt es keine Marge (leere Map).
 */
export function margeJeEinheit(p: ObjektKalkulation, einheiten: MargeQuelle[]): Map<string, MargeEinheit> {
  const kosten = projektKosten(p);
  const ergebnis = new Map<string, MargeEinheit>();
  if (!(kosten > 0)) return ergebnis;
  const nachMea = einheiten.every((e) => (e.mea ?? 0) > 0);
  const gewicht = (e: MargeQuelle) => (nachMea ? e.mea : e.flaeche) ?? 0;
  const summe = einheiten.reduce((s, e) => s + gewicht(e), 0);
  if (!(summe > 0)) return ergebnis;
  for (const e of einheiten) {
    const kostenanteil = cent((kosten * gewicht(e)) / summe);
    const kp = e.kaufpreis ?? 0;
    const provision = cent((kp * (p.provisionProzent ?? 0)) / 100);
    const marge = cent(kp - kostenanteil - provision);
    ergebnis.set(e.id, { kostenanteil, provision, marge, margeProzent: kp > 0 ? marge / kp : null });
  }
  return ergebnis;
}

export interface AbverkaufQuelle { status: string; kaufpreis: number | null; flaeche: number | null }

/** Stand des Abverkaufs: verkauft zählt, reserviert extra, alles andere ist offen. */
export function abverkauf(einheiten: AbverkaufQuelle[]) {
  const teil = (f: (e: AbverkaufQuelle) => boolean) => {
    const l = einheiten.filter(f);
    const umsatz = l.reduce((s, e) => s + (e.kaufpreis ?? 0), 0);
    const flaeche = l.reduce((s, e) => s + (e.kaufpreis ? e.flaeche ?? 0 : 0), 0);
    return { anzahl: l.length, umsatz, qmPreis: flaeche > 0 ? umsatz / flaeche : null };
  };
  const verkauft = teil((e) => e.status === "verkauft");
  return {
    anzahl: einheiten.length,
    verkauft,
    reserviert: teil((e) => e.status === "reserviert"),
    offen: teil((e) => e.status !== "verkauft"),
    quote: einheiten.length ? verkauft.anzahl / einheiten.length : null,
  };
}

/** Noch nicht eingegangene Kaufpreise je Fälligkeitsmonat (JJJJ-MM), aufsteigend. */
export function kaufpreisEingaenge(posten: { faellig?: string; betrag: number | null; eingegangen?: boolean }[]): { monat: string; betrag: number; anzahl: number }[] {
  const je = new Map<string, { betrag: number; anzahl: number }>();
  for (const p of posten) {
    if (p.eingegangen || !p.betrag || !/^\d{4}-\d{2}/.test(p.faellig ?? "")) continue;
    const m = p.faellig!.slice(0, 7);
    const alt = je.get(m) ?? { betrag: 0, anzahl: 0 };
    je.set(m, { betrag: alt.betrag + p.betrag, anzahl: alt.anzahl + 1 });
  }
  return [...je].sort(([a], [b]) => a.localeCompare(b)).map(([monat, v]) => ({ monat, ...v }));
}
