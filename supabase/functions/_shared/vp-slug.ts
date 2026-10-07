/**
 * Das Kuerzel im persoenlichen Link eines Partners, etwa `timo-blum` in
 * /steuer/timo-blum, /analyse/timo-blum und /vp/timo-blum.
 *
 * Die Entscheidung liegt hier und nicht in `ensure-vp-slug/index.ts`, damit
 * sie ohne Datenbank pruefbar ist. Getestet wird von `src/lib/vpSlug.test.ts`,
 * so wie bei `lead-zuordnung`.
 *
 * EIN VERGEBENES KUERZEL BLEIBT FUER IMMER (Entscheidung vom 24.09.2026).
 *
 * Frueher hat `ensure-vp-slug` das Kuerzel neu vergeben, sobald es nicht mehr
 * zum Namen passte, etwa nach einer Heirat oder einer korrigierten
 * Schreibweise. Damit war jeder bereits verschickte Link tot: Das alte Kuerzel
 * stand nirgends mehr, `get-vp-microsite` fand keinen Partner, und der Lead
 * landete ohne Zustaendigen im Pool. Einen Verlauf der alten Kuerzel gab es
 * nicht. Seitdem gilt: Wer ein Kuerzel hat, behaelt es, auch wenn es nicht
 * mehr zum Namen passt. Nur wer noch keins hat, bekommt eins.
 */

/** Aus einem Namen ein Kuerzel: "Jürgen Weiß" wird "jurgen-weiss". */
export function slugify(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Kuerzel, die kein Partner bekommen darf, weil sie unter /handbuch/ eine
 * eigene Seite sind (/handbuch/konfigurator, /handbuch/selbstauskunft,
 * /handbuch/ergebnis/...). Der Router liest sie ohnehin als feste Adresse;
 * hiesse ein Partner so, liefe sein Handbuch-Link ins Leere. Seit dem
 * 26.09.2026. Ein Name, der genau so lautet, bekommt „-berater“ angehaengt.
 */
export const RESERVIERTE_KUERZEL = ["konfigurator", "selbstauskunft", "ergebnis"] as const;

export function istReserviertesKuerzel(kuerzel: string): boolean {
  return (RESERVIERTE_KUERZEL as readonly string[]).includes(kuerzel.trim().toLowerCase());
}

/** Der Stamm fuer ein neues Kuerzel. Ohne brauchbaren Namen die Kennung. */
export function slugBasis(name: string | null | undefined, userId: string): string {
  const rueckfall = `vp-${userId.slice(0, 8)}`;
  const basis = slugify(name || rueckfall) || rueckfall;
  return istReserviertesKuerzel(basis) ? `${basis}-berater` : basis;
}

export type SlugEntscheidung =
  | { art: "bestehend"; slug: string }
  | { art: "neu"; basis: string };

/**
 * Bleibt das Kuerzel, oder braucht es ein neues?
 *
 * Ein vorhandenes Kuerzel wird unveraendert zurueckgegeben, egal wie der
 * Name heute lautet. Genau das ist die ganze Regel.
 */
export function slugEntscheidung(args: {
  aktuellerSlug: string | null | undefined;
  name: string | null | undefined;
  userId: string;
}): SlugEntscheidung {
  const aktuell = typeof args.aktuellerSlug === "string" ? args.aktuellerSlug.trim() : "";
  if (aktuell) return { art: "bestehend", slug: aktuell };
  return { art: "neu", basis: slugBasis(args.name, args.userId) };
}

/** Hoechstens so viele Zaehler, danach haengt die Kennung als Unterscheidung dran. */
export const SLUG_MAX_VERSUCHE = 100;

/**
 * Der n-te Vorschlag fuer ein neues Kuerzel: `basis`, `basis-2`, `basis-3`,
 * und wenn das alles vergeben ist, `basis-<Anfang der Kennung>`.
 */
export function slugKandidat(basis: string, versuch: number, userId: string): string {
  if (versuch <= 1) return basis;
  if (versuch > SLUG_MAX_VERSUCHE) return `${basis}-${userId.slice(0, 6)}`;
  return `${basis}-${versuch}`;
}

/**
 * Die EINE Vergabe eines Kuerzels, fuer `ensure-vp-slug` und
 * `get-tippgeber-vp-slug` (HB-013: die zweite hatte eine eigene Kopie ohne
 * die gesperrten Kuerzel).
 *
 * Ein vorhandenes Kuerzel bleibt. Sonst wird der erste freie Kandidat
 * geschrieben, aber nur, solange noch KEIN Kuerzel gesetzt ist. Die Spalte ist
 * UNIQUE: Schlagen zwei Aufrufe gleichzeitig dasselbe vor, bekommt der zweite
 * 23505 und probiert das naechste. Hat ein paralleler Aufruf inzwischen eins
 * vergeben, gilt dessen Kuerzel. `null`, wenn keins frei war.
 */
export async function vergibVpSlug(
  // deno-lint-ignore no-explicit-any
  db: any,
  args: { userId: string; aktuellerSlug: string | null | undefined; name: string | null | undefined },
): Promise<string | null> {
  const entscheidung = slugEntscheidung(args);
  if (entscheidung.art === "bestehend") return entscheidung.slug;
  const { userId } = args;

  for (let versuch = 1; versuch <= SLUG_MAX_VERSUCHE + 1; versuch++) {
    const kandidat = slugKandidat(entscheidung.basis, versuch, userId);
    const { data: vorhanden, error: suchFehler } = await db
      .from("profiles")
      .select("id")
      .eq("vp_slug", kandidat)
      .maybeSingle();
    if (suchFehler) throw new Error(suchFehler.message);
    if (vorhanden && vorhanden.id !== userId) continue;

    const { data: geschrieben, error: schreibFehler } = await db
      .from("profiles")
      .update({ vp_slug: kandidat })
      .eq("id", userId)
      // Auch ein leeres Feld gilt als "noch kein Kuerzel", sonst griffe die
      // Erstvergabe bei "" nie und der Partner bekaeme keinen Link.
      .or("vp_slug.is.null,vp_slug.eq.")
      .select("vp_slug");
    if (schreibFehler) {
      if ((schreibFehler as { code?: string }).code === "23505") continue;
      throw new Error(schreibFehler.message);
    }
    if (Array.isArray(geschrieben) && geschrieben.length > 0) return kandidat;

    const { data: nachgeladen } = await db
      .from("profiles")
      .select("vp_slug")
      .eq("id", userId)
      .maybeSingle();
    const vergeben = String((nachgeladen as { vp_slug?: string | null } | null)?.vp_slug || "");
    if (vergeben) return vergeben;
  }
  return null;
}
