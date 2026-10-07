import { ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Kleiner Knopf „In neuem Tab öffnen“ für Listenzeilen. Unsichtbar, bis die
 * Zeile (Klasse `group`) überfahren oder der Link fokussiert wird. Auf
 * Geräten ohne Hover ist er immer sichtbar, sonst fände man ihn nie.
 */
export function NeuerTabLink({ href, className }: { href: string; className?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="In neuem Tab öffnen"
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100",
              "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
              className,
            )}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </TooltipTrigger>
        <TooltipContent>In neuem Tab öffnen</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
