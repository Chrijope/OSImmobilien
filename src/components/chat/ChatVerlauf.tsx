import { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Send, Trash2, Star, Paperclip, FileText, AtSign, Flag, CheckCheck } from "lucide-react";
import { addMessage, chatTeilnehmerEintragen, getChatById, getChats, getInitials, markChatAsRead, loeseAbsenderAuf, type ChatData, type ChatParticipant, type ChatMessage } from "@/lib/chatStore";
import { cacheGet, cacheSet } from "@/lib/dataCache";
import { spracheAusMeta } from "../../../supabase/functions/_shared/kunden-sprache.ts";
import { KUNDEN_GLOCKE } from "@/lib/kundenGlocke";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { useLiveVersion } from "@/hooks/useLiveData";
import { showPushNotification } from "@/lib/pushNotifications";
import { addMentionNotification, extractMentions } from "@/lib/notificationStore";
import { supabase } from "@/integrations/supabase/client";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { openUnterlage } from "@/lib/storage";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import MeldenDialog from "@/components/moderation/MeldenDialog";
import { colorForName } from "./chatFarbe";
import { chatBenachrichtigungDaten } from "@/lib/chatBenachrichtigung";
import { chatBenachrichtigungAnstossen } from "@/lib/chatBenachrichtigungAnstossen";
import { aussenKennungen, stehtRechts } from "@/lib/chatSeite";
import { oeffentlicheAdresse } from "@/lib/oeffentlicheBasis";

/**
 * Ein einzelner Chatverlauf: Nachrichten, Anhaenge und Eingabezeile.
 *
 * Bis zu dieser Aenderung steckte all das unteilbar in `src/pages/Chat.tsx`.
 * Der Reiter "Kommunikation" im Kundenprofil braucht denselben Verlauf, und
 * eine zweite Fassung daneben waere mit der Zeit auseinandergelaufen: Ein
 * Nutzer haette im Profil etwas anderes gesehen als auf der Chatseite. Deshalb
 * benutzt die Chatseite jetzt genau diesen Baustein.
 *
 * Bewusst nicht hier drin: die Liste aller Chats, die Kopfzeile mit
 * Anpinnen, Stummschalten, Archivieren, Loeschen, Einladen und Verlassen. Das
 * sind Aktionen auf dem Chat als Ganzem, nicht auf seinem Verlauf. Die
 * Chatseite behaelt sie, das Kundenprofil braucht sie nicht.
 *
 * Der Baustein erwartet einen Elternteil, der eine senkrechte Flexspalte mit
 * `min-h-0` ist, denn er gibt ein Fragment mit zwei Kindern zurueck: den
 * mitwachsenden Verlauf und die Eingabezeile darunter.
 */
export interface ChatVerlaufHandle {
  /** Oeffnet die Liste aller Anhaenge dieses Verlaufs. */
  oeffneDateien(): void;
  /** Oeffnet die Liste der mit einem Stern markierten Nachrichten. */
  oeffneMarkierte(): void;
}

export interface ChatVerlaufKennzahlen {
  dateien: number;
  markierte: number;
}

export interface ChatVerlaufProps {
  /** Die Kennung der Chatgruppe, deren Verlauf gezeigt wird. */
  chatId: string;
  /**
   * Beschriftung des Sendeknopfs. Ohne Angabe bleibt es beim reinen
   * Papierflieger, so wie auf der Chatseite.
   */
  sendeKnopfText?: string;
  /** Laeuft nach Senden und Hochladen, damit die Seite ihre Listen auffrischt. */
  onAenderung?: () => void;
  /** Meldet Anzahl der Anhaenge und Markierungen an die Kopfzeile der Seite. */
  onKennzahlen?: (kennzahlen: ChatVerlaufKennzahlen) => void;
}


/** Render message text with @mentions highlighted */
function renderMessageText(text: string) {
  const mentionRegex = /@([A-Za-zÀ-ÿ]+\s[A-Za-zÀ-ÿ]+)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="bg-primary/15 text-primary font-semibold rounded px-0.5">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

export const ChatVerlauf = forwardRef<ChatVerlaufHandle, ChatVerlaufProps>(function ChatVerlauf(
  { chatId, sendeKnopfText, onAenderung, onKennzahlen },
  ref,
) {
  const { user, authUser } = useUser();
  const myId = authUser?.id || "current";

  const [message, setMessage] = useState("");
  /**
   * Angefangene Nachrichten je Chat behalten.
   *
   * Wer zwischen Kunden hin und her springt, hat bisher jeden angefangenen
   * Satz verloren, sobald er den Chat gewechselt hat.
   */
  const entwuerfeRef = useRef<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // @-mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);

  const [dateienOffen, setDateienOffen] = useState(false);
  const [markierteOffen, setMarkierteOffen] = useState(false);
  const [meldenOpen, setMeldenOpen] = useState(false);
  const [meldenMsg, setMeldenMsg] = useState<{ id: string; senderName: string } | null>(null);

  // Read receipts state
  const [readReceipts, setReadReceipts] = useState<Record<string, string[]>>({});

  /**
   * Mit einem Stern markierte Nachrichten.
   *
   * Bewusst je Nutzer gespeichert und nicht am Chat: Was für den einen
   * wichtig ist, muss es für den anderen nicht sein.
   */
  const [markierteIds, setMarkierteIds] = useState<string[]>(
    () => getUserSetting<string[]>("chat_markierte_nachrichten", []) || [],
  );

  const toggleMarkierung = (msgId: string) => {
    setMarkierteIds((prev) => {
      const neu = prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId];
      setUserSetting("chat_markierte_nachrichten", neu);
      return neu;
    });
  };

  /**
   * Ältere Nachrichten, die auf Anforderung direkt aus der Datenbank
   * nachgeladen werden.
   *
   * Der Zwischenspeicher holt höchstens 5.000 Nachrichten. In einem
   * gewachsenen System fehlt damit der Anfang langer Verläufe, ohne dass es
   * jemand merkt. Hier lässt er sich holen.
   */
  const [aeltereNachrichten, setAeltereNachrichten] = useState<ChatMessage[]>([]);
  const [aeltereLaufen, setAeltereLaufen] = useState(false);
  const [aeltereErschoepft, setAeltereErschoepft] = useState(false);

  // Realtime: refresh chats whenever cache updates for chat tables
  const liveVersion = useLiveVersion(["chat_nachrichten", "chat_gruppen", "chat_teilnehmer", "profiles"]);
  /**
   * Zähler für die eigenen Schreibvorgänge.
   *
   * Senden und Hochladen landen über den Zwischenspeicher auch in
   * `liveVersion`. Der Zähler ist die Sicherheitsleine für den Fall, dass das
   * Ereignis ausbleibt, damit die eigene Nachricht auf jeden Fall sofort im
   * Verlauf steht.
   */
  const [eigeneVersion, setEigeneVersion] = useState(0);

  const activeChat: ChatData | undefined = useMemo(
    () => (chatId ? getChatById(chatId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId, liveVersion, eigeneVersion],
  );

  /** Nach dem eigenen Schreiben: Verlauf neu lesen und die Seite benachrichtigen. */
  const aktualisieren = () => {
    setEigeneVersion((v) => v + 1);
    onAenderung?.();
  };

  const isKundenChat = activeChat?.typ === "kundenkommunikation";

  // Map user IDs to display names for read receipts
  const profileMap = useMemo(() => {
    const profiles = cacheGet("profiles");
    const map: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { map[p.id] = p.name; });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVersion]);


  // Beim Wechsel des Chats die nachgeladenen Nachrichten verwerfen.
  useEffect(() => {
    setAeltereNachrichten([]);
    setAeltereErschoepft(false);
  }, [chatId]);

  const ladeAeltere = async () => {
    if (!activeChat || aeltereLaufen) return;
    setAeltereLaufen(true);
    const bekannte = [...aeltereNachrichten, ...activeChat.nachrichten];
    const aeltesteZeit = bekannte.length > 0 ? bekannte[0].timestamp : new Date().toISOString();
    const { data } = await supabase
      .from("chat_nachrichten")
      .select("*")
      .eq("chat_id", activeChat.id)
      .lt("gesendet_am", aeltesteZeit)
      .order("gesendet_am", { ascending: false })
      .limit(50);
    const rows = (data || []) as any[];
    if (rows.length < 50) setAeltereErschoepft(true);
    const bekannteIds = new Set(bekannte.map(m => m.id));
    const neue: ChatMessage[] = rows
      .filter(r => !bekannteIds.has(r.id))
      .map(r => ({
        id: r.id,
        chatId: r.chat_id,
        senderId: r.meta?.isSystem ? "system" : r.absender_id,
        // Dieselbe Rückfallebene wie beim Erstladen in chatStore.chatFromDb.
        // Ohne sie stünden nachgeladene ältere Nachrichten wieder namenlos da.
        ...loeseAbsenderAuf(r.meta, r.absender_id, activeChat.teilnehmer),
        text: r.inhalt,
        timestamp: r.gesendet_am,
        fileUrl: r.meta?.fileUrl,
        fileName: r.meta?.fileName,
        vorschauUrl: r.meta?.vorschauUrl,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    setAeltereNachrichten(prev => [...neue, ...prev]);
    setAeltereLaufen(false);
  };

  /** Nachgeladene und zwischengespeicherte Nachrichten in einer Liste. */
  const sichtbareNachrichten = useMemo(
    () => (activeChat ? [...aeltereNachrichten, ...activeChat.nachrichten] : []),
    [activeChat, aeltereNachrichten],
  );

  /**
   * Kennungen von Kunde bzw. Tippgeber in diesem Chat, `null` bei internen
   * Chats. Daraus folgt, wer links und wer rechts steht, siehe chatSeite.ts.
   */
  const aussen = useMemo(
    () => (activeChat
      ? aussenKennungen(
          { ...activeChat, nachrichten: sichtbareNachrichten },
          { kontakte: cacheGet("kontakte") || [], userRoles: cacheGet("user_roles") || [] },
        )
      : null),
    [activeChat, sichtbareNachrichten],
  );

  // Entwurf des zuletzt offenen Chats sichern und den des neuen laden.
  const vorherigerChatRef = useRef<string>(chatId);
  useEffect(() => {
    const vorher = vorherigerChatRef.current;
    if (vorher && vorher !== chatId) {
      entwuerfeRef.current[vorher] = message;
    }
    if (vorher !== chatId) {
      setMessage(entwuerfeRef.current[chatId] || "");
      vorherigerChatRef.current = chatId;
    }
    // message bewusst nicht in den Abhängigkeiten: Der Entwurf wird nur beim
    // Wechsel gesichert, nicht bei jedem Tastendruck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Load read receipts from DB for active chat
  useEffect(() => {
    if (!activeChat) return;
    const msgIds = activeChat.nachrichten.map(m => m.id);
    if (msgIds.length === 0) return;

    supabase
      .from("chat_nachrichten")
      .select("id, gelesen_von")
      .in("id", msgIds)
      .then(({ data }) => {
        if (data) {
          const receipts: Record<string, string[]> = {};
          data.forEach((row: any) => {
            receipts[row.id] = row.gelesen_von || [];
          });
          setReadReceipts(prev => ({ ...prev, ...receipts }));
        }
      });
  }, [activeChat?.id, activeChat?.nachrichten.length]);

  // Realtime updates for read receipts
  useEffect(() => {
    const channel = supabase
      .channel("chat-read-receipts")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_nachrichten" },
        (payload) => {
          const updated = payload.new as any;
          if (updated?.id && updated?.gelesen_von) {
            setReadReceipts(prev => ({ ...prev, [updated.id]: updated.gelesen_von || [] }));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Auto-mark messages as read when viewing a chat + update local readReceipts state
  useEffect(() => {
    if (!activeChat || !myId || myId === "current") return;
    markChatAsRead(activeChat.id, myId, user.name);
    // Also update local readReceipts state so the UI shows immediately
    setReadReceipts(prev => {
      const updated = { ...prev };
      activeChat.nachrichten.forEach(msg => {
        if (msg.senderId !== myId && msg.senderId !== "current" && msg.senderId !== "system") {
          const current = updated[msg.id] || [];
          if (!current.includes(myId)) {
            updated[msg.id] = [...current, myId];
          }
        }
      });
      return updated;
    });
  }, [activeChat?.id, activeChat?.nachrichten.length, myId, user.name]);

  /*
   * Netz unter der Echtzeit: alle acht Sekunden nachfragen.
   *
   * Die Chattabellen sind fuer Realtime freigegeben und werden abonniert, und
   * im Normalfall kommt eine neue Nachricht damit von allein herein. Verlassen
   * kann man sich darauf aber nicht: Die Verbindung bricht bei
   * Netzwechsel oder nach dem Aufwachen aus dem Ruhezustand still ab, und ein
   * Ereignis erreicht nur, wer die Zeile nach den Zugriffsregeln auch lesen
   * darf. Wer neu zu einem Chat dazukommt, bekommt also gerade die
   * Nachrichten nicht, die ihn interessieren.
   *
   * Christians Anforderung ist einfach: Nachrichten sollen ohne Neuladen
   * erscheinen. Diese Schleife macht das unabhaengig davon, ob die Echtzeit
   * gerade traegt.
   *
   * Sie laeuft nur, solange der Chat offen und das Fenster sichtbar ist, und
   * sie schreibt nur dann in den Zwischenspeicher, wenn wirklich etwas
   * Unbekanntes dabei ist. Ein unveraendertes Ergebnis kostet eine Abfrage und
   * loest kein einziges Neuzeichnen aus.
   */
  useEffect(() => {
    if (!chatId || isTestAccount()) return;
    let abgebrochen = false;

    const nachfassen = async () => {
      if (document.hidden) return;
      try {
        const { data } = await supabase
          .from("chat_nachrichten")
          .select("*")
          .eq("chat_id", chatId)
          .order("gesendet_am", { ascending: true });
        if (abgebrochen || !data) return;

        const bekannt = cacheGet("chat_nachrichten") as any[];
        const bekannteIds = new Set(bekannt.filter((m) => m.chat_id === chatId).map((m) => m.id));
        const neueGibtEs = data.some((m: any) => !bekannteIds.has(m.id));
        // Auch ein geaenderter Lesestand zaehlt, sonst bliebe "gelesen" stehen.
        const standGeaendert = data.some((m: any) => {
          const alt = bekannt.find((b) => b.id === m.id);
          return alt && JSON.stringify(alt.gelesen_von ?? []) !== JSON.stringify(m.gelesen_von ?? []);
        });
        if (!neueGibtEs && !standGeaendert) return;

        const ohneDiesen = bekannt.filter((m) => m.chat_id !== chatId);
        cacheSet("chat_nachrichten", [...ohneDiesen, ...data]);
      } catch {
        // Ein Aussetzer ist kein Grund fuer eine Meldung. Beim naechsten Lauf
        // in acht Sekunden wird es erneut versucht.
      }
    };

    const takt = window.setInterval(nachfassen, 8000);
    // Beim Zurueckkommen auf den Reiter sofort, nicht erst nach acht Sekunden.
    const beiSichtbar = () => { if (!document.hidden) void nachfassen(); };
    document.addEventListener("visibilitychange", beiSichtbar);

    return () => {
      abgebrochen = true;
      window.clearInterval(takt);
      document.removeEventListener("visibilitychange", beiSichtbar);
    };
  }, [chatId]);

  const mentionParticipants = activeChat?.teilnehmer ?? [];
  const filteredMentions = mentionParticipants.filter(p =>
    p.name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  /*
   * Die letzte Nachricht steht immer im Blickfeld.
   *
   * Zwei Dinge fehlten bisher:
   *
   * Der Effekt hing allein an der ANZAHL der Nachrichten. Wer im Kundenprofil
   * zwischen internem Chat und Kundenchat wechselte, sah deshalb den oberen
   * Rand des neuen Verlaufs, und bei zufaellig gleicher Anzahl lief er gar
   * nicht. Jetzt haengt er auch an der Kennung des Chats.
   *
   * Und beim ersten Anzeigen wurde sichtbar nach unten gescrollt. Bei einem
   * langen Verlauf sieht man dabei minutenlang fremde Nachrichten
   * vorbeiziehen. Ein Wechsel springt deshalb ohne Animation; nur eine NEUE
   * Nachricht im offenen Chat gleitet weich herein, denn dort ist die
   * Bewegung die Information.
   *
   * Der Sprung wartet einen Frame ab. Direkt nach dem Rendern steht die
   * endgueltige Hoehe noch nicht fest, und ein Scrollen ins Leere sieht aus
   * wie gar keines.
   */
  const zuletztGescrollt = useRef<string | null>(null);
  useEffect(() => {
    const chatGewechselt = zuletztGescrollt.current !== (activeChat?.id ?? null);
    zuletztGescrollt.current = activeChat?.id ?? null;
    const verhalten: ScrollBehavior = chatGewechselt ? "instant" : "smooth";

    const springen = () => {
      const ende = messagesEndRef.current;
      if (!ende) return;
      const viewport = ende.closest<HTMLElement>("[data-radix-scroll-area-viewport]")
        ?? ende.closest<HTMLElement>(".overflow-y-auto");
      if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: verhalten });
      else ende.scrollIntoView({ behavior: verhalten, block: "end" });
    };

    const frame = requestAnimationFrame(springen);
    return () => cancelAnimationFrame(frame);
  }, [activeChat?.id, activeChat?.nachrichten.length]);

  const ensureParticipant = async () => {
    if (!activeChat || !myId || myId === "current") return;
    const isParticipant = activeChat.teilnehmer.some(t => t.id === myId);
    if (isParticipant) return;
    // 1-zu-1 Kundenchat: niemand außer Kunde + zugewiesener Vertriebspartner darf beitreten
    if (isKundenChat) return;
    // Auto-join über `chat_teilnehmer_eintragen`: Seit dem 30.09.2026 nur in
    // den eigenen Chat, Admin und Inhaber in jeden.
    try {
      await chatTeilnehmerEintragen(activeChat.id, [
        { id: myId, name: user.name, initials: getInitials(user.name), role: user.role || "Nutzer" },
      ]);
      // Update local activeChat state so subsequent logic sees the participant
      activeChat.teilnehmer.push({
        id: myId,
        name: user.name,
        initials: getInitials(user.name),
        role: user.role || "Nutzer",
      });
    } catch (err) {
      console.error("Konnte nicht beitreten:", err);
    }
  };
  const handleSend = async () => {
    if (!message.trim() || !activeChat) return;
    const text = message.trim();

    // Ensure sender is participant (RLS requirement)
    await ensureParticipant();

    let gesendet: ChatMessage;
    try {
      gesendet = await addMessage(activeChat.id, {
        senderId: myId,
        senderName: user.name,
        senderInitials: getInitials(user.name),
        text,
      });
    } catch (err) {
      /*
       * Bis zum 19.09.2026 stand hier nur die Konsolenausgabe.
       *
       * Die Folge war die schlechteste denkbare: Der Text blieb im Feld
       * stehen, es erschien kein Hinweis, und der Absender hielt seine
       * Nachricht fuer verschickt. Genau so sind sechs Kundenchats monatelang
       * unbemerkt tot gewesen, denn eine Gruppe ohne Teilnehmer lehnt jede
       * Nachricht ab, und niemand bekam das je zu sehen.
       */
      console.error("Senden fehlgeschlagen:", err);
      toast.error("Die Nachricht wurde nicht gesendet", {
        description:
          "Bitte versuche es noch einmal. Bleibt es dabei, melde dich, dann sehen wir uns den Chat an.",
      });
      return;
    }

    // Notify all other participants via benachrichtigungen (bell icon) — skip muted chats
    const otherParticipants = activeChat.teilnehmer.filter(t => t.id !== myId);
    for (const p of otherParticipants) {
      // Check if this participant has muted this chat
      const allChatsForParticipant = getChats();
      const participantChat = allChatsForParticipant.find(c => c.id === activeChat.id);
      if (participantChat?.stummgeschaltet) continue;

      // Check if participant is a Kunde (has only 'kunde' role)
      const participantRoles = cacheGet("user_roles").filter((r: any) => r.user_id === p.id);
      const isKunde = participantRoles.length > 0 && participantRoles.every((r: any) => r.role === "kunde");
      const notifLink = isKunde ? "/kunde/chat" : `/chat?id=${activeChat.id}`;

      /*
       * Hier schreibt der Browser nur noch Glocke und Mail an den KUNDEN.
       *
       * Alle anderen Empfaenger, also jeder im CRM, bekommen Glocke und Mail
       * seit dem 25.09.2026 von der Edge Function `chat-benachrichtigung`,
       * angestossen weiter unten. Christian hat damit seine Vorgabe vom
       * 19.09.2026 aufgehoben, nach der das eigene Team keine Glocke mehr
       * bekam: Der Chat stand fuer Vertriebspartner gar nicht in der
       * Seitenleiste, und die Mail an sie kam nie an.
       *
       * Der Kunde bleibt hier, weil seine Glocke und Mail in seiner Sprache und
       * mit dem Link ins Kundenportal hinausgehen. Die Function laesst Kunden
       * deshalb aus, doppelt wird niemand benachrichtigt.
       */
      if (isKunde) {
        // Glocke und Push in der Sprache aus dem Kundenprofil. Die Nachricht
        // selbst bleibt, wie der Berater sie geschrieben hat.
        const empfaengerKontakt = cacheGet("kontakte").find(
          (k: any) => (k.meta as any)?.authUserId === p.id || (k.meta as any)?.person2?.authUserId === p.id,
        );
        const glocke = KUNDEN_GLOCKE.chatNachricht[spracheAusMeta(empfaengerKontakt?.meta)](
          user.name,
          `${activeChat.kundeName}: ${text.length > 60 ? text.slice(0, 60) + "…" : text}`,
        );
        supabase.from("benachrichtigungen").insert({
          benutzer_id: p.id,
          titel: glocke.titel,
          nachricht: glocke.nachricht,
          link: notifLink,
        }).then(() => {});
      }

      // Push-Benachrichtigung (Browser) für den Empfänger
      showPushNotification(`Neue Nachricht von ${user.name}`, {
        body: text.length > 80 ? text.slice(0, 80) + "…" : text,
        tag: `chat-msg-${activeChat.id}`,
        category: "chat",
        onClick: () => { window.location.href = notifLink; },
      });

      // Send email notification to Kunde participants
      if (isKunde) {
        /*
         * Die Adresse steht am KONTAKT, nicht am Profil.
         *
         * Vorher wurde ausschliesslich `profiles` befragt. Ein Kunde ist aber
         * ein Kontakt und hat dort in aller Regel keine Zeile; die Mail ging
         * deshalb still gar nicht erst hinaus, und der Kunde erfuhr nichts von
         * seiner Nachricht. Der Kontakt wurde sogar schon gesucht, aber nur,
         * um den Namen zu bilden.
         */
        const kundeProfile = cacheGet("profiles").find((pr: any) => pr.id === p.id);
        const kontaktRows = cacheGet("kontakte");
        const kundeKontakt = kontaktRows.find((k: any) => (k.meta as any)?.authUserId === p.id);
        const kundeEmail = (kundeKontakt?.email || "").trim() || kundeProfile?.email;
        if (kundeEmail) {
          const kundeName = kundeKontakt ? `${kundeKontakt.vorname} ${kundeKontakt.nachname}` : kundeProfile?.name || "";
          supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "chat-nachricht",
              recipientEmail: kundeEmail,
              idempotencyKey: `chat-msg-${activeChat.id}-${Date.now()}`,
              // Die Kundensprache ermittelt der Server über den Kontakt.
              ...(kundeKontakt?.id ? { kontaktId: kundeKontakt.id } : {}),
              // Hier schreibt der Partner an den Kunden. Welches Feld der
              // Vorlage wen traegt, entscheidet chatBenachrichtigung.ts.
              templateData: chatBenachrichtigungDaten({
                empfaengerName: kundeName,
                absenderName: user.name,
                absenderId: authUser?.id,
                nachricht: text,
                portalUrl: oeffentlicheAdresse("/kunde/chat"),
              }),
            },
          }).then(() => {});
        }
      }
    }

    /*
     * Glocke und Mail an alle im CRM, einmal je Empfaenger.
     *
     * Die Function schreibt fuer einen mit @ Angesprochenen die Erwaehnung
     * statt der gewoehnlichen Glocke, nicht beides. Der Browser springt fuer
     * die Erwaehnung nur ein, wenn die Function gar nicht erreichbar ist, etwa
     * weil sie in Lovable noch nicht ausgerollt ist. Dann bleibt es beim
     * bisherigen Verhalten.
     */
    // Der Chat von jetzt, nicht der beim Eintreffen der Antwort geoeffnete.
    const chatBeimSenden = activeChat;
    chatBenachrichtigungAnstossen(gesendet.id).then((ergebnis) => {
      if (ergebnis === "nicht_erreichbar") erwaehnungenMelden(chatBeimSenden, text);
    });

    setMessage("");
    delete entwuerfeRef.current[chatId];
    setMentionOpen(false);
    aktualisieren();
  };

  const erwaehnungenMelden = (chat: ChatData, text: string) => {
    /*
     * Die Erwaehnung geht an den Erwaehnten, nicht an einen selbst.
     *
     * Bis zum 19.09.2026 wurde hier zwar der richtige Teilnehmer gesucht, die
     * Benachrichtigung landete aber trotzdem beim Absender: `addNotifOfType`
     * setzte als Empfaenger schlicht das angemeldete Konto. Wer einen Kollegen
     * mit @ ansprach, benachrichtigte sich selbst, und der Kollege erfuhr nie
     * davon. Die Kennung geht deshalb jetzt als `mentionedId` mit.
     *
     * Gesucht wird ueber den Namen, weil im Text nur der Name steht. Tragen
     * zwei Teilnehmer denselben Namen, bekommen BEIDE die Meldung. Das ist die
     * ehrlichere Antwort als ein geratener Treffer: Bei Otto Hans sitzen zwei
     * Konten mit demselben Namen im internen Chat, und `find` haette dort
     * gewuerfelt.
     */
    const mentionedNames = extractMentions(text);
    const schonBenachrichtigt = new Set<string>();
    mentionedNames.forEach(name => {
      const treffer = chat.teilnehmer.filter(t =>
        t.name.toLowerCase() === name.toLowerCase()
      );
      treffer.forEach(participant => {
        // Sich selbst zu erwaehnen ergibt keine Meldung.
        if (participant.id === myId) return;
        if (schonBenachrichtigt.has(participant.id)) return;
        schonBenachrichtigt.add(participant.id);
        addMentionNotification({
          chatId: chat.id,
          chatName: chat.kundeName,
          mentionedId: participant.id,
          mentionedName: participant.name,
          mentionedById: myId,
          mentionedByName: user.name,
          messageText: text.length > 80 ? text.slice(0, 80) + "…" : text,
        });
      });
    });
  };

  /**
   * Erlaubt sind PDF und die gängigen Bildformate.
   *
   * HEIC kommt von iPhones und wird von manchen Browsern ohne Dateityp
   * gemeldet, deshalb zählt hier auch die Endung und nicht nur der Typ.
   */
  const ERLAUBTE_ENDUNGEN = [".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif"];

  const dateiArt = (file: File): "pdf" | "image" | null => {
    const name = file.name.toLowerCase();
    const endung = ERLAUBTE_ENDUNGEN.find((e) => name.endsWith(e));
    if (!endung) return null;
    if (endung === ".pdf") {
      return !file.type || file.type === "application/pdf" ? "pdf" : null;
    }
    // Bildtypen: HEIC meldet je nach Browser gar nichts oder image/heic.
    if (file.type && !file.type.startsWith("image/")) return null;
    return "image";
  };

  /**
   * Anzeigbare Adressen der Anhänge.
   *
   * Der Ablageort ist nicht öffentlich, eine schlicht zusammengesetzte
   * Adresse führt deshalb zu einem kaputten Bild. Es braucht eine signierte
   * Adresse, die zeitlich begrenzt gültig ist. Die wird einmal je Anhang
   * geholt und gemerkt.
   */
  const [anhangUrls, setAnhangUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!activeChat) return;
    // Anhang und, falls vorhanden, sein Vorschaubild. Beide liegen im selben
    // geschützten Ordner und brauchen beide eine signierte Adresse.
    const offen = sichtbareNachrichten
      .flatMap((n) => [n.fileUrl, n.vorschauUrl])
      .filter((pfad): pfad is string => !!pfad && !anhangUrls[pfad]);
    if (offen.length === 0) return;
    let abgebrochen = false;
    (async () => {
      const { resolveUnterlagenUrl } = await import("@/lib/storage");
      const paare = await Promise.all(
        [...new Set(offen)].map(async (pfad) => [pfad, (await resolveUnterlagenUrl(pfad)) || ""] as const),
      );
      if (abgebrochen) return;
      setAnhangUrls((prev) => {
        const neu = { ...prev };
        for (const [pfad, url] of paare) if (url) neu[pfad] = url;
        return neu;
      });
    })();
    return () => { abgebrochen = true; };
  }, [activeChat, sichtbareNachrichten, anhangUrls]);

  const anhangUrl = (pfad?: string) => (pfad ? anhangUrls[pfad] || "" : "");

  /** Ist der Anhang ein Bild? Für die Vorschau in der Unterhaltung. */
  const istBild = (name?: string) => /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(name || "");

  const handleFileUpload = async (file: File) => {
    if (!activeChat) return;
    const art = dateiArt(file);
    if (!art) {
      toast.error("Erlaubt sind PDF sowie JPG, PNG und HEIC");
      return;
    }
    const { validateUploadFile } = await import("@/lib/uploadLimits");
    if (validateUploadFile(file, art)) return;
    try {
      await ensureParticipant();
      const path = `chat/${activeChat.id}/${Date.now()}_${file.name}`;
      /*
       * Bei einem PDF entsteht hier zusätzlich das Vorschaubild der ersten
       * Seite. Es wird neben das Dokument in denselben Ordner gelegt, damit
       * für beide dieselben Zugriffsregeln gelten: Die Storage-Regel prüft
       * nur `chat/<chatId>/` und die Teilnahme am Chat, nicht die
       * Dateiendung. Wer das PDF nicht sehen darf, sieht auch die Vorschau
       * nicht.
       *
       * Rendern und Hochladen laufen nebeneinander, damit die Nachricht
       * nicht länger braucht als nötig. Misslingt die Vorschau, bleibt es
       * beim Symbol, das Hochladen selbst ist davon unberührt.
       */
      const [{ data, error }, vorschauBild] = await Promise.all([
        supabase.storage.from("unterlagen").upload(path, file),
        art === "pdf"
          ? import("@/lib/pdfVorschau").then((m) => m.erzeugePdfVorschau(file))
          : Promise.resolve(null),
      ]);
      const fileUrl: string | undefined = data?.path;
      if (error) console.error("Upload-Fehler:", error);

      let vorschauUrl: string | undefined;
      if (fileUrl && vorschauBild) {
        const { VORSCHAU_ENDUNG, VORSCHAU_TYP } = await import("@/lib/pdfVorschau");
        const vorschauPfad = `${path}${VORSCHAU_ENDUNG}`;
        const abgelegt = await supabase.storage
          .from("unterlagen")
          .upload(vorschauPfad, vorschauBild, { contentType: VORSCHAU_TYP });
        if (abgelegt.error) console.warn("Vorschau konnte nicht abgelegt werden:", abgelegt.error);
        else vorschauUrl = abgelegt.data?.path;
      }

      const anhang = await addMessage(activeChat.id, {
        senderId: myId,
        senderName: user.name,
        senderInitials: getInitials(user.name),
        text: `📎 ${file.name}`,
        fileName: file.name,
        fileUrl,
        vorschauUrl,
      });
      // Auch ein Anhang ist eine Nachricht: Glocke und Mail an alle im CRM.
      void chatBenachrichtigungAnstossen(anhang.id);
      aktualisieren();
      toast.success(`${file.name} gesendet`);
    } catch (err) {
      console.error("Upload-Fehler:", err);
      toast.error("Datei konnte nicht hochgeladen werden");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(handleFileUpload);
  };

  const insertMention = (participant: ChatParticipant) => {
    if (mentionStartPos === null) return;
    const before = message.slice(0, mentionStartPos);
    const after = message.slice(inputRef.current?.selectionStart ?? message.length);
    const mentionText = `@${participant.name} `;
    const newMsg = before + mentionText + after.replace(/^\S*\s?/, "");
    setMessage(newMsg);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStartPos(null);
    setMentionIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessage(val);
    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");
    if (lastAtIdx !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIdx + 1);
      const charBeforeAt = lastAtIdx > 0 ? val[lastAtIdx - 1] : " ";
      if ((charBeforeAt === " " || lastAtIdx === 0) && !/\n/.test(textAfterAt)) {
        setMentionOpen(true);
        setMentionQuery(textAfterAt);
        setMentionStartPos(lastAtIdx);
        setMentionIndex(0);
        return;
      }
    }
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStartPos(null);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionOpen && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => (i + 1) % filteredMentions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => (i - 1 + filteredMentions.length) % filteredMentions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filteredMentions[mentionIndex]); return; }
      if (e.key === "Escape") { setMentionOpen(false); return; }
    }
    if (e.key === "Enter" && message.trim() && !mentionOpen) handleSend();
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
  };
  /** Markierte Nachrichten des offenen Chats, neueste zuerst. */
  const markierteImChat = useMemo(() => {
    if (!activeChat) return [];
    return sichtbareNachrichten
      .filter((n) => markierteIds.includes(n.id))
      .slice()
      .reverse();
  }, [activeChat, sichtbareNachrichten, markierteIds]);

  /** Alle Anhänge des offenen Chats, neueste zuerst. */
  const dateienImChat = useMemo(() => {
    if (!activeChat) return [];
    return activeChat.nachrichten
      .filter(n => !!n.fileUrl)
      .map(n => ({
        id: n.id,
        name: n.fileName || "Datei",
        url: n.fileUrl as string,
        vorschau: n.vorschauUrl,
        von: n.senderName,
        am: n.timestamp,
      }))
      .reverse();
  }, [activeChat]);

  /*
   * Die Kopfzeile der Seite zeigt die beiden Zahlen als kleine Knopfabzeichen.
   * Sie liegen hier drin, weil hier die Nachrichten liegen, deshalb die
   * Meldung nach oben statt einer zweiten Berechnung dort.
   */
  useEffect(() => {
    onKennzahlen?.({ dateien: dateienImChat.length, markierte: markierteImChat.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateienImChat.length, markierteImChat.length]);

  useImperativeHandle(ref, () => ({
    oeffneDateien: () => setDateienOffen(true),
    oeffneMarkierte: () => setMarkierteOffen(true),
  }));

  if (!activeChat) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6">
        Dieser Verlauf konnte nicht geladen werden.
      </div>
    );
  }

  return (
    <>
      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0 p-4"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg z-10 flex items-center justify-center">
            <p className="text-primary font-medium">Datei hier ablegen</p>
          </div>
        )}
        {/*
          Leerer Verlauf: Hinweis mittig ueber der ganzen Flaeche. Im Inhalt
          selbst liesse er sich nicht zentrieren, der Radix-Viewport legt eine
          Tabelle um die Kinder, und `h-full` greift dort nicht. Ohne Zeiger,
          damit Ablegen einer Datei weiter funktioniert.
        */}
        {sichtbareNachrichten.length === 0 && (
          <div data-chat-leer className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <p className="text-sm text-muted-foreground text-center">
              Noch keine Nachrichten. Schreib die erste unten.
            </p>
          </div>
        )}
        {/*
          Mittige Spalte statt der vollen Breite: Auf einem breiten Monitor
          lagen eigene und fremde Nachrichten ueber 800 Pixel auseinander, das
          Auge musste bei jeder Antwort von Rand zu Rand springen. Innerhalb
          der Spalte bleibt der Versatz links und rechts, wer was geschrieben
          hat, ist also weiter auf einen Blick klar. Die Eingabezeile unten
          nutzt dieselbe Breite, damit beides eine Linie bildet.
          Hoechstens 600 Pixel: Bei 736 Pixeln wirkte die Luecke zwischen
          kurzen Blasen wie "hi" und "ja" immer noch riesig.
        */}
        <div className="mx-auto w-full max-w-[37.5rem] space-y-4">
          {!aeltereErschoepft && (
            <div className="text-center">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={ladeAeltere} disabled={aeltereLaufen}>
                {aeltereLaufen ? "Wird geladen" : "Ältere Nachrichten laden"}
              </Button>
            </div>
          )}
          <p className="text-xs text-center text-muted-foreground">
            Chat wurde erstellt von {activeChat.erstelltVon} {formatDate(activeChat.erstelltAm)}
          </p>
          {sichtbareNachrichten.map((msg) => {
            const isSystem = msg.senderName === "System" || msg.senderId === "system";
            if (isSystem) {
              return (
                <p key={msg.id} className="text-xs text-center text-muted-foreground py-1">{msg.text}</p>
              );
            }

            const readers = readReceipts[msg.id] || [];

            /*
             * Rechts steht die Seite des Lesenden: im Kundenchat also jede
             * Nachricht von OS Immobilien, auch die des Partners, wenn Christian
             * mitliest. Die Primaerfarbe haengt an der Seite und nicht an
             * "selbst geschrieben", sonst stuende rechts eine graue Blase und
             * man koennte sie links fuer den Kunden halten. Wer genau
             * geschrieben hat, zeigen Name und Avatar, die bei jeder
             * Nachricht sichtbar bleiben.
             */
            const rechts = stehtRechts(msg.senderId, myId, aussen);

            return (
              // Die Zeile nimmt hoechstens 80 Prozent der Spalte ein, die
              // rechte Seite rutscht nach rechts. So bleibt auch eine lange
              // Nachricht sichtbar versetzt, und Name, Uhrzeit und "gelesen"
              // wandern mit der Blase mit.
              <div key={msg.id} className={`flex max-w-[80%] items-start gap-3 group ${rechts ? "ml-auto flex-row-reverse" : ""}`}>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className={`${colorForName(msg.senderName)} text-white text-[10px]`}>
                    {msg.senderInitials}
                  </AvatarFallback>
                </Avatar>
                <div className={`min-w-0 flex-1 flex flex-col ${rechts ? "items-end" : "items-start"}`}>
                  <div className={`flex items-center gap-2 ${rechts ? "flex-row-reverse" : ""}`}>
                    <span className="font-semibold text-sm">{msg.senderName}</span>
                    <span className="text-xs text-muted-foreground">{formatTime(msg.timestamp)}</span>
                    <button
                      onClick={() => toggleMarkierung(msg.id)}
                      className={`transition-opacity ${markierteIds.includes(msg.id) ? "text-amber-500" : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-amber-500"}`}
                      title={markierteIds.includes(msg.id) ? "Markierung entfernen" : "Nachricht markieren"}
                    >
                      <Star className={`h-3.5 w-3.5 ${markierteIds.includes(msg.id) ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={() => { setMeldenMsg({ id: msg.id, senderName: msg.senderName }); setMeldenOpen(true); }}
                      className={`opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive ${rechts ? "mr-auto" : "ml-auto"}`}
                      title="Nachricht melden"
                    >
                      <Flag className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {msg.fileName && istBild(msg.fileName) ? (
                    // Bilder als Vorschau statt als Dateizeile. Ein Klick
                    // öffnet sie in voller Größe.
                    <button
                      type="button"
                      onClick={() => msg.fileUrl && openUnterlage(msg.fileUrl)}
                      className="mt-1 block max-w-xs rounded-lg overflow-hidden border hover:opacity-90 transition-opacity bg-muted"
                      title={msg.fileName}
                    >
                      {anhangUrl(msg.fileUrl) ? (
                        <img
                          src={anhangUrl(msg.fileUrl)}
                          alt={msg.fileName}
                          loading="lazy"
                          className="w-full h-auto max-h-64 object-cover"
                        />
                      ) : (
                        <div className="h-32 w-48 flex items-center justify-center text-xs text-muted-foreground">
                          Vorschau wird geladen
                        </div>
                      )}
                    </button>
                  ) : msg.fileName && /\.pdf$/i.test(msg.fileName) && msg.vorschauUrl ? (
                    /*
                     * PDF mit Vorschaubild der ersten Seite. Das Bild ist beim
                     * Hochladen entstanden, siehe `src/lib/pdfVorschau.ts`.
                     * Ein Klick öffnet weiterhin das Dokument selbst, die
                     * Vorschau ersetzt es nicht.
                     *
                     * Hier stand früher ein `<object>` mit dem PDF darin. Das
                     * hat nie etwas gezeigt, weil die Seitenrichtlinie
                     * `object-src 'none'` setzt, und ist deshalb immer auf
                     * das Symbol zurückgefallen.
                     */
                    <button
                      type="button"
                      onClick={() => msg.fileUrl && openUnterlage(msg.fileUrl)}
                      className="mt-1 block w-48 rounded-lg overflow-hidden border hover:opacity-90 transition-opacity bg-muted text-left"
                      title={msg.fileName}
                    >
                      {anhangUrl(msg.vorschauUrl) ? (
                        <img
                          src={anhangUrl(msg.vorschauUrl)}
                          alt={`Erste Seite von ${msg.fileName}`}
                          loading="lazy"
                          className="w-full h-auto max-h-72 object-contain bg-white"
                        />
                      ) : (
                        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
                          Vorschau wird geladen
                        </div>
                      )}
                      <div className="flex items-center gap-2 px-3 py-2 border-t bg-card">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-xs font-medium truncate text-foreground">{msg.fileName}</span>
                      </div>
                    </button>
                  ) : msg.fileName ? (
                    // Nie breiter als die Zeile, sonst schiebt ein langer
                    // Dateiname die Blase am Handy ueber den Rand. `data-no-wrap`
                    // haelt Symbol und Namen in einer Zeile, der Name wird
                    // dann gekuerzt statt umgebrochen.
                    <div data-no-wrap className={`mt-1 rounded-lg p-3 max-w-[min(100%,32rem)] flex items-center gap-2 ${rechts ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      {msg.fileUrl ? (
                        <button type="button" onClick={() => openUnterlage(msg.fileUrl)} className={`text-sm font-medium truncate hover:underline text-left ${rechts ? "text-primary-foreground" : "text-primary"}`}>{msg.fileName}</button>
                      ) : (
                        <span className={`text-sm font-medium truncate ${rechts ? "text-primary-foreground" : "text-primary"}`}>{msg.fileName}</span>
                      )}
                    </div>
                  ) : (
                    <p className={`text-sm mt-1 rounded-lg p-3 max-w-[min(100%,32rem)] break-words ${rechts ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{renderMessageText(msg.text)}</p>
                  )}
                  {/* Read receipts - auto-triggered, no manual button */}
                  {readers.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-0.5 transition-colors">
                            <CheckCheck className="h-3 w-3" />
                            <span>{readers.length}× gelesen</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start" className="w-48 p-2">
                          <p className="text-xs font-semibold mb-1.5">Gelesen von:</p>
                          <div className="space-y-1">
                            {readers.map((id, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <CheckCheck className="h-3 w-3 text-primary" />
                                <span className="text-xs">{profileMap[id] || id}</span>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input with @-mention dropdown */}
      {/* Bleibt unten stehen, egal wie lang die Chatliste links ist. */}
      <div className="p-3 border-t shrink-0 bg-card">
        {/* Dieselbe mittige Spalte wie der Verlauf darueber. */}
        <div className="relative mx-auto w-full max-w-[37.5rem]">
          {mentionOpen && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-4 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto z-20">
              <div className="p-1">
                <p className="text-[10px] text-muted-foreground px-2 py-1 font-medium">Teilnehmer erwähnen</p>
                {filteredMentions.map((p, idx) => (
                  <button
                    key={p.id}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-accent transition-colors ${idx === mentionIndex ? "bg-accent" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); insertMention(p); }}
                    onMouseEnter={() => setMentionIndex(idx)}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className={`${colorForName(p.name)} text-white text-[9px]`}>{p.initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <span className="font-medium text-sm">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">{p.role}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Datei anhängen" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon" aria-label="Erwähnen" className="h-8 w-8 shrink-0"
              onClick={() => {
                setMessage(prev => prev + "@");
                setMentionOpen(true);
                setMentionQuery("");
                setMentionStartPos(message.length);
                setMentionIndex(0);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              <AtSign className="h-4 w-4" />
            </Button>
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf,image/*,.jpg,.jpeg,.png,.heic,.heif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ""; }} />
            <Input
              ref={inputRef}
              className="flex-1"
              placeholder="Nachricht schreiben... (@Name zum Erwähnen)"
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
            />
            {/*
              Auf der Chatseite bleibt es beim reinen Papierflieger, dort
              ist aus der Kopfzeile klar, wohin die Nachricht geht. Im
              Kundenprofil stehen beide Verläufe nebeneinander, deshalb
              sagt der Knopf dort ausdrücklich, wer sie zu sehen bekommt.
            */}
            {sendeKnopfText ? (
              <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={handleSend} disabled={!message.trim()}>
                <Send className="h-4 w-4" />
                {sendeKnopfText}
              </Button>
            ) : (
              <Button size="icon" aria-label="Senden" className="h-8 w-8 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0" onClick={handleSend} disabled={!message.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Markierte Nachrichten des Chats. */}
      <Dialog open={markierteOffen} onOpenChange={setMarkierteOffen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Markierte Nachrichten ({markierteImChat.length})</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {markierteImChat.map((m) => (
              <div key={m.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors">
                <Star className="h-4 w-4 text-amber-500 fill-current shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm break-words">{m.fileName || m.text}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {m.senderName} · {new Date(m.timestamp).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <button
                  onClick={() => toggleMarkierung(m.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Markierung entfernen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {markierteImChat.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                In diesem Chat ist noch keine Nachricht markiert. Fahre über eine Nachricht und klicke auf den Stern.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Alle Dateien eines Chats an einer Stelle. Der häufigste Grund, einen
          alten Verlauf zu durchsuchen, ist die Suche nach einem Anhang. */}
      <Dialog open={dateienOffen} onOpenChange={setDateienOffen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Dateien in diesem Chat ({dateienImChat.length})
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {dateienImChat.map((d) => (
              <button
                key={d.id}
                onClick={() => openUnterlage(d.url)}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent text-left transition-colors"
              >
                {istBild(d.name) ? (
                  <img src={anhangUrl(d.url)} alt="" loading="lazy" className="h-9 w-9 rounded object-cover shrink-0 border bg-muted" />
                ) : d.vorschau && anhangUrl(d.vorschau) ? (
                  // Auch in der Dateiliste die erste Seite statt eines Symbols.
                  <img src={anhangUrl(d.vorschau)} alt="" loading="lazy" className="h-9 w-9 rounded object-cover object-top shrink-0 border bg-white" />
                ) : (
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {d.von} · {new Date(d.am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                </div>
              </button>
            ))}
            {dateienImChat.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                In diesem Chat wurde noch keine Datei geteilt.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <MeldenDialog
        open={meldenOpen}
        onOpenChange={setMeldenOpen}
        typ="chat_nachricht"
        referenzId={meldenMsg?.id || ""}
        referenzLabel={meldenMsg ? `Nachricht von ${meldenMsg.senderName}` : ""}
      />
    </>
  );
});

export default ChatVerlauf;
