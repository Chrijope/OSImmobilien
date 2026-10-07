import { ArrowRight, Shield, Clock, Phone } from "lucide-react";
import logo from "@/assets/moreimmo-logo.png";
import type { BeraterProfile } from "@/lib/beraterProfil";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import { MIKROSEITE_ABSCHLUSS_TEXTE } from "./mikroseiteAbschlussTexte";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";
import { PartnerPixelHinweis } from "@/components/cookie/PartnerPixelHinweis";

interface CTASectionProps {
  onOpenFunnel: () => void;
  berater?: BeraterProfile;
}


const CTASection = ({ onOpenFunnel }: CTASectionProps) => {
  const texte = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE);
  const t = texte.abschluss;
  const f = texte.fuss;
  const sprache = useSeitenSprache();

  return (
    <>
      {/* CTA section */}
      <section id="beratung" className="py-16 md:py-28 lp-section-light relative overflow-hidden">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl relative z-10">
          <div className="text-center max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-8 h-1 rounded-full bg-primary" />
              <div className="w-4 h-1 rounded-full bg-primary/40" />
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-4 md:mb-6 tracking-tight">
              {t.titel}
              <span className="lp-text-gradient">{t.titelAkzent}</span>
            </h2>
            <p className="text-base md:text-lg text-[hsl(220,15%,30%)] mb-6 md:mb-8 leading-relaxed">
              {t.einleitung}
            </p>

            <button
              onClick={onOpenFunnel}
              className="lp-cta inline-flex items-center gap-2 px-7 md:px-10 py-4 md:py-5 rounded-full font-medium text-base md:text-lg"
            >
              {texte.erstberatungKnopf}
              <ArrowRight className="w-5 h-5" />
            </button>
            <p className="text-xs text-[hsl(220,10%,46%)] mt-3">
              {t.ohneRisiko}
            </p>

            <div className="flex flex-col items-center gap-3 md:gap-4 mt-8 md:mt-10">
              {[
                { icon: Shield, text: t.vorteile[0] },
                { icon: Clock, text: t.vorteile[1] },
                { icon: Phone, text: t.vorteile[2] },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 justify-center text-[hsl(220,15%,35%)]">
                  <item.icon className="w-4 h-4 flex-shrink-0 text-primary" />
                  <span className="text-sm">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer
        className="border-t border-white/[0.06] pt-14 md:pt-20 pb-8 text-white"
        style={{ background: "hsl(220, 30%, 8%)" }}
      >
        <div className="container mx-auto px-4 md:px-6 max-w-7xl">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 md:gap-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-3 lg:col-span-2">
              <img src={logo} alt="OS Immobilien" className="h-7 md:h-8 mb-5 brightness-0 invert" />
              <p className="text-sm text-[hsl(210,20%,65%)] leading-relaxed max-w-xs">
                {f.marke}
              </p>
              <div className="flex items-center gap-3 mt-6">
                <a
                  href="mailto:os@os-immobilien.com"
                  aria-label={f.mailBeschriftung}
                  className="text-sm text-[hsl(210,20%,70%)] hover:text-primary transition-colors"
                >
                  os@os-immobilien.com
                </a>
              </div>
            </div>

            {/* Themen auf dieser Seite */}
            <div>
              <h4 className="text-xs uppercase tracking-[0.25em] text-[hsl(210,20%,55%)] mb-4">{f.aufDieserSeite}</h4>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#beratung" className="text-[hsl(210,20%,80%)] hover:text-primary transition-colors">{f.erstberatung}</a></li>
                <li><button onClick={onOpenFunnel} className="text-[hsl(210,20%,80%)] hover:text-primary transition-colors text-left">{f.investmentCheck}</button></li>
              </ul>
            </div>

            {/* Unternehmen */}
            <div>
              <h4 className="text-xs uppercase tracking-[0.25em] text-[hsl(210,20%,55%)] mb-4">{f.unternehmen}</h4>
              <ul className="space-y-2.5 text-sm">
                <li><a href="https://osimmobilien.netlify.app" target="_blank" rel="noopener noreferrer" className="text-[hsl(210,20%,80%)] hover:text-primary transition-colors">osimmobilien.netlify.app</a></li>
                <li><a href="mailto:os@os-immobilien.com" className="text-[hsl(210,20%,80%)] hover:text-primary transition-colors">{f.kontakt}</a></li>
                <li>
                  <button onClick={onOpenFunnel} className="text-[hsl(210,20%,80%)] hover:text-primary transition-colors text-left">
                    {f.erstgespraech}
                  </button>
                </li>
              </ul>
            </div>

            {/* Rechtliches */}
            <div>
              <h4 className="text-xs uppercase tracking-[0.25em] text-[hsl(210,20%,55%)] mb-4">{f.rechtliches}</h4>
              <ul className="space-y-2.5 text-sm">
                <li><a href={mitSeitenSprache("/impressum", sprache)} className="text-[hsl(210,20%,80%)] hover:text-primary transition-colors">{f.impressum}</a></li>
                <li><a href={mitSeitenSprache("/datenschutz", sprache)} className="text-[hsl(210,20%,80%)] hover:text-primary transition-colors">{f.datenschutz}</a></li>
                <li><CookieEinstellungenLink sprache={sprache} className="text-sm text-[hsl(210,20%,80%)] hover:text-primary transition-colors" /></li>
              </ul>
            </div>
          </div>

          <PartnerPixelHinweis sprache={sprache} className="mt-10 text-[hsl(210,20%,65%)] max-w-3xl" />

          <div className="mt-12 md:mt-16 pt-6 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-xs text-[hsl(210,20%,55%)]">
              {f.rechte(new Date().getFullYear())}
            </p>
            <p className="text-xs text-[hsl(210,20%,45%)]">
              {f.gemacht}
            </p>
          </div>
        </div>
      </footer>
    </>
  );
};

export default CTASection;
