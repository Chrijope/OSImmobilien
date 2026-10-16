import { useEffect, useState } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";
import { getCurrentUserId } from "@/lib/currentUser";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";

const TABELLEN = ["user_settings"];
export const OFFENE_AUFGABEN_SCHLUESSEL = "kundenprofilOffeneAufgabenAufgeklappt";
export const NAECHSTE_AKTION_SCHLUESSEL = "kundenprofilNaechsteAktionAufgeklappt";

/**
 * Merkt je Nutzer, ob eine aufklappbare Kachel im Kundenprofil offen ist.
 *
 * Gleiches Muster wie `useAktivitaetenLeiste`, nur eine Stufe schlichter:
 * Gespeichert wird ohne Rückmeldung, weil es an der Kachel keine Anzeige für
 * "gespeichert" gibt. Klappt das Speichern nicht, bleibt die Kachel für diese
 * Sitzung trotzdem so stehen, wie geklickt wurde, und `setUserSetting`
 * schreibt den Grund in die Konsole. Das ist Darstellung, niemals eine Angabe
 * zum Kunden. Standard ist zugeklappt, damit das Profil nicht plötzlich anders
 * aussieht als bisher.
 */
function useKachelAufgeklappt(schluessel: string, rueckfallSchluessel?: string) {
  const { authUser } = useUser();
  const userId = authUser?.id || "";
  const bereit = useCacheReady(TABELLEN);
  const version = useLiveVersion(TABELLEN);
  const [entscheidung, setEntscheidung] = useState<{ userId: string; offen: boolean } | null>(null);

  useEffect(() => {
    // Erst lesen, wenn die Einstellungen geladen und dem angemeldeten Nutzer
    // zugeordnet sind. Sonst gilt kurzzeitig die Einstellung des Vorgängers.
    if (!bereit || !userId || getCurrentUserId() !== userId) return;
    const eigener = getUserSetting<unknown>(schluessel, undefined);
    // Nie selbst geschaltet: dann gilt einmal der alte Schalter, nur lesend.
    const wert = eigener === undefined && rueckfallSchluessel
      ? getUserSetting<unknown>(rueckfallSchluessel, false)
      : eigener;
    setEntscheidung({ userId, offen: wert === true });
  }, [bereit, userId, version, schluessel, rueckfallSchluessel]);

  const offen = entscheidung?.userId === userId ? entscheidung.offen : false;

  const umschalten = () => {
    const neu = !offen;
    setEntscheidung({ userId, offen: neu });
    if (bereit && userId && getCurrentUserId() === userId) {
      setUserSetting(schluessel, neu);
    }
  };

  return { offen, umschalten };
}

/**
 * Die Kachel "Nächste Aktionen". Die frühere Kachel "Offene Aufgaben" ist seit
 * dem 15.10.2026 in ihr aufgegangen. Wer deren Liste offen hatte und die neue
 * Kachel nie geschaltet hat, findet sie beim ersten Mal ebenfalls offen vor;
 * der alte Schalter wird dafür nur gelesen, nie mehr geschrieben.
 */
export function useNaechsteAktionKachel() {
  return useKachelAufgeklappt(NAECHSTE_AKTION_SCHLUESSEL, OFFENE_AUFGABEN_SCHLUESSEL);
}
