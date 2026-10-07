import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Wer welches Objekt und welche Einheit überhaupt zu sehen bekommt.
 *
 * Die Regeln stehen seit Langem in der Objektübersicht (`Objekte.tsx`, Filter
 * über `exklusivPartner` am Objekt und über `exklusivNutzer` an der Einheit).
 * Die Objektauswahl im Kundenprofil braucht dieselben, denn eine exklusiv
 * vergebene Wohnung darf dort keinem anderen Partner empfohlen werden. Damit
 * es keine zweite Auslegung gibt, stehen sie hier als reine Funktionen. Seit
 * dem 05.10.2026 liegt der Kern in `supabase/functions/_shared/objekt-zugang.ts`,
 * damit Kundenlink und Kundenansicht auf dem Server dieselbe Regel prüfen.
 * Die Objektübersicht, die globale Suche und der Routenschutz für
 * Vertriebspartner (`objektAdresseGesperrt`) nutzen sie.
 *
 * Die Zeilensicherheit der Datenbank lässt Objekte weiter lesen; hart
 * geprüft wird in den Functions, die Kunden etwas zeigen.
 */

import {
  EXKLUSIV_ALLE_SEHEN_ROLLEN,
  einheitExklusivFrei,
  objektExklusivFrei,
  objektFuerBetrachter,
} from "../../supabase/functions/_shared/objekt-zugang.ts";

/** Die Rollen, die Objekte pflegen und deshalb auch jede Exklusivzuweisung sehen. */
export { EXKLUSIV_ALLE_SEHEN_ROLLEN };

export interface ZugangsNutzer {
  rolle: string;
  /** Kennung des angemeldeten Nutzers, gegen Kennungen am Objekt und `exklusivNutzer` an der Einheit. */
  benutzerId?: string;
  /** Anzeigename, nur noch Rückfall für Exklusivpartner ohne gespeicherte Kennung. */
  name?: string;
}

export function siehtAlleExklusiven(rolle: string | undefined | null): boolean {
  return (EXKLUSIV_ALLE_SEHEN_ROLLEN as readonly string[]).includes(rolle || "");
}

const betrachter = (n: ZugangsNutzer) => ({ rollen: [n.rolle], benutzerId: n.benutzerId, name: n.name });

/**
 * Ist das Objekt für diesen Nutzer frei gegeben?
 *
 * Ein Objekt mit Exklusivpartnern sieht nur, wer als Partner eingetragen ist,
 * dazu die pflegenden Rollen. Seit dem 05.10.2026 über die Kennung, der Name
 * zählt nur noch, wo keine Kennung gespeichert ist (`_shared/objekt-zugang.ts`).
 */
export function objektExklusivSichtbar(
  objekt: Pick<ObjektData, "exklusivPartner" | "meta">,
  nutzer: ZugangsNutzer,
): boolean {
  return objektExklusivFrei(objekt, betrachter(nutzer));
}

/** Sichtbar geschaltet und nicht fremd-exklusiv, wie in der Objektübersicht. */
export function objektSichtbarFuer(
  objekt: Pick<ObjektData, "sichtbar" | "exklusivPartner" | "meta">,
  nutzer: ZugangsNutzer,
): boolean {
  return objektFuerBetrachter(objekt, betrachter(nutzer));
}

/** Ist die Einheit für diesen Nutzer frei gegeben? Gleiche Regel über die Kennung. */
export function einheitExklusivSichtbar(
  wohnung: Pick<ObjektWohnung, "exklusivNutzer">,
  nutzer: ZugangsNutzer,
): boolean {
  return einheitExklusivFrei(wohnung.exklusivNutzer, betrachter(nutzer));
}

/**
 * Sperrt eine Adresse unter `/objekte/<Objekt>` für Vertriebspartner und
 * Vertriebsleitung, wenn Objekt oder Einheit ausgeblendet oder fremd-exklusiv
 * sind (Direktlink, 05.10.2026), nach der gemeinsamen Regel. Andere Rollen
 * sind hier nicht betroffen, für sie gelten die Regeln der jeweiligen Seite.
 * Die Adressteile werden dekodiert und klein geschrieben verglichen. Ein Objekt, das (noch) nicht im
 * Zwischenspeicher liegt, sperrt nichts; die Seite zeigt dann selbst
 * „nicht gefunden“, und nach dem Laden greift die Sperre.
 */
export function objektAdresseGesperrt(
  pfad: string,
  nutzer: ZugangsNutzer,
  finde: (objektId: string) => ObjektData | undefined,
): boolean {
  if (!ADRESSE_GESPERRT_ROLLEN.includes(nutzer.rolle)) return false;
  const teile = pfad.split(/[?#]/)[0].split("/").filter(Boolean).map(dekodiert);
  if (teile[0] !== "objekte" || !teile[1] || !KENNUNG.test(teile[1])) return false;
  const objekt = finde(teile[1]);
  if (!objekt) return false;
  if (!objektSichtbarFuer(objekt, nutzer)) return true;
  const einheitId = teile.slice(2).find((t) => KENNUNG.test(t));
  if (!einheitId) return false;
  const einheit = [...(objekt.wohnungen || []), ...(objekt.wohnungenNichtImAngebot || [])]
    .find((w) => String(w.id || "").toLowerCase() === einheitId);
  return !!einheit && !einheitExklusivSichtbar(einheit, nutzer);
}

const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rollen, für die `objektAdresseGesperrt` gilt. */
export const ADRESSE_GESPERRT_ROLLEN: readonly string[] = ["vertriebspartner", "vertriebsleiter"];

function dekodiert(teil: string): string {
  try {
    return decodeURIComponent(teil).trim().toLowerCase();
  } catch {
    return teil.trim().toLowerCase();
  }
}
