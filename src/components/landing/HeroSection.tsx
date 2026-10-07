import { ArrowRight, CheckCircle2, MapPin } from "lucide-react";
import heroAsset from "@/assets/lp/hero-leipzig.jpg.asset.json";
import logo from "@/assets/moreimmo-logo.png";
import CountUp from "./CountUp";

interface HeroSectionProps {
  onOpenFunnel: () => void;
}

const HeroSection = ({ onOpenFunnel }: HeroSectionProps) => {
  const bullets = [
    'Geprüfte Kapitalanlage-Immobilien in deutschen Top-Lagen',
    'Steueroptimierte Investmentkonzepte',
    'Strategischer Portfolio-Aufbau über 10 bis 15 Jahre',
    'Finanzierung & Umsetzung aus einer Hand',
  ];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pb-32">
      <div className="absolute inset-0">
        <img src={heroAsset.url} alt="Sanierter Altbau in München" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-black/25" />
        {/* Soft fade to next section */}
        <div className="absolute bottom-0 left-0 right-0 h-48 md:h-64 bg-gradient-to-b from-transparent to-[hsl(40,30%,99%)] z-10" />
      </div>

      <div className="absolute bottom-52 md:bottom-72 left-6 z-20 hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/25 text-white text-sm shadow-lg">
        <MapPin className="w-3.5 h-3.5" />
        <span>München</span>
        <span className="opacity-50">·</span>
        <span>Sanierter Bestand</span>
      </div>

      <div className="absolute top-4 md:top-6 left-1/2 -translate-x-1/2 z-20">
        <img src={logo} alt="OS Immobilien" className="h-8 md:h-14 brightness-0 invert" />
      </div>

      <div className="relative z-10 container mx-auto px-4 md:px-6 text-center max-w-4xl" style={{ textShadow: "0 2px 24px rgba(0,0,0,0.85)" }}>
        <div className="mt-20 md:mt-24" />

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight mb-4 md:mb-6 text-white">
          Aus Steuerlast wird{" "}
          <span className="lp-text-gradient" style={{ textShadow: "none" }}>nachhaltiges Immobilienvermögen</span>.
        </h1>

        <p className="text-base md:text-xl text-white font-light max-w-2xl mx-auto mb-4 leading-relaxed">
          Für Unternehmer, Spezialisten, Führungskräfte und Angestellte. Schritt für Schritt zu einem renditestarken Immobilienportfolio.
        </p>

        <p className="text-sm md:text-base text-white/70 max-w-2xl mx-auto mb-8">
          Geprüfte Objekte, steueroptimierte Konzepte und Finanzierung aus einer Hand.
        </p>

        <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 max-w-2xl mx-auto text-left mb-8">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <span className="text-sm text-white/80">{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
          <button
            onClick={onOpenFunnel}
            className="inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3.5 md:py-4 rounded-lg font-normal text-base md:text-lg transition-all duration-300 bg-[hsl(30,6%,19%)] text-[hsl(40,20%,98%)] hover:opacity-90 hover:scale-105"
          >
            Jetzt unverbindliches Erstgespräch sichern
            <ArrowRight className="w-5 h-5" />
          </button>
          <a
            href="#vorteile"
            className="inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3.5 md:py-4 rounded-lg font-semibold text-base md:text-lg border border-white/40 text-white hover:bg-white/10 transition-all duration-300 backdrop-blur-sm"
          >
            Mehr über unseren Ansatz
          </a>
        </div>

        <div className="mt-10 md:mt-14 flex flex-wrap justify-center gap-6 md:gap-8 text-white/85 text-sm">
          <span>✔ 350+ betreute Investoren</span>
          <span>✔ 450+ vermittelte Einheiten</span>
          <span>✔ 700+ Bankpartner</span>
          <span>✔ 20+ Berater & Mitarbeiter</span>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
