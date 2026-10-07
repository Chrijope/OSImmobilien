import type { KundeData } from "@/lib/kundenStore";
import { loadAllUsers, type SystemUser } from "@/lib/loadAllUsers";
import { kennungZuName, nameMehrdeutig, nameMeintNutzer, type BeraterProfil } from "@/lib/beraterNamensabgleich";

const TEAM_WIDE_ROLES = new Set(["inhaber", "admin", "vertriebsleiter", "backoffice", "finanzierungspartner"]);
const ADMIN_SCOPE_ROLES = new Set(["admin", "inhaber"]);

const normalizeName = (value?: string | null) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
type KontaktWithLegacyId = KundeData & { zustaendigId?: string };

export function isTeamWideKontaktRole(role?: string | null): boolean {
  return TEAM_WIDE_ROLES.has(role || "");
}

/**
 * Rollen, die eine 3-stufige Bucket-Differenzierung sehen sollen:
 * Eigen / Eigenes Team (Downline) / Team OS Immobilien (alles andere).
 */
export function isAdminScopeRole(role?: string | null): boolean {
  return ADMIN_SCOPE_ROLES.has(role || "");
}

export function resolveKontaktBerater(kontakt: KundeData, users?: SystemUser[]): string {
  const direct = (kontakt.berater || "").trim();
  if (direct) return direct;

  const zustaendigId = kontakt.zustaendig_id || (kontakt as KontaktWithLegacyId).zustaendigId;
  if (!zustaendigId) return "";

  const allUsers = users || loadAllUsers();
  return allUsers.find((u) => u.id === zustaendigId)?.name?.trim() || "";
}

/**
 * Gehört der Kontakt diesem Nutzer?
 *
 * Die Reihenfolge ist bewusst gewählt und war vorher eine andere:
 *
 * 1. Ist ein Zuständiger per ID gesetzt, entscheidet allein diese ID. Der
 *    Namensvergleich greift dann nicht mehr. Vorher konnte ein Kontakt, der
 *    längst an einen Kollegen übergeben war, beim alten Berater hängen
 *    bleiben, weil sein Name noch im Freitextfeld stand.
 * 2. Ohne Zuständigen zählt der Name im Feld `berater`. Das bleibt als
 *    Rückfallebene nötig, solange nicht überall eine ID gesetzt ist.
 * 3. Der Ersteller zählt nur, wenn weder ID noch Name jemanden benennen.
 *    Vorher blieb der Ersteller dauerhaft Miteigentümer, wodurch Setterin und
 *    Vertriebspartner dieselbe Aufgabe doppelt bekamen.
 */
export function kontaktBelongsToUser(
  kontakt: KundeData,
  { userName, userId }: { userName?: string | null; userId?: string | null },
): boolean {
  const zustaendigId = kontakt.zustaendig_id || (kontakt as KontaktWithLegacyId).zustaendigId;
  if (zustaendigId || normalizeName(kontakt.berater)) return istZustaendig(kontakt, { userName, userId });
  return !!userId && kontakt.erstelltVonId === userId;
}

/**
 * Ist diese Person fuer den Kontakt zustaendig? Ohne Ersteller-Rueckfall.
 *
 * Die Kennung `zustaendig_id` entscheidet allein, sobald sie gesetzt ist. Nur
 * alte Kontakte ohne Kennung werden ueber den Freitext `berater` zugeordnet,
 * und auch das nur, wenn der Name unter allen Nutzern genau einmal vorkommt.
 * Zwei Gleichnamige bekommen den Kontakt beide nicht, statt dass einer ihn
 * zufaellig erbt. Fuer Provision, Abrechnung und Statistik, wo der Ersteller
 * nicht mitzaehlen darf.
 */
export function istZustaendig(
  kontakt: { berater?: string | null; zustaendig_id?: string | null },
  { userName, userId }: { userName?: string | null; userId?: string | null },
  nutzer?: BeraterProfil[],
): boolean {
  const zustaendigId = kontakt.zustaendig_id || (kontakt as KontaktWithLegacyId).zustaendigId;
  if (zustaendigId) {
    // Die Kennung bleibt massgeblich, an ihr haengen auch die Zeilenrechte.
    // Passt der Name nicht dazu, wird nicht umgedeutet, sondern gewarnt.
    if (nutzer) warneBeiWiderspruch(zustaendigId, kontakt.berater, nutzer);
    return !!userId && zustaendigId === userId;
  }
  return nameMeintNutzer(kontakt.berater, { userName, userId }, nutzer);
}

const gewarnt = new Set<string>();
/** Einmal je Paar: zustaendig_id zeigt auf jemanden, der anders heisst als `berater`. */
function warneBeiWiderspruch(zustaendigId: string, berater: string | null | undefined, nutzer: BeraterProfil[]): void {
  const name = normalizeName(berater);
  const dahinter = nutzer.find((u) => u.id === zustaendigId);
  if (!name || !dahinter || normalizeName(dahinter.name) === name) return;
  const schluessel = `${zustaendigId}|${name}`;
  if (gewarnt.has(schluessel)) return;
  gewarnt.add(schluessel);
  console.warn("Zustaendigkeit und Beratername passen nicht zusammen. Es zaehlt die Zustaendigkeit, bitte den Kontakt pruefen.");
}

/**
 * Darf dieser Nutzer den Kontakt bearbeiten?
 *
 * Das ist bewusst eine andere Frage als `kontaktBelongsToUser`. Eigentum
 * entscheidet über Provision und Zahlen, Bearbeitungsrecht entscheidet nur
 * darüber, wer den Kontakt in einer Liste zu Gesicht bekommt. Eine Vertretung
 * darf während der Abwesenheit arbeiten, sie erbt aber nichts.
 *
 * `vertretungFuer` sind die Nutzer-IDs, für die der Angemeldete heute als
 * Vertretung eingetragen ist (siehe `useVertretungen`). Ohne diese Angabe
 * verhält sich die Funktion wie `kontaktBelongsToUser`.
 *
 * Massgeblich bleibt die Zugriffskontrolle in der Datenbank
 * (`is_vp_owner_of_kontakt`). Diese Funktion ist nur die Anzeige dazu.
 */
export function darfKontaktBearbeiten(
  kontakt: KundeData,
  { userName, userId, vertretungFuer }: {
    userName?: string | null;
    userId?: string | null;
    vertretungFuer?: Set<string>;
  },
): boolean {
  if (kontaktBelongsToUser(kontakt, { userName, userId })) return true;
  if (!vertretungFuer || vertretungFuer.size === 0) return false;
  const zustaendigId = kontakt.zustaendig_id || (kontakt as KontaktWithLegacyId).zustaendigId;
  return !!zustaendigId && vertretungFuer.has(zustaendigId);
}

/**
 * Gehoert der Kontakt zum Team (Downline)? Kennung zuerst.
 *
 * Der Name zaehlt nur ohne Kennung: Ein doppelt vergebener Name zaehlt nicht,
 * ein eindeutiger nur, wenn seine Kennung zum Team gehoert. Ist der Name unter
 * den Nutzern gar nicht zu finden, bleibt es beim bisherigen Namensvergleich.
 */
export function kontaktImTeam(
  kontakt: { berater?: string | null; zustaendig_id?: string | null },
  teamIds?: Set<string>,
  teamNames?: Set<string>,
  users?: SystemUser[],
): boolean {
  const zustaendigId = kontakt.zustaendig_id || (kontakt as KontaktWithLegacyId).zustaendigId;
  if (zustaendigId) return !!teamIds?.has(zustaendigId);
  const name = (kontakt.berater || "").trim();
  if (!name || !teamNames?.has(name) || nameMehrdeutig(name, users)) return false;
  const id = kennungZuName(name, users);
  return id && teamIds ? teamIds.has(id) : true;
}

export function getKontaktDashboardBucket(
  kontakt: KundeData,
  {
    userName,
    userId,
    isTeamWide,
    teamNames,
    teamIds,
    users,
    splitTeamCompany,
  }: {
    userName?: string | null;
    userId?: string | null;
    isTeamWide: boolean;
    teamNames?: Set<string>;
    teamIds?: Set<string>;
    users?: SystemUser[];
    splitTeamCompany?: boolean;
  },
): "eigen" | "team" | "company" | null {
  if (kontaktBelongsToUser(kontakt, { userName, userId })) return "eigen";

  const zustaendigId = kontakt.zustaendig_id || (kontakt as KontaktWithLegacyId).zustaendigId;
  const beraterName = resolveKontaktBerater(kontakt, users);
  const inOwnTeam = kontaktImTeam({ ...kontakt, berater: beraterName }, teamIds, teamNames, users);

  if (splitTeamCompany) {
    if (inOwnTeam) return "team";
    // Bei team-weiten Rollen werden Rest-Kontakte als "company" eingeordnet,
    // für Non-Admins (ohne team-weite Sicht) bleibt sonst nichts übrig.
    if (isTeamWide) return "company";
    return null;
  }

  if (inOwnTeam) return "team";
  if (isTeamWide) return "team";
  return null;
}