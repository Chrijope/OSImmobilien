/**
 * Wer darf einen Lead von einem Vertriebspartner an einen anderen übergeben?
 *
 * Zwei verschiedene Fragen, und sie werden hier getrennt beantwortet:
 *
 *  1. Wer darf JEDEN Lead JEDEM geben? Das ist die Leitung.
 *  2. Wer darf einen BESTIMMTEN Lead weitergeben? Das ist die Leitung, und
 *     seit dem 18.09.2026 zusätzlich der Vertriebspartner, der für genau
 *     diesen Lead selbst zuständig ist.
 *
 * Warum es die zweite Frage überhaupt braucht, obwohl ein Partner ohnehin nur
 * seine eigene Liste sieht: Seine Liste ist etwas weiter als „mir zugewiesen“.
 * In ihr stehen auch Kontakte, die er einmal selbst angelegt hat oder als
 * Empfehlungsgeber gemeldet hat, und die Leads der Person, die er gerade
 * vertritt. Die gehören ihm nicht, und weitergeben kann er sie nicht. Ohne
 * diese Prüfung bekäme er statt einer Erklärung eine rohe Fehlermeldung aus
 * der Datenbank.
 *
 * Das hier entscheidet nur, was die Oberfläche anbietet. Maßgeblich ist die
 * Datenbank, und dort steht dieselbe Regel: Der Trigger
 * `kontakt_zustaendigkeit_schuetzen` aus der Migration
 * `20260918130000_lead_uebergabe_nur_vom_zustaendigen.sql` lässt einen
 * Vertriebspartner die Zuständigkeit nur verschieben, wenn er selbst der
 * bisherige Zuständige ist. Dieselbe Migration gibt der Policy
 * "Vertriebspartner bearbeiten eigene Kontakte" ein eigenes WITH CHECK, ohne
 * das die Abgabe gar nicht erst durchginge.
 *
 * Solange diese Migration in Supabase noch nicht gelaufen ist, lehnt die
 * Zeilensicherheit die Abgabe ab. Die Oberfläche stürzt deswegen nicht ab,
 * sie meldet den Fehler.
 */
import type { KundeData } from "@/lib/kundenStore";

/** Wer jeden Lead jedem geben darf. Spiegelt `public.darf_leads_zuweisen`. */
export const ZUWEISEN_ROLLEN = ["admin", "inhaber", "vertriebsleiter"] as const;

/** Darf diese Rolle jeden Lead jedem zuweisen? */
export function darfLeadsZuweisen(rolle?: string | null): boolean {
  return (ZUWEISEN_ROLLEN as readonly string[]).includes((rolle || "").trim());
}

/**
 * Bekommt diese Rolle die Übergabe überhaupt angeboten?
 *
 * Der Vertriebspartner sieht den Knopf, darf ihn aber nur für seine eigenen
 * Leads benutzen. Das entscheidet `darfKontaktWeitergeben` je Zeile.
 */
export function darfUebergabeSehen(rolle?: string | null): boolean {
  const r = (rolle || "").trim();
  return darfLeadsZuweisen(r) || r === "vertriebspartner";
}

/**
 * Bekommt diese Rolle „An die Zentrale zurückgeben (offener Pool)“ angeboten?
 *
 * Der Vertriebspartner fuer seine eigenen Leads (seit 21.09.2026), der
 * Vertriebsleiter seit dem 28.09.2026 zusaetzlich zu „Vertriebspartner
 * zuweisen“, fuer genau dieselben Kontakte. Seine Rechte wachsen dabei nicht:
 * Die Regel "Admin und interne Rollen bearbeiten Kontakte" laesst ihn jede
 * Zustaendigkeit aendern, auch auf NULL, und der Trigger
 * `kontakt_zustaendigkeit_schuetzen` behandelt Pool und Zuweisung fuer ihn
 * gleich (nur die Vertretungssperre greift, in beiden Faellen). Admin und
 * Inhaber verteilen selbst und bekommen den Weg nicht angeboten.
 */
export function darfAnZentraleZurueckgeben(rolle?: string | null): boolean {
  const r = (rolle || "").trim();
  return r === "vertriebspartner" || r === "vertriebsleiter";
}

/** Der angemeldete Nutzer, soweit die Regel ihn braucht. */
export interface ZuweisungsKontext {
  rolle?: string | null;
  /** Kennung aus der Anmeldung. Ohne sie ist keine Übergabe möglich. */
  benutzerId?: string | null;
}

/**
 * Darf dieser Nutzer genau diesen Lead weitergeben?
 *
 * Für den Vertriebspartner zählt allein die eingetragene Zuständigkeit. Nicht
 * gezählt wird bewusst:
 *
 *  - wer den Lead einmal angelegt hat (`erstelltVonId`). Er steht deswegen
 *    noch in der Liste, zuständig ist aber der Kollege.
 *  - wer gerade vertritt. Eine Vertretung soll aushelfen, nicht umhängen, an
 *    der Zuständigkeit hängt die Provision.
 *  - der Freitext `berater`. Er ist nur die Anzeige, die Sichtbarkeit hängt
 *    an `zustaendig_id`. Ein Namensvergleich wäre hier zu weich.
 */
export function darfKontaktWeitergeben(
  kontakt: Pick<KundeData, "zustaendig_id"> | null | undefined,
  { rolle, benutzerId }: ZuweisungsKontext,
): boolean {
  if (!kontakt) return false;
  if (darfLeadsZuweisen(rolle)) return true;
  if ((rolle || "").trim() !== "vertriebspartner") return false;

  const zustaendig = (kontakt.zustaendig_id || "").trim();
  const ich = (benutzerId || "").trim();
  return !!zustaendig && !!ich && zustaendig === ich;
}

/**
 * Die Meldung, wenn in einer Auswahl Leads stecken, die dem Nutzer nicht
 * gehören. Sie sagt, was zu tun ist, und nicht nur, dass etwas nicht geht.
 */
export const NUR_EIGENE_MELDUNG =
  "Weitergeben kannst du nur Leads, für die du selbst zuständig bist. Nimm die übrigen aus der Auswahl.";

/**
 * Wer darf einen weitergegebenen Lead überhaupt bekommen?
 *
 * Bis zum 18.09.2026 fragte das niemand. Geprüft wurde nur, ob der Abgebende
 * darf; wohin der Lead danach zeigt, war offen. Ein Partner konnte ihn damit
 * auf jedes Konto setzen, auch auf einen Bewerber oder die Buchhaltung. Dort
 * wäre er verschwunden: In der Lead-Verwaltung steht er nicht mehr, weil er
 * einen Zuständigen hat, und bearbeiten wird ihn dort niemand.
 *
 * Maßgeblich ist die Datenbank. Der Trigger `kontakt_zustaendigkeit_schuetzen`
 * aus `20260918140000_lead_uebergabe_nur_an_vertriebspartner.sql` lässt einen
 * Vertriebspartner die Zuständigkeit nur auf jemanden verschieben, der selbst
 * die Rolle vertriebspartner trägt. Hier steht dieselbe Regel, damit die
 * Auswahl gar nicht erst Namen anbietet, die die Datenbank ablehnt.
 *
 * Für die Leitung gilt sie nicht, weder hier noch dort: Admin, Inhaber und
 * Vertriebsleiter verteilen weiterhin an jeden.
 */
export const EMPFANGS_ROLLE = "vertriebspartner";

/** Trägt dieser Nutzer die Rolle, die ein weitergegebener Lead braucht? */
export function darfLeadUebernehmen(
  nutzer: { rolle?: string | null; rollen?: string[] | null } | null | undefined,
): boolean {
  if (!nutzer) return false;
  const rollen = nutzer.rollen?.length ? nutzer.rollen : nutzer.rolle ? [nutzer.rolle] : [];
  return rollen.some((r) => (r || "").trim() === EMPFANGS_ROLLE);
}

/**
 * Die Meldung, wenn das Ziel der Übergabe kein Vertriebspartner ist.
 * Sie nennt den Grund, damit niemand das Konto für gesperrt hält.
 */
export const NUR_AN_VERTRIEBSPARTNER_MELDUNG =
  "Weitergeben kannst du einen Lead nur an einen Vertriebspartner. Sonst würde ihn niemand weiterbearbeiten.";

/**
 * Teilt eine Auswahl in Leads, die dieser Nutzer weitergeben darf, und den Rest.
 *
 * Seit dem 28.09.2026 blockiert ein fremder Lead in der Auswahl nicht mehr die
 * ganze Rueckgabe. Wer „alle auswählen“ klickt, hat schnell einen Kontakt
 * dabei, den er nur sieht, weil er ihn einmal angelegt hat. Frueher war der
 * Knopf dann gesperrt; jetzt gehen die eigenen zurueck, und die Seite sagt,
 * wie viele uebersprungen wurden.
 */
export function teileNachWeitergabeRecht<T extends Pick<KundeData, "zustaendig_id">>(
  kontakte: T[],
  kontext: ZuweisungsKontext,
): { eigene: T[]; fremde: T[] } {
  const eigene: T[] = [];
  const fremde: T[] = [];
  for (const k of kontakte) (darfKontaktWeitergeben(k, kontext) ? eigene : fremde).push(k);
  return { eigene, fremde };
}

/**
 * Darf der Bestaetigungsknopf im Uebergabe-Dialog gedrueckt werden?
 *
 * Ein Ziel waehlt nur die Leitung aus. Der Vertriebspartner gibt an die
 * Zentrale zurueck und sieht gar keine Zielauswahl. Vom 21. bis 28.09.2026
 * verlangte der Knopf trotzdem ein Ziel und blieb fuer Partner damit immer
 * grau: Zurueckgeben ging nie.
 */
export function uebergabeBestaetigbar(angaben: {
  darfAlleZuweisen: boolean;
  ziel: string;
  gruendeVollstaendig: boolean;
  laeuft: boolean;
}): boolean {
  if (angaben.laeuft || !angaben.gruendeVollstaendig) return false;
  return !angaben.darfAlleZuweisen || !!angaben.ziel.trim();
}
