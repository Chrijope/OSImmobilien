import { ReactNode, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { useSeitenTexte } from '@/components/SeitenSprache';
import { ANALYSE_TEXTE } from './analyseTexte';

interface QuestionCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onNext: () => void;
  onBack?: () => void;
  canProceed: boolean;
  isFirst?: boolean;
  /** Optional Hinweis, der seitlich (Desktop) bzw. unten (Mobile) eingeblendet wird */
  hilfeTitel?: string;
  hilfeText?: ReactNode;
  /** Wird angezeigt, wenn der Nutzer trotz unvollständiger Eingabe auf Weiter klickt */
  validierungsHinweis?: string;
}

const QuestionCard = ({
  title,
  subtitle,
  children,
  onNext,
  onBack,
  canProceed,
  isFirst,
  hilfeTitel,
  hilfeText,
  validierungsHinweis,
}: QuestionCardProps) => {
  const t = useSeitenTexte(ANALYSE_TEXTE).frage;
  const [zeigeWarnung, setZeigeWarnung] = useState(false);
  const [hilfeOffen, setHilfeOffen] = useState(true);

  const handleWeiter = () => {
    if (!canProceed) {
      setZeigeWarnung(true);
      return;
    }
    setZeigeWarnung(false);
    onNext();
  };

  return (
    <div className="analyse-fade-in-up w-full max-w-5xl mx-auto">
      <div className="grid lg:grid-cols-[1fr_280px] gap-4 lg:gap-6 items-start">
        <div className="glass-card rounded-2xl p-5 sm:p-7 md:p-10 order-2 lg:order-1">
          <h2 className="text-xl sm:text-2xl md:text-3xl mb-2 text-foreground font-semibold">{title}</h2>
          {subtitle && <p className="text-muted-foreground text-sm mb-6 md:mb-8">{subtitle}</p>}

          <div className="space-y-5 md:space-y-6 mb-6 md:mb-8">{children}</div>

          {zeigeWarnung && !canProceed && (
            <div className="mb-4 flex items-start gap-3 bg-alert-orange/10 border border-alert-orange/30 rounded-xl p-4 animate-fade-in">
              <span className="text-alert-orange text-lg leading-none">!</span>
              <p className="text-sm text-foreground/90">
                {validierungsHinweis || t.standardValidierung}
              </p>
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t border-border/50">
            {!isFirst && onBack ? (
              <button
                onClick={onBack}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.zurueck}
              </button>
            ) : <div />}
            <button
              onClick={handleWeiter}
              className={`text-sm font-semibold px-6 sm:px-8 py-3 rounded-lg sand-gradient text-foreground transition-opacity ${
                canProceed ? 'hover:opacity-90' : 'opacity-60 cursor-pointer hover:opacity-70'
              }`}
            >
              {t.weiter}
            </button>
          </div>
        </div>

        {hilfeText && hilfeOffen && (
          <aside className="order-1 lg:order-2 lg:sticky lg:top-6 animate-fade-in">
            <div className="rounded-2xl p-5 border border-primary/20 bg-primary/5 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs uppercase tracking-wider text-primary font-semibold">
                      {hilfeTitel || t.tipp}
                    </p>
                    <button
                      onClick={() => setHilfeOffen(false)}
                      className="text-muted-foreground hover:text-foreground transition-colors lg:hidden"
                      aria-label={t.hinweisSchliessen}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-foreground/80 leading-relaxed space-y-2">
                    {hilfeText}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default QuestionCard;
