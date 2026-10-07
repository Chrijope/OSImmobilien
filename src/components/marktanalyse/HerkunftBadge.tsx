// Kennzeichnung, woher eine Zahl stammt.
//
// Bewusst unaufdringlich, aber überall sichtbar: Wer einem Kunden eine Zahl
// vorliest, soll auf einen Blick sehen, ob sie erhoben oder gerechnet ist.

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BadgeCheck, BookOpen, Sigma } from "lucide-react";
import {
  type Herkunft,
  HERKUNFT_LABEL,
  HERKUNFT_ERKLAERUNG,
} from "@/lib/marktdatenHerkunft";

const STIL: Record<Herkunft, { klasse: string; Icon: React.ComponentType<{ className?: string }> }> = {
  gemessen: {
    klasse: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    Icon: BadgeCheck,
  },
  kuratiert: {
    klasse: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    Icon: BookOpen,
  },
  modelliert: {
    klasse: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    Icon: Sigma,
  },
};

export function HerkunftBadge({
  herkunft,
  /** Zusatzzeile im Tooltip, etwa "BORIS · 06/2026". */
  beleg,
  klein = false,
  className = "",
}: {
  herkunft: Herkunft;
  beleg?: string;
  klein?: boolean;
  className?: string;
}) {
  const { klasse, Icon } = STIL[herkunft];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`gap-1 font-medium ${klein ? "h-4 px-1 text-[9px]" : "h-5 px-1.5 text-[10px]"} ${klasse} ${className}`}
          >
            <Icon className={klein ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {HERKUNFT_LABEL[herkunft]}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{HERKUNFT_ERKLAERUNG[herkunft]}</p>
          {beleg && <p className="mt-1 text-[11px] text-muted-foreground">{beleg}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
