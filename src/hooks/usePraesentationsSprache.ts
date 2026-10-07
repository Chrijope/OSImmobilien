import { useCallback, useEffect, useRef, useState } from "react";
import {
  leseSprache,
  merkeSprache,
  spracheSchluessel,
  startSprache,
  type PraesentationsSprache,
} from "@/lib/beratungspraesentationSprache";

/**
 * Sprache der Beratungspräsentation, je Nutzer gemerkt.
 *
 * Die Kennung des Nutzers steht beim ersten Rendern oft noch nicht fest, die
 * Anmeldung lädt nach. Sobald sie da ist, wird seine gemerkte Wahl geholt.
 * Hat er noch keine, bleibt die aktuelle stehen, damit ein Wechsel kurz nach
 * dem Öffnen nicht wieder zurückspringt.
 *
 * `kundenSprache` (seit dem 25.09.2026, Plan Kundensprache K10): Wird die
 * Präsentation mit einem Kunden geöffnet, startet sie in dessen Sprache aus
 * dem Profil, auch wenn der Zwischenspeicher sie erst nachlädt. Der Berater
 * kann trotzdem umschalten; diese Wahl gilt dann für das Gespräch und wird
 * nicht als seine eigene Voreinstellung gemerkt, damit der nächste Kunde
 * nicht in der Sprache des vorigen beginnt.
 */
export function usePraesentationsSprache(
  nutzerKennung?: string | null,
  kundenSprache?: PraesentationsSprache | null,
) {
  const schluessel = spracheSchluessel(nutzerKennung);
  const [sprache, setSprache] = useState<PraesentationsSprache>(() => startSprache(kundenSprache, leseSprache(schluessel)));
  // Hat der Berater in diesem Gespräch selbst umgeschaltet? Dann gewinnt seine Wahl.
  const vonHand = useRef(false);

  useEffect(() => {
    if (kundenSprache || vonHand.current) return;
    const gemerkt = leseSprache(schluessel);
    if (gemerkt) setSprache(gemerkt);
  }, [schluessel, kundenSprache]);

  useEffect(() => {
    if (kundenSprache && !vonHand.current) setSprache(kundenSprache);
  }, [kundenSprache]);

  const waehleSprache = useCallback(
    (neu: PraesentationsSprache) => {
      vonHand.current = true;
      setSprache(neu);
      if (!kundenSprache) merkeSprache(schluessel, neu);
    },
    [schluessel, kundenSprache],
  );

  return [sprache, waehleSprache] as const;
}
