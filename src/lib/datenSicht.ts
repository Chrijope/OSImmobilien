// Wessen Zahlen sieht jemand?
//
// Die Frage stellte sich auf drei Seiten getrennt, mit drei verschiedenen
// Antworten: Statistiken kannte "darfAllesSehen", Auswertungen prüfte
// "isBackoffice" ohne den Vertriebsleiter, Abrechnungen wieder anders. Ein
// Vertriebsleiter sah deshalb je nach Seite alles, sein Team oder nur sich
// selbst. Hier steht die Regel einmal.
//
// Für Vertriebspartner gibt es nichts umzuschalten, sie sehen ausschliesslich
// die Zahlen ihrer eigenen Kunden. Führungskräfte wählen zwischen den eigenen
// Zahlen, dem Team und dem ganzen Haus.
//
// Seit dem 07.08.2026 beantwortet diese Datei zusätzlich die zweite Hälfte der
// Frage: nicht nur "ist diese Person Führungskraft", sondern auch "für wen".
// Die Rolle allein sagt das nicht. Ein Inhaber überblickt das ganze Haus, ein
// Vertriebsleiter genau sein Team. Vorher stand diese Unterscheidung an fünf
// Stellen im Code, an jeder etwas anders, und auf der Pipeline gar nicht: Dort
// galt nur Admin und Inhaber als Führung, der Vertriebsleiter sah bloss seine
// eigenen Leads.
//
// Das Gegenstück in der Datenbank sind `public.team_mitglieder` und
// `public.zustaendigkeitsbereich` aus `20260807160000_team_zuordnung.sql`. Sie
// lesen dieselben Quellen. Massgeblich für den Zugriff bleiben die Datenbank
// und ihre Prüfungen, die Funktionen hier bestimmen nur die Anzeige.

import { getJuniorsForRecruiter } from "./juniorOverrideLogic";
import { nameMehrdeutig } from "./beraterNamensabgleich";
import { istZustaendig } from "./kontaktOwnership";

export type Datensicht = "eigene" | "team" | "haus";

/** Wie weit reicht der Blick einer Rolle, wenn niemand etwas umstellt? */
export type Fuehrungsumfang = "eigene" | "team" | "haus";

/** Rollen, die das ganze Haus überblicken. */
const HAUS_ROLLEN = ["admin", "inhaber", "testaccount"];

/** Rollen, die ihr Team überblicken, aber nicht das ganze Haus. */
const TEAM_ROLLEN = ["vertriebsleiter"];

/**
 * Alle Rollen, die über die eigenen Zahlen hinaussehen.
 * Für Listen wie die Kachelauswahl auf dem Dashboard, damit auch dort nicht
 * wieder eine eigene Aufzählung entsteht.
 */
export const FUEHRUNGSROLLEN: string[] = [...HAUS_ROLLEN, ...TEAM_ROLLEN];

/** Rollen, die zusätzlich die Abrechnung des ganzen Hauses brauchen. */
const ABRECHNUNG_GESAMT = ["admin", "inhaber", "vertriebsleiter", "buchhaltung", "testaccount"];

/** Wie weit reicht der Blick dieser Rolle? */
export function fuehrungsumfang(rolle: string | undefined): Fuehrungsumfang {
  const r = String(rolle);
  if (HAUS_ROLLEN.includes(r)) return "haus";
  if (TEAM_ROLLEN.includes(r)) return "team";
  return "eigene";
}

export function istFuehrungskraft(rolle: string | undefined): boolean {
  return fuehrungsumfang(rolle) !== "eigene";
}

export function darfGesamtabrechnungSehen(rolle: string | undefined): boolean {
  return ABRECHNUNG_GESAMT.includes(String(rolle));
}

/**
 * Die Sicht, die für eine Rolle überhaupt möglich ist.
 * Wer nicht umschalten darf, bekommt immer "eigene".
 */
export function erlaubteSicht(rolle: string | undefined, gewuenscht: Datensicht): Datensicht {
  if (!istFuehrungskraft(rolle)) return "eigene";
  return gewuenscht;
}

/**
 * Die Team-Mitglieder dieser Person.
 *
 * Es gibt dafür genau eine Zuordnung im Browser, `getJuniorsForRecruiter`. Sie
 * liest `user_settings.teamleader_id` und die Werber-Zuordnung aus dem
 * Bewerbermanagement, also dieselben Quellen wie `public.team_mitglieder` in
 * der Datenbank. Hier wird sie nur weitergereicht, damit nicht jede Seite
 * wieder ihre eigene Schleife über den Zwischenspeicher baut.
 */
export function teamMitgliederIds(eigeneId: string | null | undefined): Set<string> {
  if (!eigeneId) return new Set<string>();
  try {
    return new Set(
      getJuniorsForRecruiter(eigeneId)
        .map((j) => j.userId)
        .filter((id): id is string => !!id),
    );
  } catch {
    // Der Zwischenspeicher ist noch leer. Dann eben kein Team, das ist
    // ehrlicher als eine geratene Liste.
    return new Set<string>();
  }
}

/**
 * Für wen: die Nutzer, deren Daten diese Person sehen darf.
 *
 * `null` heisst "keine Einschränkung", also das ganze Haus. Ein leeres Set
 * kommt nur vor, wenn die eigene Kennung fehlt, und bedeutet dann bewusst
 * "nichts" statt "alles".
 */
export function sichtbareNutzer(
  rolle: string | undefined,
  eigeneId: string | null | undefined,
  teamIds?: Iterable<string>,
): Set<string> | null {
  const umfang = fuehrungsumfang(rolle);
  if (umfang === "haus") return null;
  const ids = new Set<string>();
  if (eigeneId) ids.add(eigeneId);
  if (umfang === "team") {
    for (const id of teamIds || []) if (id) ids.add(id);
  }
  return ids;
}

export const SICHT_LABEL: Record<Datensicht, string> = {
  eigene: "Meine Zahlen",
  team: "Mein Team",
  haus: "Gesamtes Haus",
};

export const SICHT_ERKLAERUNG: Record<Datensicht, string> = {
  eigene: "Nur Kunden, für die du selbst zuständig bist.",
  team: "Du und die Partner, die dir zugeordnet sind.",
  haus: "Alle Kunden im Unternehmen.",
};

/**
 * Gehört ein Kontakt zur gewählten Sicht?
 *
 * Die Teamsicht lief bis heute über Beraternamen. `berater` ist ein
 * Freitextfeld: Stand dort nichts oder eine andere Schreibweise, fiel der Lead
 * aus der Teamsicht heraus, obwohl die Zuständigkeit sauber gesetzt war.
 * Massgeblich ist deshalb `zustaendig_id`. Der Name bleibt nur als
 * Rückfallebene für Altbestände ohne Kennung.
 *
 * @param kontakt      Datensatz mit `berater` und `zustaendig_id`
 * @param sicht        gewählte Sicht
 * @param eigenerName  Anzeigename des angemeldeten Nutzers
 * @param eigeneId     Nutzer-ID des angemeldeten Nutzers
 * @param team         Kennungen der zugeordneten Partner, dazu wahlweise ihre
 *                     Namen für Altbestände. Nur für die Teamsicht.
 */
export function gehoertZurSicht(
  kontakt: { berater?: string | null; zustaendig_id?: string | null },
  sicht: Datensicht,
  eigenerName: string,
  eigeneId: string,
  team?: { ids?: Set<string>; namen?: Set<string> },
): boolean {
  if (sicht === "haus") return true;
  // Kennung zuerst, der Name nur fuer Altbestand ohne Kennung und nur eindeutig.
  const eigen = istZustaendig(kontakt, { userName: eigenerName, userId: eigeneId });
  if (sicht === "eigene") return eigen;
  // Teamsicht: die eigenen Kunden plus die der zugeordneten Partner.
  if (eigen) return true;
  if (kontakt.zustaendig_id) return !!team?.ids?.has(kontakt.zustaendig_id);
  if (!kontakt.berater || !team?.namen?.has(kontakt.berater)) return false;
  // Gibt es den Namen mehrfach, ist nicht klar, ob der Teampartner gemeint ist.
  return !nameMehrdeutig(kontakt.berater);
}
