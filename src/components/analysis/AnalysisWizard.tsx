import { useState } from 'react';
import type { AnalysisData, ScoreResult } from '@/lib/scoringEngine';
import { calculateScore } from '@/lib/scoringEngine';
import ProgressBar from './ProgressBar';
import QuestionCard from './QuestionCard';
import SelectOption from './SelectOption';
import MultiSelect from './MultiSelect';
import NumberInput from './NumberInput';
import ResultsPage from './ResultsPage';
import ErgebnisFreischalten from './ErgebnisFreischalten';
import { BUNDESLAENDER } from '@/lib/grunderwerbsteuer';
import { protokolliereAnalyseEreignis } from '@/lib/analysetoolEreignisse';
import type { BeraterInfo } from '@/pages/AnalysePublic';
import { useSeitenSprache, useSeitenTexte } from '@/components/SeitenSprache';
import { ANALYSE_TEXTE, type AnalyseTexte } from './analyseTexte';
import { bundeslandName } from './analyseRechenkernTexte';
import { fett } from './fettText';

/**
 * Vier Schritte statt acht. Alle Felder, die im Rechenkern nicht vorkommen,
 * sind entfallen: Haushaltsgröße, Branche, Bruttoeinkommen, Besoldungsgruppe,
 * Unterhaltsberechtigte, Finanzierungsbereitschaft. Die Erfahrungsfragen sind
 * geblieben, sie fließen seit dem Umbau in die Bewertung ein.
 *
 * Die Beschriftungen stehen in `analyseTexte.ts` (`wizard.schritte`), hier
 * zählt nur die Anzahl.
 */
const SCHRITT_ANZAHL = 4;

/** Die Hilfetexte einer Frage als Absätze, `**…**` wird fett. */
function Hilfe({ absaetze }: { absaetze: readonly string[] }) {
  return (
    <>
      {absaetze.map((a, i) => (
        <p key={i}>{fett(a)}</p>
      ))}
    </>
  );
}

/** Auswahlmöglichkeiten aus einer Zuordnung Wert → Beschriftung, in dieser Reihenfolge. */
function optionen<K extends string>(werte: readonly K[], beschriftung: Record<K, string>) {
  return werte.map((value) => ({ value, label: beschriftung[value] }));
}

/**
 * Defaults: KEINE Vorauswahl. Alle Felder müssen vom Nutzer aktiv ausgefüllt werden.
 * Numerische Felder starten bei 0 und werden über `> 0` validiert,
 * Auswahlfelder sind leere Strings und werden über Truthy-Check validiert.
 */
const defaultData: AnalysisData = {
  age: 0,
  familyStatus: '',
  householdSize: 0,
  dependents: 0,
  livingSituation: '',
  profession: '' as AnalysisData['profession'],
  netIncome: 0,
  additionalIncome: 0,
  savingsRate: 0,
  equity: 0,
  liquidityReserve: 0,
  existingLoans: 0,
  monthlyFixedCosts: 0,
  existingProperties: 0,
  investmentExperience: '' as AnalysisData['investmentExperience'],
  realEstateExperience: '' as AnalysisData['realEstateExperience'],
  goals: [],
  incomeClass: '' as AnalysisData['incomeClass'],
  taxOptimizationInterest: false,
  financingWillingness: '' as AnalysisData['financingWillingness'],
  bundeslandId: '',
};

interface WizardProps {
  berater?: BeraterInfo;
  /** Wenn true: Ergebnisseite blendet Vermögensaufbau-CTA, Steuer, Finanzierungsrahmen
   *  und empfohlene Assetklassen aus (für Reminder-/E-Mail-Modus). */
  hideAdvancedSections?: boolean;
  /**
   * Wenn true, steht vor dem Ergebnis die Eintragung. Gilt für den
   * öffentlichen Link. Im internen Werkzeug bleibt sie aus, sonst müsste der
   * Vertriebspartner sich im Kundengespräch selbst als Lead anlegen.
   */
  leadEintragung?: boolean;
}

const AnalysisWizard = ({ berater, hideAdvancedSections, leadEintragung }: WizardProps) => {
  const t = useSeitenTexte(ANALYSE_TEXTE).wizard;
  const sprache = useSeitenSprache();
  const [step, setStep] = useState(-1);
  const [data, setData] = useState<AnalysisData>({ ...defaultData });
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [freigeschaltet, setFreigeschaltet] = useState(false);

  const abschliessen = (d: AnalysisData) => {
    setResult(calculateScore(d));
    protokolliereAnalyseEreignis('analyse_beendet', berater?.userId);
  };

  const update = (partial: Partial<AnalysisData>) => setData(prev => ({ ...prev, ...partial }));

  const next = () => {
    // Ohne Einkommen gibt es nichts zu rechnen. Der Berufsstatus steht jetzt
    // im ersten Schritt, also greift die Abkürzung schon dort.
    if (step === 0 && data.profession === 'arbeitslos') {
      abschliessen(data);
      return;
    }
    if (step < SCHRITT_ANZAHL - 1) {
      setStep(step + 1);
    } else {
      abschliessen(data);
    }
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  if (result) {
    // Ohne Einkommen gibt es nichts zu rechnen. Diesen Menschen erst ein
    // Formular vorzusetzen, wäre unredlich: Er bekommt die Einordnung direkt.
    const klareAbsage = data.profession === 'arbeitslos';
    const brauchtEintragung = !!leadEintragung && !freigeschaltet && !klareAbsage;

    if (brauchtEintragung) {
      return (
        <ErgebnisFreischalten
          result={result}
          data={data}
          berater={berater}
          onFreigeschaltet={() => setFreigeschaltet(true)}
        />
      );
    }

    return (
      <ResultsPage
        result={result}
        data={data}
        berater={berater}
        hideAdvancedSections={hideAdvancedSections}
        bereitsEingetragen={freigeschaltet}
        onRestart={() => {
          setStep(-1);
          setData({ ...defaultData });
          setResult(null);
          setFreigeschaltet(false);
        }}
      />
    );
  }

  if (step === -1) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-10 sand-gradient blur-3xl" />
        <div className="relative z-10 text-center max-w-2xl analyse-fade-in-up">
          <h1 className="text-4xl md:text-5xl lg:text-6xl mb-6 leading-tight font-semibold text-foreground">
            {t.start.titelZeile1}<br /><span className="sand-text">{t.start.titelAkzent}</span>
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl mb-4 max-w-lg mx-auto leading-relaxed">
            {t.start.einleitung}
          </p>
          <p className="text-muted-foreground/60 text-sm mb-4">
            {t.start.kurz}
          </p>
          {/* Erwartung von Anfang an richtig setzen: Das hier ist eine
              Einordnung, keine verbindliche Berechnung. */}
          <p className="text-muted-foreground text-sm mb-6 max-w-lg mx-auto leading-relaxed">
            {t.start.erwartung}
          </p>
          {berater?.name && (
            <div className="mb-8 mx-auto w-full max-w-md rounded-2xl border border-primary/20 bg-card/80 px-4 py-3 text-center shadow-sm backdrop-blur-sm sm:px-5 sm:py-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{t.start.bereitgestelltVon}</p>
              <p className="mt-1 text-base font-semibold text-foreground sm:text-lg break-words">{berater.name}</p>
              {berater.position && (
                <p className="mt-1 text-xs text-muted-foreground break-words">{berater.position}</p>
              )}
            </div>
          )}
          <button
            onClick={() => { protokolliereAnalyseEreignis('analyse_gestartet', berater?.userId); setStep(0); }}
            className="sand-gradient text-foreground font-semibold text-base px-10 py-4 rounded-xl hover:opacity-90 transition-opacity sand-glow"
          >
            {t.start.starten}
          </button>
          <div className="mt-8 inline-flex items-center gap-2 bg-muted/40 border border-border/50 rounded-full px-4 py-2 text-xs text-muted-foreground">
            <span aria-hidden>🔒</span>
            <span>
              <strong className="text-foreground/80">{t.start.datenFett}</strong> {t.start.datenText}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground/40">
            {t.start.fusszeile}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl">
        <ProgressBar currentStep={step} totalSteps={SCHRITT_ANZAHL} stepLabels={t.schritte} />
      </div>

      {step === 0 && (
        <QuestionCard
          title={t.beruf.titel}
          subtitle={t.beruf.untertitel}
          onNext={next}
          onBack={back}
          canProceed={
            !!data.profession &&
            (data.profession === 'arbeitslos' || (berufsDetailsVollstaendig(data) && data.netIncome > 0))
          }
          isFirst
          hilfeTitel={t.beruf.hilfeTitel}
          hilfeText={<Hilfe absaetze={t.beruf.hilfe} />}
          validierungsHinweis={t.beruf.validierung}
        >
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">{t.beruf.statusLabel}</label>
            <SelectOption
              value={data.profession}
              onChange={v => update({ profession: v as AnalysisData['profession'] })}
              options={(['angestellt', 'selbststaendig', 'freiberufler', 'beamter', 'arbeitslos'] as const).map(value => ({
                value,
                label: t.beruf.status[value].label,
                description: t.beruf.status[value].beschreibung,
              }))}
            />
          </div>

          {/* Die eine passende Zusatzfrage erscheint direkt darunter, statt auf
              einem eigenen Schritt. Das spart einen kompletten Klickweg. */}
          <BerufsDetails data={data} update={update} t={t} />

          {data.profession && data.profession !== 'arbeitslos' && (
            <>
              <NumberInput label={t.beruf.netto} value={data.netIncome} onChange={v => update({ netIncome: v })} />
              <NumberInput label={t.beruf.zusatz} value={data.additionalIncome} onChange={v => update({ additionalIncome: v })} />
            </>
          )}
        </QuestionCard>
      )}

      {step === 1 && (
        <QuestionCard
          title={t.monat.titel}
          subtitle={t.monat.untertitel}
          onNext={next}
          onBack={back}
          canProceed={data.monthlyFixedCosts > 0}
          hilfeTitel={t.monat.hilfeTitel}
          hilfeText={<Hilfe absaetze={t.monat.hilfe} />}
          validierungsHinweis={t.monat.validierung}
        >
          <NumberInput label={t.monat.fixkosten} value={data.monthlyFixedCosts} onChange={v => update({ monthlyFixedCosts: v })} />
          <NumberInput label={t.monat.kredite} value={data.existingLoans} onChange={v => update({ existingLoans: v })} />
          <NumberInput label={t.monat.sparrate} value={data.savingsRate} onChange={v => update({ savingsRate: v })} />
          <NumberInput label={t.monat.eigenkapital} value={data.equity} onChange={v => update({ equity: v })} />
          <NumberInput label={t.monat.reserve} value={data.liquidityReserve} onChange={v => update({ liquidityReserve: v })} />
        </QuestionCard>
      )}

      {step === 2 && (
        <QuestionCard
          title={t.steuer.titel}
          subtitle={t.steuer.untertitel}
          onNext={next}
          onBack={back}
          canProceed={data.age >= 18 && !!data.incomeClass && data.goals.length > 0}
          hilfeTitel={t.steuer.hilfeTitel}
          hilfeText={<Hilfe absaetze={t.steuer.hilfe} />}
          validierungsHinweis={t.steuer.validierung}
        >
          <NumberInput label={t.steuer.alter} value={data.age} onChange={v => update({ age: v })} suffix={t.jahre} min={18} max={99} />
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">{t.steuer.bruttoLabel}</label>
            <SelectOption
              value={data.incomeClass}
              onChange={v => update({ incomeClass: v as AnalysisData['incomeClass'] })}
              options={optionen(['unter_30k', '30k_50k', '50k_80k', '80k_120k', 'ueber_120k'] as const, t.steuer.einkommensklasse)}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              {t.steuer.bruttoHinweis}
            </p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">{t.steuer.interesseLabel}</label>
            <SelectOption
              value={data.taxOptimizationInterest ? 'ja' : 'nein'}
              onChange={v => update({ taxOptimizationInterest: v === 'ja' })}
              options={optionen(['ja', 'nein'] as const, t.steuer.interesse)}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">{t.steuer.zieleLabel}</label>
            <MultiSelect
              values={data.goals}
              onChange={v => update({ goals: v })}
              options={optionen(
                ['vermoegensaufbau', 'altersvorsorge', 'steuerersparnis', 'passives_einkommen', 'inflationsschutz', 'diversifikation'] as const,
                t.steuer.ziele,
              )}
            />
          </div>
        </QuestionCard>
      )}

      {step === 3 && (
        <QuestionCard
          title={t.person.titel}
          subtitle={t.person.untertitel}
          onNext={next}
          onBack={back}
          canProceed={
            !!data.familyStatus && !!data.livingSituation && !!data.bundeslandId &&
            !!data.investmentExperience && !!data.realEstateExperience
          }
          hilfeTitel={t.person.hilfeTitel}
          hilfeText={<Hilfe absaetze={t.person.hilfe} />}
          validierungsHinweis={t.person.validierung}
        >
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">{t.person.familienstandLabel}</label>
            <SelectOption
              value={data.familyStatus}
              onChange={v => update({ familyStatus: v })}
              options={optionen(['ledig', 'verheiratet', 'geschieden', 'verwitwet'] as const, t.person.familienstand)}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">{t.person.wohnsituationLabel}</label>
            <SelectOption
              value={data.livingSituation}
              onChange={v => update({ livingSituation: v })}
              options={optionen(['miete', 'eigentum'] as const, t.person.wohnsituation)}
            />
          </div>
          <div>
            {/* Für die Kaufnebenkosten in der Musterrechnung. Die
                Grunderwerbsteuer reicht von 3,5 bis 6,5 Prozent, das macht
                bei 300.000 Euro rund 9.000 Euro Unterschied. */}
            <label className="text-sm text-muted-foreground mb-2 block">{t.person.bundeslandLabel}</label>
            <select
              value={data.bundeslandId || ''}
              onChange={e => update({ bundeslandId: e.target.value })}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
            >
              <option value="">{t.person.bitteWaehlen}</option>
              {BUNDESLAENDER.map(bl => (
                <option key={bl.id} value={bl.id}>
                  {t.person.bundeslandOption(bundeslandName(bl, sprache), bl.grunderwerbsteuer)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t.person.bundeslandHinweis}
            </p>
          </div>
          <NumberInput label={t.person.immobilien} value={data.existingProperties} onChange={v => update({ existingProperties: v })} suffix={t.stueck} />
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">{t.person.erfahrungAnlagen}</label>
            <SelectOption
              value={data.investmentExperience}
              onChange={v => update({ investmentExperience: v as AnalysisData['investmentExperience'] })}
              options={optionen(['keine', 'wenig', 'mittel', 'viel'] as const, t.person.erfahrung)}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">{t.person.erfahrungImmobilien}</label>
            <SelectOption
              value={data.realEstateExperience}
              onChange={v => update({ realEstateExperience: v as AnalysisData['realEstateExperience'] })}
              options={optionen(['keine', 'wenig', 'mittel', 'viel'] as const, t.person.erfahrung)}
            />
          </div>
        </QuestionCard>
      )}
    </div>
  );
};

/**
 * Prüft, ob die zum Berufsstatus passende Zusatzfrage beantwortet ist.
 * Ohne gewählten Status gilt sie als offen.
 */
export function berufsDetailsVollstaendig(data: AnalysisData): boolean {
  switch (data.profession) {
    case 'angestellt':
      return (data.employmentDuration ?? 0) > 0 && !!data.employmentType;
    case 'selbststaendig':
    case 'freiberufler':
      return (data.selfEmployedYears ?? 0) > 0 && (data.selfEmployedAvgIncome ?? 0) > 0 && !!data.incomeFluctuation;
    case 'beamter':
      return !!data.civilServantStatus;
    case 'arbeitslos':
      return true;
    default:
      return false;
  }
}

/**
 * Die eine Zusatzfrage, die zum gewählten Berufsstatus gehört. Sie steht
 * direkt unter der Auswahl, damit aus zwei Schritten einer wird.
 */
function BerufsDetails({
  data,
  update,
  t,
}: {
  data: AnalysisData;
  update: (p: Partial<AnalysisData>) => void;
  t: AnalyseTexte['wizard'];
}) {
  const d = t.details;
  if (data.profession === 'angestellt') {
    return (
      <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">{d.vertragsart}</label>
          <SelectOption
            value={data.employmentType ?? ''}
            onChange={v => update({ employmentType: v as 'unbefristet' | 'befristet' })}
            options={optionen(['unbefristet', 'befristet'] as const, d.vertrag)}
          />
        </div>
        <div>
          <NumberInput
            label={d.dauerAngestellt}
            value={data.employmentDuration ?? 0}
            onChange={v => update({ employmentDuration: v })}
            suffix={t.jahre}
            min={0}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            {d.dauerAngestelltHinweis}
          </p>
        </div>
      </div>
    );
  }

  if (data.profession === 'selbststaendig' || data.profession === 'freiberufler') {
    const dauerLabel = data.profession === 'selbststaendig' ? d.dauerSelbststaendig : d.dauerFreiberuflich;
    return (
      <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/20 p-4">
        <NumberInput label={dauerLabel} value={data.selfEmployedYears ?? 0} onChange={v => update({ selfEmployedYears: v })} suffix={t.jahre} />
        <NumberInput label={d.durchschnitt} value={data.selfEmployedAvgIncome ?? 0} onChange={v => update({ selfEmployedAvgIncome: v })} />
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">{d.schwankungLabel}</label>
          <SelectOption
            value={data.incomeFluctuation ?? ''}
            onChange={v => update({ incomeFluctuation: v as AnalysisData['incomeFluctuation'] })}
            options={optionen(['gering', 'mittel', 'hoch'] as const, d.schwankung)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {d.nachweisHinweis}
        </p>
      </div>
    );
  }

  if (data.profession === 'beamter') {
    return (
      <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">{d.dienstLabel}</label>
          <SelectOption
            value={data.civilServantStatus ?? ''}
            onChange={v => update({ civilServantStatus: v as AnalysisData['civilServantStatus'] })}
            options={optionen(['probe', 'lebenszeit'] as const, d.dienst)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {d.beamterHinweis}
        </p>
      </div>
    );
  }

  return null;
}

export default AnalysisWizard;
