import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send as SendIcon, Loader2, Paperclip, Upload, Sparkles, AlertCircle, CheckCheck } from "lucide-react";
import { KundeEmptyState } from "@/components/kunde/KundeEmptyState";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { openUnterlage } from "@/lib/storage";
import { useUser } from "@/contexts/UserContext";
import { getInitials } from "@/lib/chatStore";
import { toast } from "sonner";
import { showPushNotification } from "@/lib/pushNotifications";
import { chatBenachrichtigungAnstossen } from "@/lib/chatBenachrichtigungAnstossen";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { portalLocale } from "@/i18n/portalSprache";
import { useIsMobile } from "@/hooks/use-mobile";
import { stehtRechts } from "@/lib/chatSeite";

/** Kennzeichen einer Dateinachricht im gespeicherten Text, wie im CRM. */
const DATEI_ZEICHEN = "📎";

export default function KundeChat() {
  const { t } = useTranslation();
  const { user, authUser } = useUser();
  const [kontakt, setKontakt] = useState<any>(null);
  const [berater, setBerater] = useState<{ id: string; name: string; email?: string; avatar_url?: string } | null>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [newMsg, setNewMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [ladeFehler, setLadeFehler] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Auf dem Handy wurde der lange Platzhalter abgeschnitten.
  const istHandy = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load kontakt, berater und chats
  const loadData = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    setLadeFehler(false);
    try {
      // Nur die Felder laden, die der Chat braucht. Interne Spalten wie notizen
      // und das komplette meta bleiben draussen.
      const { data: kontakte, error: kontakteError } = await supabase
        .from("kontakte")
        .select("id, vorname, nachname, status, berater, zustaendig_id")
        .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
        .limit(1);
      if (kontakteError) throw kontakteError;
      const k = kontakte?.[0];
      if (k) {
        setKontakt(k);
        /*
         * Zustaendigen Vertriebspartner laden.
         *
         * Zuerst ueber `get_kunde_vp_profile`, nicht ueber `profiles_public`.
         * Die Ansicht laeuft mit den Rechten des Aufrufers, und die Leseregel
         * auf `profiles` erlaubt einem Kunden seit dem 17.05.2026 nur noch das
         * EIGENE Profil (`auth.uid() = id OR is_internal_role(...)`). Der Kunde
         * bekam sein Beraterprofil deshalb nie zu sehen, und die Seite schloss
         * daraus, es sei keiner zugewiesen. Genau das hat Christian am
         * 18.09.2026 gemeldet: "Dir wurde noch kein Vertriebspartner
         * zugewiesen", obwohl einer zugewiesen war.
         *
         * Die Funktion laeuft mit erhoehten Rechten und gibt ausschliesslich
         * das Profil des Partners zurueck, der am eigenen Kontakt haengt. Sie
         * kennt auch eine zweite Person am Kontakt.
         */
        let beraterProfile: any = null;
        const { data: vp } = await (supabase as any).rpc("get_kunde_vp_profile");
        if (vp?.[0]) beraterProfile = vp[0];
        // Rueckfall fuer Kontakte, an denen nur der Name steht und keine
        // Zustaendigkeit: Die Funktion verlangt `zustaendig_id`.
        if (!beraterProfile && k.zustaendig_id) {
          const { data } = await supabase
            .from("profiles_public" as any)
            .select("id, name, email, avatar_url")
            .eq("id", k.zustaendig_id)
            .maybeSingle();
          beraterProfile = data;
        }
        if (!beraterProfile && k.berater) {
          const { data: matches } = await supabase
            .from("profiles_public" as any)
            .select("id, name, email, avatar_url")
            .eq("name", k.berater);
          // Bevorzuge Profile mit interner Rolle (kein reiner Kunde). Nur bei
          // genau einem Treffer: Zwei Gleichnamige waeren geraten.
          if (matches && matches.length > 0) {
            const intern: any[] = [];
            for (const cand of matches as any[]) {
              const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", cand.id);
              const hasInternal = (roles || []).some((r: any) =>
                ["admin", "inhaber", "vertriebspartner", "vertriebsleiter", "setterin", "objektpartner"].includes(r.role)
              );
              if (hasInternal) intern.push(cand);
            }
            if (intern.length === 1) beraterProfile = intern[0];
            else if (intern.length === 0 && matches.length === 1) beraterProfile = matches[0];
          }
        }
        if (beraterProfile) setBerater(beraterProfile);
      }

      const { data: teilnahmen, error: teilnahmenError } = await supabase
        .from("chat_teilnehmer")
        .select("chat_id")
        .eq("benutzer_id", authUser.id);
      if (teilnahmenError) throw teilnahmenError;

      if (teilnahmen && teilnahmen.length > 0) {
        const chatIds = teilnahmen.map(t => t.chat_id);
        const { data: chatData, error: chatError } = await supabase
          .from("chat_gruppen")
          .select("*")
          .in("id", chatIds)
          .order("aktualisiert_am", { ascending: false });
        if (chatError) throw chatError;
        setChats(chatData || []);
        if (chatData && chatData.length > 0) {
          setSelectedChatId(chatData[0].id);
        }
      } else {
        setChats([]);
        setSelectedChatId(null);
      }

      const { data: profs } = await supabase.from("profiles_public" as any).select("id, name");
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p.name; });
      setProfiles(map);
    } catch (err) {
      console.error("Fehler beim Laden:", err);
      setLadeFehler(true);
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load messages for selected chat
  useEffect(() => {
    if (!selectedChatId) return;
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("chat_nachrichten")
        .select("*")
        .eq("chat_id", selectedChatId)
        .order("gesendet_am", { ascending: true });
      if (error) {
        console.error("Fehler beim Laden der Nachrichten:", error);
        // i18n.t statt t, damit der Effekt nicht bei jedem Sprachwechsel neu lädt.
        toast.error(i18n.t("portal.chat.messages_load_error"));
        return;
      }
      setMessages(data || []);

      if (authUser && data) {
        const unread = data.filter((m: any) => {
          const gv = m.gelesen_von || [];
          return !gv.includes(authUser.id) && m.absender_id !== authUser.id;
        });
        for (const m of unread) {
          const gv = Array.isArray(m.gelesen_von) ? [...m.gelesen_von, authUser.id] : [authUser.id];
          await supabase.from("chat_nachrichten").update({ gelesen_von: gv }).eq("id", m.id);
        }
      }
    };
    loadMessages();
  }, [selectedChatId, authUser]);

  // Realtime subscription
  useEffect(() => {
    if (!selectedChatId) return;
    const channel = supabase
      .channel(`kunde-chat-${selectedChatId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_nachrichten",
        filter: `chat_id=eq.${selectedChatId}`,
      }, (payload) => {
        const incoming = payload.new as any;
        setMessages(prev => prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming]);
        if (authUser && (payload.new as any).absender_id !== authUser.id) {
          const gv = Array.isArray((payload.new as any).gelesen_von) ? [...(payload.new as any).gelesen_von, authUser.id] : [authUser.id];
          supabase.from("chat_nachrichten").update({ gelesen_von: gv }).eq("id", (payload.new as any).id);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "chat_nachrichten",
        filter: `chat_id=eq.${selectedChatId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "chat_nachrichten",
        filter: `chat_id=eq.${selectedChatId}`,
      }, (payload) => {
        const old = payload.old as any;
        setMessages(prev => prev.filter(m => m.id !== old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedChatId, authUser]);

  // Realtime: Chat-Liste aktualisieren, wenn neue Chats angelegt oder Teilnehmer hinzugefügt werden
  useEffect(() => {
    if (!authUser) return;
    const channel = supabase
      .channel(`kunde-chat-list-${authUser.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_teilnehmer",
        filter: `benutzer_id=eq.${authUser.id}`,
      }, () => { loadData(); })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "chat_gruppen",
      }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser, loadData]);

  /*
   * Beim Öffnen und bei neuen Nachrichten zur neuesten springen, aber nur,
   * wenn der Kunde ohnehin unten steht.
   *
   * Bis zum 25.09.2026 wurde bei JEDER Änderung der Nachrichten nach unten
   * gesprungen, auch bei einer Lesebestätigung des Beraters. Wer gerade alte
   * Nachrichten las, wurde dabei weggerissen. Jetzt gilt: Beim Öffnen eines
   * Chats und nach dem eigenen Senden geht es nach unten, sonst nur, wenn
   * der Kunde schon unten war (`bleibUnten`, gepflegt beim Scrollen).
   *
   * Einmal direkt nach dem Setzen der Nachrichten reichte nicht: Danach
   * ändert sich noch die Höhe des Verlaufs (Tastatur, Fenster), und Bilder
   * laden nach. Deshalb wird nach dem nächsten Bild noch einmal gescrollt
   * und bei Größenänderung und nachgeladenen Bildern erneut, solange der
   * Kunde nicht selbst nach oben gescrollt hat.
   */
  const bleibUnten = useRef(true);
  const zumNeuesten = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => {
    bleibUnten.current = true;
  }, [selectedChatId]);
  useEffect(() => {
    if (!bleibUnten.current) return;
    zumNeuesten();
    if (typeof requestAnimationFrame !== "function") return;
    const id = requestAnimationFrame(zumNeuesten);
    return () => cancelAnimationFrame(id);
  }, [messages, zumNeuesten]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const beimScrollen = () => {
      bleibUnten.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    const nachladen = () => { if (bleibUnten.current) zumNeuesten(); };
    el.addEventListener("scroll", beimScrollen, { passive: true });
    // load-Ereignisse von Bildern steigen nicht auf, nur in der Capture-Phase.
    el.addEventListener("load", nachladen, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(nachladen) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", beimScrollen);
      el.removeEventListener("load", nachladen, true);
      ro?.disconnect();
    };
  });

  // Chat starten – legt chat_gruppen + chat_teilnehmer an
  const handleStartChat = async () => {
    if (!authUser || !kontakt || !berater?.id || creatingChat) return;
    setCreatingChat(true);
    try {
      const kundeName = `${kontakt.vorname || ""} ${kontakt.nachname || ""}`.trim() || "Kunde";
      const initialsKunde = `${(kontakt.vorname || "")[0] || ""}${(kontakt.nachname || "")[0] || ""}`.toUpperCase() || "K";
      const initialsBerater = (berater.name || "B").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

      /*
       * Der Chat entsteht in der Datenbank, nicht hier.
       *
       * Vorher legte diese Stelle die Gruppe an und trug danach ZWEI
       * Teilnehmer in einem Befehl ein: den Kunden und seinen Berater. Die
       * Eintrittsregel erlaubt einem Kunden aber nur, sich SELBST einzutragen.
       * Der Befehl scheiterte also immer, und zwar vollstaendig, waehrend die
       * Gruppe schon angelegt war. Zurueck blieb eine Chatgruppe ohne
       * Teilnehmer, in der danach niemand mehr schreiben konnte, auch der
       * Berater nicht. Der Kunde sah nur "new row violates row-level security
       * policy for table chat_teilnehmer".
       *
       * `kundenchat_starten` laeuft mit erhoehten Rechten und entscheidet
       * selbst, wer eingetragen wird: der Aufrufer und der fuer ihn
       * zustaendige Berater, sonst niemand. Sie gibt ausserdem eine bereits
       * vorhandene Gruppe zurueck, statt eine zweite anzulegen, und traegt in
       * einer frueher leer gebliebenen Gruppe die fehlenden Teilnehmer nach.
       */
      const { data: chatId, error: startFehler } = await supabase.rpc("kundenchat_starten" as any);
      if (startFehler || !chatId) throw startFehler || new Error("Chat konnte nicht angelegt werden");

      toast.success(t("portal.chat.toast_started"));
      await loadData();
      setSelectedChatId(chatId as string);
    } catch (err: any) {
      console.error("Chat-Start fehlgeschlagen:", err);
      toast.error(t("portal.chat.toast_start_failed") + (err?.message || t("portal.chat.unknown")));
    } finally {
      setCreatingChat(false);
    }
  };

  // Vertriebspartner benachrichtigen (Glocke + E-Mail) wenn Kunde sendet
  const notifyBerater = async (nachrichtId: string, preview: string) => {
    if (!selectedChatId || !authUser || !kontakt) return;
    /*
     * Glocke und Mail an den Partner schreibt seit dem 25.09.2026 die Edge
     * Function `chat-benachrichtigung`, nicht mehr dieser Browser.
     *
     * Vorher suchte der Browser des KUNDEN die Adresse des Partners in
     * `profiles_public`. Die Zeilensicherheit zeigt einem Kunden dort nur sein
     * eigenes Profil; die Liste war leer, es gab keinen Fehler und keinen
     * Eintrag im Versandprotokoll. Die Mail an den Partner ging so nie hinaus.
     * Die Function liest die Empfaenger ueber `chat_teilnehmer` und ihre
     * Adressen mit Dienstrechten, und sie schreibt genau eine Glocke und eine
     * Mail je Empfaenger, mit dem Knopf „Zum Chat“ direkt in diesen Chat.
     *
     * Christian hat damit am 25.09.2026 seine Vorgabe vom 19.09.2026
     * aufgehoben, nach der der Partner keine Glocke mehr bekam: Der Chat stand
     * fuer ihn gar nicht in der Seitenleiste, und die Mail kam nie an.
     */
    void chatBenachrichtigungAnstossen(nachrichtId);
    try {
      // Alle anderen Teilnehmer (= Vertriebspartner/Admins) ermitteln
      const { data: teilnehmerRows } = await supabase
        .from("chat_teilnehmer")
        .select("benutzer_id")
        .eq("chat_id", selectedChatId);
      const others = (teilnehmerRows || [])
        .map((t: any) => t.benutzer_id)
        .filter((uid: string) => uid !== authUser.id);
      if (others.length === 0) return;

      const kundeName = `${kontakt.vorname || ""} ${kontakt.nachname || ""}`.trim() || "Kunde";
      const shortPreview = preview.length > 80 ? preview.slice(0, 80) + "…" : preview;

      // Push-Benachrichtigung (Browser) für alle Vertriebspartner
      for (const uid of others) {
        showPushNotification(`Neue Nachricht von ${kundeName}`, {
          body: shortPreview,
          tag: `chat-msg-${selectedChatId}`,
          category: "chat",
          onClick: () => { window.location.href = `/chat?id=${selectedChatId}`; },
        });
      }
    } catch (err) {
      console.error("Benachrichtigung fehlgeschlagen:", err);
    }
  };

  const handleSend = async () => {
    if (!newMsg.trim() || !selectedChatId || !authUser || sending) return;
    const text = newMsg.trim();
    setSending(true);
    try {
      // Absendername und Initialen gehoeren ins meta. Ohne sie steht die
      // Nachricht im internen Chat ohne Namen und mit leerem Kreis da, weil
      // die Oberflaeche dort ausschliesslich aus diesem Feld liest.
      const absender = (user?.name || "").trim();
      /*
       * Der Fehler MUSS hier abgefragt werden.
       *
       * Supabase wirft bei einem Rechtefehler keine Ausnahme, sondern liefert
       * ihn im Ergebnis zurueck. Bis zum 19.09.2026 sah den niemand an. Die
       * Folge war die denkbar unguenstigste: Das Eingabefeld wurde geleert,
       * der Kunde hielt seine Nachricht fuer verschickt, UND der Berater bekam
       * Glocke und E-Mail ueber eine Nachricht, die es gar nicht gab. Er
       * oeffnete den Chat und fand nichts.
       *
       * Genau das passierte in jedem Kundenchat ohne Teilnehmerzeilen, und das
       * waren sechs von zehn.
       */
      // Die Kennung entsteht hier, damit die Benachrichtigung genau diese
      // Nachricht nennen kann, ohne sie danach erst wieder zu suchen.
      const nachrichtId = crypto.randomUUID();
      const { error: sendeFehler } = await supabase.from("chat_nachrichten").insert({
        id: nachrichtId,
        chat_id: selectedChatId,
        absender_id: authUser.id,
        inhalt: text,
        gelesen_von: [authUser.id],
        meta: absender ? { senderName: absender, senderInitials: getInitials(absender) } : {},
      });
      if (sendeFehler) throw sendeFehler;

      // Die eigene Nachricht soll man sehen, auch wenn man gerade oben las.
      // Sie kommt über die Echtzeitleitung herein, dann springt der Verlauf.
      bleibUnten.current = true;
      setNewMsg("");
      // Vertriebspartner benachrichtigen (asynchron, blockiert UI nicht)
      notifyBerater(nachrichtId, text);
    } catch (err) {
      console.error("Fehler beim Senden:", err);
      toast.error(t("portal.chat.toast_send_failed"));
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!selectedChatId || !authUser) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("portal.chat.toast_file_too_large"));
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `chat/${selectedChatId}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await supabase.storage.from("unterlagen").upload(path, file);
      if (error) throw error;
      /*
       * Bei einem PDF zusätzlich die erste Seite als Vorschaubild ablegen,
       * damit der Anhang im Verlauf des Beraters nicht nur als Symbol steht.
       * Das Bild landet im selben geschützten Ordner `chat/<chatId>/` und
       * unterliegt damit denselben Zugriffsregeln wie das Dokument. Klappt
       * es nicht, bleibt es beim Symbol, die Nachricht geht trotzdem raus.
       */
      let vorschauUrl: string | undefined;
      if (/\.pdf$/i.test(file.name) && (!file.type || file.type === "application/pdf")) {
        try {
          const { erzeugePdfVorschau, VORSCHAU_ENDUNG, VORSCHAU_TYP } = await import("@/lib/pdfVorschau");
          const bild = await erzeugePdfVorschau(file);
          if (bild) {
            const abgelegt = await supabase.storage
              .from("unterlagen")
              .upload(`${path}${VORSCHAU_ENDUNG}`, bild, { contentType: VORSCHAU_TYP });
            if (!abgelegt.error) vorschauUrl = abgelegt.data?.path;
          }
        } catch (fehler) {
          console.warn("Vorschau konnte nicht erzeugt werden:", fehler);
        }
      }
      const nachrichtId = crypto.randomUUID();
      const { error: anhangFehler } = await supabase.from("chat_nachrichten").insert({
        id: nachrichtId,
        chat_id: selectedChatId,
        absender_id: authUser.id,
        inhalt: `${DATEI_ZEICHEN} ${file.name}`,
        gelesen_von: [authUser.id],
        meta: { fileUrl: data.path, fileName: file.name, vorschauUrl },
      });
      // Ohne diese Abfrage meldete die Oberflaeche einen Anhang als gesendet,
      // den die Datenbank abgelehnt hatte, und der Partner bekaeme eine Mail
      // ueber eine Nachricht, die es nicht gibt.
      if (anhangFehler) throw anhangFehler;
      bleibUnten.current = true;
      toast.success(t("portal.chat.toast_file_sent", { name: file.name }));
      notifyBerater(nachrichtId, `📎 Datei gesendet: ${file.name}`);
    } catch (err) {
      console.error("Upload-Fehler:", err);
      toast.error(t("portal.chat.toast_upload_failed"));
    } finally {
      setUploading(false);
    }
  }, [selectedChatId, authUser]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(handleFileUpload);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  /*
   * Seitenregel wie im CRM (`src/lib/chatSeite.ts`), hier aus Sicht des
   * Kunden: Die Kundenseite ist er selbst, sie steht rechts, MOREImmo links.
   */
  const kundenSeite = useMemo(() => new Set(authUser?.id ? [authUser.id] : []), [authUser?.id]);

  const renderMessageContent = (msg: any) => {
    const meta = msg.meta as any;
    const fileUrl = meta?.fileUrl;
    const fileName = meta?.fileName;
    const rechts = stehtRechts(msg.absender_id, authUser?.id, kundenSeite);

    if (fileUrl && fileName) {
      return (
        <button
          type="button"
          onClick={() => openUnterlage(fileUrl)}
          className={`flex items-center gap-2 text-sm underline ${rechts ? "text-primary-foreground" : "text-primary"}`}
        >
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
          {fileName}
        </button>
      );
    }
    // Dateinachrichten tragen im Text "📎 Name" (so schreibt es auch das CRM,
    // ChatVerlauf.tsx). Gezeigt wird statt des Emojis das Symbol Paperclip.
    const inhalt = String(msg.inhalt ?? "");
    if (inhalt.startsWith(DATEI_ZEICHEN)) {
      return (
        <p className="text-sm whitespace-pre-wrap flex items-center gap-2">
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
          {inhalt.slice(DATEI_ZEICHEN.length).trimStart()}
        </p>
      );
    }
    return <p className="text-sm whitespace-pre-wrap">{inhalt}</p>;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  // ── Ladefehler: klar vom Fall "noch kein Chat vorhanden" trennen ──
  if (ladeFehler) {
    return (
      <DashboardLayout>
        <div className="px-2">
          <KundeEmptyState
            icon={AlertCircle}
            title={t("portal.chat.load_error_title")}
            description={t("portal.chat.load_error_text")}
            action={
              <Button variant="outline" onClick={() => loadData()}>
                {t("portal.chat.retry")}
              </Button>
            }
          />
        </div>
      </DashboardLayout>
    );
  }

  // ── Kein Chat vorhanden → Kunde kann selbst starten ──
  if (chats.length === 0) {
    return (
      <DashboardLayout>
        <div className="space-y-6 px-2">
          <div className="relative shrink-0 rounded-2xl overflow-hidden bg-card bg-gradient-to-br from-primary/10 via-card to-card border border-primary/10">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.08),transparent_70%)]" />
            <div className="relative p-6 md:p-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 backdrop-blur-sm flex items-center justify-center">
                  <MessageCircle className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold">{t("portal.chat.title")}</h1>
                  <p className="text-sm text-muted-foreground">{t("portal.chat.subtitle")}</p>
                </div>
              </div>
            </div>
          </div>

          <Card className="p-8 text-center border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-bold mb-2">{t("portal.chat.start_heading")}</h2>
            {berater ? (
              <>
                <p className="text-sm text-muted-foreground mb-1">
                  {t("portal.chat.your_partner")}
                </p>
                <p className="text-base font-semibold mb-4">{berater.name}</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto mb-6">
                  {t("portal.chat.start_hint")}
                </p>
                <Button
                  size="lg"
                  variant="brand"
                  onClick={handleStartChat}
                  disabled={creatingChat}
                  className="gap-2"
                >
                  {creatingChat ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t("portal.chat.starting")}</>
                  ) : (
                    <><MessageCircle className="h-4 w-4" /> {t("portal.chat.start_with", { name: berater.name.split(" ")[0] })}</>
                  )}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("portal.chat.no_advisor")}
              </p>
            )}
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/*
        Die SEITE endet am Bildschirmrand, nicht der Chat allein.

        Bis zum 25.09.2026 mass `useChatSichthoehe` die Hoehe. Der Helfer misst
        aber nur beim ersten Aufbau, und da stand hier noch der Ladekreisel:
        Das gemessene Element gab es nicht, die Messung fiel aus und wurde nie
        nachgeholt. Die Liste wuchs mit der Seite, und die Eingabezeile kam erst
        nach allen Nachrichten.

        Jetzt macht es die Huelle wie der Chat im CRM (`pages/Chat.tsx`): Das
        Portal ist auf dieser Route genau so hoch wie der Bildschirm
        (`data-vollbild="chat"` in `KundePortalLayout.tsx`), und von dort
        reicht eine Kette aus `flex-1 min-h-0` bis hierher. Die Kopfkarte ist
        fest, die Nachrichtenkarte nimmt den Rest, und darin scrollt allein der
        Verlauf. Die Eingabezeile steht damit immer unten.
      */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 sm:gap-4 px-2">
        {/* ─── Kopfkarte, auf dem Handy kompakter ─── */}
        <div className="relative shrink-0 rounded-2xl overflow-hidden bg-card bg-gradient-to-br from-primary/10 via-card to-card border border-primary/10">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.08),transparent_70%)]" />
          <div className="relative p-3 sm:p-6 md:p-8">
            {/* `data-no-wrap`: Sonst bricht die Handyregel in index.css die
                Zeile um, und das Bild steht allein ueber der Ueberschrift. */}
            <div data-no-wrap className="flex items-center gap-3">
              <Avatar className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 border border-primary/20">
                {berater?.avatar_url && <AvatarImage src={berater.avatar_url} alt={berater.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {berater?.name ? berater.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : <MessageCircle className="h-6 w-6" />}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold">{t("portal.chat.title")}</h1>
                <p className="text-sm text-muted-foreground">
                  {berater?.name || t("portal.chat.subtitle_direct")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/*
          Die Karte ist eine Spalte: Der Verlauf nimmt den Rest und scrollt in
          sich (`overscroll-contain`, damit am Ende nicht die Seite
          weiterzieht), die Eingabezeile steht darunter und AUSSERHALB des
          Scrollbereichs. Die Tastatur am Handy regelt die Huelle, siehe
          `KundePortalLayout.tsx`.
        */}
        <div className="portal-chat-panel flex flex-1 min-h-0 flex-col rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
            <div
              ref={scrollRef}
              role="log"
              className={`portal-chat-messages flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 bg-muted/30 relative transition-colors ${dragOver ? "bg-primary/10 ring-2 ring-primary ring-inset" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {dragOver && (
                <div className="absolute inset-0 flex items-center justify-center bg-primary/5 z-10 pointer-events-none">
                  <div className="flex flex-col items-center gap-2 text-primary">
                    <Upload className="h-10 w-10" />
                    <p className="font-semibold text-sm">{t("portal.chat.drop_file")}</p>
                  </div>
                </div>
              )}
              {/*
                Mittige Spalte wie im CRM-Chat (`ChatVerlauf.tsx`): Auf einem
                breiten Bildschirm stehen die Nachrichten nicht mehr an den
                beiden aeussersten Raendern, der Versatz links und rechts
                bleibt innerhalb der Spalte erhalten.
              */}
              <div className="mx-auto w-full max-w-[37.5rem] space-y-3">
                {messages.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground mt-8">{t("portal.chat.first_message")}</p>
                )}
                {messages.map(msg => {
                  const isSystem = (msg.meta as any)?.isSystem;
                  if (isSystem) {
                    return (
                      <div key={msg.id} className="text-center">
                        <p className="text-xs text-muted-foreground">{msg.inhalt}</p>
                      </div>
                    );
                  }
                  const isOwn = msg.absender_id === authUser?.id;
                  const rechts = stehtRechts(msg.absender_id, authUser?.id, kundenSeite);
                  /*
                   * Der Name steht in der Nachricht selbst.
                   *
                   * Vorher wurde ausschliesslich `profiles_public` befragt, und
                   * stand der Berater dort nicht drin, las der Kunde
                   * "Unbekannt" ueber jeder Nachricht seines Ansprechpartners.
                   * Das CRM schreibt den Absendernamen aber laengst in die
                   * Nachricht (`meta.senderName`, siehe addMessage im
                   * chatStore). Diese Quelle ist die verlaesslichere: Sie haengt
                   * an keiner weiteren Abfrage und an keiner Leseregel.
                   *
                   * Die Profilliste bleibt als zweite Quelle, fuer Altbestand
                   * ohne `meta`. Zuletzt greift der bekannte Berater dieses
                   * Kunden, denn im Kundenchat sitzt ohnehin nur er.
                   */
                  const senderName =
                    (msg.meta?.senderName || "").trim()
                    || profiles[msg.absender_id]
                    || (msg.absender_id === berater?.id ? berater?.name : "")
                    || t("portal.chat.unknown");
                  return (
                    <div key={msg.id} className={`flex ${rechts ? "justify-end" : "justify-start"}`}>
                      <div className={`portal-chat-bubble max-w-[80%] rounded-lg px-3 py-2 ${rechts ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                        {!isOwn && <p className="text-xs font-semibold mb-0.5 text-muted-foreground">{senderName}</p>}
                        {renderMessageContent(msg)}
                        {/*
                          Zeit und, bei eigenen Nachrichten, ob der Berater sie
                          gelesen hat.

                          Dieselbe Grundlage wie im Kundenprofil: `gelesen_von`
                          an der Nachricht. Der Absender steht dort beim Senden
                          selbst schon drin, deshalb zaehlt nur, wer sonst noch
                          gelesen hat.

                          Bewusst symmetrisch, so hat Christian es entschieden:
                          Der Berater sieht im CRM, ob der Kunde gelesen hat, und
                          der Kunde sieht hier dasselbe in die andere Richtung.
                        */}
                        <p className={`text-[11px] mt-1 flex items-center gap-1 ${rechts ? "justify-end text-primary-foreground" : "text-muted-foreground"}`}>
                          <span>
                            {new Date(msg.gesendet_am).toLocaleString(portalLocale(), { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                          </span>
                          {isOwn && (msg.gelesen_von || []).some((id: string) => id !== msg.absender_id) && (
                            <span className="flex items-center gap-0.5" title={t("portal.chat.read")}>
                              <CheckCheck className="h-3 w-3" />
                              {t("portal.chat.read")}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <form
              className="portal-chat-compose shrink-0 border-t p-3"
              onSubmit={e => { e.preventDefault(); handleSend(); }}
            >
              {/* Dieselbe mittige Spalte wie der Verlauf darueber. */}
              <div className="mx-auto flex w-full max-w-[37.5rem] items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label={t("portal.chat.attach_file")}
                  title={t("portal.chat.attach_file")}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>
                <Input
                  placeholder={istHandy ? t("portal.chat.input_ph_kurz") : t("portal.chat.input_ph")}
                  className="flex-1 h-9"
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  disabled={sending}
                />
                <Button size="sm" variant="brand" className="h-9 px-3" type="submit" disabled={sending || !newMsg.trim()} aria-label={t("portal.chat.send")}>
                  <SendIcon className="h-4 w-4" />
                </Button>
              </div>
            </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
