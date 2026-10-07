import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import AnsprechpartnerCard from "./AnsprechpartnerCard";
import type { BeraterProfile } from "@/lib/beraterProfil";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_ABSCHLUSS_TEXTE } from "./mikroseiteAbschlussTexte";

interface FAQSectionProps {
  onOpenFunnel: () => void;
  berater?: BeraterProfile;
}

const FAQSection = ({ onOpenFunnel, berater }: FAQSectionProps) => {
  // Reihenfolge bewusst: erst die echten Einwände aus dem Vertriebsalltag,
  // dann die organisatorischen Fragen. Ein vorweggenommener Einwand entkräftet
  // sich fast von selbst — unbeantwortet bleibt er im Kopf des Lesers.
  // Die Fragen stehen in `mikroseiteAbschlussTexte.ts`, in dieser Reihenfolge.
  const t = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE).fragen;

  return (
    <section className="py-16 md:py-28 lp-section-alt">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
          {/* Linke Spalte, bleibt beim Lesen der Fragen im Blick */}
          <div className="lg:sticky lg:top-24">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-1 rounded-full bg-primary" />
                <div className="w-4 h-1 rounded-full bg-primary/40" />
              </div>
              <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-3">
                {t.oberzeile}
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] tracking-tight">
                {t.titel}
                <span className="lp-text-gradient">{t.titelAkzent}</span>
              </h2>
              <p className="mt-3 text-sm md:text-base text-[hsl(220,10%,46%)] leading-relaxed">
                {t.einleitung}
              </p>
            </div>
            <AnsprechpartnerCard berater={berater} onOpenFunnel={onOpenFunnel} kompakt />
          </div>

          {/* Rechte Spalte, die Fragen */}
          <div>
            <div className="mb-6 md:mb-8">
              <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-3">
                {t.fragenOberzeile}
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] tracking-tight">
                {t.fragenTitel}
                <span className="lp-text-gradient">{t.fragenTitelAkzent}</span>
              </h2>
            </div>

            <Accordion type="single" collapsible className="space-y-2 md:space-y-3">
              {t.liste.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="bg-white rounded-xl border border-[hsl(40,15%,88%)] px-4 md:px-6 shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)]"
                >
                  <AccordionTrigger className="font-semibold text-[hsl(30,8%,16%)] text-left py-4 md:py-5 hover:no-underline text-sm md:text-base">
                    {faq.frage}
                  </AccordionTrigger>
                  <AccordionContent className="text-[hsl(220,10%,46%)] leading-relaxed pb-4 md:pb-5 whitespace-pre-line text-sm md:text-base">
                    {faq.antwort}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
