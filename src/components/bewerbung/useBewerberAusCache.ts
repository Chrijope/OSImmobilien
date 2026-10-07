/**
 * Ein Bewerber aus dem Cache, der über den UserContext lädt. In einem frisch
 * geöffneten Fenster (Präsentation, Moderation) ist er oft noch leer,
 * deshalb wird bei jeder Cache-Änderung neu gelesen. Der Aufrufer sieht am
 * Ergebnis, ob noch geladen wird (`geladen` false) oder ob es den Bewerber
 * wirklich nicht gibt.
 */
import { useEffect, useState } from "react";
import { getBewerberById, type Bewerber } from "@/lib/bewerbungStore";
import { isTableLoaded, onCacheChange } from "@/lib/dataCache";

export function useBewerberAusCache(bewerberId: string): { bewerber: Bewerber | null; geladen: boolean } {
  const [stand, setStand] = useState<{ bewerber: Bewerber | null; geladen: boolean }>({ bewerber: null, geladen: false });
  useEffect(() => {
    if (!bewerberId) {
      setStand({ bewerber: null, geladen: true });
      return;
    }
    const lesen = () => setStand({
      bewerber: getBewerberById(bewerberId) ?? null,
      geladen: isTableLoaded("bewerbungen"),
    });
    lesen();
    return onCacheChange((tabelle) => {
      if (tabelle === "bewerbungen") lesen();
    });
  }, [bewerberId]);
  return stand;
}
