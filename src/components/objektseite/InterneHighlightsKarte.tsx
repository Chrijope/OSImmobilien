import { useMemo } from "react";
import { Loader2, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KartenTitel } from "@/components/objektseite/Bausteine";
import { useUser } from "@/contexts/UserContext";
import { interneHighlights, type HighlightZeile } from "@/lib/interneHighlights";
import { istInterneRolle } from "@/lib/sidebarPermissions";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { cn } from "@/lib/utils";

/**
 * Das Kästchen „Interne Highlights“ auf Objektseite und Einheitenseite.
 *
 * Nur für interne Rollen (`istInterneRolle` nach der aktiven Rolle), dazu
 * gilt der Zugang der Seite selbst. Nie im Exposé, in der Kundenansicht oder
 * im Portal: Diese Datei hängen nur `ObjektSeite` und `EinheitSeite` ein, und
 * ein Test wacht darüber. Erzeugt werden die KI-Punkte im selben Lauf wie die
 * Objekttexte; den startet `ObjektTexteKarte` von selbst, wo er fehlt.
 */

const KARTE = "rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";

function Zeile({ zeile, testId, hervorgehoben }: { zeile: HighlightZeile; testId?: string; hervorgehoben?: boolean }) {
  return (
    <li
      className={cn("text-sm leading-snug", hervorgehoben ? "font-semibold text-foreground" : "text-foreground/90")}
      data-testid={testId}
      title={zeile.beleg ? `Beleg: ${zeile.beleg}` : "Aus den Objektdaten"}
    >
      {zeile.text}
    </li>
  );
}

export function InterneHighlightsKarte({ objekt, wohnung, className }: { objekt: ObjektData; wohnung?: ObjektWohnung; className?: string }) {
  const { user } = useUser();
  const h = useMemo(() => interneHighlights(objekt, wohnung), [objekt, wohnung]);
  if (!istInterneRolle(user.role)) return null;

  const oben = [h.erhaltungsaufwand, h.restnutzungsdauer].filter((z): z is HighlightZeile => !!z);
  const leer = oben.length === 0 && h.punkte.length === 0;

  return (
    <section className={cn(KARTE, className)} data-testid="karte-interne-highlights">
      <KartenTitel rechts={
        <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <Lock className="h-3 w-3" /> Nur intern
        </Badge>
      }>Interne Highlights</KartenTitel>

      <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200" data-testid="highlights-hinweis">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Diese Highlights sind rein intern und nur für deine Vorbereitung gedacht. Gib sie nicht an Kunden weiter.</span>
      </p>

      {oben.length > 0 && (
        <ul className="mb-3 space-y-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2" data-testid="highlights-oben">
          {h.erhaltungsaufwand && <Zeile zeile={h.erhaltungsaufwand} testId="highlight-erhaltungsaufwand" hervorgehoben />}
          {h.restnutzungsdauer && <Zeile zeile={h.restnutzungsdauer} testId="highlight-restnutzungsdauer" hervorgehoben />}
        </ul>
      )}

      {h.punkte.length > 0 && (
        <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground" data-testid="highlights-liste">
          {h.punkte.map((p, i) => <Zeile key={`${i}-${p.text}`} zeile={p} />)}
        </ul>
      )}

      {h.stand === "wird-erstellt" && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" data-testid="highlights-wird-erstellt">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Weitere Highlights aus den Unterlagen werden erstellt.
        </p>
      )}
      {leer && h.stand !== "wird-erstellt" && (
        <p className="text-xs text-muted-foreground" data-testid="highlights-leer">
          Noch keine belegten Highlights. Sie entstehen aus Objektdaten und Unterlagen, sobald dazu etwas vorliegt.
        </p>
      )}
    </section>
  );
}
