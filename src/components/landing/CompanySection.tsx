import { MapPin, Award, Handshake, Wrench, Users, BarChart3 } from "lucide-react";
import CountUp from "./CountUp";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";

/** Symbole der ersten fünf Vorteile, in derselben Reihenfolge wie die Texte. */
const VORTEIL_SYMBOLE = [MapPin, Award, Wrench, Handshake, Users];

const CompanySection = () => {
  const t = useSeitenTexte(MIKROSEITE_TEXTE).unternehmen;
  const advantages = [
    ...t.vorteile.map((v, i) => ({ icon: VORTEIL_SYMBOLE[i], title: v.titel, desc: v.text as React.ReactNode })),
    {
      icon: BarChart3,
      title: t.bilanzTitel,
      desc: (
        <>
          <CountUp end={350} className="font-semibold" />
          {t.bilanzInvestoren} <CountUp end={450} className="font-semibold" />
          {t.bilanzEinheiten}
        </>
      ),
    },
  ];

  return (
    <section className="py-16 md:py-28 lp-section-alt">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="text-center mb-10 md:mb-16">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-1 rounded-full bg-primary" />
            <div className="w-4 h-1 rounded-full bg-primary/40" />
          </div>
          <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-4">{t.kicker}</span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-4 tracking-tight">
            {t.titelVor}{" "}
            <span className="lp-text-gradient">{t.titelBetont}</span>
          </h2>
          <p className="text-base md:text-lg text-[hsl(220,10%,46%)] max-w-2xl mx-auto">
            {t.intro}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
          {advantages.map((a, i) => (
            <div key={i} className="p-4 md:p-6 rounded-xl bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)] border border-[hsl(40,15%,88%)] hover:shadow-[0_12px_40px_-8px_hsla(220,20%,14%,0.12)] hover:border-[hsl(30,8%,16%)]/20 transition-all duration-300 group">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl mb-3 md:mb-4 flex items-center justify-center bg-primary/10 border border-primary/30">
                <a.icon className="w-5 h-5 md:w-6 md:h-6 text-primary" strokeWidth={1.75} />
              </div>
              <h3 className="text-sm md:text-lg font-semibold text-[hsl(220,20%,14%)] mb-1 md:mb-2">{a.title}</h3>
              <p className="text-xs md:text-sm text-[hsl(220,10%,46%)]">{a.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CompanySection;
