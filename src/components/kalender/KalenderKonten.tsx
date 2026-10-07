import { useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useUserSettings } from "@/hooks/useUserSettings";

/**
 * Kalenderkonten verbinden: Google ueber die Anmeldung mit dem Google-Konto,
 * Apple ueber CalDAV mit einem app-spezifischen Passwort.
 *
 * Bewusst eine einzige Komponente fuer alle Stellen, an denen man verbinden
 * kann. Vorher stand die Logik nur in den Einstellungen. Wer den Kalender
 * oeffnete und nichts sah, musste erst suchen, wo man ihn verbindet.
 */

interface Props {
  /** Kompakt: ohne die Liste der gefundenen Kalender, fuer schmale Stellen. */
  kompakt?: boolean;
  /** Nach erfolgreicher Verbindung, etwa um Termine neu zu laden. */
  aufAenderung?: () => void;
}

export function KalenderKonten({ kompakt = false, aufAenderung }: Props) {
  const { settings, saveSettings, appleCalendar, setAppleCalendar } = useUserSettings();

  const [appleLaeuft, setAppleLaeuft] = useState(false);
  const [appleFormular, setAppleFormular] = useState(false);
  const [appleId, setAppleId] = useState("");
  const [applePasswort, setApplePasswort] = useState("");
  const [googleLaeuft, setGoogleLaeuft] = useState(false);

  const google = settings?.google_calendar as
    | { connected?: boolean; email?: string; calendars?: { id: string; name: string; primary?: boolean }[] }
    | null;

  const verbindeApple = async () => {
    if (!appleId || !applePasswort) {
      toast.error("Bitte Apple-ID und app-spezifisches Passwort eingeben.");
      return;
    }
    setAppleLaeuft(true);
    try {
      const { data, error } = await supabase.functions.invoke("apple-calendar", {
        body: { action: "test-connection", appleId, appPassword: applePasswort },
      });
      if (error) throw error;
      const antwort = data as { connected?: boolean; message?: string; error?: string } | null;
      if (antwort?.connected) {
        setAppleCalendar(data as Parameters<typeof setAppleCalendar>[0]);
        setAppleFormular(false);
        setApplePasswort("");
        toast.success(antwort.message || "Apple Kalender verbunden.");
        aufAenderung?.();
      } else {
        toast.error(antwort?.error || "Die Verbindung kam nicht zustande.");
      }
    } catch (fehler) {
      toast.error("Die Verbindung kam nicht zustande. Bitte Apple-ID und Passwort prüfen.");
      console.error("verbindeApple:", fehler);
    } finally {
      setAppleLaeuft(false);
    }
  };

  const trenneApple = async () => {
    setAppleLaeuft(true);
    try {
      const { error } = await supabase.functions.invoke("apple-calendar", { body: { action: "disconnect" } });
      if (error) throw error;
      setAppleCalendar(null);
      toast.success("Apple Kalender getrennt.");
      aufAenderung?.();
    } catch (fehler) {
      toast.error("Der Kalender konnte nicht getrennt werden.");
      console.error("trenneApple:", fehler);
    } finally {
      setAppleLaeuft(false);
    }
  };

  const verbindeGoogle = async () => {
    setGoogleLaeuft(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar", { body: { action: "get-auth-url" } });
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error("Keine Anmeldeadresse erhalten");

      const fenster = window.open(url, "google-calendar", "width=520,height=680");
      const beiNachricht = (ereignis: MessageEvent) => {
        if (ereignis.data?.type === "google-calendar-success") {
          window.removeEventListener("message", beiNachricht);
          setGoogleLaeuft(false);
          saveSettings({
            ...settings,
            google_calendar: { connected: true, email: ereignis.data.email, calendars: ereignis.data.calendars },
          });
          toast.success(`Google Calendar verbunden als ${ereignis.data.email}.`);
          aufAenderung?.();
        } else if (ereignis.data?.type === "google-calendar-error") {
          window.removeEventListener("message", beiNachricht);
          setGoogleLaeuft(false);
          toast.error("Die Anmeldung bei Google wurde abgebrochen.");
        }
      };
      window.addEventListener("message", beiNachricht);

      // Wenn der Nutzer das Fenster einfach schliesst, kommt nie eine Antwort.
      const wache = window.setInterval(() => {
        if (fenster?.closed) {
          window.clearInterval(wache);
          window.removeEventListener("message", beiNachricht);
          setGoogleLaeuft(false);
        }
      }, 800);
    } catch (fehler) {
      setGoogleLaeuft(false);
      toast.error("Google Calendar konnte nicht geöffnet werden.");
      console.error("verbindeGoogle:", fehler);
    }
  };

  const trenneGoogle = async () => {
    setGoogleLaeuft(true);
    try {
      const { error } = await supabase.functions.invoke("google-calendar", { body: { action: "disconnect" } });
      if (error) throw error;
      saveSettings({ ...settings, google_calendar: null });
      toast.success("Google Calendar getrennt.");
      aufAenderung?.();
    } catch (fehler) {
      toast.error("Der Kalender konnte nicht getrennt werden.");
      console.error("trenneGoogle:", fehler);
    } finally {
      setGoogleLaeuft(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Google */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CalendarCheck className="h-4 w-4" /> Google Calendar
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {google?.connected
                ? `Verbunden als ${google.email || "Google-Konto"} · ${google.calendars?.length || 0} Kalender`
                : "Nicht verbunden. Anmeldung mit deinem Google-Konto."}
            </p>
          </div>
          {google?.connected ? (
            <Button variant="outline" size="sm" onClick={() => void trenneGoogle()} disabled={googleLaeuft}>
              {googleLaeuft ? "Wird getrennt…" : "Trennen"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void verbindeGoogle()} disabled={googleLaeuft}>
              {googleLaeuft ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Verbinde…</> : "Verbinden"}
            </Button>
          )}
        </div>

        {!kompakt && google?.connected && (google.calendars?.length ?? 0) > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Gefundene Kalender:</p>
            <div className="space-y-1">
              {google!.calendars!.map((kal, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <CheckCircle className="h-3 w-3 text-primary" />
                  <span>{kal.name}{kal.primary ? " (Primär)" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Apple */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CalendarCheck className="h-4 w-4" /> Apple Kalender
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {appleCalendar?.connected
                ? `Verbunden als ${appleCalendar.apple_id || "Apple-ID"} · ${appleCalendar.calendars?.length || 0} Kalender`
                : "Nicht verbunden. CalDAV-Verbindung zu iCloud."}
            </p>
          </div>
          {appleCalendar?.connected ? (
            <Button variant="outline" size="sm" onClick={() => void trenneApple()} disabled={appleLaeuft}>
              {appleLaeuft ? "Wird getrennt…" : "Trennen"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setAppleFormular((v) => !v)} disabled={appleLaeuft}>
              Verbinden
            </Button>
          )}
        </div>

        {appleFormular && !appleCalendar?.connected && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">So bekommst du das Passwort:</p>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                <li>
                  Gehe zu{" "}
                  <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    appleid.apple.com
                  </a>
                </li>
                <li>Unter „Anmeldung und Sicherheit" auf „App-spezifische Passwörter"</li>
                <li>Ein neues Passwort mit dem Namen „OS Immobilien CRM" erstellen</li>
                <li>Das erzeugte Passwort hier einfügen</li>
              </ol>
            </div>
            <div>
              <Label htmlFor="apple-id">Apple-ID (E-Mail)</Label>
              <Input id="apple-id" value={appleId} onChange={(e) => setAppleId(e.target.value)} placeholder="deine@icloud.com" className="mt-1.5" autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="apple-passwort">App-spezifisches Passwort</Label>
              <Input id="apple-passwort" type="password" value={applePasswort} onChange={(e) => setApplePasswort(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" className="mt-1.5" autoComplete="off" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void verbindeApple()} disabled={appleLaeuft || !appleId || !applePasswort}>
                {appleLaeuft ? "Verbinde…" : "Jetzt verbinden"}
              </Button>
              <Button variant="outline" onClick={() => setAppleFormular(false)}>Abbrechen</Button>
            </div>
          </div>
        )}

        {!kompakt && appleCalendar?.connected && (appleCalendar.calendars?.length ?? 0) > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Gefundene Kalender:</p>
            <div className="space-y-1">
              {appleCalendar.calendars!.map((kal, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <CheckCircle className="h-3 w-3 text-primary" />
                  <span>{kal.name || "Unbenannt"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
