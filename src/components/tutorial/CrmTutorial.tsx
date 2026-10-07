/**
 * CRM-Tutorial: geführte Sidebar-Tour.
 *
 * - Startet EINMAL automatisch nach abgeschlossenem Profil-Onboarding
 *   (Rollen: alle außer kunde/tippgeber).
 * - Springt der Reihe nach jede Sidebar-URL an (DOM-Reihenfolge über
 *   `[data-tour-id]`) und zeigt in einem zentralen Popup eine
 *   Kurzerklärung zur jeweiligen Seite.
 * - Steuerung: Weiter / Zurück / Beenden. Tastatur: ← → Esc.
 * - Persistenz atomar in `user_settings.einstellungen.crmTutorial`
 *   (via merge_user_settings – kein Read-Modify-Write).
 * - Kann in Einstellungen jederzeit fortgesetzt oder neu gestartet werden.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, ArrowLeft, ArrowRight, GraduationCap, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useUserSettings } from "@/hooks/useUserSettings";
import { CRM_TUTORIAL_CONTENT, type CrmTutorialStep } from "@/lib/crmTutorialContent";
import { cn } from "@/lib/utils";

/**
 * Lokaler Sofort-Guard (belt-and-suspenders): Sobald der User „Später fortsetzen",
 * „X" oder „Fertig" klickt, hinterlassen wir hier synchron eine Marke. So
 * kommt das Popup bei Reload/neuem Login GARANTIERT nicht mehr hoch, auch wenn
 * der DB-Roundtrip (merge_user_settings) noch nicht durch ist oder fehlschlägt.
 * Manueller Restart in Einstellungen räumt die Marke wieder ab.
 */
const LS_SEEN_KEY = "crm_tutorial_seen_v1";
function lsMarkSeen() { try { localStorage.setItem(LS_SEEN_KEY, "1"); } catch {} }
function lsClearSeen() { try { localStorage.removeItem(LS_SEEN_KEY); } catch {} }
function lsIsSeen(): boolean { try { return localStorage.getItem(LS_SEEN_KEY) === "1"; } catch { return false; } }

type TutorialState = {
  seen?: boolean;
  completed?: boolean;
  lastIndex?: number;
  startedAt?: string;
};

type Ctx = {
  isActive: boolean;
  start: (opts?: { fromStart?: boolean }) => void;
  resume: () => void;
  stop: (opts?: { markDone?: boolean }) => void;
  hasProgress: boolean;
  lastIndex: number;
  totalSteps: number;
};

const CrmTutorialContext = createContext<Ctx | null>(null);

export function useCrmTutorial() {
  const ctx = useContext(CrmTutorialContext);
  if (!ctx) throw new Error("useCrmTutorial must be used inside <CrmTutorialProvider>");
  return ctx;
}

/** Virtuelles Deckblatt (kein Sidebar-Eintrag) – im CI des Projekts. */
const COVER_STEP: CrmTutorialStep = {
  url: "__cover__",
  titel: "Willkommen in deinem CRM",
  kurz: "Eine kurze geführte Tour durch alle Bereiche.",
  erklaerung:
    'In den nächsten Schritten zeigen wir dir jeden Menüpunkt der Sidebar und erklären in einem Satz, wofür er da ist. Du kannst jederzeit mit „Später fortsetzen" pausieren. Das Tutorial startet dann nicht mehr automatisch. In den Einstellungen → Tutorial kannst du es jederzeit wieder öffnen.',
  bullets: [
    "Dauer: ca. 2 Minuten",
    "Steuerung mit ← / → oder den Buttons",
    "Später jederzeit über Einstellungen → Tutorial startbar",
  ],
};

/** Virtuelle Endkarte (kein Sidebar-Eintrag). */
const FINAL_STEP: CrmTutorialStep = {
  url: "__finish__",
  titel: "Weiter geht's in der Vertriebsakademie",
  kurz: "Du kennst jetzt das WO – jetzt kommt das WIE.",
  erklaerung:
    "Perfekt – du hast dir einen Überblick über alle Bereiche verschafft, die dir zur Verfügung stehen. In der Vertriebsakademie lernst du jetzt Schritt für Schritt die gesamten Prozesse und Abläufe: von 'Lead kommt rein' oder 'Interessent aus dem eigenen Netzwerk' über Erstgespräch, Bonität, Objektauswahl, Reservierung und Finanzierung bis zum Notartermin – inklusive Skripten, Einwandbehandlung und der kompletten Kundenkommunikation.",
  bullets: [
    "10 chronologische Kapitel für Quereinsteiger und Profis",
    "Übungen mit Antwortfeldern & Meilenstein-Badges",
    "Skripte, Einwände, Präsentationen und Rollenspiele",
  ],
};

function buildStepsFromDom(): CrmTutorialStep[] {
  if (typeof document === "undefined") return [];
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-tour-id]"));
  const seen = new Set<string>();
  const steps: CrmTutorialStep[] = [];
  for (const el of els) {
    const url = el.getAttribute("data-tour-id");
    if (!url || seen.has(url)) continue;
    const content = CRM_TUTORIAL_CONTENT[url];
    if (!content) continue;
    seen.add(url);
    steps.push({ url, ...content });
  }
  return steps;
}

const ROLE_BLOCKLIST = new Set(["kunde", "tippgeber"]);

export function CrmTutorialProvider({ children }: { children: React.ReactNode }) {
  const { user, authUser } = useUser();
  const { loaded, onboardingComplete, settings } = useUserSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const tutorialState: TutorialState = ((settings as any)?.crmTutorial ?? {}) as TutorialState;

  const [isActive, setIsActive] = useState(false);
  const [steps, setSteps] = useState<CrmTutorialStep[]>([]);
  const [index, setIndex] = useState(0);
  const autoStartedRef = useRef(false);

  const persist = useCallback(async (patch: Partial<TutorialState>) => {
    if (!authUser?.id) return;
    try {
      await supabase.rpc("merge_user_settings" as any, {
        p_user_id: authUser.id,
        p_patch: { crmTutorial: patch },
      });
    } catch (e) {
      console.warn("CrmTutorial: merge_user_settings failed", e);
    }
  }, [authUser?.id]);

  const start = useCallback((opts?: { fromStart?: boolean }) => {
    // Manueller Restart räumt den lokalen Guard ab
    lsClearSeen();
    // Deckblatt + DOM-Steps + Finale
    const domSteps = buildStepsFromDom();
    const all = [COVER_STEP, ...domSteps, FINAL_STEP];
    setSteps(all);
    const startIdx = opts?.fromStart ? 0 : Math.min(Math.max(tutorialState.lastIndex ?? 0, 0), all.length - 1);
    setIndex(startIdx);
    setIsActive(true);
    persist({ startedAt: new Date().toISOString(), lastIndex: startIdx });
    // Direkt zur URL des Schritts springen (Deckblatt & Finale sind virtuell)
    const first = all[startIdx];
    if (first && first.url !== "__finish__" && first.url !== "__cover__" && first.url !== location.pathname) {
      navigate(first.url);
    }
  }, [tutorialState.lastIndex, persist, navigate, location.pathname]);

  const resume = useCallback(() => start({ fromStart: false }), [start]);

  const stop = useCallback((opts?: { markDone?: boolean }) => {
    // Sofort synchron lokal markieren – so verhindert selbst ein sofortiger
    // Reload zuverlässig, dass das Popup erneut aufpoppt (unabhängig vom RPC).
    lsMarkSeen();
    setIsActive(false);
    persist({
      seen: true,
      completed: opts?.markDone ? true : (tutorialState.completed ?? false),
      lastIndex: index,
    });
  }, [persist, index, tutorialState.completed]);

  // Auto-Start EINMAL nach Freischaltung
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!loaded || !authUser?.id) return;
    if (!onboardingComplete) return;
    if (ROLE_BLOCKLIST.has(user.role)) return;
    if (tutorialState.seen === true) return;
    if (lsIsSeen()) return; // lokaler Sofort-Guard
    // kleine Verzögerung, damit die Sidebar sicher gemountet ist
    const t = window.setTimeout(() => {
      // Erneuter Guard, falls in der Zwischenzeit ein DB-Update reinkam
      if (lsIsSeen() || tutorialState.seen === true) return;
      autoStartedRef.current = true;
      start({ fromStart: true });
    }, 1000);
    return () => window.clearTimeout(t);
  }, [loaded, authUser?.id, onboardingComplete, user.role, tutorialState.seen, start]);

  // Navigation bei Index-Wechsel
  const goToIndex = useCallback((next: number) => {
    if (next < 0 || next >= steps.length) return;
    setIndex(next);
    persist({ lastIndex: next });
    const step = steps[next];
    if (step && step.url !== "__finish__" && step.url !== "__cover__" && step.url !== location.pathname) {
      navigate(step.url);
    }
  }, [steps, persist, navigate, location.pathname]);

  const currentStep = steps[index];
  const hasProgress = (tutorialState.lastIndex ?? 0) > 0 && tutorialState.completed !== true;

  // Sidebar-Highlight via data-Attribut auf <body>
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isActive && currentStep && currentStep.url !== "__finish__" && currentStep.url !== "__cover__") {
      document.body.setAttribute("data-crm-tour-url", currentStep.url);
    } else {
      document.body.removeAttribute("data-crm-tour-url");
    }
    return () => document.body.removeAttribute("data-crm-tour-url");
  }, [isActive, currentStep]);

  // Keyboard
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); goToIndex(index + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goToIndex(index - 1); }
      else if (e.key === "Escape") { e.preventDefault(); stop(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, index, goToIndex, stop]);

  const ctxValue: Ctx = useMemo(() => ({
    isActive,
    start: (o) => start(o),
    resume,
    stop,
    hasProgress,
    lastIndex: tutorialState.lastIndex ?? 0,
    totalSteps: steps.length,
  }), [isActive, start, resume, stop, hasProgress, tutorialState.lastIndex, steps.length]);

  return (
    <CrmTutorialContext.Provider value={ctxValue}>
      {children}
      <CrmTutorialStyles />
      {isActive && currentStep && (
        <CrmTutorialOverlay
          step={currentStep}
          index={index}
          total={steps.length}
          onNext={() => goToIndex(index + 1)}
          onPrev={() => goToIndex(index - 1)}
          onClose={() => stop()}
          onFinish={() => stop({ markDone: true })}
          onGotoAcademy={() => {
            stop({ markDone: true });
            navigate("/vertriebsakademie");
          }}
        />
      )}
    </CrmTutorialContext.Provider>
  );
}

function CrmTutorialStyles() {
  return (
    <style>{`
      body[data-crm-tour-url] [data-tour-id]:not([data-tour-id=""]) {
        transition: box-shadow .2s ease, background-color .2s ease;
      }
      body[data-crm-tour-url="/"] [data-tour-id="/"],
      body[data-crm-tour-url="/inbox"] [data-tour-id="/inbox"],
      body[data-crm-tour-url] [data-tour-id][data-crm-tour-hit="1"] {
        outline: 2px solid hsl(var(--primary));
        outline-offset: 2px;
        background-color: hsl(var(--primary) / 0.14) !important;
        border-radius: 0.5rem;
        animation: crmTourPulse 1.6s ease-in-out infinite;
      }
      @keyframes crmTourPulse {
        0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.35); }
        50% { box-shadow: 0 0 0 6px hsl(var(--primary) / 0); }
      }
    `}</style>
  );
}

/** Setzt zusätzlich data-crm-tour-hit=1 auf den passenden Sidebar-Eintrag,
 *  weil generische CSS-Attribute-Selektoren keine Variable kennen.
 */
function useHighlightSync(url: string | undefined) {
  useEffect(() => {
    if (typeof document === "undefined" || !url) return;
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-tour-id]"));
    for (const t of targets) {
      if (t.getAttribute("data-tour-id") === url) t.setAttribute("data-crm-tour-hit", "1");
      else t.removeAttribute("data-crm-tour-hit");
    }
    // Sichtbar scrollen
    const el = document.querySelector<HTMLElement>(`[data-tour-id="${CSS.escape(url)}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return () => {
      for (const t of targets) t.removeAttribute("data-crm-tour-hit");
    };
  }, [url]);
}

function CrmTutorialOverlay({
  step, index, total, onNext, onPrev, onClose, onFinish, onGotoAcademy,
}: {
  step: CrmTutorialStep;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onFinish: () => void;
  onGotoAcademy: () => void;
}) {
  useHighlightSync(step.url === "__finish__" || step.url === "__cover__" ? undefined : step.url);
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const isFinish = step.url === "__finish__";
  const isCover = step.url === "__cover__";
  const progressPct = Math.round(((index + 1) / total) * 100);

  // Deckblatt bekommt ein eigenes, im CI gehaltenes Layout
  if (isCover) {
    return (
      <div className="fixed inset-0 z-[100] pointer-events-none">
        <div
          className="absolute inset-0 bg-background/70 backdrop-blur-sm pointer-events-auto"
          onClick={onClose}
          aria-hidden
        />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(94vw,620px)] pointer-events-auto">
          <Card className="relative overflow-hidden border-primary/30 shadow-2xl">
            {/* CI-Hero-Verlauf */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent pointer-events-none"
              aria-hidden
            />
            <div
              className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl pointer-events-none"
              aria-hidden
            />
            <div className="relative p-8 md:p-10">
              <div className="flex items-start justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary uppercase tracking-wide">
                  <Sparkles className="h-3.5 w-3.5" /> CRM-Tutorial
                </div>
                <Button size="icon" aria-label="Akademie" variant="ghost" className="h-8 w-8 shrink-0 -mr-2 -mt-2" onClick={onClose} title="Schließen (nie mehr automatisch anzeigen)">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-6 flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30">
                  <GraduationCap className="h-8 w-8" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl md:text-3xl font-semibold leading-tight">{step.titel}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{step.kurz}</p>
                </div>
              </div>

              <p className="mt-6 text-sm text-foreground/85 leading-relaxed">{step.erklaerung}</p>

              {step.bullets && step.bullets.length > 0 && (
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {step.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-lg border bg-background/70 px-3 py-2 text-sm">
                      <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-8 flex items-center justify-between gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Nicht jetzt
                </Button>
                <Button size="lg" onClick={onNext} className="gap-2 shadow-md shadow-primary/20">
                  Tour starten <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground text-center">
                Nach dem Schließen startet das Tutorial nicht mehr automatisch. Manueller Start jederzeit über Einstellungen → Tutorial.
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Backdrop (klickt = pausieren) */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-[2px] pointer-events-auto"
        onClick={onClose}
        aria-hidden
      />
      {/* Zentrale Karte */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,560px)] pointer-events-auto">
        <Card className={cn("p-6 shadow-2xl border-primary/30", isFinish && "border-emerald-500/50")}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center",
                isFinish ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/15 text-primary",
              )}>
                {isFinish ? <Sparkles className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  CRM-Tutorial · Schritt {index + 1} / {total}
                </div>
                <h3 className="text-lg font-semibold truncate">{step.titel}</h3>
              </div>
            </div>
            <Button size="icon" aria-label="Tutorial schließen" variant="ghost" className="h-8 w-8 shrink-0" onClick={onClose} title="Schließen (später fortsetzen)">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress */}
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-4">
            <div className={cn("h-full transition-all", isFinish ? "bg-emerald-500" : "bg-primary")} style={{ width: `${progressPct}%` }} />
          </div>

          <p className="text-sm font-medium text-foreground/90 mb-2">{step.kurz}</p>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{step.erklaerung}</p>

          {step.bullets && step.bullets.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {step.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                  <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Actions */}
          <div className="mt-5 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Später fortsetzen
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onPrev} disabled={isFirst} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Zurück
              </Button>
              {isFinish ? (
                <>
                  <Button variant="outline" size="sm" onClick={onFinish}>Fertig</Button>
                  <Button size="sm" onClick={onGotoAcademy} className="gap-1">
                    Zur Vertriebsakademie <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={isLast ? onFinish : onNext} className="gap-1">
                  {isLast ? "Fertig" : "Weiter"} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground text-center">
            Tipp: ← / → zum Navigieren · Esc zum Schließen · jederzeit fortsetzbar in Einstellungen → Tutorial
          </p>
        </Card>
      </div>
    </div>
  );
}
