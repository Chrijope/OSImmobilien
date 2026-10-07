/**
 * Verkaeufe aus Investagon sofort nachziehen.
 *
 * Christian am 23.09.2026, der wichtigste Punkt der ganzen Regel: Ein
 * Partner darf nie eine Wohnung anbieten, die in Investagon schon verkauft
 * ist. Der eigentliche Abgleich in `index.ts` zieht den Status zwar nach,
 * aber nur fuer Projekte, die er in diesem Lauf verarbeitet. Und das sind
 * nicht alle: Unveraenderte Projekte ueberspringt er, nach Mitternacht
 * stehen alle zugleich an, und das Zeitbudget von zwei Minuten reicht dann
 * nicht fuer alle. Ein Verkauf koennte so mehrere Laeufe lang als frei
 * stehen.
 *
 * Dieser Schritt laeuft deshalb in JEDEM Lauf vor dem Abgleich und braucht
 * nur die Kurzliste, die ohnehin geladen ist: Jede Einheit mit `active = 0`,
 * die im CRM noch nicht verkauft steht, wird hier erfasst.
 *
 * Ob der Status gesetzt werden darf, entscheidet dieselbe Funktion wie im
 * Abgleich, `statusFelder` in `mapping.ts`. Zwei Regeln an zwei Stellen
 * wuerden sich frueher oder spaeter widersprechen. Daraus folgen zwei Faelle:
 *
 *   Status wird gesetzt   Die Einheit fuehrt der Import, oder an ihr haengt
 *                         kein Vorgang aus dem CRM (kein Kunde, kein Name,
 *                         kein Reservierungsdatum).
 *   Status bleibt         An der Einheit haengt ein Vorgang aus dem CRM, den
 *                         Weg zum Verkauf fuehrt die Abwicklung nach.
 *                         Verkauft Investagon eine bei uns reservierte
 *                         Wohnung, gehoert das vor einen Menschen, deshalb
 *                         steht es im Bericht. Aus den Angebotslisten
 *                         verschwindet sie trotzdem, weil ihr Rohdatensatz
 *                         hier `active = 0` bekommt.
 *
 * Geloescht wird nie etwas.
 */

import { einheitAngebot } from "../_shared/einheit-angebot.ts";
import { statusFelder } from "./mapping.ts";

/**
 * Die Notbremse.
 *
 * Wuerden in einem Lauf mehr als ein Viertel der gelieferten Einheiten auf
 * einmal verkauft, aendert sich nichts, es wird nur gemeldet. Das faengt eine
 * geaenderte Bedeutung von `active` auf der Gegenseite ab. Ein echter
 * Paketverkauf eines ganzen Hauses bleibt darunter: Stand 23.09.2026 liefert
 * Investagon mehrere hundert Einheiten. Die Mindestgrenze haelt kleine
 * Bestaende handlungsfaehig.
 */
export const NOTBREMSE_ANTEIL = 1 / 4;
export const NOTBREMSE_MINDESTENS = 10;

/** Die Spalten einer CRM-Einheit, die dieser Schritt braucht. */
export interface VerkaufsZeile {
  id: string;
  objekt_id: string;
  we_nr?: string | null;
  status: string | null;
  kunde_id: string | null;
  kunde_name: string | null;
  reserviert_am: string | null;
  meta: Record<string, unknown> | null;
}

/**
 * Die Investagon-Kennungen aller Einheiten, die Investagon als verkauft
 * fuehrt. Nur die Kurzliste wird gebraucht, `active` steht darin.
 */
export function verkaufteKennungen(
  einheiten: { investagonId?: string; roh?: Record<string, unknown> }[],
): Set<string> {
  const kennungen = new Set<string>();
  for (const e of einheiten) {
    if (e.investagonId && einheitAngebot(e.roh) === "verkauft") {
      kennungen.add(e.investagonId);
    }
  }
  return kennungen;
}

export interface VerkaufsPlan {
  /** Status wird "verkauft". */
  nachziehen: VerkaufsZeile[];
  /** Vorgang aus dem CRM: Status bleibt, nur die Rohdaten werden angepasst. */
  gebunden: VerkaufsZeile[];
  /** Gesetzt, wenn die Notbremse gezogen wurde. Dann ist alles leer. */
  notbremse?: string;
}

/**
 * Der Plan fuer diesen Lauf.
 *
 * `zeilen` sind die CRM-Einheiten, deren Investagon-Kennung in `verkauft`
 * steht. Bereits verkaufte bleiben aussen vor, damit der Schritt in einem
 * ruhigen Lauf nichts schreibt. Eine gebundene Einheit, deren Rohdaten schon
 * `active = 0` tragen, ebenfalls: Sie steht bereits im Bericht eines
 * frueheren Laufs und ist aus den Angebotslisten schon heraus.
 */
export function planeVerkaeufe(
  verkauft: Set<string>,
  zeilen: VerkaufsZeile[],
  gelieferteEinheiten: number,
): VerkaufsPlan {
  const nachziehen: VerkaufsZeile[] = [];
  const gebunden: VerkaufsZeile[] = [];
  for (const z of zeilen) {
    const kennung = z.meta?.investagonId;
    if (typeof kennung !== "string" || !verkauft.has(kennung)) continue;
    if (String(z.status || "").toLowerCase() === "verkauft") continue;
    if (statusFelder({ active: 0 }, z).status === "verkauft") {
      nachziehen.push(z);
    } else if (einheitAngebot(z.meta?.investagonRaw) !== "verkauft") {
      gebunden.push(z);
    }
  }

  const grenze = Math.max(
    NOTBREMSE_MINDESTENS,
    Math.floor(gelieferteEinheiten * NOTBREMSE_ANTEIL),
  );
  if (nachziehen.length > grenze) {
    return {
      nachziehen: [],
      gebunden: [],
      notbremse:
        `${nachziehen.length} Einheiten wären auf einmal als verkauft zu setzen, ` +
        `erlaubt sind höchstens ${grenze}. Das sieht nach einer geänderten Schnittstelle aus. ` +
        "Nichts geändert.",
    };
  }
  return { nachziehen, gebunden };
}

/**
 * Das neue `meta` einer nachgezogenen oder gebundenen Einheit.
 *
 * `active = 0` kommt in den Rohdatensatz, damit die Angebotslisten im
 * Frontend die Einheit sofort herausnehmen und nicht erst, wenn der volle
 * Abgleich das Projekt erreicht. Bei einer nachgezogenen Einheit kommt die
 * Marke dazu, an der der Import erkennt, dass er ihren Status fuehrt.
 */
export function metaNachVerkauf(
  meta: Record<string, unknown> | null | undefined,
  statusGesetzt: boolean,
): Record<string, unknown> {
  const alt = meta || {};
  const roh = alt.investagonRaw && typeof alt.investagonRaw === "object" &&
      !Array.isArray(alt.investagonRaw)
    ? alt.investagonRaw as Record<string, unknown>
    : {};
  return {
    ...alt,
    investagonRaw: { ...roh, active: 0 },
    ...(statusGesetzt ? { investagonStatusVerwaltet: true } : {}),
  };
}
