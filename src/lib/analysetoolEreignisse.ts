/**
 * Zähler für den Trichter des Analysetools.
 *
 * Beantwortet die Frage, wie viele Interessenten bis zur Eintragung kommen und
 * wie viele absenden. Ohne diese Zahl lässt sich nicht sagen, ob die Hürde vor
 * dem Ergebnis zu hoch sitzt.
 *
 * Bewusst ohne Personenbezug: nur die Art des Ereignisses, der
 * Vertriebspartner und der Zeitpunkt. Keine Namen, keine Kontaktdaten, keine
 * Kennung des Besuchers. Fehler beim Schreiben werden verschluckt, ein Zähler
 * darf niemals den Ablauf für den Interessenten stören.
 *
 * SEIT DEM 18.09.2026 GEHT DER ZÄHLER ÜBER EINE EDGE FUNCTION
 *
 * Vorher schrieb der Browser direkt in die Tabelle, erlaubt für jeden nicht
 * angemeldeten Besucher und ohne jede Bremse. Ein Skript konnte die Tabelle
 * damit vollschreiben und jede Auswertung verfälschen. Jetzt nimmt die
 * Function `analyse-ereignis` das Ereignis entgegen und begrenzt es je
 * Anschluss, mit derselben Postgres-Funktion, die auch `submit-lead` benutzt.
 *
 * Solange die Function noch nicht ausgerollt ist, wird schlicht nichts
 * gezählt. Der Rechner läuft davon unberührt weiter.
 */
import { supabase } from "@/integrations/supabase/client";

export type AnalyseEreignis =
  | "analyse_gestartet"
  | "analyse_beendet"
  | "eintragung_gesehen"
  | "eintragung_abgesendet";

/** Im Speicher gehalten, damit dasselbe Ereignis je Sitzung nur einmal zählt. */
const bereitsGezaehlt = new Set<string>();

/** Die Edge Function, die das Ereignis entgegennimmt und begrenzt. */
export const ZAEHLER_FUNCTION = "analyse-ereignis";

/** Ein Ereignis, wie die Function es erwartet. */
export interface ZaehlEreignis {
  /** Die Stufe im Trichter, eine der vier Arten der Tabelle. */
  typ: AnalyseEreignis;
  /** Das Werkzeug. Ohne Angabe zählt die Function es dem Analysetool zu. */
  werkzeug?: string;
  /** Der Vertriebspartner, über dessen Link der Aufruf kam. */
  berater_id?: string | null;
  /** Der Kampagnenname aus der Adresse, oder null. */
  kampagne?: string | null;
}

/**
 * Schickt ein Ereignis an die Function. Schlägt das fehl, geschieht nichts
 * weiter: Ein Zähler ist nie wichtig genug, um etwas abzubrechen.
 */
export async function sendeZaehlEreignis(ereignis: ZaehlEreignis): Promise<void> {
  try {
    await supabase.functions.invoke(ZAEHLER_FUNCTION, { body: ereignis });
  } catch {
    // Absichtlich still.
  }
}

export async function protokolliereAnalyseEreignis(
  typ: AnalyseEreignis,
  beraterId?: string | null,
): Promise<void> {
  const schluessel = `${typ}:${beraterId || ""}`;
  if (bereitsGezaehlt.has(schluessel)) return;
  bereitsGezaehlt.add(schluessel);
  await sendeZaehlEreignis({ typ, werkzeug: "analysetool", berater_id: beraterId || null });
}

/** Nur für Tests: den Merker leeren. */
export function _zaehlerZuruecksetzen(): void {
  bereitsGezaehlt.clear();
}

export interface AnalyseTrichter {
  gestartet: number;
  beendet: number;
  eintragungGesehen: number;
  eintragungAbgesendet: number;
  /** Anteil der Absendungen an den gesehenen Eintragungsseiten. */
  abschlussquote: number;
}

/**
 * Die beiden Werkzeuge, die in dieselbe Tabelle zählen.
 *
 * `analysetool` ist der Vorgabewert der Spalte `werkzeug`. Für dieses Werkzeug
 * geht der Parameter deshalb bewusst NICHT mit: Solange die Migration
 * 20260908120000 nicht gelaufen ist, kennt die Datenbank nur die Fassung mit
 * zwei Parametern, und ein dritter würde den bestehenden Aufruf zum Absturz
 * bringen. Ohne den Parameter läuft er in jedem Fall.
 */
export type Werkzeug = "analysetool" | "steuerrechner";

function leseTrichter(data: unknown): AnalyseTrichter | null {
  const zeile = (Array.isArray(data) ? data[0] : data) as Record<string, number> | undefined;
  if (!zeile) return null;
  const gesehen = Number(zeile.eintragung_gesehen) || 0;
  const abgesendet = Number(zeile.eintragung_abgesendet) || 0;
  return {
    gestartet: Number(zeile.gestartet) || 0,
    beendet: Number(zeile.beendet) || 0,
    eintragungGesehen: gesehen,
    eintragungAbgesendet: abgesendet,
    abschlussquote: gesehen > 0 ? abgesendet / gesehen : 0,
  };
}

export async function ladeAnalyseTrichter(
  tage = 90,
  beraterId?: string | null,
  werkzeug: Werkzeug = "analysetool",
  kampagne?: string | null,
): Promise<AnalyseTrichter | null> {
  try {
    const argumente: Record<string, unknown> = {
      p_tage: tage,
      p_berater_id: beraterId || null,
    };
    if (werkzeug !== "analysetool") argumente.p_werkzeug = werkzeug;
    if (kampagne) argumente.p_kampagne = kampagne;
    const { data, error } = await supabase.rpc("analysetool_trichter" as never, argumente as never);
    if (error || !data) return null;
    return leseTrichter(data);
  } catch {
    return null;
  }
}

export interface KampagnenTrichter extends AnalyseTrichter {
  /** Der Name aus `utm_campaign`, oder null für Aufrufe ohne Kennung. */
  kampagne: string | null;
}

/**
 * Der Trichter je Kampagne, eine Zeile pro Anzeige.
 *
 * Beantwortet die Frage, an welcher Stelle eine Anzeige ihre Besucher
 * verliert. Ohne sie sieht man nur die Leads am Ende und weiß nicht, ob die
 * Anzeige zu wenige Leute bringt oder die Seite sie vertreibt.
 *
 * Gibt `null` zurück, solange die Migration 20260908170000 nicht gelaufen ist.
 * Die Karte zeigt dann ihren Hinweis statt einer leeren Tabelle.
 */
export async function ladeKampagnenTrichter(
  tage = 90,
  werkzeug: Werkzeug = "steuerrechner",
): Promise<KampagnenTrichter[] | null> {
  try {
    const { data, error } = await supabase.rpc("analysetool_trichter_kampagnen" as never, {
      p_tage: tage,
      p_werkzeug: werkzeug,
    } as never);
    if (error || !Array.isArray(data)) return null;
    return (data as Record<string, unknown>[])
      .map((zeile) => {
        const trichter = leseTrichter(zeile);
        if (!trichter) return null;
        const name = zeile.kampagne;
        return { ...trichter, kampagne: typeof name === "string" && name ? name : null };
      })
      .filter((z): z is KampagnenTrichter => z !== null);
  } catch {
    return null;
  }
}
