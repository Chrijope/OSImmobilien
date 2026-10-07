import { useCallback, useEffect, useState } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";
import { getCurrentUserId } from "@/lib/currentUser";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";

const TABELLEN = ["user_settings"];

/**
 * Der Schluessel in `user_settings.einstellungen`, gespeichert wie beim Block
 * „Nicht verfuegbar“ (`useNichtVerfuegbarOffen`): nur dieser eine Schluessel
 * als Patch, keine Migration.
 */
export const KENNZAHLEN_HANDY_OFFEN_SCHLUESSEL = "objekteKennzahlenHandyOffen";

/**
 * Gespeichert wird, ob die Kennzahlen auf dem Handy OFFEN sind. Der
 * Normalfall auf dem Handy ist zu (Befund vom 24.09.2026: Vor dem ersten
 * Objekt standen dort acht Kacheln). Nur ein echtes `true` klappt auf.
 */
export function leseOffen(wert: unknown): boolean {
  return wert === true;
}

/**
 * Merkt sich je Nutzer, ob die Portfolio-Kennzahlen der Objektliste auf dem
 * Handy aufgeklappt sind. Am Computer spielt der Wert keine Rolle, dort
 * stehen die Kacheln immer.
 */
export function useKennzahlenHandyOffen() {
  const { authUser } = useUser();
  const userId = authUser?.id || "";
  const bereit = useCacheReady(TABELLEN);
  const version = useLiveVersion(TABELLEN);
  const [stand, setStand] = useState<{ userId: string; offen: boolean } | null>(null);

  useEffect(() => {
    if (!bereit || !userId || getCurrentUserId() !== userId) return;
    setStand({ userId, offen: leseOffen(getUserSetting<unknown>(KENNZAHLEN_HANDY_OFFEN_SCHLUESSEL, null)) });
  }, [bereit, userId, version]);

  // Bis das Lesen durch ist, und fuer einen anderen Nutzer, bleibt es zu.
  const offen = stand?.userId === userId ? stand.offen : false;

  const setzeOffen = useCallback(
    (neu: boolean) => {
      if (neu === offen) return;
      setStand({ userId, offen: neu });
      if (!bereit || !userId || getCurrentUserId() !== userId) return;
      setUserSetting(KENNZAHLEN_HANDY_OFFEN_SCHLUESSEL, neu);
    },
    [offen, userId, bereit],
  );

  return { offen, setzeOffen };
}
