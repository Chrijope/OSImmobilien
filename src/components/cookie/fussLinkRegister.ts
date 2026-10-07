import { useSyncExternalStore } from "react";

/**
 * Wie viele Links "Cookie-Einstellungen" gerade auf der Seite stehen.
 *
 * Seiten mit eigenem Fuß tragen den Link dort. Seiten ohne Fuß bekommen
 * stattdessen den kleinen Knopf aus `CookieBanner`. Damit nicht beides
 * erscheint, meldet sich jeder Link hier an und beim Verlassen wieder ab.
 */
let anzahl = 0;
const hoerer = new Set<() => void>();

function melden() {
  hoerer.forEach((h) => h());
}

export function fussLinkAnmelden(): () => void {
  anzahl += 1;
  melden();
  return () => {
    anzahl = Math.max(0, anzahl - 1);
    melden();
  };
}

export function useFussLinkVorhanden(): boolean {
  return useSyncExternalStore(
    (h) => {
      hoerer.add(h);
      return () => {
        hoerer.delete(h);
      };
    },
    () => anzahl > 0,
    () => false,
  );
}
