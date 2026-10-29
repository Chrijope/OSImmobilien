/**
 * Wer hat Einblick in den Kunden? (Christian, 29.10.2026, Vorlage aus MORE)
 *
 * Die Bildreihe auf der Pipeline-Kachel und im Kundenprofil. Alle Regeln
 * stehen nur hier, ohne React und ohne Datenbankzugriff. Die Anzeige ist keine
 * Zugriffskontrolle: Wer den Kunden wirklich lesen darf, entscheidet RLS.
 *
 * Grundmenge wie in der Datenbank:
 *   - Vollzugriff (`darf_alle_kunden_sehen`), ohne Setterin und Testzugang,
 *   - Finanzierungspartner nur mit laufender Einreichung zum Vorgang
 *     (`finanzierer_aktiv`, seit 27.10.2026) und erst ab der Stufe Finanzierung,
 *   - Vertriebspartner als Zuständiger, Ersteller oder Empfehler
 *     (`is_vp_eigentuemer_of_kontakt`),
 *   - OS: die Teamkette über dem Zuständigen (`user_settings.teamleader_id`),
 *     ohne gesperrte Partner.
 */
import type { SystemUser } from "@/lib/loadAllUsers";
import { kennungZuName } from "@/lib/beraterNamensabgleich";
import { rollenLabel } from "@/lib/rollenLabel";
import { stufeErreicht } from "@/lib/pipelineStufen";

/** Rollen mit Vollzugriff (plus Finanzierer), in der Reihenfolge, in der sie angezeigt werden. */
export const VOLLZUGRIFF_ANZEIGE = [
  "inhaber", "admin", "vertriebsleiter", "backoffice",
  "buchhaltung", "finanzierungspartner", "individuell",
] as const;

/** Welche Rollen der Betrachter sieht. Nicht aufgeführte Rollen sehen alle. */
const SICHTBARE_ROLLEN: Record<string, ReadonlySet<string>> = {
  vertriebspartner: new Set(["vertriebsleiter", "backoffice"]),
  vertriebsleiter: new Set(["vertriebspartner", "admin", "finanzierungspartner", "backoffice"]),
  finanzierungspartner: new Set(["vertriebspartner", "vertriebsleiter", "backoffice"]),
};

/** Höchstens so viele Ebenen nach oben, wie in der Datenbank (`struktur_kette`). */
const MAX_EBENEN = 20;

export interface EinblickPerson {
  id: string;
  name: string;
  bildUrl?: string;
  /** Bezeichnung der Rolle, über die die Person den Kunden sieht. */
  rolle: string;
  /** Der zuständige Vertriebspartner, steht immer vorn. */
  zustaendig: boolean;
  /** Steht in der Teamkette über dem Zuständigen (nur OS). */
  team?: boolean;
}

export interface EinblickKunde {
  berater?: string | null;
  zustaendig_id?: string | null;
  erstelltVonId?: string | null;
  empfehlungsgeberVpId?: string | null;
  /** Pipeline-Stufe, für den Finanzierungspartner. */
  stufe?: string | null;
  /** Finanzierer mit laufender Einreichung zum Vorgang. */
  finanzierer?: readonly string[];
}

/**
 * Die Teamleiter über einem Partner, von unten nach oben (direkter Teamleiter
 * zuerst). Bricht bei einem Kreis oder nach 20 Ebenen ab.
 */
export function uplineIds(partnerId: string | null | undefined, teamleiter: ReadonlyMap<string, string>): string[] {
  const kette: string[] = [];
  if (!partnerId) return kette;
  const besucht = new Set<string>([partnerId]);
  let aktuell = teamleiter.get(partnerId);
  while (aktuell && !besucht.has(aktuell) && kette.length < MAX_EBENEN) {
    besucht.add(aktuell);
    kette.push(aktuell);
    aktuell = teamleiter.get(aktuell);
  }
  return kette;
}

const rollenVon = (u: SystemUser) => [u.rolle, ...(u.rollen || [])].filter(Boolean) as string[];

export function kundenEinblick(
  kunde: EinblickKunde,
  nutzer: SystemUser[],
  betrachterRolle: string | undefined,
  teamleiter: ReadonlyMap<string, string> = new Map(),
): EinblickPerson[] {
  const sichtbar = SICHTBARE_ROLLEN[betrachterRolle || ""];
  const finanzierungLaeuft = stufeErreicht(kunde.stufe, "finanzierung");
  const finanzierer = new Set(kunde.finanzierer || []);
  const darf = (rolle: string) => !sichtbar || sichtbar.has(rolle);
  const zustaendigId = kunde.zustaendig_id || kennungZuName(kunde.berater, nutzer);
  const eigentuemer = new Set([zustaendigId, kunde.erstelltVonId, kunde.empfehlungsgeberVpId].filter(Boolean));
  // Nur die Kette über dem Zuständigen; wer nur angelegt hat, bringt keine Kette mit.
  const kette = uplineIds(zustaendigId, teamleiter);
  const zustaendigName = nutzer.find((u) => u.id === zustaendigId)?.name;

  const personen: (EinblickPerson & { rang: number })[] = [];
  for (const u of nutzer) {
    if (!u.id || !u.name) continue;
    const rollen = rollenVon(u);
    const vollRolle = VOLLZUGRIFF_ANZEIGE.find((r) =>
      rollen.includes(r) && darf(r)
      && (r !== "finanzierungspartner" || (finanzierungLaeuft && finanzierer.has(u.id))));
    const istVpNutzer = rollen.includes("vertriebspartner");
    const zustaendig = u.id === zustaendigId;
    const ebene = kette.indexOf(u.id);
    // Die Teamkette sieht jeder Betrachter, auch ein Vertriebspartner.
    const istUpline = ebene >= 0 && istVpNutzer && !u.gesperrt;
    const alsVp = (eigentuemer.has(u.id) && istVpNutzer && darf("vertriebspartner")) || istUpline;
    if (!vollRolle && !alsVp && !zustaendig) continue;
    const rolle = (zustaendig || alsVp) && istVpNutzer ? "vertriebspartner" : vollRolle || "vertriebspartner";
    const pos = (VOLLZUGRIFF_ANZEIGE as readonly string[]).indexOf(rolle);
    personen.push({
      id: u.id,
      name: u.name,
      bildUrl: u.bildUrl || undefined,
      rolle: istUpline && !zustaendig && zustaendigName
        ? `${rollenLabel(rolle, u.rollenVariante)}, Team über ${zustaendigName}`
        : rollenLabel(rolle, u.rollenVariante),
      zustaendig,
      ...(istUpline && !zustaendig ? { team: true } : {}),
      // Zuständiger, dann die Teamkette von unten nach oben, dann die Rollen,
      // zuletzt weitere Vertriebspartner (Ersteller, Empfehler).
      rang: zustaendig ? -1000 : istUpline ? -500 + ebene : pos === -1 ? VOLLZUGRIFF_ANZEIGE.length : pos,
    });
  }
  return personen
    .sort((a, b) => a.rang - b.rang || a.name.localeCompare(b.name))
    .map(({ rang: _rang, ...p }) => p);
}
