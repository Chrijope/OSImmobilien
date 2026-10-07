import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Apple-Style SectionCard: ruhige Sektions-Karte mit dezenter Border, weichem
 * Schatten und großzügigem Innenabstand. Verwendung wie Card.
 *
 * Der Haken `data-ui="card"` macht sie im Liquid Glass zur Glaskarte wie
 * jede Card (Entscheidung vom 23.09.2026: Glas auf allen Karten).
 */
export const SectionCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="card"
      className={cn(
        "rounded-2xl border border-border/60 bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
      {...props}
    />
  ),
);
SectionCard.displayName = "SectionCard";

export function SectionCardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 sm:px-6 pt-5 pb-3", className)} {...props} />;
}

export function SectionCardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold tracking-tight text-foreground", className)} {...props} />;
}

export function SectionCardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground mt-0.5", className)} {...props} />;
}

export function SectionCardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 sm:px-6 pb-5", className)} {...props} />;
}