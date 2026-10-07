import { useEffect, useState } from "react";
import { ladeAktiveAbwesenheiten } from "@/lib/abwesenheitStore";

/**
 * Wen vertrete ich heute?
 *
 * Liefert die Nutzer-IDs der Personen, für die der angemeldete Nutzer laut
 * Tabelle `abwesenheiten` gerade als Vertretung eingetragen ist. Die Menge ist
 * leer, solange die Migration 20260807150000 nicht gelaufen ist, und die
 * Oberfläche verhält sich dann genau wie vorher.
 *
 * Bewusst kein Eintrag in `dataCache`: Die Tabelle gibt es in der Datenbank
 * womöglich noch nicht, und eine fehlende Tabelle in der Ladeliste reisst den
 * gesamten Realtime-Kanal mit.
 *
 * Wichtig: Diese Menge steuert nur, was jemand zu sehen bekommt. Sie ändert
 * nichts an der Zuständigkeit und damit nichts an der Provision.
 */
export function useVertretungen(eigeneUserId: string | null | undefined): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!eigeneUserId) {
      setIds(new Set());
      return;
    }
    let abgebrochen = false;
    void ladeAktiveAbwesenheiten().then((ergebnis) => {
      if (abgebrochen) return;
      const menge = new Set<string>();
      for (const e of ergebnis.eintraege) {
        if (e.vertretung_id === eigeneUserId) menge.add(e.user_id);
      }
      setIds(menge);
    });
    return () => { abgebrochen = true; };
  }, [eigeneUserId]);

  return ids;
}
