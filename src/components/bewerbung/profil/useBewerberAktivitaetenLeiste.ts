import { useEffect, useRef, useState } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";
import { getCurrentUserId } from "@/lib/currentUser";
import { getUserSetting, setUserSettingSicher } from "@/lib/userSettingsCache";
import { useToast } from "@/hooks/use-toast";

const TABELLEN = ["user_settings"];
export const BEWERBER_AKTIVITAETEN_SCHLUESSEL = "bewerberprofilAktivitaetenOffen";

/**
 * Ob die Aktivitätenleiste des Bewerberprofils offen steht, je Nutzer gemerkt.
 *
 * Aufgebaut wie `useAktivitaetenLeiste` im Kundenprofil, mit eigenem
 * Schlüssel: Wer die Leiste beim Kunden zuklappt, will sie beim Bewerber nicht
 * zwangsläufig auch zu haben. Gespeichert wird ausschliesslich die Darstellung,
 * niemals Daten des Bewerbers.
 *
 * Schlägt das Speichern fehl, springt die Leiste sichtbar zurück und sagt es.
 * Eine still verschluckte Einstellung wäre schlimmer: Beim nächsten Öffnen
 * stünde sie wieder anders, ohne dass jemand versteht, warum.
 */
export function useBewerberAktivitaetenLeiste() {
  const { authUser } = useUser();
  const userId = authUser?.id || "";
  const bereit = useCacheReady(TABELLEN);
  const version = useLiveVersion(TABELLEN);
  const { toast } = useToast();
  const [entscheidung, setEntscheidung] = useState<{ userId: string; offen: boolean } | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const aktuellerNutzer = useRef(userId);
  aktuellerNutzer.current = userId;

  useEffect(() => {
    // Der Einstellungshelfer darf erst nach der Zuordnung zum angemeldeten Nutzer lesen.
    if (!bereit || !userId || getCurrentUserId() !== userId) return;
    const wert = getUserSetting<unknown>(BEWERBER_AKTIVITAETEN_SCHLUESSEL, true);
    setEntscheidung({ userId, offen: typeof wert === "boolean" ? wert : true });
  }, [bereit, userId, version]);

  const offen = entscheidung?.userId === userId ? entscheidung.offen : true;

  const setzen = async (neu: boolean) => {
    if (speichert) return;
    const vorher = offen;
    setEntscheidung({ userId, offen: neu });
    setSpeichert(true);
    try {
      if (!bereit || !userId || getCurrentUserId() !== userId) throw new Error("Einstellungen werden noch geladen.");
      await setUserSettingSicher(BEWERBER_AKTIVITAETEN_SCHLUESSEL, neu);
      if (aktuellerNutzer.current === userId) setEntscheidung({ userId, offen: neu });
    } catch {
      if (aktuellerNutzer.current === userId) {
        setEntscheidung({ userId, offen: vorher });
        toast({
          title: "Ansicht nicht gespeichert",
          description: "Bitte versuche es erneut, sobald Deine Einstellungen geladen sind.",
          variant: "destructive",
        });
      }
    } finally {
      setSpeichert(false);
    }
  };

  return { offen, setzen, speichert };
}
