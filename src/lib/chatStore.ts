// Chat store - DB-backed via chat_gruppen/chat_nachrichten/chat_teilnehmer
// Testaccount: localStorage fallback

import { cacheGet, cacheInsert, cacheUpdate, cacheDelete, cacheReload } from "./dataCache";
import { funktionFehlt } from "../../supabase/functions/_shared/einheit-vormerkung";
import { isTestAccount } from "./dbStoreHelper";
import { getUserSetting, setUserSetting } from "./userSettingsCache";
import { loadAllUsers } from "./loadAllUsers";
import { kennungZuName } from "./beraterNamensabgleich";
import { berufsbezeichnung } from "./berufsbezeichnung";

export interface ChatParticipant {
  id: string;
  name: string;
  initials: string;
  role: string;
  avatar?: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderInitials: string;
  text: string;
  timestamp: string;
  fileUrl?: string;
  fileName?: string;
  /**
   * Ablagepfad des Vorschaubilds eines PDF-Anhangs.
   *
   * Entsteht beim Hochladen aus der ersten Seite und liegt im selben
   * geschützten Ordner `chat/<chatId>/` wie das PDF. Damit gelten für die
   * Vorschau genau dieselben Zugriffsregeln wie für das Dokument. Fehlt der
   * Wert, etwa bei allen vor dieser Änderung hochgeladenen Anhängen, zeigt
   * der Verlauf wie bisher nur das Symbol.
   */
  vorschauUrl?: string;
  gelesenVon?: string[]; // user IDs who confirmed reading
}

export type ChatTyp = "kundenkommunikation" | "intern";

export interface ChatData {
  id: string;
  kundeId: string;
  kundeName: string;
  kundeStatus: string;
  erstelltVon: string;
  /**
   * Die Kennung des Erstellers aus der Spalte `erstellt_von`.
   *
   * `erstelltVon` daneben ist nur ein Name aus dem `meta` und fehlt bei allen
   * Chats, die eine Datenbankfunktion anlegt, also bei jedem Tippgeber-Chat.
   * Prüfungen "darf der Ersteller das" gehören deshalb auf diese Kennung und
   * nicht auf den Namen.
   */
  erstelltVonId?: string;
  erstelltAm: string;
  typ: ChatTyp;
  /**
   * Bauart des Chats aus `meta.kind`, etwa "tippgeber_vp".
   *
   * Solche Chats entstehen aus einer Zuordnung und nicht aus freier Wahl. Wer
   * darin sitzt, ergibt sich aus `tippgeber.zugeordnet_id`. Deshalb darf man
   * sie nicht einzeln verlassen, siehe darfVerlassen in Chat.tsx.
   */
  kind?: string;
  teilnehmer: ChatParticipant[];
  nachrichten: ChatMessage[];
  angepinnt: boolean;
  ungelesen: boolean;
  stummgeschaltet: boolean;
  archiviert: boolean;
}

const CHATS_KEY = "mi_chats";
const CHATS_VERSION_KEY = "mi_chats_v";
const CURRENT_CHATS_VERSION = 2;

// Profile pic – DB-backed via user_settings, localStorage for testaccount
// Falls in user_settings nichts gesetzt ist, Fallback auf profiles.avatar_url
// (gecacht in localStorage durch UserContext)
export function getProfilePic(): string | null {
  if (isTestAccount()) {
    const local = localStorage.getItem("mi_profilbild");
    if (local) return local;
  } else {
    const fromSettings = getUserSetting<string | null>("profilbild", null);
    if (fromSettings) return fromSettings;
  }
  // Fallback: avatar_url aus profiles (vom UserContext gecacht)
  try {
    const cached = localStorage.getItem("mi_profile_avatar_url");
    return cached || null;
  } catch {
    return null;
  }
}

export function setProfilePic(base64: string) {
  if (isTestAccount()) { localStorage.setItem("mi_profilbild", base64); return; }
  setUserSetting("profilbild", base64);
}

// ── DB mapping ──

/**
 * Absendername und Initialen einer Nachricht.
 *
 * Beides steht im `meta` der Nachricht und wird beim Schreiben mitgegeben.
 * Nachrichten aus dem Tippgeber-Portal und aus dem Kundenportal wurden lange
 * ohne dieses `meta` gespeichert. Im internen Chat standen sie deshalb ohne
 * Namen da, und weil sich die Kreisfarbe aus dem Namen berechnet, ergab der
 * leere Name immer denselben blauen Kreis ohne Initialen.
 *
 * Fehlt der Name, wird er hier aus den Teilnehmern des Chats und ersatzweise
 * aus den Profilen ergaenzt. Das wirkt auch fuer alle Nachrichten, die schon
 * gespeichert sind, ohne dass Daten angefasst werden muessen.
 */
export function loeseAbsenderAuf(
  meta: any,
  absenderId: string | null | undefined,
  teilnehmer: Array<{ id: string; name: string; initials: string }>,
): { senderName: string; senderInitials: string } {
  const ausMeta = String(meta?.senderName || "").trim();
  if (ausMeta) {
    return {
      senderName: ausMeta,
      senderInitials: String(meta?.senderInitials || "").trim() || getInitials(ausMeta),
    };
  }
  if (!absenderId) return { senderName: "", senderInitials: "" };

  // "Nutzer" und "??" sind die Platzhalter aus chatFromDb. Sie sind so gut
  // wie kein Name und sollen nicht den Weg zum Profil versperren.
  const t = teilnehmer.find((x) => x.id === absenderId);
  if (t && t.name && t.name !== "Nutzer") {
    return {
      senderName: t.name,
      senderInitials: t.initials && t.initials !== "??" ? t.initials : getInitials(t.name),
    };
  }

  try {
    const profil = (cacheGet<any>("profiles") || []).find((p: any) => p.id === absenderId);
    const name = String(profil?.name || "").trim();
    if (name) return { senderName: name, senderInitials: getInitials(name) };
  } catch {
    /* Profile noch nicht geladen, dann bleibt es beim leeren Namen */
  }

  return { senderName: "", senderInitials: "" };
}

/**
 * Personen in einen Chat eintragen.
 *
 * Seit dem 30.09.2026 über die Datenbankfunktion `chat_teilnehmer_eintragen`
 * (Migration 20260930120000). Eine direkte Schreibregel auf
 * `chat_teilnehmer` gibt es danach nicht mehr: Vorher konnte sich jeder
 * selbst in jeden Chat eintragen und jede interne Rolle jeden in jeden Chat.
 * Die Funktion prüft, dass der Aufrufer den Chat angelegt hat oder schon
 * darin ist, und wen er eintragen darf. Bereits Eingetragene überspringt sie.
 *
 * Fehlt die Funktion, weil die Migration noch nicht gelaufen ist, gilt der
 * bisherige Weg über den Zwischenspeicher. Wirft, wenn die Datenbank ablehnt.
 */
export async function chatTeilnehmerEintragen(chatId: string, teilnehmer: ChatParticipant[]): Promise<void> {
  if (teilnehmer.length === 0) return;
  const { supabase: sb } = await import("@/integrations/supabase/client");
  const { error } = await (sb as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }>;
  }).rpc("chat_teilnehmer_eintragen", {
    p_chat_id: chatId,
    p_teilnehmer: teilnehmer.map((t) => ({
      benutzer_id: t.id,
      meta: { name: t.name, initials: t.initials, role: t.role },
    })),
  });
  if (!error) {
    await cacheReload("chat_teilnehmer");
    return;
  }
  if (!funktionFehlt(error)) throw new Error(error.message || "Teilnehmer konnten nicht eingetragen werden");

  const jetzt = new Date().toISOString();
  for (const t of teilnehmer) {
    await cacheInsert("chat_teilnehmer", {
      id: crypto.randomUUID(),
      chat_id: chatId,
      benutzer_id: t.id,
      beigetreten_am: jetzt,
      meta: { name: t.name, initials: t.initials, role: t.role },
    });
  }
}

/**
 * Beendet die eigene Teilnahme an einem Chat.
 *
 * Vorher entfernte die Oberfläche den Teilnehmer nur im Arbeitsspeicher und
 * lud die Chats gleich danach neu. Der Teilnehmer war dadurch sofort wieder
 * da, sichtbar passierte nichts ausser einer Erfolgsmeldung, und wer ein
 * zweites Mal klickte, erzeugte eine zweite Systemmeldung. Genau so entstand
 * das doppelte "hat den Chat verlassen".
 *
 * Gibt zurueck, ob die Zeile wirklich verschwunden ist. Schlaegt es fehl,
 * darf die Oberfläche keine Systemmeldung schreiben.
 */
export async function verlasseChat(chatId: string, benutzerId: string): Promise<boolean> {
  const zeile = (cacheGet<any>("chat_teilnehmer") || []).find(
    (t: any) => t.chat_id === chatId && t.benutzer_id === benutzerId,
  );
  if (!zeile) return false;
  return await cacheDelete("chat_teilnehmer", zeile.id);
}

function chatFromDb(chatRow: any, nachrichten: any[], teilnehmer: any[]): ChatData {
  const meta = chatRow.meta || {};
  return {
    id: chatRow.id,
    kundeId: meta.kundeId || "",
    kundeName: chatRow.name || "",
    kundeStatus: meta.kundeStatus || "",
    erstelltVon: meta.erstelltVon || "",
    erstelltVonId: chatRow.erstellt_von || undefined,
    erstelltAm: chatRow.erstellt_am || "",
    kind: meta.kind || undefined,
    typ: (chatRow.typ === "kundenkommunikation" || meta.typ === "kundenkommunikation") ? "kundenkommunikation" : "intern",
    teilnehmer: teilnehmer
      .filter((t: any) => t.chat_id === chatRow.id)
      .map((t: any) => ({
        id: t.benutzer_id,
        name: t.meta?.name || "Nutzer",
        initials: t.meta?.initials || "??",
        role: t.meta?.role || "",
        avatar: t.meta?.avatar,
      })),
    nachrichten: nachrichten
      .filter((n: any) => n.chat_id === chatRow.id)
      .map((n: any) => ({
        id: n.id,
        chatId: n.chat_id,
        senderId: n.meta?.isSystem ? "system" : n.absender_id,
        ...loeseAbsenderAuf(
          n.meta,
          n.absender_id,
          teilnehmer
            .filter((t: any) => t.chat_id === chatRow.id)
            .map((t: any) => ({ id: t.benutzer_id, name: t.meta?.name || "", initials: t.meta?.initials || "" })),
        ),
        text: n.inhalt,
        timestamp: n.gesendet_am,
        fileUrl: n.meta?.fileUrl,
        fileName: n.meta?.fileName,
        vorschauUrl: n.meta?.vorschauUrl,
      }))
      .sort((a: ChatMessage, b: ChatMessage) => a.timestamp.localeCompare(b.timestamp)),
    angepinnt: meta.angepinnt || false,
    ungelesen: meta.ungelesen || false,
    stummgeschaltet: meta.stummgeschaltet || false,
    archiviert: meta.archiviert || false,
  };
}

export function getChats(): ChatData[] {
  if (isTestAccount()) {
    const ver = localStorage.getItem(CHATS_VERSION_KEY);
    if (ver !== String(CURRENT_CHATS_VERSION)) {
      localStorage.removeItem(CHATS_KEY);
      localStorage.setItem(CHATS_VERSION_KEY, String(CURRENT_CHATS_VERSION));
    }
    const stored = localStorage.getItem(CHATS_KEY);
    return stored ? JSON.parse(stored) : [];
  }
  // Build from cache tables
  const chatRows = cacheGet("chat_gruppen");
  const allNachrichten = cacheGet("chat_nachrichten");
  const allTeilnehmer = cacheGet("chat_teilnehmer");
  return chatRows.map((row: any) => chatFromDb(row, allNachrichten, allTeilnehmer));
}

export function saveChats(chats: ChatData[]) {
  if (isTestAccount()) {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  }
  // For DB mode, individual operations handle persistence
}

export function getChatById(id: string): ChatData | undefined {
  return getChats().find(c => c.id === id);
}

/**
 * Legt eine Chatgruppe samt Teilnehmern an.
 *
 * WARUM DIESE FUNKTION WARTET
 *
 * Bis zum 19.09.2026 wurden Gruppe und Teilnehmerzeilen ohne `await`
 * hintereinander abgeschickt, und die Funktion selbst war nicht asynchron. Die
 * Teilnehmerzeilen zeigen aber per Fremdschluessel auf die Gruppe. Kam eine
 * Zeile vor der Gruppe an, lehnte die Datenbank sie ab, und `cacheInsert`
 * wiederholt nur bei Netzwerkfehlern. Ergebnis: Gruppe da, Teilnehmer weg.
 *
 * Eine Chatgruppe ohne Teilnehmer ist tot. Die Schreibregel verlangt, dass der
 * Absender Teilnehmer ist, also lehnt die Datenbank jede Nachricht darin ab.
 * Gemessen am 19.09.2026: sechs von zehn Kundenchats waren so zugrunde
 * gegangen, ohne dass irgendwo etwas aufgefallen waere.
 *
 * Interne Chats traf es genauso, sie heilten sich aber selbst: `ensureParticipant`
 * in ChatVerlauf traegt dort einen fehlenden Teilnehmer beim Schreiben nach.
 * Bei Kundenchats steigt dieselbe Funktion bewusst aus, weil dort nicht jeder
 * beitreten darf. Deshalb blieben genau sie liegen.
 */
export async function createChat(
  kundeId: string,
  kundeName: string,
  kundeStatus: string,
  erstelltVon: string,
  typ: ChatTyp = "intern",
  teilnehmerOverride?: ChatParticipant[],
  creatorUserId?: string,
): Promise<ChatData> {
  const realCreatorId = creatorUserId || "current";
  const creatorParticipant: ChatParticipant = { id: realCreatorId, name: erstelltVon, initials: getInitials(erstelltVon), role: "Vertriebspartner" };

  let defaultTeilnehmer: ChatParticipant[];
  if (teilnehmerOverride) {
    defaultTeilnehmer = teilnehmerOverride;
  } else {
    defaultTeilnehmer = [creatorParticipant];

    // Only auto-add the assigned VP if creator is NOT a VP (e.g. admin creating the chat)
    const allUsers = loadAllUsers();
    const userRoles = cacheGet("user_roles");
    const adminUserIds = new Set(
      userRoles
        .filter((r: any) => r.role === "admin" || r.role === "inhaber")
        .map((r: any) => r.user_id)
    );

    const kontaktRows = cacheGet("kontakte");
    const kontakt = kontaktRows.find((k: any) => k.id === kundeId);
    // Bewusst ueber die Rollen-Kennung (kleingeschrieben) statt ueber den
    // Anzeigenamen: der kann "Lead-Berater" lauten und ist keine eigene Rolle.
    const isNonVpCreator = adminUserIds.has(realCreatorId) || !allUsers.some(u => u.id === realCreatorId && (u.rolle || "").toLowerCase() === "vertriebspartner");
    if (isNonVpCreator && kontakt?.berater) {
      // Kennung zuerst; der Name nur ohne Kennung und nur bei genau einem Treffer.
      const vpKennung = kontakt.zustaendig_id || kennungZuName(kontakt.berater);
      const vpUser = allUsers.find(u => u.id === vpKennung && u.id !== realCreatorId);
      if (vpUser && !defaultTeilnehmer.some(t => t.id === vpUser.id)) {
        defaultTeilnehmer.push({
          id: vpUser.id,
          name: vpUser.name,
          initials: getInitials(vpUser.name),
          role: berufsbezeichnung("vertriebspartner"),
        });
      }
    }
    // For any non-admin creator (VP, Finanzierungspartner, etc.), auto-add all admins to internal chats
    if (!adminUserIds.has(realCreatorId) && typ === "intern") {
      const adminIds = userRoles
        .filter((r: any) => r.role === "admin" || r.role === "inhaber")
        .map((r: any) => r.user_id);
      for (const adminId of adminIds) {
        if (defaultTeilnehmer.some(t => t.id === adminId)) continue;
        const adminUser = allUsers.find(u => u.id === adminId);
        if (adminUser) {
          defaultTeilnehmer.push({
            id: adminUser.id,
            name: adminUser.name,
            initials: getInitials(adminUser.name),
            role: "Admin",
          });
        }
      }
    }
    // No other roles auto-added — users can manually invite admins, FP, OP, VP via the invite dialog
  }

  const newChat: ChatData = {
    id: crypto.randomUUID(),
    kundeId,
    kundeName,
    kundeStatus,
    erstelltVon,
    erstelltAm: new Date().toISOString(),
    typ,
    teilnehmer: defaultTeilnehmer,
    nachrichten: [],
    angepinnt: false,
    ungelesen: false,
    stummgeschaltet: false,
    archiviert: false,
  };

  if (isTestAccount()) {
    const chats = getChats();
    chats.unshift(newChat);
    saveChats(chats);
  } else {
    // Erst die Gruppe, dann die Teilnehmer. Die Reihenfolge ist keine
    // Geschmacksfrage, sondern der Fremdschluessel, siehe oben.
    await cacheInsert("chat_gruppen", {
      id: newChat.id,
      name: kundeName,
      typ,
      erstellt_von: realCreatorId,
      erstellt_am: newChat.erstelltAm,
      meta: { kundeId, kundeStatus, erstelltVon, typ, angepinnt: false, ungelesen: false, stummgeschaltet: false, archiviert: false },
    });
    await chatTeilnehmerEintragen(newChat.id, newChat.teilnehmer);
  }
  return newChat;
}

export function updateChat(chat: ChatData) {
  if (isTestAccount()) {
    const chats = getChats().map(c => c.id === chat.id ? chat : c);
    saveChats(chats);
  } else {
    cacheUpdate("chat_gruppen", chat.id, {
      name: chat.kundeName,
      typ: chat.typ,
      meta: { kundeId: chat.kundeId, kundeStatus: chat.kundeStatus, erstelltVon: chat.erstelltVon, typ: chat.typ, angepinnt: chat.angepinnt, ungelesen: chat.ungelesen, stummgeschaltet: chat.stummgeschaltet, archiviert: chat.archiviert },
    });
  }
}

export function deleteChat(chatId: string) {
  if (isTestAccount()) {
    const chats = getChats().filter(c => c.id !== chatId);
    saveChats(chats);
  } else {
    cacheDelete("chat_gruppen", chatId);
  }
}

export async function addMessage(chatId: string, msg: Omit<ChatMessage, "id" | "chatId" | "timestamp">, realUserId?: string): Promise<ChatMessage> {
  const newMsg: ChatMessage = {
    ...msg,
    id: crypto.randomUUID(),
    chatId,
    timestamp: new Date().toISOString(),
  };

  if (isTestAccount()) {
    const chats = getChats();
    const chat = chats.find(c => c.id === chatId);
    if (!chat) throw new Error("Chat not found");
    chat.nachrichten.push(newMsg);
    saveChats(chats);
  } else {
    // For system messages, use the real user ID for RLS compliance but mark as system in meta
    const dbSenderId = msg.senderId === "system" ? (realUserId || msg.senderId) : msg.senderId;
    await cacheInsert("chat_nachrichten", {
      id: newMsg.id,
      chat_id: chatId,
      absender_id: dbSenderId,
      inhalt: msg.text,
      gesendet_am: newMsg.timestamp,
      gelesen: false,
      gelesen_von: [],
      meta: { senderName: msg.senderName, senderInitials: msg.senderInitials, fileUrl: msg.fileUrl, fileName: msg.fileName, vorschauUrl: msg.vorschauUrl, isSystem: msg.senderId === "system" },
    });
  }
  return newMsg;
}

/** Count total unread messages across all chats for a given user */
export function getUnreadChatCount(userId: string): number {
  if (isTestAccount()) return 0;
  const allNachrichten = cacheGet("chat_nachrichten");
  const allTeilnehmer = cacheGet("chat_teilnehmer");
  
  // Find all chat IDs where user is a participant
  const myChatIds = new Set(
    allTeilnehmer
      .filter((t: any) => t.benutzer_id === userId)
      .map((t: any) => t.chat_id)
  );
  
  // Count messages in those chats that are NOT from this user and NOT read by this user
  let count = 0;
  for (const msg of allNachrichten) {
    if (!myChatIds.has(msg.chat_id)) continue;
    if (msg.absender_id === userId) continue;
    const gelesenVon: string[] = msg.gelesen_von || [];
    if (!gelesenVon.includes(userId)) count++;
  }
  return count;
}

/** Get unread message count for a specific chat for a user */
export function getUnreadChatCountForChat(chatId: string, userId: string): number {
  if (isTestAccount()) return 0;
  const allNachrichten = cacheGet("chat_nachrichten");
  let count = 0;
  for (const msg of allNachrichten) {
    if (msg.chat_id !== chatId) continue;
    if (msg.absender_id === userId) continue;
    const gelesenVon: string[] = msg.gelesen_von || [];
    if (!gelesenVon.includes(userId)) count++;
  }
  return count;
}

/**
 * Ungelesene Nachrichten beider Verläufe eines Kunden zusammen.
 *
 * Für den Zähler am Reiter "Kommunikation" im Kundenprofil. Gezählt werden
 * einzelne Nachrichten und nicht Chats, so wie die Seitenleiste es auch tut.
 *
 * Bewusst direkt über die Zeilen des Zwischenspeichers statt über `getChats`:
 * Der Zähler steht in jedem Rendern des Kundenprofils, und `getChats` baut
 * jedes Mal sämtliche Chats des Systems samt Nachrichten neu zusammen.
 *
 * Gezählt werden dieselben zwei Bauarten, die der Reiter auch zeigt, also der
 * interne Chat und die Kundenkommunikation zu diesem Kontakt. Tippgeber-Chats
 * bleiben draußen, sie gehören nicht in dieses Profil.
 */
export function getUnreadChatCountForKunde(kundeId: string, userId: string): number {
  if (isTestAccount()) return 0;
  if (!kundeId || !userId || userId === "current") return 0;

  /*
   * Je Art genau EINE Gruppe zaehlen, und zwar dieselbe, die der Reiter
   * "Kommunikation" auch anzeigt: die aelteste.
   *
   * Vorher zaehlte diese Funktion ueber ALLE Gruppen des Kunden, waehrend die
   * Anzeige darunter nur eine nahm. Bei Otto Hans stand deshalb am 19.09.2026
   * die Zahl 2 am Reiter, der Verlauf darunter war leer, und die Zahl ging
   * nie wieder weg: Man kann eine Nachricht nicht lesen, die einem gar nicht
   * gezeigt wird.
   *
   * Dass es mehrere geben kann, ist Altbestand und mit der Migration
   * 20260919160000 aufgeraeumt. Die Regel bleibt trotzdem stehen: Zwei
   * Zaehler ueber verschiedene Mengen sind ein Widerspruch, der beim naechsten
   * Mal genauso unbemerkt auftritt.
   */
  const aelteste = new Map<string, { id: string; erstellt: string }>();
  for (const row of (cacheGet<any>("chat_gruppen") || []) as any[]) {
    const meta = row.meta || {};
    if (meta.kundeId !== kundeId) continue;
    if (meta.kind) continue;
    const typ = row.typ || meta.typ;
    if (typ !== "intern" && typ !== "kundenkommunikation") continue;
    const erstellt = String(row.erstellt_am || "");
    const bisher = aelteste.get(typ);
    if (!bisher || erstellt < bisher.erstellt) aelteste.set(typ, { id: row.id, erstellt });
  }
  const chatIds = new Set<string>([...aelteste.values()].map((g) => g.id));
  if (chatIds.size === 0) return 0;

  let count = 0;
  for (const msg of (cacheGet<any>("chat_nachrichten") || []) as any[]) {
    if (!chatIds.has(msg.chat_id)) continue;
    if (msg.absender_id === userId) continue;
    if ((msg.gelesen_von || []).includes(userId)) continue;
    count++;
  }
  return count;
}

/** Mark all messages in a chat as read for a user */
export async function markChatAsRead(chatId: string, userId: string, userName: string) {
  if (isTestAccount()) return;
  const allNachrichten = cacheGet("chat_nachrichten");
  const unread = allNachrichten.filter((msg: any) => {
    if (msg.chat_id !== chatId) return false;
    if (msg.absender_id === userId) return false;
    const gelesenVon: string[] = msg.gelesen_von || [];
    return !gelesenVon.includes(userId);
  });
  
  const { supabase: sb } = await import("@/integrations/supabase/client");
  for (const msg of unread) {
    const newGelesenVon = [...(msg.gelesen_von || []), userId];
    msg.gelesen_von = newGelesenVon; // optimistic update in cache
    sb.from("chat_nachrichten")
      .update({ gelesen_von: newGelesenVon } as any)
      .eq("id", msg.id)
      .then(() => {});
  }
}

/**
 * Einen Chat wieder auf ungelesen setzen.
 *
 * Der übliche Fall: Man öffnet einen Chat zwischendurch, kann aber gerade
 * nicht antworten und will ihn nicht aus den Augen verlieren. Dafür wird die
 * eigene Lesebestätigung von der letzten fremden Nachricht entfernt, sodass
 * der Chat wieder als ungelesen gilt.
 */
export async function markChatAsUnread(chatId: string, userId: string) {
  if (isTestAccount()) return;
  const allNachrichten = cacheGet("chat_nachrichten");
  const fremde = allNachrichten
    .filter((msg: any) => msg.chat_id === chatId && msg.absender_id !== userId)
    .sort((a: any, b: any) => String(a.gesendet_am).localeCompare(String(b.gesendet_am)));
  const letzte = fremde[fremde.length - 1];
  if (!letzte) return;

  const neu = (letzte.gelesen_von || []).filter((id: string) => id !== userId);
  letzte.gelesen_von = neu; // optimistisch im Zwischenspeicher
  const { supabase: sb } = await import("@/integrations/supabase/client");
  await sb.from("chat_nachrichten").update({ gelesen_von: neu } as any).eq("id", letzte.id);
}

export function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}
