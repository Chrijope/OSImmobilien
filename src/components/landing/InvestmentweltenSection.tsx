import { Building2, Hammer, Users } from "lucide-react";
import Reveal from "./Reveal";
import ObjektClip from "./ObjektClip";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";

/**
 * Die drei Investmentkonzepte als eigener Abschnitt.
 * Bisher tauchten sie nur als Nebensatz unter „Warum OS Immobilien" auf.
 * Aufbau je Karte bewusst identisch, damit sie vergleichbar bleiben.
 */
/** Symbol und Clip je Konzept, in derselben Reihenfolge wie die Texte. */
const WELTEN_MEDIEN = [
  { icon: Building2, clip: "typ-neubau" },
  { icon: Hammer, clip: "typ-bestand" },
  { icon: Users, clip: "typ-wg" },
];

const InvestmentweltenSection = () => {
  const t = useSeitenTexte(MIKROSEITE_TEXTE).investmentwelten;
  const welten = t.welten.map((w, i) => ({ ...w, ...WELTEN_MEDIEN[i] }));

  return (
    <section className="py-16 md:py-28 lp-section-alt">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-1 rounded-full bg-primary" />
            <div className="w-4 h-1 rounded-full bg-primary/40" />
          </div>
          <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-4">
            {t.kicker}
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-4 tracking-tight">
            {t.titelVor}{" "}
            <span className="lp-text-gradient">{t.titelBetont}</span>
          </h2>
          <p className="text-base md:text-lg text-[hsl(220,10%,46%)] max-w-2xl mx-auto mb-10 md:mb-14">
            {t.intro}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-3 md:gap-6">
          {welten.map((w, i) => (
            <Reveal key={i} delay={i * 90} className="h-full">
            <div
              className="investment-card relative h-full p-5 md:p-7 rounded-xl bg-white text-left flex flex-col border border-[hsl(40,15%,88%)]"
            >
              <ObjektClip name={w.clip} alt={w.clipAlt} />
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl mb-4 flex items-center justify-center bg-primary/10 border border-primary/30">
                <w.icon className="w-5 h-5 md:w-6 md:h-6 text-primary" strokeWidth={1.75} />
              </div>
              <h3 className="text-lg md:text-xl font-semibold text-[hsl(30,8%,16%)]">{w.label}</h3>
              <p className="text-sm md:text-[15px] text-primary font-medium mb-3">{w.claim}</p>
              <p className="text-sm md:text-[15px] text-[hsl(220,10%,46%)] leading-relaxed mb-5">{w.text}</p>

              <div className="mt-auto space-y-3 pt-4 border-t border-[hsl(40,15%,88%)]">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[hsl(220,10%,46%)] mb-1">
                    {t.steuerhebel}
                  </div>
                  <div className="text-sm text-[hsl(30,8%,16%)] leading-snug">{w.hebel}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[hsl(220,10%,46%)] mb-1">
                    {t.passtZu}
                  </div>
                  <div className="text-sm text-[hsl(30,8%,16%)] leading-snug">{w.passt}</div>
                </div>
              </div>
            </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-8 md:mt-10 text-center text-sm md:text-base text-[hsl(220,10%,46%)] max-w-2xl mx-auto">
          {t.schluss}
        </p>
      </div>
    </section>
  );
};

export default InvestmentweltenSection;
