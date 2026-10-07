import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVaReturn, clearVaReturn } from "@/lib/vertriebsakademieReturn";

/**
 * Sticky Banner „Zurück zur Vertriebsakademie".
 * Erscheint auf der Ziel-Seite einer internen Verlinkung, die aus einem
 * Vertriebsakademie-Kapitel angeklickt wurde. Führt exakt an die
 * auslösende Stelle im Kapitel zurück.
 */
export function VaBackBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [justArrived, setJustArrived] = useState(false);

  // Re-check bei jedem Routenwechsel
  useEffect(() => {
    setTick((t) => t + 1);
    // Auf jedem Routenwechsel: kurze Aufmerksamkeits-Animation triggern
    setJustArrived(true);
    const t = setTimeout(() => setJustArrived(false), 2600);
    return () => clearTimeout(t);
  }, [location.pathname]);

  const ret = getVaReturn();
  if (!ret) return null;

  // Nur auf der Ziel-Seite anzeigen — nicht wenn wir bereits wieder im Kapitel sind
  const backPath = `${ret.academyBase === "/vertriebsakademie-neu" ? ret.academyBase : "/vertriebsakademie"}/${ret.kapitelSlug}`;
  if (location.pathname.startsWith(backPath)) return null;

  // Nur zeigen, wenn Ziel-Pfad (oder Unterpfad) mit aktuellem Pfad übereinstimmt
  if (!location.pathname.startsWith(ret.targetPath)) return null;

  const goBack = () => {
    navigate(`${backPath}?vaScrollTo=${encodeURIComponent(ret.sectionId)}`);
  };

  return (
    <div
      key={tick}
      className={
        "flex items-center justify-between gap-3 px-4 py-2 border-b text-sm animate-fade-in transition-all duration-500 " +
        (justArrived
          ? "bg-primary/20 border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.35)] va-attention"
          : "bg-primary/10 border-primary/30")
      }
    >
      <style>{`
        @keyframes va-attention-pulse {
          0%,100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.55); }
          50%     { box-shadow: 0 0 0 8px hsl(var(--primary) / 0.05); }
        }
        .va-attention { animation: va-attention-pulse 1.1s ease-in-out 2; }
      `}</style>
      <div className="flex items-center gap-2 min-w-0">
        <GraduationCap className={"h-4 w-4 text-primary shrink-0 " + (justArrived ? "animate-scale-in" : "")} />
        <span className="truncate">
          Du kommst aus <span className="font-medium">Kap. {ret.kapitelNummer} · {ret.kapitelTitel}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="default" onClick={goBack} className={"gap-1 " + (justArrived ? "hover-scale" : "")}>
          <ArrowLeft className="h-4 w-4" /> Zurück zur Vertriebsakademie
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            clearVaReturn();
            setTick((t) => t + 1);
          }}
        >
          Schließen
        </Button>
      </div>
    </div>
  );
}