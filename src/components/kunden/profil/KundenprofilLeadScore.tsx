import { useEffect, useState } from "react";
import { computeLeadScore, type LeadScoreKlasse, type LeadScoreResult } from "@/lib/leadScore";
import { KundenprofilHoverKarte } from "./KundenprofilHoverKarte";

/** Die Stufen aus `lib/leadScore.ts` als Wort. */
export const LEAD_SCORE_STUFENWORT: Record<LeadScoreKlasse, string> = {
  A: "heiß",
  B: "warm",
  C: "kühl",
  D: "kalt",
};

const ROT = "hsl(var(--destructive))";
// Das Warnungs-Token ist im aktuellen Stil ein Braun, deshalb Marken-Orange.
const ORANGE = "hsl(var(--brand-orange))";
const GELB = "hsl(var(--fortschritt-aktiv))";
const GRUEN = "hsl(var(--success))";

/**
 * Fließender Ampelverlauf aus den Farb-Tokens: Rot bis 40, über Orange und
 * Gelb, ab 80 voll Grün. Die Stufengrenzen sind die des Modells (A ≥ 80,
 * B ≥ 60, C ≥ 40). `color-mix` hält Hell- und Dunkelmodus beim Token.
 */
export function leadScoreFarbe(wert: number): string {
  const v = Math.max(0, Math.min(100, wert));
  const mische = (a: string, b: string, anteilB: number) =>
    `color-mix(in oklab, ${a}, ${b} ${Math.round(anteilB * 100)}%)`;
  if (v <= 20) return ROT;
  if (v < 40) return mische(ROT, ORANGE, (v - 20) / 20);
  if (v < 60) return mische(ORANGE, GELB, (v - 40) / 20);
  if (v < 80) return mische(GELB, GRUEN, (v - 60) / 20);
  return GRUEN;
}

/**
 * Was den Score heben würde. Das Modell liefert keine Tipps, also nennt der
 * Hinweis das Kriterium mit den meisten fehlenden Punkten.
 */
export function leadScoreTipp(ergebnis: LeadScoreResult): string | null {
  const luecken = ergebnis.breakdown
    .map((b) => ({ ...b, fehlt: b.max - b.score }))
    .filter((b) => b.fehlt > 0)
    .sort((a, b) => b.fehlt - a.fehlt);
  const groesste = luecken[0];
  if (!groesste) return null;
  return `Am meisten Luft hat ${groesste.label}: ${groesste.score} von ${groesste.max} Punkten.`;
}

const DURCHMESSER = 60;
const STRICH = 6;
// Ein Pixel Rand, damit die Kantenglättung nicht am SVG-Rand abgeschnitten wird.
const RADIUS = (DURCHMESSER - STRICH) / 2 - 1;
const UMFANG = 2 * Math.PI * RADIUS;

/**
 * Der Lead-Score als Ring unter der Inaktivitäts-Ampel.
 *
 * Rechnung und Stufen kommen unverändert aus `computeLeadScore`, wie beim
 * bisherigen `LeadScoreBadge`. Zahl und Stufe stehen immer als Text da, die
 * Farbe ist nie die einzige Auskunft. Ohne Selbstauskunft zeigt der Ring
 * „offen“.
 */
export function KundenprofilLeadScore({ saData }: { saData: unknown }) {
  const ergebnis = computeLeadScore(saData);
  const [gefuellt, setGefuellt] = useState(false);
  useEffect(() => {
    // Ein Bild später füllen, damit der Übergang in CSS einmal läuft.
    const id = window.requestAnimationFrame(() => setGefuellt(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  if (!ergebnis.hasSA) {
    return (
      <div className="kundenprofil-leadscore" role="img" aria-label="Lead-Score offen, er entsteht mit der Selbstauskunft.">
        <svg width={DURCHMESSER} height={DURCHMESSER} viewBox={`0 0 ${DURCHMESSER} ${DURCHMESSER}`} aria-hidden="true">
          <circle cx={DURCHMESSER / 2} cy={DURCHMESSER / 2} r={RADIUS} fill="none" stroke="hsl(var(--muted))" strokeWidth={STRICH} strokeDasharray="4 4" />
        </svg>
        <div className="kundenprofil-leadscore-text" aria-hidden="true">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Lead-Score</span>
          <span className="text-sm font-semibold">offen</span>
          <span className="text-[11px] text-muted-foreground">nach der Selbstauskunft</span>
        </div>
      </div>
    );
  }

  const wort = LEAD_SCORE_STUFENWORT[ergebnis.klasse];
  const farbe = leadScoreFarbe(ergebnis.total);
  const versatz = UMFANG * (1 - (gefuellt ? ergebnis.total / 100 : 0));
  const tipp = leadScoreTipp(ergebnis);
  const satz = `Lead-Score ${ergebnis.total} von 100, Stufe ${ergebnis.klasse}, ${wort}. Details anzeigen.`;

  return (
    <KundenprofilHoverKarte
      ausloeser={
        <button type="button" className="kundenprofil-leadscore" aria-label={satz} data-stufe={ergebnis.klasse}>
          <span className="relative inline-flex" aria-hidden="true">
            <svg width={DURCHMESSER} height={DURCHMESSER} viewBox={`0 0 ${DURCHMESSER} ${DURCHMESSER}`} className="-rotate-90">
              <circle cx={DURCHMESSER / 2} cy={DURCHMESSER / 2} r={RADIUS} fill="none" stroke="hsl(var(--muted))" strokeWidth={STRICH} />
              <circle
                className="kundenprofil-leadscore-bogen"
                cx={DURCHMESSER / 2}
                cy={DURCHMESSER / 2}
                r={RADIUS}
                fill="none"
                stroke={farbe}
                strokeWidth={STRICH}
                strokeLinecap="round"
                strokeDasharray={UMFANG}
                strokeDashoffset={versatz}
                style={{ color: farbe }}
              />
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-base font-bold tabular-nums">{ergebnis.total}</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">{wort}</span>
            </span>
          </span>
          <span className="kundenprofil-leadscore-text" aria-hidden="true">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Lead-Score</span>
            <span className="text-sm font-semibold">{ergebnis.klasse}, {wort}</span>
            <span className="text-[11px] text-muted-foreground">Details beim Darüberfahren</span>
          </span>
        </button>
      }
    >
      <p className="font-semibold">Lead-Score {ergebnis.total} von 100</p>
      <p className="text-xs text-muted-foreground mb-3">{ergebnis.klasseLabel}. A ab 80, B ab 60, C ab 40.</p>
      <ul className="space-y-1.5">
        {ergebnis.breakdown.map((b) => (
          <li key={b.key} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{b.label}</span>
              <span className="font-semibold tabular-nums">{b.score} von {b.max}</span>
            </div>
            {b.detail && <div className="text-[11px] text-muted-foreground">{b.detail}</div>}
          </li>
        ))}
      </ul>
      {tipp && <p className="mt-3 rounded-os-sm bg-muted/60 px-2.5 py-2 text-xs"><strong>Tipp:</strong> {tipp}</p>}
    </KundenprofilHoverKarte>
  );
}
