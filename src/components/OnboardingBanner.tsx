import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, User, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useUser } from "@/contexts/UserContext";
import { useUserSettings } from "@/hooks/useUserSettings";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { istRouteGesperrt } from "@/lib/sidebarPermissions";
import { ladeVerfuegbarkeiten } from "@/lib/buchungStore";

type WizardStep = {
  id: "profil" | "videozeiten";
  title: string;
  desc: string;
  icon: typeof User;
  /** Reiter innerhalb der Einstellungen. */
  tab: string;
  /** Führt dieser Schritt aus den Einstellungen heraus, steht hier die Adresse. */
  route?: string;
};

/** Die Buchungsseite, auf der die Zeiten gepflegt werden. */
const VIDEOZEITEN_ROUTE = "/videocall/buchungen";

const ALL_STEPS: WizardStep[] = [
  // CRM-Academy wurde als Onboarding-Schritt entfernt. Sobald das Profil
  // vollständig ausgefüllt ist, wird das CRM direkt freigeschaltet.
  { id: "profil", title: "Profil vervollständigen", desc: "Foto, Kontaktdaten, Geburtsdatum & Gewerbedaten", icon: User, tab: "profil" },
  /*
   * Zweiter Schritt seit dem 19.09.2026.
   *
   * Wer sich zum ersten Mal anmeldet, füllt sein Profil aus und ist damit
   * fertig. Seine Zeiten für Videogespräche hinterlegt er dabei nicht, weil er
   * gar nicht weiß, dass es die gibt. Ohne Zeiten geht aber kein Buchungslink
   * hinaus, und der Kalender sieht für den Kunden aus wie ein Haus ohne Türen.
   *
   * Der Schritt führt bewusst AUF die Buchungsseite und hält die Zeiten nicht
   * selbst. Sie ein zweites Mal in den Einstellungen zu pflegen, hieße zwei
   * Orte für dieselbe Sache, und dort steht bereits eine Anleitung in drei
   * Schritten, die genau hier weiterhilft.
   *
   * Er erscheint nur, wenn die Person den Videocall-Bereich wirklich sehen
   * darf. Ein Haken, den man nicht setzen kann, wäre schlimmer als kein Haken.
   */
  {
    id: "videozeiten",
    title: "Zeiten für Videogespräche",
    desc: "Wann Kunden bei Dir einen Termin buchen können",
    icon: CalendarClock,
    tab: "profil",
    route: VIDEOZEITEN_ROUTE,
  },
];

function computeCompletedSteps(
  settings: any,
  avatarUrl: string | null,
  appleCalendar: any,
  profileEmail?: string | null,
  geburtstag?: string | null,
  requireGewerbe: boolean = true,
  hatVideozeiten: boolean = false,
): string[] {
  const done: string[] = [];

  if (settings?.profil) {
    const p = settings.profil;
    const emailValid = !!profileEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileEmail.trim());
    const g = settings?.gewerbedaten;
    const gewerbeOk =
      !requireGewerbe ||
      (!!g?.rechtsform?.trim() &&
        !!g?.firmenname?.trim() &&
        !!g?.strasse?.trim() &&
        !!g?.hausnummer?.trim() &&
        !!g?.plz?.trim() &&
        !!g?.ort?.trim());
    const profilComplete =
      avatarUrl &&
      p.vorname?.trim() &&
      p.nachname?.trim() &&
      p.telefon?.trim() &&
      p.position?.trim() &&
      emailValid &&
      !!geburtstag?.trim() &&
      gewerbeOk;
    if (profilComplete) done.push("profil");
  }

  // Ein einziger offener Wochentag genügt. Es geht darum, dass der Kalender
  // überhaupt Türen hat, nicht darum, wie viele.
  if (hatVideozeiten) done.push("videozeiten");

  return done;
}

interface OnboardingBannerProps {
  onNavigateTab: (tab: string) => void;
  liveSettings?: any;
  liveCloserList?: any[] | null;
  liveAvatarUrl?: string | null;
  liveGeburtstag?: string | null;
  liveProfileEmail?: string | null;
}

export function OnboardingBanner({ onNavigateTab, liveSettings, liveAvatarUrl, liveGeburtstag, liveProfileEmail }: OnboardingBannerProps) {
  const { user } = useUser();
  const {
    loaded,
    settings: dbSettings,
    appleCalendar,
    onboardingSteps: _dbSteps,
    saveOnboardingSteps,
    onboardingComplete,
  } = useUserSettings();
  const isSetterin = user.role === "setterin";

  const navigate = useNavigate();

  /*
   * Den Schritt mit den Videozeiten sieht nur, wer die Buchungsseite auch
   * öffnen darf. Geprüft wird mit derselben Funktion, die den Routenschutz
   * entscheidet, nicht mit einer zweiten eigenen Regel. Sonst zeigte das
   * Banner irgendwann einen Haken an, hinter dem eine gesperrte Seite liegt.
   */
  // Die Kennung kommt aus der Anmeldung und wird weiter unten nachgeladen.
  // Bis dahin entscheidet die Rolle allein; das kann den Schritt einen Moment
  // später erscheinen lassen, zeigt ihn aber nie jemandem, der ihn nicht hat.
  const [authId, setAuthId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const darfVideozeiten = !istRouteGesperrt(VIDEOZEITEN_ROUTE, user.role, {
    email: authEmail ?? user.email,
    userId: authId,
  });

  // Profil enthält jetzt auch Gewerbedaten (außer für Setter:innen). Academy bleibt für alle Rollen sichtbar.
  const steps: WizardStep[] = darfVideozeiten
    ? ALL_STEPS
    : ALL_STEPS.filter((s) => s.id !== "videozeiten");

  const [hatVideozeiten, setHatVideozeiten] = useState(false);
  useEffect(() => {
    if (!darfVideozeiten) return;
    let abgebrochen = false;
    ladeVerfuegbarkeiten()
      .then((zeilen) => {
        if (abgebrochen) return;
        // Nur der Wochenplan zählt. Einzelne Ausnahmen haben ein `datum` und
        // sind Urlaub oder Sondertermine, kein regelmäßiges Angebot.
        setHatVideozeiten(zeilen.some((z) => z.wochentag !== null && !z.geschlossen));
      })
      .catch(() => {
        // Ein Fehler beim Laden darf das Banner nicht zerlegen. Dann bleibt der
        // Schritt offen, und das ist die harmlosere Richtung.
      });
    return () => { abgebrochen = true; };
  }, [darfVideozeiten]);

  const effectiveSettings = liveSettings ?? dbSettings;

  const [dbAvatarUrl, setDbAvatarUrl] = useState<string | null>(null);
  const [dbProfileEmail, setDbProfileEmail] = useState<string | null>(null);
  const [dbGeburtstag, setDbGeburtstag] = useState<string | null>(null);
  const effectiveAvatarUrl = liveAvatarUrl !== undefined ? liveAvatarUrl : dbAvatarUrl;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (!authUser) return;
      setAuthId(authUser.id);
      setAuthEmail(authUser.email ?? null);
      supabase.from("profiles").select("avatar_url, email, geburtstag").eq("id", authUser.id).single()
        .then(({ data }) => {
          if (data?.avatar_url) setDbAvatarUrl(data.avatar_url);
          setDbProfileEmail((data as any)?.email ?? authUser.email ?? null);
          setDbGeburtstag((data as any)?.geburtstag ?? null);
        });
    });
  }, [loaded]);


  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  useEffect(() => {
    if (!loaded) return;
    const effectiveEmail = liveProfileEmail !== undefined ? liveProfileEmail : dbProfileEmail;
    const effectiveGeburtstag = liveGeburtstag !== undefined ? liveGeburtstag : dbGeburtstag;
    const computed = computeCompletedSteps(effectiveSettings, effectiveAvatarUrl, appleCalendar, effectiveEmail, effectiveGeburtstag, true, hatVideozeiten);
    setCompletedSteps(computed);
  }, [loaded, effectiveSettings, effectiveAvatarUrl, appleCalendar, dbProfileEmail, dbGeburtstag, liveProfileEmail, liveGeburtstag, isSetterin, hatVideozeiten]);

  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (loaded && !initialized) {
      setInitialized(true);
      return;
    }
    if (initialized && completedSteps.length > 0) {
      saveOnboardingSteps(completedSteps);
    }
  }, [completedSteps, initialized]);

  const isStepDone = (id: string) => completedSteps.includes(id);
  const requiredIds = steps.map((s) => s.id);
  const allDone = requiredIds.every((id) => isStepDone(id));

  // Aktiver Schritt = erster nicht-erledigter (oder letzter, wenn alles fertig).
  const activeIndex = (() => {
    const idx = steps.findIndex((s) => !isStepDone(s.id));
    return idx === -1 ? steps.length - 1 : idx;
  })();

  if (onboardingComplete && allDone) return null;

  const handleStepClick = (step: WizardStep, index: number) => {
    if (step.route) {
      navigate(step.route);
      return;
    }
    onNavigateTab(step.tab);
  };

  return (
    <Card className="p-6 mb-6 border-primary/20 bg-card">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">Willkommen bei OS Immobilien!</h3>
        <p className="text-sm text-muted-foreground">
          In {steps.length} Schritten zum freigeschalteten Backoffice – schließe einen Schritt ab, um zum nächsten zu gelangen.
        </p>
      </div>

      {/* Stepper */}
      <ol className="flex items-start gap-2 sm:gap-3">
        {steps.map((step, index) => {
          const done = isStepDone(step.id);
          const isActive = index === activeIndex && !done;
          const isUpcoming = index > activeIndex && !done;
          const Icon = step.icon;
          const isLast = index === steps.length - 1;

          return (
            <li key={step.id} className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => handleStepClick(step, index)}
                className={cn(
                  "w-full text-left rounded-lg border p-3 sm:p-4 transition-all flex flex-col gap-2",
                  done && "bg-green-500/10 border-green-500/40",
                  isActive && "bg-primary/5 border-primary/40 ring-2 ring-primary/20",
                  isUpcoming && "bg-muted/30 border-border/60 opacity-70",
                  !isUpcoming && "hover:shadow-sm cursor-pointer",
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Step-Nummer / Status-Bubble */}
                  <div
                    className={cn(
                      "h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold border-2",
                      done && "bg-green-500 border-green-500 text-white",
                      isActive && "bg-primary border-primary text-primary-foreground",
                      isUpcoming && "bg-muted border-border text-muted-foreground",
                    )}
                  >
                    {done ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          done && "text-green-600 dark:text-green-400",
                          isActive && "text-primary",
                          isUpcoming && "text-muted-foreground",
                        )}
                      />
                      <p
                        className={cn(
                          "text-xs uppercase tracking-wide font-semibold truncate",
                          done && "text-green-600 dark:text-green-400",
                          isActive && "text-primary",
                          isUpcoming && "text-muted-foreground",
                        )}
                      >
                        Schritt {index + 1}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm font-semibold leading-tight truncate",
                      done && "text-green-700 dark:text-green-300",
                      isActive && "text-foreground",
                      isUpcoming && "text-muted-foreground",
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{step.desc}</p>
                </div>
                {/* CTA-Hinweis nur am aktiven Schritt */}
                {isActive && (
                  <div className="flex items-center gap-1 text-xs font-medium text-primary mt-1">
                    Jetzt erledigen <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                )}
                {done && (
                  <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                    Erledigt
                  </span>
                )}
              </button>
              {/* Verbindungslinie zwischen Steps (nur visuell, mobil ausgeblendet) */}
              {!isLast && (
                <div
                  aria-hidden
                  className={cn(
                    "hidden sm:block h-0.5 -mt-px mx-1 transition-colors",
                    done ? "bg-green-500/60" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
