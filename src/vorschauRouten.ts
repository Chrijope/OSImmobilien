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

