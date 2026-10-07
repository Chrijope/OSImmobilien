import kfwLogo from "@/assets/lp/logos/kfw.png";
import ingLogo from "@/assets/lp/logos/ing-g.png";
import commerzLogo from "@/assets/lp/logos/commerzbank.png";
import sparkasseLogo from "@/assets/lp/logos/sparkasse-g.png";
import deutscheBankLogo from "@/assets/lp/logos/deutsche-bank-g.png";
import volksbankenLogo from "@/assets/lp/logos/volksbanken.png";
import wuestenrotLogo from "@/assets/lp/logos/wuestenrot.png";
import hvbLogo from "@/assets/lp/logos/hypovereinsbank.png";
import dslBankLogo from "@/assets/lp/logos/dsl-bank.png";
import dkbLogo from "@/assets/lp/logos/dkb.png";
import psdBankLogo from "@/assets/lp/logos/psd-bank.png";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_ABSCHLUSS_TEXTE } from "./mikroseiteAbschlussTexte";

const banks = [
  { name: "KfW", logo: kfwLogo },
  { name: "ING", logo: ingLogo },
  { name: "Wüstenrot", logo: wuestenrotLogo },
  { name: "Commerzbank", logo: commerzLogo },
  { name: "Sparkasse", logo: sparkasseLogo },
  { name: "Volksbanken", logo: volksbankenLogo },
  { name: "Deutsche Bank", logo: deutscheBankLogo },
  { name: "HypoVereinsbank", logo: hvbLogo },
  { name: "Interhyp", logo: null },
  { name: "DSL Bank", logo: dslBankLogo },
  { name: "DKB", logo: dkbLogo },
  { name: "PSD Bank", logo: psdBankLogo },
];

const BankPartnersSection = () => {
  const t = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE).banken;
  return (
    <section className="py-12 md:py-20 lp-section-light">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-8 h-1 rounded-full bg-primary" />
          <div className="w-4 h-1 rounded-full bg-primary/40" />
        </div>
        <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-4">{t.oberzeile}</span>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-8 md:mb-10 tracking-tight">
          {t.titel}<span className="lp-text-gradient">{t.titelAkzent}</span>
        </h2>

        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5 lg:gap-6">
          {banks.map((bank) => (
            <div key={bank.name} className="px-4 md:px-6 py-3 md:py-4 rounded-lg bg-white border border-[hsl(40,15%,88%)] shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)] hover:shadow-[0_12px_40px_-8px_hsla(220,20%,14%,0.12)] transition-shadow duration-300 flex items-center justify-center gap-2 md:gap-3">
              {bank.logo ? (
                <img src={bank.logo} alt={t.logo(bank.name)} loading="lazy" className="w-6 h-6 md:w-8 md:h-8 object-contain" />
              ) : null}
              <span className="font-semibold text-xs md:text-sm lg:text-base text-[hsl(30,8%,16%)]">{bank.name}</span>
            </div>
          ))}
        </div>

        <p className="text-xs md:text-sm text-[hsl(220,10%,46%)] mt-6 md:mt-8">
          {t.weitere}
        </p>
      </div>
    </section>
  );
};

export default BankPartnersSection;
