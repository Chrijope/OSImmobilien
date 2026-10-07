// Ein Zulieferer (Zapier, Meta, Partnersystem) schickt oft nur einen Namen und
// keine Nutzer-ID. Ein Name allein weist aber niemandem etwas zu: die
// Sichtbarkeit haengt an `kontakte.zustaendig_id`, nicht am Freitextfeld
// `berater`. Hier wird der gelieferte Name gegen die Profile geprueft.
//
// Bewusst kein unscharfer Vergleich: bei Zustaendigkeiten ist ein falscher
// Treffer schlimmer als kein Treffer. Erlaubt sind nur Unterschiede, die keine
// Bedeutung haben, also Gross- und Kleinschreibung sowie ueberzaehlige
// Leerzeichen.

export interface BeraterProfil {
  id: string;
  name: string | null;
}

export type BeraterTreffer =
  | { art: "eindeutig"; id: string; name: string }
  | { art: "unbekannt" }
  | { art: "mehrdeutig"; anzahl: number };

/** Vergleichsform: ohne Randleerzeichen, klein, einfache Leerzeichen im Namen. */
export function normalisiereBeraterName(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function findeBeraterNachName(
  gelieferterName: string | null | undefined,
  profile: BeraterProfil[],
): BeraterTreffer {
  const gesucht = normalisiereBeraterName(gelieferterName);
  if (!gesucht) return { art: "unbekannt" };

  const treffer = profile.filter((p) => normalisiereBeraterName(p.name) === gesucht);
  if (treffer.length === 1) {
    return { art: "eindeutig", id: treffer[0].id, name: (treffer[0].name || "").trim() };
  }
  // Zwei Partner mit gleichem Namen: die Zuordnung waere geraten, also lieber
  // gar keine. Der Lead gehoert dann in den offenen Pool.
  if (treffer.length > 1) return { art: "mehrdeutig", anzahl: treffer.length };
  return { art: "unbekannt" };
}

/** Das Stueck Supabase-Client, das `beraterKennung` braucht. */
// deno-lint-ignore no-explicit-any
type ProfilAbfrage = { from: (tabelle: string) => any };

/**
 * Kennung mit Namensprobe, fuer Felderpaare wie `setterCloserId` und
 * `setterCloser`: Die Kennung gilt nur, wenn der Profilname dahinter zum
 * eingetragenen Namen passt. Sonst wurde nur der Name geaendert, dann zaehlt
 * der Name, und nur eindeutig. Ohne Name oder ohne Profil gilt die Kennung.
 */
export async function kennungMitNamensprobe(
  supabase: ProfilAbfrage,
  kennung: string | null | undefined,
  name: string | null | undefined,
): Promise<string | null> {
  const id = (kennung || "").trim();
  const gesucht = normalisiereBeraterName(name);
  if (id) {
    if (!gesucht) return id;
    const { data } = await supabase.from("profiles").select("id, name").eq("id", id).maybeSingle();
    if (!data || normalisiereBeraterName(data.name) === gesucht) return id;
    console.warn("Kennung und Name passen nicht zusammen, es zaehlt der eindeutige Name.");
  }
  return gesucht ? await beraterKennung(supabase, null, [name]) : null;
}

/**
 * Kennung eines Beraters fuer Edge Functions: die mitgegebene Kennung zuerst,
 * sonst die Namen der Reihe nach, jeweils nur bei genau einem Profil.
 *
 * Die Namen kommen in Rangfolge, etwa `[meta.setterCloser, kontakt.berater]`.
 * Die Suche laeuft ohne Gross- und Kleinschreibung in der Datenbank und wird
 * danach mit derselben Regel wie `findeBeraterNachName` geprueft. Passt ein
 * Name auf mehrere Profile, steht eine Warnung im Log und es wird nicht
 * geraten.
 */
export async function beraterKennung(
  supabase: ProfilAbfrage,
  kennung: string | null | undefined,
  namen: Array<string | null | undefined>,
): Promise<string | null> {
  const id = (kennung || "").trim();
  if (id) return id;
  for (const roh of namen) {
    const name = (roh || "").trim();
    if (!name) continue;
    // % und _ sind in ILIKE Platzhalter; der Abgleich danach ist ohnehin exakt.
    const muster = name.replace(/[\\%_]/g, (z) => `\\${z}`);
    const { data } = await supabase.from("profiles").select("id, name").ilike("name", muster);
    const treffer = findeBeraterNachName(name, (data || []) as BeraterProfil[]);
    if (treffer.art === "eindeutig") return treffer.id;
    if (treffer.art === "mehrdeutig") {
      console.warn(`Beratername passt auf ${treffer.anzahl} Profile, keine Zuordnung ueber den Namen.`);
    }
  }
  return null;
}
