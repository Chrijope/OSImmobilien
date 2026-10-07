import { useEffect, useRef, useState } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";
import { getCurrentUserId } from "@/lib/currentUser";
import { getUserSetting, setUserSettingSicher } from "@/lib/userSettingsCache";
import { useToast } from "@/hooks/use-toast";

const TABELLEN = ["user_settings"];
export const AKTIVITAETEN_LEISTE_SCHLUESSEL = "kundenprofilAktivitaetenOffen";

/** Speichert ausschließlich die Darstellung, niemals Daten des Kunden. */
export function useAktivitaetenLeiste() {
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
    const wert = getUserSetting<unknown>(AKTIVITAETEN_LEISTE_SCHLUESSEL, true);
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
      await setUserSettingSicher(AKTIVITAETEN_LEISTE_SCHLUESSEL, neu);
      if (aktuellerNutzer.current === userId) setEntscheidung({ userId, offen: neu });
    } catch {
      if (aktuellerNutzer.current === userId) {
        setEntscheidung({ userId, offen: vorher });
        toast({ title: "Ansicht nicht gespeichert", description: "Bitte versuche es erneut, sobald Deine Einstellungen geladen sind.", variant: "destructive" });
      }
    } finally {
      setSpeichert(false);
    }
  };
  return { offen, setzen, speichert };
}
