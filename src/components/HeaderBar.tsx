import { useState, useEffect, useCallback } from "react";
import { Bell, Moon, Sun, Settings, MessageSquare, CheckSquare, Calendar, Trophy, GitBranch, Monitor, GraduationCap, ChevronRight, SlidersHorizontal, AtSign, LogOut, ShieldCheck, ShieldOff, Info, User, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TestModeHeaderBadge } from "@/components/TestModeBadge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useUser } from "@/contexts/UserContext";
import { darfEingeblendetWerden } from "@/lib/benachrichtigungAnzeige";
import { ROLES } from "@/types/user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { getMentionNotifications, markAllMentionsRead, getDocNotifications, getAnalyseLeadNotifications, getDeleteRequests } from "@/lib/notificationStore";
import { FileCheck, UserPlus, Trash2 as Trash2Icon } from "lucide-react";
import { requestPushPermission, showPushNotification, isDsgvoModeActive, setDsgvoMode } from "@/lib/pushNotifications";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import {
  getErinnerungsTakt,
  setErinnerungsTakt,
  TAKT_AUSWAHL,
  type ErinnerungsTakt,
} from "@/lib/inboxErinnerungTakt";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { einstellungenMenue } from "@/lib/einstellungenBereiche";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { onCacheChange, cacheGet } from "@/lib/dataCache";
import { getFollowUps } from "@/lib/followUpStore";
import { istBewerberMeldung, siehtBewerberMeldungen } from "@/lib/bewerberRechte";
import { SuchFeld } from "@/components/GlobaleSuche";
import { VorfuehrmodusSchalter } from "@/components/vorfuehrmodus/VorfuehrmodusSchalter";
import { benachrichtigungZiel } from "@/lib/benachrichtigungZiel";
import { objektbereichGesperrt } from "@/lib/sidebarNavigation";
import { FehlerMeldenEintrag } from "@/components/FehlerMeldenEintrag";

type NotificationCategory = "alle" | "chat" | "aufgaben" | "termine" | "wettbewerb" | "leads" | "system" | "academy";

const EXCLUDED_LS_KEY = "mi_notif_excluded_categories";

// Themen-Keys entsprechen settings.benachrichtigungen.themen in der zentralen Einstellungs-Seite
const notificationSettings: { key: "chat" | "aufgaben" | "termine" | "wettbewerb" | "leads" | "system" | "academy"; label: string; desc: string; icon: any; defaultOn: boolean }[] = [
  { key: "chat", label: "Chat-Nachrichten", desc: "Neue Nachrichten und Antworten im Chat", icon: MessageSquare, defaultOn: true },
  { key: "aufgaben", label: "Aufgaben & Inbox", desc: "Neue und fällige Aufgaben, Follow-ups", icon: CheckSquare, defaultOn: true },
  { key: "termine", label: "Termine & Kalender", desc: "Terminerinnerungen, Kalender-Updates", icon: Calendar, defaultOn: true },
  { key: "wettbewerb", label: "Wettbewerb", desc: "Challenge-Erinnerungen, Ranglisten-Updates", icon: Trophy, defaultOn: true },
  { key: "leads", label: "Leads & Pipeline", desc: "Neue Leads, Status-Änderungen, Zuweisungen", icon: GitBranch, defaultOn: true },
  { key: "system", label: "System & Updates", desc: "Plattform-Updates, Dokumenten-Freigaben, Bug-Reports", icon: Monitor, defaultOn: true },
  { key: "academy", label: "Academy & Schulungen", desc: "Neue Kurse, Zertifizierungen, Webinar-Erinnerungen", icon: GraduationCap, defaultOn: false },
];

type MockNotification = {
  id: number | string;
  title: string;
  desc: string;
  /** Wie lange es her ist, als Text fuer die Anzeige. */
  time: string;
  /**
   * Derselbe Zeitpunkt in Millisekunden, zum Sortieren.
   *
   * `time` taugt dafuer nicht: "Vor 10 Std." und "Vor 1 Tag" lassen sich
   * nicht vergleichen. Ohne diesen Wert stand die Liste bis zum 21.09.2026
   * in der Reihenfolge, in der die Quellen aneinandergehaengt wurden, und
   * ein Tag alte Erwaehnungen standen ueber einem zehn Stunden alten Lead.
   */
  ts: number;
  read: boolean;
  category: NotificationCategory;
  icon: React.ElementType;
  link: string;
};

const staticNotifications: MockNotification[] = [];

/**
 * Wie lange ein Ereignis her ist.
 *
 * Der Schutz vorweg ist nicht theoretisch: Am 16.09.2026 stand in der Glocke
 * „Vor NaN Tagen", weil der Zeitpunkt in der Meldung fehlte. `new Date(undefined)`
 * ergibt ein ungueltiges Datum, und jede Rechnung damit ergibt NaN, das dann
 * ungebremst bis in den Text durchlaeuft. Ein Platzhalter aus dem Innenleben
 * des Programms darf nie auf dem Bildschirm eines Nutzers landen.
 */
/**
 * Derselbe Zeitpunkt als Zahl, zum Sortieren.
 *
 * Fehlt oder taugt der Wert nichts, kommt 0 heraus. Solche Meldungen landen
 * damit unten, statt die Sortierung mit NaN unbrauchbar zu machen.
 */
function zeitpunkt(ts: string | null | undefined): number {
  if (!ts) return 0;
  const wert = new Date(ts).getTime();
  return Number.isFinite(wert) ? wert : 0;
}

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "";
  const zeitpunkt = new Date(ts).getTime();
  if (!Number.isFinite(zeitpunkt)) return "";
  const diff = Date.now() - zeitpunkt;
  if (diff < 0) return "Gerade eben";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Gerade eben";
  if (mins < 60) return `Vor ${mins} Min.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Vor ${hrs} Std.`;
  const tage = Math.floor(hrs / 24);
  return tage === 1 ? "Vor 1 Tag" : `Vor ${tage} Tagen`;
}

/**
 * Der Name in einer Meldung, oder ein neutraler Ersatz.
 *
 * „Pflichtunterlagen fehlen: undefined" war die Meldung, die den Fehler vom
 * 16.09.2026 sichtbar gemacht hat. Fehlt der Name, ist „ein Kunde" zwar
 * ungenau, aber wenigstens eine Aussage. Der Verweis in der Meldung fuehrt
 * ohnehin zur Akte, dort steht der Name.
 */
function nameOderErsatz(name: unknown): string {
  return typeof name === "string" && name.trim() ? name.trim() : "ein Kunde";
}

export function HeaderBar() {
  const { user, darkMode, toggleDarkMode, logout, authUser } = useUser();
  const navigate = useNavigate();
  const roleConfig = ROLES.find((r) => r.id === user.role);
  const [activeFilter, setActiveFilter] = useState<NotificationCategory>("alle");
  const [excludedCategories, setExcludedCategories] = useState<Set<NotificationCategory>>(() => {
    try {
      const raw = localStorage.getItem(EXCLUDED_LS_KEY);
      return raw ? new Set(JSON.parse(raw) as NotificationCategory[]) : new Set<NotificationCategory>();
    } catch {
      return new Set<NotificationCategory>();
    }
  });

  // Persist excluded categories to localStorage
  useEffect(() => {
    localStorage.setItem(EXCLUDED_LS_KEY, JSON.stringify(Array.from(excludedCategories)));
  }, [excludedCategories]);

  const [showSettings, setShowSettings] = useState(false);
  const [notifications, setNotifications] = useState<MockNotification[]>(staticNotifications);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  // Themen-Toggles aus user_settings.einstellungen.benachrichtigungen.themen lesen
  const readThemenState = () => {
    const ben = getUserSetting<any>("benachrichtigungen", null);
    const themen = ben?.themen || {};
    return notificationSettings.map((s) => ({
      ...s,
      enabled: themen[s.key] !== undefined ? !!themen[s.key] : s.defaultOn,
    }));
  };
  const [settingsState, setSettingsState] = useState(readThemenState);

  /*
   * Wie oft die Glocke an überfällige Inbox-Aufgaben erinnert. Die Einstellung
   * sitzt hier am Zahnrad der Glocke und nicht auf der Einstellungsseite, weil
   * genau hier steht, wer zu oft erinnert wird: neben den Themen, die man
   * abschalten kann, und einen Klick von der Meldung entfernt, die gestört hat.
   */
  const [erinnerungsTakt, setErinnerungsTaktState] = useState<ErinnerungsTakt>(getErinnerungsTakt);

  /*
   * Beim Öffnen frisch lesen. Die Zeile aus `user_settings` kann beim ersten
   * Rendern noch nicht geladen sein, dann stünde hier dauerhaft der
   * Vorgabewert statt der gespeicherten Wahl.
   */
  useEffect(() => {
    if (!showSettings) return;
    setErinnerungsTaktState(getErinnerungsTakt());
    setSettingsState(readThemenState());
  }, [showSettings]);

  // Beim Mount: Chip-Ausschlüsse aus den gespeicherten Themen-Einstellungen ableiten
  useEffect(() => {
    setExcludedCategories(() => {
      const ex = new Set<NotificationCategory>();
      settingsState.forEach((s) => { if (!s.enabled) ex.add(s.key as NotificationCategory); });
      return ex;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [dsgvoMode, setDsgvoModeState] = useState(isDsgvoModeActive());
  const isCustomer = user.role === "kunde";

  // "Heute zu tun"-Zähler: offene Follow-Ups die heute oder früher fällig sind
  const [heuteCount, setHeuteCount] = useState(0);
  useEffect(() => {
    if (isCustomer) return;
    const recompute = () => {
      try {
        const heute = new Date().toISOString().split("T")[0];
        const offen = getFollowUps().filter(
          (f) => (f.status === "offen" || f.status === "ueberfallig") && f.faelligAm && f.faelligAm <= heute
        );
        setHeuteCount(offen.length);
      } catch {
        setHeuteCount(0);
      }
    };
    recompute();
    const unsub = onCacheChange((table) => {
      if (table === "follow_ups") recompute();
    });
    window.addEventListener("inbox-updated", recompute);
    const t = setInterval(recompute, 60000);
    return () => {
      unsub();
      window.removeEventListener("inbox-updated", recompute);
      clearInterval(t);
    };
  }, [isCustomer]);

  // Merge mention + doc notifications into the notification list
  const loadNotifications = useCallback(async () => {
    const mentions = getMentionNotifications(authUser?.id);
    const mentionNotifs: MockNotification[] = mentions.map((m) => ({
      id: m.id,
      title: `@Erwähnung von ${m.mentionedByName}`,
      desc: `Du wurdest im Chat "${m.chatName}" erwähnt: "${m.messageText}"`,
      time: timeAgo(m.timestamp),
      ts: zeitpunkt(m.timestamp),
      read: m.read,
      category: "chat" as NotificationCategory,
      icon: AtSign,
      link: `/chat?id=${m.chatId}`,
    }));

    /*
     * Nur die eigenen. Als Inhaber darf man alle Zeilen LESEN, aber nur die
     * eigenen als gelesen markieren. Ohne diesen Filter stand eine fremde
     * Meldung in der Glocke, liess sich nicht wegklicken und war beim
     * naechsten Laden wieder da. Gemeldet am 17.09.2026.
     */
    const docNotifs = getDocNotifications(authUser?.id);
    const isBO = ["backoffice", "admin", "inhaber", "vertriebsleiter"].includes(user.role);
    const docMockNotifs: MockNotification[] = docNotifs
      .filter(d => {
        // Eine Vollzugsmeldung und eine versandte Reservierung sind Arbeit
        // fuer das Backoffice, eine Mahnung geht alle an.
        if (d.type === "alle_hochgeladen" || d.type === "reservierung_versandt") return isBO;
        return true;
      })
      .map((d) => ({
        id: d.id,
        title: d.type === "reservierung_versandt"
          ? `Reservierung versandt: ${nameOderErsatz(d.kundeName)}`
          : d.type === "alle_hochgeladen"
            ? `Unterlagen vollständig: ${nameOderErsatz(d.kundeName)}`
            : `Pflichtunterlagen fehlen: ${nameOderErsatz(d.kundeName)}`,
        /*
         * Die Anzahl nur nennen, wenn sie bekannt ist. „0 Pflichtunterlagen
         * fehlen noch" war die zweite unsinnige Zeile vom 16.09.2026: Eine
         * Meldung ueber null fehlende Unterlagen ist gegenstandslos, und die
         * Null kam ohnehin nur aus einem Rueckfall fuer eine fehlende Liste.
         */
        desc: d.type === "reservierung_versandt"
          ? `Die Reservierungsvereinbarung für ${nameOderErsatz(d.kundeName)} wurde zur Unterschrift versandt.`
          : d.type === "alle_hochgeladen"
          ? `Alle Pflichtunterlagen von ${nameOderErsatz(d.kundeName)} wurden hochgeladen, bitte prüfen und freigeben.`
          : d.fehlendeDocs?.length
            ? `${d.fehlendeDocs.length} Pflichtunterlagen von ${nameOderErsatz(d.kundeName)} fehlen noch (seit 2+ Tagen).`
            : `Bei ${nameOderErsatz(d.kundeName)} fehlen noch Pflichtunterlagen (seit 2+ Tagen).`,
        time: timeAgo(d.timestamp),
        ts: zeitpunkt(d.timestamp),
        read: d.read,
        category: "system" as NotificationCategory,
        icon: FileCheck,
        link: `/kunden/${d.kundeId}`,
      }));

    const analyseLeads = getAnalyseLeadNotifications();
    const analyseLeadNotifs: MockNotification[] = analyseLeads.map(a => ({
      id: a.id,
      title: `Neuer Interessent: ${a.kontaktName}`,
      desc: `Hat nach der Analyse (Qualität ${a.leadQuality}) einen Rückruf angefordert. Tel: ${a.telefon}`,
      time: timeAgo(a.timestamp),
      ts: zeitpunkt(a.timestamp),
      read: a.read,
      category: "leads" as NotificationCategory,
      icon: UserPlus,
      link: `/kunden/${a.kontaktId}`,
    }));

    const deleteReqs = getDeleteRequests();
    const deleteReqNotifs: MockNotification[] = isBO
      ? deleteReqs.filter(d => d.status === "offen").map(d => ({
          id: d.id,
          title: `Löschanfrage: ${d.kundeName}`,
          desc: `${d.requesterName} beantragt die Löschung. Grund: ${d.grund}`,
          time: timeAgo(d.timestamp),
          ts: zeitpunkt(d.timestamp),
          read: d.read,
          category: "system" as NotificationCategory,
          icon: Trash2Icon,
          link: `/kunden/${d.kundeId}`,
        }))
      : [];

    // Fetch real DB notifications from benachrichtigungen via cache (live-updated via realtime)
    let dbNotifs: MockNotification[] = [];
    try {
      // Nur eigene Benachrichtigungen anzeigen. Admins/Inhaber sehen dank
      // "Admins sehen alle Benachrichtigungen"-RLS zwar alle Rows im Cache,
      // dürfen sie aber nicht als gelesen markieren (UPDATE-Policy erlaubt
      // nur auth.uid() = benutzer_id) → beim Reload tauchen sie sonst wieder auf.
      const currentUid = authUser?.id;
      const dbRows = (cacheGet("benachrichtigungen") as any[])
        .filter((r) => !currentUid || r.benutzer_id === currentUid)
        .slice()
        .sort((a, b) => new Date(b.erstellt_am).getTime() - new Date(a.erstellt_am).getTime())
        .slice(0, 50);

      if (dbRows.length > 0) {
        // Collect IDs from local notifications to avoid duplicates
        const localIds = new Set([
          ...mentionNotifs.map(n => n.id),
          ...docMockNotifs.map(n => n.id),
          ...analyseLeadNotifs.map(n => n.id),
          ...deleteReqNotifs.map(n => n.id),
        ]);

        dbNotifs = dbRows
          .filter(row => !localIds.has(row.id))
          .filter(row => {
            // Interne Chat-Nachrichten haben eigenes Sidebar-Badge — nur DIE ausblenden.
            // Kunden-Nachrichten (Titel "💬 Kunden-Nachricht:") und Lead-bezogene Chats
            // (Link "/kunden/…?tab=chat-kunde") sollen in der Glocke erscheinen.
            const titel = String(row.titel || "").toLowerCase();
            const link = String(row.link || "");
            const isCustomerMsg = titel.startsWith("💬 kunden-nachricht") || link.includes("/kunden/");
            if (isCustomerMsg) return true;
            /*
             * Chatglocken aus der Edge Function `chat-benachrichtigung`,
             * seit dem 25.09.2026 fuer jede Chatnachricht an jeden im CRM.
             * Sie tragen `notif_type` "chat_nachricht" und werden gezeigt.
             * Aeltere Chatzeilen ohne diese Kennung bleiben ausgeblendet wie
             * bisher, sonst kaeme ein alter Stapel wieder hoch.
             */
            if ((row.meta as { notif_type?: string } | null)?.notif_type === "chat_nachricht") return true;
            // Bewerbermanagement gehört HR. Alle anderen bekommen diese
            // Meldungen nicht mehr zu sehen, auch die, die vor der Umstellung
            // schon geschrieben wurden.
            if (istBewerberMeldung(link) && !siehtBewerberMeldungen(user.role)) return false;
            if (link.startsWith("/chat") || link.includes("?id=") && link.includes("/chat")) return false;
            if (titel.startsWith("neue nachricht von")) return false;
            return true;
          })
          .map(row => {
            const titel = String(row.titel || "");
            const link = String(row.link || "");
            let category: NotificationCategory = "system";
            if (titel.toLowerCase().includes("lead") || titel.toLowerCase().includes("tippgeber") || link.startsWith("/kunden/")) category = "leads";
            else if (link.includes("/chat")) category = "chat";
            else if (link.includes("/aufgaben") || link.includes("/inbox")) category = "aufgaben";
            else if (link.includes("/kalender") || link.includes("/termine")) category = "termine";
            // Manche Benachrichtigungen speichern nachricht als JSON-String mit {text, ...}
            let desc = String(row.nachricht || "");
            const trimmed = desc.trim();
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
              try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === "object") {
                  desc = String(parsed.text || parsed.message || parsed.nachricht || parsed.body || desc);
                }
              } catch { /* leave raw */ }
            }
            return {
              id: row.id,
              title: titel,
              desc,
              time: timeAgo(row.erstellt_am),
              ts: zeitpunkt(row.erstellt_am),
              read: row.gelesen,
              category,
              icon: Info,
              link: row.link || "/inbox",
            };
          });
      }
    } catch {
      // silently fail – cache might not be ready
    }

    /*
     * Neueste zuerst, quer ueber alle Quellen.
     *
     * Bis zum 21.09.2026 wurden die Listen nur aneinandergehaengt. Die
     * Reihenfolge war damit die der Quellen und nicht die der Zeit: Vier einen
     * Tag alte Erwaehnungen standen ueber einem zehn Stunden alten Lead, und
     * es sah aus, als waeren sie oben angeheftet.
     */
    const alle = [
      ...deleteReqNotifs,
      ...analyseLeadNotifs,
      ...docMockNotifs,
      ...mentionNotifs,
      ...dbNotifs,
      ...staticNotifications,
    ].sort((a, b) => b.ts - a.ts);
    setNotifications(alle);
  }, [user.role, authUser?.id]);

  useEffect(() => {
    loadNotifications();
    // Request push permission on first load
    requestPushPermission();

    const handler = () => {
      loadNotifications();
    };
    const pushHandler = (e: Event) => {
      loadNotifications();
      // Show browser push notification for new events
      const detail = (e as CustomEvent).detail;
      if (detail?.title) {
        showPushNotification(detail.title, { body: detail.body, tag: detail.tag, category: detail.category });
      }
    };
    window.addEventListener("mention-notification", (e) => {
      handler();
      showPushNotification("Neue @-Erwähnung", { body: "Du wurdest in einem Chat erwähnt", tag: "mention", category: "chat" });
    });
    window.addEventListener("doc-notification", (e) => {
      handler();
      showPushNotification("Dokument-Update", { body: "Neue Dokumenten-Benachrichtigung", tag: "doc", category: "system" });
    });
    window.addEventListener("analyse-lead-notification", (e) => {
      handler();
      showPushNotification("Neuer Lead", { body: "Ein neuer Interessent hat sich gemeldet", tag: "lead", category: "leads" });
    });
    window.addEventListener("delete-request-notification", (e) => {
      handler();
      showPushNotification("Löschanfrage", { body: "Ein Mitarbeiter beantragt eine Kundenlöschung", tag: "delete-request", category: "system" });
    });
    window.addEventListener("inbox-updated", handler);
    window.addEventListener("bell-notification", handler);

    // Realtime: Cache-Listener für ALLE benachrichtigungen-Änderungen (INSERT/UPDATE/DELETE)
    // Damit greifen auch Benachrichtigungen, die mit fremder benutzer_id (z. B. via ziel_rolle) gespeichert wurden.
    const unsubCache = onCacheChange((table, event, row) => {
      if (table === "benachrichtigungen") {
        loadNotifications();
        /*
         * Eingeblendet wird nur, was auch in der eigenen Glocke landet.
         *
         * Bis zum 17.09.2026 fehlte diese Pruefung. Die LISTE unten filtert
         * seit jeher auf `benutzer_id === authUser.id`, die Einblendung davor
         * nicht. Wer wie Christian als Inhaber laut Zeilensicherheit ALLE
         * Benachrichtigungen lesen darf, wurde deshalb bei jeder Meldung an
         * jeden Mitarbeiter gestoert und fand in seiner Glocke nichts dazu.
         * Aufgefallen an „Reservierung versandt: Jonas Lins", zugestellt an
         * p.pintat@more.immo, eingeblendet bei Christian.
         *
         * Der alte Kommentar rechtfertigte das Nichtfiltern mit Meldungen
         * ueber `ziel_rolle`. Das Argument traegt nicht: Solche Meldungen
         * zeigt die Liste ohnehin nicht an, die Einblendung waere also ein
         * Hinweis auf etwas, das man nirgends nachlesen kann. Und
         * `benachrichtigungen.ziel_rolle` wird an genau einer Stelle im
         * ganzen Projekt gesetzt.
         *
         * Im Zweifel einblenden: Ist die eigene Kennung noch nicht geladen,
         * wird nicht unterdrueckt. Dieselbe Regel wie in der Liste.
         */
        const fuerMich = darfEingeblendetWerden(row, authUser?.id);
        if (event === "INSERT" && row && fuerMich) {
          // Kategorie aus Titel/Link ableiten (best effort) – Bugs explizit als "bug"
          const titel = String(row.titel || "");
          const link = String(row.link || "");
          let category: any = undefined;
          if (titel.toLowerCase().includes("bug") || link.includes("/helpdesk")) category = "bug";
          else if (link.includes("/chat")) category = "chat";
          else if (link.includes("/aufgaben") || link.includes("/inbox")) category = "aufgaben";
          else if (link.includes("/kalender") || link.includes("/termine")) category = "termine";
          else if (link.includes("/leads") || link.includes("/pipeline")) category = "leads";
          showPushNotification(row.titel || "Neue Benachrichtigung", {
            body: row.nachricht || "",
            tag: `bell-${row.id}`,
            category,
          });
        }
      }
    });

    return () => {
      window.removeEventListener("mention-notification", handler);
      window.removeEventListener("doc-notification", handler);
      window.removeEventListener("analyse-lead-notification", handler);
      window.removeEventListener("delete-request-notification", handler);
      window.removeEventListener("inbox-updated", handler);
      window.removeEventListener("bell-notification", handler);
      unsubCache();
    };
  }, [loadNotifications]);

  // Recompute counts based on current notifications
  const unreadCount = notifications.filter((n) => !n.read).length;
  const chatMentionCount = notifications.filter(n => n.category === "chat" && !n.read).length;

  const categoryFilters: { id: NotificationCategory; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "alle", label: "Alle", icon: Bell },
    { id: "chat", label: "Chat", icon: MessageSquare, count: chatMentionCount },
    { id: "aufgaben", label: "Aufgaben", icon: CheckSquare, count: notifications.filter(n => n.category === "aufgaben" && !n.read).length },
    { id: "termine", label: "Termine", icon: Calendar, count: notifications.filter(n => n.category === "termine" && !n.read).length },
    { id: "wettbewerb", label: "Wettbewerb", icon: Trophy, count: notifications.filter(n => n.category === "wettbewerb" && !n.read).length },
    { id: "leads", label: "Leads", icon: GitBranch, count: notifications.filter(n => n.category === "leads" && !n.read).length },
    { id: "system", label: "System", icon: Monitor, count: notifications.filter(n => n.category === "system" && !n.read).length },
    { id: "academy", label: "Academy", icon: GraduationCap },
  ];

  const filtered = activeFilter === "alle"
    ? notifications.filter((n) => !excludedCategories.has(n.category))
    : notifications.filter((n) => n.category === activeFilter && !excludedCategories.has(n.category));

  const toggleSetting = (idx: number) => {
    setSettingsState((prev) => {
      const next = prev.map((s, i) => (i === idx ? { ...s, enabled: !s.enabled } : s));
      // Auto-Save: schreibe alle Themen-Werte in user_settings
      const ben = getUserSetting<any>("benachrichtigungen", {}) || {};
      const themen = { ...(ben.themen || {}) };
      next.forEach((s) => { themen[s.key] = s.enabled; });
      setUserSetting("benachrichtigungen", { ...ben, themen });
      // Sync mit Chip-Filter: deaktivierte Themen werden aus der Anzeige ausgeblendet
      setExcludedCategories(() => {
        const ex = new Set<NotificationCategory>();
        next.forEach((s) => { if (!s.enabled) ex.add(s.key as NotificationCategory); });
        return ex;
      });
      return next;
    });
  };

  /*
    Wer den Objektbereich nicht sehen darf, wird nicht dorthin geschickt, auch
    nicht von alten Glocken wie „Wohnung exklusiv zugewiesen“. Dieselben
    Angaben wie in der Suche (`GlobaleSuche.tsx`).
  */
  const zielFuer = (link: string | null | undefined) => {
    const stufe = getUserSetting<boolean>("karriere_gating_active", false)
      ? getUserSetting<string | null>("karriere_override", null)
      : null;
    return benachrichtigungZiel(link, window.location.host, (pfad) =>
      objektbereichGesperrt(pfad, {
        rolle: user.role,
        customPermissions: getUserSetting<string[]>("custom_permissions", []) || [],
        vpStufeId: typeof stufe === "string" && stufe.trim() ? stufe.trim() : null,
        identitaet: { email: authUser?.email, userId: authUser?.id },
      }),
    );
  };

  const handleNotificationClick = (n: MockNotification) => {
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === n.id ? { ...notif, read: true } : notif))
    );
    // Mark as read in DB + local cache (sonst poppt beim nächsten loadNotifications wieder als ungelesen auf)
    import("@/lib/dataCache").then(({ cacheUpdate }) => {
      cacheUpdate("benachrichtigungen", String(n.id), { gelesen: true }, { silent: true })
        .catch(() => {})
        .finally(() => window.dispatchEvent(new CustomEvent("benachrichtigungen-updated")));
    });
    setPopoverOpen(false);
    /*
      Nicht blind an den Router: Eine volle Adresse in der Tabelle endete auf
      der 404-Seite, siehe benachrichtigungZiel.ts. Der Pfad wird gekuerzt,
      Fremdes geht in ein neues Fenster.
    */
    const ziel = zielFuer(n.link);
    if (ziel.art === "extern") window.open(ziel.url, "_blank", "noopener");
    else if (ziel.art === "intern") navigate(ziel.pfad);
  };

  const markAllRead = async () => {
    // Capture unread IDs before updating state
    const currentUnread = notifications.filter(n => !n.read);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    markAllMentionsRead(authUser?.id);
    // Alle DB-Rows als gelesen markieren — via cacheUpdate, damit lokaler Cache mit-updatet
    try {
      const { cacheGet, cacheUpdate } = await import("@/lib/dataCache");
      /*
       * Nur die eigenen Zeilen. Verwaltende sehen laut Zeilensicherheit alle,
       * aendern duerfen sie nur ihre eigenen. Ohne diesen Filter versuchte
       * "Alle gelesen" auch fremde Meldungen zu markieren; die Versuche
       * scheiterten und wurden als Fehler gemeldet.
       */
      const meineKennung = authUser?.id;
      const unreadRows = (cacheGet("benachrichtigungen") as any[])
        .filter((r) => !r.gelesen)
        .filter((r) => !meineKennung || r.benutzer_id === meineKennung);
      /*
       * Fehler nicht mehr verschlucken. Bis zum 15.09.2026 stand hier
       * `.catch(() => {})`: Schlug das Speichern fehl, blieb die Glocke auf
       * der alten Zahl stehen, ohne dass jemand erfuhr warum. Jetzt wird
       * gezaehlt, was wirklich durchging, und der Rest einmal gemeldet.
       */
      const ergebnisse = await Promise.allSettled(
        unreadRows.map((r) =>
          cacheUpdate("benachrichtigungen", r.id, { gelesen: true }, { silent: true })
        )
      );
      const gescheitert = ergebnisse.filter((e) => e.status === "rejected").length;
      if (gescheitert > 0) {
        console.warn(
          `[HeaderBar] ${gescheitert} von ${unreadRows.length} Meldungen konnten nicht als gelesen vermerkt werden`,
        );
      }
    } catch (fehler) {
      console.warn("[HeaderBar] Alle gelesen fehlgeschlagen:", fehler);
    }
    // Notify sidebar to refresh its count
    window.dispatchEvent(new CustomEvent("benachrichtigungen-updated"));
  };

  return (
    /*
      Hoehe und Trennstrich folgen dem Logokaestchen der Seitenleiste.

      Vorher war die Leiste `h-16`, das Kaestchen daneben `h-20`. Der
      Unterschied von einer Viertelzeile ist klein genug, dass man ihn nicht
      benennt, und gross genug, dass der Trennstrich einen sichtbaren Versatz
      bekam: Er lief links auf einer anderen Hoehe als rechts.

      Auch die Farbe war eine andere. `hairline-b` ist deutlich zarter als
      `border-sidebar-border`, und zwei verschieden helle Striche auf
      derselben Linie sehen aus wie ein Fehler. Jetzt ist es ein Strich.

      Wer die Hoehe aendert, aendert sie an beiden Stellen: hier und an den
      vier Logokaestchen in `AppSidebar.tsx`.
    */
    <header className="h-20 flex items-center justify-between border-b border-sidebar-border bg-background/95 backdrop-blur-2xl backdrop-saturate-200 px-3 sm:px-5 sticky top-0 z-[60]">
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <SidebarTrigger className="h-8 w-8 sm:h-7 sm:w-7" />
        <TestModeHeaderBadge />
      </div>

      {/*
        Die Suche nimmt den ganzen freien Raum zwischen den beiden Gruppen.

        Sie stand bis zum 14.09.2026 rechts neben der Glocke, und links davon
        lag eine breite leere Flaeche. Jetzt streckt sie sich bis kurz hinter
        den Sidebar-Schalter. `min-w-0` gehoert dazu: Ohne diese Zeile weigert
        sich ein Flex-Element, unter seine Inhaltsbreite zu schrumpfen, und
        die Leiste liefe auf schmalen Schirmen ueber.

        Fuer Kunden bleibt sie aus, sie haetten ohnehin keine Treffer ausser
        ihren eigenen Seiten.
      */}
      {!isCustomer && (
        <div className="flex-1 min-w-0 px-2 sm:px-4">
          <SuchFeld />
        </div>
      )}

      <div className="flex items-center gap-1 sm:gap-3 shrink-0">

        {/* Notifications */}
        <Popover open={popoverOpen} onOpenChange={(open) => { setPopoverOpen(open); if (open) loadNotifications(); else setShowAllNotifications(false); }}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Benachrichtigungen" className="relative">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(420px,calc(100vw-2rem))] p-0 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <h4 className="text-base font-semibold text-foreground">Benachrichtigungen</h4>
                {unreadCount > 0 && (
                  <Badge className="bg-destructive text-destructive-foreground text-[10px] px-1.5 h-5">
                    {unreadCount}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">Alle gelesen</button>
                <Button
                  variant="ghost"
                  size="icon" aria-label="Filter"
                  className="h-7 w-7"
                  onClick={() => { setSettingsState(readThemenState()); setShowSettings(true); }}
                >
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>

            {/* Category filters */}
            <div className="px-4 py-2.5 flex flex-wrap gap-1.5 border-b border-border">
            {categoryFilters.filter((cat) => cat.id === "alle" || !excludedCategories.has(cat.id)).map((cat) => {
                const isExcluded = excludedCategories.has(cat.id);
                const isActive = activeFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={(e) => {
                      if (e.shiftKey && cat.id !== "alle") {
                        setExcludedCategories((prev) => {
                          const next = new Set(prev);
                          if (next.has(cat.id)) {
                            next.delete(cat.id);
                          } else {
                            next.add(cat.id);
                          }
                          return next;
                        });
                        if (activeFilter !== "alle") setActiveFilter("alle");
                      } else {
                        setActiveFilter(cat.id);
                        if (cat.id === "alle") {
                          setExcludedCategories(new Set());
                        }
                      }
                    }}
                    title={cat.id === "alle" ? undefined : "Shift+Klick zum Ein-/Ausblenden"}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isExcluded
                          ? "bg-destructive/10 text-destructive line-through hover:bg-destructive/20"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    <cat.icon className={`h-3 w-3 ${isExcluded ? "opacity-50" : ""}`} />
                    {cat.label}
                    {cat.count && cat.count > 0 && (
                      <span className={`ml-0.5 ${isActive ? "text-primary-foreground" : isExcluded ? "text-destructive/70" : "text-destructive font-bold"}`}>
                        {cat.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Notification list */}
            <div className={`flex-1 overflow-y-auto ${showAllNotifications ? "max-h-[70vh]" : "max-h-[50vh]"}`}>
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Keine Benachrichtigungen</div>
              ) : (
                (showAllNotifications ? filtered : filtered.slice(0, 10)).map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 cursor-pointer transition-colors ${
                      !n.read
                        ? "bg-primary/5 border-l-2 border-l-primary hover:bg-primary/10"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <n.icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${!n.read ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm flex items-center gap-1.5 ${!n.read ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}>
                        {n.title}
                        {!n.read && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 animate-pulse" />}
                      </p>
                      <p className={`text-xs mt-0.5 line-clamp-2 ${!n.read ? "text-foreground/70" : "text-muted-foreground"}`}>{n.desc}</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">{n.time}</p>
                    </div>
                    {zielFuer(n.link).art !== "keins" && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {filtered.length > 10 && !showAllNotifications && (
              <div className="p-3 border-t border-border text-center">
                <button
                  onClick={() => setShowAllNotifications(true)}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Alle Benachrichtigungen anzeigen ({filtered.length})
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Notification Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setShowSettings(false); setPopoverOpen(true); }}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors -ml-1"
                  aria-label="Zurück zu Benachrichtigungen"
                  title="Zurück zu Benachrichtigungen"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <SlidersHorizontal className="h-5 w-5" />
                Benachrichtigungs-Einstellungen
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-2">
              Wähle aus, für welche Kategorien du Benachrichtigungen erhalten möchtest. Deaktivierte Kategorien werden auch aus den Filter-Chips ausgeblendet.
            </p>

            {!isCustomer && (
              <div className="mt-3 rounded-lg border border-border p-3">
                <label htmlFor="erinnerungs-takt" className="text-sm font-medium text-foreground">
                  Erinnerung an überfällige Aufgaben
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Wie oft dich die Glocke höchstens an offene Inbox-Aufgaben vom Vortag erinnert.
                  Die Einstellung gilt nur für dich und auch an einem zweiten Gerät.
                </p>
                <Select
                  value={erinnerungsTakt}
                  onValueChange={(v) => {
                    const takt = v as ErinnerungsTakt;
                    setErinnerungsTaktState(takt);
                    setErinnerungsTakt(takt);
                  }}
                >
                  <SelectTrigger id="erinnerungs-takt" className="mt-2 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAKT_AUSWAHL.map((a) => (
                      <SelectItem key={a.wert} value={a.wert}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  {TAKT_AUSWAHL.find((a) => a.wert === erinnerungsTakt)?.hinweis}
                </p>
              </div>
            )}

            <div className="space-y-1 mt-2">
              {settingsState.map((setting, idx) => (
                <div key={setting.label} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                  <setting.icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{setting.label}</p>
                    <p className="text-xs text-muted-foreground">{setting.desc}</p>
                  </div>
                  <Switch
                    checked={setting.enabled}
                    onCheckedChange={() => toggleSetting(idx)}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Hinweis:</span> Push-Benachrichtigungen werden direkt in der App angezeigt. E-Mail-Benachrichtigungen können in den{" "}
                <button onClick={() => { setShowSettings(false); navigate("/einstellungen"); }} className="text-primary hover:underline">
                  allgemeinen Einstellungen
                </button>
                {" "}konfiguriert werden.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dark/Light Mode - hidden on small mobile */}
        <Button variant="ghost" size="icon" aria-label="Heller Modus" onClick={toggleDarkMode} className="hidden sm:inline-flex">
          {darkMode ? (
            <Sun className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Moon className="h-5 w-5 text-muted-foreground" />
          )}
        </Button>

        {/* Vorfuehrmodus: nur Inhaber und Admin, der Schalter blendet sich fuer
            alle anderen selbst aus. Er steht in der Kopfzeile, weil der Modus
            im ganzen CRM wirkt und hier auf jeder Seite erreichbar ist. */}
        <VorfuehrmodusSchalter />

        {/*
          Hier stand bis zum 18.09.2026 das rote Ausrufezeichen „Fehler an IT
          melden". In drei Monaten wurde es dreimal benutzt, zweimal im Juli,
          einmal im August, im September gar nicht. Christian hat es deshalb
          gestrichen.

          Der Meldedialog selbst bleibt vollstaendig. Er oeffnet sich naemlich
          auch von selbst, wenn etwas abstuerzt, und genau das ist der
          wertvolle Weg: Bei einem Absturz rendert die Fehlerseite anstelle der
          ganzen Anwendung, Kopfzeile inklusive. Siehe `lib/fehlerMelden.ts`,
          `RouteErrorBoundary` und `FehlerAufzeichnung`.
        */}

        {/* User Info + Settings + Logout */}
        <div className="flex items-center gap-1 sm:gap-2 pl-1 sm:pl-2 border-l border-border">
          <Avatar className="h-8 w-8 hidden sm:flex">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-foreground leading-tight">{user.name}</p>
            <p className="text-xs text-muted-foreground leading-tight">{roleConfig?.label}</p>
          </div>
          {/*
            Das Zahnrad oeffnet seit dem 14.09.2026 ein Menue statt direkt die
            Seite. Grund war Christians Beobachtung, dass man den gesuchten
            Bereich sonst erst auf der Seite suchen muss, obwohl man beim Klick
            schon weiss, wohin man will.

            Welche Bereiche erscheinen und welche gesperrt sind, sagt
            `einstellungenBereiche`. Dieselbe Auskunft benutzt die Seite selbst,
            damit im Menue nie ein Bereich steht, den die Seite nicht kennt.
          */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon" aria-label="Einstellungen"
                className="rounded-full"
              >
                <Settings className="h-5 w-5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            {/*
              `z-[70]` gehoert dazu. Das Menue bringt von Haus aus `z-50` mit,
              die Kopfleiste liegt aber auf `z-[60]` und schnitt es dadurch an
              der Oberkante ab. Dieselbe Ebene benutzt die Trefferliste der
              globalen Suche, aus demselben Grund.
            */}
            <DropdownMenuContent align="end" className="w-56 z-[70]">
              <DropdownMenuLabel>Einstellungen</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {einstellungenMenue(user.role).map((eintrag) =>
                eintrag.unterpunkte ? (
                  <DropdownMenuSub key={eintrag.titel}>
                    <DropdownMenuSubTrigger>{eintrag.titel}</DropdownMenuSubTrigger>
                    {/*
                      Das Portal ist hier keine Feinheit, sondern noetig.

                      Der Menuekasten traegt `overflow-hidden`, und das
                      Untermenue oeffnet seitlich neben ihm. Ohne Portal wurde
                      es dadurch vollstaendig abgeschnitten: Der Klick kam an,
                      nur sah man nichts. Im Portal haengt es am Dokument und
                      nicht mehr im Kasten.
                    */}
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="z-[70]">
                        {eintrag.unterpunkte.map((bereich) => (
                          <DropdownMenuItem
                            key={bereich.slug}
                            disabled={!bereich.offen}
                            onSelect={() => {
                              if (!bereich.offen) return;
                              navigate(`/einstellungen?tab=${bereich.slug}`);
                            }}
                          >
                            {bereich.titel}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                ) : (
                  <DropdownMenuItem
                    key={eintrag.bereich!.slug}
                    disabled={!eintrag.bereich!.offen}
                    onSelect={() => {
                      if (!eintrag.bereich!.offen) return;
                      navigate(`/einstellungen?tab=${eintrag.bereich!.slug}`);
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>{eintrag.titel}</span>
                    {eintrag.bereich!.abzeichen && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300 py-0 px-1"
                      >
                        {eintrag.bereich!.abzeichen}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                ),
              )}
              {/*
                „Fehler melden" sitzt am Fuss des Menues, abgesetzt von den
                Einstellungsbereichen: Es fuehrt auf keine Seite, es oeffnet
                einen Dialog ueber der aktuellen. Kunden bekommen es nicht,
                genau wie das rote Ausrufezeichen es vorher nicht bekamen.
                Warum es hier und nicht auf der Einstellungsseite steht, sagt
                `FehlerMeldenEintrag`.
              */}
              {!isCustomer && (
                <>
                  <DropdownMenuSeparator />
                  <FehlerMeldenEintrag />
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon" aria-label="Abmelden"
            className="rounded-full"
            title="Abmelden"
            onClick={async () => {
              await logout();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="h-4.5 w-4.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </header>
  );
}
