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
