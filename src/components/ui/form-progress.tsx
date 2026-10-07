import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormProgressProps {
  steps: string[];
  current: number;
  onJump?: (index: number) => void;
  /** optional eyebrow label like "Selbstauskunft" or "Reservierungsvereinbarung" */
  eyebrow?: string;
}

/**
 * Fortschrittskette für mehrstufige Formulare.
 *
 * Eine Reihe aus Punkten, verbunden durch die Ladelinie: abgeschlossene
 * Schritte tragen einen Haken, der laufende seine Zahl mit Ring, die
 * kommenden ihre Zahl in Grau. Die Linie zwischen zwei Punkten füllt sich,
 * sobald der Punkt an ihrem Ende erreicht ist.
 *
 * Darüber stehen der Titel des laufenden Schritts, „Schritt X von Y" und der
 * Prozentwert. Der Prozentwert und die gefüllten Strecken sagen dasselbe: Er
 * ist `safe / (total - 1)`, also genau der Anteil der gefüllten Strecken.
 */
export function FormProgress({ steps, current, onJump, eyebrow }: FormProgressProps) {
  const total = steps.length;
  const safe = Math.max(0, Math.min(current, total - 1));
  const percent = total > 1 ? Math.round((safe / (total - 1)) * 100) : 0;

  return (
    <div className="px-5 sm:px-8 pt-6 sm:pt-7 pb-5 border-b border-border/60 bg-gradient-to-b from-background to-muted/20">
      {/*
        Auf dem Handy (Befund vom 24.09.2026) schob sich „Schritt 1 von 3“
        über die gesperrte Überschrift „RESERVIERUNGSVEREINBARUNG“, und der
        Schritttitel endete in Auslassungspunkten. Jetzt bricht die Zeile um:
        Reicht der Platz nicht, rutscht die Schrittangabe darunter, und der
        Titel läuft in eine zweite Zeile statt abgeschnitten zu werden.
      */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 mb-3" data-testid="form-progress-kopf">
        <div className="min-w-0 max-w-full">
          {eyebrow && (
            <div className="text-[10px] tracking-[0.16em] sm:tracking-[0.28em] uppercase text-muted-foreground font-medium mb-1.5 [overflow-wrap:anywhere]">
              {eyebrow}
            </div>
          )}
          <div className="text-[15px] sm:text-base font-semibold text-foreground tracking-tight break-words" data-testid="form-progress-titel">
            {steps[safe]}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] tracking-wide text-muted-foreground">
            Schritt <span className="text-foreground font-semibold tabular-nums">{safe + 1}</span> von <span className="tabular-nums">{total}</span>
          </div>
          <div className="text-[11px] text-primary font-semibold tabular-nums">{percent}%</div>
        </div>
      </div>

      {/*
        Die Ladelinie laeuft zwischen den Punkten, nicht darueber.

        Vorher lag sie als eigener Balken ueber der Punktreihe, und beides
        erzaehlte dasselbe zweimal: der Balken zeigte den Fortschritt, die
        Punkte auch. Christian hat am 14.09.2026 gemeldet, dass es so
        auseinanderfaellt. Jetzt traegt die Reihe selbst den Fortschritt, wie
        man es von einer Fortschrittskette erwartet.

        Jeder Schritt bringt sein halbes Verbindungsstueck nach links und nach
        rechts mit. Ein Stueck ist gefuellt, sobald der Punkt an seinem Ende
        erreicht ist: links also ab `i <= safe`, rechts ab `i < safe`. Beide
        Haelften desselben Zwischenraums schalten damit im selben Moment um,
        und in der Mitte entsteht keine Naht.
      */}
      <div className="mt-1 flex items-start justify-between gap-0 overflow-x-auto">
        {steps.map((label, i) => {
          const isDone = i < safe;
          const isCurrent = i === safe;
          /* Die Randstuecke ganz aussen haetten kein Gegenueber. */
          const linksSichtbar = i > 0;
          const rechtsSichtbar = i < total - 1;
          const strich = (sichtbar: boolean, gefuellt: boolean) => cn(
            "h-[3px] flex-1 rounded-full transition-colors duration-500",
            !sichtbar ? "bg-transparent" : gefuellt ? "bg-primary" : "bg-muted",
          );
          return (
            <button
              key={i}
              type="button"
              onClick={() => onJump?.(i)}
              className={cn(
                "group flex flex-col items-center gap-1.5 min-w-0 flex-1 rounded-lg py-1 transition",
                onJump && "hover:bg-muted/60 cursor-pointer",
              )}
            >
              {/* Strich, Punkt, Strich: auf einer Hoehe, deshalb items-center. */}
              <span className="flex w-full items-center">
                <span className={strich(linksSichtbar, i <= safe)} aria-hidden="true" />
                <span
                  className={cn(
                    "mx-1 h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all",
                    isDone && "bg-primary text-primary-foreground",
                    isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                    !isDone && !isCurrent && "bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="h-3 w-3" /> : <span className="tabular-nums">{i + 1}</span>}
                </span>
                <span className={strich(rechtsSichtbar, i < safe)} aria-hidden="true" />
              </span>
              <span
                className={cn(
                  "px-1 text-[10px] leading-tight text-center truncate w-full hidden sm:block",
                  isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}