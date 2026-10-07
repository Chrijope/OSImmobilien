import { ReactNode } from "react";

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** Optionaler Inhalt rechts oben (z.B. KPI-Pills). Auf Mobile bricht alles um. */
  rightSlot?: ReactNode;
  /** Veraltet – Headline ist jetzt durchgängig Helvetica-tight. Bleibt für API-Kompatibilität. */
  plain?: boolean;
}

/**
 * Hero-Card auf jeder Portal-Seite – Apple-minimal, klare Fläche,
 * Helvetica-tighte Headline, dezente Border, ein Fokus pro Bildschirm.
 */
export function PortalHero({ eyebrow, title, subtitle, actions, children, rightSlot }: Props) {
  return (
    <section className="portal-hero-card portal-page-heading p-6 sm:p-8 mb-6 sm:mb-8 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="portal-eyebrow text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-3 font-medium">
              {eyebrow}
            </div>
          )}
          <h1 className="portal-hero-title text-2xl sm:text-3xl text-foreground">
            {title}
          </h1>
          {subtitle && (
            <div className="mt-2 text-muted-foreground text-sm sm:text-base max-w-2xl leading-relaxed">
              {subtitle}
            </div>
          )}
          {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        </div>
        {rightSlot && (
          <div className="shrink-0 flex flex-wrap gap-3 sm:flex-col sm:items-end">
            {rightSlot}
          </div>
        )}
      </div>
      {children && <div className="relative z-10 mt-6">{children}</div>}
    </section>
  );
}