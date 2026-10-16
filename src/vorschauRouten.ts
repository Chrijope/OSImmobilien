import { lazy } from "react";

/*
 * Lokale Vorschau ohne Anmeldung, seit dem 11.10.2026: /vorschau/investmentrechner
 * und /vorschau/investmentrechner-plus.
 *
 * Nur im Entwicklungsmodus (`npm run dev`). Im Produktions-Build ersetzt Vite
 * `import.meta.env.DEV` durch `false`, der Zweig mit dem dynamischen Import
 * fällt weg, und die Seite ist gar nicht im Bundle. Damit kommt die Vorschau
 * nie auf Netlify (geprüft in vorschauRouten.test.ts).
 */
export const VorschauInvestmentrechner = import.meta.env.DEV
  ? lazy(() => import("./pages/VorschauInvestmentrechner"))
  : null;

/*
 * Seit dem 16.10.2026: Entwürfe Beratungspräsentation und Erstgesprächsskript
 * zur Freigabe, /vorschau/beratungspraesentation und /vorschau/erstgespraech.
 * Gleiche Absicherung wie oben.
 */
export const VorschauBeratungspraesentation = import.meta.env.DEV
  ? lazy(() => import("./pages/VorschauBeratungspraesentation"))
  : null;
export const VorschauErstgespraech = import.meta.env.DEV
  ? lazy(() => import("./pages/VorschauErstgespraech"))
  : null;

/** Vorschau „Provision je Partner“ (15.10.2026): /vorschau/provision. Gleiche Regeln wie oben. */
export const VorschauProvision = import.meta.env.DEV
  ? lazy(() => import("./pages/VorschauProvision"))
  : null;

/** /vorschau/naechste-aktionen: die Kachel im Kundenprofil, seit 15.10.2026. */
export const VorschauNaechsteAktionen = import.meta.env.DEV
  ? lazy(() => import("./pages/VorschauNaechsteAktionen"))
  : null;
/*
 * Lokale Vorschau "Pipeline am Investment", seit dem 15.10.2026:
 * /vorschau/pipeline. Gleiche Absicherung wie oben, nur `npm run dev`.
 */
export const VorschauPipeline = import.meta.env.DEV
  ? lazy(() => import("./pages/VorschauPipeline"))
  : null;

/** /vorschau/mikroseite: die Partner-Landingpage mit Beispielpartner, seit 16.10.2026. */
export const VorschauMikroseite = import.meta.env.DEV
  ? lazy(() => import("./pages/VorschauMikroseite"))
  : null;

/** Vorschau Rechnungsvorlage mit Live-PDF (16.10.2026): /vorschau/rechnungsvorlage. Gleiche Regeln wie oben. */
export const VorschauRechnungsvorlage = import.meta.env.DEV
  ? lazy(() => import("./pages/VorschauRechnungsvorlage"))
  : null;

/** /vorschau/kundenchat: Kundenportal und Partner nebeneinander, Beispieldaten (16.10.2026). Gleiche Regeln wie oben. */
export const VorschauKundenchat = import.meta.env.DEV
  ? lazy(() => import("./pages/VorschauKundenchat"))
  : null;
