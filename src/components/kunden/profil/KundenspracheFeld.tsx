import { cn } from "@/lib/utils";
import { SPRACHEN, SPRACH_NAMEN, type Sprache } from "@/lib/kundenSprache";

interface Props {
  /** Die gespeicherte Sprache, oder `null`, solange noch nie gewählt wurde. */
  wert: Sprache | null;
  /**
   * Wird aufgerufen, wenn jemand eine Pille anklickt. Fehlt der Handler, ist
   * das Feld nur zum Lesen da: dann steht dort schlicht „Deutsch“ oder
   * „English“, ohne Pillen (Finanzierungspartner, Plan 2.2).
   */
  onWahl?: (sprache: Sprache) => void;
  disabled?: boolean;
  /** Beschriftung für Bildschirmleser, wo keine sichtbare Beschriftung daneben steht. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Das Feld „Sprache“: zwei kleine Pillen „Deutsch | English“.
 *
 * Plan Kundensprache 2.1: Die gewählte Pille ist gefüllt, die andere nur
 * umrandet. Ist noch nie gewählt worden (Bestand), sind beide leer und
 * daneben steht bernsteinfarben „Sprache noch nicht gewählt, gilt als
 * Deutsch“. Der Hinweis macht sichtbar, dass die Rückfrage vor dem ersten
 * Versand noch kommt.
 *
 * Das Feld speichert nicht selbst. Es meldet die Wahl über `onWahl`; ob sofort
 * gespeichert wird (Profil) oder erst mit „Speichern“ (Bearbeiten, Anlegen),
 * entscheidet der Aufrufer.
 */
export function KundenspracheFeld({ wert, onWahl, disabled = false, ariaLabel = "Sprache", className }: Props) {
  const hinweis = wert === null && (
    <span className="text-[11px] leading-tight text-[hsl(var(--warning))]">Sprache noch nicht gewählt, gilt als Deutsch</span>
  );

  if (!onWahl) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
        <span>{SPRACH_NAMEN[wert ?? "de"]}</span>
        {hinweis}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <span role="radiogroup" aria-label={ariaLabel} className="inline-flex gap-1">
        {SPRACHEN.map((s) => {
          const gewaehlt = wert === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={gewaehlt}
              disabled={disabled}
              onClick={() => { if (!gewaehlt) onWahl(s); }}
              className={cn(
                "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-60",
                gewaehlt
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent text-foreground hover:bg-muted",
              )}
            >
              {SPRACH_NAMEN[s]}
            </button>
          );
        })}
      </span>
      {hinweis}
    </span>
  );
}
