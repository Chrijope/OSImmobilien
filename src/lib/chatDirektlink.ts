/**
 * Der Weg direkt in einen bestimmten Chat.
 *
 * `/chat?id=<Kennung>` oeffnet auf der Chatseite genau diesen Chat, siehe
 * `paramChatId` in `pages/Chat.tsx`. Auf diese Adresse zeigen die Glocke und
 * der Knopf „Zum Chat“ in der Mail. Die Mail baut dieselbe Adresse in der
 * Edge Function `chat-benachrichtigung` (`_shared/chat-empfaenger.ts`).
 */

export const CHAT_PFAD = "/chat";

/**
 * Wohin die App einen Nicht-Angemeldeten schickt.
 *
 * Wer aus der Mail auf „Zum Chat“ klickt und nicht angemeldet ist, landete
 * bisher auf `/login` ohne Ziel und nach der Anmeldung auf der Startseite. Der
 * Chat war weg. Fuer die Chatseite wird die Adresse deshalb als `redirect`
 * mitgegeben; `Login.tsx` laesst nur interne Pfade zu und springt nach der
 * Anmeldung dorthin.
 *
 * Bewusst nur fuer den Chat: Fuer alle anderen Seiten bleibt es beim
 * bisherigen Verhalten, dort stellt `LastRouteMemory` die letzte Seite her.
 */
export function loginZielFuer(pathname: string, search: string): string {
  const istChat = pathname === CHAT_PFAD || pathname.startsWith(CHAT_PFAD + "/");
  if (!istChat) return "/login";
  return `/login?redirect=${encodeURIComponent(pathname + (search || ""))}`;
}
