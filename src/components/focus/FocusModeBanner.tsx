/**
 * Sticky Fokus-Modus-Banner. Wird direkt unter der HeaderBar gerendert,
 * wenn eine aktive Fokus-Queue existiert und die aktuelle Route zum
 * Kundenprofil des aktuellen Tasks passt.
 *
 * Aktionen: Erledigt & weiter · Verschieben (+1/+3/nächster Werktag/+7)
 *           Überspringen · Bearbeiten (öffnet Kundenprofil-Aufgabenbereich)
 *           Pause · Beenden. Tastatur: E, V, N, Esc.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, X, Pause, SkipForward, Clock, Phone, Monitor, CalendarDays, Target, Trophy, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Confetti from "@/components/analysis/Confetti";
import {
  loadFocusQueue,
  currentFocusTask,
  isFocusQueueFinished,
  markCurrentCompleted,
  markCurrentSkipped,
  exitFocusQueue,
  pauseFocusQueue,
  focusQueueEvent,
  type FocusQueueState,
  type FocusTask,
} from "@/lib/focusQueueStore";
import { postponeTask, resolvePreset, type PostponePreset } from "@/lib/postponeTask";
import { completeFollowUp, deleteFollowUp } from "@/lib/followUpStore";
import { erledigeAufgabe } from "@/lib/aufgabenStore";
import { removeInboxTask, addAktivitaet } from "@/lib/aktivitaetenStore";
import { markInboxTaskDone } from "@/lib/inboxCountStore";
import { updateBewerber } from "@/lib/bewerbungStore";
import { istBewerberErinnerungId } from "@/lib/bewerberErinnerungen";
import { toast } from "sonner";
import { tarnName } from "@/lib/vorfuehrmodus";

const TYP_ICONS: Record<string, typeof Phone> = {
  anruf: Phone,
  meeting: Monitor,
  follow_up: Clock,
  aufgabe: Target,
  deadline: CalendarDays,
};
const TYP_LABELS: Record<string, string> = {
  anruf: "Anruf",
  meeting: "Meeting",
  follow_up: "Follow-Up",
  aufgabe: "Aufgabe",
  deadline: "Deadline",
};

function useQueueState(): [FocusQueueState | null, () => void] {
  const [state, setState] = useState<FocusQueueState | null>(() => loadFocusQueue());
  const refresh = useCallback(() => setState(loadFocusQueue()), []);
  useEffect(() => {
    const h = () => refresh();
    window.addEventListener(focusQueueEvent(), h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(focusQueueEvent(), h);
      window.removeEventListener("storage", h);
    };
  }, [refresh]);
  return [state, refresh];
}

function focusTaskPath(task: FocusTask): string {
  if (task.source === "bewerber" || istBewerberErinnerungId(task.id)) {
    return `/bewerberprozess?openBewerber=${task.kundeId}&focus=1`;
  }
  return `/kunden/${task.kundeId}?focus=1`;
}
function focusTaskProfileMatch(pathname: string, task: FocusTask): boolean {
  if (task.source === "bewerber" || istBewerberErinnerungId(task.id)) {
    return pathname === "/bewerberprozess";
  }
  return pathname === `/kunden/${task.kundeId}`;
}
function goToTaskProfile(navigate: ReturnType<typeof useNavigate>, task: FocusTask) {
  navigate(focusTaskPath(task), { replace: false });
}

export function FocusModeBanner() {
  const [state, refresh] = useQueueState();
  const navigate = useNavigate();
  const location = useLocation();

  const current = currentFocusTask(state);
  const finished = isFocusQueueFinished(state);
  const total = state?.tasks.length ?? 0;
  const doneCount = state ? state.completedIds.length + state.skippedIds.length : 0;

  // Navigation: bei jedem Task-Wechsel gezielt zur neuen URL springen
  const lastNavKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state || state.paused || finished || !current) return;
    const key = `${current.source ?? "kunde"}:${current.kundeId}:${state.currentIndex}`;
    if (lastNavKeyRef.current === key) return;
    lastNavKeyRef.current = key;
    goToTaskProfile(navigate, current);
  }, [state?.currentIndex, state?.paused, current?.kundeId, current?.source, finished]);

  const handleComplete = useCallback(() => {
    if (!state || !current) return;
    // Persist Erledigung. Die Reihenfolge folgt der Inbox-Liste, damit eine
    // im Fokus erledigte Aufgabe an genau derselben Stelle geschlossen wird.
    if (current.id.startsWith("ag-")) {
      // Eine Ablehnung meldet der Zwischenspeicher selbst.
      erledigeAufgabe(current.id.slice(3)).catch(() => {});
    } else if (current.id.startsWith("fu-")) {
      completeFollowUp(current.id.slice(3));
    } else if (current.id.startsWith("bw-")) {
      updateBewerber(current.id.slice(3), { followUpDatum: "", followUpUhrzeit: "", followUpNotiz: "" });
      markInboxTaskDone(current.id);
    } else {
      markInboxTaskDone(current.id);
      removeInboxTask(current.id);
    }
    addAktivitaet({
      kundeId: current.kundeId,
      art: current.typ === "meeting" ? "meeting" : current.typ === "anruf" ? "anruf" : "aufgabe",
      beschreibung: `✅ Erledigt (Fokus-Modus): ${current.titel}`,
      details: current.beschreibung,
      erledigtAm: new Date().toISOString(),
    });
    toast.success("Aufgabe erledigt", { description: current.titel });
    markCurrentCompleted();
    refresh();
  }, [state, current, refresh]);

  const handlePostpone = useCallback((preset: PostponePreset) => {
    if (!state || !current) return;
    const newDate = resolvePreset(preset);
    postponeTask(current.id, newDate);
    toast.info("Aufgabe verschoben", {
      description: `${current.titel} → ${newDate.toLocaleDateString("de-DE")}`,
    });
    // Verschobene Aufgabe zählt nicht als "erledigt" – wir markieren sie als skipped,
    // damit die Queue weiterläuft und sie am neuen Datum erneut erscheint.
    markCurrentSkipped();
    refresh();
  }, [state, current, refresh]);

  const handleSkip = useCallback(() => {
    if (!state || !current) return;
    toast("Übersprungen", { description: current.titel });
    markCurrentSkipped();
    refresh();
  }, [state, current, refresh]);

  const handlePause = useCallback(() => {
    pauseFocusQueue();
    refresh();
    toast("Fokus-Modus pausiert", { description: "Du kannst frei navigieren und in der Inbox fortsetzen." });
  }, [refresh]);

  const handleExit = useCallback(() => {
    exitFocusQueue();
    refresh();
  }, [refresh]);

  // Tastatur-Shortcuts
  useEffect(() => {
    if (!state || state.paused || finished) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (e.key === "e" || e.key === "E") { e.preventDefault(); handleComplete(); }
      else if (e.key === "v" || e.key === "V") { e.preventDefault(); handlePostpone("plus1"); }
      else if (e.key === "n" || e.key === "N") { e.preventDefault(); handleSkip(); }
      else if (e.key === "Escape") { e.preventDefault(); handlePause(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, finished, handleComplete, handlePostpone, handleSkip, handlePause]);

  if (!state) return null;
  if (state.paused) return null;

  // Fertig-Screen
  if (finished) {
    const durationMs = new Date().getTime() - new Date(state.startedAt).getTime();
    const minutes = Math.max(1, Math.round(durationMs / 60000));
    return (
      <div className="relative border-b bg-gradient-to-r from-emerald-500/10 via-primary/5 to-amber-500/10">
        <Confetti trigger count={80} />
        <div className="max-w-screen-2xl mx-auto flex items-center gap-3 px-4 py-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center shadow-md">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">🎉 Fokus-Modus beendet – {total}/{total} abgearbeitet</div>
            <div className="text-xs text-muted-foreground">
              {state.completedIds.length} erledigt · {state.skippedIds.length} verschoben/übersprungen · {minutes} Min
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => { handleExit(); navigate("/inbox"); }}>
            Zurück zur Inbox
          </Button>
          <Button size="sm" onClick={handleExit}>Schließen</Button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  // Banner nur zeigen, wenn wir tatsächlich im passenden Kundenprofil sind
  const isOnCurrentProfile = focusTaskProfileMatch(location.pathname, current);
  if (!isOnCurrentProfile) return null;

  const Icon = TYP_ICONS[current.typ] || Clock;
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const position = state.currentIndex + 1;

  return (
    <div className="sticky top-0 z-40 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent backdrop-blur">
      <Card className="mx-3 my-2 border-primary/40 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Icon className="h-4 w-4" />
            </div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-primary">Fokus-Modus</div>
            <span className="text-xs text-muted-foreground">Aufgabe {position} / {total}</span>
          </div>

          <div className="flex-1 min-w-[240px]">
            <div className="text-sm font-semibold text-foreground truncate">
              {TYP_LABELS[current.typ]}: {current.titel}
            </div>
            <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
              <User className="h-3 w-3" /> {tarnName(current.kundeName)}
              {current.beschreibung && <span className="opacity-70">· {current.beschreibung}</span>}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" onClick={handleComplete} className="gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Erledigt <span className="opacity-70 text-[10px] ml-0.5">(E)</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Verschieben <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handlePostpone("plus1")}>+ 1 Tag <span className="ml-auto text-[10px] opacity-60">V</span></DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePostpone("plus3")}>+ 3 Tage</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePostpone("nextWorkday")}>Nächster Werktag</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePostpone("plus7")}>+ 1 Woche</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" onClick={handleSkip} title="Überspringen (N)">
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handlePause} title="Pause (Esc)">
              <Pause className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleExit} title="Fokus-Modus beenden">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Progress value={progressPct} className="h-1 rounded-none" />
      </Card>
    </div>
  );
}