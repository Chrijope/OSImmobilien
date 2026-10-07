import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableTextProps {
  text: string;
  /** Zeichen-Schwelle, ab der gekürzt wird. Default 220. */
  maxChars?: number;
  /** Zeilen-Schwelle, ab der gekürzt wird. Default 3. */
  maxLines?: number;
  className?: string;
  /** true = fett (für Beschreibung), false = normal (für Details) */
  strong?: boolean;
}

/**
 * Zeigt Text mit erhaltener Formatierung (Zeilenumbrüche/Absätze).
 * Wird der Text zu lang, erscheint ein „Mehr anzeigen / Weniger"-Toggle.
 */
export function ExpandableText({ text, maxChars = 220, maxLines = 3, className = "", strong = false }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const safeText = text ?? "";

  const needsToggle = useMemo(() => {
    if (!safeText) return false;
    if (safeText.length > maxChars) return true;
    if (safeText.split(/\r?\n/).length > maxLines) return true;
    return false;
  }, [safeText, maxChars, maxLines]);

  if (!safeText) return null;

  const Wrapper: any = strong ? "strong" : "span";

  return (
    <div className={className}>
      <Wrapper
        className="whitespace-pre-wrap break-words block"
        style={!expanded && needsToggle ? {
          display: "-webkit-box",
          WebkitLineClamp: maxLines,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        } as React.CSSProperties : undefined}
      >
        {safeText}
      </Wrapper>
      {needsToggle && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {expanded ? (<><ChevronUp className="h-3 w-3" /> Weniger anzeigen</>) : (<><ChevronDown className="h-3 w-3" /> Mehr anzeigen</>)}
        </button>
      )}
    </div>
  );
}

export default ExpandableText;