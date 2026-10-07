import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  /** Erläuterungstext, der erscheint, sobald der Nutzer mit der Maus über das i-Icon fährt. */
  text?: React.ReactNode;
  /** Alias für `text` (Rückwärtskompatibilität). */
  content?: React.ReactNode;
  /** Optional zusätzliche Klassen für das Icon. */
  className?: string;
  /** Icon-Größe in px (default 13 — passt bündig neben kleine Beschriftungen). */
  size?: number;
  /** Seite, auf der der Tooltip erscheint. */
  side?: "top" | "right" | "bottom" | "left";
  /** Maximale Breite des Tooltips in px (default 260). */
  maxWidth?: number;
  /** ARIA-Label für Screenreader (default "Mehr Informationen"). */
  label?: string;
}

/**
 * Kleines Info-Icon (Lucide `Info`, i im Kreis) mit shadcn-Tooltip.
 * Wird überall dort eingesetzt, wo eine Zahl, Kachel oder Beschriftung
 * eine kurze Erklärung braucht, damit Nutzer ohne Rückfrage wissen,
 * was angezeigt wird.
 *
 * Verwendung:
 * ```tsx
 * <span className="flex items-center gap-1">
 *   Stuck Deals <InfoTooltip text="Deals, die ihre SLA-Frist in der aktuellen Pipeline-Stufe überschritten haben." />
 * </span>
 * ```
 */
export function InfoTooltip({
  text,
  content,
  className,
  size = 13,
  side = "top",
  maxWidth = 260,
  label = "Mehr Informationen",
}: InfoTooltipProps) {
  const body = text ?? content;
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex shrink-0 items-center justify-center text-muted-foreground hover:text-foreground transition-colors align-middle",
            className,
          )}
        >
          <Info style={{ width: size, height: size }} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="text-xs leading-snug"
        style={{ maxWidth }}
      >
        {body}
      </TooltipContent>
    </Tooltip>
  );
}

export default InfoTooltip;