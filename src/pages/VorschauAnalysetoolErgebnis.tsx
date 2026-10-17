import { useMemo } from "react";
import ResultsPage from "@/components/analysis/ResultsPage";
import { SeitenSpracheProvider, SeitenSprachUmschalter } from "@/components/SeitenSprache";
import { calculateScore, zieleAusSchwerpunkt, type AnalysisData } from "@/lib/scoringEngine";
import type { BeraterInfo } from "@/pages/AnalysePublic";

/*
 * Lokale Vorschau der Analysetool-Ergebnisseite (17.10.2026):
 * /vorschau/analysetool-ergebnis. Nur im Entwicklungsmodus (siehe
 * vorschauRouten.ts), ohne Anmeldung und ohne Datenbank, mit erfundenem
 * Beispielkunden. Das Formular unten ist aus (`bereitsEingetragen`), damit aus
 * der Vorschau kein Lead in der echten Datenbank landet. `?lang=en` zeigt
 * die englische Fassung.
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
  const ergebnis = useMemo(() => calculateScore(BEISPIEL_KUNDE), []);
  return (
    <SeitenSpracheProvider>
      <div data-lg="seite" className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 pt-4 flex justify-end">
          <SeitenSprachUmschalter />
        </div>
        <ResultsPage
          result={ergebnis}
          data={BEISPIEL_KUNDE}
          berater={BEISPIEL_PARTNER}
          bereitsEingetragen
          mitLogo
          onRestart={() => window.alert("Vorschau: Neustart ist hier aus.")}
        />
      </div>
    </SeitenSpracheProvider>
  );
}
