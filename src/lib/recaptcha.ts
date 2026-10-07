/**
 * reCAPTCHA v3 für die öffentlichen Bewerbungsformulare.
 *
 * Der Site-Key ist öffentlich und steht bewusst im Quelltext; geheim ist allein
 * der Secret-Key, der in der Edge Function `submit-bewerbung` liegt. Beide
 * Formulare (Karriereseite und Vertriebspartner-Landingpage) senden an dieselbe
 * Function, deshalb müssen sie denselben Schlüssel und dieselbe Aktion nutzen.
 *
 * Wichtig: Das Skript kommt von www.google.com und lädt nur, wenn diese Domain
 * in der Content-Security-Policy in `index.html` unter `script-src` steht.
 * Fehlte sie, blockierte der Browser das Skript stillschweigend, und jede
 * Bewerbung scheiterte mit "reCAPTCHA noch nicht geladen".
 */
export const RECAPTCHA_SITE_KEY = "6Le_yQUtAAAAADHPW2NLm-ZhmPgNvHWBcP_TlYRE";

/** Aktion, die die Function gegenprüft. */
export const RECAPTCHA_ACTION = "submit_bewerbung";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (sitekey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

/** Lädt das reCAPTCHA-Skript einmalig in den Seitenkopf. */
export function ladeRecaptcha(): void {
  if (document.querySelector<HTMLScriptElement>('script[data-recaptcha="v3"]')) return;
  const s = document.createElement("script");
  s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
  s.async = true;
  s.defer = true;
  s.dataset.recaptcha = "v3";
  document.head.appendChild(s);
}

/** Wartet, bis das Skript bereit ist – höchstens `maxWartenMs`. */
function warteAufGrecaptcha(maxWartenMs: number): Promise<boolean> {
  if (window.grecaptcha?.execute) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      if (window.grecaptcha?.execute) {
        window.clearInterval(timer);
        resolve(true);
      } else if (Date.now() - start >= maxWartenMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Holt ein Token für den Absendevorgang.
 *
 * Vorher brach die Funktion sofort ab, wenn das Skript noch nicht da war. Wer
 * das Formular schnell ausfüllte oder eine langsame Verbindung hatte, bekam
 * deshalb einen Fehler, obwohl alles richtig eingetragen war. Jetzt wird das
 * Laden angestoßen und bis zu zehn Sekunden gewartet.
 */
export async function executeRecaptcha(): Promise<string> {
  ladeRecaptcha();
  const bereit = await warteAufGrecaptcha(10000);
  if (!bereit) {
    throw new Error(
      "Die Sicherheitsprüfung konnte nicht geladen werden. Bitte prüfe Deine Verbindung oder deaktiviere kurz einen Werbeblocker und versuche es erneut.",
    );
  }
  return new Promise((resolve, reject) => {
    window.grecaptcha!.ready(() => {
      window.grecaptcha!.execute(RECAPTCHA_SITE_KEY, { action: RECAPTCHA_ACTION })
        .then(resolve)
        .catch(reject);
    });
  });
}
