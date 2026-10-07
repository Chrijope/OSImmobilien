import { Star, Quote, ArrowRight } from "lucide-react";
import { useState } from "react";
import CountUp from "./CountUp";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_ABSCHLUSS_TEXTE } from "./mikroseiteAbschlussTexte";

// Echte Personenfotos von osimmobilien.netlify.app (Marken-konsistent)
const MI = "https://osimmobilien.netlify.app/assets";
const julianImg = `${MI}/person-julian-CWeaPJ4D.webp`;
const sandraImg = `${MI}/person-sandra-D5AeWa2J.webp`;
const thomasImg = `${MI}/person-thomas-DdmKLRIx.webp`;
const stefanImg = `${MI}/person-stefan-BSeKq4tz.webp`;
const miriamImg = `${MI}/person-miriam-abCR9oNV.webp`;
const markusImg = `${MI}/person-markus-Dx8ljg0O.webp`;
const annaImg = `${MI}/person-anna-D47p2u_g.webp`;
const danielImg = `${MI}/person-daniel-KOfH_w8O.webp`;
const claudiaImg = `${MI}/person-claudia-D_zu2clz.webp`;

const PERSONEN = [
  { name: "Julian B.", image: julianImg },
  { name: "Sandra W.", image: sandraImg },
  { name: "Thomas F.", image: thomasImg },
  { name: "Stefan L.", image: stefanImg },
  { name: "Miriam K.", image: miriamImg },
  { name: "Markus H.", image: markusImg },
  { name: "Anna T.", image: annaImg },
  { name: "Daniel R.", image: danielImg },
  { name: "Claudia B.", image: claudiaImg },
];

interface SocialProofSectionProps {
  onOpenFunnel: () => void;
}

const SocialProofSection = ({ onOpenFunnel }: SocialProofSectionProps) => {
  const texte = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE);
  const t = texte.kundenstimmen;
  // Namen und Bilder stehen hier, Text und Ort je Sprache in der Textdatei,
  // Person für Person in derselben Reihenfolge.
  const moreTestimonials = PERSONEN.map((p, i) => ({ ...p, role: t.orte[i], text: t.stimmen[i], stars: 5 }));

  const [paused, setPaused] = useState(false);

  return (
    <section className="py-16 md:py-28 lp-section-alt">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="text-center mb-10 md:mb-16">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-1 rounded-full bg-primary" />
            <div className="w-4 h-1 rounded-full bg-primary/40" />
          </div>
          <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-4">{t.oberzeile}</span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-4 tracking-tight">
            {t.titel}
            <span className="lp-text-gradient">{t.titelAkzent}</span>
          </h2>
          <p className="text-base md:text-lg text-[hsl(220,10%,46%)] max-w-2xl mx-auto">
            {t.unterzeile}
          </p>
        </div>

        <button className="kundenstimmen-pause" type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
          {paused ? t.weiter : t.pausieren}
        </button>
        <div className="kundenstimmen-window" role="region" aria-label={t.region} tabIndex={0}>
          <div className="kundenstimmen-track" style={{ animationPlayState: paused ? "paused" : undefined }}>
            {[0, 1].map((group) => <div className="kundenstimmen-group" key={group} aria-hidden={group === 1 ? true : undefined}>
            {moreTestimonials.map((t, i) => (
              <div
                key={i}
                className="shrink-0 w-[280px] md:w-[340px] p-5 md:p-6 rounded-xl bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)] border border-[hsl(40,15%,88%)] relative flex flex-col"
              >
                <Quote className="w-7 h-7 text-[hsl(30,8%,16%)]/10 absolute top-5 right-5" />
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5 fill-[hsl(30,8%,16%)] text-[hsl(30,8%,16%)]" />
                  ))}
                </div>
                <p className="text-[hsl(30,8%,16%)] leading-relaxed mb-4 text-sm flex-1">{t.text}</p>
                <div className="flex items-center gap-3 mt-auto pt-3 border-t border-[hsl(40,15%,92%)]">
                  <img loading="lazy" src={t.image} alt={t.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-[hsl(30,8%,16%)] text-sm truncate">{t.name}</p>
                    <p className="text-xs text-[hsl(220,10%,46%)] truncate">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
            </div>)}
          </div>
        </div>

        <div className="mt-10 md:mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-center">
          {[
            { end: 350, suffix: "+", label: t.kennzahlen[0] },
            { end: 450, suffix: "+", label: t.kennzahlen[1] },
            { end: 20, suffix: "+", label: t.kennzahlen[2] },
            { end: 700, suffix: "+", label: t.kennzahlen[3] },
          ].map((stat, i) => (
            <div key={i}>
              <CountUp end={stat.end} suffix={stat.suffix} className="text-2xl md:text-3xl lg:text-4xl font-bold lp-text-gradient" />
              <p className="text-[hsl(220,10%,46%)] text-xs md:text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-8 md:mt-12">
          <button
            onClick={onOpenFunnel}
            className="lp-cta inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3.5 md:py-4 rounded-lg font-medium text-sm md:text-base"
          >
            {texte.erstberatungKnopf}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default SocialProofSection;
