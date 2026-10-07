/**
 * Wer bei einer Chatnachricht Glocke und Mail bekommt, und was darin steht.
 *
 * Reine Logik ohne Datenbank, damit sie unter `src/lib/chatEmpfaenger.test.ts`
 * mit Vitest pruefbar ist. Die Edge Function `chat-benachrichtigung` liest die
 * Zeilen und ruft diese Funktionen auf.
 *
 * Christian am 25.09.2026: Jeder Empfaenger im CRM bekommt bei jeder
 * Chatnachricht eine Glocke und eine Mail mit einem Knopf direkt in den Chat.
 * Das hebt die Vorgabe vom 19.09.2026 auf, nach der interne Nutzer keine
 * Glocke mehr bekamen: Der Chat stand fuer Vertriebspartner gar nicht in der
 * Seitenleiste, und die Mail an sie kam nie an.
 *
 * Kunden sind hier bewusst ausgenommen. Sie bekommen Glocke und Mail weiterhin
 * aus dem CRM heraus, in ihrer Sprache und mit dem Link ins Kundenportal
 * (`components/chat/ChatVerlauf.tsx`). Doppelt soll niemand benachrichtigt
 * werden.
 */

/** Kuerzung des Auszugs in der Glocke. */
export const GLOCKE_AUSZUG_ZEICHEN = 80;
/** Kuerzung des Auszugs in der Mail, wie `src/lib/chatBenachrichtigung.ts`. */
export const MAIL_AUSZUG_ZEICHEN = 200;

export interface ChatEmpfaenger {
  id: string;
  /** Tippgeber haben keine Chatseite, ihr Chat liegt in ihrem Portal. */
  istTippgeber: boolean;
}

/**
 * Die Empfaenger einer Nachricht.
 *
 * Alle Teilnehmer ausser dem Absender und ausser Kunden. Als Kunde gilt, wer
 * ausschliesslich die Rolle `kunde` traegt, dieselbe Regel wie in
 * `ChatVerlauf.tsx`. Wer gar keine Rolle hat, ist kein Nutzer des CRM mehr und
 * bekommt nichts. Jede Kennung hoechstens einmal, auch wenn sie doppelt in den
 * Teilnehmern steht.
 */
export function chatEmpfaengerErmitteln(
  absenderId: string,
  teilnehmerIds: ReadonlyArray<string | null | undefined>,
  rollenJeNutzer: ReadonlyMap<string, ReadonlyArray<string>>,
): ChatEmpfaenger[] {
  const gesehen = new Set<string>();
  const ergebnis: ChatEmpfaenger[] = [];
  for (const id of teilnehmerIds) {
    if (!id || id === absenderId || gesehen.has(id)) continue;
    gesehen.add(id);
    const rollen = rollenJeNutzer.get(id) || [];
    if (rollen.length === 0) continue;
    if (rollen.every((r) => r === "kunde")) continue;
    ergebnis.push({ id, istTippgeber: rollen.every((r) => r === "tippgeber") });
  }
  return ergebnis;
}

/**
 * Wohin Glocke und Mail fuehren.
 *
 * Fuer alle im CRM direkt in diesen Chat, `/chat?id=<Kennung>`. Die Chatseite
 * oeffnet ihn sofort, auf dem Telefon ebenso. Das gilt auch fuer Kundenchats:
 * Der Weg ueber das Kundenprofil braeuchte die Kennung des Kontakts, und die
 * fehlt an Chats, die die Datenbank selbst anlegt (`kundenchat_starten`).
 *
 * Tippgeber werden vom CRM in ihr Portal umgeleitet, dort liegt ihr Chat.
 */
export function chatZiel(chatId: string, empfaenger: Pick<ChatEmpfaenger, "istTippgeber">): string {
  if (empfaenger.istTippgeber) return "/tippgeber-portal?tab=chat";
  return `/chat?id=${encodeURIComponent(chatId)}`;
}

/** Die volle Adresse fuer die Mail, auf dem CRM unter portal.more.immo. */
export function chatZielAdresse(basis: string, pfad: string): string {
  return `${basis.trim().replace(/\/+$/, "")}${pfad}`;
}

export function auszug(text: string, zeichen: number): string {
  const sauber = String(text || "").trim();
  return sauber.length > zeichen ? sauber.slice(0, zeichen) + "…" : sauber;
}

/**
 * Wer mit @ angesprochen wurde.
 *
 * Dasselbe Muster wie `extractMentions` in `src/lib/notificationStore.ts`:
 * Vor- und Nachname hinter dem @. Verglichen wird ohne Gross- und
 * Kleinschreibung mit allen bekannten Namen eines Teilnehmers. Tragen zwei
 * Teilnehmer denselben Namen, sind beide gemeint, wie bisher im Browser.
 */
export function erwaehnteIds(
  text: string,
  namenJeNutzer: ReadonlyMap<string, ReadonlyArray<string>>,
): Set<string> {
  const muster = /@([A-Za-zÀ-ÿ]+\s[A-Za-zÀ-ÿ]+)/g;
  const genannt = new Set<string>();
  let treffer: RegExpExecArray | null;
  while ((treffer = muster.exec(String(text || ""))) !== null) {
    genannt.add(treffer[1].toLowerCase());
  }
  const ids = new Set<string>();
  if (genannt.size === 0) return ids;
  for (const [id, namen] of namenJeNutzer) {
    if (namen.some((n) => genannt.has(String(n || "").trim().toLowerCase()))) ids.add(id);
  }
  return ids;
}

export interface GlockenZeile {
  benutzer_id: string;
  titel: string;
  nachricht: string;
  link: string;
  meta: Record<string, unknown>;
}

/**
 * Eine Glocke je Nachricht und Empfaenger.
 *
 * Wer mit @ angesprochen wurde, bekommt statt der gewoehnlichen Meldung die
 * Erwaehnung, nicht beides. Sie steht im Format, das
 * `src/lib/notificationStore.ts` fuer Erwaehnungen liest (`notif_type`
 * "mention" mit `payload`), damit die Glocke sie wie bisher anzeigt.
 *
 * Die gewoehnliche Meldung traegt `notif_type` "chat_nachricht". Daran
 * erkennt die Glocke im CRM, dass sie diese Zeile zeigen soll; aeltere
 * Chatzeilen ohne diese Kennung blendet sie weiterhin aus.
 */
export function glockenZeile(angaben: {
  empfaenger: ChatEmpfaenger;
  chatId: string;
  chatName: string;
  nachrichtId: string;
  absenderId: string;
  absenderName: string;
  empfaengerName: string;
  text: string;
  erwaehnt: boolean;
}): GlockenZeile {
  const link = chatZiel(angaben.chatId, angaben.empfaenger);
  const kurz = auszug(angaben.text, GLOCKE_AUSZUG_ZEICHEN);
  const absender = angaben.absenderName || "Jemand";

  if (angaben.erwaehnt && !angaben.empfaenger.istTippgeber) {
    return {
      benutzer_id: angaben.empfaenger.id,
      titel: `@Erwähnung von ${absender}`,
      nachricht: kurz,
      link,
      meta: {
        notif_type: "mention",
        chatId: angaben.chatId,
        nachrichtId: angaben.nachrichtId,
        payload: {
          chatId: angaben.chatId,
          chatName: angaben.chatName,
          mentionedId: angaben.empfaenger.id,
          mentionedName: angaben.empfaengerName,
          mentionedById: angaben.absenderId,
          mentionedByName: absender,
          messageText: kurz,
        },
      },
    };
  }

  const imChat = angaben.chatName && angaben.chatName !== absender ? `${angaben.chatName}: ` : "";
  return {
    benutzer_id: angaben.empfaenger.id,
    titel: `Neue Nachricht von ${absender}`,
    nachricht: `${imChat}${kurz}`,
    link,
    meta: {
      notif_type: "chat_nachricht",
      chatId: angaben.chatId,
      nachrichtId: angaben.nachrichtId,
    },
  };
}

/**
 * Die Angaben fuer die Vorlage `chat-nachricht`.
 *
 * `kundeName` ist in dieser Vorlage der EMPFAENGER und steht in der Anrede,
 * `beraterName` der ABSENDER, siehe `src/lib/chatBenachrichtigung.ts`.
 * `anPartner` heisst: Die Mail geht an jemanden im CRM, bleibt deutsch, hat
 * keinen Unterschriftsblock und fuehrt mit „Zum Chat“ in den Chat.
 */
export function chatMailDaten(angaben: {
  empfaengerName: string;
  absenderName: string;
  chatName: string;
  text: string;
  /** Das Ziel des Knopfs „Zum Chat“, die volle Adresse. */
  portalUrl: string;
}): Record<string, unknown> {
  return {
    kundeName: angaben.empfaengerName,
    beraterName: angaben.absenderName,
    chatName: angaben.chatName,
    nachrichtVorschau: auszug(angaben.text, MAIL_AUSZUG_ZEICHEN),
    portalUrl: angaben.portalUrl,
    anPartner: true,
  };
}

/** Ein Schluessel je Nachricht und Empfaenger, damit keine Mail doppelt geht. */
export function chatMailSchluessel(nachrichtId: string, empfaengerId: string): string {
  return `chat-nachricht-${nachrichtId}-${empfaengerId}`;
}
