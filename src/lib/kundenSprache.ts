/**
 * Die Sprache eines Kunden im CRM: lesen, setzen, einmal nachfragen.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 0. Das Kundenprofil führt, alle
 * Kanäle (Mails, PDFs, Portal, Seiten) richten sich danach. Gespeichert wird
 * in `kontakte.meta` (siehe `supabase/functions/_shared/kunden-sprache.ts`,
 * dort stehen die Regeln und die Schlüssel):
 *
 *   kundenSprache            "de" | "en", fehlt beim Bestand
 *   kundenSpracheGesetztAm   Zeitpunkt der bewussten Wahl
 *   kundenSpracheGesetztVon  wer gewählt hat
 *
 * Fehlt der Wert, gilt Deutsch. Wer Texte für Kunden baut, holt die Sprache
 * immer hier (Browser) oder über `_shared/kunden-sprache.ts` (Edge Function),
 * nie aus dem Browser des Beraters und nie aus `i18n.language`.
 *
 * Schnittstellen für die nächsten Etappen:
 *   kundenSprache(kontakt | kontaktId)       → "de" | "en"
 *   spracheBewusstGewaehlt(kontakt | id)     → boolean
 *   setzeKundenSprache(kontaktId, sprache)   → schreibt über merge_kontakt_meta
 *   stelleKundenspracheSicher(kontaktId)     → fragt einmal „Deutsch oder English?“
 *   useKundenSprache(kontaktId)              → Hook, folgt dem Zwischenspeicher
 *   englischsprachigeKontaktIds()            → Menge für Listen (EN-Kürzel)
 */
import { useCallback, useSyncExternalStore } from "react";
import { cacheGet, onCacheChange } from "./dataCache";
import { mergeKontaktMetaMitGrund } from "./kundenStore";
import { getCurrentUserId } from "./currentUser";
import { auswahlDialog } from "./confirm";
import {
  KUNDENSPRACHE_META,
  SPRACHEN,
  STANDARD_SPRACHE,
  istSprache,
  kundenSpracheMetaPatch,
  normalisiereSprache,
  spracheAusMeta,
  spracheBewusstGewaehltAusMeta,
  type Sprache,
} from "../../supabase/functions/_shared/kunden-sprache.ts";

export {
  KUNDENSPRACHE_META,
  SPRACHEN,
  STANDARD_SPRACHE,
  istSprache,
  kundenSpracheMetaPatch,
  normalisiereSprache,
  spracheAusMeta,
  spracheBewusstGewaehltAusMeta,
  type Sprache,
};

/** So heißen die Sprachen in der Oberfläche, jeweils in ihrer eigenen Sprache. */
export const SPRACH_NAMEN: Record<Sprache, string> = { de: "Deutsch", en: "English" };

/**
 * Ein Kontakt, wie ihn die Aufrufer gerade haben: die Kennung, eine
 * Datenbankzeile mit `meta` oder ein `KundeData` ohne `meta` (dann wird die
 * Zeile über die Kennung im Zwischenspeicher gesucht).
 */
export type KontaktAngabe = string | { id?: string | null; meta?: unknown } | null | undefined;

function zeileZu(kontaktId: string): { id: string; meta?: unknown; vorname?: string; nachname?: string } | undefined {
  try {
    return cacheGet<{ id: string; meta?: unknown }>("kontakte").find((r) => r.id === kontaktId);
  } catch {
    return undefined;
  }
}

function metaVon(kontakt: KontaktAngabe): unknown {
  if (!kontakt) return undefined;
  if (typeof kontakt === "string") return zeileZu(kontakt)?.meta;
  if ("meta" in kontakt && kontakt.meta !== undefined) return kontakt.meta;
  return kontakt.id ? zeileZu(kontakt.id)?.meta : undefined;
}

/** Die Sprache des Kunden. Unbekannter Kontakt oder kein Eintrag: Deutsch. */
export function kundenSprache(kontakt: KontaktAngabe): Sprache {
  return spracheAusMeta(metaVon(kontakt));
}

/** Hat jemand die Sprache bewusst gewählt? Der Bestand hat das nicht. */
export function spracheBewusstGewaehlt(kontakt: KontaktAngabe): boolean {
  return spracheBewusstGewaehltAusMeta(metaVon(kontakt));
}

/** `grund` ist nur beim Fehlschlag gesetzt und für den Nutzer lesbar. */
export interface SetzenErgebnis { ok: boolean; grund?: string }

/**
 * Setzt die Sprache und merkt, wer wann gewählt hat.
 *
 * Schreibt über `mergeKontaktMetaMitGrund`, also über `merge_kontakt_meta`.
 * Dieselbe Regel wie bei allen Stammdaten in `meta`: interne Rollen ja, der
 * Kunde selbst nein (der Schlüssel steht nicht in der Positivliste der
 * Funktion, siehe Plan Entscheidung 3). Die Änderung landet über den
 * Änderungsverlauf in der Historie.
 */
export async function setzeKundenSprache(kontaktId: string, sprache: Sprache): Promise<SetzenErgebnis> {
  if (!kontaktId) return { ok: false, grund: "Kein Kontakt angegeben." };
  if (!istSprache(sprache)) return { ok: false, grund: `Unbekannte Sprache: ${String(sprache)}` };
  try {
    return await mergeKontaktMetaMitGrund(kontaktId, kundenSpracheMetaPatch(sprache, getCurrentUserId()));
  } catch (fehler) {
    return { ok: false, grund: fehler instanceof Error ? fehler.message : String(fehler) };
  }
}

/**
 * Die Kennungen aller Kontakte mit Englisch, für Listen mit vielen Zeilen.
 * Einmal je Anzeige bauen, nicht je Zeile suchen.
 */
export function englischsprachigeKontaktIds(): Set<string> {
  const ids = new Set<string>();
  try {
    for (const r of cacheGet<{ id: string; meta?: unknown }>("kontakte")) {
      if (spracheAusMeta(r.meta) === "en") ids.add(r.id);
    }
  } catch { /* Zwischenspeicher noch leer */ }
  return ids;
}

/**
 * Sprache und Wahl-Stand eines Kontakts, folgt dem Zwischenspeicher. Ändert
 * jemand die Sprache (auch in einem anderen Tab über Realtime), zeichnet die
 * Komponente neu.
 */
export function useKundenSprache(kontaktId: string | null | undefined): { sprache: Sprache; bewusstGewaehlt: boolean } {
  const abonnieren = useCallback((melden: () => void) => {
    // Ohne Zwischenspeicher (etwa in Tests mit schmaler Attrappe) bleibt es beim Anfangsstand.
    try {
      return onCacheChange((tabelle) => { if (tabelle === "kontakte") melden(); });
    } catch {
      return () => undefined;
    }
  }, []);
  // Ein schlichter Text als Stand, damit React Gleichheit ohne neue Objekte erkennt.
  const stand = useCallback(() => {
    if (!kontaktId) return `${STANDARD_SPRACHE}|0`;
    return `${kundenSprache(kontaktId)}|${spracheBewusstGewaehlt(kontaktId) ? 1 : 0}`;
  }, [kontaktId]);
  const wert = useSyncExternalStore(abonnieren, stand, stand);
  const [sprache, bewusst] = wert.split("|");
  return { sprache: istSprache(sprache) ? sprache : STANDARD_SPRACHE, bewusstGewaehlt: bewusst === "1" };
}

/* ── Die einmalige Rückfrage vor dem ersten Versand ─────────── */

/** Läuft für einen Kontakt schon eine Rückfrage? Dann auf dieselbe warten. */
const offeneRueckfragen = new Map<string, Promise<Sprache>>();

/**
 * Sorgt dafür, dass die Sprache vor dem ersten kundenwirksamen Versand
 * bewusst gewählt ist, und liefert sie.
 *
 * Plan 2.4, Punkt 3: Ist noch nie gewählt worden, fragt ein Dialog im
 * Projektstil einmal „Deutsch oder English?“, speichert die Antwort und gibt
 * sie zurück. Danach fragt er für diesen Kontakt nie wieder.
 *
 * Er blockiert den Versand nie:
 *   - Wird der Dialog ohne Wahl geschlossen, gilt Deutsch; gespeichert wird
 *     nichts, beim nächsten Versand fragt er erneut.
 *   - Schlägt das Speichern fehl, gilt die Wahl trotzdem für diesen Versand.
 *   - Ist der Kontakt nicht im Zwischenspeicher (öffentliche Seite, Test),
 *     wird nicht gefragt.
 *
 * Aufruf direkt vor dem Versand, nachdem der Nutzer den Versand bestätigt hat:
 *
 *   const sprache = await stelleKundenspracheSicher(kontaktId);
 *
 * Nur aus Klicks eines Mitarbeiters aufrufen, nie aus automatischen Läufen.
 */
export async function stelleKundenspracheSicher(kontaktId: string | null | undefined): Promise<Sprache> {
  if (!kontaktId) return STANDARD_SPRACHE;
  const zeile = zeileZu(kontaktId);
  if (!zeile) return STANDARD_SPRACHE;
  if (spracheBewusstGewaehltAusMeta(zeile.meta)) return spracheAusMeta(zeile.meta);

  const laeuft = offeneRueckfragen.get(kontaktId);
  if (laeuft) return laeuft;

  const rueckfrage = (async (): Promise<Sprache> => {
    const bisher = spracheAusMeta(zeile.meta);
    const name = [zeile.vorname, zeile.nachname].filter(Boolean).join(" ").trim();
    let wahl: Sprache | null = null;
    try {
      wahl = await auswahlDialog<Sprache>({
        title: "Deutsch oder English?",
        description:
          `${name ? `Für ${name}` : "Für diesen Kunden"} ist noch keine Sprache gewählt. `
          + "Mails, Dokumente und das Kundenportal richten sich nach dieser Wahl.\n\n"
          + "Du wirst nur dieses eine Mal gefragt. Ändern kannst du die Sprache jederzeit im Kundenprofil unter „Sprache“.",
        optionen: [
          { wert: "de", text: SPRACH_NAMEN.de },
          { wert: "en", text: SPRACH_NAMEN.en },
        ],
      });
    } catch (fehler) {
      console.warn("stelleKundenspracheSicher: Rückfrage nicht möglich", fehler);
      return bisher;
    }
    if (!wahl) return bisher;
    const ergebnis = await setzeKundenSprache(kontaktId, wahl);
    if (!ergebnis.ok) console.warn("stelleKundenspracheSicher: Sprache nicht gespeichert", ergebnis.grund);
    return wahl;
  })();

  offeneRueckfragen.set(kontaktId, rueckfrage);
  try {
    return await rueckfrage;
  } finally {
    offeneRueckfragen.delete(kontaktId);
  }
}
