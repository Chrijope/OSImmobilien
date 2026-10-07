/**
 * Zeitraum und Sicht des Dashboards, an einer Stelle.
 *
 * Die Filterleiste oben und die Karten darunter müssen dieselbe Auswahl
 * benutzen. Wenn ein Admin auf "Ganze Firma" stellt, muss auch die
 * Follow-Up-Karte firmenweit zählen, sonst stehen zwei Zahlen nebeneinander,
 * die verschiedene Dinge meinen.
 *
 * Die Auswahl wird gespeichert und über ein Ereignis verteilt, damit alle
 * Karten sofort nachziehen.
 */
import { useEffect, useState } from "react";
import { getUserSetting, setUserSetting } from "./userSettingsCache";
import { isTestAccount } from "./dbStoreHelper";
import type { Sicht, Zeitraum } from "./dashboardKpis";

const ZEITRAUM_KEY = "dashboard_zeitraum";
const SICHT_KEY = "dashboard_sicht";
const EREIGNIS = "dashboard-filter-geaendert";

function lade<T extends string>(key: string, vorgabe: T): T {
  if (isTestAccount()) {
    try {
      return (localStorage.getItem(`mi_${key}`) as T) || vorgabe;
    } catch {
      return vorgabe;
    }
  }
  return getUserSetting<T>(key, vorgabe);
}

function speichere(key: string, wert: string) {
  if (isTestAccount()) {
    try { localStorage.setItem(`mi_${key}`, wert); } catch { /* ignore */ }
  } else {
    setUserSetting(key, wert);
  }
  window.dispatchEvent(new CustomEvent(EREIGNIS));
}

export function ladeZeitraum(vorgabe: Zeitraum = "monat"): Zeitraum {
  return lade<Zeitraum>(ZEITRAUM_KEY, vorgabe);
}

export function ladeSicht(vorgabe: Sicht = "eigen"): Sicht {
  return lade<Sicht>(SICHT_KEY, vorgabe);
}

export function setzeZeitraum(z: Zeitraum) { speichere(ZEITRAUM_KEY, z); }
export function setzeSicht(s: Sicht) { speichere(SICHT_KEY, s); }

/** Liest die aktuelle Auswahl und aktualisiert sich, wenn jemand sie ändert. */
export function useDashboardFilter(weiteSicht: boolean): {
  zeitraum: Zeitraum;
  sicht: Sicht;
  setzeZeitraum: (z: Zeitraum) => void;
  setzeSicht: (s: Sicht) => void;
} {
  const vorgabeSicht: Sicht = weiteSicht ? "firma" : "eigen";
  const [zeitraum, setZ] = useState<Zeitraum>("monat");
  const [sicht, setS] = useState<Sicht>(vorgabeSicht);

  useEffect(() => {
    const lesen = () => {
      setZ(ladeZeitraum());
      // Ohne Team- oder Firmenrechte bleibt es bei der eigenen Sicht, auch
      // wenn in den Einstellungen noch etwas anderes steht.
      const gespeichert = ladeSicht(vorgabeSicht);
      setS(weiteSicht ? gespeichert : "eigen");
    };
    lesen();
    window.addEventListener(EREIGNIS, lesen);
    return () => window.removeEventListener(EREIGNIS, lesen);
  }, [weiteSicht, vorgabeSicht]);

  return {
    zeitraum,
    sicht,
    setzeZeitraum: (z: Zeitraum) => { setZ(z); setzeZeitraum(z); },
    setzeSicht: (s: Sicht) => { setS(s); setzeSicht(s); },
  };
}
