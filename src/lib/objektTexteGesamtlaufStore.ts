/**
 * Der Durchgang über alle Objekte, außerhalb jeder Komponente gehalten.
 *
 * WARUM NICHT IN DER KOMPONENTE
 *
 * Ein Durchgang über neunzig Objekte dauert eine halbe Stunde und länger.
 * Läge sein Zustand in der Komponente der Objektübersicht, ginge beim Wechsel
 * auf eine andere Seite der Knopf zum Anhalten verloren, und zurück auf der
 * Übersicht wüsste niemand mehr, dass noch etwas läuft. Hier lebt er so lange
 * wie das Browserfenster: Man kann im CRM weiterarbeiten, und die Übersicht
 * zeigt beim Zurückkommen den Fortschritt. Erst ein Neuladen oder Schließen des
 * Tabs beendet ihn. Was bis dahin geschrieben wurde, bleibt geschrieben.
 *
 * Dasselbe Muster wie `vertriebsakademieProgress.ts`: ein Zustand im Modul,
 * Abonnenten und `useSyncExternalStore` für die Anzeige.
 *
 * Die Rechnung selbst liegt in `objektTexteGesamtlauf.ts`.
 */

import { useSyncExternalStore } from "react";
import { toast } from "@/hooks/use-toast";
import { cacheGet, cacheReload } from "@/lib/dataCache";
import {
  objektTexteGesamtlauf,
  type GesamtlaufBericht,
  type GesamtlaufFortschritt,
  type GesamtlaufOptionen,
} from "@/lib/objektTexteGesamtlauf";
import { KONTINGENT_LEITUNG, type SammellaufObjekt } from "@/lib/objektTexteSammellauf";

/** Alle Objekte oder nur die, die im letzten Durchgang fehlgeschlagen sind. */
export type GesamtlaufArt = "alle" | "fehlgeschlagene";

export interface GesamtlaufZustand {
  laeuft: boolean;
  /** Anhalten ist angefordert, das laufende Objekt schreibt noch zu Ende. */
  haeltAn: boolean;
  art: GesamtlaufArt | null;
  fortschritt?: GesamtlaufFortschritt;
  /** Der Bericht des letzten abgeschlossenen Durchgangs. */
  bericht?: GesamtlaufBericht;
  /** Gesetzt, wenn der Durchgang selbst gescheitert ist, nicht ein Objekt. */
  fehler?: string;
}

const LEER: GesamtlaufZustand = { laeuft: false, haeltAn: false, art: null };

let zustand: GesamtlaufZustand = LEER;
let abbruch = false;
const hoerer = new Set<() => void>();

function setze(teil: Partial<GesamtlaufZustand>) {
  // Immer ein neues Objekt, sonst bemerkt `useSyncExternalStore` die Änderung nicht.
  zustand = { ...zustand, ...teil };
  for (const h of hoerer) h();
}

export function gesamtlaufZustand(): GesamtlaufZustand {
  return zustand;
}

export function abonniereGesamtlauf(h: () => void): () => void {
  hoerer.add(h);
  return () => {
    hoerer.delete(h);
  };
}

/** Der Zustand für die Anzeige, auf jeder Seite derselbe. */
export function useGesamtlauf(): GesamtlaufZustand {
  return useSyncExternalStore(abonniereGesamtlauf, gesamtlaufZustand, gesamtlaufZustand);
}

/**
 * Das aktuelle `meta` eines Objekts aus dem Zwischenspeicher.
 *
 * Die Function schreibt in die Datenbank, und die Änderung kommt über die
 * Echtzeitverbindung in den Zwischenspeicher zurück. So sieht der Durchgang,
 * was der Server inzwischen selbst gefüllt hat.
 */
function metaAusZwischenspeicher(objektId: string): Record<string, unknown> | undefined {
  const zeile = (cacheGet<{ id?: string; meta?: unknown }>("objekte") || []).find((z) => z?.id === objektId);
  const meta = zeile?.meta;
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : undefined;
}

/** Der Satz für die Meldung am Ende, auf welcher Seite man auch gerade ist. */
function abschlussMeldung(
  bericht: GesamtlaufBericht,
): { title: string; description: string; variant?: "destructive" } {
  // Fehlt die Function, ist das die ganze Nachricht. Zahlen dazu verwirren nur.
  if (bericht.ende === "nicht-ausgerollt") {
    return { title: "Der Durchgang konnte nicht starten.", description: bericht.grenzeText, variant: "destructive" };
  }
  const title = bericht.erzeugt === 1 ? "Ein Objekt hat jetzt Texte." : `${bericht.erzeugt} Objekte haben jetzt Texte.`;
  const teile: string[] = [];
  if (bericht.fehlgeschlagen.length > 0) teile.push(`${bericht.fehlgeschlagen.length} fehlgeschlagen.`);
  if (bericht.offen.length > 0) teile.push(`${bericht.offen.length} noch offen.`);
  if (bericht.grenzeText) teile.push(bericht.grenzeText);
  return { title, description: teile.length > 0 ? teile.join(" ") : "Es ist nichts offen geblieben." };
}

/**
 * Einen Durchgang starten. Läuft schon einer, passiert nichts.
 *
 * Zwei gleichzeitige Durchgänge liefen über dieselben Objekte und bezahlten
 * jedes doppelt. Die Sperre gilt für dieses Browserfenster.
 */
export async function starteGesamtlauf(
  objekte: SammellaufObjekt[],
  art: GesamtlaufArt,
  optionen: Pick<GesamtlaufOptionen, "erzeuge" | "warte" | "pauseMs" | "aktuellesMeta"> = {},
): Promise<GesamtlaufBericht | undefined> {
  if (zustand.laeuft) return undefined;
  abbruch = false;
  setze({ laeuft: true, haeltAn: false, art, fortschritt: undefined, bericht: undefined, fehler: undefined });

  try {
    const bericht = await objektTexteGesamtlauf(objekte, {
      ...optionen,
      aktuellesMeta: optionen.aktuellesMeta ?? metaAusZwischenspeicher,
      kontingent: KONTINGENT_LEITUNG,
      melde: (fortschritt) => setze({ fortschritt }),
      abgebrochen: () => abbruch,
    });
    setze({ bericht });
    // Die Echtzeitverbindung bringt die Änderungen meist schon mit. Das
    // Neuladen am Ende ist die Sicherung, falls sie unterwegs abgerissen ist.
    if (bericht.erzeugt > 0) await cacheReload("objekte");
    toast(abschlussMeldung(bericht));
    return bericht;
  } catch (e) {
    // Die einzelnen Aufrufe fangen ihre Fehler selbst. Hier landet nur, was
    // den ganzen Durchgang umwirft, und das soll niemand übersehen.
    const meldung = e instanceof Error ? e.message : "Unbekannter Fehler";
    console.error("Objekttexte, Durchgang abgebrochen:", e);
    setze({ fehler: meldung });
    toast({ title: "Der Durchgang ist abgebrochen.", description: meldung, variant: "destructive" });
    return undefined;
  } finally {
    setze({ laeuft: false, haeltAn: false, fortschritt: undefined });
  }
}

/** Vor dem nächsten Objekt anhalten. Das laufende schreibt noch zu Ende. */
export function halteGesamtlaufAn(): void {
  if (!zustand.laeuft) return;
  abbruch = true;
  setze({ haeltAn: true });
}

/** Nur für Tests: den Zustand zurücksetzen. */
export function vergissGesamtlauf(): void {
  abbruch = false;
  zustand = LEER;
  for (const h of hoerer) h();
}
