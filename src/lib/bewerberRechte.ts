import { hatBewerberprozessRolle } from "./bewerberprozessFreigabe";

/**
 * Wer darf Bewerber bearbeiten? Seit dem 27.09.2026 dieselben vier Rollen,
 * die den Bewerberprozess sehen (`BEWERBERPROZESS_ROLLEN`): hr, admin,
 * inhaber und backoffice. Die Regel gilt im Bewerberprozess und in der
 * Moderationsansicht gleich, deshalb steht sie an einer Stelle. Die
 * Datenbank erzwingt dasselbe über `darf_bewerberbereich`.
 */
export function kannBewerberVerwalten(role: string): boolean {
  return hatBewerberprozessRolle(role);
}

/**
 * Wer bekommt die laufenden Meldungen aus dem Bewerbermanagement zu sehen?
 *
 * Nur HR. Bearbeiten dürfen Inhaber und Admin weiterhin (siehe oben), aber
 * die Glocke, die Inbox-Einträge und die Zähler gehören der Person, die den
 * Prozess auch führt. Vorher hing das an der Admin-Rolle, dadurch standen in
 * der Inbox der Geschäftsführung ständig Bewerbernamen, mit denen sie nichts
 * zu tun hat. Eine Meldung, die einen nichts angeht, wird nach einer Woche
 * pauschal weggeklickt, und dann geht die nächste wichtige mit unter.
 *
 * Maßgeblich ist die **aktive** Rolle, so wie überall sonst im Projekt
 * (`user.role` aus dem UserContext). Wer HR zugewiesen hat, aber gerade in
 * einer anderen Rolle arbeitet, sieht die Einträge nicht; die Glocken selbst
 * werden davon unabhängig weiterhin an jede Person mit der HR-Rolle
 * geschrieben, dafür zählt `user_roles`.
 *
 * Bewusst keine persönliche Ausnahme: Die Freigabeliste des neuen
 * Bewerberprozesses (`bewerberprozessFreigabe.ts`) öffnet den Bereich, sie
 * bestellt keine Benachrichtigungen. Genau das ist der ausdrückliche Wunsch
 * der Geschäftsführung, die selbst auf dieser Liste steht.
 */
export function siehtBewerberMeldungen(role?: string | null): boolean {
  return (role || "").trim().toLowerCase() === "hr";
}

/**
 * Die interne Adresse des Bewerberprozesses.
 *
 * Bis zum 10.09.2026 waren es zwei, das Bewerbungsmanagement ist entfallen.
 * Bewusst ohne `/bewerber/…`: Das sind die Seiten der Bewerber selbst, ihre
 * eigenen Meldungen dürfen nicht verschwinden.
 */
const BEWERBER_BEREICHE = ["/bewerberprozess"];

/**
 * Führt diese Glocken-Meldung ins Bewerbermanagement?
 *
 * Gebraucht für die Glocke: Was vor dieser Umstellung an Admins geschrieben
 * wurde, liegt weiterhin in der Tabelle. Ohne diese Prüfung stünden die alten
 * Bewerbernamen dort noch monatelang. Das ist Aufräumen und keine
 * Zugriffskontrolle; die Zeilen selbst schützt weiterhin die
 * Zugriffskontrolle der Datenbank.
 */
export function istBewerberMeldung(link?: string | null): boolean {
  const ziel = (link || "").trim().toLowerCase();
  return BEWERBER_BEREICHE.some((b) => ziel.startsWith(b));
}
