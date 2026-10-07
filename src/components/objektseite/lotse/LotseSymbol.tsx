import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Das Symbol des MORE Lotsen: ein Hausdach über einem Kompass, die Nadel
 * sucht und kommt zur Ruhe, drei Funken glimmen. Nach der Vorschau vom
 * 28.09.2026. Die Bewegung steht in `src/index.css` (`.lotse-nadel` und
 * Verwandte) und ruht bei `prefers-reduced-motion`. `ruhig` schaltet sie für
 * kleine Stellen ab, etwa im Reiter.
 */
export function LotseSymbol({ className, ruhig = false }: { className?: string; ruhig?: boolean }) {
  // Eine eigene Kennung je Symbol, sonst greifen mehrere Symbole auf denselben Verlauf zu.
  const verlauf = `lotse-verlauf-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={cn("h-12 w-12 shrink-0", className)} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={verlauf} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b8ae6" />
          <stop offset="1" stopColor="#6a4df0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${verlauf})`} />
      <rect className={ruhig ? undefined : "lotse-schimmer"} opacity={ruhig ? 0 : undefined} x="2" y="2" width="60" height="30" rx="18" fill="#fff" />
      <path d="M14 30 L32 15 L50 30" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" opacity=".95" />
      <circle cx="32" cy="36" r="13" fill="rgba(255,255,255,.18)" stroke="#fff" strokeWidth="2.4" />
      <g className={ruhig ? undefined : "lotse-nadel"}>
        <path d="M32 24 L35 36 L32 34 L29 36 Z" fill="#ffb27a" />
        <path d="M32 48 L29 36 L32 38 L35 36 Z" fill="#fff" />
        <circle cx="32" cy="36" r="2.2" fill="#fff" />
      </g>
      <path className={ruhig ? undefined : "lotse-funke"} d="M51 10 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6z" fill="#fff" />
      <path className={ruhig ? undefined : "lotse-funke lotse-funke-2"} d="M12 45 l1.1 2.4 2.4 1.1 -2.4 1.1 -1.1 2.4 -1.1 -2.4 -2.4 -1.1 2.4 -1.1z" fill="#ffe3cf" />
      <path className={ruhig ? undefined : "lotse-funke lotse-funke-3"} d="M54 46 l.9 2 2 .9 -2 .9 -.9 2 -.9 -2 -2 -.9 2 -.9z" fill="#fff" />
    </svg>
  );
}
