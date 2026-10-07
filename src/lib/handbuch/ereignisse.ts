/**
 * Zähler für den Trichter der Handbuch-Seite.
 *
 * Derselbe Weg wie beim Analysetool und beim Steuerrechner: über die Function
 * `analyse-ereignis` in die Tabelle `analysetool_ereignisse`, mit dem
 * Werkzeug „handbuch“. Ohne Personenbezug, nur Stufe, Partner und Kampagne.
 * Fehler werden verschluckt, ein Zähler darf nie den Ablauf stören.
 *
 * Solange die Migration 20260926170000 nicht gelaufen ist, weist die Tabelle
 * die neuen Stufen ab, und es wird schlicht nichts gezählt.
 *
 * Die Stufen sind die Grundlage für ein späteres Retargeting (Strategie,
 * Kapitel 6: „Retargeting der Handbuch-Leser“). Dafür braucht es zusätzlich
 * die Marketing-Einwilligung und die Conversions-API, beides hängt heute am
 * Meta Pixel des Partners (`useMetaPixelMitEinwilligung`).
 */
import { sendeZaehlEreignis } from "@/lib/analysetoolEreignisse";
import { kampagneErfassen, kampagnenName, OHNE_KAMPAGNE } from "@/lib/kampagnenKennung";
import {
  WERKZEUG_HANDBUCH,
  type HandbuchEreignis,
} from "../../../supabase/functions/_shared/handbuch-ereignisse.ts";

const bereitsGezaehlt = new Set<string>();

function kampagneFuerZaehler(): string | null {
  const name = kampagnenName(kampagneErfassen());
  return name === OHNE_KAMPAGNE ? null : name;
}

/** Zählt eine Stufe, je Sitzung und Partner nur einmal. */
export async function zaehleHandbuch(typ: HandbuchEreignis, beraterId?: string | null): Promise<void> {
  const schluessel = `${typ}:${beraterId || ""}`;
  if (bereitsGezaehlt.has(schluessel)) return;
  bereitsGezaehlt.add(schluessel);
  await sendeZaehlEreignis({
    // Die Typangabe von `sendeZaehlEreignis` kennt nur die vier alten
    // Stufen. Die Function prüft die neuen selbst, deshalb hier die Umwandlung.
    typ: typ as unknown as Parameters<typeof sendeZaehlEreignis>[0]["typ"],
    werkzeug: WERKZEUG_HANDBUCH,
    berater_id: beraterId || null,
    kampagne: kampagneFuerZaehler(),
  });
}

/** Nur für Tests. */
export function _handbuchZaehlerZuruecksetzen(): void {
  bereitsGezaehlt.clear();
}
