import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import de from "./locales/de.json";
import en from "./locales/en.json";

/**
 * i18n-Setup – derzeit ausschließlich für das Kundenportal und die Seiten
 * davor (Aktivieren, Anmelden, Passwort) aktiv. Admin-/Mitarbeiter-Views
 * verwenden keine t()-Aufrufe und bleiben deutsch.
 *
 * Woher die Sprache kommt (Plan Kundensprache, Etappe 1):
 *   1. `?lang=en` in der Adresse. So kommt die Profilsprache aus der
 *      Einladungsmail auf die Aktivierungsseite, und Login, Passwort und
 *      2FA danach passen schon, bevor der Kunde angemeldet ist.
 *   2. Die gemerkte Wahl in diesem Browser (`moreimmo-crm-lang`).
 *   3. Deutsch.
 *
 * Die Browsersprache zählt bewusst nicht mehr. Sonst sähe ein Kunde mit
 * englischem Browser das Portal englisch, obwohl sein Profil Deutsch sagt,
 * und bekäme dazu deutsche Mails. Nach dem Login setzt
 * `KundePortalLayout` ohnehin die Sprache aus dem Kundenprofil
 * (`src/i18n/portalSprache.ts`).
 */
export const SPRACH_SPEICHER_SCHLUESSEL = "moreimmo-crm-lang";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    fallbackLng: "de",
    supportedLngs: ["de", "en"],
    // "en-GB" aus einem Link oder alten Speicher gilt als "en".
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    returnNull: false,
    saveMissing: false,
    debug: false,
    detection: {
      order: ["querystring", "localStorage"],
      lookupQuerystring: "lang",
      lookupLocalStorage: SPRACH_SPEICHER_SCHLUESSEL,
      caches: ["localStorage"],
    },
  });

export default i18n;
