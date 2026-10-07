import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScoreMini } from "@/components/objektscore/ScoreAnzeige";
import type { KundenTreffer } from "@/lib/objektScoreDaten";

/**
 * Der Chip „3 Kunden · 86“ in der Spalte „Kunde / VP“ einer freien Einheit
 * (Objektseite, seit dem 04.10.2026). Ein Klick öffnet die kleine Liste der
 * passenden Kunden mit Score und zuständigem Partner, darunter der Weg zur
 * Einheitenseite, wo die Karte „Passende Kunden“ alles zeigt.
 *
 * Nur intern und nur für die Rollen aus `siehtPassendeKunden`; die
 * Objektseite reicht die Treffer nur dann herein.
 */
export function PassendeKundenChip({ treffer, weNr, onEinheitOeffnen }: {
  treffer: KundenTreffer[];
  weNr: string;
  onEinheitOeffnen: () => void;
}) {
  if (treffer.length === 0) return <span className="text-[11px] text-muted-foreground">kein passender Kunde</span>;
  const bester = treffer[0].score.wert;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="passende-kunden-chip"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-primary"
        >
          {treffer.length === 1 ? "1 Kunde" : `${treffer.length} Kunden`} <ScoreMini wert={bester} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] max-w-[calc(100vw-32px)] p-3 text-xs" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Passende Kunden für {weNr}</p>
        <ul data-testid="passende-kunden-liste">
          {treffer.map((t) => (
            <li key={t.kontaktId} className="flex items-center gap-2 border-b border-border/50 py-1.5 last:border-b-0">
              <ScoreMini wert={t.score.wert} />
              <span className="flex-1 truncate font-semibold">{t.name}</span>
              <span className="text-[11px] text-muted-foreground">{t.partnerName || "ohne Partner"}</span>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 text-right">
          <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={onEinheitOeffnen}>
            Alle auf der Einheitenseite →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
