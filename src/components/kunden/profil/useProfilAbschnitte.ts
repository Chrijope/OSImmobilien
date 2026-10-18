import { useMemo, useState } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useLiveVersion } from "@/hooks/useLiveData";
import { getUserSetting, patchUserSetting } from "@/lib/userSettingsCache";

const TABELLEN = ["user_settings"];
/** Welche Abschnitte der linken Spalte offen stehen, je Nutzer und nicht je Kunde. */
export const PROFIL_ABSCHNITTE_SCHLUESSEL = "kundenprofilLinksOffen";

/** Nur echte Wahrheitswerte zählen, alles andere heißt: eingeklappt. */
export function leseOffeneAbschnitte(wert: unknown): Record<string, boolean> {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) return {};
  return Object.fromEntries(Object.entries(wert as Record<string, unknown>).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>;
}

/**
 * Auf- und Zuklappen der Abschnitte links im Kundenprofil.
 *
 * Ohne gespeicherten Wert ist alles zu, am Schreibtisch wie auf dem Handy.
 * Gespeichert wird nur der eine geänderte Schlüssel (`patchUserSetting`
 * mischt tief), damit ein zweites Gerät nichts überschreibt. Scheitert das
 * Speichern, bleibt der Abschnitt in dieser Sitzung trotzdem offen; es ist
 * eine Ansichtseinstellung, keine Kundendaten, deshalb kein roter Hinweis.
 */
export function useProfilAbschnitte() {
  const bereit = useCacheReady(TABELLEN);
  const version = useLiveVersion(TABELLEN);
  const [lokal, setLokal] = useState<Record<string, boolean>>({});
  const gespeichert = useMemo(
    () => (bereit ? leseOffeneAbschnitte(getUserSetting<unknown>(PROFIL_ABSCHNITTE_SCHLUESSEL, {})) : {}),
    // `version` zählt mit, damit ein zweites Gerät hier ankommt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bereit, version],
  );
  const offen = { ...gespeichert, ...lokal };
  const istOffen = (schluessel: string) => offen[schluessel] === true;
  const umschalten = (schluessel: string) => {
    const neu = !istOffen(schluessel);
    setLokal((alt) => ({ ...alt, [schluessel]: neu }));
    void patchUserSetting(PROFIL_ABSCHNITTE_SCHLUESSEL, { [schluessel]: neu }).then((ok) => {
      if (!ok) console.warn("Kundenprofil: Abschnitt nicht gemerkt", schluessel);
    });
  };
  return { istOffen, umschalten };
}
