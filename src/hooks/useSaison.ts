import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { useVideoraumOptional } from "@/contexts/VideoraumContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { getAppConfig } from "@/lib/appConfigStore";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { istVorfuehrmodusAktiv, VORFUEHRMODUS_EREIGNIS } from "@/lib/vorfuehrmodus";
import {
  anlassAm,
  heuteText,
  rolleSiehtFiguren,
  SCHLUESSEL_AUS,
  SCHLUESSEL_HEUTE_AUS,
  SCHLUESSEL_ZENTRAL,
  vorschauAnlass,
  type Anlass,
  type ZentraleSchalter,
} from "@/lib/saison";

/** Fensterereignis nach jedem Umschalten, damit alle Figuren gleichzeitig reagieren. */
export const SAISON_EREIGNIS = "saison-geaendert";

export function saisonGeaendert() {
  window.dispatchEvent(new CustomEvent(SAISON_EREIGNIS));
}

/**
 * Welcher Anlass gerade läuft und ob dieser Nutzer jetzt eine Figur sieht.
 *
 * Unsichtbar bleibt sie, wenn der Anlass zentral aus ist, der Nutzer die
 * Figuren abgeschaltet oder für heute ausgeblendet hat, ein Videogespräch
 * läuft oder der Vorführmodus an ist. In den beiden letzten Fällen sieht der
 * Kunde den Bildschirm mit.
 */
export function useSaison() {
  const { user } = useUser();
  const { search } = useLocation();
  const video = useVideoraumOptional();
  useLiveVersion(["app_config", "user_settings"]);
  const [, setStand] = useState(0);
  const [vorfuehrung, setVorfuehrung] = useState(istVorfuehrmodusAktiv());

  useEffect(() => {
    const neu = () => setStand((n) => n + 1);
    const vorf = () => setVorfuehrung(istVorfuehrmodusAktiv());
    window.addEventListener(SAISON_EREIGNIS, neu);
    window.addEventListener(VORFUEHRMODUS_EREIGNIS, vorf);
    return () => {
      window.removeEventListener(SAISON_EREIGNIS, neu);
      window.removeEventListener(VORFUEHRMODUS_EREIGNIS, vorf);
    };
  }, []);

  const vorschau = vorschauAnlass(user.role, search);
  const anlass: Anlass | null = vorschau ?? anlassAm(new Date());
  const zentral = getAppConfig<ZentraleSchalter>(SCHLUESSEL_ZENTRAL, {});
  const zentralAn = !!anlass && zentral[anlass] !== false;
  const persoenlichAus = getUserSetting<boolean>(SCHLUESSEL_AUS, false) === true;
  const heuteAus = getUserSetting<string>(SCHLUESSEL_HEUTE_AUS, "") === heuteText();

  const sichtbar =
    !!anlass &&
    rolleSiehtFiguren(user.role) &&
    (zentralAn || !!vorschau) &&
    !persoenlichAus &&
    !heuteAus &&
    !video?.aktiv &&
    !vorfuehrung;

  const heuteAusblenden = useCallback(() => {
    void setUserSetting(SCHLUESSEL_HEUTE_AUS, heuteText());
    saisonGeaendert();
  }, []);

  return { anlass, sichtbar, vorschau: !!vorschau, heuteAusblenden };
}
