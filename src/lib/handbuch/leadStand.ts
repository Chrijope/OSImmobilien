/**
 * Wie weit ist ein Lead der Handbuch-Seite im Trichter? Für die
 * Lead-Verwaltung (Bereich „Handbuch-Seite“) und das Kundenprofil.
 *
 * Die Stufen, jeweils der höchste erreichte Stand:
 *
 *   erhalten        Konfigurator abgeschickt, Handbuch angezeigt und verschickt
 *   gelesen         Handbuch über den Link aus der Mail geöffnet
 *   pdf             Handbuch als PDF gespeichert
 *   sa_begonnen     Link zur Selbstauskunft geöffnet
 *   sa_liegt_vor    Selbstauskunft unterschrieben, PDF im Investment
 *
 * „E-Mail bestätigt“ gibt es bewusst nicht: Es gibt kein Double-Opt-in. Das
 * Öffnen des Links aus der Mail („gelesen“) ist der einzige belastbare
 * Nachweis, dass die Adresse stimmt, und steckt in dieser Stufe.
 *
 * Die Daten kommen über die Datenbankfunktion `handbuch_lead_staende`
 * (Migration 20260926180000). Solange sie fehlt, gilt der Stand aus dem
 * Kontakt selbst (`meta.handbuchFunnel`, `meta.handbuchSelbstauskunft`), und
 * mehr als „Handbuch erhalten“ lässt sich dann nicht sagen.
 */
import { supabase } from "@/integrations/supabase/client";
import { cacheGetById } from "@/lib/dataCache";
import type { KampagnenKennung } from "@/lib/kampagnenKennung";
import {
  AUSGANG_TEXT,
  handbuchRahmen,
  istKonfiguratorQuelle,
  pruefeAntworten,
  type Ausgang,
  type HandbuchAntworten,
  type HandbuchRahmen,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";

export type LeadStufe = "erhalten" | "gelesen" | "pdf" | "sa_begonnen" | "sa_liegt_vor" | "sa_angefragt";

export const LEAD_STUFE_TEXT: Record<LeadStufe, string> = {
  erhalten: "Handbuch erhalten",
  gelesen: "Handbuch gelesen",
  pdf: "PDF gespeichert",
  sa_angefragt: "Selbstauskunft angefragt",
  sa_begonnen: "Selbstauskunft begonnen",
  sa_liegt_vor: "Selbstauskunft liegt vor",
};

/** Eine Zeile aus `handbuch_lead_staende`. */
export interface LeadStandZeile {
  kontaktId: string;
  handbuchAm: string | null;
  geoeffnetAm: string | null;
  pdfAm: string | null;
  saGeoeffnetAm: string | null;
  saUnterschrieben: boolean;
  saPdfImInvestment: boolean;
}

export interface KonfiguratorAngaben {
  /** Kam der Lead über den Konfigurator oder die offene Selbstauskunft? */
  ausHandbuch: boolean;
  antworten: HandbuchAntworten | null;
  ausgang: Ausgang | null;
  rahmen: HandbuchRahmen | null;
  zeitpunkt: string | null;
  nurSelbstauskunft: boolean;
}

/** Liest, was der Konfigurator am Kontakt hinterlassen hat. Rechnet den Rahmen aus den Antworten nach. */
export function konfiguratorAngaben(kontakt: { quelle?: unknown; meta?: unknown } & Record<string, unknown>): KonfiguratorAngaben {
  // `KundeData` breitet `meta` aus, das Kundenprofil reicht das rohe `meta`.
  const quelleMeta = (kontakt.meta && typeof kontakt.meta === "object" ? kontakt.meta : kontakt) as Record<string, unknown>;
  const funnel = quelleMeta.handbuchFunnel as Record<string, unknown> | undefined;
  const saOffen = quelleMeta.handbuchSelbstauskunft as Record<string, unknown> | undefined;
  const antworten = funnel ? pruefeAntworten(funnel.antworten) : null;
  const ausgangRoh = funnel?.ausgang;
  const ausgang: Ausgang | null =
    ausgangRoh === "passt" || ausgangRoh === "vielleicht" || ausgangRoh === "noch_nicht" ? ausgangRoh : null;
  return {
    ausHandbuch: !!funnel || !!saOffen || istKonfiguratorQuelle(kontakt.quelle),
    antworten,
    ausgang,
    rahmen: antworten ? handbuchRahmen(antworten) : null,
    zeitpunkt: typeof funnel?.zeitpunkt === "string" ? funnel.zeitpunkt : typeof saOffen?.zeitpunkt === "string" ? saOffen.zeitpunkt : null,
    nurSelbstauskunft: !funnel && !!saOffen,
  };
}

/**
 * Dasselbe für einen Kontakt aus der Liste (`KundeData`). Dort ist `meta`
 * nicht mehr dabei, deshalb kommt die Zeile aus dem Zwischenspeicher.
 */
export function konfiguratorAngabenFuerKontakt(k: { id: string; quelle?: string }): KonfiguratorAngaben & { kampagne: KampagnenKennung | null } {
  const roh = cacheGetById<{ quelle?: string; meta?: Record<string, unknown> }>("kontakte", k.id);
  const meta = roh?.meta && typeof roh.meta === "object" ? roh.meta : {};
  const kampagne = meta.kampagne && typeof meta.kampagne === "object" ? (meta.kampagne as KampagnenKennung) : null;
  return { ...konfiguratorAngaben({ quelle: roh?.quelle ?? k.quelle, meta }), kampagne };
}

/** Der höchste erreichte Stand. */
export function leadStufe(angaben: Pick<KonfiguratorAngaben, "nurSelbstauskunft">, zeile?: LeadStandZeile | null): LeadStufe {
  if (zeile?.saUnterschrieben) return "sa_liegt_vor";
  if (zeile?.saGeoeffnetAm) return "sa_begonnen";
  if (zeile?.pdfAm) return "pdf";
  if (zeile?.geoeffnetAm) return "gelesen";
  return angaben.nurSelbstauskunft ? "sa_angefragt" : "erhalten";
}

export function ausgangText(a: Ausgang | null): string {
  return a ? AUSGANG_TEXT[a] : "";
}

/** Rahmen kurz in Tausend Euro: „158 bis 222 T€“. */
export function rahmenKurz(r: Pick<HandbuchRahmen, "von" | "bis"> | null): string {
  if (!r) return "";
  const t = (n: number) => Math.round(n / 1000).toLocaleString("de-DE");
  if (r.bis <= 0) return "noch kein Rahmen";
  return r.von === r.bis ? `${t(r.von)} T€` : `${t(r.von)} bis ${t(r.bis)} T€`;
}

/** „0,5 Std.“, „1 Tag“, „2 Tage“. */
export function liegtSeitText(iso: string | null | undefined, jetzt: number = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const stunden = Math.max(0, (jetzt - t) / 3_600_000);
  if (stunden < 24) {
    const gerundet = Math.max(0.5, Math.round(stunden * 2) / 2);
    return `${gerundet.toLocaleString("de-DE")} Std.`;
  }
  const tage = Math.floor(stunden / 24);
  return tage === 1 ? "1 Tag" : `${tage} Tage`;
}

export function leseStandZeilen(daten: unknown): LeadStandZeile[] {
  if (!Array.isArray(daten)) return [];
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return daten
    .filter((z): z is Record<string, unknown> => !!z && typeof z === "object" && typeof (z as Record<string, unknown>).kontaktId === "string")
    .map((z) => ({
      kontaktId: String(z.kontaktId),
      handbuchAm: text(z.handbuchAm),
      geoeffnetAm: text(z.geoeffnetAm),
      pdfAm: text(z.pdfAm),
      saGeoeffnetAm: text(z.saGeoeffnetAm),
      saUnterschrieben: z.saUnterschrieben === true,
      saPdfImInvestment: z.saPdfImInvestment === true,
    }));
}

export type StandLaden = { status: "ok"; zeilen: Map<string, LeadStandZeile> } | { status: "migration" } | { status: "fehler" };

export async function ladeLeadStaende(kontaktIds: string[]): Promise<StandLaden> {
  if (kontaktIds.length === 0) return { status: "ok", zeilen: new Map() };
  try {
    const { data, error } = await supabase.rpc("handbuch_lead_staende" as never, { p_kontakt_ids: kontaktIds.slice(0, 500) } as never);
    if (error) {
      const msg = String((error as { message?: string }).message || "");
      const code = (error as { code?: string }).code;
      const fehlt = code === "PGRST202" || code === "42883" || code === "42P01" || msg.includes("Could not find the function") || msg.includes("does not exist");
      return fehlt ? { status: "migration" } : { status: "fehler" };
    }
    return { status: "ok", zeilen: new Map(leseStandZeilen(data).map((z) => [z.kontaktId, z])) };
  } catch {
    return { status: "fehler" };
  }
}

/**
 * Die Quelle für Auswertungen: „Handbuch-Seite“ (bis 26.09.2026) und
 * „Konfigurator“ sind derselbe Weg und zählen in einer Zeile.
 */
export function quelleFuerAuswertung(quelle: unknown, leer = "Unbekannt"): string {
  if (istKonfiguratorQuelle(quelle)) return "Konfigurator";
  const q = typeof quelle === "string" ? quelle.trim() : "";
  return q || leer;
}
