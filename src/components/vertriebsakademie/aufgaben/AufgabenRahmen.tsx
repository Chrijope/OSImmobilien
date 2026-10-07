import { ReactNode, useEffect, useRef, useState } from "react";
import { CheckCircle2, RotateCcw, Sparkles, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatSekunden } from "./AufgabenHelfer";

interface Props {
  titel: string;
  hinweis?: string;
  /** Kurzform des Aufgabentyps, erscheint als kleine Marke. */
  typLabel: string;
  geloest?: boolean;
  versuche?: number;
  /**
   * Punkte, die für diese Aufgabe tatsächlich vergeben wurden. Sie ploppen
   * einmal auf, wenn die Aufgabe in dieser Sitzung gelöst wird.
   */
  punkte?: number;
  restSekunden?: number | null;
  children: ReactNode;
  /** Fußzeile: Prüfen-Knopf, Rückmeldung, Wiederholen. */
  aktion?: ReactNode;
  onNeuStarten?: () => void;
}

/** Wie lange die Punkte-Marke stehen bleibt. Passt zur Dauer von `va-plopp`. */
const PLOPP_DAUER_MS = 1600;

/**
 * Einheitlicher Rahmen für alle prüfbaren Aufgaben.
 *
 * Er bewegt sich: Die Rückmeldung fährt ein, das grüne Häkchen wächst beim
 * Lösen, und die Punkte, die der Fortschrittsspeicher ohnehin rechnet, ploppen
 * einmal sichtbar auf. Die Akademie ist am Ende sehr viel Text, und die
 * Aufgaben sollen der Teil sein, der Spaß macht. Der Grund für die Bewegung
 * ist also Übersicht und Freude, nicht Belohnungslärm: Kein Konfetti je
 * Aufgabe, keine Rangliste, keine Uhr, die nicht im Inhalt steht. Das
 * Konfetti gibt es einmal je Kapitel, siehe `KapitelFeier`.
 *
 * Wer reduzierte Bewegung eingestellt hat, sieht alles ohne Animation, die
 * Klassen `va-*` sind in `index.css` dafür abgeschaltet.
 */
export function AufgabenRahmen({
  titel, hinweis, typLabel, geloest, versuche, punkte, restSekunden, children, aktion, onNeuStarten,
}: Props) {
  // Die Punkte ploppen nur beim Übergang ungelöst → gelöst in dieser Sitzung,
  // nicht beim Öffnen einer Aufgabe, die längst gelöst ist.
  const vorherGeloest = useRef(!!geloest);
  const [ploppPunkte, setPloppPunkte] = useState<number | null>(null);
  const [frischGeloest, setFrischGeloest] = useState(false);

  useEffect(() => {
    const war = vorherGeloest.current;
    vorherGeloest.current = !!geloest;
    if (war || !geloest) return;
    setFrischGeloest(true);
    if (punkte && punkte > 0) setPloppPunkte(punkte);
    const t = setTimeout(() => setPloppPunkte(null), PLOPP_DAUER_MS);
    return () => clearTimeout(t);
  }, [geloest, punkte]);

  return (
    <div
      className={cn(
        "relative rounded-xl border p-4 md:p-5 space-y-4 transition-colors duration-300",
        geloest ? "border-emerald-500/40 bg-emerald-500/5" : "bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground border rounded px-1.5 py-0.5">
              {typLabel}
            </span>
            {geloest && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className={cn("h-3.5 w-3.5", frischGeloest && "va-haken")} /> gelöst
              </span>
            )}
            {!geloest && !!versuche && versuche > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {versuche === 1 ? "1 Versuch" : `${versuche} Versuche`}
              </span>
            )}
            {geloest && !!punkte && punkte > 0 && !ploppPunkte && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {punkte} Punkte
              </span>
            )}
          </div>
          <h4 className="mt-1.5 text-sm font-semibold leading-snug">{titel}</h4>
          {hinweis && <p className="mt-1 text-xs text-muted-foreground">{hinweis}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {typeof restSekunden === "number" && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs tabular-nums rounded px-2 py-1",
                restSekunden <= 10 ? "bg-rose-500/10 text-rose-600" : "bg-muted text-muted-foreground",
              )}
            >
              <Timer className="h-3.5 w-3.5" /> {formatSekunden(Math.max(0, restSekunden))}
            </span>
          )}
          {onNeuStarten && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onNeuStarten}>
              <RotateCcw className="h-3.5 w-3.5" /> Neu
            </Button>
          )}
        </div>
      </div>

      {children}

      {aktion && <div className="pt-1">{aktion}</div>}

      {ploppPunkte !== null && (
        <div
          aria-live="polite"
          className="va-plopp pointer-events-none absolute right-3 top-3 md:right-4 md:top-4 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-md"
        >
          <Sparkles className="h-3.5 w-3.5" /> +{ploppPunkte} Punkte
        </div>
      )}
    </div>
  );
}

/** Rückmeldung nach einem Versuch. Fährt weich ein, siehe `va-aufdecken`. */
export function AufgabenRueckmeldung({
  korrekt, text, kinder,
}: { korrekt: boolean; text: string; kinder?: ReactNode }) {
  return (
    <div
      className={cn(
        "va-aufdecken rounded-lg border p-3 text-xs space-y-1",
        korrekt
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
      )}
    >
      <div className="font-semibold">{korrekt ? "Richtig." : "Noch nicht."}</div>
      <div className="text-foreground/90">{text}</div>
      {kinder}
    </div>
  );
}
