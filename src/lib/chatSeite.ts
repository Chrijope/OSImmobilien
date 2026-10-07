/**
 * Wer steht im Chatverlauf links, wer rechts.
 *
 * Bis zum 26.09.2026 hing die Seite allein daran, ob eine Nachricht vom
 * angemeldeten Nutzer stammt. Liest Christian einen Kundenchat mit, in dem
 * Kunde und Partner schreiben, stand dadurch ALLES links, und man sah nicht,
 * wer Kunde und wer MOREImmo ist.
 *
 * Die Regel jetzt:
 *
 * - Chats mit einer Aussenseite (Kundenkommunikation, Tippgeber-Chat): Es gibt
 *   zwei Seiten, die Aussenseite (Kunde bzw. Tippgeber) und MOREImmo. Rechts
 *   steht immer die Seite, auf der der Lesende selbst sitzt. Im CRM liest
 *   MOREImmo, also stehen Partner, Admin und Backoffice rechts und der Kunde
 *   links, egal wer von ihnen gerade liest. Im Portal liest der Kunde, dort
 *   steht er rechts und MOREImmo links.
 * - Interne Chats (nur Mitarbeiter): eigene Nachrichten rechts, alle anderen
 *   links, wie bisher.
 *
 * Ob jemand zur Aussenseite gehoert, wird ausschliesslich ueber Kennungen und
 * Rollen ermittelt, nie ueber Namen. Namen koennen doppelt vorkommen, siehe
 * die zwei Konten mit demselben Namen.
 */

/** Minimaler Ausschnitt eines Chats, wie `ChatData` aus dem chatStore ihn hat. */
export interface ChatFuerSeite {
  typ?: string;
  kind?: string;
  kundeId?: string;
  erstelltVonId?: string;
  teilnehmer?: Array<{ id: string; role?: string }>;
  nachrichten?: Array<{ senderId: string }>;
}

export interface SeitenQuellen {
  /** Kontaktzeilen aus dem Cache, gebraucht wird `id` und `meta.authUserId`. */
  kontakte?: Array<{ id: string; meta?: any }>;
  /** Zeilen aus `user_roles`. */
  userRoles?: Array<{ user_id: string; role: string }>;
}

export type ChatArt = "kunde" | "tippgeber" | "intern";

/** Welche Bauart ein Chat hat. Massgeblich sind `typ` und `meta.kind`. */
export function chatArt(chat: Pick<ChatFuerSeite, "typ" | "kind">): ChatArt {
  if (chat.kind === "tippgeber_vp") return "tippgeber";
  if (chat.typ === "kundenkommunikation") return "kunde";
  return "intern";
}

/**
 * Die Kennungen der Aussenseite eines Chats.
 *
 * Gibt `null` zurueck, wenn der Chat keine Aussenseite hat (interner Chat).
 * Mehrere Quellen, weil nicht jede Rolle alles lesen darf: Ein Partner sieht
 * seinen Kontakt samt `meta.authUserId`, aber nicht unbedingt die Rollen
 * anderer Nutzer. Jede Quelle fuer sich reicht aus.
 */
export function aussenKennungen(chat: ChatFuerSeite, quellen: SeitenQuellen = {}): Set<string> | null {
  const art = chatArt(chat);
  if (art === "intern") return null;

  const aussenRolle = art === "kunde" ? "kunde" : "tippgeber";
  const aussenBezeichnung = art === "kunde" ? "Kunde" : "Tippgeber";
  const ids = new Set<string>();

  if (art === "kunde" && chat.kundeId) {
    const kontakt = (quellen.kontakte || []).find((k) => k.id === chat.kundeId);
    const erste = kontakt?.meta?.authUserId;
    const zweite = kontakt?.meta?.person2?.authUserId;
    if (erste) ids.add(String(erste));
    if (zweite) ids.add(String(zweite));
  }

  // Den Tippgeber-Chat legt die Datenbankfunktion immer mit dem Tippgeber als
  // Ersteller an (`get_or_create_tippgeber_vp_chat`, erstellt_von = auth.uid()).
  if (art === "tippgeber" && chat.erstelltVonId) ids.add(chat.erstelltVonId);

  // Rollenbezeichnung an der Teilnehmerzeile. Sie wird beim Anlegen aus der
  // Rolle gesetzt ("Kunde" im Kommunikationsreiter, "Tippgeber" in der
  // Datenbankfunktion) und ist damit eine Rolle, kein Name.
  for (const t of chat.teilnehmer || []) {
    if (t.role === aussenBezeichnung) ids.add(t.id);
  }

  // Rollen aus `user_roles`, auch fuer Absender, die den Chat verlassen haben.
  // Ein Kunde zaehlt nur, wenn er ausschliesslich die Kundenrolle traegt, so
  // wie bei der Benachrichtigung in ChatVerlauf. Sonst wuerde ein Mitarbeiter,
  // der zum Testen auch Kunde ist, auf die Kundenseite rutschen.
  const rollen = quellen.userRoles || [];
  if (rollen.length > 0) {
    const personen = new Set<string>();
    for (const t of chat.teilnehmer || []) personen.add(t.id);
    for (const n of chat.nachrichten || []) personen.add(n.senderId);
    for (const id of personen) {
      const eigene = rollen.filter((r) => r.user_id === id);
      if (eigene.length === 0) continue;
      const passt = aussenRolle === "kunde"
        ? eigene.every((r) => r.role === "kunde")
        : eigene.some((r) => r.role === "tippgeber");
      if (passt) ids.add(id);
    }
  }

  return ids;
}

/**
 * Steht diese Nachricht rechts?
 *
 * @param absenderId Kennung des Absenders der Nachricht.
 * @param eigeneId   Kennung des Lesenden. "current" steht fuer das Testkonto.
 * @param aussen     Ergebnis von `aussenKennungen`, `null` bei internen Chats.
 */
export function stehtRechts(
  absenderId: string,
  eigeneId: string | null | undefined,
  aussen: ReadonlySet<string> | null,
): boolean {
  const eigen = !!absenderId && (absenderId === eigeneId || absenderId === "current");
  if (eigen) return true;
  if (!aussen) return false;
  const leserAussen = !!eigeneId && aussen.has(eigeneId);
  const absenderAussen = aussen.has(absenderId);
  // Rechts steht, wer auf derselben Seite sitzt wie der Lesende.
  return leserAussen === absenderAussen;
}
