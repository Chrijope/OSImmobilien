import { useEffect, useState, useSyncExternalStore } from "react";
import {
  aktuelleCookieEinwilligung,
  aktuellerPartnerPixelKontext,
  aufEinwilligungHoeren,
  aufPartnerPixelKontextHoeren,
  type CookieEinwilligung,
  type PartnerPixelKontext,
} from "@/lib/cookieEinwilligung";

/**
 * Die aktuelle Cookie-Einwilligung, neu gerendert bei jeder geänderten Wahl,
 * auch wenn sie in einem anderen Tab geändert wurde.
 * `null` heißt: Der Besucher hat noch nicht entschieden.
 */
export function useCookieEinwilligung(): CookieEinwilligung | null {
  const [einwilligung, setEinwilligung] = useState<CookieEinwilligung | null>(() =>
    aktuelleCookieEinwilligung(),
  );
  useEffect(() => aufEinwilligungHoeren(setEinwilligung), []);
  return einwilligung;
}

/** Der Partner, dessen Pixel auf der offenen Seite laden dürfte, oder `null`. */
export function usePartnerPixelKontext(): PartnerPixelKontext | null {
  return useSyncExternalStore(aufPartnerPixelKontextHoeren, aktuellerPartnerPixelKontext, () => null);
}
