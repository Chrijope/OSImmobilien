import { useState, useEffect, useMemo } from 'react';
import type { ScoreResult, AnalysisData } from '@/lib/scoringEngine';
import { ANNAHMEN, calculateScore } from '@/lib/scoringEngine';
import { AlertTriangle, ChevronRight, RotateCcw, Star, BarChart3, Landmark, CheckCircle2, PartyPopper, ArrowRight, Info, Phone, Mail, User, UserPlus, Sparkles } from 'lucide-react';
import type { BeraterInfo } from '@/pages/AnalysePublic';
// addKontakt/addAnalyseLeadNotification entfallen hier: anonymer Submit
// läuft über die Edge Function `submit-lead` (RLS-Bypass + Notification).
import { sendeAnalyseLead } from '@/lib/analyseLead';
import EinwilligungFelder, { einwilligungsTexte } from './EinwilligungFelder';
import Confetti from './Confetti';
import Reveal from './Reveal';
import MusterrechnungBlock from './MusterrechnungBlock';
import { useSeitenSprache, useSeitenTexte } from '@/components/SeitenSprache';
import { euroText } from '@/lib/sprachFormat';
import { ANALYSE_TEXTE } from './analyseTexte';
import { kategorieAnzeige, rechenkernText } from './analyseRechenkernTexte';
import { fett } from './fettText';

/** Lokaler, einfacher Zahlen-Tween für die WOW-Blocks. */
function useAnimatedNumber(target: number, duration = 1500): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(step);
      else setVal(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

interface ResultsPageProps {
  result: ScoreResult;
  data: AnalysisData;
  berater?: BeraterInfo;
  onRestart: () => void;
  /** Wenn true: Vermögensaufbau-CTA, Steuer-Hinweise, Finanzierungsrahmen
   *  und empfohlene Assetklassen ausblenden (Reminder-Modus). */
  hideAdvancedSections?: boolean;
  /** Der Interessent hat sich vor dem Ergebnis bereits eingetragen. */
  bereitsEingetragen?: boolean;
}

function AmpelDot({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'w-6 h-6' : size === 'md' ? 'w-4 h-4' : 'w-3 h-3';
  const color = status === 'gruen' ? 'bg-alert-green shadow-alert-green/50' : status === 'orange' ? 'bg-alert-orange shadow-alert-orange/50' : 'bg-alert-red shadow-alert-red/50';
  return <div className={`${sizeClass} rounded-full ${color} shadow-lg`} />;
}

function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">{score}/{max}</span>
      </div>
      <div className="h-2 bg-border rounded-full overflow-hidden">
        <div className="h-full sand-gradient rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CTAButton({ children, primary = true, onClick }: { children: React.ReactNode; primary?: boolean; onClick?: () => void }) {
  if (primary) {
    return (
      <button onClick={onClick} className="sand-gradient text-foreground font-semibold px-8 py-4 rounded-xl hover:opacity-90 transition-all hover:scale-[1.02] inline-flex items-center gap-2 shadow-lg">
        {children}
      </button>
    );
  }
  return (
    <button onClick={onClick} className="text-sm border border-border rounded-xl px-6 py-3 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors inline-flex items-center gap-2">
      {children}
    </button>
  );
}

const ANALYSE_RESULTS_KEY = "mi_analyse_results";

import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizeTelefon } from "@/lib/phoneUtils";

function saveAnalyseResult(
  kontaktId: string,
  analysisData: AnalysisData,
  scoreResult: ScoreResult,
  extras?: { leadMessage?: string },
) {
  const all = isTestAccount()
    ? (() => { try { const s = localStorage.getItem(ANALYSE_RESULTS_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; } })()
    : getUserSetting<Record<string, any>>("analyse_results", {});
  all[kontaktId] = {
    data: analysisData,
    result: {
      totalScore: scoreResult.totalScore,
      category: scoreResult.category,
      categoryLabel: scoreResult.categoryLabel,
      leadQuality: scoreResult.leadQuality,
      ampelOverall: scoreResult.ampel.overall,
      projection: {
        purchasePrice: scoreResult.projection.purchasePrice,
        monthlyZuzahlung: scoreResult.projection.monthlyZuzahlung,
        wealthAfter10Years: scoreResult.projection.wealthAfter10Years,
      },
      strengths: scoreResult.strengths,
      challenges: scoreResult.challenges,
    },
    timestamp: new Date().toISOString(),
    ...(extras?.leadMessage?.trim() ? { leadMessage: extras.leadMessage.trim() } : {}),
  };
  if (isTestAccount()) {
    localStorage.setItem(ANALYSE_RESULTS_KEY, JSON.stringify(all));
  } else {
    setUserSetting("analyse_results", all);
  }
}

export function getAnalyseResultForKontakt(kontaktId: string): any | null {
  if (isTestAccount()) {
    const stored = localStorage.getItem(ANALYSE_RESULTS_KEY);
    if (!stored) return null;
    const all = JSON.parse(stored);
    return all[kontaktId] || null;
  }
  const all = getUserSetting<Record<string, any>>("analyse_results", {});
  return all[kontaktId] || null;
}

// ═══════════════════════════════════════════════════════════════
// WOW-Block-Komponenten für die neue Verkaufspsychologie-Funnel
// ═══════════════════════════════════════════════════════════════

function HeroBlock({
  wealth,
  ampel,
  categoryLabel,
  categoryDescription,
  bgClass,
  colorClass,
}: {
  wealth: number;
  ampel: 'gruen' | 'orange' | 'rot';
  categoryLabel: string;
  categoryDescription: string;
  bgClass: string;
  colorClass: string;
}) {
  const t = useSeitenTexte(ANALYSE_TEXTE).ergebnis;
  const sprache = useSeitenSprache();
  const animatedWealth = useAnimatedNumber(wealth, 1800);
  const [confettiTrigger, setConfettiTrigger] = useState(false);

  useEffect(() => {
    // Dezent: einmalig nach kurzer Verzögerung auslösen
    const t = setTimeout(() => setConfettiTrigger(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="apple-hero mb-10 analyse-fade-in-up">
      <Confetti trigger={confettiTrigger} />
      <div className="relative z-10 text-center max-w-4xl mx-auto">
        <div className="apple-eyebrow mb-8">
          <PartyPopper className="w-3.5 h-3.5" />
          <span>{categoryLabel}</span>
        </div>
        <p className="text-[11px] sm:text-xs uppercase tracking-[0.3em] text-white/60 mb-4">{t.vermoegenNach10}</p>
        <p className="apple-display mb-6">
          {/* Geschütztes Leerzeichen, damit „€“ auf Deutsch nicht allein umbricht. */}
          {euroText(animatedWealth, sprache).replace(' ', '\u00A0')}
        </p>
        <p className="text-sm sm:text-base text-white/70 max-w-2xl mx-auto leading-relaxed px-2">
          {categoryDescription}
        </p>
        <p className="text-[11px] sm:text-xs tracking-wider text-white/40 mt-4">{t.steuerfreiHero}</p>
      </div>
    </div>
  );
}



function TransparenzBlock({
  interestRate,
  repaymentRate,
  appreciation,
  afaSatzProzent,
  kaufnebenkosten,
  gesamtinvestition,
}: {
  interestRate: number;
  repaymentRate: number;
  appreciation: number;
  afaSatzProzent: number;
  kaufnebenkosten: number;
  gesamtinvestition: number;
}) {
  const [open, setOpen] = useState(false);
  const t = useSeitenTexte(ANALYSE_TEXTE).ergebnis.transparenz;
  const stark = 'text-foreground';

  return (
    <div className="glass-card rounded-2xl p-6 mb-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <Info className="w-5 h-5 text-foreground" />
          <h3 className="text-lg font-semibold text-foreground">{t.titel}</h3>
        </div>
        <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-5 space-y-3 text-sm text-foreground/85">
          <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
            <p className="font-semibold mb-2">📐 {t.annahmen}</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {/* Prozentwerte auf eine Stelle gerundet wie bisher, die Schreibweise macht die Textdatei. */}
              <li>• {fett(t.zins(Math.round(interestRate * 1000) / 10), stark)}</li>
              <li>• {fett(t.tilgung(Math.round(repaymentRate * 1000) / 10), stark)}</li>
              <li>• {fett(t.wertsteigerung(Math.round(appreciation * 100)), stark)}</li>
              <li>• {fett(t.kaufnebenkosten(ANNAHMEN.kaufnebenkostenProzent, kaufnebenkosten, gesamtinvestition), stark)}</li>
              <li>• {fett(t.mietrendite(ANNAHMEN.mietrenditeProzent), stark)}</li>
              <li>• {fett(t.gebaeudeanteil(ANNAHMEN.gebaeudeanteilProzent), stark)}</li>
              <li>• {fett(t.afa(afaSatzProzent), stark)}{afaSatzProzent > ANNAHMEN.afaSatzProzent ? t.afaGutachten : t.afaGesetz}</li>
              <li>• {fett(t.verkaufskosten(ANNAHMEN.verkaufskostenProzent), stark)}</li>
              <li>• {t.steuerfrei}</li>
            </ul>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
            <p className="font-semibold mb-2">🧮 {t.zuzahlungTitel}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {fett(t.zuzahlungFormel, stark)}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            {t.vorbehalt}
          </p>
        </div>
      )}
    </div>
  );
}

function BeraterCard({
  berater,
  onErstgespraech,
  variant = 'hero',
}: {
  berater: BeraterInfo;
  onErstgespraech: () => void;
  variant?: 'hero' | 'cta';
}) {
  const t = useSeitenTexte(ANALYSE_TEXTE).ergebnis;
  return (
    <div className="glass-card rounded-3xl p-6 sm:p-8 mb-10 analyse-fade-in-up">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-7">
        {berater.bild ? (
          <img
            src={berater.bild}
            alt={berater.name}
            className="w-20 h-20 sm:w-[88px] sm:h-[88px] rounded-full object-cover shrink-0 ring-1 ring-black/5 shadow-[0_8px_28px_-12px_rgba(0,0,0,0.25)]"
          />
        ) : (
          <div className="w-20 h-20 sm:w-[88px] sm:h-[88px] rounded-full bg-muted flex items-center justify-center shrink-0 ring-1 ring-black/5">
            <User className="w-9 h-9 text-foreground/50" />
          </div>
        )}
        <div className="flex-1 min-w-0 text-center sm:text-left w-full">
          <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">
            {t.persoenlicherAnsprechpartner}
          </p>
          <p className="font-semibold text-foreground text-xl sm:text-2xl tracking-tight truncate">
            {berater.name}
          </p>
          {berater.position && (
            <p className="text-sm text-muted-foreground truncate mb-5">{berater.position}</p>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
            <button
              onClick={onErstgespraech}
              className="apple-btn apple-btn-primary flex-1"
            >
              {t.erstgespraech}
              <ArrowRight className="w-4 h-4" />
            </button>
            {berater.telefon ? (
              <a
                href={`tel:${berater.telefon}`}
                className="apple-btn apple-btn-outline"
              >
                <Phone className="w-4 h-4" /> {t.anrufen}
              </a>
            ) : null}
            {berater.email ? (
              <a
                href={`mailto:${berater.email}`}
                className="apple-btn apple-btn-outline"
              >
                <Mail className="w-4 h-4" /> {t.email}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// NEU: Assetklassen-Empfehlung (Sanierter Bestand / WG-Co-Living / Neubau)
// ═══════════════════════════════════════════════════════════════
type AssetKey = 'sanierter-bestand' | 'wg-coliving' | 'neubau';

const ResultsPage = ({ result: basisErgebnis, data, berater, onRestart, hideAdvancedSections, bereitsEingetragen }: ResultsPageProps) => {
  const isUnemployed = data.profession === 'arbeitslos';
  const texte = useSeitenTexte(ANALYSE_TEXTE);
  const t = texte.ergebnis;
  const f = texte.formular;
  const sprache = useSeitenSprache();
  // Die Meldung zum fehlenden Haken in der Sprache der Seite, siehe `EinwilligungFelder`.
  const einwilligungFehltText = einwilligungsTexte(sprache).fehlt;

  // Die Vorgabe ist der gesetzliche AfA-Satz. Der höhere Satz setzt ein
  // objektbezogenes Restnutzungsdauergutachten voraus und lässt sich im
  // Gespräch zuschalten, damit die Aussage belegbar bleibt.
  const [afaMitGutachten, setAfaMitGutachten] = useState(false);
  const result = useMemo(
    () =>
      afaMitGutachten
        ? calculateScore(data, { afaSatzProzent: ANNAHMEN.afaSatzMitGutachtenProzent })
        : basisErgebnis,
    [afaMitGutachten, data, basisErgebnis],
  );
  const p = result.projection;
  // Kategorie und Beschreibung kommen deutsch aus dem Rechenkern (sie gehen
  // so ins CRM). Angezeigt wird die Fassung der Seitensprache.
  const kategorie = kategorieAnzeige(result, sprache, isUnemployed);
  // Im Reminder-/Vorbereitungsmodus zeigen wir ein einheitliches Beispielszenario
  // mit ca. 152 € monatlicher Zuzahlung – die echten Zahlen werden im Erstgespräch
  // individuell berechnet.
  const REMINDER_EXAMPLE_ZUZAHLUNG = 152;
  const displayZuzahlung = hideAdvancedSections ? REMINDER_EXAMPLE_ZUZAHLUNG : p.monthlyZuzahlung;

  // Contact form state
  const [formVorname, setFormVorname] = useState('');
  const [formNachname, setFormNachname] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTelefon, setFormTelefon] = useState('');
  const [formStrasse, setFormStrasse] = useState('');
  const [formPlz, setFormPlz] = useState('');
  const [formOrt, setFormOrt] = useState('');
  const [formNotizen, setFormNotizen] = useState('');
  // Wer sich vor dem Ergebnis eingetragen hat, bekommt das Formular unten
  // nicht noch einmal.
  const [formSent, setFormSent] = useState(!!bereitsEingetragen);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formFehler, setFormFehler] = useState<string | null>(null);
  // Dieselben zwei Haken wie in der vorgezogenen Eintragung, siehe
  // `EinwilligungFelder`. Pflicht und Werbung bleiben getrennt.
  const [formEinwilligung, setFormEinwilligung] = useState(false);
  const [formWerbung, setFormWerbung] = useState(false);
  const [formEinwilligungFehlt, setFormEinwilligungFehlt] = useState(false);

  // Was der Partner vom Ergebnis sieht, geht als `analyseSnapshot` mit dem
  // Lead an den Server. Eine Kontaktkennung bekommt der Browser seit dem
  // 26.09.2026 nicht mehr zurück (Befund HB-002).

  const overallColor = result.ampel.overall === 'gruen' ? 'text-alert-green' : result.ampel.overall === 'orange' ? 'text-alert-orange' : 'text-alert-red';
  const overallBg = result.ampel.overall === 'gruen' ? 'from-alert-green/10 to-alert-green/5' : result.ampel.overall === 'orange' ? 'from-alert-orange/10 to-alert-orange/5' : 'from-alert-red/10 to-alert-red/5';
  const overallLabel = t.gesamt[result.ampel.overall];

  // Scroll-Handler für „Erstgespräch vereinbaren" – springt zum Lead-Formular.
  const scrollToLeadForm = () => {
    const el = document.getElementById('lead-form');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="analyse-apple py-12 sm:py-20 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12 sm:mb-16 analyse-fade-in-up">
          <span className="apple-eyebrow bg-primary/10 border-primary/20 text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            {t.eyebrow}
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl mt-6 mb-4 font-semibold tracking-tight">
            {t.titel}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t.untertitel}
          </p>
        </div>

        {/* ═══ HINWEIS: Beispielergebnis ═══ */}
        {!isUnemployed && (
          <div className="mb-6 sm:mb-8 analyse-fade-in-up">
            <div className="glass-card rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 sm:p-5">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-primary mb-1">
                    {t.hinweisTitel}
                  </p>
                  <p className="text-sm sm:text-base text-foreground/90 leading-relaxed">
                    {t.hinweisVor}
                    <span className="font-semibold text-alert-green">{t.hinweisBetont}</span>
                    {t.hinweisNach}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {isUnemployed ? (
          <div className="glass-card rounded-2xl p-8 text-center analyse-fade-in-up">
            <h2 className="text-2xl text-alert-red mb-4">{kategorie.label}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{kategorie.beschreibung}</p>
            <p className="text-muted-foreground leading-relaxed mb-6">
              {t.ohneEinkommenText}
            </p>
            <button onClick={onRestart} className="text-sm text-primary hover:underline inline-flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> {t.neueAnalyseStarten}
            </button>
          </div>
        ) : (
          <>
            {/* ═══ 1. HERO – WOW-Effekt mit CountUp + Confetti ═══ */}
            {(result.ampel.overall === 'gruen' || result.ampel.overall === 'orange') && p.purchasePrice > 0 && (
              <HeroBlock
                wealth={p.wealthAfter10Years}
                ampel={result.ampel.overall}
                categoryLabel={kategorie.label}
                categoryDescription={kategorie.beschreibung}
                bgClass={overallBg}
                colorClass={overallColor}
              />
            )}

            {result.ampel.overall === 'rot' && (
              <div className={`glass-card rounded-2xl p-8 mb-8 analyse-fade-in-up bg-gradient-to-br ${overallBg}`}>
                <div className="flex items-start gap-4">
                  <AlertTriangle className="w-8 h-8 text-alert-red shrink-0 mt-1" />
                  <div>
                    <h2 className="text-2xl text-alert-red mb-2">{kategorie.label}</h2>
                    <p className="text-muted-foreground leading-relaxed">{kategorie.beschreibung}</p>
                  </div>
                </div>
              </div>
            )}


            {/* ═══ NEU: Berater-Karte direkt unter Hero – 3 echte CTA-Buttons ═══ */}
            {berater && !hideAdvancedSections && (
              <BeraterCard berater={berater} onErstgespraech={scrollToLeadForm} variant="hero" />
            )}

            {/* ═══ Finanzierungsrahmen, Objekttyp und Musterrechnung ═══
                Die konkrete Antwort auf die erste Frage jedes Interessenten:
                Was ist für mich machbar und was kostet mich das im Monat? */}
            {p.purchasePrice > 0 && !hideAdvancedSections && (
              <div className="mb-6 mt-10">
                <h2 className="text-xl font-semibold tracking-tight text-foreground mb-4">
                  {t.machbarTitel}
                </h2>
                <MusterrechnungBlock
                  rahmenBis={result.financingEstimate.maxVolume}
                  grenzsteuersatz={
                    // Gleiche Staffel wie im Rechenkern, damit Musterrechnung
                    // und Projektion nicht auseinanderlaufen.
                    data.incomeClass === 'ueber_120k' || data.incomeClass === '80k_120k'
                      ? 0.42
                      : data.incomeClass === '50k_80k'
                      ? 0.35
                      : 0.25
                  }
                  bundeslandId={data.bundeslandId}
                  onErstgespraech={scrollToLeadForm}
                />
              </div>
            )}


            {/* ═══ Ampel als Kurzfassung, damit die Einordnung oben steht ═══ */}
            {p.purchasePrice > 0 && !hideAdvancedSections && result.ampel.items.length > 0 && (
              <Reveal delay={120}>
                <div className="glass-card rounded-2xl p-5 sm:p-6 mb-6">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                    <h3 className="text-base font-semibold text-foreground">{t.passtTitel}</h3>
                    <span className={`text-xs font-medium ${overallColor}`}>{overallLabel}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {result.ampel.items.map((item) => (
                      <div key={item.label} className="rounded-xl bg-muted/50 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <AmpelDot status={item.status} size="sm" />
                          <span className="text-xs font-medium text-foreground truncate">{rechenkernText(item.label, sprache)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">{rechenkernText(item.detail, sprache)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            )}


            {/* ═══ Wie wir rechnen ═══
                Der Rest der früheren Ergebnisseite ist bewusst entfallen. Wer
                sich eintragen soll, braucht drei klare Antworten, nicht
                dreizehn Diagramme. Der Rechenweg bleibt trotzdem einsehbar. */}
            {p.purchasePrice > 0 && !hideAdvancedSections && (
              <details className="group glass-card rounded-2xl mb-6 overflow-hidden analyse-fade-in-up">
                <summary className="cursor-pointer list-none p-5 sm:p-6 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Info className="w-5 h-5 text-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-base sm:text-lg">{t.wieWirRechnen}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.wieWirRechnenText}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <div className="p-3 sm:p-4 pt-0">
                  {!isUnemployed && (
                    <div className="rounded-2xl border border-border bg-muted/30 p-5 mb-4 flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {t.afaTitel(p.afaSatzProzent)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                          {t.afaText(ANNAHMEN.afaSatzMitGutachtenProzent)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAfaMitGutachten((v) => !v)}
                        className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors border ${
                          afaMitGutachten
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-transparent text-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {afaMitGutachten ? t.afaMitGutachten : t.afaMitGutachtenRechnen}
                      </button>
                    </div>
                  )}
                  <TransparenzBlock
                    interestRate={p.interestRate}
                    repaymentRate={p.repaymentRate}
                    appreciation={p.appreciationRate}
                    afaSatzProzent={p.afaSatzProzent}
                    kaufnebenkosten={p.kaufnebenkosten}
                    gesamtinvestition={p.gesamtinvestition}
                  />
                </div>
              </details>
            )}


            {/* ═══ 10. Detailbewertung & Stärken – nur intern (hideAdvancedSections) ═══ */}
            {hideAdvancedSections && (
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="glass-card rounded-2xl p-6 analyse-fade-in-up">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5" /> {t.detailbewertung}</h3>
                  <ScoreBar label={t.punkte.income} score={result.detailedScores.income} max={25} />
                  <ScoreBar label={t.punkte.stability} score={result.detailedScores.stability} max={25} />
                  <ScoreBar label={t.punkte.equity} score={result.detailedScores.equity} max={20} />
                  <ScoreBar label={t.punkte.cashflow} score={result.detailedScores.cashflow} max={15} />
                  <ScoreBar label={t.punkte.creditworthiness} score={result.detailedScores.creditworthiness} max={15} />
                  <ScoreBar label={t.punkte.goalAlignment} score={result.detailedScores.goalAlignment} max={5} />
                  <ScoreBar label={t.punkte.taxBenefit} score={result.detailedScores.taxBenefit} max={10} />
                </div>
                <div className="space-y-6">
                  {result.strengths.length > 0 && (
                    <div className="glass-card rounded-2xl p-6 analyse-fade-in-up">
                      <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><Star className="w-5 h-5 text-sand" /> {t.staerken}</h3>
                      <ul className="space-y-2">
                        {result.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                            <ChevronRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            {rechenkernText(s, sprache)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ 11. Steuerliche Hinweise ═══ */}
            {!hideAdvancedSections && result.taxHints.length > 0 && (
              <div className="glass-card rounded-2xl p-6 mb-6 analyse-fade-in-up">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Landmark className="w-5 h-5" /> {t.steuerHinweise}</h3>
                <ul className="space-y-3">
                  {result.taxHints.map((hint, i) => (
                    <li key={i} className="text-sm text-muted-foreground leading-relaxed flex items-start gap-2">
                      <span className="text-primary mt-1 shrink-0">•</span>
                      {rechenkernText(hint, sprache)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ═══ 12. FINAL CTA – nur im Vollmodus ═══ */}
            {!hideAdvancedSections && (
              <div className="glass-elevated rounded-3xl p-8 sm:p-12 md:p-16 text-center analyse-fade-in-up">
                <span className="apple-eyebrow mb-6 bg-primary/10 border-primary/20 text-primary">
                  {t.naechsterSchritt}
                </span>
                <h3 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight mt-6 mb-5 text-foreground">
                  {t.bereitTitel}
                </h3>
                <p className="text-foreground/70 text-base sm:text-lg mb-3 max-w-2xl mx-auto leading-relaxed">
                  {p.purchasePrice > 0 ? t.bereitMitRechnung : t.bereitOhneRechnung}
                </p>
                <p className="text-muted-foreground text-sm sm:text-base mb-10">
                  {t.kostenlos}
                </p>

                {/* Vertriebspartner-Personalisierung */}
                {berater && (
                  <div className="bg-muted/40 rounded-2xl p-5 sm:p-6 mb-8 border border-border max-w-md mx-auto">
                    <div className="flex items-center gap-3 sm:gap-4">
                      {berater.bild ? (
                        <img src={berater.bild} alt={berater.name} className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover shrink-0 ring-1 ring-black/5" />
                      ) : (
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-muted flex items-center justify-center shrink-0 ring-1 ring-black/5">
                          <User className="w-7 h-7 sm:w-8 sm:h-8 text-foreground/50" />
                        </div>
                      )}
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">{t.persoenlicherVertriebspartner}</p>
                        <p className="font-semibold text-foreground text-sm sm:text-base truncate">{berater.name}</p>
                        {berater.position && <p className="text-xs text-muted-foreground truncate">{berater.position}</p>}
                        {berater.email && (
                          <a href={`mailto:${berater.email}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-1 break-all">
                            <Mail className="w-3 h-3 shrink-0" /> <span className="truncate">{berater.email}</span>
                          </a>
                        )}
                        {berater.telefon && (
                          <a href={`tel:${berater.telefon}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                            <Phone className="w-3 h-3 shrink-0" /> {berater.telefon}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Interesse-Formular */}
                {!formSent && (
                  <div data-ui="card" id="lead-form" className="bg-card rounded-3xl p-6 sm:p-8 mb-6 border border-border max-w-lg mx-auto text-left scroll-mt-24 shadow-lg">
                    <h4 className="font-semibold text-lg tracking-tight mb-1.5 text-foreground flex items-center gap-2"><UserPlus className="w-4 h-4" /> {t.interesseTitel}</h4>
                    <p className="text-sm text-muted-foreground mb-6">{t.interesseText}</p>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <input type="text" placeholder={f.vorname} value={formVorname} onChange={e => setFormVorname(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
                        <input type="text" placeholder={f.nachname} value={formNachname} onChange={e => setFormNachname(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
                      </div>
                      <input type="email" placeholder={f.email} value={formEmail} onChange={e => setFormEmail(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
                      <PhoneInput value={formTelefon} onChange={v => setFormTelefon(v)} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input type="text" placeholder={f.strasse} value={formStrasse} onChange={e => setFormStrasse(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
                        <div className="grid grid-cols-5 gap-2">
                          <input type="text" placeholder={f.plz} value={formPlz} onChange={e => setFormPlz(e.target.value)}
                            className="col-span-2 w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
                          <input type="text" placeholder={f.ort} value={formOrt} onChange={e => setFormOrt(e.target.value)}
                            className="col-span-3 w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
                        </div>
                      </div>
                      <textarea placeholder={f.nachricht} value={formNotizen} onChange={e => setFormNotizen(e.target.value)} rows={2}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none" />
                      <EinwilligungFelder
                        einwilligung={formEinwilligung}
                        onEinwilligung={(w) => {
                          setFormEinwilligung(w);
                          if (w) {
                            setFormEinwilligungFehlt(false);
                            setFormFehler((alt) => (alt === einwilligungFehltText ? null : alt));
                          }
                        }}
                        werbung={formWerbung}
                        onWerbung={setFormWerbung}
                        fehlt={formEinwilligungFehlt}
                        sprache={sprache}
                      />
                      <button
                        disabled={!formVorname.trim() || !formNachname.trim() || !formEmail.trim() || !formTelefon.trim() || formSubmitting}
                        onClick={async () => {
                          // Ohne Einwilligung geht nichts raus, und die Meldung
                          // steht direkt am Haken.
                          if (!formEinwilligung) {
                            setFormEinwilligungFehlt(true);
                            setFormFehler(einwilligungFehltText);
                            return;
                          }
                          setFormEinwilligungFehlt(false);
                          setFormSubmitting(true);
                          const antwort = await sendeAnalyseLead(
                            {
                              vorname: formVorname,
                              nachname: formNachname,
                              email: formEmail,
                              telefon: formTelefon,
                              strasse: formStrasse,
                              plz: formPlz,
                              ort: formOrt,
                              notizen: formNotizen,
                              einwilligung: formEinwilligung,
                              werbeeinwilligung: formWerbung,
                            },
                            result,
                            data,
                            berater,
                            sprache,
                          );
                          setFormSubmitting(false);
                          if (!antwort.ok) {
                            setFormFehler(antwort.fehler || f.fehlerAllgemein);
                            return;
                          }
                          setFormFehler(null);
                          saveAnalyseResult(crypto.randomUUID(), data, result, {
                            leadMessage: formNotizen.trim(),
                          });
                          setFormSent(true);
                        }}
                        className="w-full apple-btn apple-btn-primary mt-2 disabled:opacity-40 disabled:cursor-not-allowed">
                        {t.absenden} <ArrowRight className="w-4 h-4" />
                      </button>
                      {/* Die Meldung zum fehlenden Haken steht schon dort. */}
                      {formFehler && formFehler !== einwilligungFehltText && (
                        <p className="text-sm text-destructive text-center">{formFehler}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 text-center">{t.vertraulich}</p>
                    </div>
                  </div>
                )}

                {formSent && (
                  <div className="bg-[hsl(var(--alert-green))]/5 rounded-3xl p-8 mb-6 border border-[hsl(var(--alert-green))]/25 max-w-md mx-auto">
                    <CheckCircle2 className="w-10 h-10 text-alert-green mx-auto mb-3" />
                    <p className="font-semibold text-foreground text-lg tracking-tight">{t.dankeTitel}</p>
                    <p className="text-sm text-muted-foreground mt-2">{t.dankeText}</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                  <button onClick={onRestart} className="apple-btn apple-btn-outline mx-auto">
                    <RotateCcw className="w-4 h-4" /> {t.neueAnalyse}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-8 tracking-wide">{t.fusszeile}</p>
              </div>
            )}

            {/* ═══ 12b. Reminder-Modus CTA – Vorbereitung Erstgespräch ═══ */}
            {hideAdvancedSections && (
              <div className="glass-elevated sand-border-strong rounded-2xl p-8 text-center sand-glow analyse-fade-in-up">
                <PartyPopper className="w-10 h-10 sand-text mx-auto mb-3" />
                <h3 className="text-2xl font-semibold sand-text mb-3">{t.erinnerungTitel}</h3>
                <p className="text-muted-foreground text-base mb-2 max-w-xl mx-auto">
                  {t.erinnerungText}
                </p>
                <p className="text-muted-foreground/70 text-sm mt-4">
                  {t.erinnerungFreude}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                  <CTAButton primary={false} onClick={onRestart}>
                    <RotateCcw className="w-4 h-4" /> {t.erneutDurchgehen}
                  </CTAButton>
                </div>
              </div>
            )}

            <div className="mt-4 text-center">
              <span className="text-xs text-muted-foreground/30">{t.leadQualitaet(result.leadQuality)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ResultsPage;
