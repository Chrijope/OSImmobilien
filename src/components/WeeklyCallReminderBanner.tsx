import { useEffect, useMemo, useState } from "react";
import { Video, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import { aktuellerWeeklyCall } from "@/components/dashboard/WeeklyCallCard";
import { CALL_RUNDEN, ZOOM_URL, callRundenFuer } from "@/lib/weeklyCallZeit";

/**
 * Globaler Banner für den Weekly Sales Call, montags.
 * Erscheint 1 Stunde und 5 Minuten vorher sowie während der laufenden Sitzung.
 *
 * Jeder sieht nur seinen Call: Lead-Berater den um 19:00, Vertriebspartner den
 * um 19:30, die Leitung (Admin, Inhaber, Vertriebsleitung) beide, jeweils den,
 * der gerade ansteht (`aktuellerWeeklyCall`). Alle anderen Rollen keinen.
 */

const DURATION_MS = 90 * 60 * 1000; // Banner bleibt bis 90 Min nach Start sichtbar
const DISMISS_KEY = "mi_dismissed_weekly_call_reminder";

// Termin und Uhrzeit kommen aus der Karte auf dem Dashboard. Vorher rechnete
// der Banner den Termin selbst aus, mit einer eigenen Kopie der Logik. Beim
// Verschieben des Calls hätte man beide Stellen ändern müssen.

function loadDismissed(): string | null {
  try { return localStorage.getItem(DISMISS_KEY); } catch { return null; }
}

export function WeeklyCallReminderBanner() {
  const { user } = useUser();
  const [now, setNow] = useState(Date.now());
  const [dismissedKey, setDismissedKey] = useState<string | null>(() => loadDismissed());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const banner = useMemo(() => {
    const runden = callRundenFuer(user.role, user.rollenVariante);
    const call = aktuellerWeeklyCall(runden, new Date(now));
    if (!call) return null;
    const startTs = call.start.getTime();
    const diff = startTs - now;
    const running = diff <= 0 && now <= startTs + DURATION_MS;
    const in5min = diff > 0 && diff <= 5 * 60 * 1000;
    const in1h = diff > 0 && diff <= 60 * 60 * 1000 && diff > 5 * 60 * 1000;
    if (!running && !in5min && !in1h) return null;
    const phase = running ? "running" : in5min ? "5min" : "1h";
    // Der Call steckt im Schlüssel, damit das Wegklicken des 19:00-Calls den
    // 19:30-Call nicht mit verschluckt.
    const key = `${call.start.toISOString().slice(0, 10)}:${call.runde}:${phase}`;
    if (dismissedKey === key) return null;
    const gruppe = runden.length > 1 ? CALL_RUNDEN[call.runde].gruppe : null;
    return { phase, key, startTs, diff, gruppe };
  }, [user.role, user.rollenVariante, now, dismissedKey]);

  if (!banner) return null;

  const startHHMM = new Date(banner.startTs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const absSec = Math.max(0, Math.floor(Math.abs(banner.diff) / 1000));
  const mm = String(Math.floor(absSec / 60)).padStart(2, "0");
  const ss = String(absSec % 60).padStart(2, "0");
  const totalMinUntil = Math.ceil(banner.diff / 60000);

  const text =
    banner.phase === "running"
      ? `läuft jetzt, bitte zeitnah einwählen (Start ${startHHMM} Uhr)`
      : banner.phase === "5min"
      ? `startet in ${mm}:${ss}, bitte jetzt einwählen (${startHHMM} Uhr)`
      : `startet in ${totalMinUntil} Minuten (${startHHMM} Uhr), bitte rechtzeitig bereitmachen`;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, banner.key); } catch {}
    setDismissedKey(banner.key);
  };

  const open = () => window.open(ZOOM_URL, "_blank", "noopener,noreferrer");
  const running = banner.phase === "running";

  return (
    <div className={`px-4 py-2.5 flex items-center gap-3 border-b ${running ? "bg-destructive/10 border-destructive/30" : "bg-primary/5 border-primary/15"}`}>
      <Video className={`h-4 w-4 shrink-0 ${running ? "text-destructive animate-pulse" : "text-primary"}`} />
      <div className="flex-1 text-xs sm:text-sm min-w-0">
        <span className="font-medium text-foreground">
          Weekly Sales Call{banner.gruppe ? ` ${banner.gruppe}` : ""}
        </span>
        <span className="text-muted-foreground ml-2 truncate">{text}</span>
      </div>
      <Button size="sm" variant={running ? "destructive" : "default"} className="h-7 text-xs gap-1" onClick={open}>
        <ExternalLink className="h-3 w-3" /> Jetzt einwählen
      </Button>
      <button
        onClick={dismiss}
        className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
        aria-label="Hinweis ausblenden"
        title="Hinweis ausblenden"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}