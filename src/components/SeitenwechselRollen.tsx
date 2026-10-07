import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { aktuelleRollposition, rolleSeiteNachOben, rolleZu } from "@/lib/rollen";

/**
 * Rollposition bei einem Seitenwechsel, an einer Stelle fuer alle Routen.
 *
 * Christian am 23.09.2026: Wer in der Objektliste ein Objekt anklickt, landet
 * auf der Objektseite mitten zwischen Kennzahlen und Einheiten statt oben.
 * Der Grund: Im CRM rollt nicht das Fenster, sondern der Inhaltskasten
 * `<main>` in `AppShell` (siehe `lib/rollen.ts`). Dieser Kasten bleibt beim
 * Routenwechsel stehen, getauscht wird nur sein Inhalt. Also behielt die neue
 * Seite die Rollposition der alten. Der Browser hilft hier nicht: Er setzt bei
 * `pushState` nichts zurueck, und seine eigene Wiederherstellung kennt nur das
 * Fenster. `<ScrollRestoration>` von React Router gibt es nur mit einem
 * Data-Router, die App nutzt `BrowserRouter`.
 *
 * Die Regeln:
 *  - Neuer Pfad per Klick oder Weiterleitung (PUSH, REPLACE): nach oben.
 *  - Neuer Pfad per Zurueck oder Vor (POP): an die gemerkte Stelle dieses
 *    Verlaufseintrags. Das hat der geteilte Kasten bisher zufaellig getan,
 *    weil alle Seiten dieselbe Position hatten. Ohne Merken ginge das mit dem
 *    Zuruecksetzen verloren. Fehlt die Stelle (etwa nach einem Neuladen),
 *    bleibt alles wie bisher.
 *  - Gleicher Pfad, nur Suchparameter oder Anker neu: nichts tun. Das sind
 *    Reiter, Filter und Spruenge innerhalb der Seite, die sollen stehen
 *    bleiben oder rollen selbst.
 *
 * Warum `useLayoutEffect` und warum die Stelle VOR `<Routes>` in `App.tsx`:
 *  - Das Zuruecksetzen muss vor jedem eigenen Sprung der neuen Seite laufen,
 *    etwa dem Ankersprung im Kundenprofil oder `vaScrollTo` in der Akademie.
 *    Layout-Effekte laufen vor allen normalen Effekten, und unter Geschwistern
 *    in Baumreihenfolge. Stuende die Komponente hinter `<Routes>`, liefe das
 *    Zuruecksetzen nach den Layout-Effekten der Seite.
 *  - Das Aufraeumen des alten Effekts merkt sich die Stelle der Seite, die
 *    gerade verlassen wird. React raeumt Layout-Effekte beim Einbau der neuen
 *    Ansicht auf, und zwar in Baumreihenfolge. Vor `<Routes>` stehend ist die
 *    alte Seite in diesem Moment noch eingebaut, ihre Position also noch
 *    unverfaelscht. Dahinter waere sie schon ausgebaut und die Position auf
 *    die Hoehe der neuen Seite gestutzt.
 */

/**
 * Gemerkte Stellen je Verlaufseintrag, Schluessel ist `location.key`.
 * Absichtlich nur im Arbeitsspeicher: Nach einem Neuladen stellt der Browser
 * selbst wieder her, soweit er kann.
 */
const gemerkteStellen = new Map<string, number>();

export function SeitenwechselRollen() {
  const { key, pathname } = useLocation();
  const navigationsArt = useNavigationType();
  const vorigerPfad = useRef(pathname);

  useLayoutEffect(() => {
    const neueSeite = vorigerPfad.current !== pathname;
    vorigerPfad.current = pathname;

    if (neueSeite) {
      if (navigationsArt === "POP") {
        const stelle = gemerkteStellen.get(key);
        if (stelle !== undefined) rolleZu(stelle, "auto");
      } else {
        // Ohne Gleiten: Eine neue Seite beginnt oben, sie faehrt nicht dorthin.
        rolleSeiteNachOben("auto");
      }
    }

    return () => {
      gemerkteStellen.set(key, aktuelleRollposition());
    };
  }, [key, pathname, navigationsArt]);

  return null;
}

export default SeitenwechselRollen;
