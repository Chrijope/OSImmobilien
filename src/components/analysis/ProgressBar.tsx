import { useSeitenTexte } from '@/components/SeitenSprache';
import { ANALYSE_TEXTE } from './analyseTexte';

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

const ProgressBar = ({ currentStep, totalSteps, stepLabels }: ProgressBarProps) => {
  const t = useSeitenTexte(ANALYSE_TEXTE).fortschritt;
  const progress = ((currentStep) / totalSteps) * 100;

  return (
    <div className="w-full mb-8">
      <div className="flex justify-between mb-2">
        <span className="text-sm text-muted-foreground">
          {t.schritt(currentStep + 1, totalSteps)}
        </span>
        <span className="text-sm text-foreground font-medium">
          {stepLabels[currentStep]}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-border overflow-hidden">
        <div
          className="h-full sand-gradient progress-shine rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
