import { Eye } from "lucide-react";

/**
 * Hinweisstreifen über einem Bereich, dessen Voraussetzung noch fehlt.
 *
 * Vorher stand hier, der Bereich sei "für den Bewerber noch gesperrt". Das
 * war falsch: Das Bewerberprofil ist ein internes Werkzeug, der Bewerber
 * sieht es nie. Gesperrt ist der Bereich für alle anderen Rollen, Admin und
 * Inhaber sehen ihn trotzdem, damit sie den Aufbau prüfen können. Die
 * Aktionen bleiben nutzbar, deshalb muss der Streifen deutlich machen, dass
 * die Voraussetzung noch offen ist.
 */
export function AdminVorschauHinweis({ grund }: { grund: string }) {
  return (
    <div className="rounded-md border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2">
      <Eye className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-900 dark:text-amber-200">
        <strong>Vorschau als Administrator.</strong>{" "}
        Für die übrigen Rollen ist dieser Bereich noch gesperrt, weil {grund}.
      </p>
    </div>
  );
}
