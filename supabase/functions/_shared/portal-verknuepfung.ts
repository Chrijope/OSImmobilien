/**
 * Pruefungen fuer invite-user, bevor ein Konto an einen Kontakt gehaengt
 * wird (Gegenpruefung vom 28.09.2026, A2). Eigene Datei, damit die Tests sie
 * ohne Deno.serve laden koennen.
 */

/** Rollen eines Portal- oder Tippgeberkontos; alles andere ist ein Konto im CRM. */
const EXTERNE_ROLLEN = new Set(["kunde", "tippgeber", "bewerber"]);

/**
 * Darf ein vorhandenes Konto (gleiche E-Mail) an diese Einladung haengen?
 * Gibt die Ablehnung als Satz zurueck, sonst null. Nur fuer Aufrufer ohne
 * Admin- oder Inhaberrolle. Abgelehnt wird, wenn das Konto eine Rolle im CRM
 * traegt oder schon an einem ANDEREN Kontakt als Portalzugang haengt. Die
 * erneute Einladung desselben Kontakts bleibt moeglich.
 */
export async function vorhandenesKontoPruefen(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  kontaktId: string | null,
): Promise<string | null> {
  const { data: rollen } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const intern = (rollen || []).some((r: { role: string }) => !EXTERNE_ROLLEN.has(String(r.role)));
  if (intern) {
    return "Zu dieser E-Mail gibt es schon ein Konto im CRM. Es wird nicht verknüpft, bitte die Zentrale fragen.";
  }
  if (kontaktId) {
    const { data: andere } = await admin
      .from("kontakte")
      .select("id")
      .or(`meta->>authUserId.eq.${userId},meta->person2->>authUserId.eq.${userId}`)
      .neq("id", kontaktId)
      .limit(1);
    if ((andere || []).length > 0) {
      return "Diese E-Mail hat schon einen Portalzugang bei einem anderen Kontakt. Er wird nicht umgehängt, bitte die Zentrale fragen.";
    }
  }
  return null;
}

/**
 * Hat dieser Kaeufer einen Zugang zum Kundenportal?
 *
 * true: Konto vorhanden (invite-user schreibt `authUserId`, fuer Person 2
 * unter `person2`). false: noch keins. undefined: Portal gesperrt, dann sagt
 * die Mail zum Portal gar nichts, weder Knopf noch "Zugangsdaten folgen".
 */
export function portalZugangFuer(kontaktMeta: unknown, personType: string): boolean | undefined {
  const meta = (kontaktMeta && typeof kontaktMeta === "object" ? kontaktMeta : {}) as Record<string, unknown>;
  if (meta.portalGesperrt === true) return undefined;
  const person = (personType === "kaeufer2" ? meta.person2 : meta) as Record<string, unknown> | undefined;
  const id = person?.authUserId;
  return typeof id === "string" && id.trim() !== "";
}
