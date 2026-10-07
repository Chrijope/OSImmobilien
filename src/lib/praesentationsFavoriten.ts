/**
 * Die Folien-Favoriten der Übungsansicht, je Nutzer.
 *
 * Gespeichert wird wie alle persönlichen Einstellungen: als Schlüssel in der
 * JSON-Spalte `einstellungen` der Tabelle `user_settings`, über
 * `userSettingsCache.ts` (Zwischenspeicher sofort, Datenbank im Hintergrund
 * über `merge_user_settings`). Eine neue Migration braucht das nicht, die
 * Spalte nimmt jeden Schlüssel.
 *
 * Rückfall: Die Übungsansicht läuft in einem eigenen Fenster, dort ist der
 * Zwischenspeicher beim Öffnen oft noch leer. Deshalb liegt zusätzlich eine
 * Kopie im localStorage. Sie antwortet, bis die Datenbankzeile geladen ist;
 * danach hat die Datenbank das Sagen und die Kopie wird nachgezogen.
 */
import { useCallback, useEffect, useState } from "react";
import { onCacheChange } from "./dataCache";
import { getUserSetting, setUserSetting } from "./userSettingsCache";
import { sanitizeFavoriten, toggleFavorit } from "./praesentationsUebung";

export const FAVORITEN_SCHLUESSEL = "praesentationsFavoriten";
const LS_SCHLUESSEL = "mi_praesentationsFavoriten";

function ausLocalStorage(): string[] {
  try {
    const roh = localStorage.getItem(LS_SCHLUESSEL);
    return roh ? sanitizeFavoriten(JSON.parse(roh)) : [];
  } catch {
    return [];
  }
}

function inLocalStorage(liste: string[]): void {
  try {
    localStorage.setItem(LS_SCHLUESSEL, JSON.stringify(liste));
  } catch {
    /* Ohne localStorage bleibt die Datenbank der einzige Ort. */
  }
}

/** Die Favoriten lesen: Datenbankzeile zuerst, sonst die Kopie im Browser. */
export function ladeFavoriten(): string[] {
  const ausDb = getUserSetting<unknown>(FAVORITEN_SCHLUESSEL, null);
  if (Array.isArray(ausDb)) return sanitizeFavoriten(ausDb);
  return ausLocalStorage();
}

/** Die Favoriten ablegen: Kopie im Browser sofort, Datenbank im Hintergrund. */
export function speichereFavoriten(liste: string[]): void {
  inLocalStorage(liste);
  setUserSetting(FAVORITEN_SCHLUESSEL, liste);
}

export function usePraesentationsFavoriten(): {
  favoriten: string[];
  istFavorit: (schluessel: string) => boolean;
  umschalten: (schluessel: string) => void;
} {
  const [favoriten, setFavoriten] = useState<string[]>(() => ladeFavoriten());

  // Kommt die Datenbankzeile nach dem Öffnen des Fensters an, gilt sie.
  useEffect(
    () =>
      onCacheChange((tabelle) => {
        if (tabelle === "user_settings") setFavoriten(ladeFavoriten());
      }),
    [],
  );

  const umschalten = useCallback((schluessel: string) => {
    setFavoriten((alt) => {
      const neu = toggleFavorit(alt, schluessel);
      speichereFavoriten(neu);
      return neu;
    });
  }, []);

  const istFavorit = useCallback((schluessel: string) => favoriten.includes(schluessel), [favoriten]);

  return { favoriten, istFavorit, umschalten };
}
