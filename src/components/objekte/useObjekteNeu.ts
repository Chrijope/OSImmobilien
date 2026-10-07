import { useCallback, useEffect, useState } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";
import { getCurrentUserId } from "@/lib/currentUser";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import {
  ERST_GESEHEN_SCHLUESSEL,
  leseErstGesehen,
  merkeErstesSehen,
  neuSeit,
  type ErstGesehen,
  type NeuPruefbar,
} from "@/lib/objekteNeu";

const TABELLEN = ["user_settings"];

/**
 * Das Kennzeichen "Neu" je Nutzer: liest, wann er welches neue Objekt zum
 * ersten Mal gesehen hat, und merkt sich das erste Sehen.
 *
 * Aufgebaut wie `useNichtVerfuegbarOffen`. Gespeichert wird ueber
 * `setUserSetting`, das nur den einen Schluessel als Patch an
 * `merge_user_settings` gibt. Testkonten landen dort im Browser-Speicher statt
 * in der Datenbank, das erledigt `userSettingsCache` selbst, wie bei allen
 * anderen Nutzereinstellungen.
 *
 * Zwei Teile, weil die Seite sie an verschiedenen Stellen braucht:
 * `neuSeit` schon beim Sortieren, `merkeGesehen` erst, wenn feststeht, was
 * wirklich als Kachel oder Zeile auf dem Bildschirm steht.
 */
export function useObjekteNeu() {
  const { authUser } = useUser();
  const userId = authUser?.id || "";
  const bereit = useCacheReady(TABELLEN);
  const version = useLiveVersion(TABELLEN);
  // Der Nutzer steht mit im Zustand, damit nach einem Nutzerwechsel nicht die
  // Merkliste des vorherigen Kontos weitergilt, bis das Lesen durch ist.
  const [stand, setStand] = useState<{ userId: string; erstGesehen: ErstGesehen } | null>(null);

  useEffect(() => {
    // Der Einstellungshelfer darf erst nach der Zuordnung zum angemeldeten Nutzer lesen.
    if (!bereit || !userId || getCurrentUserId() !== userId) return;
    setStand({ userId, erstGesehen: leseErstGesehen(getUserSetting<unknown>(ERST_GESEHEN_SCHLUESSEL, null)) });
  }, [bereit, userId, version]);

  // `null` heisst: fuer diesen Nutzer noch nicht gelesen.
  const erstGesehen = stand?.userId === userId ? stand.erstGesehen : null;

  /**
   * Der Anlagezeitpunkt, wenn das Objekt fuer diesen Nutzer neu ist, sonst
   * `null`. Solange die Merkliste nicht gelesen ist, ist nichts neu: Sonst
   * stuende kurz ein Kennzeichen da, das nach dem Laden wieder verschwindet,
   * und das Objekt spraenge vor und zurueck.
   */
  const neuSeitFuer = useCallback(
    (objekt: NeuPruefbar) => (erstGesehen ? neuSeit(objekt, erstGesehen, Date.now()) : null),
    [erstGesehen],
  );

  /**
   * Traegt fuer angezeigte Objekte das erste Sehen ein. Schreibt nur, wenn
   * wirklich ein Eintrag dazukommt; ein zweiter Aufruf mit denselben Objekten
   * tut nichts. Die Seite darf das also nach jedem Zeichnen aufrufen.
   */
  const merkeGesehen = useCallback(
    (angezeigt: readonly NeuPruefbar[]) => {
      // Solange die Einstellungen noch laden, nichts schreiben: Das ginge gegen
      // einen leeren Zwischenspeicher und ueberschriebe die echte Liste.
      if (!bereit || !userId || getCurrentUserId() !== userId) return;
      // Erst merken, wenn auch das Kennzeichen stehen konnte (siehe oben).
      if (!erstGesehen) return;
      // Frisch aus dem Zwischenspeicher statt aus dem Zustand: Hat ein zweiter
      // Tab inzwischen etwas eingetragen, geht es so nicht verloren.
      const bisher = leseErstGesehen(getUserSetting<unknown>(ERST_GESEHEN_SCHLUESSEL, null));
      const naechste = merkeErstesSehen(bisher, angezeigt, Date.now());
      if (!naechste) return;
      setStand({ userId, erstGesehen: naechste });
      setUserSetting(ERST_GESEHEN_SCHLUESSEL, naechste);
    },
    [bereit, userId, erstGesehen],
  );

  return { neuSeit: neuSeitFuer, merkeGesehen };
}
