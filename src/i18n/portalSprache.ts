/**
 * Die Anzeigesprache des Kundenportals und der Seiten davor.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 1, Entscheidung 3:
 *   - Das Kundenprofil führt (`kontakte.meta.kundenSprache`). Bei jedem Login
 *     startet das Portal in dieser Sprache, egal was dieser Browser zuletzt
 *     angezeigt hat.
 *   - Der Umschalter oben im Portal ist eine reine Anzeigehilfe. Er ändert
 *     nur die Anzeige in diesem Browser, nie die Profilsprache. Mails und
 *     Dokumente folgen weiter dem Profil. Hilfreich, wenn Person 2 oder der
 *     Steuerberater am selben Konto mitliest.
 *
 * „Bei jedem Login“ heißt: bei jeder neuen Anmeldung, nicht bei jedem
 * Neuladen der Seite. Sonst würde ein Kunde, der auf Deutsch umgeschaltet
 * hat, nach jedem Neuladen wieder auf Englisch geworfen. Erkannt wird die
 * neue Anmeldung an `last_sign_in_at` des Supabase-Nutzers, das Supabase bei
 * jeder Anmeldung neu setzt.
 *
 * Zahlen und Daten im Portal laufen über `src/lib/sprachFormat.ts`, mit der
 * Sprache aus `portalSprache()`.
 */
import { useEffect } from "react";
import i18n from "@/i18n";
import { SPRACH_LOCALE } from "@/lib/sprachFormat";
// Direkt aus der reinen Regeldatei und nicht über `@/lib/kundenSprache`: Die
// Anmeldeseiten sollen nicht Zwischenspeicher und Kundenstore mitladen.
import {
  istSprache,
  normalisiereSprache,
  spracheAusMeta,
  type Sprache,
} from "../../supabase/functions/_shared/kunden-sprache.ts";

/** Merker im Browser: für welche Anmeldung die Profilsprache schon gesetzt ist. */
export const PROFILSPRACHE_ANMELDUNG_SCHLUESSEL = "moreimmo-portal-profilsprache-anmeldung";

/** Die Sprache, die das Portal gerade anzeigt. Unbekanntes gilt als Deutsch. */
export function portalSprache(): Sprache {
  return normalisiereSprache(i18n.resolvedLanguage || i18n.language) ?? "de";
}

/** Die Locale zur Anzeigesprache, für `Intl`-Aufrufe, die `sprachFormat` nicht abdeckt. */
export function portalLocale(): string {
  return SPRACH_LOCALE[portalSprache()];
}

/**
 * Stellt die Anzeige um. Nur die Anzeige: Die Profilsprache des Kunden
 * bleibt, wie sie ist. i18next merkt die Wahl in diesem Browser.
 */
export function setzeAnzeigeSprache(sprache: Sprache): void {
  if (!istSprache(sprache)) return;
  if (portalSprache() !== sprache) void i18n.changeLanguage(sprache);
}

/**
 * Setzt nach einer neuen Anmeldung die Sprache aus dem Kundenprofil.
 *
 * @param anmeldung  Kennung der Anmeldung, etwa `${user.id}|${user.last_sign_in_at}`.
 *                   Für dieselbe Anmeldung wird nur einmal umgestellt, damit
 *                   der Umschalter bis zur nächsten Anmeldung gilt.
 * @returns die Profilsprache
 */
export function uebernimmProfilsprache(meta: unknown, anmeldung: string): Sprache {
  const profil = spracheAusMeta(meta);
  let bekannt: string | null = null;
  try {
    bekannt = window.localStorage.getItem(PROFILSPRACHE_ANMELDUNG_SCHLUESSEL);
  } catch {
    /* Speicher gesperrt: dann bei jedem Laden die Profilsprache */
  }
  if (bekannt !== anmeldung) {
    setzeAnzeigeSprache(profil);
    try {
      window.localStorage.setItem(PROFILSPRACHE_ANMELDUNG_SCHLUESSEL, anmeldung);
    } catch {
      /* siehe oben */
    }
  }
  return profil;
}

/**
 * Hält `<html lang>` auf der Anzeigesprache, solange die Seite steht.
 *
 * `index.html` sagt fest `de`. Für das Portal und die Seiten davor zählt die
 * Anzeigesprache, damit Bildschirmleser und die Übersetzungshilfe des
 * Browsers wissen, was sie vor sich haben. Beim Verlassen (ins CRM) gilt
 * wieder `de`, denn das CRM ist nur deutsch.
 */
export function useHtmlLang(): void {
  useEffect(() => {
    const setzen = () => {
      document.documentElement.lang = portalSprache();
    };
    setzen();
    i18n.on("languageChanged", setzen);
    return () => {
      i18n.off("languageChanged", setzen);
      document.documentElement.lang = "de";
    };
  }, []);
}
