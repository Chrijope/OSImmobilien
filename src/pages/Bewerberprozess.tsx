import { BewerberArbeitsplatz } from "./BewerberArbeitsplatz";
import { ABLAUF_NEU } from "@/lib/bewerberArbeitsplatz";

/**
 * Der neue Bewerberprozess.
 *
 * **Dieselbe Seite wie das Bewerbungsmanagement, nur mit dem neuen Ablauf.**
 * Gleicher Seitenkopf, gleiche Stufenübersicht, gleiche Tabelle mit denselben
 * Spalten, Filtern und Sortierungen, gleicher Knopf zum Erfassen rechts oben,
 * gleiches Bewerberprofil mit denselben sieben Reitern. Was sich unterscheidet,
 * steht vollständig in `src/lib/bewerberArbeitsplatz.ts` und ist wenig:
 *
 * - Der zweite Reiter der Akte heißt „Videocall" statt „Erstgespräch", und
 *   ebenso die Stufe und die Terminspalte. Es gibt im neuen Ablauf nur noch
 *   einen regulären Termin. In der Datenbank bleibt der Wert `Erstgespraech`,
 *   es ist reine Beschriftung.
 * - Im Reiter Übersicht steht oben die Karte zum Kennenlernen: Einladung
 *   verschicken, Stand des Bogens, der passende nächste Schritt, der selbst
 *   gebuchte Termin und die Erinnerungskette.
 * - Die Liste zeigt seit dem 10.09.2026 alle Bewerber. Welchen Ablauf ein
 *   einzelner Bewerber in seiner Akte hat, sagt sein Kennzeichen `prozess`.
 *   Umstellen lässt es sich seit dem 26.09.2026 nicht mehr, der Knopf dafür
 *   ist entfallen.
 *
 * **Warum kein eigener Aufbau.** Die erste Fassung dieser Seite hatte eine
 * eigene Oberfläche, eine schmale Suchliste und eine Spalte „acht Momente".
 * Damit ließ sich nichts vergleichen und nichts erproben; es fühlte sich
 * halbfertig an. Der Ablauf soll sich unterscheiden, nicht die Oberfläche.
 *
 * Sichtbar ist die Seite ausschließlich für die Namen in
 * `bewerberprozessFreigabe.ts`. Durchgesetzt wird das im Routen-Schutz über
 * `sidebarPermissions.ts`, nicht hier.
 */
export default function Bewerberprozess() {
  return <BewerberArbeitsplatz ablauf={ABLAUF_NEU} />;
}
