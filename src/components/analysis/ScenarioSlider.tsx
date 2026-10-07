import { useState } from "react";
import { TrendingDown, Minus, TrendingUp } from "lucide-react";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { euroText } from "@/lib/sprachFormat";
import { ANALYSE_TEXTE } from "./analyseTexte";

interface ScenarioSliderProps {
  pessimistisch: number;
  realistisch: number;
  optimistisch: number;
}


/** Interaktiver 3-Stufen-Slider für Vermögensszenarien. */
export default function ScenarioSlider({ pessimistisch, realistisch, optimistisch }: ScenarioSliderProps) {
  const t = useSeitenTexte(ANALYSE_TEXTE).szenario;
  const sprache = useSeitenSprache();
  const fmt = (v: number) => euroText(v, sprache);
  const [selected, setSelected] = useState<"pessimistisch" | "realistisch" | "optimistisch">("realistisch");

  const value =
    selected === "pessimistisch" ? pessimistisch : selected === "realistisch" ? realistisch : optimistisch;

  const options = [
    {
      key: "pessimistisch" as const,
      label: t.pessimistisch,
      sub: t.wertsteigerung(1),
      icon: TrendingDown,
      color: "text-alert-orange",
    },
    {
      key: "realistisch" as const,
      label: t.realistisch,
      sub: t.wertsteigerung(2),
      icon: Minus,
      color: "text-foreground",
    },
    {
      key: "optimistisch" as const,
      label: t.optimistisch,
      sub: t.wertsteigerung(3),
      icon: TrendingUp,
      color: "text-alert-green",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {options.map((opt) => {
          const active = selected === opt.key;
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              onClick={() => setSelected(opt.key)}
              className={`rounded-xl px-2 sm:px-3 py-3 border transition-all text-center ${
                active
                  ? "bg-primary/10 border-primary/40 scale-[1.02] shadow-md"
                  : "bg-card border-border/50 hover:border-primary/20 opacity-70 hover:opacity-100"
              }`}
            >
              <Icon className={`w-4 h-4 mx-auto mb-1 ${opt.color}`} />
              <p className="text-[11px] sm:text-xs font-semibold text-foreground leading-tight">{opt.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{opt.sub}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-muted/50 rounded-xl p-5 border border-border/50 text-center">
        <p className="text-xs text-muted-foreground mb-1">{t.vermoegen}</p>
        <p className="text-3xl md:text-4xl font-bold sand-text transition-all duration-300">{fmt(value)}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-2">
          {t.szenario} <span className="text-foreground/80 font-medium">{options.find((o) => o.key === selected)?.label}</span>
        </p>
      </div>
    </div>
  );
}
