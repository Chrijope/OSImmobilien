/**
 * Geplante Glocken gehen an den, der den Kontakt JETZT betreut.
 *
 * Christians Regel vom 29.09.2026: Jede Rolle bekommt Glocken nur zu den
 * Leads, die ihr tatsaechlich zugewiesen sind. Gibt ein Partner einen Lead an
 * die Zentrale zurueck oder bekommt ihn ein anderer Partner, zaehlt immer der
 * aktuell hinterlegte Zustaendige (`kontakte.zustaendig_id`).
 *
 * Die Warteschlange `scheduled_notifications` haelt die Kennung fest, die beim
 * Planen zustaendig war. Eine Notarfoto-Erinnerung, geplant fuer Partner A,
 * ging bisher auch dann an A, wenn der Kunde laengst bei Partner B oder in der
 * Zentrale lag. Deshalb wird der Empfaenger beim Versand neu bestimmt:
 *
 * - geplant fuer den aktuellen Zustaendigen: unveraendert.
 * - anderer Zustaendiger eingetragen: an ihn.
 * - kein Zustaendiger mehr: an die Leitung (Admin, Inhaber, Vertriebsleitung),
 *   wie jede Prozess-Glocke ohne Zustaendigen. War die Zeile schon fuer die
 *   Leitung geplant, bleibt sie dort.
 * - geplant fuer jemanden ohne Partner- oder Leitungsrolle (Backoffice,
 *   Finanzierung, Setterin): unveraendert, dort gilt die Erinnerung der Rolle.
 */
import { SA_GLOCKE_LEITUNG_ROLLEN, saGlockeLeitung } from "./sa-glocke.ts";

/** Rollen, die einen Kunden als Zustaendige betreuen oder im Rueckfall bekommen. */
const ZUSTAENDIGKEITS_ROLLEN: readonly string[] = ["vertriebspartner", ...SA_GLOCKE_LEITUNG_ROLLEN];

export type EmpfaengerEntscheidung =
  | { art: "wie_geplant" }
  | { art: "umleiten"; an: string[]; vermerk: string }
  | { art: "entfaellt"; vermerk: string };

/**
 * Reine Entscheidung, ohne Datenbank.
 *
 * `zustaendigJetzt`: `undefined` heisst, der Kontakt existiert nicht mehr.
 * `ohneZustaendigenEntfaellt`: fuer Erinnerungen, die nur ein Zustaendiger
 * abarbeiten kann (Aufgabe an Tag 14 zur Selbstauskunft). send-sa-invitation
 * plant sie ohne Zustaendigen gar nicht erst, also entfaellt sie auch hier.
 */
export function entscheideEmpfaenger(p: {
  geplantFuer: string;
  zustaendigJetzt: string | null | undefined;
  rollenDesGeplanten: readonly string[];
  leitung: readonly string[];
  ohneZustaendigenEntfaellt?: boolean;
}): EmpfaengerEntscheidung {
  if (p.zustaendigJetzt === undefined) {
    return { art: "entfaellt", vermerk: "Kontakt existiert nicht mehr" };
  }
  if (p.zustaendigJetzt === p.geplantFuer) return { art: "wie_geplant" };
  if (!p.rollenDesGeplanten.some((r) => ZUSTAENDIGKEITS_ROLLEN.includes(r))) return { art: "wie_geplant" };

  if (p.zustaendigJetzt) {
    return {
      art: "umleiten",
      an: [p.zustaendigJetzt],
      vermerk: `Umgeleitet: geplant fuer ${p.geplantFuer}, zustaendig ist jetzt ${p.zustaendigJetzt}`,
    };
  }

  // Kein Zustaendiger mehr.
  const istLeitung = p.rollenDesGeplanten.some((r) => SA_GLOCKE_LEITUNG_ROLLEN.includes(r));
  if (istLeitung) return { art: "wie_geplant" };
  if (p.ohneZustaendigenEntfaellt) {
    return { art: "entfaellt", vermerk: `Kein Zustaendiger mehr, geplant fuer ${p.geplantFuer}` };
  }
  const leitung = [...new Set(p.leitung)];
  if (leitung.length === 0) {
    return { art: "entfaellt", vermerk: `Kein Zustaendiger mehr und keine Leitung, geplant fuer ${p.geplantFuer}` };
  }
  return {
    art: "umleiten",
    an: leitung,
    vermerk: `Umgeleitet an die Leitung: geplant fuer ${p.geplantFuer}, kein Zustaendiger mehr`,
  };
}

// deno-lint-ignore no-explicit-any
type Datenbank = { from: (tabelle: string) => any };

async function rollenVon(supabase: Datenbank, kennungen: string[]): Promise<Map<string, string[]>> {
  const rollen = new Map<string, string[]>();
  if (kennungen.length === 0) return rollen;
  const { data, error } = await supabase.from("user_roles").select("user_id, role").in("user_id", kennungen);
  if (error) throw error;
  for (const z of (data || []) as Array<{ user_id: string; role: string }>) {
    rollen.set(z.user_id, [...(rollen.get(z.user_id) || []), z.role]);
  }
  return rollen;
}

/**
 * `entscheideEmpfaenger` mit den Rollen des Geplanten und, falls noetig, der
 * Leitung aus der Datenbank. Fuer Stellen, die den Zustaendigen schon kennen.
 */
export async function entscheideMitRollen(
  supabase: Datenbank,
  geplantFuer: string,
  zustaendigJetzt: string | null | undefined,
  ohneZustaendigenEntfaellt = false,
): Promise<EmpfaengerEntscheidung> {
  if (zustaendigJetzt === geplantFuer) return { art: "wie_geplant" };
  const rollen = await rollenVon(supabase, [geplantFuer]);
  return entscheideEmpfaenger({
    geplantFuer,
    zustaendigJetzt,
    rollenDesGeplanten: rollen.get(geplantFuer) || [],
    leitung: zustaendigJetzt === null ? await saGlockeLeitung(supabase) : [],
    ohneZustaendigenEntfaellt,
  });
}

/**
 * Reine Regel fuer eine Empfaengerliste (Exposé und Objektuebersicht
 * geoeffnet): Vertriebspartner, denen der Kontakt nicht zugewiesen ist, fallen
 * heraus. Wer zusaetzlich Leitung oder Backoffice ist, bleibt. Hat der
 * vorhandene Kontakt keinen Zustaendigen, kommt die Leitung dazu. Ist der
 * Kontakt geloescht, nie die Leitung.
 */
export function ohneFremdePartnerListe(
  kandidaten: readonly string[],
  zustaendigId: string | null | undefined,
  rollen: Map<string, readonly string[]>,
  leitung: readonly string[],
  kontaktVorhanden = true,
): string[] {
  const liste = [...new Set(kandidaten.filter(Boolean))];
  const bleibt = liste.filter((uid) => {
    if (uid === zustaendigId) return true;
    const r = rollen.get(uid) || [];
    const istPartner = r.includes("vertriebspartner");
    const istHaus = r.some((x) => x === "backoffice" || SA_GLOCKE_LEITUNG_ROLLEN.includes(x));
    return !istPartner || istHaus;
  });
  if (zustaendigId || !kontaktVorhanden) return bleibt;
  return [...new Set([...bleibt, ...leitung])];
}

/** `ohneFremdePartnerListe` mit Rollen und Leitung aus der Datenbank. */
export async function ohneFremdePartner(
  supabase: Datenbank,
  kandidaten: readonly string[],
  zustaendigId: string | null | undefined,
  kontaktVorhanden = true,
): Promise<string[]> {
  const fremde = [...new Set(kandidaten.filter((uid) => uid && uid !== zustaendigId))];
  const rollen = await rollenVon(supabase, fremde);
  const leitung = !zustaendigId && kontaktVorhanden ? await saGlockeLeitung(supabase) : [];
  return ohneFremdePartnerListe(kandidaten, zustaendigId, rollen, leitung, kontaktVorhanden);
}

/**
 * Wer eine Glocke zu diesem Kontakt bekommt: der aktuelle Zustaendige, ohne
 * ihn die Leitung. `null`, wenn es den Kontakt nicht (mehr) gibt; dann
 * entscheidet der Aufrufer (etwa: der Kalenderbesitzer).
 */
export async function zustaendigOderLeitung(supabase: Datenbank, kontaktId: string): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("kontakte")
    .select("zustaendig_id, geloescht")
    .eq("id", kontaktId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.geloescht === true) return null;
  const zustaendig = (data.zustaendig_id as string | null) || null;
  return zustaendig ? [zustaendig] : await saGlockeLeitung(supabase);
}

/** Die Felder einer Warteschlangenzeile, die hier gebraucht werden. */
export interface GeplanteGlocke {
  id: string;
  target_user_id: string;
  kontakt_id: string;
  titel: string;
  trigger_at: string;
  category?: string | null;
}

/**
 * Entscheidung mit Datenbank: liest den aktuellen Zustaendigen, die Rollen des
 * Geplanten und bei Bedarf die Leitung. Wer dieselbe Erinnerung schon hat
 * (eigene Zeile, etwa weil er den Notartermin selbst neu gesetzt hat, oder
 * eine bereits umgeleitete Schwesterzeile), bekommt keine zweite.
 */
export async function empfaengerZumVersand(
  supabase: Datenbank,
  zeile: GeplanteGlocke,
): Promise<EmpfaengerEntscheidung> {
  const { data: kontakt, error: kontaktFehler } = await supabase
    .from("kontakte")
    .select("zustaendig_id")
    .eq("id", zeile.kontakt_id)
    .maybeSingle();
  if (kontaktFehler) throw kontaktFehler;
  const zustaendigJetzt = kontakt ? ((kontakt.zustaendig_id as string | null) || null) : undefined;

  const entscheidung = await entscheideMitRollen(
    supabase,
    zeile.target_user_id,
    zustaendigJetzt,
    zeile.category === "sa_vp_nudge",
  );
  if (entscheidung.art !== "umleiten") return entscheidung;

  // Doppelte vermeiden: dieselbe Erinnerung (Kontakt, Titel, Zeitpunkt) fuer
  // den neuen Empfaenger, noch offen oder schon verschickt.
  const { data: schon, error: schonFehler } = await supabase
    .from("scheduled_notifications")
    .select("target_user_id")
    .eq("kontakt_id", zeile.kontakt_id)
    .eq("titel", zeile.titel)
    .eq("trigger_at", zeile.trigger_at)
    .in("status", ["pending", "sent"])
    .in("target_user_id", entscheidung.an)
    .neq("id", zeile.id);
  if (schonFehler) throw schonFehler;
  const versorgt = new Set(((schon || []) as Array<{ target_user_id: string }>).map((z) => z.target_user_id));
  const an = entscheidung.an.filter((uid) => !versorgt.has(uid));
  if (an.length === 0) {
    return { art: "entfaellt", vermerk: `${entscheidung.vermerk}; hat dieselbe Erinnerung schon` };
  }
  return { ...entscheidung, an };
}
