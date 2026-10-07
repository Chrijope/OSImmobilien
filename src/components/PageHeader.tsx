interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-2">
      <div>
        <h1 className="text-[22px] sm:text-[32px] font-semibold text-foreground tracking-tight leading-tight break-keep [overflow-wrap:normal] [word-break:keep-all] [hyphens:none]">{title}</h1>
        {/*
          Blauer Balken der Markenrichtlinie. Er sitzt direkt unter der
          Überschrift und ersetzt keine Trennlinie: die durchgehende Haarlinie
          aus dem Dokumentenkopf ist hier bewusst weggelassen, sonst bekäme
          jede Seite zwei waagerechte Linien übereinander.
        */}
        <div aria-hidden className="mt-2 h-[3px] w-9 sm:w-11 rounded-full bg-primary" />
        {subtitle && (
          <p className="text-muted-foreground text-[13px] mt-2.5">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}
