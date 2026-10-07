import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";

// Throttle: gleicher Toast nicht mehrfach in kurzer Zeit (verhindert Burst-Spam)
let _lastToastAt = 0;
function toastErrorThrottled(msg: string) {
  const now = Date.now();
  if (now - _lastToastAt < 3000) return;
  _lastToastAt = now;
  toast.error(msg);
}

async function withRetry(fn: () => Promise<{ error: any; data?: any }>, max = 3): Promise<{ error: any; data?: any }> {
  let last: any = null;
  for (let i = 0; i < max; i++) {
    const res = await fn();
    if (!res.error) return res;
    last = res.error;
    const m = String(res.error?.message || "").toLowerCase();
    if (!(m.includes("failed to fetch") || m.includes("network") || m.includes("timeout"))) return res;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return { error: last };
}

interface AppleCalendarData {
  connected: boolean;
  apple_id: string;
  calendars?: { name: string; url: string }[];
  connected_at?: string;
}

interface UserSettingsRow {
  id: string;
  user_id: string;
  einstellungen: any;
  unterlagen: any;
  closer_list: any;
  onboarding_steps: any;
  onboarding_complete: boolean;
  apple_calendar: AppleCalendarData | null;
}

export function useUserSettings() {
  const { authUser } = useUser();
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettingsState] = useState<any>(null);
  const [unterlagen, setUnterlagenState] = useState<any>(null);
  const [closerList, setCloserListState] = useState<any>(null);
  const [onboardingSteps, setOnboardingStepsState] = useState<string[]>([]);
  const [onboardingComplete, setOnboardingCompleteState] = useState(false);
  const [appleCalendar, setAppleCalendarState] = useState<AppleCalendarData | null>(null);
  const [customPermissions, setCustomPermissions] = useState<string[] | undefined>(undefined);
  const rowId = useRef<string | null>(null);
  // Letzter erfolgreich aus der DB gelesener Onboarding-Wert.
  // Wird benutzt, um bei transienten Reloads/Netzwerkfehlern NICHT auf false
  // zurückzufallen (was sonst einen Zwangs-Redirect in /einstellungen auslöst
  // und offene Seiten unmountet → Datenverlust beim Bearbeiten von Kunden).
  const lastKnownOnboardingComplete = useRef<boolean | null>(null);
  const hasLoadedOnceRef = useRef(false);

  // Load from DB with a safe fallback so the shell never stays blocked forever.
  useEffect(() => {
    let cancelled = false;

    const resetState = () => {
      rowId.current = null;
      setSettingsState(null);
      setUnterlagenState(null);
      setCloserListState(null);
      setOnboardingStepsState([]);
      setOnboardingCompleteState(true);
      setAppleCalendarState(null);
      setCustomPermissions(undefined);
      lastKnownOnboardingComplete.current = null;
      hasLoadedOnceRef.current = false;
    };

    if (!authUser) {
      resetState();
      setLoaded(true);
      return;
    }

    // WICHTIG: Beim Re-Auth (z.B. Token-Refresh, Tab-Refokus) NICHT loaded
    // zurücksetzen, sonst rendert die AppShell den globalen LoadingFallback
    // und unmountet die gerade offene Seite (z.B. KundenDetail) → ungespeicherte
    // Eingaben gehen verloren. Nur beim allerersten Laden blockieren.
    if (!hasLoadedOnceRef.current) {
      setLoaded(false);
    }

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      console.warn("useUserSettings: Timeout beim Laden – App wird mit Fallback fortgesetzt.");
      // Don't override onboardingComplete to true on timeout – keep actual DB state
      setLoaded(true);
    }, 8000);

    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("user_settings" as any)
          .select("*")
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (error) throw error;
        if (cancelled) return;

        if (data) {
          const row = data as any as UserSettingsRow;
          rowId.current = row.id;
          setSettingsState(row.einstellungen && Object.keys(row.einstellungen).length > 0 ? row.einstellungen : null);
          setUnterlagenState(row.unterlagen && (row.unterlagen as any[]).length > 0 ? row.unterlagen : null);
          setCloserListState(row.closer_list || null);
          setOnboardingStepsState((row.onboarding_steps as string[]) || []);
          const nextOnboarding = Boolean(row.onboarding_complete);
          setOnboardingCompleteState(nextOnboarding);
          lastKnownOnboardingComplete.current = nextOnboarding;
          setAppleCalendarState(row.apple_calendar || null);
          const einst = row.einstellungen as any;
          setCustomPermissions(einst?.custom_permissions);
          return;
        }

        const { data: newRow, error: insertError } = await supabase
          .from("user_settings" as any)
          .insert({ user_id: authUser.id } as any)
          .select()
          .maybeSingle();

        if (insertError) throw insertError;
        if (!cancelled && newRow) rowId.current = (newRow as any).id;
      } catch (error) {
        console.error("useUserSettings: Laden fehlgeschlagen, verwende Fallback.", error);
        // Wenn wir schon einmal erfolgreich geladen haben, behalten wir den
        // letzten bekannten Zustand komplett bei. So führt ein transienter
        // Netzwerkfehler beim Re-Fetch NICHT zu einem Zwangs-Redirect ins
        // Onboarding oder zum Verlust von Settings im UI.
        if (!cancelled && !hasLoadedOnceRef.current) {
          rowId.current = null;
          setSettingsState(null);
          setUnterlagenState(null);
          setCloserListState(null);
          setOnboardingStepsState([]);
          // Beim allerersten Versuch (noch nie geladen) bleibt der Default
          // (false) bestehen, damit Onboarding für echte Neu-Nutzer greift.
          setAppleCalendarState(null);
          setCustomPermissions(undefined);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          hasLoadedOnceRef.current = true;
          setLoaded(true);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  // Nur auf User-ID-Wechsel reagieren (nicht auf jede neue authUser-Referenz
  // nach Token-Refresh / onAuthStateChange), sonst rerunt der Effekt ständig
  // und kann die offene Seite unmounten.
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser) return;

    const handleOnboardingComplete = () => {
      setOnboardingCompleteState(true);
      setLoaded(true);
    };

    const applyRealtimeUpdate = (row: Partial<UserSettingsRow> | null | undefined) => {
      if (!row) return;

      if (typeof row.onboarding_complete === "boolean") {
        setOnboardingCompleteState(row.onboarding_complete);
      }

      const nextSettings = row.einstellungen;
      if (nextSettings && typeof nextSettings === "object") {
        setCustomPermissions((nextSettings as any).custom_permissions);
      }
    };

    window.addEventListener("onboarding-complete", handleOnboardingComplete);

    const channel = supabase
      // Eindeutiger Name je Aufbau: Bei festem Namen liefert supabase.channel()
      // den noch laufenden Kanal des vorigen Aufbaus zurück (StrictMode,
      // schneller Neuaufbau), und .on() nach subscribe() wirft.
      .channel(`user-settings-sync-${authUser.id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_settings", filter: `user_id=eq.${authUser.id}` },
        (payload: any) => applyRealtimeUpdate(payload.new as Partial<UserSettingsRow>)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_settings", filter: `user_id=eq.${authUser.id}` },
        (payload: any) => applyRealtimeUpdate(payload.new as Partial<UserSettingsRow>)
      )
      .subscribe();

    return () => {
      window.removeEventListener("onboarding-complete", handleOnboardingComplete);
      supabase.removeChannel(channel);
    };
  }, [authUser]);

  const updateField = useCallback(async (field: string, value: any) => {
    if (!authUser) return;
    const { error } = await withRetry(() =>
      supabase
        .from("user_settings" as any)
        .update({ [field]: value, updated_at: new Date().toISOString() } as any)
        .eq("user_id", authUser.id) as any
    );
    if (error) {
      console.error(`useUserSettings: Fehler beim Speichern von ${field}:`, error);
      toastErrorThrottled("Einstellung konnte nicht gespeichert werden.");
    }
  }, [authUser]);

  // Atomic merge: NIEMALS komplettes einstellungen-Objekt überschreiben (siehe Memory).
  // Wir akzeptieren weiterhin das volle "newSettings" als Input für Backwards-Compat,
  // berechnen aber den Diff zur aktuellen DB-Sicht und mergen via RPC.
  const saveSettings = useCallback(async (newSettings: any): Promise<boolean> => {
    if (!authUser) return false;
    setSettingsState(newSettings);
    // Immer das ganze Objekt als Patch senden – RPC mergt feldweise auf Top-Level.
    // Das ist sicher, weil merge_user_settings ein JSONB-Concat (||) macht und
    // bestehende Top-Level-Keys nur überschreibt, wenn sie im Patch enthalten sind.
    const { data, error } = await withRetry(() =>
      supabase.rpc("merge_user_settings" as any, {
        _user_id: authUser.id,
        _patch: newSettings || {},
      }) as any
    );
    if (error) {
      console.error("useUserSettings: merge_user_settings fehlgeschlagen:", error);
      toastErrorThrottled("Einstellungen konnten nicht gespeichert werden.");
      return false;
    }
    if (data && typeof data === "object") {
      setSettingsState(data);
      setCustomPermissions((data as any).custom_permissions);
    }
    return true;
  }, [authUser]);

  const saveUnterlagen = useCallback(async (newUnterlagen: any) => {
    setUnterlagenState(newUnterlagen);
    await updateField("unterlagen", newUnterlagen);
  }, [updateField]);

  const saveCloserList = useCallback(async (newList: any) => {
    setCloserListState(newList);
    await updateField("closer_list", newList);
  }, [updateField]);

  const saveOnboardingSteps = useCallback(async (steps: string[]) => {
    setOnboardingStepsState(steps);
    await updateField("onboarding_steps", steps);
  }, [updateField]);

  const markOnboardingComplete = useCallback(async () => {
    setOnboardingCompleteState(true);
    await updateField("onboarding_complete", true);
  }, [updateField]);

  const setAppleCalendar = useCallback((data: AppleCalendarData | null) => {
    setAppleCalendarState(data);
  }, []);

  return {
    loaded,
    settings, saveSettings,
    unterlagen, saveUnterlagen,
    closerList, saveCloserList,
    onboardingSteps, saveOnboardingSteps,
    onboardingComplete, markOnboardingComplete,
    appleCalendar, setAppleCalendar,
    customPermissions,
  };
}
