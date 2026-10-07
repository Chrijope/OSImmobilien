import React, { createContext, useContext, useState, useEffect } from "react";
import { UserRole, UserProfile } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import { cacheNutzerSetzen, cacheRolleSetzen, initDataCache, resetCache } from "@/lib/dataCache";
import { ladeplanFuerStart, startPfadErmitteln } from "@/lib/routenTabellen";
import { clearCurrentUserId, setCurrentUserId } from "@/lib/currentUser";
import {
  ladeZugewieseneRollen,
  resolveActiveRole,
  upsertUserSettingsRole,
  type RollenWechselErgebnis,
} from "@/lib/userRoles";
import { rollenVarianteVonProfil } from "@/lib/rollenLabel";
import type { Session, User } from "@supabase/supabase-js";
import { seedTestDemoData, clearTestDemoData } from "@/lib/testDemoSeed";
import { clearPersistedSupabaseSession } from "@/lib/sessionSecurity";

interface UserContextType {
  user: UserProfile;
  setRole: (role: UserRole) => Promise<RollenWechselErgebnis>;
  darkMode: boolean;
  /** Ist das neue Aussehen eingeschaltet? Gilt je Nutzer. */
  toggleDarkMode: () => void;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  demoMode: boolean;
  loading: boolean;
  authUser: User | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const DEFAULT_PROFILE: UserProfile = { name: "Laden...", role: "kunde", moreId: "" };

function getStoredRolePreference() {
  try {
    return localStorage.getItem("mi_current_role");
  } catch {
    return null;
  }
}

function setStoredRolePreference(role: UserRole) {
  try {
    localStorage.setItem("mi_current_role", role);
  } catch {
    // ignore storage errors
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile>(DEFAULT_PROFILE);
  const [darkMode, setDarkMode] = useState(false);
  const demoMode = false;

  const trackLoginSession = async (userId: string) => {
    try {
      const ua = navigator.userAgent;
      const browser = ua.includes("Chrome")
        ? "Chrome"
        : ua.includes("Firefox")
          ? "Firefox"
          : ua.includes("Safari")
            ? "Safari"
            : ua.includes("Edge")
              ? "Edge"
              : "Unbekannt";
      const os = ua.includes("Windows")
        ? "Windows"
        : ua.includes("Mac")
          ? "macOS"
          : ua.includes("Linux")
            ? "Linux"
            : ua.includes("iPhone") || ua.includes("iPad")
              ? "iOS"
              : ua.includes("Android")
                ? "Android"
                : "Unbekannt";

      await supabase.from("login_sessions").insert({
        user_id: userId,
        browser,
        os,
        user_agent: ua,
      });
    } catch (e) {
      console.warn("Login-Session konnte nicht getrackt werden:", e);
    }
  };

  // Rolle aus dem letzten `loadProfile`, damit der Ladeplan des Caches sie
  // kennt, bevor der React-Zustand aktualisiert ist.
  const geladeneRolleRef = React.useRef<string>("");
  const loadProfile = async (authId: string, attempt = 0): Promise<boolean> => {
    try {
      const [profileRes, rolesRes, settingsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", authId).single(),
        supabase.from("user_roles").select("role").eq("user_id", authId),
        supabase
          .from("user_settings" as any)
          .select("einstellungen")
          .eq("user_id", authId)
          .maybeSingle() as any,
      ]);

      if (profileRes.error) throw profileRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (settingsRes?.error) throw settingsRes.error;

      const profile = profileRes.data;

      if (profile?.gesperrt) {
        console.warn("Nutzer ist gesperrt:", profile.gesperrt_grund);
        await supabase.auth.signOut();
        clearCurrentUserId();
        setAuthUser(null);
        setIsLoggedIn(false);
        setUser(DEFAULT_PROFILE);
        return false;
      }

      const assignedRoles = ((rolesRes.data ?? []) as Array<{ role: UserRole }>).map((entry) => entry.role);

      // Direkt nach einem Invite ist `user_roles` ggf. noch leer (Replica-Lag /
      // RLS-Race). NICHT akzeptieren – kurz warten und neu laden, sonst landet
      // der frische Nutzer im falschen Default ("kunde"/"individuell").
      if (assignedRoles.length === 0 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        return loadProfile(authId, attempt + 1);
      }

      const preferredRole = ((settingsRes?.data?.einstellungen as Record<string, unknown> | undefined)?.active_role as string | undefined)
        ?? getStoredRolePreference();
      const role = resolveActiveRole(assignedRoles, preferredRole);
      geladeneRolleRef.current = role;

      setUser({
        name: profile?.name || "Nutzer",
        role,
        // Defensiv: Spalte fehlt, solange die Migration nicht gelaufen ist.
        rollenVariante: rollenVarianteVonProfil(profile),
        moreId: profile?.more_id || "",
        avatar: profile?.avatar_url || undefined,
        email: profile?.email || undefined,
      });

      // Cache avatar_url for synchronous access in getProfilePic()
      try {
        if (profile?.avatar_url) {
          localStorage.setItem("mi_profile_avatar_url", profile.avatar_url);
        } else {
          localStorage.removeItem("mi_profile_avatar_url");
        }
      } catch {}

      // Dasselbe fuer die Adresse aus den Einstellungen: ladeBerater() und die
      // Landingpage lesen sie synchron, also ohne React-Kontext.
      try {
        if (profile?.email) {
          localStorage.setItem("mi_profile_email", profile.email);
        } else {
          localStorage.removeItem("mi_profile_email");
        }
      } catch {}

      setStoredRolePreference(role);
      return true;
    } catch (error) {
      // Retry bis zu 2x bei transienten Netzwerk-Fehlern (Safari "Load failed",
      // Race-Conditions direkt nach Login). Erst danach Fallback verwenden.
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        return loadProfile(authId, attempt + 1);
      }
      console.warn("Profil konnte nicht geladen werden:", error);
      // SICHERHEIT (Audit Punkt 3): KEIN stiller Fallback auf eine Rolle wie
      // "individuell" oder eine in localStorage gecachte Rolle. Wenn wir die
      // tatsächlich zugewiesenen Rollen nicht aus der DB lesen können, lassen
      // wir den Nutzer NICHT durch — sonst könnten Berechtigungen
      // falsch-positiv vergeben werden. Stattdessen: Nutzer in "Laden…"-State
      // halten und im Hintergrund weiter versuchen das echte Profil zu laden.
      setUser(DEFAULT_PROFILE);
      scheduleBackgroundProfileReload(authId);
      return false;
    }
  };

  // Hintergrund-Retry-Mechanik: greift, wenn der initiale Profil-Load (3x)
  // fehlgeschlagen ist und der Header daher "Nutzer" zeigt. Ein einzelner
  // Interval-Handle pro Mount; löscht sich selbst, sobald das Profil sitzt.
  const backgroundReloadRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Hält die zuletzt verarbeitete Auth-User-ID, damit wir bei jedem
  // onAuthStateChange-Event (z. B. SIGNED_IN beim Tab-Wechsel oder
  // INITIAL_SESSION nach kurzem Wegklicken) nicht erneut Profil,
  // user_settings und den DataCache komplett neu laden – das führt sonst
  // zu sichtbarem "Neu-Laden", wenn der Nutzer zwischen Browser-Tabs
  // wechselt und zurück kommt.
  const lastHandledUserIdRef = React.useRef<string | null>(null);
  const scheduleBackgroundProfileReload = (authId: string) => {
    if (backgroundReloadRef.current) return;
    backgroundReloadRef.current = setInterval(async () => {
      try {
        const [profileRes, rolesRes, settingsRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", authId).single(),
          supabase.from("user_roles").select("role").eq("user_id", authId),
          supabase
            .from("user_settings" as any)
            .select("einstellungen")
            .eq("user_id", authId)
            .maybeSingle() as any,
        ]);
        if (profileRes.error || rolesRes.error || settingsRes?.error) return;
        const profile = profileRes.data;
        if (!profile) return;
        const assignedRoles = ((rolesRes.data ?? []) as Array<{ role: UserRole }>).map((e) => e.role);
        const preferredRole =
          ((settingsRes?.data?.einstellungen as Record<string, unknown> | undefined)?.active_role as string | undefined) ??
          getStoredRolePreference();
        const role = resolveActiveRole(assignedRoles, preferredRole);
        setUser({
          name: profile?.name || "Nutzer",
          role,
          rollenVariante: rollenVarianteVonProfil(profile),
          moreId: profile?.more_id || "",
          avatar: profile?.avatar_url || undefined,
          email: profile?.email || undefined,
        });
        try {
          if (profile?.email) localStorage.setItem("mi_profile_email", profile.email);
        } catch {}
        setStoredRolePreference(role);
        if (backgroundReloadRef.current) {
          clearInterval(backgroundReloadRef.current);
          backgroundReloadRef.current = null;
        }
      } catch {
        // weiterhin nicht erreichbar – nächstes Intervall versucht's erneut
      }
    }, 8000);
  };

  // Rollenwechsel im laufenden Betrieb: Bewerbungen laedt der Cache nur fuer
  // die Rollen des Bewerberbereichs (dataCache.ts, `cacheRolleSetzen`).
  useEffect(() => {
    cacheRolleSetzen(user.role);
  }, [user.role]);

  useEffect(() => {
    let mounted = true;
    let loadingResolved = false;

    const safeSetLoading = (value: boolean) => {
      if (mounted) {
        loadingResolved = true;
        setLoading(value);
      }
    };

    const safetyTimeout = setTimeout(() => {
      if (!loadingResolved && mounted) {
        console.warn("Auth-Initialisierung Timeout nach 10s – lade App trotzdem.");
        setAuthUser(null);
        setIsLoggedIn(false);
        setUser(DEFAULT_PROFILE);
        setLoading(false);
      }
    }, 10000);

    const handleSession = async (
      session: Session | null,
      options: { force?: boolean } = {},
    ) => {
      try {
        if (!session?.user) {
          if (!mounted) return;
          lastHandledUserIdRef.current = null;
          clearCurrentUserId();
          setAuthUser(null);
          setIsLoggedIn(false);
          setUser(DEFAULT_PROFILE);
          resetCache();
          return;
        }

        if (!mounted) return;

        // Wenn dieselbe Session erneut gemeldet wird (typisch beim
        // Zurückkehren in den Tab oder bei TOKEN_REFRESHED-Folgesignalen),
        // brauchen wir Profil/Cache nicht noch einmal aufzubauen.
        if (!options.force && lastHandledUserIdRef.current === session.user.id) {
          setAuthUser(session.user);
          setIsLoggedIn(true);
          safeSetLoading(false);
          return;
        }

        setCurrentUserId(session.user.id);
        // Vor loadProfile: scheitert das Profil, uebernimmt der
        // Hintergrund-Nachlader, und der meldet das Konto nie.
        cacheNutzerSetzen(session.user.id);
        setAuthUser(session.user);

        // MFA-Prüfung deaktiviert

        if (!mounted) return;
        setIsLoggedIn(true);

        const profileAllowed = await loadProfile(session.user.id);
        if (!profileAllowed) {
          lastHandledUserIdRef.current = null;
          return;
        }

        lastHandledUserIdRef.current = session.user.id;
        void trackLoginSession(session.user.id);
        // Laden je Route: nur die Tabellen der Startseite plus die globalen,
        // haeufige Seiten danach bei Leerlauf (routenTabellen.ts).
        const rolle = geladeneRolleRef.current;
        const startPfad = startPfadErmitteln(window.location.pathname, window.location.search, rolle);
        cacheRolleSetzen(rolle);
        void initDataCache(ladeplanFuerStart(startPfad, rolle));
      } catch (error) {
        console.error("Session-Initialisierung fehlgeschlagen:", error);
        if (!mounted) return;
        clearCurrentUserId();
        setAuthUser(null);
        setIsLoggedIn(false);
        setUser(DEFAULT_PROFILE);
      } finally {
        safeSetLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Refresh-Token-Härtung: Bei TOKEN_REFRESHED nur Session aktualisieren,
      // bei SIGNED_OUT (z.B. Refresh-Fehler / revoked Token) sauberen Logout-State.
      if (event === "TOKEN_REFRESHED") {
        console.info("[Auth] Token refreshed at", new Date().toISOString());
      }
      if (event === "SIGNED_OUT") {
        lastHandledUserIdRef.current = null;
        clearCurrentUserId();
        // Cache, Realtime-Kanaele und Nachladen gehoeren zur Sitzung. Blieben
        // sie stehen, fragten sie nach dem Abmelden (auch der naechtlichen)
        // mit dem oeffentlichen Schluessel weiter ab, und eine neue Anmeldung
        // fand den Stand des vorigen Kontos vor.
        resetCache();
        setAuthUser(null);
        setIsLoggedIn(false);
        setUser(DEFAULT_PROFILE);
        safeSetLoading(false);
        return;
      }
      void handleSession(session);
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => handleSession(session))
      .catch((error) => {
        console.error("Session konnte nicht geladen werden:", error);
        safeSetLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
      if (backgroundReloadRef.current) {
        clearInterval(backgroundReloadRef.current);
        backgroundReloadRef.current = null;
      }
    };
  }, []);

  // Hinweis: Früher gab es hier einen pagehide/beforeunload-Handler, der die
  // persistente Session löschte, wenn "Angemeldet bleiben" nicht aktiv war.
  // Dieser Handler hat in Preview-/HMR-Umgebungen und bei bfcache-Wechseln
  // fälschlich gefeuert und den Nutzer direkt nach dem Login wieder zurück
  // auf /login geworfen. Das Häkchen gibt es seit dem 26.09.2026 nicht mehr.
  // Eine Abmeldung bei Inaktivität gibt es bewusst nicht (IdleTimeoutGuard
  // ist leer). Lange offene Sitzungen beendet der Server: jede Nacht um 03:30
  // Uhr für alle außer Kunden und Bewerbern, bei denen nach 30 Tagen
  // (supabase/migrations/20260926200000_naechtliche_abmeldung.sql). Scheitert
  // danach die Erneuerung im Browser, meldet supabase-js SIGNED_OUT, und der
  // Zweig oben setzt den abgemeldeten Zustand; die Routen schicken zu /login.

  // Der Rollenwechsel meldet jetzt zurueck, warum er nicht geklappt hat.
  // Frueher brach er still ab: Wer die Rollenliste gerade nicht lesen konnte,
  // klickte auf eine Rolle und es geschah einfach nichts. Die Pruefung selbst
  // bleibt unveraendert streng, entschieden wird weiter allein anhand von
  // `user_roles`.
  const setRole = async (role: UserRole): Promise<RollenWechselErgebnis> => {
    if (!authUser) {
      return { status: "fehler", grund: "nicht-angemeldet", nachricht: "Du bist gerade nicht angemeldet." };
    }

    const ergebnis = await ladeZugewieseneRollen(authUser.id);

    if (ergebnis.status === "fehler") {
      console.error("Rollen konnten nicht geladen werden:", ergebnis.fehler);
      return {
        status: "fehler",
        grund: "rollen-nicht-lesbar",
        nachricht: "Deine Rollen sind gerade nicht abrufbar. Bitte gleich noch einmal versuchen.",
      };
    }

    if (!ergebnis.rollen.includes(role)) {
      console.warn("Nicht zugewiesene Rolle kann nicht aktiviert werden:", role);
      return {
        status: "fehler",
        grund: "nicht-zugewiesen",
        nachricht: "Diese Rolle ist dir nicht zugewiesen.",
      };
    }

    try {
      await upsertUserSettingsRole(authUser.id, role);
      setUser((prev) => ({ ...prev, role }));
      setStoredRolePreference(role);
      if (role === "testaccount") seedTestDemoData();
      else clearTestDemoData();
      return { status: "ok" };
    } catch (updateError) {
      console.error("Rolle konnte nicht aktualisiert werden:", updateError);
      return {
        status: "fehler",
        grund: "speichern-fehlgeschlagen",
        nachricht: "Die Rolle konnte nicht gespeichert werden. Bitte noch einmal versuchen.",
      };
    }
  };

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message };
    }
    return {};
  };

  const logout = async () => {
    await supabase.auth.signOut();
    clearPersistedSupabaseSession();
    clearCurrentUserId();
    setAuthUser(null);
    setIsLoggedIn(false);
    setUser(DEFAULT_PROFILE);
  };

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  return (
    <UserContext.Provider
      value={{
        user,
        setRole,
        darkMode,
        toggleDarkMode,
        isLoggedIn,
        login,
        logout,
        demoMode,
        loading,
        authUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}

/** Same as useUser but returns null when outside UserProvider (e.g. public routes). */
export function useOptionalUser() {
  return useContext(UserContext) ?? null;
}
