import { useState, useEffect } from "react";
import { isCacheReady, isTableLoaded, ladeTabellen, ladezeitLoggen, onCacheChange } from "@/lib/dataCache";
import { isTestAccount } from "@/lib/dbStoreHelper";

/**
 * Sagt, ob die genannten Cache-Tabellen geladen sind, und stoesst das Laden
 * fehlender Tabellen selbst an.
 *
 * Seit dem Laden je Route (routenTabellen.ts) liegt beim Login nur noch im
 * Cache, was die Startroute braucht. Eine Seite, die hier Tabellen nennt,
 * bekommt sie also nachgeladen, statt auf eine Ladewelle zu warten, die es
 * nicht mehr gibt. Laufende Ladevorgaenge werden in `ladeTabellen`
 * zusammengefuehrt, ein doppelter Aufruf startet keine zweite Abfrage.
 *
 * Ohne Tabellenliste gilt der Cache als bereit, sobald die Startwelle durch
 * ist. Testkonten sind immer sofort bereit.
 */
export function useCacheReady(tables?: string[]): boolean {
  const [ready, setReady] = useState(() => {
    if (isTestAccount()) return true;
    if (!tables || tables.length === 0) return isCacheReady();
    return tables.every(t => isTableLoaded(t));
  });

  useEffect(() => {
    if (isTestAccount()) { setReady(true); return; }
    if (ready) return;

    // Check immediately
    const check = () => {
      if (!tables || tables.length === 0) return isCacheReady();
      return tables.every(t => isTableLoaded(t));
    };
    if (check()) { setReady(true); return; }

    // Fehlende Tabellen holen. Bei einem Ladefehler bleibt die Seite im
    // Ladezustand und der rote Hinweis mit "Erneut laden" erscheint, wie beim
    // Start.
    const fehlend = (tables || []).filter((t) => !isTableLoaded(t));
    // Fuer das Ladezeiten-Protokoll: wie lange die Seite auf welche Tabellen
    // gewartet hat. Das ist die Zahl, die der Nutzer als Wartezeit spuert.
    const wartetSeit = performance.now();
    const unsub = onCacheChange(() => {
      if (!check()) return;
      ladezeitLoggen(`Seite wartete ${Math.round(performance.now() - wartetSeit)} ms auf ${fehlend.join(", ") || "den Start"}`);
      setReady(true);
    });

    if (fehlend.length > 0) void ladeTabellen(fehlend);

    return unsub;
  }, [ready, tables?.join(",")]);

  return ready;
}
