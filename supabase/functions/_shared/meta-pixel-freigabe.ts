/**
 * Darf das Meta Pixel eines Vertriebspartners auf seinen Partnerseiten laufen?
 *
 * Christians Entscheidung vom 26.09.2026 (Variante A): Ein eigenes Meta Pixel
 * setzt die Vereinbarung nach Art. 26 DSGVO voraus, Anlage 4 zum
 * Vertriebspartnervertrag. Sie steht erst in der Vertragsfassung
 * VERTRAGSFASSUNG_MIT_ANLAGE_4. Bestandspartner bekommen keine
 * Zusatzvereinbarung. Wer vor dieser Aenderung schon eine Pixel-ID oder ein
 * Conversions-API-Token hinterlegt hatte, behaelt sie (Bestandsschutz).
 *
 * Die Pixel-ID liegt in `user_settings.einstellungen.marketing.metaPixelId`,
 * und diese Zeile schreibt der Partner selbst (Regel "Users update own
 * settings", dazu `merge_user_settings`). Ein gesperrtes Eingabefeld haelt
 * ihn also nicht auf. Massgeblich ist deshalb diese Pruefung an den drei
 * Stellen, an denen Pixel-ID und Token tatsaechlich benutzt werden:
 * `get-vp-microsite` (liefert die Pixel-ID an die oeffentliche Seite),
 * `submit-lead` und `meta-lead` (melden per Conversions API), dazu
 * `vp-marketing` beim Speichern des Tokens.
 *
 * Freigegeben ist, in dieser Reihenfolge:
 *   1. nie bei gesperrtem Profil (Vertragsende) und nie bei einer Sperre des
 *      Pixels durch die Verwaltung (Anlage 4 § 10 Absatz 3);
 *   2. immer fuer Admin und Inhaber;
 *   3. mit einem beidseitig unterschriebenen Vertrag in einer Fassung mit
 *      Anlage 4. Massgeblich ist `meta.vertragUnterschrieben.fassung`, die
 *      `finalize-vertrag` bei der Gegenzeichnung aus der tatsaechlich
 *      unterschriebenen Anfrage schreibt, nicht die Fassung des Entwurfs
 *      (Codex-Pruefung 27.09.2026, A4-05). Die Bewerbungen schreiben seit
 *      Migration 20260927060000 nur HR, Admin, Inhaber und Backoffice;
 *   4. mit Bestandsschutz aus der Liste `meta_pixel_berechtigung`. Die Liste
 *      fuellt die Migration 20260927040000 einmal aus dem Datenstand des
 *      Tages. Der Partner kann sie nicht schreiben. Entfernt er seine
 *      Pixel-ID, endet der Bestandsschutz (Ausloeser in derselben
 *      Migration), ein spaeteres erneutes Setzen braucht dann Stufe 3.
 *
 * Die reine Entscheidung ist ohne Datenbank pruefbar
 * (src/lib/metaPixelFreigabe.test.ts), die Abfragen bleiben duenn.
 */

/**
 * Erste Vertragsfassung mit Anlage 4. Eine Datumskennung wie alle
 * Fassungen seit dem 04.09.2026, damit ein Textvergleich die Reihenfolge
 * traegt. Die Altfassung ("2026-09-01-lang") liegt davor.
 * Spätere Fassungen (etwa 2026-09-29, `VERTRAGS_FASSUNG` in
 * src/lib/vertragKonditionen.ts) enthalten Anlage 4 weiterhin.
 */
export const VERTRAGSFASSUNG_MIT_ANLAGE_4 = "2026-09-26";

/** Enthaelt ein Vertrag mit dieser Fassungskennung Anlage 4? */
export function fassungHatAnlage4(kennung: unknown): boolean {
  const k = typeof kennung === "string" ? kennung.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  return k >= VERTRAGSFASSUNG_MIT_ANLAGE_4;
}

/**
 * Hat dieser Nutzer einen beidseitig unterschriebenen Vertrag mit Anlage 4?
 * `bewerbungen` sind die Zeilen, deren `meta.userAccountId` auf ihn zeigt.
 * Gelesen wird die unterschriebene Fassung, nie die des Entwurfs.
 */
export function hatVertragMitAnlage4(
  bewerbungen: Array<{ meta?: unknown }> | null | undefined,
  userId: string,
): boolean {
  if (!userId) return false;
  return (bewerbungen ?? []).some((b) => {
    const m = (b?.meta ?? {}) as Record<string, unknown>;
    const unterschrieben = (m.vertragUnterschrieben ?? {}) as Record<string, unknown>;
    return m.userAccountId === userId
      && m.vertragStatus === "unterschrieben"
      && fassungHatAnlage4(unterschrieben.fassung);
  });
}

export type MetaPixelFreigabeGrund =
  | "profil_gesperrt"
  | "pixel_gesperrt"
  | "admin"
  | "vertrag_anlage_4"
  | "bestandsschutz"
  | "ohne_anlage_4";

export interface MetaPixelFreigabe {
  erlaubt: boolean;
  grund: MetaPixelFreigabeGrund;
}

const ADMIN_ROLLEN = new Set(["admin", "inhaber"]);

/** Die Entscheidung aus bereits geladenen Angaben. */
export function entscheideMetaPixelFreigabe(e: {
  rollen: string[];
  profilGesperrt: boolean;
  pixelGesperrt: boolean;
  bestandsschutz: boolean;
  vertragMitAnlage4: boolean;
}): MetaPixelFreigabe {
  if (e.profilGesperrt) return { erlaubt: false, grund: "profil_gesperrt" };
  if (e.pixelGesperrt) return { erlaubt: false, grund: "pixel_gesperrt" };
  if (e.rollen.some((r) => ADMIN_ROLLEN.has(r))) return { erlaubt: true, grund: "admin" };
  if (e.vertragMitAnlage4) return { erlaubt: true, grund: "vertrag_anlage_4" };
  if (e.bestandsschutz) return { erlaubt: true, grund: "bestandsschutz" };
  return { erlaubt: false, grund: "ohne_anlage_4" };
}

type DbAntwort = { data: unknown; error: { code?: string; message?: string } | null };

export interface FreigabeClient {
  from: (tabelle: string) => {
    select: (spalten: string) => {
      eq: (feld: string, wert: unknown) => PromiseLike<DbAntwort> & {
        maybeSingle: () => PromiseLike<DbAntwort>;
      };
    };
  };
}

function tabelleFehlt(fehler: DbAntwort["error"]): boolean {
  if (!fehler) return false;
  const msg = String(fehler.message || "");
  return fehler.code === "42P01" || fehler.code === "PGRST205"
    || msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * Laedt alles Noetige mit dem Dienstschluessel und entscheidet.
 *
 * Fehlt die Tabelle `meta_pixel_berechtigung` noch (Migration nicht
 * gelaufen), gibt es keinen Bestandsschutz, nur Admin, Inhaber und den
 * Vertrag mit Anlage 4. Einen Ersatz aus den aktuellen Einstellungen gibt es
 * bewusst nicht, die schreibt der Partner selbst (Codex-Pruefung 27.09.2026,
 * A4-01). Deshalb muss die Migration vor dem Ausrollen der Functions laufen,
 * sonst ist das Pixel der Bestandspartner bis dahin aus. Jeder andere
 * Lesefehler sperrt ebenso, im Zweifel geht nichts an Meta.
 */
export async function ladeMetaPixelFreigabe(
  client: FreigabeClient,
  userId: string,
): Promise<MetaPixelFreigabe & { tabelleFehlt: boolean }> {
  const gesperrt = { erlaubt: false, grund: "profil_gesperrt" as const, tabelleFehlt: false };
  if (!userId) return gesperrt;

  const [rollenAntwort, profilAntwort, listenAntwort, bewerbungenAntwort] = await Promise.all([
    client.from("user_roles").select("role").eq("user_id", userId),
    client.from("profiles").select("gesperrt").eq("id", userId).maybeSingle(),
    client.from("meta_pixel_berechtigung")
      .select("bestandsschutz, bestandsschutz_beendet_am, gesperrt_am")
      .eq("user_id", userId)
      .maybeSingle(),
    client.from("bewerbungen").select("meta").eq("meta->>userAccountId", userId),
  ]);

  if (rollenAntwort.error || profilAntwort.error || bewerbungenAntwort.error) {
    console.error("Meta-Pixel-Freigabe: Abfrage fehlgeschlagen");
    return gesperrt;
  }
  const ohneListe = tabelleFehlt(listenAntwort.error);
  if (listenAntwort.error && !ohneListe) {
    console.error("Meta-Pixel-Freigabe: Liste nicht lesbar");
    return gesperrt;
  }

  const rollen = ((rollenAntwort.data ?? []) as Array<{ role?: unknown }>)
    .map((r) => String(r?.role ?? ""))
    .filter(Boolean);
  const profil = profilAntwort.data as { gesperrt?: unknown } | null;
  const eintrag = listenAntwort.data as {
    bestandsschutz?: unknown;
    bestandsschutz_beendet_am?: unknown;
    gesperrt_am?: unknown;
  } | null;

  const entscheidung = entscheideMetaPixelFreigabe({
    rollen,
    profilGesperrt: profil?.gesperrt === true,
    pixelGesperrt: !!eintrag?.gesperrt_am,
    bestandsschutz: !ohneListe && eintrag?.bestandsschutz === true && !eintrag?.bestandsschutz_beendet_am,
    vertragMitAnlage4: hatVertragMitAnlage4(bewerbungenAntwort.data as Array<{ meta?: unknown }>, userId),
  });
  return { ...entscheidung, tabelleFehlt: ohneListe };
}
