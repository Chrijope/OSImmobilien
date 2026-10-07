import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ladeTabellen } from "@/lib/dataCache";
import { tabellenFuerPfad } from "@/lib/routenTabellen";

/**
 * Laedt bei jedem Seitenwechsel die Tabellen der neuen Route in den Cache.
 *
 * Wird einmal im App-Rahmen (`AppShell`) aufgerufen. Die Seite selbst
 * kann ueber `useCacheReady([...])` zusaetzlich auf einzelne Tabellen
 * warten; beides laeuft ueber `ladeTabellen`, das laufende Ladevorgaenge
 * zusammenfuehrt. Was schon im Cache liegt, kostet nichts.
 */
export function useRoutenTabellen(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    void ladeTabellen(tabellenFuerPfad(pathname));
  }, [pathname]);
}
