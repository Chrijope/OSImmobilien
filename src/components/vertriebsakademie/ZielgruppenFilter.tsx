import { useZielgruppe, type AkademieZielgruppe } from "@/lib/vertriebsakademieZielgruppe";
import { Users, Sprout, Gem } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS: { value: AkademieZielgruppe; label: string; icon: typeof Users; tint: string; hint: string }[] = [
  { value: "alle", label: "Alle Inhalte", icon: Users, tint: "text-foreground", hint: "Standard – zeigt Grundlagen, Quereinsteiger-Hilfen und Profi-Nuggets." },
  { value: "quereinsteiger", label: "Quereinsteiger-Pfad", icon: Sprout, tint: "text-sky-600 dark:text-sky-400", hint: "Fokus auf Erklärungen für Neulinge, blendet Profi-Nuggets & Advanced-Challenges aus." },
  { value: "profi", label: "Profi-Pfad", icon: Gem, tint: "text-amber-600 dark:text-amber-400", hint: "Hebt Gold-Nuggets & Advanced-Challenges hervor, dämpft Basics-Erklärungen." },
];

/**
 * Filter-Bar für die Vertriebsakademie: Alle / Quereinsteiger / Profi.
 * Steuert Sichtbarkeit von Gold-Nuggets, Advanced-Übungen und Quereinsteiger-Hinweisen.
 */
export function ZielgruppenFilter({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [zielgruppe, setZielgruppe] = useZielgruppe();
  const active = OPTIONS.find((o) => o.value === zielgruppe) ?? OPTIONS[0];
  return (
    <div className={cn("space-y-2", className)}>
      {!compact && (
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> Ansicht für
        </div>
      )}
      <div className="inline-flex flex-wrap gap-1.5 rounded-lg border bg-card p-1">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const isActive = o.value === zielgruppe;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setZielgruppe(o.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                // Marken-Orange statt Blau: Der gewaehlte Pfad ist die eine
                // Einstellung, die alles darunter veraendert, und soll sich
                // von den blauen Knoepfen der Seite abheben.
                isActive
                  ? "bg-brand-orange text-brand-orange-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              )}
              aria-pressed={isActive}
            >
              <Icon className={cn("h-3.5 w-3.5", isActive ? "" : o.tint)} />
              {o.label}
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className="text-[11px] text-muted-foreground">{active.hint}</div>
      )}
    </div>
  );
}