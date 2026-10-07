import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useSearchParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MoreVertical, Users, VolumeX, Volume2, Archive, ArchiveRestore, Trash2, Pin, PinOff, Eye, EyeOff, Star, UserPlus, LogOut, Paperclip, ExternalLink, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChats, saveChats, updateChat, addMessage, getInitials, markChatAsRead, markChatAsUnread, getUnreadChatCountForChat, verlasseChat, type ChatData, type ChatParticipant } from "@/lib/chatStore";
import { cacheGet, cacheInsert } from "@/lib/dataCache";
import { useLiveVersion } from "@/hooks/useLiveData";
import { ChatTeilnehmerLeiste } from "@/components/chat/ChatTeilnehmerLeiste";
import { einladbareTeilnehmer, ladeTeilnehmerEin } from "@/lib/chatEinladung";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { ChatVerlauf, type ChatVerlaufHandle, type ChatVerlaufKennzahlen } from "@/components/chat/ChatVerlauf";
import { useChatSichthoehe } from "@/components/kunden/profil/useChatSichthoehe";
import { colorForName } from "@/components/chat/chatFarbe";

type ChatFilter = "alle" | "ungelesen" | "gelesen" | "angepinnt" | "archiviert" | "kundenkommunikation" | "intern";
export default function Chat() {
  const { user, authUser } = useUser();
  const myId = authUser?.id || "current";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [chats, setChats] = useState<ChatData[]>(() => getChats());
  const paramChatId = searchParams.get("id") || "";
  const initialChatId = paramChatId || chats[0]?.id || "";
  const [selectedChat, setSelectedChat] = useState<string>(initialChatId);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteDialog, setInviteDialog] = useState(false);
  const [selectedInvites, setSelectedInvites] = useState<string[]>([]);
  const [chatFilter, setChatFilter] = useState<ChatFilter>("alle");

  // Delete confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  /** Sperrt Austritt und Entfernen waehrend des Schreibens. Ohne die Sperre
   *  erzeugt ein zweiter Klick eine zweite Systemmeldung. */
  const [verlassenLaeuft, setVerlassenLaeuft] = useState(false);
  /**
   * Zähler für von Hand geänderte Lesezustände.
   *
   * Gelesen und ungelesen werden zuerst im Zwischenspeicher gesetzt. Ohne
   * diesen Zähler merkt die Auswertung der ungelesenen Nachrichten davon
   * nichts, weil sie nur auf die Live-Version der Datenbank hört. Der blaue
   * Punkt erschien deshalb erst beim nächsten Ereignis von außen.
   */
  const [leseStandVersion, setLeseStandVersion] = useState(0);
  /*
   * Kopfzeile und Verlauf sind getrennt.
   *
   * Der Verlauf steht seit der Herausloesung in `ChatVerlauf`. Die Kopfzeile
   * hier zeigt aber weiterhin die Zahl der Anhaenge und der Markierungen und
   * oeffnet die beiden Listen. Deshalb meldet der Baustein seine Zahlen nach
   * oben, und die Kopfzeile ruft ueber diesen Griff hinein. Eine zweite
   * Berechnung derselben Zahlen waere die naechste doppelte Wahrheit.
   */
  const verlaufRef = useRef<ChatVerlaufHandle>(null);
  const [verlaufKennzahlen, setVerlaufKennzahlen] = useState<ChatVerlaufKennzahlen>({ dateien: 0, markierte: 0 });
  /*
    Die Chatflaeche haengt am sichtbaren Ausschnitt, nicht an der Fensterhoehe.
    Auf dem Telefon schiebt die Tastatur den halben Bildschirm zu, die Seite
    bleibt dabei aber genau so hoch wie vorher. Weil weder die Seite noch der
    Inhaltsbereich scrollen koennen, faende der Browser keinen anderen Ausweg,
    als die ganze Seite nach oben zu schieben: Die Kopfzeile verschwindet, und
    beim Schliessen der Tastatur springt alles zurueck. Das Kundenprofil nutzt
    den Griff seit dem 05.10.2026 nicht mehr: Dort steht der Chat tief auf
    einer scrollbaren Seite und hat eine feste Hoehe, siehe
    `components/kunde/KommunikationReiter.tsx`.
  */
  const chatFlaecheRef = useChatSichthoehe();
  const activeChat = chats.find((c) => c.id === selectedChat);
  const isAdmin = ["admin", "inhaber"].includes(user.role);
  const isBewerber = false;
  // Kundenkommunikations-Chats sind 1-zu-1 zwischen Kunde und zugewiesenem Vertriebspartner.
  // Niemand darf weitere Teilnehmer hinzufügen oder beitreten.
  const isKundenChat = (chat: { typ?: string } | undefined | null) => chat?.typ === "kundenkommunikation";

  /**
   * Darf ich diesen Chat verlassen?
   *
   * Vorher lautete die Bedingung nur "ich bin nicht der Ersteller", verglichen
   * ueber den Namen aus dem meta. Bei Chats, die eine Datenbankfunktion
   * anlegt, ist dieses Feld leer, deshalb stand der Menuepunkt dort immer da,
   * auch fuer den Ersteller und auch fuer jemanden, der gar nicht mehr
   * Teilnehmer ist. Genau das lud zum zweiten Klick ein.
   */
  const darfVerlassen = (chat: ChatData) => {
    if (isKundenChat(chat)) return false;
    // Tippgeber-Chats folgen der Zuordnung, nicht der freien Wahl. Tritt der
    // Vertriebspartner aus, findet get_or_create_tippgeber_vp_chat den Chat
    // beim naechsten Oeffnen nicht mehr, weil die Funktion beide Teilnehmer
    // verlangt, und legt einen zweiten gleichnamigen Chat an. Der Verlauf
    // bliebe im alten liegen. Soll jemand anders zustaendig sein, aendert man
    // die Zuordnung, nicht die Teilnahme.
    if (chat.kind === "tippgeber_vp") return false;
    const istErsteller = chat.erstelltVonId
      ? chat.erstelltVonId === myId
      : chat.erstelltVon === user.name;
    if (istErsteller) return false;
    return chat.teilnehmer.some(t => t.id === myId);
  };

  // Realtime: refresh chats whenever cache updates for chat tables
  const liveVersion = useLiveVersion(["chat_nachrichten", "chat_gruppen", "chat_teilnehmer", "user_settings", "user_roles", "profiles"]);
  // Chats und Teilnehmer kommen in der zweiten Ladewelle. Bis dahin soll die
  // Liste "wird geladen" sagen und nicht "Noch keine Chats vorhanden".
  const chatsGeladen = useCacheReady(["chat_gruppen", "chat_teilnehmer"]);

  const userRolesData = cacheGet("user_roles");
  const adminUserIdSet = new Set<string>(
    (userRolesData || [])
      .filter((r: any) => r.role === "admin" || r.role === "inhaber")
      .map((r: any) => r.user_id)
  );
  const isParticipantAdmin = (id: string) => adminUserIdSet.has(id);

  // Wen darf ich einladen? Die Regel steht einmal in `chatEinladung.ts` und
  // richtet sich nach der aktiven Rolle: admin und inhaber alle,
  // vertriebspartner nur die eigene Downline, alle anderen niemanden.
  const invitableForMe: ChatParticipant[] = einladbareTeilnehmer(myId, user.role);
  const canInvite = isAdmin || invitableForMe.length > 0;

  const pinnedCount = chats.filter(c => c.angepinnt).length;

  const refreshChats = useCallback(() => {
    const updated = getChats();
    setChats(updated);
  }, []);

  // Auto-refresh when realtime cache changes
  useEffect(() => {
    refreshChats();
  }, [liveVersion, refreshChats]);

  // Sync selected chat when URL param changes (e.g. from KundenDetail)
  useEffect(() => {
    if (paramChatId) {
      const latest = getChats();
      setChats(latest);
      if (latest.some(c => c.id === paramChatId)) {
        setSelectedChat(paramChatId);
      }
    }
  }, [paramChatId]);

  const archivedChats = chats.filter(c => c.archiviert);
  const archivedCount = archivedChats.length;

  /**
   * Ungelesene je Chat einmal für alle bestimmen.
   *
   * Vorher lief für jeden Chat einzeln die komplette Nachrichtenliste durch,
   * und zwar bei jedem Tastendruck in der Suche erneut. Bei fünfzig Chats und
   * einigen tausend Nachrichten wurde die Liste dadurch spürbar zäh.
   */
  const ungelesenJeChat = useMemo(() => {
    const map = new Map<string, number>();
    if (myId === "current") return map;
    for (const n of (cacheGet("chat_nachrichten") || []) as any[]) {
      if (n.absender_id === myId) continue;
      const gelesenVon: string[] = n.gelesen_von || [];
      if (gelesenVon.includes(myId)) continue;
      map.set(n.chat_id, (map.get(n.chat_id) || 0) + 1);
    }
    return map;
  }, [myId, liveVersion, leseStandVersion]);

  const suchtext = searchQuery.trim().toLowerCase();

  /**
   * Ein Chat erscheint erst in der Liste, wenn wirklich etwas geschrieben
   * wurde. Sonst sammeln sich angelegte, aber nie benutzte Chats an und die
   * Übersicht ist voller Einträge ohne Inhalt.
   *
   * Systemmeldungen zählen dabei nicht, sonst würde schon das Anlegen
   * genügen. Der gerade geöffnete Chat bleibt immer sichtbar, sonst könnte
   * man in einem frisch angelegten Chat die erste Nachricht nicht schreiben.
   */
  const hatInhalt = (c: ChatData) =>
    c.nachrichten.some(n => n.senderId !== "system" && n.senderName !== "System");

  const filteredChats = useMemo(() => chats
    .filter((c) => hatInhalt(c) || c.id === selectedChat)
    .filter((c) => {
      if (chatFilter === "archiviert") return c.archiviert;
      return !c.archiviert;
    })
    .filter((c) => {
      const chatUnread = ungelesenJeChat.get(c.id) || 0;
      if (chatFilter === "ungelesen") return chatUnread > 0;
      if (chatFilter === "gelesen") return chatUnread === 0;
      if (chatFilter === "angepinnt") return c.angepinnt;
      if (chatFilter === "kundenkommunikation") return c.typ === "kundenkommunikation";
      if (chatFilter === "intern") return c.typ === "intern";
      return true;
    })
    .filter((c) => {
      if (!suchtext) return true;
      // Gesucht wird im Namen, in allen Nachrichten und in den Teilnehmern.
      // Vorher nur im Namen und in der jeweils letzten Nachricht, dadurch
      // blieben Treffer in älteren Nachrichten unsichtbar.
      if (c.kundeName.toLowerCase().includes(suchtext)) return true;
      if (c.teilnehmer.some(t => t.name.toLowerCase().includes(suchtext))) return true;
      return c.nachrichten.some(n => n.text.toLowerCase().includes(suchtext));
    })
    .sort((a, b) => {
      if (a.angepinnt && !b.angepinnt) return -1;
      if (!a.angepinnt && b.angepinnt) return 1;
      // Chats ohne Nachricht wurden mit dem Zeitstempel null einsortiert und
      // landeten damit noch unter jahrealten Verläufen. Ein frisch angelegter
      // Chat war so praktisch unauffindbar. Jetzt zählt ersatzweise das
      // Erstelldatum.
      const zeit = (c: ChatData) =>
        c.nachrichten.length > 0
          ? new Date(c.nachrichten[c.nachrichten.length - 1].timestamp).getTime()
          : new Date(c.erstelltAm || 0).getTime();
      return zeit(b) - zeit(a);
    }), [chats, chatFilter, suchtext, ungelesenJeChat, selectedChat]);

  /** Wie viele Chats blendet der aktuelle Filter oder die Suche aus? */
  const ausgeblendet =
    chats.filter(c => !c.archiviert && hatInhalt(c)).length - filteredChats.filter(c => hatInhalt(c)).length;
  /** Angelegt, aber noch ohne Nachricht. Rein informativ. */
  const ohneNachricht = chats.filter(c => !c.archiviert && !hatInhalt(c)).length;

  const unreadTotal = chats.filter(c => !c.archiviert && (ungelesenJeChat.get(c.id) || 0) > 0).length;

  const togglePin = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    if (!chat.angepinnt && pinnedCount >= 3) {
      toast.error("Maximal 3 Chats können angepinnt werden", { style: { background: "hsl(0 84% 60%)", color: "white", border: "none" } });
      return;
    }
    chat.angepinnt = !chat.angepinnt;
    updateChat(chat);
    saveChats(chats);
    refreshChats();
    toast.success(chat.angepinnt ? "Chat angepinnt" : "Chat losgelöst");
  };

  const toggleUnread = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.ungelesen = !chat.ungelesen;
    updateChat(chat);
    saveChats(chats);
    refreshChats();
  };

  const toggleMute = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.stummgeschaltet = !chat.stummgeschaltet;
    updateChat(chat);
    saveChats(chats);
    refreshChats();
    toast.success(chat.stummgeschaltet ? "Chat stummgeschaltet" : "Stummschaltung aufgehoben");
  };

  const archiveChat = (chatId: string) => {
    if (!isAdmin) {
      toast.error("Nur Admins können Chats archivieren");
      return;
    }
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.archiviert = true;
    updateChat(chat);
    saveChats(chats);
    refreshChats();
    if (selectedChat === chatId) setSelectedChat(chats.find(c => c.id !== chatId && !c.archiviert)?.id || "");
    toast.success("Chat archiviert");
  };

  const unarchiveChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.archiviert = false;
    updateChat(chat);
    saveChats(chats);
    refreshChats();
    toast.success("Chat wiederhergestellt");
  };

  const handleDeleteChat = (chatId: string) => {
    if (!isAdmin) {
      toast.error("Nur Admins können Chats löschen");
      return;
    }
    setDeleteTargetId(chatId);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteChat = () => {
    if (!deleteTargetId) return;
    const updated = chats.filter(c => c.id !== deleteTargetId);
    saveChats(updated);
    setChats(updated);
    if (selectedChat === deleteTargetId) setSelectedChat(updated[0]?.id || "");
    toast.success("Chat gelöscht");
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
  };

  /**
   * Chat verlassen.
   *
   * Vorher hat diese Funktion den Teilnehmer nur im Arbeitsspeicher entfernt
   * und danach die Chats neu geladen. Der Teilnehmer war damit sofort wieder
   * da, sichtbar passierte nichts, und wer ein zweites Mal klickte, erzeugte
   * eine zweite Systemmeldung. Genau so entstanden die zwei Zeilen
   * "hat den Chat verlassen" untereinander.
   *
   * Jetzt wird die Teilnehmerzeile wirklich gelöscht, und die Systemmeldung
   * entsteht erst danach. Schlägt das Löschen fehl, etwa weil die Zugriffsregel
   * es verbietet, bleibt der Chat unverändert und es steht nichts Falsches im
   * Verlauf.
   */
  const handleLeaveChat = async () => {
    if (!activeChat || verlassenLaeuft) return;
    const isCreator = activeChat.erstelltVonId
      ? activeChat.erstelltVonId === myId
      : activeChat.erstelltVon === user.name;
    if (isCreator) {
      toast.error("Der Chat-Ersteller kann den Chat nicht verlassen");
      return;
    }
    if (!darfVerlassen(activeChat)) {
      toast.error(
        activeChat.kind === "tippgeber_vp"
          ? "Tippgeber-Chats folgen der Zuordnung und können nicht verlassen werden"
          : "Dieser Chat kann nicht verlassen werden",
      );
      return;
    }
    setVerlassenLaeuft(true);
    try {
      const weg = await verlasseChat(activeChat.id, myId);
      if (!weg) {
        toast.error("Chat konnte nicht verlassen werden");
        return;
      }
      await addMessage(activeChat.id, {
        senderId: "system",
        senderName: "System",
        senderInitials: "SY",
        text: `${user.name} hat den Chat verlassen`,
      }, myId);
      refreshChats();
      setSelectedChat("");
      toast.success("Chat verlassen");
    } finally {
      setVerlassenLaeuft(false);
    }
  };

  /*
   * Einladen aus der Chatliste links.
   *
   * Die eigentliche Regel steht seit dem 19.09.2026 in `lib/chatEinladung.ts`
   * und wird von der Teilnehmerleiste oben genauso benutzt. Wer darf wen
   * einladen, ist eine Berechtigungsfrage, und die darf es nicht zweimal
   * geben: Die eine Fassung wird angepasst, die andere nicht, und dann laedt
   * an einer Stelle jemand Leute ein, die er an der anderen nicht duerfte.
   */
  const handleInvite = async () => {
    if (!activeChat || selectedInvites.length === 0) return;
    try {
      const anzahl = await ladeTeilnehmerEin(activeChat, selectedInvites, myId, user.role);
      saveChats(chats);
      refreshChats();
      setSelectedInvites([]);
      setInviteDialog(false);
      toast.success(anzahl === 1 ? "Ein Teilnehmer hinzugefügt" : `${anzahl} Teilnehmer hinzugefügt`);
    } catch (fehler) {
      toast.error(fehler instanceof Error ? fehler.message : "Einladen fehlgeschlagen");
    }
  };

  /**
   * Teilnehmer entfernen. Litt an derselben Krankheit wie das Verlassen:
   * geändert wurde nur der Arbeitsspeicher, beim nächsten Laden war der
   * Teilnehmer wieder da.
   *
   * Der Vergleich mit `erstelltVon` verglich zudem eine Kennung mit einem
   * Namen und traf deshalb nie zu. Jetzt läuft er über `erstelltVonId`.
   */
  const handleRemoveParticipant = async (participantId: string) => {
    if (!activeChat || verlassenLaeuft) return;
    if (!isAdmin) {
      toast.error("Nur Admins können Teilnehmer entfernen");
      return;
    }
    if (participantId === activeChat.erstelltVonId || participantId === myId) {
      toast.error("Der Chat-Ersteller kann nicht entfernt werden");
      return;
    }
    if (isParticipantAdmin(participantId)) {
      toast.error("Admins können nur selbst aus dem Chat austreten");
      return;
    }
    const participant = activeChat.teilnehmer.find(t => t.id === participantId);
    if (!participant) return;
    setVerlassenLaeuft(true);
    try {
      const weg = await verlasseChat(activeChat.id, participantId);
      if (!weg) {
        toast.error(`${participant.name} konnte nicht entfernt werden`);
        return;
      }
      await addMessage(activeChat.id, {
        senderId: "system",
        senderName: "System",
        senderInitials: "SY",
        text: `${participant.name} wurde aus dem Chat entfernt`,
      }, myId);
      refreshChats();
      toast.success(`${participant.name} entfernt`);
    } finally {
      setVerlassenLaeuft(false);
    }
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
  };

  const getLastMessage = (chat: ChatData) => {
    if (chat.nachrichten.length === 0) return "Noch keine Nachrichten";
    const last = chat.nachrichten[chat.nachrichten.length - 1];
    return last.text.length > 40 ? last.text.slice(0, 40) + "..." : last.text;
  };

  const filterButtons: { key: ChatFilter; label: string }[] = [
    { key: "alle", label: "Alle" },
    { key: "kundenkommunikation", label: "Kunden" },
    { key: "intern", label: "Intern" },
    { key: "ungelesen", label: "Ungelesen" },
    { key: "angepinnt", label: "Angepinnt" },
    { key: "archiviert", label: "Archiv" },
  ];

  // Navigate to the customer profile linked to this chat

  const goToKundenprofil = () => {
    if (!activeChat?.kundeId) return;
    navigate(`/kunden/${activeChat.kundeId}`);
  };

  return (
    <DashboardLayout>
      {/* Die Hoehenklasse bleibt als Rueckfall, die gemessene Hoehe gewinnt. */}
      <div data-ui="card" ref={chatFlaecheRef} className="flex h-[calc(100vh-8rem)] md:h-[calc(100vh-8rem)] bg-card border rounded-lg overflow-hidden">
        {/* Sidebar – auf Mobile nur sichtbar, wenn kein Chat offen */}
        <div className={cn(
          "w-full md:w-[22rem] md:min-w-[308px] border-r md:flex flex-col overflow-hidden min-h-0",
          activeChat ? "hidden md:flex" : "flex"
        )}>
          <div className="p-3 border-b shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              {/* Verhindert das Heranzoomen auf dem iPhone, siehe index.css. */}
              <Input className="pl-9 h-8" placeholder="Chat suchen" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
          <div className="px-3 py-2 border-b shrink-0">
            <Select value={chatFilter} onValueChange={(v) => setChatFilter(v as ChatFilter)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filterButtons.map(fb => (
                  <SelectItem key={fb.key} value={fb.key}>
                    <span className="flex items-center gap-1.5">
                      {fb.label}
                      {fb.key === "ungelesen" && unreadTotal > 0 && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-primary/20 text-primary">{unreadTotal}</Badge>
                      )}
                      {fb.key === "archiviert" && archivedCount > 0 && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-muted-foreground/20 text-muted-foreground">{archivedCount}</Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="px-3 py-1.5 border-b shrink-0 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {filteredChats.length} {filteredChats.length === 1 ? "Chat" : "Chats"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {ausgeblendet > 0 && chatFilter !== "archiviert" && `${ausgeblendet} ausgeblendet`}
              {ausgeblendet > 0 && ohneNachricht > 0 && " · "}
              {ohneNachricht > 0 && chatFilter !== "archiviert" && (
                <span title="Chats erscheinen erst, wenn die erste Nachricht geschrieben wurde.">
                  {ohneNachricht} ohne Nachricht
                </span>
              )}
            </span>
          </div>
          {/*
            Kein waagerechtes Scrollen: Sonst schiebt eine zu breite Zeile den
            gesamten Inhalt zur Seite, und links fehlen die Badges, rechts die
            drei Punkte. Zu lange Namen werden gekürzt, nicht die Spalte.
          */}
          <ScrollArea className="flex-1 [&>[data-radix-scroll-area-viewport]>div]:!w-full [&>[data-radix-scroll-area-viewport]]:overflow-x-hidden">
            {filteredChats.length === 0 && (
              <div className="text-center py-8 px-4">
                <p className="text-xs text-muted-foreground">
                  {chatFilter === "archiviert"
                    ? "Keine archivierten Chats"
                    : suchtext
                    ? `Kein Chat passt zu „${searchQuery}"`
                    : chatFilter !== "alle"
                    ? "Kein Chat in diesem Filter"
                    : chatsGeladen
                    ? "Noch keine Chats vorhanden"
                    : "Chats werden geladen …"}
                </p>
                {(suchtext || chatFilter !== "alle") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => { setSearchQuery(""); setChatFilter("alle"); }}
                  >
                    Filter und Suche zurücksetzen
                  </Button>
                )}
              </div>
            )}
            {filteredChats.map((chat, index) => {
              // Trenner, sobald der erste nicht angepinnte Chat kommt.
              const trennerDavor =
                index > 0 && filteredChats[index - 1].angepinnt && !chat.angepinnt;
              const chatUnreadCount = ungelesenJeChat.get(chat.id) || 0;
              const hasUnread = chatUnreadCount > 0;
              return (
                <div key={chat.id}>
                {trennerDavor && (
                  <div className="px-3 py-1 border-t border-b bg-muted/30">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Weitere Chats</span>
                  </div>
                )}
                {/*
                  Bewusst ein div mit role="button" und kein button-Element.
                  In der Zeile stecken weitere Knöpfe: Teilnehmer, Einladen und
                  das Dreipunktmenü. Ein button darf keinen button enthalten,
                  der Browser bricht die Verschachtelung auf, wodurch die
                  inneren Knöpfe verschwinden oder nicht mehr reagieren.
                */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedChat(chat.id);
                    if (hasUnread && myId !== "current") {
                      markChatAsRead(chat.id, myId, user.name);
                      setLeseStandVersion(v => v + 1);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    setSelectedChat(chat.id);
                    if (hasUnread && myId !== "current") {
                      markChatAsRead(chat.id, myId, user.name);
                      setLeseStandVersion(v => v + 1);
                    }
                  }}
                  className={`w-full max-w-full flex items-center gap-3 p-3 text-left hover:bg-accent transition-colors overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedChat === chat.id ? "bg-accent" : ""}`}
                >
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {chat.angepinnt && <Pin className="h-3.5 w-3.5 text-red-500 shrink-0 fill-red-500" />}
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${chat.typ === "kundenkommunikation" ? "border-green-300 text-green-700 bg-green-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}>
                          {chat.typ === "kundenkommunikation" ? "Kunde" : "Intern"}
                        </Badge>
                        <span className={`font-semibold text-sm truncate ${hasUnread ? "text-foreground" : ""} ${chat.archiviert ? "text-muted-foreground" : ""}`}>{chat.kundeName.replace(/\s*\(Intern\)\s*$/i, "")}</span>
                      </div>
                      {/* shrink-0 auf der ganzen Leiste: Die drei Punkte müssen
                          immer sichtbar bleiben, auch bei langen Namen. Gekürzt
                          wird stattdessen der Name. */}
                      <div className="flex items-center gap-1 shrink-0">
                        {chat.stummgeschaltet && <VolumeX className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                        {(hasUnread || chat.ungelesen) && (
                          <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0 inline-block" />
                        )}
                        {hasUnread && (
                          <Badge className="text-[9px] px-1.5 py-0 shrink-0 bg-primary text-primary-foreground">{chatUnreadCount}</Badge>
                        )}
                        {chat.archiviert && <Archive className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <Popover>
                          <PopoverTrigger asChild>
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 cursor-pointer hover:bg-accent shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Users className="h-3 w-3" />
                              {chat.teilnehmer.length}
                            </span>
                          </PopoverTrigger>
                          <PopoverContent side="right" align="start" className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
                            <p className="text-xs font-semibold text-foreground mb-2">Teilnehmer ({chat.teilnehmer.length})</p>
                            <div className="space-y-1.5">
                              {chat.teilnehmer.map((t, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    {t.avatar ? <AvatarImage src={t.avatar} /> : null}
                                    <AvatarFallback className={`${colorForName(t.name)} text-white text-[8px]`}>{t.initials}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium truncate">{t.name}</p>
                                    <p className="text-[10px] text-muted-foreground">{t.role}</p>
                                  </div>
                                  {isAdmin && t.id !== chat.erstelltVon && t.id !== myId && !isKundenChat(chat) && !isParticipantAdmin(t.id) && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleRemoveParticipant(t.id); }}
                                      className="text-muted-foreground hover:text-destructive ml-auto"
                                      title="Entfernen"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        {!isBewerber && !isKundenChat(chat) && canInvite && (
                          <button
                            className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                            onClick={(e) => { e.stopPropagation(); setSelectedChat(chat.id); setInviteDialog(true); }}
                            title="Teilnehmer hinzufügen"
                          >
                            <UserPlus className="h-3 w-3" />
                          </button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
                            {chat.kundeId && (
                              <DropdownMenuItem onClick={() => navigate(`/kunden/${chat.kundeId}`)}>
                                <ExternalLink className="h-4 w-4 mr-2" /> Zum Kundenprofil
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => togglePin(chat.id)}>
                              {chat.angepinnt ? <PinOff className="h-4 w-4 mr-2" /> : <Pin className="h-4 w-4 mr-2" />}
                              {chat.angepinnt ? "Chat lösen" : "Chat anpinnen"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={async () => {
                              if (myId === "current") return;
                              // Beschriftung folgt dem Zustand: Was gelesen ist,
                              // lässt sich auf ungelesen setzen und umgekehrt.
                              if (chatUnreadCount > 0) markChatAsRead(chat.id, myId, user.name);
                              else await markChatAsUnread(chat.id, myId);
                              setLeseStandVersion(v => v + 1);
                              refreshChats();
                            }}>
                              {chatUnreadCount > 0 ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                              {chatUnreadCount > 0 ? "Als gelesen markieren" : "Als ungelesen markieren"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleMute(chat.id)}>
                              {chat.stummgeschaltet ? <Volume2 className="h-4 w-4 mr-2" /> : <VolumeX className="h-4 w-4 mr-2" />}
                              {chat.stummgeschaltet ? "Stummschaltung aufheben" : "Stummschalten"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {darfVerlassen(chat) && (
                              <DropdownMenuItem onClick={() => {
                                setSelectedChat(chat.id);
                                setTimeout(() => handleLeaveChat(), 0);
                              }}>
                                <LogOut className="h-4 w-4 mr-2" /> Chat verlassen
                              </DropdownMenuItem>
                            )}
                            {isAdmin && (
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteChat(chat.id)}>
                                <Trash2 className="h-4 w-4 mr-2" /> Chat löschen
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${hasUnread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {getLastMessage(chat)}
                    </p>
                  </div>
                </div>
                </div>
              );
            })}
          </ScrollArea>
        </div>

        {/* Main Chat Area – auf Mobile Vollbild, wenn Chat ausgewählt */}
        <div className={cn(
          "flex-1 md:flex flex-col min-w-0 min-h-0 overflow-hidden",
          activeChat ? "flex" : "hidden md:flex"
        )}>
          {activeChat ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b shrink-0 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Mobile-Back zur Chat-Liste */}
                  <button
                    onClick={() => setSelectedChat(null)}
                    className="md:hidden inline-flex items-center justify-center h-8 w-8 -ml-1 rounded hover:bg-accent shrink-0"
                    aria-label="Zurück zur Chat-Liste"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className={`${colorForName(activeChat.kundeName)} text-white text-xs`}>
                      {getInitials(activeChat.kundeName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm truncate">{activeChat.kundeName.replace(/\s*\(Intern\)\s*$/i, "")}</h3>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${activeChat.typ === "kundenkommunikation" ? "border-green-300 text-green-700 bg-green-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}>
                        {activeChat.typ === "kundenkommunikation" ? "Kundenkommunikation" : "Interne Kommunikation"}
                      </Badge>
                      {activeChat.kundeId && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button onClick={goToKundenprofil} className="text-primary hover:text-primary/80 transition-colors">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Zum Kundenprofil</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {activeChat.teilnehmer.length} Teilnehmer · {formatDate(activeChat.erstelltAm)}
                    </p>
                  </div>
                </div>
                {/*
                  Teilnehmer, Einladen und die beiden Uebersichten stehen in
                  `components/chat/ChatTeilnehmerLeiste.tsx`, weil der Reiter
                  "Kommunikation" im Kundenprofil dieselbe Leiste zeigt. An ihr
                  haengt, wer eingeladen werden darf; zwei Fassungen davon
                  laufen auseinander, und dann laedt an einer Stelle jemand
                  Leute ein, die er an der anderen nicht einladen duerfte.

                  Was unten folgt, bleibt der Chatseite vorbehalten: Aktionen
                  auf dem Chat als Ganzem.
                */}
                <ChatTeilnehmerLeiste
                  chat={activeChat}
                  kennzahlen={verlaufKennzahlen}
                  myId={myId}
                  rolle={user.role}
                  einladenErlaubt={!isBewerber && !isKundenChat(activeChat) && canInvite}
                  onDateien={() => verlaufRef.current?.oeffneDateien()}
                  onMarkierte={() => verlaufRef.current?.oeffneMarkierte()}
                  onGeaendert={refreshChats}
                  zusatzMenue={<>
                      {activeChat.kundeId && (
                        <DropdownMenuItem onClick={goToKundenprofil}>
                          <ExternalLink className="h-4 w-4 mr-2" /> Zum Kundenprofil
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => togglePin(activeChat.id)}>
                        {activeChat.angepinnt ? <PinOff className="h-4 w-4 mr-2" /> : <Pin className="h-4 w-4 mr-2" />}
                        {activeChat.angepinnt ? "Chat lösen" : "Chat anpinnen"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        if (myId === "current") return;
                        // Im offenen Chat ist ohnehin alles gelesen. Hier ist
                        // deshalb der übliche Fall: als ungelesen zurücklegen,
                        // um später darauf zurückzukommen.
                        const offen = ungelesenJeChat.get(activeChat.id) || 0;
                        if (offen > 0) markChatAsRead(activeChat.id, myId, user.name);
                        else {
                          await markChatAsUnread(activeChat.id, myId);
                          setSelectedChat("");
                        }
                        setLeseStandVersion(v => v + 1);
                        refreshChats();
                      }}>
                        {(ungelesenJeChat.get(activeChat.id) || 0) > 0 ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                        {(ungelesenJeChat.get(activeChat.id) || 0) > 0 ? "Als gelesen markieren" : "Als ungelesen markieren"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleMute(activeChat.id)}>
                        {activeChat.stummgeschaltet ? <Volume2 className="h-4 w-4 mr-2" /> : <VolumeX className="h-4 w-4 mr-2" />}
                        {activeChat.stummgeschaltet ? "Stummschaltung aufheben" : "Stummschalten"}
                      </DropdownMenuItem>
                      {isAdmin && !activeChat.archiviert && (
                        <DropdownMenuItem onClick={() => archiveChat(activeChat.id)}>
                          <Archive className="h-4 w-4 mr-2" /> Archivieren
                        </DropdownMenuItem>
                      )}
                      {isAdmin && activeChat.archiviert && (
                        <DropdownMenuItem onClick={() => unarchiveChat(activeChat.id)}>
                          <ArchiveRestore className="h-4 w-4 mr-2" /> Wiederherstellen
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {darfVerlassen(activeChat) && (
                        <DropdownMenuItem onClick={handleLeaveChat}>
                          <LogOut className="h-4 w-4 mr-2" /> Chat verlassen
                        </DropdownMenuItem>
                      )}
                      {isAdmin && (
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteChat(activeChat.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Chat löschen
                        </DropdownMenuItem>
                      )}
                  </>}
                />
              </div>

              {/*
                Verlauf, Anhaenge und Eingabezeile stehen seit der Herausloesung
                in `components/chat/ChatVerlauf.tsx`. Der Reiter "Kommunikation"
                im Kundenprofil zeigt denselben Baustein. Eine zweite Fassung
                daneben waere mit der Zeit auseinandergelaufen.
              */}
              <ChatVerlauf
                ref={verlaufRef}
                chatId={activeChat.id}
                onAenderung={refreshChats}
                onKennzahlen={setVerlaufKennzahlen}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">Wähle einen Chat aus</div>
          )}
        </div>
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteDialog} onOpenChange={setInviteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Teilnehmer einladen</DialogTitle>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground pt-1">
                Als Vertriebspartner kannst du nur Teampartner aus deiner eigenen Downline einladen. Weitere Rollen (Admin, FP, OP) fügt der Admin hinzu.
              </p>
            )}
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {invitableForMe
              .filter(m => !activeChat?.teilnehmer.some(t => t.id === m.id))
              .map((member) => (
                <label key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent cursor-pointer">
                  <Checkbox
                    checked={selectedInvites.includes(member.id)}
                    onCheckedChange={(checked) => {
                      setSelectedInvites(prev => checked ? [...prev, member.id] : prev.filter(id => id !== member.id));
                    }}
                  />
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className={`${colorForName(member.name)} text-white text-[10px]`}>{member.initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                  </div>
                </label>
              ))}
            {invitableForMe.filter(m => !activeChat?.teilnehmer.some(t => t.id === m.id)).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {isAdmin ? "Alle Nutzer sind bereits im Chat" : "Keine Teampartner aus deiner Downline verfügbar"}
              </p>
            )}
          </div>
          <Button onClick={handleInvite} disabled={selectedInvites.length === 0} className="w-full mt-2">
            {selectedInvites.length > 0 ? `${selectedInvites.length} Teilnehmer einladen` : "Teilnehmer auswählen"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Chat endgültig löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Dieser Chat und alle Nachrichten werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Abbrechen</Button>
            <Button variant="destructive" onClick={confirmDeleteChat}>Endgültig löschen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
