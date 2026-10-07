import { useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BAUSTEIN_NAME, KEIN_SCORE_TEXT, SCORE_HINWEIS, scoreStufe, zieleText, type ObjektScore,
} from "@/lib/objektScore";

/**
 * Die Anzeige des Objektscores: Ring, Warnchips, „Warum N?“ und die
 * Hinweiszeile. Nach dem Entwurf vom 04.10.2026.
 *
 * NUR INTERN. Diese Datei hängen ausschließlich die Objektauswahl im
 * Kundenprofil, die Objektseite und die Einheitenseite ein; ein Test wacht
 * darüber, dass Exposé, Kundenansicht, Portal und PDF sie nicht importieren.
 */

const FARBE: Record<ReturnType<typeof scoreStufe>, string> = {
  gut: "hsl(var(--success))",
  mittel: "hsl(var(--primary))",
  schwach: "hsl(var(--warning))",
  leer: "transparent",
};

/** Der Ring mit der Zahl. Gestrichelt beim Teilwert, grau mit „n. b.“ ohne Score. */
type RingStand = Partial<Pick<ObjektScore, "wert" | "keinScore" | "teilwert" | "fehltText">>;

export function ScoreRing({ score, klein = false, className }: { score: RingStand | null | undefined; klein?: boolean; className?: string }) {
  const wert = score?.wert ?? null;
  const stufe = scoreStufe(wert);
  const titel = wert === null
    ? (score?.keinScore ? KEIN_SCORE_TEXT[score.keinScore] : "Kein Score")
    : score?.teilwert ? `Teilwert ${wert} von 100: ${score.fehltText}` : `Objektscore ${wert} von 100`;
  return (
    <div
      role="img"
      aria-label={titel}
      title={titel}
      data-testid="score-ring"
      data-wert={wert ?? "nb"}
      data-teilwert={score?.teilwert ? "ja" : "nein"}
      className={cn("relative grid shrink-0 place-items-center rounded-full", klein ? "h-8 w-8" : "h-[42px] w-[42px]", className)}
      style={{
        background: wert === null
          ? "hsl(var(--muted))"
          : `conic-gradient(${FARBE[stufe]} ${wert}%, hsl(var(--border)) 0)`,
      }}
    >
      <span className={cn("absolute rounded-full bg-background", klein ? "inset-[3px]" : "inset-1")} />
      {score?.teilwert && <span className="pointer-events-none absolute -inset-[3px] rounded-full border-[1.5px] border-dashed border-muted-foreground/60" />}
      <b className={cn("relative tabular-nums", wert === null ? "text-[9px] font-semibold text-muted-foreground" : klein ? "text-[11px]" : "text-[13px]")}>
        {wert === null ? "n. b." : wert}
      </b>
    </div>
  );
}

/** Die kleine Zahl im Chip „3 Kunden · 86“ der Objektseite. */
export function ScoreMini({ wert }: { wert: number | null }) {
  const stufe = scoreStufe(wert);
  return (
    <span
      className="inline-grid h-[18px] min-w-[26px] place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white"
      style={{ background: FARBE[stufe] }}
    >
      {wert ?? "n. b."}
    </span>
  );
}

/** Teilwert und Warnung als Chips, für die Zeile unter dem Titel. */
export function ScoreChips({ score }: { score: ObjektScore | null | undefined }) {
  if (!score || score.wert === null) return null;
  return (
    <>
      {score.warnung && (
        <span className="inline-flex items-center rounded-full bg-[hsl(var(--warning))]/15 px-2 py-px text-[10px] font-semibold text-[hsl(var(--warning))]" data-testid="score-warnung">
          {score.warnung}
        </span>
      )}
      {score.teilwert && (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-px text-[10px] font-semibold text-muted-foreground" data-testid="score-teilwert">
          Teilwert
        </span>
      )}
    </>
  );
}

/** Die Hinweiszeile, überall wortgleich. */
export function ScoreHinweis({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground", className)} data-testid="score-hinweis">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {SCORE_HINWEIS}
    </p>
  );
}

/**
 * „Warum N?“ zum Aufklappen: die Gründe mit Zahl, darunter die Balken aller
 * Bausteine und ein Fuß mit Herkunft und Gewichten.
 */
export function ScoreWarum({ score, ziele, saStand, anfangsOffen = false, className }: {
  score: ObjektScore;
  ziele: string[];
  saStand?: string;
  anfangsOffen?: boolean;
  className?: string;
}) {
  const [offen, setOffen] = useState(anfangsOffen);
  if (score.wert === null) return null;
  const ziel = zieleText(ziele);
  return (
    <div className={className} data-testid="score-warum">
      <button
        type="button"
        aria-expanded={offen}
        onClick={() => setOffen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", offen && "rotate-90")} /> Warum {score.wert}?
      </button>
      {offen && (
        <div className="mt-1.5 rounded-[10px] border border-border bg-background/75 px-3 py-2.5" data-testid="score-warum-kasten">
          <ol className="mb-2 list-decimal space-y-0.5 pl-[18px] text-xs">
            {score.gruende.map((g) => (
              <li key={g.text}>
                <span className={cn("font-semibold", g.art === "plus" ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]")}>
                  {g.art === "plus" ? "+" : "−"}
                </span>{" "}
                {g.text}
              </li>
            ))}
          </ol>
          <div className="mt-1.5 grid gap-x-4 gap-y-1 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
            {score.bausteine.map((b) => (
              <div
                key={b.id}
                data-testid={`baustein-${b.id}`}
                className={cn("grid grid-cols-[1fr_70px_26px] items-center gap-1.5 text-[11px] text-muted-foreground", b.wert === null && "opacity-50")}
                title={b.wert === null ? b.fehlt : `Gewicht ${Math.round(b.gewicht)}`}
              >
                <span className="truncate">{BAUSTEIN_NAME[b.id]}{b.zusatz ? ` (${b.zusatz})` : ""}</span>
                <span
                  className="h-[5px] overflow-hidden rounded-[3px]"
                  style={{ background: b.wert === null ? "repeating-linear-gradient(90deg, hsl(var(--border)) 0 4px, transparent 4px 7px)" : "hsl(var(--border))" }}
                >
                  {b.wert !== null && <i className="block h-full rounded-[3px] bg-primary" style={{ width: `${b.wert}%` }} />}
                </span>
                <span className="text-right tabular-nums">{b.wert ?? "fehlt"}</span>
              </div>
            ))}
          </div>
          {score.fehltText && <p className="mt-2 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">{score.fehltText}</p>}
          <p className="mt-2 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
            Gerechnet mit dem Investmentrechner (Standardannahmen) und der Selbstauskunft{saStand ? ` vom ${saStand}` : ""}.
            {" "}{ziel ? `Gewichte nach Zielen: ${ziel}.` : "Ohne gewählte Ziele, alle Ziele gleich gewichtet."}
          </p>
        </div>
      )}
    </div>
  );
}
