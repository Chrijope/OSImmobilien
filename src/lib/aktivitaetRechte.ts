/**
 * Wer im Verlauf eines Kunden was bearbeiten und entfernen darf.
 *
 * Die Regeln standen bisher mitten in `KundenDetail.tsx` und liessen sich
 * deshalb nicht pruefen. Hier stehen sie einmal, als reine Funktionen, und
 * `src/lib/aktivitaetRechte.test.ts` haelt sie fest.
 *
 * Wichtig: Das hier entscheidet nur, was die Oberflaeche anbietet.
 * Massgeblich bleibt die Zeilensicherheit der Datenbank. Die Regeln sind
 * bewusst so geschnitten, dass sie nicht mehr anbieten, als die Datenbank
 * zulaesst:
 *
 * - `aktivitaeten` UPDATE: jede interne Rolle an den fuer sie sichtbaren
 *   Kunden ("Interne bearbeiten Aktivitaeten (scoped)").
 * - `aktivitaeten` DELETE: die Leitung an allen Eintraegen, jede andere
 *   interne Rolle nur an den selbst geschriebenen
 *   (Migration 20260916240000).
 * - `aufgaben` UPDATE: Ersteller und Empfaenger, dazu die Leitung.
 */
import type { AktivitaetEntry } from "./aktivitaetenStore";
import { istInterneRolle } from "./sidebarPermissions";

/** Wer im Verlauf auch fremde Eintraege anfassen darf. */
export const LEITUNG_ROLLEN = ["admin", "inhaber", "vertriebsleiter"] as const;

/** Wer eine fremde Aufgabe oder einen fremden Termin bearbeiten darf. */
const BEARBEITEN_ROLLEN = ["admin", "inhaber"] as const;

/** Der angemeldete Nutzer, soweit die Regeln ihn brauchen. */
export interface Rechtekontext {
  rolle: string;
  /** Kennung aus der Anmeldung. Leer, solange sie noch nicht geladen ist. */
  benutzerId?: string;
  /** Anzeigename, Rueckfall fuer Altbestand ohne Kennung am Eintrag. */
  name?: string;
}

/**
 * Was die Anwendung selbst geschrieben hat.
 *
 * Zwei Quellen: das zentrale Protokoll (`activity_log`, erkennbar am Praefix
 * "log-") und die Eintraege, die der Code beim Stufenwechsel unter dem Namen
 * "System" anlegt. Beide tragen intern die Art "notiz", weil es fuer
 * Dokument- und Datenaenderungen keine eigene gibt. Ohne diese Unterscheidung
 * waere die Notizenliste voll davon.
 */
export function istSystemEintrag(a: Pick<AktivitaetEntry, "id" | "von">): boolean {
  return a.id.startsWith("log-") || (a.von || "").trim().toLowerCase() === "system";
}

/**
 * Hat der angemeldete Nutzer diesen Eintrag selbst geschrieben?
 *
 * Neue Eintraege tragen die Kennung des Verfassers (`benutzer_id`). Der
 * Altbestand hat sie nicht, dort entscheidet ersatzweise der eingetragene
 * Name. Ohne Kennung und ohne Namen ist die Antwort nein, nicht ja: Ein
 * leerer Vergleich darf kein Recht begruenden.
 */
export function istEigenerEintrag(
  a: Pick<AktivitaetEntry, "von" | "benutzerId">,
  ctx: Rechtekontext,
): boolean {
  if (a.benutzerId) return !!ctx.benutzerId && a.benutzerId === ctx.benutzerId;
  const name = (ctx.name || "").trim();
  return !!name && (a.von || "").trim() === name;
}

/**
 * Wer eine Aufgabe oder einen Termin aus dem Verlauf nachtraeglich aendern
 * darf: der Ersteller sowie Admin und Inhaber.
 *
 * Systemeintraege bleiben fuer alle unveraenderlich, sonst stimmt die
 * Historie nicht mehr.
 */
export function darfVorgangBearbeiten(
  a: Pick<AktivitaetEntry, "id" | "von" | "benutzerId">,
  ctx: Rechtekontext,
): boolean {
  if (istSystemEintrag(a)) return false;
  if ((BEARBEITEN_ROLLEN as readonly string[]).includes(ctx.rolle)) return true;
  return istEigenerEintrag(a, ctx);
}

/**
 * Wer einen Eintrag aus dem Verlauf entfernen darf.
 *
 * Bis zum 16.09.2026 war das allein die Leitung. Christian hat an diesem Tag
 * entschieden, dass auch der Vertriebspartner den Papierkorb bekommt. Der
 * Grund der alten Regel bleibt aber gueltig: Der Verlauf ist oft der einzige
 * Nachweis darueber, was mit einem Kunden besprochen wurde. Deshalb der
 * engste Schnitt, der Christians Wunsch erfuellt:
 *
 * - Die Leitung entfernt wie bisher jeden Eintrag.
 * - Jede andere interne Rolle entfernt nur, was sie selbst geschrieben hat.
 * - Systemeintraege entfernt ausser der Leitung niemand, Protokollzeilen
 *   ("log-") niemand, auch die Leitung nicht. Das faengt die Anzeige mit dem
 *   Schloss ab, und die Datenbank kennt fuer `activity_log` gar keine
 *   Loeschregel.
 *
 * Anders als beim Bearbeiten zaehlt hier ausschliesslich die Kennung, nicht
 * der Name: Die Loeschregel der Datenbank (20260916240000) vergleicht
 * `benutzer_id` mit `auth.uid()`. Ein Altbestandseintrag ohne Kennung bekaeme
 * mit dem Namensrueckfall einen Papierkorb, den die Datenbank anschliessend
 * ablehnt. Ein Knopf, der verlaesslich scheitert, ist schlimmer als keiner.
 */
export function darfEintragEntfernen(
  a: Pick<AktivitaetEntry, "id" | "von" | "benutzerId">,
  ctx: Rechtekontext,
): boolean {
  if (a.id.startsWith("log-")) return false;
  if ((LEITUNG_ROLLEN as readonly string[]).includes(ctx.rolle)) return true;
  if (istSystemEintrag(a)) return false;
  return !!ctx.benutzerId && a.benutzerId === ctx.benutzerId;
}

/**
 * Wer eine von Hand geschriebene Notiz bearbeiten und anpinnen darf.
 *
 * Stift und Stern teilen sich diese eine Regel (Auftrag vom 28.09.2026:
 * anpinnen darf, wer auch bearbeiten darf). Sie bildet die Update-Regel der
 * Datenbank ab, "Interne bearbeiten Aktivitaeten (scoped)": jede interne
 * Rolle an den Kunden, die sie sieht. Ob sie den Kunden sieht, ist hier schon
 * entschieden, sonst stuende die Notiz gar nicht auf dem Schirm.
 */
export function darfNotizBearbeiten(
  a: Pick<AktivitaetEntry, "id" | "von" | "art">,
  ctx: Rechtekontext,
): boolean {
  return a.art === "notiz" && !istSystemEintrag(a) && istInterneRolle(ctx.rolle);
}
