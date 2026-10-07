import { SOLLZINS, TILGUNG_ANFANG } from "@/lib/finanzierung";
/**
 * Annahmen der Zehnjahresprojektion an einer Stelle.
 *
 * Sie standen vorher als nackte Zahlen im Rechenweg. Jede davon bewegt das
 * Ergebnis erheblich, deshalb sind sie hier benannt und werden auf der
 * Ergebnisseite auch ausgewiesen.
 */
export const ANNAHMEN = {
  /** Kaufnebenkosten in Prozent vom Kaufpreis: Grunderwerbsteuer, Notar, Grundbuch. */
  kaufnebenkostenProzent: 8,
  /** Jährliche Wertsteigerung. */
  wertsteigerungProzent: 2,
  /** Bruttomietrendite bezogen auf den Kaufpreis. */
  mietrenditeProzent: 3.5,
  /** Gebäudeanteil am Kaufpreis, nur dieser Teil ist abschreibbar. */
  gebaeudeanteilProzent: 80,
  /** Gesetzlicher linearer AfA-Satz nach § 7 Abs. 4 EStG. */
  afaSatzProzent: 2,
  /** Erhöhter Satz, nur mit objektbezogenem Restnutzungsdauergutachten. */
  afaSatzMitGutachtenProzent: 4,
  /** Verkaufsnebenkosten beim Vergleich nach zehn Jahren. */
  verkaufskostenProzent: 4,
  /** Vergleichszins Sparbuch. */
  sparbuchZinsProzent: 1.5,
} as const;

export interface ProjektionsOptionen {
  /** Linearer AfA-Satz in Prozent. Vorgabe ist der gesetzliche Satz. */
  afaSatzProzent?: number;
}

export interface AnalysisData {
  age: number;
  familyStatus: string;
  householdSize: number;
  dependents: number;
  livingSituation: string;
  profession: 'angestellt' | 'selbststaendig' | 'freiberufler' | 'beamter' | 'arbeitslos';
  employmentDuration?: number;
  employmentType?: 'unbefristet' | 'befristet';
  /** Nicht mehr abgefragt. Bleibt für gespeicherte ältere Analysen im Typ. */
  industry?: string;
  /**
   * Nicht mehr abgefragt: Die Einkommensklasse wird direkt gewählt, statt sie
   * aus einem zweiten Einkommensfeld abzuleiten. Bleibt für gespeicherte
   * ältere Analysen im Typ.
   */
  grossIncome?: number;
  selfEmployedYears?: number;
  selfEmployedAvgIncome?: number;
  incomeFluctuation?: 'gering' | 'mittel' | 'hoch';
  civilServantStatus?: 'probe' | 'lebenszeit';
  salaryGroup?: string;
  netIncome: number;
  additionalIncome: number;
  savingsRate: number;
  equity: number;
  liquidityReserve: number;
  existingLoans: number;
  monthlyFixedCosts: number;
  existingProperties: number;
  investmentExperience: 'keine' | 'wenig' | 'mittel' | 'viel';
  realEstateExperience: 'keine' | 'wenig' | 'mittel' | 'viel';
  goals: string[];
  incomeClass: 'unter_30k' | '30k_50k' | '50k_80k' | '80k_120k' | 'ueber_120k';
  taxOptimizationInterest: boolean;
  financingWillingness: 'ja' | 'teilweise' | 'nein';
  /** Bundesland-Kürzel für die Kaufnebenkosten, siehe grunderwerbsteuer.ts. */
  bundeslandId?: string;
}

export interface ScoreResult {
  totalScore: number;
  category: 'sehr_gut' | 'gut' | 'grundsaetzlich' | 'eingeschraenkt' | 'nicht_geeignet';
  categoryLabel: string;
  categoryDescription: string;
  strengths: string[];
  challenges: string[];
  recommendedAssets: AssetRecommendation[];
  financingEstimate: FinancingEstimate;
  taxHints: string[];
  risks: string[];
  leadQuality: 'A' | 'B' | 'C' | 'D';
  detailedScores: DetailedScores;
  projection: TenYearProjection;
  ampel: AmpelResult;
  hebelEffekt: HebelEffekt;
  ekHinweis: EigenkapitalHinweis;
  goalInsights: GoalInsight[];
  bonitaetsVerbesserung: BonitaetsVerbesserung;
}

export interface DetailedScores {
  income: number;
  stability: number;
  equity: number;
  cashflow: number;
  creditworthiness: number;
  goalAlignment: number;
  taxBenefit: number;
}

export interface AssetRecommendation {
  name: string;
  description: string;
  suitability: 'hoch' | 'mittel' | 'gering';
  reason: string;
}

export interface FinancingEstimate {
  maxVolume: number;
  maxVolumeFormatted: string;
  equityNeeded: number;
  equityNeededFormatted: string;
  monthlyRate: number;
  monthlyRateFormatted: string;
  financingType: string;
}

export interface TenYearProjection {
  purchasePrice: number;
  equityInvested: number;
  loanAmount: number;
  interestRate: number;
  repaymentRate: number;
  monthlyRate: number;
  totalPaidOver10Years: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
  remainingLoan: number;
  estimatedValueAfter10Years: number;
  appreciationRate: number;
  totalRentIncome: number;
  monthlyRent: number;
  taxSavingsTotal: number;
  netProfit: number;
  returnOnEquity: number;
  yearlyData: YearlyProjectionData[];
  /** Realistische monatliche Netto-Zuzahlung (Rate − Miete − Steuervorteil/Monat). */
  monthlyZuzahlung: number;
  /** Brutto-Zuzahlung ohne Steuervorteil (Rate − Miete) – nur für Vergleich. */
  monthlyZuzahlungOhneSteuer: number;
  /** Monatlicher Steuervorteil (Ø über 10 Jahre). */
  monthlySteuervorteil: number;
  /** Vermögen nach 10 Jahren NETTO (Verkaufserlös − Restschuld − Verkaufskosten). Einheitlich. */
  wealthAfter10Years: number;
  /** Kaufnebenkosten in Euro. Gehören zur Investition und werden mitfinanziert. */
  kaufnebenkosten: number;
  /** Kaufpreis plus Kaufnebenkosten. */
  gesamtinvestition: number;
  /** Eigenkapital plus alle Zuzahlungen über zehn Jahre. */
  eingesetztesKapital: number;
  /** Angesetzter linearer AfA-Satz in Prozent. */
  afaSatzProzent: number;
  /** Aufschlüsselung der Vermögenszahl für Tooltip/Transparenz. */
  wealthBreakdown: {
    propertyValue: number;
    remainingLoan: number;
    sellingCosts: number;
    net: number;
  };
  /** Sparbuch-Vergleich: was passiert, wenn die Zuzahlung stattdessen aufs Sparbuch fließt? */
  sparbuchVergleich: {
    monatlicheSparrate: number;
    endkapitalSparbuch: number;
    endkapitalImmobilie: number;
    differenz: number;
    faktor: number;
  };
  /** Worst-Case: 2 Monate Mietausfall pro Jahr. */
  worstCase: {
    annahme: string;
    wealthAfter10Years: number;
    immerNochPositiv: boolean;
  };
  /** 3 Szenarien für interaktiven Slider. */
  scenarios: {
    pessimistisch: { wealthAfter10Years: number; appreciationRate: number; rentGrowth: number };
    realistisch: { wealthAfter10Years: number; appreciationRate: number; rentGrowth: number };
    optimistisch: { wealthAfter10Years: number; appreciationRate: number; rentGrowth: number };
  };
}

export interface YearlyProjectionData {
  year: number;
  propertyValue: number;
  remainingLoan: number;
  equityBuildup: number;
  cumulativeRent: number;
  cumulativeTaxSavings: number;
  /** Nettovermögen: Immobilienwert minus Restschuld. */
  totalWealth: number;
  /** Eigenkapital plus alle Zuzahlungen bis einschließlich dieses Jahres. */
  eingesetztesKapital: number;
}

export interface AmpelResult {
  overall: 'gruen' | 'orange' | 'rot';
  items: AmpelItem[];
}

export interface AmpelItem {
  label: string;
  status: 'gruen' | 'orange' | 'rot';
  detail: string;
}

export interface HebelEffekt {
  fremdkapital: number;
  eigenkapital: number;
  hebelFaktor: number;
  renditeOhneHebel: number;
  renditeMitHebel: number;
  vermoegenswert10Jahre: number;
  beschreibung: string;
}

export interface EigenkapitalHinweis {
  empfohlenMitEK: boolean;
  empfohlenerEKBetrag: number;
  ohneEKMoeglich: boolean;
  zinsaufschlagOhneEK: number;
  tilgungOhneEK: number;
  zinsMitEK: number;
  tilgungMitEK: number;
  hinweisText: string;
  altershinweis: string | null;
}

export interface GoalInsight {
  goal: string;
  label: string;
  icon: string;
  description: string;
  wieErreicht: string;
}

export interface BonitaetsVerbesserung {
  aktuelleBonitaet: string;
  nachInvestment: string;
  verbesserungPunkte: string[];
  bankSicht: string;
}

// ── Scoring Functions ──

function scoreIncome(data: AnalysisData): number {
  const totalIncome = data.netIncome + data.additionalIncome;
  if (totalIncome >= 6000) return 25;
  if (totalIncome >= 4500) return 20;
  if (totalIncome >= 3500) return 15;
  if (totalIncome >= 2500) return 10;
  if (totalIncome >= 2000) return 5;
  return 2;
}

function scoreStability(data: AnalysisData): number {
  let score = 0;
  switch (data.profession) {
    case 'beamter':
      score = data.civilServantStatus === 'lebenszeit' ? 25 : 18;
      break;
    case 'angestellt':
      score = data.employmentType === 'unbefristet' ? 20 : 10;
      if ((data.employmentDuration ?? 0) >= 3) score += 3;
      if ((data.employmentDuration ?? 0) >= 5) score += 2;
      break;
    case 'selbststaendig':
    case 'freiberufler':
      score = (data.selfEmployedYears ?? 0) >= 3 ? 15 : 8;
      if (data.incomeFluctuation === 'gering') score += 5;
      else if (data.incomeFluctuation === 'mittel') score += 2;
      break;
    case 'arbeitslos':
      score = 0;
      break;
  }
  return Math.min(score, 25);
}

function scoreEquity(data: AnalysisData): number {
  if (data.equity >= 100000) return 20;
  if (data.equity >= 50000) return 15;
  if (data.equity >= 30000) return 12;
  if (data.equity >= 15000) return 8;
  if (data.equity >= 5000) return 4;
  return 1;
}

function scoreCashflow(data: AnalysisData): number {
  const freeCashflow = data.netIncome + data.additionalIncome - data.monthlyFixedCosts - data.existingLoans;
  const ratio = freeCashflow / (data.netIncome + data.additionalIncome || 1);
  if (ratio >= 0.4) return 15;
  if (ratio >= 0.3) return 12;
  if (ratio >= 0.2) return 8;
  if (ratio >= 0.1) return 4;
  return 1;
}

function scoreCreditworthiness(data: AnalysisData): number {
  let score = 0;
  const debtRatio = data.existingLoans / (data.netIncome || 1);
  if (debtRatio < 0.1) score += 5;
  else if (debtRatio < 0.25) score += 3;
  if (data.liquidityReserve >= data.monthlyFixedCosts * 6) score += 5;
  else if (data.liquidityReserve >= data.monthlyFixedCosts * 3) score += 3;
  if (data.savingsRate >= 500) score += 3;
  else if (data.savingsRate >= 200) score += 2;
  if (data.livingSituation === 'eigentum') score += 2;
  score += erfahrungsPunkte(data);
  // Der Deckel bleibt bei 15, damit die Schwellen der Kategorien unverändert
  // gelten. Erfahrung kann einen schwachen Punkt ausgleichen, aber nicht die
  // ganze Bewertung nach oben schieben.
  return Math.min(score, 15);
}

/**
 * Erfahrung mit Geldanlagen und mit Immobilien.
 *
 * Beide Angaben wurden bisher abgefragt und dann nie verwendet. Für die Bank
 * und fürs Erstgespräch sind sie aber aussagekräftig: Wer schon investiert
 * hat, weiß, worauf er sich einlässt, und bricht seltener mitten im Prozess
 * ab. Höchstens vier Punkte, damit eine ansonsten schwache Situation nicht
 * allein durch Vorerfahrung gut aussieht.
 */
function erfahrungsPunkte(data: AnalysisData): number {
  const stufe = (v?: string) => (v === 'viel' ? 2 : v === 'mittel' ? 1.5 : v === 'wenig' ? 0.5 : 0);
  return Math.round(stufe(data.investmentExperience) + stufe(data.realEstateExperience));
}

function getGoalAlignment(data: AnalysisData): number {
  if (data.goals.length >= 3) return 5;
  if (data.goals.length >= 1) return 3;
  return 1;
}

function getTaxBenefit(data: AnalysisData): number {
  let score = 0;
  if (['80k_120k', 'ueber_120k'].includes(data.incomeClass)) score += 5;
  else if (data.incomeClass === '50k_80k') score += 3;
  if (data.taxOptimizationInterest) score += 2;
  if (['selbststaendig', 'freiberufler'].includes(data.profession)) score += 2;
  return Math.min(score, 10);
}

function getFinancingEstimate(data: AnalysisData): FinancingEstimate {
  const totalIncome = data.netIncome + data.additionalIncome;
  const annualIncome = totalIncome * 12;
  let factor = 0;
  switch (data.profession) {
    case 'beamter': factor = data.civilServantStatus === 'lebenszeit' ? 12 : 10; break;
    case 'angestellt': factor = data.employmentType === 'unbefristet' ? 10 : 7; break;
    case 'selbststaendig':
    case 'freiberufler': factor = (data.selfEmployedYears ?? 0) >= 3 ? 8 : 5; break;
    default: factor = 0;
  }
  const maxVolume = Math.round(annualIncome * factor / 10000) * 10000;
  const equityNeeded = Math.round(maxVolume * 0.1 / 1000) * 1000;
  const monthlyRate = Math.round(maxVolume * 0.004);
  let financingType = 'Annuitätendarlehen';
  if (data.goals.includes('steuerersparnis')) financingType = 'Tilgungsaussetzungsdarlehen mit KLV/BSV';
  if (data.profession === 'beamter') financingType = 'Beamtendarlehen / Annuitätendarlehen';
  const fmt = (v: number) => v > 0 ? `${v.toLocaleString('de-DE')} €` : 'Nicht ermittelbar';
  return {
    maxVolume, maxVolumeFormatted: fmt(maxVolume),
    equityNeeded, equityNeededFormatted: fmt(equityNeeded),
    monthlyRate, monthlyRateFormatted: monthlyRate > 0 ? `${monthlyRate.toLocaleString('de-DE')} € / Monat` : 'Nicht ermittelbar',
    financingType,
  };
}

function getEigenkapitalHinweis(data: AnalysisData, financing: FinancingEstimate): EigenkapitalHinweis {
  const purchasePrice = financing.maxVolume;
  const kaufnebenkosten = Math.round(purchasePrice * (ANNAHMEN.kaufnebenkostenProzent / 100));
  const empfohlenMitEK = data.age > 40;
  const empfohlenerEKBetrag = empfohlenMitEK ? kaufnebenkosten : 0;

  /*
   * Zinssätze, Beispielwerte, die endgültigen Konditionen entscheidet die Bank.
   *
   * Sie haengen seit dem 17.09.2026 am zentralen Sollzins aus
   * `finanzierung.ts` und stehen nicht mehr als eigene Zahlen hier. Der
   * Abstand von 0,2 Punkten nach oben und unten bleibt, denn genau er ist die
   * Aussage dieser Stelle: Mit Eigenkapital wird es guenstiger, ohne teurer.
   * Der zentrale Satz ist die Mitte davon.
   */
  const ZINS_ABSTAND_EK = 0.002;
  const zinsMitEK = SOLLZINS - ZINS_ABSTAND_EK;
  const zinsOhneEK = SOLLZINS + ZINS_ABSTAND_EK;
  const tilgungMitEK = 0.02;
  const tilgungOhneEK = TILGUNG_ANFANG; // niedrigere Tilgung bei Vollfinanzierung

  let hinweisText = '';
  let altershinweis: string | null = null;

  if (data.equity === 0 || data.equity < kaufnebenkosten) {
    hinweisText = `Ein Investment ist auch ohne Eigenkapital möglich (100%-Finanzierung). Dabei können die Zinssätze um ca. ${((zinsOhneEK - zinsMitEK) * 100).toFixed(1)}% höher ausfallen und die anfängliche Tilgung wird häufig auf ${(tilgungOhneEK * 100).toFixed(1)}% angepasst. Die monatliche Rate kann dadurch etwas höher sein, wird aber durch Mieteinnahmen und Steuervorteile aufgefangen.`;
  } else {
    hinweisText = `Du verfügst über ${data.equity.toLocaleString('de-DE')} € Eigenkapital. Durch den Einsatz von Eigenkapital profitierst du von günstigeren Zinskonditionen (ca. ${(zinsMitEK * 100).toFixed(1)}% statt ${(zinsOhneEK * 100).toFixed(1)}%) und einer schnelleren Entschuldung.`;
  }

  if (data.age > 40) {
    altershinweis = `Ab 40 Jahren empfehlen die meisten Banken den Einsatz von Eigenkapital in Höhe der Kaufnebenkosten (ca. ${kaufnebenkosten.toLocaleString('de-DE')} €). Dies verbessert Deine Konditionen deutlich und erhöht die Finanzierungswahrscheinlichkeit.`;
  }

  return {
    empfohlenMitEK,
    empfohlenerEKBetrag,
    ohneEKMoeglich: true,
    zinsaufschlagOhneEK: zinsOhneEK - zinsMitEK,
    tilgungOhneEK,
    zinsMitEK,
    tilgungMitEK,
    hinweisText,
    altershinweis,
  };
}

function getHebelEffekt(data: AnalysisData, projection: TenYearProjection): HebelEffekt {
  const eigenkapital = projection.equityInvested > 0 ? projection.equityInvested : 1; // avoid div by 0
  const fremdkapital = projection.loanAmount;
  // WICHTIG: Wir verwenden hier EINHEITLICH die NETTO-Vermögenszahl
  // (steuerfrei realisierbar nach §23 EStG = Wert − Restschuld − Verkaufskosten),
  // damit die gleiche Zahl wie überall sonst im Ergebnis erscheint.
  const hebelFaktor = Math.round((projection.purchasePrice / Math.max(eigenkapital, 1)) * 10) / 10;

  // Rendite ohne Hebel (wenn alles EK wäre)
  const wertsteigerung10J = projection.estimatedValueAfter10Years - projection.purchasePrice;
  const renditeOhneHebel = Math.round((wertsteigerung10J / projection.purchasePrice) * 100);

  // Rendite mit Hebel (bezogen auf eingesetztes EK)
  const renditeMitHebel = projection.returnOnEquity;

  const vermoegenswert = projection.wealthAfter10Years;

  let beschreibung = '';
  if (projection.equityInvested <= 0) {
    beschreibung = `Du nutzt den vollen Fremdkapitalhebel: Die Bank finanziert ${fremdkapital.toLocaleString('de-DE')} €. Die Miete trägt einen großen Teil der Rate, die steuerliche Wirkung entlastet zusätzlich. Nach zehn Jahren stünde bei diesen Annahmen ein Vermögen von ${vermoegenswert.toLocaleString('de-DE')} € zur Verfügung, ohne Eigenkapital beim Kauf. Die monatliche Zuzahlung bleibt.`;
  } else {
    beschreibung = `Mit ${eigenkapital.toLocaleString('de-DE')} € eigenem Einsatz hältst Du eine Immobilie im Wert von ${projection.purchasePrice.toLocaleString('de-DE')} €. Das ist ein Hebel von ${hebelFaktor}x. Miete und steuerliche Wirkung tragen den Großteil der Rate. Nach zehn Jahren wären es bei diesen Annahmen ${vermoegenswert.toLocaleString('de-DE')} € Vermögen.`;
  }

  return {
    fremdkapital,
    eigenkapital: projection.equityInvested,
    hebelFaktor,
    renditeOhneHebel,
    renditeMitHebel,
    vermoegenswert10Jahre: vermoegenswert,
    beschreibung,
  };
}

function getGoalInsights(data: AnalysisData, projection: TenYearProjection): GoalInsight[] {
  const insights: GoalInsight[] = [];

  if (data.goals.includes('vermoegensaufbau')) {
    insights.push({
      goal: 'vermoegensaufbau',
      label: 'Vermögensaufbau',
      icon: '📈',
      description: `In 10 Jahren baust du ein Immobilienvermögen von ca. ${projection.estimatedValueAfter10Years.toLocaleString('de-DE')} € auf.`,
      wieErreicht: 'Deine Mieter und das Finanzamt zahlen den Großteil – Du profitierst vom Wertzuwachs.',
    });
  }

  if (data.goals.includes('altersvorsorge')) {
    insights.push({
      goal: 'altersvorsorge',
      label: 'Altersvorsorge',
      icon: '🏖️',
      description: `Nach Volltilgung fließen die Mieteinnahmen direkt als passive Rente auf Dein Konto.`,
      wieErreicht: `Monatlich ${projection.monthlyRent.toLocaleString('de-DE')} € Mieteinnahmen – ohne Abzüge nach Tilgung. Das sind ${(projection.monthlyRent * 12).toLocaleString('de-DE')} € pro Jahr zusätzlich im Alter.`,
    });
  }

  if (data.goals.includes('steuerersparnis')) {
    insights.push({
      goal: 'steuerersparnis',
      label: 'Steuerersparnis',
      icon: '💰',
      description: `Geschätzte Steuervorteile über 10 Jahre: ${projection.taxSavingsTotal.toLocaleString('de-DE')} €`,
      wieErreicht: 'Durch AfA-Abschreibung, Zinsabzug und Werbungskosten reduzierst du Deine Steuerlast jedes Jahr.',
    });
  }

  if (data.goals.includes('passives_einkommen')) {
    insights.push({
      goal: 'passives_einkommen',
      label: 'Passives Einkommen',
      icon: '🔄',
      description: `${projection.monthlyRent.toLocaleString('de-DE')} € monatliche Mieteinnahmen decken einen Großteil der Finanzierungskosten.`,
      wieErreicht: 'Die Immobilie arbeitet für Dich: Die Miete trägt einen großen Teil der Rate, Du baust Vermögen auf.',
    });
  }

  if (data.goals.includes('inflationsschutz')) {
    insights.push({
      goal: 'inflationsschutz',
      label: 'Inflationsschutz',
      icon: '🛡️',
      description: 'Immobilien steigen historisch mit oder über der Inflation im Wert.',
      wieErreicht: 'Während Dein Darlehen nominal gleich bleibt, steigt der Immobilienwert mit der Zeit. Die Inflation entwertet die Schuld, nicht den Sachwert.',
    });
  }

  if (data.goals.includes('diversifikation')) {
    insights.push({
      goal: 'diversifikation',
      label: 'Diversifikation',
      icon: '🎯',
      description: 'Immobilien korrelieren wenig mit Aktien- oder Anleihemärkten.',
      wieErreicht: `${data.existingProperties > 0 ? `Mit bereits ${data.existingProperties} Immobilie(n) erweiterst du Dein Portfolio gezielt.` : 'Eine Immobilie als Kapitalanlage ergänzt Dein Portfolio ideal.'}`,
    });
  }

  return insights;
}

function getBonitaetsVerbesserung(data: AnalysisData, projection: TenYearProjection): BonitaetsVerbesserung {
  const verbesserungPunkte: string[] = [];

  verbesserungPunkte.push('Die Mieteinnahmen werden als zusätzliches Einkommen gewertet – Deine Haushaltsrechnung verbessert sich.');
  verbesserungPunkte.push('Der Immobilienwert steht als Sicherheit – das erhöht Deinen Beleihungswert für zukünftige Finanzierungen.');
  verbesserungPunkte.push('Regelmäßige Tilgung baut Eigenkapital auf und stärkt Dein Vermögensprofil bei der Bank.');

  if (projection.taxSavingsTotal > 0) {
    verbesserungPunkte.push('Steuerliche Vorteile erhöhen Dein verfügbares Nettoeinkommen.');
  }

  if (data.existingProperties === 0) {
    verbesserungPunkte.push('Als Erstinvestor zeigst du der Bank unternehmerisches Denken – das wirkt sich positiv auf Dein Profil aus.');
  } else {
    verbesserungPunkte.push(`Mit ${data.existingProperties} bestehenden Immobilie(n) hast Du bei der Bank bereits eine Vorgeschichte, auf die sie schauen kann.`);
  }

  const aktuelleBonitaet = data.existingLoans > data.netIncome * 0.3 ? 'Durchschnittlich' : data.netIncome >= 4000 ? 'Gut' : 'Solide';
  const nachInvestment = 'Verbessert';

  return {
    aktuelleBonitaet,
    nachInvestment,
    verbesserungPunkte,
    bankSicht: `Aus Sicht der Bank: Die Immobilie dient als Sicherheit, die Mieteinnahmen zählen als zusätzliche Einnahme. Dein Nettovermögen steigt mit jeder Tilgungsrate. Vereinfacht gesagt: Die Bank stellt das Darlehen, die Miete trägt einen großen Teil der Rate, die steuerliche Wirkung entlastet zusätzlich. Wer nach mehr als zehn Jahren verkauft, kann den Gewinn nach § 23 EStG steuerfrei vereinnahmen. Ob am Ende ein Gewinn steht, hängt von Lage, Objekt und Marktentwicklung ab.`,
  };
}

function getTenYearProjection(
  data: AnalysisData,
  financing: FinancingEstimate,
  optionen?: ProjektionsOptionen,
): TenYearProjection {
  const purchasePrice = financing.maxVolume > 0 ? financing.maxVolume : 0;
  // Die Kaufnebenkosten fehlten hier komplett. Sie sind aber Teil dessen, was
  // finanziert oder aus Eigenkapital bezahlt werden muss, sonst sieht der
  // Kapitaleinsatz zu klein und die Rendite zu groß aus.
  const kaufnebenkosten = Math.round(purchasePrice * (ANNAHMEN.kaufnebenkostenProzent / 100));
  const gesamtinvestition = purchasePrice + kaufnebenkosten;
  const equityInvested = Math.min(data.equity, gesamtinvestition * 0.2);
  const loanAmount = Math.max(0, gesamtinvestition - equityInvested);

  const hasEK = equityInvested >= gesamtinvestition * 0.08;
  const interestRate = hasEK ? 0.038 : 0.042;
  const repaymentRate = hasEK ? 0.02 : 0.015;
  const annuityRate = interestRate + repaymentRate;
  const monthlyRate = Math.round((loanAmount * annuityRate) / 12);
  const appreciationRate = ANNAHMEN.wertsteigerungProzent / 100;
  const annualRentYield = ANNAHMEN.mietrenditeProzent / 100;
  const monthlyRent = Math.round((purchasePrice * annualRentYield) / 12);

  let marginalTaxRate = 0.25;
  if (data.incomeClass === '50k_80k') marginalTaxRate = 0.35;
  if (data.incomeClass === '80k_120k') marginalTaxRate = 0.42;
  // 45 Prozent greifen erst ab rund 278.000 Euro zu versteuerndem Einkommen.
  // Für die Klasse "über 120.000" sind 42 Prozent die realistische Annahme.
  if (data.incomeClass === 'ueber_120k') marginalTaxRate = 0.42;

  // Der Gebäudeanteil trägt auch die anteiligen Nebenkosten.
  const buildingShare = gesamtinvestition * (ANNAHMEN.gebaeudeanteilProzent / 100);
  // Vorgabe ist der gesetzliche Satz nach § 7 Abs. 4 EStG. Ein höherer Satz
  // setzt ein objektbezogenes Restnutzungsdauergutachten voraus und wird
  // deshalb nur angesetzt, wenn er ausdrücklich gewählt wurde.
  const afaSatzProzent = optionen?.afaSatzProzent ?? ANNAHMEN.afaSatzProzent;
  const annualAfa = buildingShare * (afaSatzProzent / 100);

  const yearlyData: YearlyProjectionData[] = [];
  let remainingLoan = loanAmount;
  let cumulativeRent = 0;
  let cumulativeTaxSavings = 0;
  let totalInterestPaid = 0;
  let totalPrincipalPaid = 0;
  let cumulativeZuzahlung = 0;

  for (let year = 1; year <= 10; year++) {
    const interestThisYear = remainingLoan * interestRate;
    const annualPayment = monthlyRate * 12;
    const principalThisYear = Math.min(Math.max(annualPayment - interestThisYear, 0), remainingLoan);
    remainingLoan = Math.max(0, remainingLoan - principalThisYear);
    totalInterestPaid += interestThisYear;
    totalPrincipalPaid += principalThisYear;
    const rentThisYear = monthlyRent * 12;
    cumulativeRent += rentThisYear;
    const taxDeductible = interestThisYear + annualAfa;
    const netTaxBenefit = (taxDeductible - rentThisYear) * marginalTaxRate;
    const taxBenefitThisYear = Math.max(0, netTaxBenefit);
    cumulativeTaxSavings += taxBenefitThisYear;
    // Was in diesem Jahr wirklich aus eigener Tasche fließt.
    cumulativeZuzahlung += Math.max(0, annualPayment - rentThisYear - taxBenefitThisYear);
    const propertyValue = Math.round(purchasePrice * Math.pow(1 + appreciationRate, year));
    const equityBuildup = propertyValue - remainingLoan;
    yearlyData.push({
      year, propertyValue, remainingLoan: Math.round(remainingLoan),
      equityBuildup: Math.round(equityBuildup), cumulativeRent: Math.round(cumulativeRent),
      cumulativeTaxSavings: Math.round(cumulativeTaxSavings),
      // Nettovermögen ist Wert minus Restschuld. Die Miete durfte hier nicht
      // addiert werden: Sie bezahlt die Tilgung und steckt damit bereits im
      // Vermögenszuwachs. Vorher stand sie ein zweites Mal in der Summe.
      totalWealth: Math.round(equityBuildup),
      eingesetztesKapital: Math.round(equityInvested + cumulativeZuzahlung),
    });
  }

  const estimatedValueAfter10Years = Math.round(purchasePrice * Math.pow(1 + appreciationRate, 10));

  // ── Einheitliche Vermögenszahl: netto nach Verkauf ──
  const sellingCosts = Math.round(estimatedValueAfter10Years * (ANNAHMEN.verkaufskostenProzent / 100));
  const wealthAfter10Years = Math.max(0, estimatedValueAfter10Years - Math.round(remainingLoan) - sellingCosts);

  // Gewinn ist, was nach zehn Jahren übrig bleibt, abzüglich dessen, was
  // hineingesteckt wurde. Vorher wurde die Miete addiert, ohne die Raten
  // abzuziehen, was die Eigenkapitalrendite stark überzeichnet hat.
  const eingesetztesKapitalGesamt = equityInvested + cumulativeZuzahlung;
  const netProfit = Math.round(wealthAfter10Years - eingesetztesKapitalGesamt);
  const returnOnEquity =
    eingesetztesKapitalGesamt > 0 ? Math.round((netProfit / eingesetztesKapitalGesamt) * 100) : 0;

  // ── Netto-Zuzahlung: Rate minus Miete minus Steuervorteil pro Monat ──
  const monthlySteuervorteil = Math.round(cumulativeTaxSavings / 120);
  const monthlyZuzahlungOhneSteuer = Math.max(0, monthlyRate - monthlyRent);
  const monthlyZuzahlung = Math.max(0, monthlyRate - monthlyRent - monthlySteuervorteil);

  // ── Sparbuch-Vergleich: dieselbe monatliche Belastung zehn Jahre lang ──
  const sparbuchZins = ANNAHMEN.sparbuchZinsProzent / 100;
  const sparrate = monthlyZuzahlung > 0 ? monthlyZuzahlung : 100; // mind. 100 € als Vergleichsbasis
  const months = 120;
  const r = sparbuchZins / 12;
  const endkapitalSparbuch = Math.round(sparrate * ((Math.pow(1 + r, months) - 1) / r));
  const differenz = wealthAfter10Years - endkapitalSparbuch;
  const faktor = endkapitalSparbuch > 0 ? Math.round((wealthAfter10Years / endkapitalSparbuch) * 10) / 10 : 0;

  // ── Worst-Case: 2 Monate Mietausfall p. a. = ~17 % weniger Mieteinnahmen ──
  const ausfallReduktion = Math.round((cumulativeRent * 2) / 12);
  const worstCaseWealth = Math.max(0, wealthAfter10Years - ausfallReduktion);

  // ── Szenarien ──
  const scenarioWealth = (apprRate: number) => {
    const v = Math.round(purchasePrice * Math.pow(1 + apprRate, 10));
    const sc = Math.round(v * (ANNAHMEN.verkaufskostenProzent / 100));
    return Math.max(0, v - Math.round(remainingLoan) - sc);
  };

  return {
    purchasePrice, equityInvested: Math.round(equityInvested), loanAmount: Math.round(loanAmount),
    interestRate, repaymentRate, monthlyRate, totalPaidOver10Years: Math.round(monthlyRate * 120),
    totalInterestPaid: Math.round(totalInterestPaid), totalPrincipalPaid: Math.round(totalPrincipalPaid),
    remainingLoan: Math.round(remainingLoan), estimatedValueAfter10Years, appreciationRate,
    totalRentIncome: Math.round(cumulativeRent), monthlyRent, taxSavingsTotal: Math.round(cumulativeTaxSavings),
    netProfit: Math.round(netProfit), returnOnEquity, yearlyData,
    monthlyZuzahlung,
    monthlyZuzahlungOhneSteuer,
    monthlySteuervorteil,
    wealthAfter10Years,
    kaufnebenkosten,
    gesamtinvestition,
    eingesetztesKapital: Math.round(eingesetztesKapitalGesamt),
    afaSatzProzent,
    wealthBreakdown: {
      propertyValue: estimatedValueAfter10Years,
      remainingLoan: Math.round(remainingLoan),
      sellingCosts,
      net: wealthAfter10Years,
    },
    sparbuchVergleich: {
      monatlicheSparrate: sparrate,
      endkapitalSparbuch,
      endkapitalImmobilie: wealthAfter10Years,
      differenz,
      faktor,
    },
    worstCase: {
      annahme: '2 Monate Mietausfall pro Jahr',
      wealthAfter10Years: worstCaseWealth,
      immerNochPositiv: worstCaseWealth > 0,
    },
    scenarios: {
      pessimistisch: { wealthAfter10Years: scenarioWealth(0.01), appreciationRate: 0.01, rentGrowth: 0.01 },
      realistisch: { wealthAfter10Years: scenarioWealth(0.02), appreciationRate: 0.02, rentGrowth: 0.02 },
      optimistisch: { wealthAfter10Years: scenarioWealth(0.03), appreciationRate: 0.03, rentGrowth: 0.03 },
    },
  };
}

function getAmpelResult(data: AnalysisData, totalScore: number, financing: FinancingEstimate): AmpelResult {
  const items: AmpelItem[] = [];
  const totalIncome = data.netIncome + data.additionalIncome;
  const freeCashflow = totalIncome - data.monthlyFixedCosts - data.existingLoans;
  items.push({ label: 'Einkommen', status: totalIncome >= 3500 ? 'gruen' : totalIncome >= 2000 ? 'orange' : 'rot', detail: totalIncome >= 3500 ? 'Dein Einkommen bietet eine solide Basis' : totalIncome >= 2000 ? 'Einkommen ausreichend, aber begrenzt' : 'Einkommen für Immobilienfinanzierung zu niedrig' });
  const stab = data.profession === 'beamter' ? 'gruen' : data.profession === 'angestellt' && data.employmentType === 'unbefristet' ? 'gruen' : data.profession === 'angestellt' && data.employmentType === 'befristet' ? 'orange' : (data.selfEmployedYears ?? 0) >= 3 ? 'orange' : 'rot';
  items.push({ label: 'Berufliche Stabilität', status: stab as AmpelItem['status'], detail: stab === 'gruen' ? 'Stabile berufliche Situation – ideal für Finanzierung' : stab === 'orange' ? 'Prüfung durch Bank empfohlen' : 'Berufliche Situation muss stabilisiert werden' });
  const ekRatio = financing.maxVolume > 0 ? data.equity / financing.maxVolume : 0;
  items.push({ label: 'Eigenkapital', status: ekRatio >= 0.15 ? 'gruen' : ekRatio >= 0.08 ? 'orange' : data.age <= 40 ? 'orange' : 'rot', detail: ekRatio >= 0.15 ? 'Ausreichend Eigenkapital vorhanden' : ekRatio >= 0.08 ? 'Eigenkapital knapp – höhere Zinsen möglich' : data.age <= 40 ? '100%-Finanzierung möglich – Konditionen angepasst' : 'Eigenkapital für Kaufnebenkosten empfohlen (Alter > 40)' });
  const cfRatio = freeCashflow / (totalIncome || 1);
  items.push({ label: 'Monatlicher Cashflow', status: cfRatio >= 0.25 ? 'gruen' : cfRatio >= 0.1 ? 'orange' : 'rot', detail: cfRatio >= 0.25 ? 'Guter monatlicher Überschuss' : cfRatio >= 0.1 ? 'Cashflow ausreichend – Puffer begrenzt' : 'Monatlicher Spielraum zu gering' });
  const debtRatio = data.existingLoans / (totalIncome || 1);
  items.push({ label: 'Bonität', status: debtRatio < 0.15 ? 'gruen' : debtRatio < 0.3 ? 'orange' : 'rot', detail: debtRatio < 0.15 ? 'Niedrige bestehende Kreditbelastung' : debtRatio < 0.3 ? 'Bestehende Kredite – Bank prüft genauer' : 'Hohe Kreditbelastung – Finanzierung erschwert' });
  const monthsReserve = data.monthlyFixedCosts > 0 ? data.liquidityReserve / data.monthlyFixedCosts : 0;
  items.push({ label: 'Liquiditätsreserve', status: monthsReserve >= 6 ? 'gruen' : monthsReserve >= 3 ? 'orange' : 'rot', detail: monthsReserve >= 6 ? 'Solide Rücklage vorhanden' : monthsReserve >= 3 ? 'Reserve aufbauen empfohlen' : 'Rücklage dringend aufbauen' });
  items.push({ label: 'Steuerlicher Hebel', status: 'gruen', detail: 'Durch Eintragung des Freibetrags auf der Lohnsteuerkarte erhältst du sofort mehr Netto vom Brutto – steuerlicher Vorteil immer gegeben.' });
  const greenCount = items.filter(i => i.status === 'gruen').length;
  const redCount = items.filter(i => i.status === 'rot').length;
  const overall = redCount >= 3 ? 'rot' : greenCount >= 5 ? 'gruen' : 'orange';
  return { overall, items };
}

function getRecommendedAssets(data: AnalysisData, financing: FinancingEstimate): AssetRecommendation[] {
  const assets: AssetRecommendation[] = [];
  const totalIncome = data.netIncome + data.additionalIncome;
  const highIncome = totalIncome >= 5000;
  const medIncome = totalIncome >= 3000;
  const volume = financing.maxVolume;
  if (volume <= 150000) {
    assets.push({ name: 'Mikroapartment / Studentenwohnung', description: 'Kleine Einheiten in Hochschulstädten mit hoher Nachfrage', suitability: 'hoch', reason: 'Ideal bei Deinem Finanzierungsrahmen – niedrige Einstiegshürde, stabile Nachfrage' });
  }
  if (volume > 100000 && volume <= 300000) {
    assets.push({ name: 'Klassische Bestandswohnung', description: 'Gut vermietete Wohnungen in B- und C-Lagen', suitability: medIncome ? 'hoch' : 'mittel', reason: 'Solide Mietrendite, sofortige Einnahmen, günstiger Einstieg' });
  }
  if (volume > 200000) {
    assets.push({ name: 'Neubauwohnung', description: 'Moderne Wohnungen mit hoher Energieeffizienz', suitability: highIncome ? 'hoch' : 'mittel', reason: 'Hohe AfA-Sätze, geringe Instandhaltung, attraktive Vermietbarkeit' });
  }
  if (data.goals.includes('steuerersparnis') && ['80k_120k', 'ueber_120k'].includes(data.incomeClass)) {
    assets.push({ name: 'Denkmalimmobilie', description: 'Sanierte Denkmalimmobilien mit erhöhter Abschreibung (§7i/§7h EStG)', suitability: 'hoch', reason: 'Maximale Steuervorteile – bis zu 9% AfA p.a. in den ersten 8 Jahren' });
  }
  if (data.goals.includes('altersvorsorge')) {
    assets.push({ name: 'Pflegeimmobilie', description: 'Pflegeapartments mit langfristigen Betreiberverträgen (20+ Jahre)', suitability: 'mittel', reason: 'Demografischer Trend, gesicherte Mieteinnahmen, geringer Verwaltungsaufwand' });
  }
  if (assets.length === 0) {
    assets.push({ name: 'Klassische Wohnimmobilie', description: 'Bestandswohnungen in guten Lagen mit stabiler Vermietung', suitability: 'mittel', reason: 'Solide Basis für den Einstieg in Immobilieninvestments' });
  }
  return assets.slice(0, 4);
}

function getTaxHints(data: AnalysisData): string[] {
  const hints: string[] = [];
  if (['80k_120k', 'ueber_120k'].includes(data.incomeClass)) {
    hints.push('Bei Deinem Einkommensniveau wirkt die Abschreibung besonders stark. Der lineare Satz liegt je nach Fertigstellung bei 2, 2,5 oder 3 Prozent pro Jahr.');
  }
  if (data.incomeClass === '50k_80k') {
    hints.push('Auch in Deiner Einkommensklasse profitierst du von steuerlichen Abschreibungen bei Immobilien.');
  }
  if (['selbststaendig', 'freiberufler'].includes(data.profession)) {
    hints.push('Als Selbstständige(r) kannst du ggf. zusätzliche Abzugsmöglichkeiten bei gewerblichen Immobilien nutzen.');
  }
  if (data.goals.includes('steuerersparnis')) {
    hints.push('Denkmalimmobilien bieten mit §7i/§7h EStG besonders hohe Abschreibungsmöglichkeiten.');
  }
  hints.push('Wird eine Immobilie im Privatvermögen erst nach mehr als zehn Jahren verkauft, bleibt ein Veräußerungsgewinn nach § 23 EStG steuerfrei.');
  hints.push('Hinweis: Die steuerlichen Angaben dienen nur der Orientierung. Eine individuelle Beratung durch einen Steuerberater ist empfehlenswert.');
  return hints;
}

function getRisks(data: AnalysisData): string[] {
  const risks: string[] = [];
  if (data.equity < 10000) risks.push('Geringes Eigenkapital kann zu höheren Finanzierungskosten führen.');
  if (data.existingLoans > data.netIncome * 0.3) risks.push('Bestehende Kreditbelastung ist relativ hoch.');
  if (data.liquidityReserve < data.monthlyFixedCosts * 3) risks.push('Die Liquiditätsreserve sollte mindestens 3 Netto-Monatsgehälter betragen.');
  if (data.profession === 'selbststaendig' && data.incomeFluctuation === 'hoch') risks.push('Stark schwankendes Einkommen kann die Bankenbewertung erschweren.');
  if (data.profession === 'angestellt' && data.employmentType === 'befristet') risks.push('Ein befristetes Arbeitsverhältnis kann die Kreditvergabe erschweren.');
  if (data.age > 55) risks.push('Bei längeren Finanzierungslaufzeiten kann das Alter ein Faktor sein.');
  if (data.dependents >= 3) risks.push('Mehrere unterhaltsberechtigte Personen reduzieren den anrechenbaren Cashflow.');
  return risks;
}

export function calculateScore(data: AnalysisData, optionen?: ProjektionsOptionen): ScoreResult {
  if (data.profession === 'arbeitslos') {
    const emptyProjection: TenYearProjection = {
      purchasePrice: 0, equityInvested: 0, loanAmount: 0, interestRate: 0, repaymentRate: 0, monthlyRate: 0,
      totalPaidOver10Years: 0, totalInterestPaid: 0, totalPrincipalPaid: 0, remainingLoan: 0,
      estimatedValueAfter10Years: 0, appreciationRate: 0, totalRentIncome: 0, monthlyRent: 0,
      taxSavingsTotal: 0, netProfit: 0, returnOnEquity: 0, yearlyData: [],
      monthlyZuzahlung: 0, monthlyZuzahlungOhneSteuer: 0, monthlySteuervorteil: 0,
      wealthAfter10Years: 0,
      kaufnebenkosten: 0, gesamtinvestition: 0, eingesetztesKapital: 0,
      afaSatzProzent: ANNAHMEN.afaSatzProzent,
      wealthBreakdown: { propertyValue: 0, remainingLoan: 0, sellingCosts: 0, net: 0 },
      sparbuchVergleich: { monatlicheSparrate: 0, endkapitalSparbuch: 0, endkapitalImmobilie: 0, differenz: 0, faktor: 0 },
      worstCase: { annahme: '', wealthAfter10Years: 0, immerNochPositiv: false },
      scenarios: {
        pessimistisch: { wealthAfter10Years: 0, appreciationRate: 0.01, rentGrowth: 0.01 },
        realistisch: { wealthAfter10Years: 0, appreciationRate: 0.02, rentGrowth: 0.02 },
        optimistisch: { wealthAfter10Years: 0, appreciationRate: 0.03, rentGrowth: 0.03 },
      },
    };
    return {
      totalScore: 0, category: 'nicht_geeignet', categoryLabel: 'Aktuell nicht geeignet',
      categoryDescription: 'Vielen Dank für Dein Interesse an einem Immobilieninvestment. Leider ist eine Immobilienfinanzierung aktuell nicht möglich, da Banken in der Regel ein stabiles, regelmäßiges Einkommen voraussetzen.',
      strengths: [], challenges: ['Für eine Immobilienfinanzierung wird ein regelmäßiges Einkommen benötigt.'],
      recommendedAssets: [],
      financingEstimate: { maxVolume: 0, maxVolumeFormatted: 'Nicht ermittelbar', equityNeeded: 0, equityNeededFormatted: 'Nicht ermittelbar', monthlyRate: 0, monthlyRateFormatted: 'Nicht ermittelbar', financingType: 'Nicht anwendbar' },
      taxHints: [], risks: [], leadQuality: 'D',
      detailedScores: { income: 0, stability: 0, equity: 0, cashflow: 0, creditworthiness: 0, goalAlignment: 0, taxBenefit: 0 },
      projection: emptyProjection,
      ampel: { overall: 'rot', items: [] },
      hebelEffekt: { fremdkapital: 0, eigenkapital: 0, hebelFaktor: 0, renditeOhneHebel: 0, renditeMitHebel: 0, vermoegenswert10Jahre: 0, beschreibung: '' },
      ekHinweis: { empfohlenMitEK: false, empfohlenerEKBetrag: 0, ohneEKMoeglich: false, zinsaufschlagOhneEK: 0, tilgungOhneEK: 0, zinsMitEK: 0, tilgungMitEK: 0, hinweisText: '', altershinweis: null },
      goalInsights: [],
      bonitaetsVerbesserung: { aktuelleBonitaet: 'Nicht bewertet', nachInvestment: 'Nicht bewertet', verbesserungPunkte: [], bankSicht: '' },
    };
  }

  const incomeScore = scoreIncome(data);
  const stabilityScore = scoreStability(data);
  const equityScore = scoreEquity(data);
  const cashflowScore = scoreCashflow(data);
  const creditScore = scoreCreditworthiness(data);
  const goalScore = getGoalAlignment(data);
  const taxScore = getTaxBenefit(data);
  const total = incomeScore + stabilityScore + equityScore + cashflowScore + creditScore + goalScore + taxScore;

  let category: ScoreResult['category'];
  let categoryLabel: string;
  let categoryDescription: string;
  if (total >= 85) { category = 'sehr_gut'; categoryLabel = 'Sehr gut geeignet'; categoryDescription = 'Herzlichen Glückwunsch! Deine finanzielle Ausgangssituation ist hervorragend für ein Immobilieninvestment geeignet. Du kannst jetzt den entscheidenden Schritt machen.'; }
  else if (total >= 65) { category = 'gut'; categoryLabel = 'Gut geeignet'; categoryDescription = 'Du bringst eine gute Ausgangssituation mit. Tausende Investoren mit ähnlichen Voraussetzungen haben bereits erfolgreich in Immobilien investiert.'; }
  else if (total >= 45) { category = 'grundsaetzlich'; categoryLabel = 'Grundsätzlich geeignet'; categoryDescription = 'Die Grundvoraussetzungen sind gegeben! Mit der richtigen Strategie und Objektauswahl ist ein erfolgreiches Investment möglich.'; }
  else if (total >= 25) { category = 'eingeschraenkt'; categoryLabel = 'Eingeschränkt geeignet'; categoryDescription = 'Aktuell gibt es einige Herausforderungen, aber mit gezielter Vorbereitung können wir gemeinsam eine Lösung finden.'; }
  else { category = 'nicht_geeignet'; categoryLabel = 'Aktuell nicht geeignet'; categoryDescription = 'Auf Basis Deiner aktuellen Angaben ist ein Immobilieninvestment derzeit schwierig umzusetzen. Wir zeigen Dir, welche Schritte nötig sind.'; }

  const strengths: string[] = [];
  if (incomeScore >= 20) strengths.push('Überdurchschnittliches Einkommen – starke Basis für Finanzierung');
  if (stabilityScore >= 20) strengths.push('Sehr stabile Einkommenssituation – bevorzugt von Banken');
  if (equityScore >= 15) strengths.push('Solides Eigenkapital – bessere Zinskonditionen möglich');
  if (cashflowScore >= 12) strengths.push('Guter monatlicher Cashflow – geringe Zuzahlung nötig');
  if (creditScore >= 12) strengths.push('Gute Bonitätsindikatoren – erleichterte Kreditvergabe');
  if (data.existingProperties > 0) strengths.push(`Erfahrung mit ${data.existingProperties} Immobilie(n), das kennt die Bank gern`);
  if (data.realEstateExperience === 'viel' || data.investmentExperience === 'viel') strengths.push('Erfahrung mit Anlagen und Immobilien, Du weißt worauf es ankommt');
  if (data.profession === 'beamter') strengths.push('Beamtenstatus – bevorzugte Kreditkonditionen und niedrigste Zinsen');
  if (data.familyStatus === 'verheiratet') strengths.push('Verheiratet – gemeinsame Veranlagung bietet steuerliche Vorteile');

  const financing = getFinancingEstimate(data);
  const projection = getTenYearProjection(data, financing, optionen);
  const ampel = getAmpelResult(data, total, financing);
  const hebelEffekt = getHebelEffekt(data, projection);
  const ekHinweis = getEigenkapitalHinweis(data, financing);
  const goalInsights = getGoalInsights(data, projection);
  const bonitaetsVerbesserung = getBonitaetsVerbesserung(data, projection);
  const leadQuality: ScoreResult['leadQuality'] = total >= 80 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D';

  return {
    totalScore: total, category, categoryLabel, categoryDescription, strengths,
    challenges: getRisks(data), recommendedAssets: getRecommendedAssets(data, financing),
    financingEstimate: financing, taxHints: getTaxHints(data), risks: getRisks(data),
    leadQuality, detailedScores: { income: incomeScore, stability: stabilityScore, equity: equityScore, cashflow: cashflowScore, creditworthiness: creditScore, goalAlignment: goalScore, taxBenefit: taxScore },
    projection, ampel, hebelEffekt, ekHinweis, goalInsights, bonitaetsVerbesserung,
  };
}
