import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Apple-Style Toolbar: sticky Aktionsleiste über Listen/Tabellen mit Blur.
 * Linker Slot für Suche/Filter, rechter Slot für Aktionen.
 */
interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  left?: React.ReactNode;
  right?: React.ReactNode;
  sticky?: boolean;
}

export function Toolbar({ left, right, sticky, className, children, ...props }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/75 backdrop-blur-xl backdrop-saturate-150 px-3 py-2",
        sticky && "sticky top-16 z-20",
        className,
      )}
      {...props}
    >
      {left && <div className="flex items-center gap-2 flex-1 min-w-0">{left}</div>}
      {children}
      {right && <div className="flex items-center gap-2 ml-auto">{right}</div>}
    </div>
  );
}