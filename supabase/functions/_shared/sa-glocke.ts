/**
 * Glocke nach einer unterschriebenen Selbstauskunft, wenn der Lead noch
 * keinen Zuständigen hat (Christians Entscheidung vom 28.09.2026).
 *
 * Mit Zuständigem geht die Glocke nur an ihn, ermittelt über
 * `kontakte.zustaendig_id` (siehe finalize-selbstauskunft). Ohne Zuständigen
 * erfuhr bisher nur bei Handbuch-Leads jemand davon, und dort auch die
 * Setterin. Jetzt gilt für jeden Lead: Admin, Inhaber und Vertriebsleitung,
 * sonst niemand. Nie die Setterin, nie das Backoffice, nie alle Partner.
 */

export const SA_GLOCKE_LEITUNG_ROLLEN: readonly string[] = ["admin", "inhaber", "vertriebsleiter"];

// deno-lint-ignore no-explicit-any
type RollenAbfrage = { from: (tabelle: string) => any };

/** Kennungen der Leitung, jede Person einmal, auch bei mehreren Rollen. */
export async function saGlockeLeitung(supabase: RollenAbfrage): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", SA_GLOCKE_LEITUNG_ROLLEN);
  if (error) throw error;
  const ids = ((data || []) as Array<{ user_id?: string | null }>)
    .map((r) => r?.user_id)
    .filter((id): id is string => typeof id === "string" && id !== "");
  return Array.from(new Set(ids));
}

/** Die Glockenzeilen an die Leitung, Link als Pfad im CRM auf den Kunden. */
export function saGlockeLeitungZeilen(
  empfaenger: string[],
  kontaktId: string,
  kundeName: string,
  ausHandbuch: boolean,
) {
  const text = ausHandbuch
    ? `${kundeName} hat über die Handbuch-Seite die Selbstauskunft ausgefüllt und unterschrieben. Der Lead hat noch keinen Partner. Bitte zuweisen, der Partner kann direkt mit der Objektvorstellung starten.`
    : `${kundeName} hat die Selbstauskunft ausgefüllt und unterschrieben. Der Lead hat noch keinen Partner. Bitte zuweisen.`;
  return Array.from(new Set(empfaenger)).map((uid) => ({
    benutzer_id: uid,
    titel: `📝 Selbstauskunft eingegangen: ${kundeName}`,
    nachricht: JSON.stringify({
      text,
      notif_type: ausHandbuch ? "handbuch_sa_pool" : "sa_ohne_zustaendigen",
      kontaktId,
      kontaktName: kundeName,
    }),
    link: `/kunden/${kontaktId}`,
    gelesen: false,
  }));
}
