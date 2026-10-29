import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { colorForName } from "@/components/chat/chatFarbe";
import { cn } from "@/lib/utils";
import { istVorfuehrmodusAktiv, tarnName } from "@/lib/vorfuehrmodus";
import type { EinblickPerson } from "@/lib/kundenEinblick";

/** Profilbilder „Wer hat Einblick in den Kunden“; die Regeln stehen in `kundenEinblick`. */
export function EinblickReihe({ personen, className }: { personen: EinblickPerson[]; className?: string }) {
  if (personen.length === 0) return null;
  const getarnt = istVorfuehrmodusAktiv();
  const sichtbar = personen.slice(0, 5);
  return (
    <div data-pruefung="kunden-einblick" className={cn("flex items-center gap-1.5", className)}>
      <div className="flex -space-x-1.5">
        {sichtbar.map((p) => {
          const name = tarnName(p.name, "partner");
          const kuerzel = name.split(/\s+/).filter(Boolean).map((t) => t[0]).slice(0, 2).join("").toUpperCase();
          return (
            <Tooltip key={p.id}>
              <TooltipTrigger asChild>
                <Avatar className={cn("h-5 w-5 border-2 border-card", p.zustaendig && "ring-1 ring-primary")}>
                  {!getarnt && p.bildUrl ? <AvatarImage src={p.bildUrl} alt={name} className="object-cover" /> : null}
                  <AvatarFallback className={`${colorForName(name)} text-white text-bildunterschrift`}>{kuerzel}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="font-semibold text-xs">{name}</p>
                <p className="text-bildunterschrift text-muted-foreground">
                  {p.zustaendig ? `${p.rolle}, zuständig` : getarnt && p.team ? "Vertriebspartner, Team" : p.rolle}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {personen.length > sichtbar.length && (
        <span className="text-bildunterschrift text-muted-foreground tabular-nums">+{personen.length - sichtbar.length}</span>
      )}
    </div>
  );
}
