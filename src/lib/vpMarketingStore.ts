/**
 * Conversions-API-Token des Vertriebspartners (Meta), ueber die Edge
 * Function `vp-marketing`.
 *
 * Das Token ist ein Geheimnis: Es wird geschrieben und geloescht, aber nie
 * wieder in den Browser geladen. Gelesen wird nur, OB eines hinterlegt ist.
 * Bis zum 27.09.2026 las und schrieb dieses Modul die Tabelle
 * `vp_marketing_einstellungen` direkt. Die Migration 20260909140000 entzieht
 * angemeldeten Nutzern aber jedes Recht daran; danach ging hier nichts mehr,
 * und ohne sie landete der Tokenwert beim Lesen im Browser. Jetzt laeuft
 * alles ueber die Function, die mit dem Dienstschluessel arbeitet.
 *
 * Die Function meldet mit dem Status zugleich, ob der Nutzer ein eigenes
 * Pixel nutzen darf (Anlage 4, Bestandsschutz oder Admin, siehe
 * supabase/functions/_shared/meta-pixel-freigabe.ts). Speichern prueft sie
 * selbst, Entfernen ist immer erlaubt.
 */
import { supabase } from "@/integrations/supabase/client";

interface Antwort {
  ok?: boolean;
  hinterlegt?: boolean;
  tabelleFehlt?: boolean;
  fehler?: string;
  gesperrt?: boolean;
  pixelErlaubt?: boolean;
  freigabeGrund?: string;
}

async function rufeAuf(
  userId: string,
  action: "status" | "save" | "delete" | "entfernen",
  token?: string,
): Promise<Antwort> {
  try {
    const { data, error } = await supabase.functions.invoke("vp-marketing", {
      body: { userId, action, ...(token !== undefined ? { token } : {}) },
    });
    if (error) {
      // Bei 4xx steckt die Meldung der Function im Antwortkoerper.
      const koerper = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return { ok: false, fehler: koerper?.fehler || "Marketing-Einstellungen sind gerade nicht erreichbar." };
    }
    return (data ?? {}) as Antwort;
  } catch {
    return { ok: false, fehler: "Marketing-Einstellungen sind gerade nicht erreichbar." };
  }
}

export interface CapiTokenStatus {
  hinterlegt: boolean;
  tabelleFehlt: boolean;
  fehler?: string;
  /** Darf der Nutzer ein eigenes Pixel setzen? null, wenn unbekannt. */
  pixelErlaubt: boolean | null;
}

/** Prueft, ob fuer den Nutzer ein Token hinterlegt ist und ob er ein Pixel nutzen darf. */
export async function ladeCapiTokenStatus(userId: string): Promise<CapiTokenStatus> {
  const a = await rufeAuf(userId, "status");
  const pixelErlaubt = typeof a.pixelErlaubt === "boolean" ? a.pixelErlaubt : null;
  if (a.tabelleFehlt) return { hinterlegt: false, tabelleFehlt: true, pixelErlaubt };
  if (!a.ok) return { hinterlegt: false, tabelleFehlt: false, fehler: a.fehler || "unbekannter Fehler", pixelErlaubt };
  return { hinterlegt: !!a.hinterlegt, tabelleFehlt: false, pixelErlaubt };
}

export interface CapiSchreibErgebnis {
  ok: boolean;
  tabelleFehlt: boolean;
  fehler?: string;
}

/** Hinterlegt oder ersetzt das Token. Die Function prueft die Freigabe. */
export async function speichereCapiToken(userId: string, token: string): Promise<CapiSchreibErgebnis> {
  const a = await rufeAuf(userId, "save", token);
  if (a.ok) return { ok: true, tabelleFehlt: false };
  return { ok: false, tabelleFehlt: !!a.tabelleFehlt, fehler: a.fehler || "unbekannter Fehler" };
}

/**
 * Entfernt das Meta Pixel ganz: Pixel-ID leeren, Token loeschen,
 * Bestandsschutz beenden, auf dem Server in einem Schritt. Immer erlaubt.
 */
export async function entferneMetaPixel(userId: string): Promise<CapiSchreibErgebnis> {
  const a = await rufeAuf(userId, "entfernen");
  if (a.ok) return { ok: true, tabelleFehlt: false };
  return { ok: false, tabelleFehlt: false, fehler: a.fehler || "unbekannter Fehler" };
}

/** Entfernt das hinterlegte Token wieder. Immer erlaubt. */
export async function loescheCapiToken(userId: string): Promise<CapiSchreibErgebnis> {
  const a = await rufeAuf(userId, "delete");
  if (a.ok) return { ok: true, tabelleFehlt: false };
  return { ok: false, tabelleFehlt: !!a.tabelleFehlt, fehler: a.fehler || "unbekannter Fehler" };
}
