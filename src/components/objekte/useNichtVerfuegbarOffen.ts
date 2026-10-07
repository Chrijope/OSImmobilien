import { useCallback, useEffect, useState } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";
import { getCurrentUserId } from "@/lib/currentUser";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";

const TABELLEN = ["user_settings"];

/**
 * Der Schluessel in `user_settings.einstellungen`.
 *
 * Gespeichert wird ueber `setUserSetting`, das genau diesen einen Schluessel
 * als Patch an `merge_user_settings` gibt. Das ganze Einstellungsobjekt wird
 * nie geschrieben, eine parallel gespeicherte Einstellung bleibt also stehen.
 * Eine Migration braucht es dafuer nicht.
 */
export const NICHT_VERFUEGBAR_ZU_SCHLUESSEL = "objekteNichtVerfuegbarZu";

/**
 * Gespeichert wird, ob der Block ZU ist, nicht ob er offen ist.
 *
 * Wie im Kundenprofil: Der Normalfall ist offen. Nur ein echtes `true` klappt
 * zu. Alles andere, was in der JSON-Spalte stehen koennte (ein alter Rest,
 * eine Zeichenkette, `null`), laesst den Block offen, statt ihn stumm zu
 * verstecken.
 */
export function leseZu(wert: unknown): boolean {
  return wert === true;
}

/**
 * Merkt sich je Nutzer, ob der Block "Nicht verfuegbar" in der
 * Objektuebersicht zugeklappt ist. Gilt fuer Kachel- und Listenansicht
 * gemeinsam und ueber den naechsten Login hinaus.
 *
 * Reine Darstellung, keine
 * Objektdaten. Deshalb klappt der Block sofort, und das Speichern laeuft
 * daneben. Ein fehlgeschlagener Schreibvorgang kostet hoechstens die
 * Erinnerung an eine Ansicht.
 */
export function useNichtVerfuegbarOffen() {
  const { authUser } = useUser();
  const userId = authUser?.id || "";
  const bereit = useCacheReady(TABELLEN);
  const version = useLiveVersion(TABELLEN);
  // Der Nutzer steht mit im Zustand, damit nach einem Nutzerwechsel nicht die
  // Ansicht des vorherigen Kontos weitergilt, bis das Lesen durch ist.
  const [stand, setStand] = useState<{ userId: string; zu: boolean } | null>(null);

  useEffect(() => {
    // Der Einstellungshelfer darf erst nach der Zuordnung zum angemeldeten Nutzer lesen.
    if (!bereit || !userId || getCurrentUserId() !== userId) return;
    setStand({ userId, zu: leseZu(getUserSetting<unknown>(NICHT_VERFUEGBAR_ZU_SCHLUESSEL, null)) });
  }, [bereit, userId, version]);

  // Bis das Lesen durch ist, und fuer einen anderen Nutzer, steht der Block offen.
  const zu = stand?.userId === userId ? stand.zu : false;

  const setzeOffen = useCallback(
    (offen: boolean) => {
      if (!zu === offen) return;
      setStand({ userId, zu: !offen });
      // Solange die Einstellungen noch laden, nichts schreiben: Das ginge gegen
      // einen leeren Zwischenspeicher. Auf dem Bildschirm klappt es trotzdem.
      if (!bereit || !userId || getCurrentUserId() !== userId) return;
      setUserSetting(NICHT_VERFUEGBAR_ZU_SCHLUESSEL, !offen);
    },
    [zu, userId, bereit],
  );

  return { offen: !zu, setzeOffen };
}
