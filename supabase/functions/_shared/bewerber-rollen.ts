/**
 * Wer darf im Namen des Bewerberprozesses handeln?
 *
 * Seit dem 27.09.2026 die Rollen hr, admin, inhaber und backoffice, sonst
 * niemand (Entscheidung von Christian). Dieselbe Liste steht in
 * `src/lib/bewerberprozessFreigabe.ts` (`BEWERBERPROZESS_ROLLEN`) und in der
 * Datenbank in `public.darf_bewerberbereich`. Hier steht sie ein weiteres Mal,
 * weil die Edge Functions unter Deno laufen und `src` nicht erreichen.
 *
 * Bewusst ohne Import, damit der Test in `src/lib` die Datei direkt lesen kann.
 */
export const BEWERBER_ROLLEN: readonly string[] = ["hr", "admin", "inhaber", "backoffice"];

/** Der Teil des Supabase-Clients, den die Prüfung braucht. */
type RollenLeser = {
  from: (tabelle: string) => {
    select: (spalten: string) => {
      eq: (feld: string, wert: string) => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

/**
 * Trägt dieses Konto eine der vier Rollen? Gelesen mit der Service-Rolle aus
 * `user_roles`. Ein Lesefehler zählt als nein: Im Zweifel geht keine Mail
 * hinaus.
 */
export async function darfBewerberbereich(client: unknown, userId: string): Promise<boolean> {
  if (!userId) return false;
  // `unknown` statt des vollen Client-Typs: Der sprengt je nach Version von
  // supabase-js die Typprüfung von Deno ("excessively deep").
  const db = client as RollenLeser;
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (error || !Array.isArray(data)) return false;
  return data.some((r) => BEWERBER_ROLLEN.includes(String((r as { role?: unknown }).role ?? "")));
}
