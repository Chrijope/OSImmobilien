import AppleHeroSection from "@/components/landing/apple/AppleHeroSection";
import AppleBentoSection from "@/components/landing/apple/AppleBentoSection";
import AppleSteuerRechner from "@/components/landing/apple/AppleSteuerRechner";
import SteuerlastSection from "@/components/landing/SteuerlastSection";
import InvestmentweltenSection from "@/components/landing/InvestmentweltenSection";
import NeubauBeispielSection from "@/components/landing/NeubauBeispielSection";
import InvestorBenefitsSection from "@/components/landing/InvestorBenefitsSection";
import TaxSection from "@/components/landing/TaxSection";
import BeforeAfterSection from "@/components/landing/BeforeAfterSection";
import CompanySection from "@/components/landing/CompanySection";
import ProcessSection from "@/components/landing/ProcessSection";
import ComparisonSection from "@/components/landing/ComparisonSection";
import SocialProofSection from "@/components/landing/SocialProofSection";
import BankPartnersSection from "@/components/landing/BankPartnersSection";
import FAQSection from "@/components/landing/FAQSection";
import CTASection from "@/components/landing/CTASection";
import logo from "@/assets/moreimmo-logo.png";
import { SeitenSprachUmschalter } from "@/components/SeitenSprache";
import type { BeraterInfo } from "./FloatingBeraterBadge";
import "./beraterMicroseite.css";
// Liquid Glass fuer die Mikroseite. Muss nach der Datei darueber stehen, die sie ueberstimmt.
import "./beraterMicroseiteLiquid.css";

interface Props { berater: BeraterInfo | null; onOpenFunnel: () => void; }

/** Gemeinsame Darstellung für öffentliche Microseite und persönliche Vorschau. */
export default function BeraterMicrositeContent({ berater, onOpenFunnel }: Props) {
  return <div className="berater-mikroseite">
    {/* Der Umschalter DE/EN sitzt rechts neben dem Logo. Ohne SeitenSpracheProvider zeigt er nichts. */}
    <header className="brand-header"><img src={logo} alt="MOREImmo" width="172" height="34" /><SeitenSprachUmschalter className="brand-header-sprache" /></header>
    <div className="micro-abschnitt micro-abschnitt-1">{berater && <AppleHeroSection berater={berater} onOpenFunnel={onOpenFunnel} />}</div>
    <div className="micro-abschnitt micro-abschnitt-2"><SteuerlastSection onOpenFunnel={onOpenFunnel} /></div>
    <div className="micro-abschnitt micro-abschnitt-3"><AppleSteuerRechner onOpenFunnel={onOpenFunnel} /></div>
    <div className="micro-abschnitt micro-abschnitt-4"><InvestmentweltenSection /></div>
    <div className="micro-abschnitt micro-abschnitt-5"><TaxSection onOpenFunnel={onOpenFunnel} /></div>
    <div className="micro-abschnitt micro-abschnitt-6"><NeubauBeispielSection onOpenFunnel={onOpenFunnel} /></div>
    <div className="micro-abschnitt micro-abschnitt-7"><InvestorBenefitsSection /></div>
    <div className="micro-abschnitt micro-abschnitt-8"><AppleBentoSection /></div>
    <div className="micro-abschnitt micro-abschnitt-9"><CompanySection /></div>
    <div className="micro-abschnitt micro-abschnitt-10"><BeforeAfterSection /></div>
    <div className="micro-abschnitt micro-abschnitt-11"><SocialProofSection onOpenFunnel={onOpenFunnel} /></div>
    <div className="micro-abschnitt micro-abschnitt-12"><ProcessSection onOpenFunnel={onOpenFunnel} /></div>
    <div className="micro-abschnitt micro-abschnitt-13"><ComparisonSection /></div>
    <div className="micro-abschnitt micro-abschnitt-14"><BankPartnersSection /></div>
    <div className="micro-abschnitt micro-abschnitt-15"><FAQSection onOpenFunnel={onOpenFunnel} berater={berater ?? undefined} /></div>
    <div className="micro-abschnitt micro-abschnitt-16"><CTASection onOpenFunnel={onOpenFunnel} berater={berater ?? undefined} /></div>
  </div>;
}
