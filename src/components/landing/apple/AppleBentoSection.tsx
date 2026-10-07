import Reveal from "@/components/landing/Reveal";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";

import bgObjekte from "@/assets/lp/mikroseite/leistung-objekte.webp";
import bgSteuern from "@/assets/lp/mikroseite/leistung-steuern.webp";
import bgFinanzierung from "@/assets/lp/mikroseite/leistung-finanzierung.webp";
import bgStrategie from "@/assets/lp/mikroseite/leistung-strategie.webp";
import bgBetreuung from "@/assets/lp/mikroseite/leistung-betreuung.webp";

/**
 * Apple-Style Bento-Grid für die Berater-Microseite.
 * Asymmetrisches Raster mit zusammengehörigen, natürlich wirkenden Motiven.
 */
const AppleBentoSection = () => {
  const t = useSeitenTexte(MIKROSEITE_TEXTE).bento;
  return (
    <section id="mehr-erfahren" className="relative py-24 md:py-36 px-6 bg-[hsl(var(--background))]">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <p
            className="text-[13px] md:text-sm font-medium uppercase mb-4"
            style={{ letterSpacing: "0.12em", color: "hsl(var(--primary))" }}
          >
            {t.kicker}
          </p>
          <h2
            className="font-semibold text-[hsl(var(--foreground))] max-w-[20ch]"
            style={{ fontSize: "clamp(32px, 5vw, 60px)", lineHeight: 1.06, letterSpacing: "-0.03em" }}
          >
            {t.titelZeile1}
            <br />
            <span style={{ color: "hsl(var(--primary))" }}>
              {t.titelZeile2}
            </span>
          </h2>
          <p
            className="mt-5 md:mt-6 max-w-[52ch] text-[17px] md:text-[19px] leading-snug"
            style={{ color: "hsl(var(--muted-foreground))", letterSpacing: "-0.012em" }}
          >
            {t.text}
          </p>
        </Reveal>

        <div
          className="mt-12 md:mt-16 grid gap-4 md:gap-5"
          style={{
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gridAutoRows: "minmax(180px, auto)",
          }}
        >
          {/* Karte 1, Featured: Geprüfte Objekte (groß) */}
          <Reveal className="md:!col-span-4 col-span-6 row-span-2" delay={50}>
            <BentoCard
              eyebrow={t.objekte.eyebrow}
              title={t.objekte.titel}
              body={t.objekte.text}
              large
              bgImage={bgObjekte}
            />
          </Reveal>

          {/* Karte 2, Steuern */}
          <Reveal className="md:!col-span-2 col-span-6" delay={120}>
            <BentoCard
              eyebrow={t.steuern.eyebrow}
              title={t.steuern.titel}
              body={t.steuern.text}
              bgImage={bgSteuern}
            />
          </Reveal>

          {/* Karte 3, Finanzierung */}
          <Reveal className="md:!col-span-2 col-span-6" delay={180}>
            <BentoCard
              eyebrow={t.finanzierung.eyebrow}
              title={t.finanzierung.titel}
              body={t.finanzierung.text}
              bgImage={bgFinanzierung}
            />
          </Reveal>

          {/* Karte 4, Portfolio Strategie */}
          <Reveal className="md:!col-span-3 col-span-6" delay={240}>
            <BentoCard
              eyebrow={t.strategie.eyebrow}
              title={t.strategie.titel}
              body={t.strategie.text}
              bgImage={bgStrategie}
            />
          </Reveal>

          {/* Karte 5, Persönliche Begleitung */}
          <Reveal className="md:!col-span-3 col-span-6" delay={300}>
            <BentoCard
              eyebrow={t.betreuung.eyebrow}
              title={t.betreuung.titel}
              body={t.betreuung.text}
              bgImage={bgBetreuung}
            />
          </Reveal>

        </div>
      </div>
    </section>
  );
};

interface CardProps {
  eyebrow: string;
  title: string;
  body: string;
  large?: boolean;
  bgImage: string;
}

const BentoCard = ({ eyebrow, title, body, large, bgImage }: CardProps) => (
  <article className={`leistung-card${large ? " leistung-card-large" : ""}`}>
    <img src={bgImage} alt="" loading="lazy" width="1536" height="1024" />
    <div className="leistung-copy">
      <div className="leistung-eyebrow">{eyebrow}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  </article>
);

export default AppleBentoSection;
