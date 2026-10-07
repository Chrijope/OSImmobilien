import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AkademieKapitel, AkademieSection } from "@/lib/vertriebsakademieContent";
import { useVaProgress } from "@/lib/vertriebsakademieProgress";

/**
 * Sticky Section-Navigation rechts im Kapitel.
 * Klick springt zur jeweiligen Section (die als Accordion aufklappt).
 */
export function AkademieSectionNav({
  kap, activeId, onJump,
}: { kap: AkademieKapitel; activeId?: string; onJump: (id: string) => void }) {
  const s = useVaProgress();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY < 60 || true);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <aside className="hidden xl:block fixed right-6 top-28 w-56 z-20">
      <div className="rounded-xl border bg-card/95 backdrop-blur shadow-sm p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2 px-2">
          Sections
        </div>
        <ul className="space-y-0.5">
          {kap.sections.map((sec) => {
            const done = isSectionDone(kap.slug, sec, s);
            const isActive = activeId === sec.id;
            return (
              <li key={sec.id}>
                <button
                  type="button"
                  onClick={() => onJump(sec.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors",
                    isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground/80",
                  )}
                >
                  {done
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    : <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <span className="truncate">{sec.ueberschrift}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

function isSectionDone(slug: string, sec: AkademieSection, s: ReturnType<typeof useVaProgress>): boolean {
  const checks = sec.checkliste || [];
  const uebungen = sec.uebungen || [];
  if (checks.length === 0 && uebungen.length === 0) return false;
  const allChecks = checks.every((_c, i) => !!s.checks[`${slug}::${sec.id}::${i}`]);
  const allUeb = uebungen.every((u) => !!s.uebungen[`${slug}::${u.id}`]);
  return allChecks && allUeb;
}
