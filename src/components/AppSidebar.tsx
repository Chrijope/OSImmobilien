import { useVideocallFreigabe } from "@/hooks/useVideocallFreigabe";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";
import { ChevronDown, Info, Bookmark, BookmarkCheck } from "lucide-react";
import { handbuchPartnerFreigeschaltet } from "@/lib/handbuch/zugang";
import {
  navigationsGruppen, darfNavEintrag, entwurfGesperrt, type NavItem,
} from "@/lib/sidebarNavigation";
import { NavLink } from "@/components/NavLink";
import logoImg from "@/assets/moreimmo-logo.png";
import logoImgDarkAsset from "@/assets/moreimmo-logo-dark.png.asset.json";
import iconAsset from "@/assets/moreimmo-icon.png.asset.json";
const logoImgDark = logoImgDarkAsset.url;
const iconImg = iconAsset.url;
import { SidebarRoleSelector } from "@/components/SidebarRoleSelector";
import { getUnreadChatCount } from "@/lib/chatStore";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUngeleseneSupportTickets } from "@/hooks/useUngeleseneSupportTickets";
import { getUnreadNewsCount, getUnreadNeuImCrmCount } from "@/lib/newsStore";
import { hatNeuImCrm, neuImCrmBetrachter } from "@/lib/neuImCrmZugang";
import { ladeVersionsnotiz } from "@/lib/versionsnotiz";
import { onCacheChange, isTableLoaded } from "@/lib/dataCache";
import { isUrlAllowedForRole, isKundeRole, isTippgeberRole, siehtAdminOnlyNavigation } from "@/lib/sidebarPermissions";
import { isSidebarBlurExempt } from "@/lib/sidebarBlurWhitelist";
import { isDraftRoute } from "@/lib/draftRoutes";
import { getDoneInboxIds, toDateString, getTodayDateString, isTaskFromPreviousDay } from "@/lib/inboxCountStore";
import { getInboxTasks } from "@/lib/aktivitaetenStore";
import { getMeineAufgaben } from "@/lib/aufgabenStore";
import { getFollowUps } from "@/lib/followUpStore";
import { bewerberErinnerungen } from "@/lib/bewerberErinnerungen";
import { siehtBewerberMeldungen } from "@/lib/bewerberRechte";
import { notifyUser } from "@/lib/bellNotifications";
import { darfJetztErinnern, merkeErinnerung } from "@/lib/inboxErinnerungTakt";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { getNewObjekteCount, initObjekteSeenIfNeeded } from "@/lib/objekteStore";
import { supabase } from "@/integrations/supabase/client";
import { getKontakte } from "@/lib/kundenStore";
import { zaehleOffenePoolLeads } from "@/lib/leadPool";
import { getBewerber } from "@/lib/bewerbungStore";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { getSeenAt, initSeenIfNeeded, markSeen, getSeenItemIds, SEEN_KEYS, isNewBadgeActive } from "@/lib/seenBadges";
import { useSidebarFavorites } from "@/lib/sidebarFavorites";

import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

/*
 * Der kleine Info-Hinweis an einem Menuepunkt.
 *
 * Auf dem Schreibtisch erscheint er beim Ueberfahren mit der Maus, das ist
 * gewollt. Auf dem Handy darf ihn ausschliesslich ein Antippen des Symbols
 * oeffnen, und das ist der Grund fuer die Fallunterscheidung unten:
 *
 * Beim Aufklappen des Menues setzt die Schublade den Fokus selbst auf das
 * erste bedienbare Element darin. Verweise ueberspringt sie dabei, uebrig
 * bleibt also das erste Info-Symbol in der Liste, heute das an "Alle
 * Kontakte". Radix oeffnet einen Tooltip bei Fokus, und so sprang der Kasten
 * beim ersten Oeffnen von allein auf und verdeckte die Eintraege darunter.
 *
 * Der frueher hier stehende Kommentar behauptete, der gesteuerte Zustand
 * verhindere das. Er tut es nicht: `onOpenChange` reichte das Oeffnen
 * ungeprueft an `setOpen` weiter, womit der Tooltip sich genauso oeffnete wie
 * ohne Steuerung. Jetzt wird auf dem Handy nur noch das Schliessen
 * uebernommen.
 */
function SidebarInfoTooltip({ itemKey, text }: { itemKey: string; text: string }) {
  const [open, setOpen] = useState(false);
  const { isMobile } = useSidebar();
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    const t = window.setTimeout(close, 6000);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.clearTimeout(t);
    };
  }, [open]);
  return (
    <Tooltip
      open={open}
      onOpenChange={(gewuenscht) => {
        // Auf dem Handy kommt das Oeffnen nur aus dem Antippen weiter unten,
        // nie aus Fokus oder Zeiger. Das Schliessen bleibt erlaubt, sonst
        // haenge der Kasten an Escape oder einem Tipp daneben fest.
        if (gewuenscht && isMobile) return;
        setOpen(gewuenscht);
      }}
    >
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label="Info"
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setOpen((v) => !v);
            }
          }}
          className={cn(
            "relative shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors p-1",
            // Das Symbol misst nur 22 Pixel. Auf dem Handy vergroessert ein
            // unsichtbares Feld die Trefferflaeche auf 42, ohne das Bild zu
            // veraendern. Gleiches Mittel wie bei `SidebarMenuAction`.
            "after:absolute after:-inset-2.5 after:md:hidden",
          )}
          data-sidebar-info={itemKey}
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      {/*
        Auf dem Handy steht der Kasten unter der Zeile statt rechts daneben.
        Rechts ist bei 375 Pixeln Breite kein Platz mehr, der Text wurde dort
        an den Rand geschoben und vorn abgeschnitten.
      */}
      <TooltipContent
        side={isMobile ? "bottom" : "right"}
        align={isMobile ? "end" : "start"}
        collisionPadding={isMobile ? 8 : 0}
        className={cn(
          "max-w-[min(20rem,calc(100vw-3rem))] text-xs leading-relaxed",
          // Auf dem Handy liegt das Menue selbst auf `z-[71]`, der Hinweis
          // muss darueber. Auf dem Schreibtisch bleibt es bei der bisherigen
          // Ebene, dort ordnet er sich unter Dialoge ein.
          isMobile ? "z-[9999]" : "z-[60]",
        )}
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}


function NavGroup({
  label, items, collapsed, defaultOpen, userRole, customPermissions, onboardingLocked, iconTint, vpStufeId,
  showBookmarks, isFavorite, toggleFavorite,
}: {
  label: string; items: NavItem[]; collapsed: boolean; defaultOpen?: boolean; userRole?: string; customPermissions?: string[]; onboardingLocked?: boolean; iconTint?: string; vpStufeId?: string | null;
  showBookmarks?: boolean; isFavorite?: (url: string) => boolean; toggleFavorite?: (url: string) => void;
}) {
  // Wer ist angemeldet? Nur fuer persoenliche Ausnahmen wie den
  // Investmentrechner noetig, der einzelnen Personen offensteht.
  const { authUser } = useUser();
  const identitaet = { email: authUser?.email, userId: authUser?.id };
  // Dieselbe Pruefung nutzt die globale Suche, siehe `sidebarNavigation.ts`.
  // Leere Rolle bleibt leer: Der Admin-Riegel soll dann greifen wie vor der
  // Umstellung; die Routenfreigabe faellt in darfNavEintrag selbst auf "admin" zurueck.
  const navKontext = { rolle: userRole ?? "", customPermissions, vpStufeId, identitaet };

  // Filter items by role permission + adminOnly
  const filteredItems = items.filter(item => darfNavEintrag(item, navKontext));
  if (filteredItems.length === 0) return null;

  const location = useLocation();
  const activeClasses = "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground";
  const isItemActive = (url: string) => {
    const [path, query] = url.split("?");
    if (path === "/vertriebsakademie" && location.pathname.startsWith(path + "/")) return true;
    if (location.pathname !== path) return false;
    const cur = new URLSearchParams(location.search);
    if (!query) {
      // Plain route: only active when no overriding query like ?modus=academy
      return !cur.has("modus");
    }
    const expected = new URLSearchParams(query);
    for (const [k, v] of expected) {
      if (cur.get(k) !== v) return false;
    }
    return true;
  };

  const renderItem = (item: NavItem) => {
    // If onboarding not complete, disable all items except /einstellungen
    const isSettingsItem = item.url === "/einstellungen";
    const isLocked = onboardingLocked && !isSettingsItem;
    const active = isItemActive(item.url);
    // Apple-style icon tint – nur wenn nicht aktiv (aktiv = weiß auf Primary).
    const tintClass = !active && iconTint ? iconTint : "";

    if (isLocked) {
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton disabled className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm opacity-30 cursor-not-allowed pointer-events-none">
            <item.icon className={cn("h-4 w-4 shrink-0", tintClass)} />
            {!collapsed && <span className="flex-1">{item.title}</span>}
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    // Single Source of Truth: zentrale DRAFT_ROUTES + manuelles draft-Flag
    const isDraft = item.draft || isDraftRoute(item.url);

    if (isDraft) {
      // Wer einen Entwurf oeffnen darf, steht in `entwurfGesperrt`.
      const canAccess = !entwurfGesperrt(item, userRole);
      if (canAccess) {
        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild>
              <NavLink to={item.url} end
                data-tour-id={item.url}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isItemActive(item.url) && activeClasses,
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0", tintClass)} />
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.title}</span>
                    <Badge className="ml-auto shrink-0 text-[7px] leading-none px-1 py-0.5 h-3.5 bg-orange-500/15 text-orange-500 border border-orange-500/30 hover:bg-orange-500/20 font-semibold uppercase tracking-wide rounded">
                      Entwurf
                    </Badge>
                  </>
                )}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      }
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton disabled className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm opacity-40 cursor-not-allowed">
            <item.icon className={cn("h-4 w-4 shrink-0", tintClass)} />
            {!collapsed && (
              <>
                <span className="flex-1">{item.title}</span>
                <Badge className="ml-auto shrink-0 text-[7px] leading-none px-1 py-0.5 h-3.5 bg-muted text-muted-foreground border border-border hover:bg-muted font-semibold uppercase tracking-wide rounded">
                  Bald verfügbar
                </Badge>
              </>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    if (item.children && item.children.length > 0) {
      const visibleChildren = item.children.filter(child => darfNavEintrag(child, navKontext));
      if (visibleChildren.length === 0) return null;
      const anyChildActive = visibleChildren.some(c => isItemActive(c.url));
      return (
        <Collapsible key={item.title} defaultOpen={anyChildActive}>
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <item.icon className={cn("h-4 w-4", tintClass)} />
                  {!collapsed && <span>{item.title}</span>}
                </span>
                {!collapsed && <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />}
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {visibleChildren.map(child => (
                  <SidebarMenuSubItem key={child.title}>
                    <SidebarMenuSubButton asChild isActive={isItemActive(child.url)}>
                      <NavLink to={child.url} end className="flex items-center gap-2">
                        <child.icon className={cn("h-4 w-4 shrink-0", !isItemActive(child.url) && iconTint)} />
                        <span>{child.title}</span>
                      </NavLink>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      );
    }

    if (item.hasSubmenu) {
      return (
        <Collapsible key={item.title}>
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <item.icon className={cn("h-4 w-4", tintClass)} />
                  {!collapsed && <span>{item.title}</span>}
                </span>
                {!collapsed && <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />}
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild>
                    <NavLink to={item.url} end><span>Übersicht</span></NavLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      );
    }



    const navLink = (
      <NavLink to={item.url} end
        data-tour-id={item.url}
        // Oeffentliche Seiten (etwa „Partner werden“) im neuen Tab, das CRM bleibt offen.
        {...(item.neuerTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        onClick={() => {
          // News wird nicht mehr hier als gelesen gemerkt. Das geschieht auf
          // der News-Seite selbst, denn nur sie weiss, was tatsaechlich
          // angezeigt wurde, und sie erwischt auch den Weg ueber einen
          // Verweis, die Adresszeile oder ein Neuladen.
          if (item.url === "/unterlagen") markSeen(SEEN_KEYS.unterlagen);
          if (item.url === "/vp-bewertungen") markSeen(SEEN_KEYS.vpBewertungen);
        }}
        className={cn(
          "group/navitem flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isItemActive(item.url) && activeClasses,
        )}
      >
        <item.icon className={cn("h-4 w-4 shrink-0", tintClass)} />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.title}</span>
            {item.tooltip && (
              <SidebarInfoTooltip itemKey={item.url} text={item.tooltip} />
            )}
            {item.badgeCount != null && item.badgeCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-primary text-primary-foreground">
                {item.badgeCount}
              </Badge>
            )}
            {item.newBadge && (
              <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500 text-white border-0 hover:bg-emerald-500 uppercase tracking-wide">
                Neu
              </Badge>
            )}
            {item.adminBadge && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 h-4 border-primary/40 bg-primary/10 text-primary uppercase tracking-wide"
              >
                Admin
              </Badge>
            )}
            {item.trailing}
            {showBookmarks && isFavorite && toggleFavorite && (
              <span
                role="button"
                tabIndex={0}
                aria-label={isFavorite(item.url) ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFavorite(item.url);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavorite(item.url);
                  }
                }}
                className={cn(
                  "ml-1 shrink-0 inline-flex items-center justify-center rounded p-0.5 transition-opacity",
                  isFavorite(item.url)
                    ? "opacity-100 text-amber-500 hover:text-amber-600"
                    : "opacity-0 group-hover/navitem:opacity-100 text-muted-foreground hover:text-foreground",
                )}
              >
                {isFavorite(item.url) ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
              </span>
            )}
          </>
        )}
      </NavLink>
    );

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild tooltip={item.tooltip}>{navLink}</SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  if (!label) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>{filteredItems.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <Collapsible defaultOpen={defaultOpen ?? true}>
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="text-[12px] font-extrabold tracking-wider uppercase text-foreground px-3 cursor-pointer flex items-center justify-between hover:text-foreground/80 transition-colors">
            {!collapsed && <span>{label}</span>}
            {!collapsed && <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>{filteredItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppSidebar() {
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, authUser } = useUser();
  // Videocall: admin/inhaber plus einzeln freigeschaltete Nutzer.
  const { darf: videocallFreigabe } = useVideocallFreigabe();
  const { favorites, isFavorite, toggleFavorite } = useSidebarFavorites();

  const [unreadNews, setUnreadNews] = useState(0);
  // Die Versionsnotiz einmal holen; danach zaehlt „news-updated“ neu.
  useEffect(() => {
    if (hatNeuImCrm(authUser?.id, authUser?.email)) void ladeVersionsnotiz();
  }, [authUser?.id]);
  const [inboxCount, setInboxCount] = useState(0);
  const [newObjekte, setNewObjekte] = useState(0);
  const [newLeads, setNewLeads] = useState(0);
  const [newBewerber, setNewBewerber] = useState(0);
  const [unterlagenNew, setUnterlagenNew] = useState<boolean>(() => isNewBadgeActive(SEEN_KEYS.unterlagen));
  const [vpBewertungenNew, setVpBewertungenNew] = useState<boolean>(() => isNewBadgeActive(SEEN_KEYS.vpBewertungen));
  const [einwandBiblNew, setEinwandBiblNew] = useState<boolean>(() => isNewBadgeActive(SEEN_KEYS.einwandBibliothek));
  const [vertriebsakademieNew, setVertriebsakademieNew] = useState<boolean>(() => isNewBadgeActive(SEEN_KEYS.vertriebsakademie));
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [vpStufeId, setVpStufeId] = useState<string | null>(null);

  // Load onboarding status
  useEffect(() => {
    if (!authUser) return;
    const load = async () => {
      try {
        const { data } = await supabase
          .from("user_settings")
          .select("onboarding_complete")
          .eq("user_id", authUser.id)
          .maybeSingle();
        setOnboardingComplete(data?.onboarding_complete ?? true);
      } catch { /* fallback true */ }
    };
    load();

    // Listen for immediate onboarding-complete event from Einstellungen
    const handleOnboardingComplete = () => setOnboardingComplete(true);
    window.addEventListener("onboarding-complete", handleOnboardingComplete);

    const channel = supabase
      .channel('sidebar-onboarding')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_settings', filter: `user_id=eq.${authUser.id}` },
        (payload: any) => {
          if (payload.new?.onboarding_complete !== undefined) {
            setOnboardingComplete(Boolean(payload.new.onboarding_complete));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("onboarding-complete", handleOnboardingComplete);
    };
  }, [authUser]);


  const dbCounts = useSidebarCounts(authUser?.id);
  // Eigene Tickets mit ungelesener Antwort vom Support, fuer "Support kontaktieren".
  const ungeleseneSupportTickets = useUngeleseneSupportTickets();

  useEffect(() => {
    const update = () => {
      // Nur zählen, wenn beide Tabellen geladen sind – sonst Badge auf 0 lassen
      if (!isTableLoaded("news") || !isTableLoaded("user_settings")) {
        setUnreadNews(0);
        return;
      }
      // „Neu im CRM“ (siehe neuImCrmZugang.ts): dessen ungelesene Eintraege zaehlen mit,
      // nur die freigegebenen. Eine Freigabe aendert app_config, das zaehlt ueber onCacheChange neu.
      setUnreadNews(getUnreadNewsCount(user?.role)
        + (hatNeuImCrm(authUser?.id, authUser?.email)
          ? getUnreadNeuImCrmCount(neuImCrmBetrachter(user?.role, authUser?.id, authUser?.email))
          : 0));
    };
    const updateInbox = () => {
      const today = getTodayDateString();
      const doneIds = getDoneInboxIds();

      // Inbox-Tasks
      const tasks = getInboxTasks();
      const openInbox = tasks.filter(t => {
        if (doneIds.includes(t.id)) return false;
        const ds = toDateString(t.faellig_am);
        return !!ds && ds <= today;
      });

      // Follow-Ups (offen)
      let openFollowUps: { id: string; faelligAm: string }[] = [];
      try {
        // Nur Follow-Ups zu Kunden, die dem aktuellen User gehören (analog Inbox-Seite).
        const ownedKundeIds = new Set<string>();
        try {
          getKontakte().forEach((k: any) => {
            if (kontaktBelongsToUser(k, { userName: user?.name, userId: authUser?.id })) {
              ownedKundeIds.add(k.id);
            }
          });
        } catch { /* ignore */ }
        openFollowUps = getFollowUps()
          .filter(f => f.status !== "erledigt")
          .filter(f => ownedKundeIds.has(f.kundeId))
          .filter(f => {
            const ds = toDateString(f.faelligAm);
            return !!ds && ds <= today;
          })
          .map(f => ({ id: `fu-${f.id}`, faelligAm: f.faelligAm }));
      } catch { /* ignore */ }

      // Aufgaben aus der Tabelle: eigene und zugewiesene. Ohne sie zeigt die
      // Sidebar eine andere Zahl als die Inbox-Seite.
      let openAufgaben: { id: string; faelligAm: string }[] = [];
      try {
        openAufgaben = getMeineAufgaben(authUser?.id)
          .map(a => ({ id: `ag-${a.id}`, faelligAm: a.faelligAm || "" }))
          .filter(t => {
            const ds = toDateString(t.faelligAm);
            return !!ds && ds <= today;
          });
      } catch { /* ignore */ }

      // Bewerber Follow-Ups — nur für HR sichtbar, wie in der Inbox-Seite.
      // Zählt die Seitenleiste mehr als die Inbox zeigt, führt die Zahl in
      // eine Liste, in der die gezählten Punkte gar nicht stehen.
      let openBewerber: { id: string; faelligAm: string }[] = [];
      if (siehtBewerberMeldungen(user?.role)) {
        try {
          openBewerber = getBewerber()
            .flatMap(bewerberErinnerungen)
            .map((e) => ({ id: e.id, faelligAm: e.faelligAm }))
            .filter(t => !doneIds.includes(t.id))
            .filter(t => {
              const ds = toDateString(t.faelligAm);
              return !!ds && ds <= today;
            });
        } catch { /* ignore */ }
      }

      const total = openInbox.length + openAufgaben.length + openFollowUps.length + openBewerber.length;
      setInboxCount(total);

      /*
       * ── Glocken-Erinnerung an überfällige Aufgaben ──
       *
       * Diese Prüfung hängt an keinem Zeitplan. Sie läuft in jedem Durchlauf
       * von `updateInbox`, also beim Laden einer Seite, bei jeder Änderung an
       * Aufgaben oder Follow-ups und zusätzlich jede Minute. Wie oft daraus
       * eine Meldung wird, entscheidet allein der Mindestabstand.
       *
       * Der stand bis zum 18.09.2026 als Tagesmerker im Browserspeicher
       * (`mi_inbox_overdue_notified_<nutzer>_<datum>`) und galt damit je
       * Fenster und je Adresse, nicht je Nutzer: In der Lovable-Vorschau, am
       * zweiten Gerät oder in einem privaten Fenster fing er wieder bei null
       * an, und die Meldung kam mehrmals innerhalb einer Viertelstunde.
       * Jetzt liegt er in den Nutzereinstellungen, siehe
       * `lib/inboxErinnerungTakt.ts`, und der Nutzer wählt den Takt selbst.
       *
       * `isTableLoaded("user_settings")` ist wichtig: Ohne die geladene
       * Zeile lieferte die Einstellung ihren Rückfallwert, der gemerkte
       * Zeitpunkt wäre leer, und es würde bei jedem Seitenaufruf erneut
       * erinnert. Genau der Fehler soll hier nicht wiederkehren.
       */
      try {
        const hasOverdueFromPrev =
          openInbox.some(t => isTaskFromPreviousDay(t.faellig_am)) ||
          openAufgaben.some(t => isTaskFromPreviousDay(t.faelligAm)) ||
          openFollowUps.some(t => isTaskFromPreviousDay(t.faelligAm)) ||
          openBewerber.some(t => isTaskFromPreviousDay(t.faelligAm));
        const uid = authUser?.id;
        if (hasOverdueFromPrev && uid && isTableLoaded("user_settings") && darfJetztErinnern()) {
          // Zuerst merken, dann melden: Ein zweiter Durchlauf, den die Meldung
          // selbst auslöst, sieht den Abstand dann bereits.
          merkeErinnerung();
          notifyUser(uid, {
            titel: "Überfällige Inbox-Aufgaben",
            nachricht: "Du hast noch offene Inbox-Meldungen vom Vortag. Bitte prüfe und erledige sie.",
            link: "/inbox",
            category: "aufgaben",
          });
        }
      } catch { /* ignore */ }
    };
    const updateObjekte = () => {
      initObjekteSeenIfNeeded();
      setNewObjekte(getNewObjekteCount());
    };
    const updateSeenBadges = () => {
      // Lead-Verwaltung
      if (isTableLoaded("kontakte")) {
        // Der Stichtag wird weiterhin gesetzt, aber nicht mehr für den Zähler:
        // die Lead-Verwaltung braucht ihn für das grüne „Neu"-Fähnchen an der
        // einzelnen Zeile.
        initSeenIfNeeded(SEEN_KEYS.leadVerwaltung);
        initSeenIfNeeded(SEEN_KEYS.vpKontakte);
        const all = getKontakte();
        // Der Zähler zeigt offene Leads im Pool, nicht ungesehene.
        //
        // Vorher zählte er nur, was seit dem letzten Stichtag hereingekommen
        // war und noch nicht angeklickt wurde. Drei Folgen: ein Blick auf eine
        // Zeile löschte den Lead dauerhaft aus dem Zähler, obwohl er
        // unzugewiesen blieb; neue Mitarbeiter starteten bei null, weil der
        // Stichtag beim ersten Aufruf auf jetzt gesetzt wird; und gefiltert
        // wurde über das Freitextfeld `berater` statt über `zustaendig_id`.
        // Jetzt geht die Zahl erst auf null, wenn der Pool leer ist, und sie
        // meint dieselben Leads wie die Liste in der Lead-Verwaltung.
        setNewLeads(zaehleOffenePoolLeads(all, { rolle: user?.role || "", benutzerId: authUser?.id || null }));
        // Der fruehere Zaehler an "Alle Kontakte" (ungesehene Landingpage-
        // und Analysetool-Leads) ist ersatzlos entfallen: Er war ein
        // Ueberbleibsel vom alten Menuepunkt "Kontakte", liess sich ueber die
        // Kontaktliste nicht abbauen und zaehlte an einer Nachschlage-Ansicht
        // einen persoenlichen Arbeitsvorrat, den dort niemand erwartet. Der
        // seen-Stichtag bleibt gesetzt, das gruene Neu-Faehnchen an einzelnen
        // Zeilen nutzt ihn weiterhin.
      }
      // Bewerbungen
      if (isTableLoaded("bewerbungen")) {
        initSeenIfNeeded(SEEN_KEYS.bewerbungen);
        const seenBew = getSeenAt(SEEN_KEYS.bewerbungen);
        const seenBewIds = getSeenItemIds(SEEN_KEYS.bewerbungen);
        const bew = getBewerber().filter(b => {
          if (seenBewIds.has(String(b.id))) return false;
          return seenBew ? String(b.erstelltAm || "") > seenBew : false;
        }).length;
        setNewBewerber(bew);
      }
      // Unterlagen / VP-Bewertungen: zeigt "Neu", bis Nutzer den Punkt einmal geöffnet hat
      setUnterlagenNew(isNewBadgeActive(SEEN_KEYS.unterlagen));
      setVpBewertungenNew(isNewBadgeActive(SEEN_KEYS.vpBewertungen));
      setEinwandBiblNew(isNewBadgeActive(SEEN_KEYS.einwandBibliothek));
      setVertriebsakademieNew(isNewBadgeActive(SEEN_KEYS.vertriebsakademie));
    };
    update();
    updateInbox();
    updateObjekte();
    updateSeenBadges();
    const unsubCache = onCacheChange((table) => {
      update();
      // Neue oder erledigte Aufgaben müssen die Zahl sofort bewegen.
      if (table === "aufgaben" || table === "follow_ups") updateInbox();
    });
    const unsubCacheSeen = onCacheChange(() => updateSeenBadges());
    const onSeen = () => updateSeenBadges();
    window.addEventListener("seen-badge-updated", onSeen);
    window.addEventListener("news-updated", update);
    window.addEventListener("inbox-count-updated", updateInbox);
    window.addEventListener("inbox-updated", updateInbox);
    window.addEventListener("followups-updated", updateInbox);
    const inboxInterval = setInterval(updateInbox, 60_000);
    window.addEventListener("objekte-seen-updated", updateObjekte);
    return () => {
      unsubCache();
      unsubCacheSeen();
      window.removeEventListener("seen-badge-updated", onSeen);
      window.removeEventListener("news-updated", update);
      window.removeEventListener("inbox-count-updated", updateInbox);
      window.removeEventListener("inbox-updated", updateInbox);
      window.removeEventListener("followups-updated", updateInbox);
      clearInterval(inboxInterval);
      window.removeEventListener("objekte-seen-updated", updateObjekte);
    };
  }, [user?.role, user?.name, authUser?.id]);

  // Load custom permissions from user_settings + subscribe to realtime changes
  useEffect(() => {
    const loadPerms = async () => {
      try {
        const { data: { user: au } } = await supabase.auth.getUser();
        if (!au) return;
        const { data } = await supabase
          .from("user_settings")
          .select("einstellungen")
          .eq("user_id", au.id)
          .single();
        const perms = (data?.einstellungen as any)?.custom_permissions || [];
        setCustomPermissions(perms);
        const gatingOn = !!(data?.einstellungen as any)?.karriere_gating_active;
        const stufe = gatingOn ? ((data?.einstellungen as any)?.karriere_override ?? null) : null;
        setVpStufeId(typeof stufe === "string" && stufe.trim() ? stufe.trim() : null);
      } catch { /* ignore */ }
    };
    loadPerms();

    // Listen for realtime updates so admin changes apply immediately
    if (!authUser) return;
    const channel = supabase
      .channel('sidebar-perms')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_settings', filter: `user_id=eq.${authUser.id}` },
        (payload: any) => {
          const perms = payload.new?.einstellungen?.custom_permissions || [];
          setCustomPermissions(perms);
          const gatingOn = !!payload.new?.einstellungen?.karriere_gating_active;
          const stufe = gatingOn ? (payload.new?.einstellungen?.karriere_override ?? null) : null;
          setVpStufeId(typeof stufe === "string" && stufe.trim() ? stufe.trim() : null);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authUser]);
  const objLive = useLiveVersion(["objekte"]);
  // Der Schalter der Handbuch-Seite steht in app_config (HB-008).
  useLiveVersion(["app_config"]);
  /*
   * Auch auf Teilnehmer und Gruppen horchen, nicht nur auf Nachrichten.
   *
   * `getUnreadChatCount` zaehlt die Chats, in denen man Teilnehmer IST. Wer
   * neu zu einem Chat dazukommt, sieht dessen ungelesene Nachrichten also
   * erst, wenn diese Zeile neu rechnet. Sie hing aber allein an
   * `chat_nachrichten`, und eine neue Teilnehmerzeile ist keine Nachricht.
   *
   * Aufgefallen am 19.09.2026: Nachdem der Berater in seinen Kundenchat
   * eingetragen worden war, zeigte das Kundenprofil die beiden ungelesenen
   * Nachrichten, die Seitenleiste blieb leer.
   */
  const chatLive = useLiveVersion(["chat_nachrichten", "chat_teilnehmer", "chat_gruppen"]);
  const unreadChats = authUser ? getUnreadChatCount(authUser.id) : 0;

  // Recompute objekte count when cache changes
  useEffect(() => {
    setNewObjekte(getNewObjekteCount());
  }, [objLive]);

  /*
   * Welche Gruppen und Einträge es gibt, steht in `sidebarNavigation.ts`.
   * Die globale Suche liest dieselbe Quelle, damit sie genau die Seiten
   * findet, die hier stehen. Hier kommen nur noch Zähler und Marken dazu.
   */
  const handbuchFrei = handbuchPartnerFreigeschaltet();
  const gruppen = navigationsGruppen({
    rolle: user.role,
    customPermissions,
    vpStufeId,
    identitaet: { email: authUser?.email, userId: authUser?.id },
    videocallFreigabe,
    handbuchFrei,
  });

  const mitZaehler = (item: NavItem): NavItem => {
    if (item.url === "/news") return { ...item, badgeCount: unreadNews };
    if (item.title === "Inbox") return { ...item, badgeCount: inboxCount };
    if (item.title === "E-Mail") return { ...item, badgeCount: dbCounts.emails };
    if (item.url === "/chat") return { ...item, badgeCount: unreadChats };
    if (item.title === "Empfehlungen") return { ...item, badgeCount: dbCounts.empfehlungen };
    if (item.title === "Lead-Verwaltung") return { ...item, badgeCount: newLeads };
    if (item.title === "Objekt Einreichungen") return { ...item, badgeCount: dbCounts.objektEinreichungen };
    if (item.title === "Objekte") return { ...item, badgeCount: newObjekte };
    // Die drei Neu-Marken hängen alle am Wissen, nicht an den Werkzeugen.
    if (item.url === "/unterlagen") return { ...item, newBadge: unterlagenNew };
    if (item.url === "/vertriebsakademie/einwaende") return { ...item, newBadge: einwandBiblNew };
    if (item.url === "/vertriebsakademie") return { ...item, newBadge: vertriebsakademieNew };
    if (item.url === "/helpdesk") return { ...item, badgeCount: dbCounts.supportTickets };
    if (item.url === "/support-kontaktieren") return { ...item, badgeCount: ungeleseneSupportTickets.size };
    if (item.title === "HV-Tickets") return { ...item, badgeCount: dbCounts.hvTickets };
    // Der Zähler am "Bewerberprozess" meint neue Bewerber und gehört damit
    // zu den Bewerbersachen: nur HR. Der Menüpunkt selbst bleibt für Admin
    // und Inhaber erreichbar, sie sollen die Seite ja öffnen können, nur
    // eben nicht täglich angestupst werden.
    if (item.title === "Bewerberprozess") {
      return { ...item, badgeCount: siehtBewerberMeldungen(user.role) ? newBewerber : 0 };
    }
    if (item.title === "VP-Bewertungen") return { ...item, newBadge: vpBewertungenNew };
    return item;
  };

  // Kunde sees only Kundenprofil
  if (isKundeRole(user.role)) {
    return (
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
         <div className="hidden md:flex h-20 items-center justify-center px-2 border-b border-sidebar-border">
            {!collapsed ? (
              <>
                <img src={logoImg} alt="MOREImmo" className="w-full h-full object-contain block dark:hidden" />
                <img src={logoImgDark} alt="MOREImmo" className="w-full h-full object-contain hidden dark:block" />
              </>
            ) : (
              <img src={iconImg} alt="MOREImmo" className="h-8 w-8 object-contain" />
            )}
         </div>
        <SidebarContent className="px-2 py-2 flex-1">
          <NavGroup label="" items={gruppen[0].items.map(item =>
            item.title === "Chat" ? { ...item, badgeCount: unreadChats } : item
          )} collapsed={collapsed} userRole={user.role} iconTint={gruppen[0].iconTint} />
        </SidebarContent>
        <SidebarRoleSelector />
      </Sidebar>
    );
  }

  // Tippgeber: ausschließlich Portal-Einträge
  if (isTippgeberRole(user.role)) {
    return (
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <div className="hidden md:flex h-20 items-center justify-center px-2 border-b border-sidebar-border">
          {!collapsed ? (
            <>
              <img src={logoImg} alt="MOREImmo" className="w-full h-full object-contain block dark:hidden" />
              <img src={logoImgDark} alt="MOREImmo" className="w-full h-full object-contain hidden dark:block" />
            </>
          ) : (
            <img src={iconImg} alt="MOREImmo" className="h-8 w-8 object-contain" />
          )}
        </div>
        <SidebarContent className="px-2 py-2 flex-1">
          <NavGroup label="" items={gruppen[0].items} collapsed={collapsed} userRole={user.role} iconTint={gruppen[0].iconTint} />
        </SidebarContent>
        <SidebarRoleSelector />
      </Sidebar>
    );
  }

  // Admin/Inhaber roles are exempt from onboarding lock
  const isAdminRole = ["admin", "inhaber", "testaccount", "individuell"].includes(user.role);
  const locked = !isAdminRole && !onboardingComplete;

  const gruppenMitZaehler = gruppen.map((gruppe) => ({ ...gruppe, items: gruppe.items.map(mitZaehler) }));

  // Build lookup of all NavItems across groups so we can resolve favorites by url.
  const bookmarkLookup = new Map<string, NavItem>();
  for (const it of gruppenMitZaehler.flatMap((gruppe) => gruppe.items)) {
    if (!bookmarkLookup.has(it.url)) bookmarkLookup.set(it.url, it);
  }
  const favoriteItems: NavItem[] = favorites
    .map((u) => bookmarkLookup.get(u))
    .filter((it): it is NavItem => {
      if (!it) return false;
      if (
        it.adminOnly &&
        !siehtAdminOnlyNavigation(user.role) &&
        !(it.auchFuer || []).includes(user.role as string)
      ) return false;
      return isUrlAllowedForRole(it.url, (user.role || "admin") as any, customPermissions, vpStufeId, {
        email: authUser?.email,
        userId: authUser?.id,
      });
    });
  const showFavoritesBlock = !isMobile && !collapsed && favoriteItems.length > 0;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
       <div className="hidden md:flex h-20 items-center justify-center px-2 border-b border-sidebar-border">
          {!collapsed ? (
            <>
              <img src={logoImg} alt="MOREImmo" className="w-full h-full object-contain block dark:hidden" />
              <img src={logoImgDark} alt="MOREImmo" className="w-full h-full object-contain hidden dark:block" />
            </>
          ) : (
            <img src={iconImg} alt="MOREImmo" className="h-8 w-8 object-contain" />
          )}
       </div>
      <SidebarContent className="px-2 py-2 flex-1">
        {showFavoritesBlock && (
          <NavGroup label="★ Favoriten" items={favoriteItems} collapsed={collapsed} userRole={user.role} customPermissions={customPermissions} onboardingLocked={locked} vpStufeId={vpStufeId} iconTint="text-amber-500" showBookmarks={!isMobile && !collapsed} isFavorite={isFavorite} toggleFavorite={toggleFavorite} />
        )}
        {gruppenMitZaehler.map((gruppe) => (
          <NavGroup key={gruppe.label || "haupt"} label={gruppe.label} items={gruppe.items} collapsed={collapsed} defaultOpen={gruppe.defaultOpen} userRole={user.role} customPermissions={customPermissions} onboardingLocked={locked} vpStufeId={vpStufeId} iconTint={gruppe.iconTint} showBookmarks={!isMobile && !collapsed} isFavorite={isFavorite} toggleFavorite={toggleFavorite} />
        ))}
      </SidebarContent>
      <SidebarRoleSelector />
    </Sidebar>
  );
}
