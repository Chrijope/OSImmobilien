import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import ResultsPage from "@/components/analysis/ResultsPage";
import AnalysisWizard from "@/components/analysis/AnalysisWizard";
import { SeitenSpracheProvider, SeitenSprachUmschalter } from "@/components/SeitenSprache";
import { calculateScore, zieleAusSchwerpunkt, type AnalysisData } from "@/lib/scoringEngine";
import type { BeraterInfo } from "@/pages/AnalysePublic";

/*
 * Lokale Vorschau der Analysetool-Ergebnisseite (17.10.2026):
 * /vorschau/analysetool-ergebnis. Nur im Entwicklungsmodus (siehe
 * vorschauRouten.ts), ohne Anmeldung und ohne Datenbank, mit erfundenem
 * Beispielkunden. Startet mit dem Fragebogen wie im internen Analysetool
 * (ohne Eintragung vor dem Ergebnis), `?direkt` zeigt sofort das Ergebnis des
 * Beispielkunden. `?lang=en` zeigt die englische Fassung. Ohne `.env` erreicht
 * die Vorschau keine Datenbank, ein Lead kann also nicht entstehen.
 */
const BEISPIEL_KUNDE: AnalysisData = {
  age: 35,
  // Nicht mehr abgefragt, leer wie aus dem neuen Fragebogen.
  familyStatus: "",
  householdSize: 1,
  dependents: 0,
  livingSituation: "",
  profession: "angestellt",
  employmentType: "unbefristet",
  employmentDuration: 5,
  netIncome: 3400,
  additionalIncome: 0,
  savingsRate: 0,
  equity: 25000,
  liquidityReserve: 10000,
  existingLoans: 0,
  monthlyFixedCosts: 1500,
  existingProperties: 0,
  investmentExperience: "" as AnalysisData["investmentExperience"],
  realEstateExperience: "" as AnalysisData["realEstateExperience"],
  incomeClass: "50k_80k",
  financingWillingness: "ja",
  schwerpunkt: "beides",
  ...zieleAusSchwerpunkt("beides"),
  wunschZusatzrente: 2000,
};

const BEISPIEL_PARTNER: BeraterInfo = {
  name: "Alex Beispiel",
  position: "Immobilienberater",
  telefon: "+49 30 1234567",
  email: "alex.beispiel@example.com",
};

export default function VorschauAnalysetoolErgebnis() {
  const direkt = useSearchParams()[0].has("direkt");
  const ergebnis = useMemo(() => calculateScore(BEISPIEL_KUNDE), []);
  return (
    <SeitenSpracheProvider>
      <div data-lg="seite" className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 pt-4 flex justify-end">
          <SeitenSprachUmschalter />
        </div>
        {direkt ? (
          <ResultsPage
            result={ergebnis}
            data={BEISPIEL_KUNDE}
            berater={BEISPIEL_PARTNER}
            bereitsEingetragen
            mitLogo
            onRestart={() => window.alert("Vorschau: Neustart ist hier aus.")}
          />
        ) : (
          <AnalysisWizard berater={BEISPIEL_PARTNER} />
        )}
      </div>
    </SeitenSpracheProvider>
  );
}
