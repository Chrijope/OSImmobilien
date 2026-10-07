/**
 * Die Sprache eines Kunden: Deutsch oder Englisch.
 *
 * Entschieden am 25.09.2026 (Plan Kundensprache, Abschnitt 2):
 *   - Das Kundenprofil führt. Gespeichert wird in `kontakte.meta`, ohne
 *     eigene Spalte und damit ohne Migration:
 *        kundenSprache            "de" | "en"
 *        kundenSpracheGesetztAm   ISO-Zeitpunkt der bewussten Wahl
 *        kundenSpracheGesetztVon  Kennung des Mitarbeiters, oder bei
 *                                 automatisch angelegten Leads eine Quelle
 *                                 wie "lead:EXPATS Calculator"
 *   - Fehlt der Wert oder ist er unbekannt, gilt Deutsch. Das ist der ganze
 *     Bestand: Er gilt als Deutsch, bis jemand wählt.
 *   - „Bewusst gewählt“ heißt: `kundenSpracheGesetztAm` ist gesetzt. Nur dann
 *     entfällt die einmalige Rückfrage vor dem ersten Versand im CRM.
 *   - Automatische Läufe (Cron, Erinnerungen) fragen nie. Sie nehmen den
 *     gespeicherten Wert oder Deutsch.
 *
 * Diese Datei liegt in `_shared`, damit Edge Functions und Browser dieselbe
 * Regel lesen. Der Browser nutzt die reinen Hilfen über
 * `src/lib/kundenSprache.ts`. Deshalb steht hier nichts, was nur unter Deno
 * läuft; der Datenbankzugriff bekommt seinen Client vom Aufrufer.
 *
 * Getestet in `src/lib/kundenSprache.test.ts`.
 */

export type Sprache = "de" | "en";

export const SPRACHEN: readonly Sprache[] = ["de", "en"];

/** Rückfall für alles, was keine Sprache kennt. */
export const STANDARD_SPRACHE: Sprache = "de";

/** Die Schlüssel in `kontakte.meta`. Nur hier ausgeschrieben. */
export const KUNDENSPRACHE_META = {
  sprache: "kundenSprache",
  gesetztAm: "kundenSpracheGesetztAm",
  gesetztVon: "kundenSpracheGesetztVon",
} as const;

export function istSprache(wert: unknown): wert is Sprache {
  return wert === "de" || wert === "en";
}

/**
 * Liest eine Sprachangabe nachsichtig: "en", "EN", "en-GB", "English",
 * "deutsch". Alles andere ergibt `null`, damit der Aufrufer selbst
 * entscheidet, worauf er zurückfällt.
 */
export function normalisiereSprache(wert: unknown): Sprache | null {
  if (typeof wert !== "string") return null;
  const t = wert.trim().toLowerCase();
  if (!t) return null;
  if (t === "english" || t === "englisch") return "en";
  if (t === "deutsch" || t === "german") return "de";
  const kuerzel = t.slice(0, 2);
  if ((kuerzel === "en" || kuerzel === "de") && (t.length === 2 || t[2] === "-" || t[2] === "_")) {
    return kuerzel;
  }
  return null;
}

function alsObjekt(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
}

/** Die Sprache aus `kontakte.meta`. Fehlt sie oder ist sie unbekannt: Deutsch. */
export function spracheAusMeta(meta: unknown): Sprache {
  return normalisiereSprache(alsObjekt(meta)[KUNDENSPRACHE_META.sprache]) ?? STANDARD_SPRACHE;
}

/**
 * Wurde die Sprache bewusst gewählt? Dafür zählt nur der Zeitpunkt, nicht der
 * Wert: Ein gesetztes „de“ ohne Zeitpunkt ist genauso ungewählt wie ein
 * fehlender Eintrag.
 */
export function spracheBewusstGewaehltAusMeta(meta: unknown): boolean {
  const o = alsObjekt(meta);
  const am = o[KUNDENSPRACHE_META.gesetztAm];
  return typeof am === "string" && am.trim() !== "" && istSprache(o[KUNDENSPRACHE_META.sprache]);
}

/**
 * Der Patch für `kontakte.meta`, wenn jemand die Sprache wählt.
 *
 * @param gesetztVon  Kennung des Mitarbeiters, oder eine Quelle wie
 *                    "lead:EXPATS Calculator" bei automatisch angelegten Leads.
 */
export function kundenSpracheMetaPatch(
  sprache: Sprache,
  gesetztVon: string | null | undefined,
  jetzt: string = new Date().toISOString(),
): Record<string, string> {
  const patch: Record<string, string> = {
    [KUNDENSPRACHE_META.sprache]: sprache,
    [KUNDENSPRACHE_META.gesetztAm]: jetzt,
  };
  if (gesetztVon) patch[KUNDENSPRACHE_META.gesetztVon] = gesetztVon;
  return patch;
}

/* ── Serverseitig: Sprache zu einem Kontakt ─────────────────── */

/**
 * Der kleinste Teil eines Supabase-Clients, den die Abfrage braucht. So muss
 * diese Datei weder den Deno- noch den Browser-Client importieren.
 */
// Bewusst locker typisiert: Der Deno- und der Browser-Client haben
// verschiedene, tief verschachtelte Typen, beide sollen hier hineinpassen.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AbfrageClient = { from: (tabelle: string) => any };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface KundenSpracheSuche {
  /**
   * Die Sprache, die der Aufrufer schon kennt, etwa aus der Seite, auf der
   * ein Formular abgeschickt wurde, oder für Mails an Dritte. Hat Vorrang.
   */
  sprache?: unknown;
  /** Der Kontakt. Der Regelfall. */
  kontaktId?: string | null;
  /** Der Portalnutzer (Person 1 oder Person 2), z. B. für Anmeldemails. */
  authUserId?: string | null;
  /** Nur als letzter Weg, etwa auf der Abmeldeseite. Mehrdeutig ist Deutsch. */
  email?: string | null;
}

/**
 * Die Sprache eines Kunden für Mails, PDFs und Seiten aus Edge Functions.
 *
 * Reihenfolge: mitgegebene `sprache`, dann `kontaktId`, dann `authUserId`,
 * dann `email`. Findet sich nichts, oder schlägt die Abfrage fehl, gilt
 * Deutsch. Eine Mail geht lieber deutsch hinaus als gar nicht.
 *
 *   const sprache = await kundenSprache(admin, { kontaktId });
 *   const sprache = await kundenSprache(admin, { sprache: body.sprache, kontaktId });
 *
 * Wer die Kontaktzeile schon geladen hat, nimmt `spracheAusMeta(zeile.meta)`
 * und spart die Abfrage.
 */
export async function kundenSprache(admin: AbfrageClient, suche: KundenSpracheSuche): Promise<Sprache> {
  const mitgegeben = normalisiereSprache(suche.sprache);
  if (mitgegeben) return mitgegeben;

  try {
    const kontaktId = typeof suche.kontaktId === "string" ? suche.kontaktId.trim() : "";
    if (UUID.test(kontaktId)) {
      const { data, error } = await admin.from("kontakte").select("meta").eq("id", kontaktId).maybeSingle();
      if (!error && data) return spracheAusMeta(data.meta);
    }

    const authUserId = typeof suche.authUserId === "string" ? suche.authUserId.trim() : "";
    if (UUID.test(authUserId)) {
      // Die Kennung ist oben als UUID geprüft, sie kann den Filter nicht aufbrechen.
      const { data, error } = await admin
        .from("kontakte")
        .select("meta")
        .or(`meta->>authUserId.eq.${authUserId},meta->person2->>authUserId.eq.${authUserId}`)
        .limit(5);
      const eindeutig = !error ? einigeSprache(data) : null;
      if (eindeutig) return eindeutig;
    }

    const email = typeof suche.email === "string" ? suche.email.trim() : "";
    if (email && email.includes("@") && email.length <= 320) {
      // Platzhalter maskieren, sonst passt "a_b@x.de" auch auf "aXb@x.de".
      const muster = email.replace(/[\\%_]/g, (z) => `\\${z}`);
      const { data, error } = await admin.from("kontakte").select("meta").ilike("email", muster).limit(5);
      const eindeutig = !error ? einigeSprache(data) : null;
      if (eindeutig) return eindeutig;
    }
  } catch (fehler) {
    console.warn("kundenSprache: Rückfall auf Deutsch", fehler);
  }
  return STANDARD_SPRACHE;
}

/** Sprechen alle gefundenen Kontakte dieselbe Sprache? Sonst `null`. */
function einigeSprache(zeilen: unknown): Sprache | null {
  if (!Array.isArray(zeilen) || zeilen.length === 0) return null;
  const sprachen = new Set(zeilen.map((z) => spracheAusMeta((z as { meta?: unknown })?.meta)));
  return sprachen.size === 1 ? [...sprachen][0] : null;
}
