/**
 * Wo eine Datei des Objektbereichs liegt und wie lange ihre Adresse gilt.
 *
 * Gemeinsam für `get-kundenansicht` und `get-expose`. Liegt in `_shared`,
 * weil Lovable beim Ausrollen nur den Ordner der Function und `_shared`
 * mitnimmt: Ein Import aus dem Ordner einer anderen Function bricht das
 * Ausrollen (so geschehen am 23.09.2026, siehe Commit „get-kundenansicht
 * ausgerollt“).
 */

import { sichererSpeicherpfad } from "./speicherpfad.ts";

/** So lange gilt die Adresse einer einzelnen Datei: 15 Minuten. */
export const DATEI_GUELTIG_SEKUNDEN = 15 * 60;

/** Eine Kennung, wie sie in Adresse und Anfrage vorkommen darf. */
const KENNUNG = /^[A-Za-z0-9_.:-]{1,100}$/;

export function istKennung(v: unknown): v is string {
  return typeof v === "string" && KENNUNG.test(v);
}

function textWert(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

/** Eimer und Pfad einer Datei. Nur die Eimer des Objektbereichs. */
export interface Ablage {
  eimer: "objekt-dokumente" | "investagon-dokumente" | "objekt-medien";
  pfad: string;
}

const ZEIGER: Array<{ praefix: string; eimer: Ablage["eimer"] }> = [
  { praefix: "/objekt-dokument/", eimer: "objekt-dokumente" },
  { praefix: "/investagon-dokument/", eimer: "investagon-dokumente" },
];
const ERLAUBTE_EIMER: readonly Ablage["eimer"][] = ["objekt-dokumente", "investagon-dokumente", "objekt-medien"];

/** Seit dem 28.09.2026 die gemeinsame strenge Prüfung (`speicherpfad.ts`, LOTSE-R5-001). */
const sichererPfad = sichererSpeicherpfad;

/**
 * Wo die Datei liegt, aus dem gespeicherten Wert.
 *
 * Zeiger auf die geschützten Eimer (`/objekt-dokument/…`,
 * `/investagon-dokument/…`) und ältere Adressen im eigenen Speicher. Eine
 * Adresse bei Investagon oder sonstwo, ein Pfad im Kundeneimer `unterlagen`
 * und alles Unbekannte ergeben nichts: Die Unterlage erscheint dann nicht.
 */
export function ablageFuer(gespeichert: unknown): Ablage | null {
  const wert = textWert(gespeichert);
  if (!wert) return null;
  for (const { praefix, eimer } of ZEIGER) {
    if (wert.startsWith(praefix)) {
      const pfad = sichererPfad(wert.slice(praefix.length));
      return pfad ? { eimer, pfad } : null;
    }
  }
  const treffer = wert.match(/^https:\/\/[^/?#]+\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/i);
  if (!treffer || !(ERLAUBTE_EIMER as readonly string[]).includes(treffer[1])) return null;
  let pfad = treffer[2];
  try {
    pfad = decodeURIComponent(pfad);
  } catch {
    return null;
  }
  const sicher = sichererPfad(pfad);
  return sicher ? { eimer: treffer[1] as Ablage["eimer"], pfad: sicher } : null;
}
