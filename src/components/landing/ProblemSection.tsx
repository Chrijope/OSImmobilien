import { Receipt, HelpCircle, Clock, AlertTriangle, ArrowRight } from "lucide-react";

interface ProblemSectionProps {
  onOpenFunnel: () => void;
}

const ProblemSection = ({ onOpenFunnel }: ProblemSectionProps) => {
  const problems = [
    {
      icon: Receipt,
      title: "Hohe Steuerlast",
      text: "Jedes Jahr fließt ein großer Teil deines Einkommens ans Finanzamt, ohne dass du die steuerlichen Gestaltungsmöglichkeiten konsequent nutzt.",
    },
    {
      icon: HelpCircle,
      title: "Unklare Investmentangebote",
      text: "Viele Objekte sehen auf den ersten Blick attraktiv aus, bieten aber weder eine belastbare Renditestruktur noch ein sauberes Steuerkonzept.",
    },
    {
      icon: Clock,
      title: "Keine Zeit für Prüfung & Umsetzung",
      text: "Objektauswahl, Finanzierung, Steuerstruktur und Vermietung verlangen Erfahrung, Marktkenntnis und Zeit. Genau dort fehlen vielen Berufstätigen die Ressourcen.",
    },
    {
      icon: AlertTriangle,
      title: "Risiko von Fehlentscheidungen",
      text: "Eine schwache Lage, ein ungeeignetes Nutzungskonzept oder eine fehlerhafte Finanzierung können aus einer Kapitalanlage schnell eine Belastung machen.",
    },
  ];

  return (
    <section className="py-20 md:py-32 lp-section-light relative overflow-hidden">
      {/* subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(hsl(220,15%,75%) 1px, transparent 1px), linear-gradient(90deg, hsl(220,15%,75%) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div className="container mx-auto px-4 md:px-6 max-w-6xl relative">
        <div className="text-center mb-14 md:mb-20 max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-1 rounded-full bg-primary" />
            <div className="w-4 h-1 rounded-full bg-primary/40" />
          </div>
          <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-4">
            Die Herausforderung
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-6 tracking-tight">
            Viele Investoren verdienen gut,<br className="hidden md:block" />{" "}
            bauen aber nicht <span className="lp-text-gradient">strategisch genug Vermögen auf.</span>
          </h2>
          <p className="text-base md:text-lg text-[hsl(220,15%,30%)] leading-relaxed">
            Dein Einkommen steigt, die Steuerlast ebenfalls. Doch zielgerichteter Vermögensaufbau
            bleibt oft hinter den Möglichkeiten zurück.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {problems.map((problem, i) => (
            <div
              key={i}
              className="group relative flex flex-col p-7 md:p-8 rounded-2xl border border-[hsl(220,15%,88%)] bg-white shadow-[0_4px_24px_-12px_hsla(220,30%,20%,0.08)] transition-all duration-300 hover:border-primary/40 hover:shadow-[0_12px_40px_-12px_hsla(207,90%,55%,0.18)] hover:-translate-y-1"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <problem.icon className="w-5 h-5 text-primary" strokeWidth={1.75} />
                </div>
                <span className="text-xs font-medium tracking-[0.2em] text-[hsl(220,10%,55%)]">
                  0{i + 1}
                </span>
              </div>
              <h3 className="text-lg md:text-xl font-semibold text-[hsl(220,25%,10%)] mb-3 leading-snug">
                {problem.title}
              </h3>
              <p className="text-sm md:text-[15px] text-[hsl(220,15%,35%)] leading-relaxed">
                {problem.text}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12 md:mt-16">
          <button
            onClick={onOpenFunnel}
            className="lp-btn-glow inline-flex items-center gap-2 px-7 md:px-9 py-3.5 md:py-4 rounded-full font-medium text-sm md:text-base"
          >
            Jetzt Lösung entdecken
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
