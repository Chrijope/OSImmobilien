/**
 * Glocke „Neue Einheit passt zu deinen Kunden“ (seit 24.10.2026).
 *
 * Legt der Investagon-Import ein Objekt neu an, sieht der Partner bisher nur
 * das Kennzeichen „Neu“ in der Objektliste. Ob es zu einem seiner suchenden
 * Kunden passt, sah er erst, wenn er die Einheit selbst öffnete (Karte
 * „Passende Kunden“). Jetzt meldet sich das CRM einmal je Objekt mit einer
 * Glocke.
 *
 * Warum im Browser und nicht im Import: Die Passung hängt am
 * Finanzierungsrahmen aus der Selbstauskunft und am Objektscore. Beides
 * rechnet nur der Browser (`passendeKundenFuerObjekt`). Eine zweite Fassung
 * in der Edge Function liefe auseinander. Deshalb prüft das CRM beim Öffnen,
 * und die Sperre `meta.sperre` mit dem eindeutigen Index aus 20261004191000
 * sorgt dafür, dass die Glocke auch über mehrere Geräte nur einmal kommt.
 */
import { neuAngelegtAm, investagonErstelltAm, type NeuPruefbar } from "./objekteNeu";

/** So lange nach der Anlage meldet sich ein neues Objekt noch. */
export const NEUE_EINHEIT_GLOCKE_TAGE = 3;

export interface NeueEinheitGlocke {
  objektId: string;
  titel: string;
  nachricht: string;
  link: string;
  sperre: string;
}

interface ObjektKurz extends NeuPruefbar {
  id: string;
  titel?: string;
  ort?: string;
}

/**
 * Die Glocken für neue Objekte mit mindestens einem passenden eigenen Kunden.
 * `passendeNamen` liefert die Namen der passenden Kunden des Partners.
 */
export function neueEinheitGlocken<T extends ObjektKurz>(
  objekte: readonly T[],
  passendeNamen: (objekt: T) => string[],
  jetzt: number = Date.now(),
): NeueEinheitGlocke[] {
  const grenze = jetzt - NEUE_EINHEIT_GLOCKE_TAGE * 24 * 60 * 60 * 1000;
  const glocken: NeueEinheitGlocke[] = [];
  for (const o of objekte) {
    const seit = Math.max(neuAngelegtAm(o) ?? 0, investagonErstelltAm(o) ?? 0);
    if (!seit || seit < grenze || seit > jetzt) continue;
    const namen = [...new Set(passendeNamen(o))];
    if (namen.length === 0) continue;
    const genannt = namen.slice(0, 3).join(", ") + (namen.length > 3 ? ` und ${namen.length - 3} weitere` : "");
    const wo = [o.titel, o.ort].filter(Boolean).join(", ") || "Neues Objekt";
    glocken.push({
      objektId: o.id,
      titel: namen.length === 1 ? "Neue Einheit passt zu einem deiner Kunden" : `Neue Einheiten passen zu ${namen.length} deiner Kunden`,
      nachricht: `${wo}: passt zu ${genannt}.`,
      link: `/objekte/${o.id}`,
      sperre: `neue-einheit:${o.id}`,
    });
  }
  return glocken;
}
