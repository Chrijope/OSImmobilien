// Kennzeichnung, warum genau dieser Provisionssatz gerechnet wurde.
//
// Bisher stand in der Abrechnung nur ein Prozentsatz. Ob er aus dem Eigen-Satz,
// dem Lead-Satz oder der Karrierestufe stammt, war nicht zu sehen, und in der
// Zielplanung wurde ohnehin mit einem einzigen flachen Satz gerechnet. Wer
// einem Partner eine Provision erklären soll, braucht diesen Unterschied.

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, UserPlus, Inbox, Layers, ShieldCheck } from "lucide-react";
import { type Satzart, SATZART_LABEL, SATZART_ERKLAERUNG } from "@/lib/karriereStufeHelper";

const STIL: Record<Satzart, { klasse: string; Icon: React.ComponentType<{ className?: string }> }> = {
  eigen: {
    klasse: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    Icon: UserPlus,
  },
  zugewiesen: {
    klasse: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    Icon: Inbox,
  },
  locked: {
    klasse: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    Icon: Lock,
  },
  stufe: {
    klasse: "border-border bg-muted text-muted-foreground",
    Icon: Layers,
  },
  nutzerverwaltung: {
    klasse: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    Icon: ShieldCheck,
  },
};

export function SatzartBadge({
  art,
  satz,
  /** Der Satz, der heute gelten würde. Nur bei festgeschriebenen Sätzen und nur, wenn er abweicht. */
  heutigerSatz,
  klein = false,
}: {
  art: Satzart;
  satz?: number;
  heutigerSatz?: number;
  klein?: boolean;
}) {
  const { klasse, Icon } = STIL[art];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`gap-1 font-medium cursor-help ${klein ? "h-4 px-1 text-[9px]" : "h-5 px-1.5 text-[10px]"} ${klasse}`}
          >
            <Icon className={klein ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {SATZART_LABEL[art]}
            {satz !== undefined && (
              <span className="tabular-nums">
                {" "}
                {satz.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{SATZART_ERKLAERUNG[art]}</p>
          {heutigerSatz !== undefined && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Heute würde für diesen Partner{" "}
              {heutigerSatz.toLocaleString("de-DE", { maximumFractionDigits: 2 })} % gelten. Der
              Vorgang behält den Satz, der beim Anlegen galt.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Legende, die die Satzarten in einem Zug erklärt. */
export function SatzartLegende({ className = "" }: { className?: string }) {
  const arten: Satzart[] = ["eigen", "zugewiesen", "stufe", "locked", "nutzerverwaltung"];
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-xs ${className}`}>
      <span className="font-semibold text-foreground">Welcher Satz gilt:</span>
      {arten.map((a) => (
        <span key={a} className="inline-flex items-center gap-1.5">
          <SatzartBadge art={a} />
          <span className="text-muted-foreground">{SATZART_ERKLAERUNG[a]}</span>
        </span>
      ))}
    </div>
  );
}
