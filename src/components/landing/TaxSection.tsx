import { Receipt, Building, Percent, FileText, ArrowRight, Lock } from "lucide-react";
import CountUp from "./CountUp";
import TypewriterHeadline from "./apple/TypewriterHeadline";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";

interface TaxSectionProps {
  onOpenFunnel: () => void;
}

/**
 * Steuervorteile — passend zu den tatsächlich angebotenen Konzepten
 * (Neubau, sanierter Bestand, WG/Co-Living). Der frühere Denkmal-Fokus ist
 * entfallen: Denkmalobjekte stehen aktuell nicht im Angebot, die Seite hat
 * damit mit einem Hebel argumentiert, den es hier nicht gibt.
 */
const TaxSection = ({ onOpenFunnel }: TaxSectionProps) => {
  const texte = useSeitenTexte(MIKROSEITE_TEXTE);
  const t = texte.steuervorteile;
  const items = [
    {
      icon: Building,
      title: t.afaTitel,
      desc: (
        <>
          {t.afaVor}{" "}
          <CountUp end={3} suffix={t.prozentZeichen} className="font-semibold" /> {t.afaMitte}{" "}
          <CountUp end={2} suffix={t.prozentZeichen} className="font-semibold" />
          {t.afaEnde}
        </>
      ),
    },
    { icon: Percent, title: t.zinsenTitel, desc: t.zinsenText },
    { icon: Receipt, title: t.werbungskostenTitel, desc: t.werbungskostenText },
    { icon: FileText, title: t.verlustTitel, desc: t.verlustText },
  ];

  return (
    <section className="py-16 md:py-28 lp-section-light">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-8 h-1 rounded-full bg-primary" />
          <div className="w-4 h-1 rounded-full bg-primary/40" />
        </div>
        <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-4">
          {t.kicker}
        </span>
        <h2 className="text-4xl md:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-4 tracking-tight">
          {t.titelVor}{" "}
          {/* Am 16.09.2026 von zentriert auf links gestellt, gleicher Grund wie
              bei „Für wen wir passen": zentriert rückte jede Variante anders
              ein und der Text wirkte, als springe er hin und her. */}
          <TypewriterHeadline
            className="lp-text-gradient"
            ausrichtung="links"
            einzeilig
            erstBeimScrollen
            varianten={t.titelVarianten}
          />
        </h2>
        <p className="text-base md:text-lg text-[hsl(220,10%,46%)] max-w-2xl mx-auto mb-10 md:mb-14">
          {t.intro}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          {items.map((item, i) => (
            <div
              key={i}
              className="p-4 md:p-6 rounded-xl border border-[hsl(40,15%,88%)] bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)] hover:shadow-[0_12px_40px_-8px_hsla(220,20%,14%,0.12)] transition-all duration-300 text-left"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl mb-3 md:mb-4 flex items-center justify-center bg-primary/10 border border-primary/30">
                <item.icon className="w-5 h-5 md:w-6 md:h-6 text-primary" strokeWidth={1.75} />
              </div>
              <h3 className="text-sm md:text-lg font-semibold text-[hsl(30,8%,16%)] mb-1 md:mb-2">
                {item.title}
              </h3>
              <p className="text-xs md:text-sm text-[hsl(220,10%,46%)] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Der stärkste Satz des Abschnitts, bisher fehlte er komplett */}
        <div className="mt-8 md:mt-12 max-w-3xl mx-auto p-6 md:p-8 rounded-2xl border border-[hsl(40,15%,88%)] bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)] text-left">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/30">
              <Lock className="w-5 h-5 md:w-6 md:h-6 text-primary" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-semibold text-[hsl(30,8%,16%)] mb-2">
                {t.steuerfreiTitel}
              </h3>
              <p className="text-sm md:text-base text-[hsl(220,10%,46%)] leading-relaxed">
                {t.steuerfreiText}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 md:mt-12">
          <button
            onClick={onOpenFunnel}
            className="lp-cta inline-flex items-center gap-2 px-6 md:px-8 py-3.5 md:py-4 rounded-lg font-medium text-sm md:text-base"
          >
            {texte.allgemein.erstberatung}
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-xs text-[hsl(220,10%,46%)] mt-4 max-w-2xl mx-auto">
            {t.hinweis}
          </p>
        </div>
      </div>
    </section>
  );
};

export default TaxSection;
