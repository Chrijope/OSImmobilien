import "@/styles/kundenportal.css";
// Liquid Glass fuer das Portal. Muss nach der Datei darueber stehen, die sie ueberstimmt.
import "@/styles/kundenportal-liquid.css";
import { ReactNode, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  User, MessageCircle, Building2, Calculator, FolderOpen, Gift, Settings as SettingsIcon,
  Bell, LogOut, ChevronDown, Check,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { uebernimmProfilsprache, useHtmlLang, portalSprache } from "@/i18n/portalSprache";
import { datumText } from "@/lib/sprachFormat";
import { SPRACH_NAMEN, type Sprache } from "@/lib/kundenSprache";
import logoImg from "@/assets/moreimmo-logo.png";
import logoImgDarkAsset from "@/assets/moreimmo-logo-dark.png.asset.json";
import { useUser } from "@/contexts/UserContext";
import { useUngeleseneChats } from "./useUngeleseneChats";
import { ROLES, type UserRole } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import { PortalVpContact, type PortalVp } from "./PortalVpContact";
import { getPortalGreeting } from "@/lib/portalCopy";
import { LanguageToggle } from "./LanguageToggle";
import { HellDunkelSchalter } from "./HellDunkelSchalter";
import { VpBewertungPrompt } from "@/components/kunde/VpBewertungPrompt";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/lib/confirm";

// Das helle Logo fuer den Dunkelmodus, wie in der Seitenleiste des CRM (`AppSidebar.tsx`).
const logoImgDark = logoImgDarkAsset.url;

const NAV = [
  { to: "/kunde/stammdaten", icon: User, key: "uebersicht" },
  { to: "/kunde/kundenordner", icon: FolderOpen, key: "ordner" },
  { to: "/kunde/investments", icon: Building2, key: "investments" },
  { to: "/kunde/steuer-cockpit", icon: Calculator, key: "steuer" },
  { to: "/kunde/empfehlungen", icon: Gift, key: "empfehlungen" },
  { to: "/kunde/chat", icon: MessageCircle, key: "chat" },
] as const;

/**
 * Eigene, warm-ruhige Hülle für /kunde/*-Routen.
 * – Header mit Logo, persönlichem Gruß und VP-Anker (Chat-Button)
 * – Top-Tabs (Desktop) / Bottom-Tabs (Mobile) statt CRM-Sidebar
 * – Cream/Gold Theme via [data-portal="kunde"]
 * Keine Logik-Änderungen; alle Guards laufen vor diesem Layout im AppShell.
 */
export function KundePortalLayout({ children }: { children?: ReactNode }) {
  const { authUser, user, logout, setRole } = useUser();
  /*
   * Die Zahl am Menuepunkt "Chat".
   *
   * Ohne sie merkt der Kunde gar nicht, dass sein Berater ihm geschrieben
   * hat: Er sieht die Nachricht erst, wenn er von sich aus auf Chat klickt.
   */
  const ungeleseneChats = useUngeleseneChats(authUser?.id);
  const { t, i18n } = useTranslation();
  const [vp, setVp] = useState<PortalVp | null>(null);
  const [vorname, setVorname] = useState<string>("");
  const location = useLocation();
  const navigate = useNavigate();
  const [bellOpen, setBellOpen] = useState(false);
  const [notifs, setNotifs] = useState<Array<{ id: string; titel: string; nachricht: string | null; link: string | null; gelesen: boolean; erstellt_am: string }>>([]);
  const [assignedRoles, setAssignedRoles] = useState<UserRole[]>([]);
  /**
   * Die Sprache aus dem Kundenprofil, nach der Mails und Dokumente gehen.
   * `null`, bis der Kontakt geladen ist. Der Umschalter oben nennt sie,
   * ändert sie aber nicht.
   */
  const [profilSprache, setProfilSprache] = useState<Sprache | null>(null);
  useHtmlLang();

  // Zugewiesene Rollen laden – Dropdown erscheint NUR bei >1 Rolle
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authUser.id)
      .then(({ data }) => {
        if (cancelled) return;
        const roles = (data || []).map((r: any) => r.role as UserRole);
        setAssignedRoles(roles.length > 0 ? roles : [user.role]);
      });
    return () => { cancelled = true; };
  }, [authUser, user.role]);

  const showRoleSwitcher = assignedRoles.length > 1;
  const currentRoleMeta = ROLES.find((r) => r.id === user.role);

  // Benachrichtigungen laden (eigene, ungelesene zuerst)
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    const load = async () => {
      // Die Spalte heißt `nachricht`. Mit `beschreibung` antwortete die Datenbank mit
      // einem Fehler, und die Glocke blieb für jeden Kunden still leer.
      const { data, error } = await supabase
        .from("benachrichtigungen")
        .select("id, titel, nachricht, link, gelesen, erstellt_am")
        .order("erstellt_am", { ascending: false })
        .limit(20);
      if (error) console.error("Benachrichtigungen im Portal nicht ladbar:", error.message);
      if (!cancelled && data) setNotifs(data as any);
    };
    load();
    const ch = supabase
      .channel(`portal-bell-${authUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "benachrichtigungen" }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [authUser]);

  const unread = notifs.filter((n) => !n.gelesen).length;

  const openNotif = async (n: { id: string; link: string | null }) => {
    setBellOpen(false);
    try { await supabase.from("benachrichtigungen").update({ gelesen: true }).eq("id", n.id); } catch {}
    setNotifs((prev) => prev.map((x) => x.id === n.id ? { ...x, gelesen: true } : x));
    if (n.link) navigate(n.link);
  };

  const markAllRead = async () => {
    try { await supabase.from("benachrichtigungen").update({ gelesen: true }).eq("gelesen", false); } catch {}
    setNotifs((prev) => prev.map((x) => ({ ...x, gelesen: true })));
  };

  const handleLogout = async () => {
    // Abmelden liegt direkt neben dem Zahnrad. Auf dem Handy war ein
    // Fehlgriff schnell passiert, deshalb erst eine Rückfrage.
    const abmelden = await confirmDialog({
      title: t("portal.header.logout_confirm_title", "Wirklich abmelden?"),
      description: t("portal.header.logout_confirm_text", "Du kannst dich jederzeit wieder anmelden."),
      confirmText: t("portal.header.logout", "Abmelden"),
      cancelText: t("portal.header.logout_stay", "Angemeldet bleiben"),
    });
    if (!abmelden) return;
    try { await logout(); toast.success(t("portal.common.logged_out")); } catch (e: any) { toast.error(t("portal.settings.error_prefix") + (e?.message || t("portal.common.error_unknown"))); }
  };

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: kontakte } = await supabase
          .from("kontakte")
          .select("vorname, nachname, zustaendig_id, berater, meta")
          .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
          .limit(1);
        const k: any = kontakte?.[0];
        if (!k || cancelled) return;

        // Bei jeder neuen Anmeldung startet das Portal in der Profilsprache.
        // Person 2 hat keine eigene Sprache, es gilt die des Kontakts
        // (Plan Kundensprache, Entscheidung 11).
        const anmeldung = `${authUser.id}|${authUser.last_sign_in_at ?? ""}`;
        setProfilSprache(uebernimmProfilsprache(k.meta, anmeldung));

        // Vorname für Begrüßung – beachte Doppel-Profil (person2)
        const isPerson2 = k?.meta?.person2?.authUserId === authUser.id;
        const vn = isPerson2 ? k.meta?.person2?.vorname : k.vorname;
        if (vn) setVorname(String(vn).trim());

        /*
         * VP-Profil laden, zuerst ueber `get_kunde_vp_profile`.
         *
         * `profiles_public` allein reicht nicht: Die Ansicht laeuft mit den
         * Rechten des Aufrufers, und die Leseregel auf `profiles` erlaubt
         * einem Kunden seit dem 17.05.2026 nur noch das eigene Profil. Der
         * Name des Beraters blieb in der Kopfzeile deshalb leer. Die Funktion
         * laeuft mit erhoehten Rechten und liefert nur den Partner, der am
         * eigenen Kontakt haengt.
         */
        const { data: vpDirekt } = await (supabase as any).rpc("get_kunde_vp_profile");
        if (vpDirekt?.[0] && !cancelled) {
          setVp({
            name: vpDirekt[0].name || "",
            email: vpDirekt[0].email || "",
            avatar_url: vpDirekt[0].avatar_url || undefined,
          });
          return;
        }
        // Rueckfall fuer Kontakte ohne Zustaendigkeit, an denen nur der Name
        // steht. Die Funktion verlangt `zustaendig_id`.
        let vpId: string | null = k.zustaendig_id || null;
        if (!vpId && k.berater) {
          const { data: matches } = await supabase
            .from("profiles_public" as any)
            .select("id, name")
            .eq("name", k.berater);
          // Nur bei genau einem Treffer. Zwei Gleichnamige waeren geraten.
          if (matches && (matches as any[]).length === 1) {
            vpId = (matches as any[])[0].id;
          }
        }
        if (vpId) {
          const { data: profile } = await supabase
            .from("profiles_public" as any)
            .select("name, email, avatar_url")
            .eq("id", vpId)
            .maybeSingle();
          if (profile && !cancelled) {
            setVp({
              name: (profile as any).name || "",
              email: (profile as any).email || "",
              avatar_url: (profile as any).avatar_url || undefined,
            });
          }
        }
      } catch {
        /* still – Header bleibt funktional ohne VP */
      }
    })();
    return () => { cancelled = true; };
  }, [authUser]);

  /*
   * Der Chat füllt genau den Bildschirm, wie der Chat im CRM.
   *
   * Sonst wuchs die Nachrichtenliste mit der ganzen Seite, und der Kunde
   * musste durch alle Nachrichten scrollen, bevor die Eingabezeile auftauchte.
   * Auf dieser Route ist die Hülle deshalb so hoch wie das Fenster (100dvh,
   * siehe `kundenportal.css`), und darin scrollt nur noch der Verlauf.
   *
   * Die Handytastatur verkleinert nur den sichtbaren Ausschnitt, nicht das
   * Fenster, also auch nicht 100dvh. Ist sie offen, gilt die Höhe von
   * `visualViewport`, damit die Eingabezeile direkt über der Tastatur steht.
   * Ein Zoom mit zwei Fingern verkleinert den Ausschnitt ebenfalls, der zählt
   * nicht als Tastatur.
   */
  const chatVollbild = location.pathname.startsWith("/kunde/chat");
  const [tastaturSichthoehe, setTastaturSichthoehe] = useState<number | null>(null);
  useEffect(() => {
    const ausschnitt = window.visualViewport;
    if (!chatVollbild || !ausschnitt) {
      setTastaturSichthoehe(null);
      return;
    }
    const messen = () => {
      const tastaturOffen = ausschnitt.scale <= 1.01 && window.innerHeight - ausschnitt.height > 120;
      setTastaturSichthoehe(tastaturOffen ? Math.floor(ausschnitt.height) : null);
    };
    messen();
    ausschnitt.addEventListener("resize", messen);
    return () => ausschnitt.removeEventListener("resize", messen);
  }, [chatVollbild]);

  const greeting = getPortalGreeting(vorname || (user as any)?.name?.split(" ")[0]);
  // Der fruehere globale "Als Naechstes"-Banner (showNextCard) ist entfernt:
  // Der investment-bezogene NextStep-Block auf /kunde/investments deckt das ab,
  // auf allen anderen Portal-Seiten war der Banner ueberfluessig.

  return (
    <div data-lg="seite" data-portal="kunde" className="portal-ui min-h-screen flex flex-col bg-background text-foreground"
      data-vollbild={chatVollbild ? "chat" : undefined}
      data-tastatur={tastaturSichthoehe ? "offen" : undefined}
      style={tastaturSichthoehe ? { height: tastaturSichthoehe } : undefined}
    >
      {/* Header */}
      <header className="portal-header sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="portal-header-inner mx-auto w-full max-w-none flex items-center gap-3 sm:gap-6 px-4 sm:px-6 h-16">
          <img src={logoImg} alt="MOREImmo" className="h-9 sm:h-10 w-auto object-contain shrink-0 dark:hidden" />
          <img src={logoImgDark} alt="MOREImmo" className="h-9 sm:h-10 w-auto object-contain shrink-0 hidden dark:block" />
          <div className="hidden sm:block min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/45">{t("portal.header.label")}</div>
            <div className="text-sm font-medium truncate">{greeting}</div>
          </div>
          <div className="portal-header-actions ml-auto flex items-center gap-2">
            <PortalVpContact vp={vp} compact />
            <LanguageToggle
              hinweis={
                profilSprache
                  ? t("portal.header.language_profile_note", { sprache: SPRACH_NAMEN[profilSprache] })
                  : undefined
              }
            />
            <HellDunkelSchalter />
            {/* Rollen-Wechsel (nur sichtbar bei Multi-Rollen-Accounts) */}
            {showRoleSwitcher && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hidden sm:inline-flex items-center gap-1.5 h-9 px-2.5 rounded-full border border-border bg-card hover:border-foreground/40 transition-colors text-xs"
                    title={t("portal.header.switch_role")}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentRoleMeta?.color }} />
                    <span className="font-medium max-w-[120px] truncate">{currentRoleMeta?.label || user.role}</span>
                    <ChevronDown className="h-3 w-3 text-foreground/60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
                  {ROLES.filter((r) => assignedRoles.includes(r.id)).map((r) => (
                    <DropdownMenuItem
                      key={r.id}
                      onClick={async () => {
                        await setRole(r.id);
                        navigate("/");
                      }}
                      className="flex items-center gap-2"
                    >
                      {user.role === r.id ? (
                        <Check className="h-4 w-4 text-foreground" />
                      ) : (
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      )}
                      <span className="flex-1">{r.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* Glocke: eigene Benachrichtigungen */}
            <Popover open={bellOpen} onOpenChange={setBellOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative inline-flex items-center justify-center h-9 w-9 hover:text-[hsl(var(--portal-akzent))] transition-colors"
                  title={t("portal.header.notifications")}
                  aria-label={t("portal.header.notifications")}
                >
                  <Bell className="h-4 w-4 text-foreground/70" />
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 rounded-full bg-destructive text-[11px] leading-none font-bold text-destructive-foreground flex items-center justify-center">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(380px,calc(100vw-2rem))] p-0 max-h-[80vh] flex flex-col">
                <div className="p-3 flex items-center justify-between border-b border-border">
                  <h4 className="text-sm font-semibold">{t("portal.header.notifications")}</h4>
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-xs text-primary hover:underline">{t("portal.header.mark_all_read")}</button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto max-h-[60vh]">
                  {notifs.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">{t("portal.header.notifications_empty")}</div>
                  ) : (
                    notifs.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => openNotif(n)}
                        className={cn(
                          "w-full text-left flex items-start gap-2 px-3 py-2.5 border-b border-border last:border-0 transition-colors",
                          !n.gelesen ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm truncate", !n.gelesen ? "font-semibold" : "text-muted-foreground")}>{n.titel}</p>
                          {n.nachricht && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.nachricht}</p>}
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                            {datumText(n.erstellt_am, portalSprache())}
                          </p>
                        </div>
                        {!n.gelesen && <span className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <NavLink
              to="/kunde/einstellungen"
              className="inline-flex items-center justify-center h-9 w-9 hover:text-foreground transition-colors"
              title={t("portal.header.settings")}
            >
              <SettingsIcon className="h-4 w-4 text-foreground/70" />
            </NavLink>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center h-9 w-9 hover:text-destructive transition-colors"
              title={t("portal.header.logout")}
              aria-label={t("portal.header.logout")}
            >
              <LogOut className="h-4 w-4 text-foreground/70" />
            </button>
          </div>
        </div>

        {/* Desktop-Tabs */}
        <nav className="portal-desktop-nav hidden sm:block border-t border-border/60">
          <div className="mx-auto w-full max-w-none px-6">
            <ul className="flex gap-1 overflow-x-auto">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "inline-flex items-center gap-2 px-3 py-3 text-sm border-b-2 transition-colors -mb-px",
                        isActive
                          ? "border-foreground text-foreground"
                          : "border-transparent text-foreground/60 hover:text-foreground hover:border-border",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {t(`portal.nav.${item.key}`)}
                    {item.key === "chat" && ungeleseneChats > 0 && (
                      <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] leading-none font-semibold text-primary-foreground">
                        {ungeleseneChats}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </header>

      {/* Mobile-Begrüßung: eine kompakte Zeile statt zwei. Sie scrollt mit
          der Seite weg, fest bleibt nur die Kopfzeile. */}
      <div className="portal-mobile-greeting sm:hidden px-4 pt-3">
        <p className="text-sm font-medium truncate">
          <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/45 mr-2">{t("portal.header.label")}</span>
          {greeting}
        </p>
      </div>

      <main className="portal-main flex-1 mx-auto w-full max-w-none px-4 sm:px-6 py-5 sm:py-8 pb-40 sm:pb-12">
        <VpBewertungPrompt />
        <div className="portal-content animate-fade-in">{children ?? <Outlet />}</div>
        {/*
          Impressum und Datenschutz, bei Englisch in der englischen Fassung
          (Plan Kundensprache, Etappe 4, D8 und D9). Die Sprache ist die des
          Portals, die sich nach dem Kundenprofil richtet. Zwei feste Wörter
          je Sprache, deshalb ohne eigenen Schlüssel in den i18n-Dateien.
        */}
        <p className="mt-10 flex justify-center gap-4 text-xs text-muted-foreground">
          <a href={i18n.resolvedLanguage === "en" ? "/impressum?lang=en" : "/impressum"} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {i18n.resolvedLanguage === "en" ? "Legal notice" : "Impressum"}
          </a>
          <a href={i18n.resolvedLanguage === "en" ? "/datenschutz?lang=en" : "/datenschutz"} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {i18n.resolvedLanguage === "en" ? "Privacy policy" : "Datenschutz"}
          </a>
        </p>
      </main>

      {/* Bottom-Tabs (Mobile) */}
      <nav className="portal-mobile-nav sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {/* Eine Zeile statt zwei: Die zweireihige Leiste nahm auf dem Handy
            fast ein Fünftel der Höhe. Passt sie nicht, scrollt sie seitlich. */}
        <ul className="flex overflow-x-auto overscroll-x-contain">
          {NAV.map((item) => (
            <li key={item.to} className="flex-1 shrink-0">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center text-center gap-0.5 py-1.5 text-xs leading-tight transition-colors",
                    isActive ? "text-foreground" : "text-foreground/55",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <item.icon
                        className={cn(
                          "h-5 w-5 transition-colors",
                          isActive ? "text-foreground" : "",
                        )}
                      />
                      {item.key === "chat" && ungeleseneChats > 0 && (
                        <span className="absolute -top-2 -right-2.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-none font-semibold text-primary-foreground">
                          {ungeleseneChats}
                        </span>
                      )}
                    </span>
                    <span className="block max-w-full px-1 whitespace-nowrap">{t(`portal.nav.${item.key}`)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}