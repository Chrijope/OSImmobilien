import { Scale, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AkademieAbwaegungsfall } from "@/lib/vertriebsakademieContent";
import { useVaProgress, vaProgress } from "@/lib/vertriebsakademieProgress";
import { useAbwaegungVerteilung } from "@/hooks/useAbwaegungVerteilung";

interface Props {
  slug: string;
  fall: AkademieAbwaegungsfall;
}

/**
 * Abwägungsfall für den Profi-Pfad.
 *
 * Es gibt keine richtige Antwort. Der Partner entscheidet sich, und erst danach
 * sieht er, wie sich das Team entschieden hat. Der Vergleich ist der ganze
 * Zweck: Ein erfahrener Verkäufer lernt nicht daraus, dass ihm jemand die
 * Lösung sagt, sondern daraus, dass er sieht, wo er von den Kollegen abweicht.
 *
 * Die Verteilung erscheint erst ab acht Antworten, sonst wäre sie nicht anonym.
 */
export function AkademieAbwaegungsfall({ slug, fall }: Props) {
  const state = useVaProgress();
  const gewaehlt = state.abwaegung[`${slug}::${fall.id}`];
  const mindest = fall.mindestAntworten ?? 8;
  const { verteilung, gesamt } = useAbwaegungVerteilung(slug, fall.id, !!gewaehlt, mindest);

  return (
    <Card className="p-5 space-y-4 border-amber-500/30 bg-amber-500/5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600 shrink-0">
          <Scale className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight">{fall.titel}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hier gibt es keine richtige Antwort. Entscheide dich, danach siehst du, wie das Team
            entschieden hat.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-background p-3 text-sm">{fall.fall}</div>

      <div className="grid gap-2">
        {fall.wege.map((weg) => {
          const dieser = gewaehlt === weg.id;
          const anzahl = verteilung?.find((v) => v.wegId === weg.id)?.anzahl ?? 0;
          const anteil = gesamt > 0 ? Math.round((anzahl / gesamt) * 100) : 0;
          return (
            <button
              key={weg.id}
              type="button"
              disabled={!!gewaehlt}
              onClick={() => vaProgress.setAbwaegung(slug, fall.id, weg.id)}
              className={cn(
                "relative overflow-hidden text-left rounded-lg border px-3 py-2.5 transition-colors",
                dieser ? "border-amber-500/60 bg-amber-500/10" : "bg-background",
                !gewaehlt && "hover:bg-muted/50",
              )}
            >
              {gewaehlt && verteilung && gesamt > 0 && (
                <span
                  className="absolute inset-y-0 left-0 bg-amber-500/10"
                  style={{ width: `${anteil}%` }}
                  aria-hidden
                />
              )}
              <span className="relative block">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{weg.label}</span>
                  {gewaehlt && verteilung && gesamt > 0 && (
                    <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                      {anteil} Prozent
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{weg.beschreibung}</span>
                {dieser && (
                  <span className="mt-1 block text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    deine Wahl
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {gewaehlt && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" />
          {verteilung && gesamt > 0
            ? `Anonyme Verteilung aus ${gesamt} Antworten im Team.`
            : `Die Verteilung erscheint, sobald ${mindest} Partner geantwortet haben. Vorher wäre sie nicht anonym.`}
        </div>
      )}
    </Card>
  );
}
