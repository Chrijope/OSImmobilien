/**
 * Die Marketing-Einwilligung fuer das Meta Pixel eines Partners, wie der
 * Browser sie an `submit-lead` mitschickt, und ihre Pruefung auf dem Server.
 *
 * Warum der Server selbst prueft: Der Rumpf einer Anfrage ist frei baubar.
 * Ein `marketing: true` allein beweist nichts. Gemeldet wird an die Meta
 * Conversion-API deshalb nur, wenn die Einwilligung
 *   - aus einer Fassung des Cookie-Hinweises stammt, die heute noch gilt,
 *   - einen plausiblen Zeitpunkt traegt (nicht in der Zukunft, nicht aelter
 *     als 13 Monate), und
 *   - genau dem Partner gilt, dessen Pixel gemeldet wuerde.
 *
 * Browser (`src/lib/cookieEinwilligung.ts`) und Server nutzen dieselben
 * Konstanten aus dieser Datei, damit Fassung und Frist nie auseinanderlaufen.
 * Getestet von `src/lib/cookieEinwilligungServer.test.ts`.
 */

/**
 * Die Fassung des Cookie-Hinweises. Steigt, sobald sich der Text oder die
 * Kategorien aendern. Fassung 2 (27.09.2026): Marketing fuer ein Partner-Pixel
 * wird je Partner erfragt, mit Name und Anschrift des Partners.
 */
export const COOKIE_EINWILLIGUNG_FASSUNG = 2;

/**
 * Die Fassungen, deren Einwilligungen der Server noch annimmt. Fassung 1
 * kannte keine Einwilligung je Partner und gilt fuer Partner-Pixel nicht mehr.
 */
export const GUELTIGE_COOKIE_FASSUNGEN: readonly number[] = [2];

/** Hoechstalter einer Einwilligung in Kalendermonaten. */
export const EINWILLIGUNG_HOECHSTALTER_MONATE = 13;

/**
 * Bis wann eine Einwilligung vom Zeitpunkt `ms` an gilt: genau 13
 * Kalendermonate spaeter, in UTC, zur selben Uhrzeit. Gibt es den Tag im
 * Zielmonat nicht (31. Januar plus 13 Monate), gilt der letzte Tag dieses
 * Monats (28. oder 29. Februar). Bis Codex-Pruefung 27.09.2026 (PIXEL-004)
 * stand hier 13 mal 31 Tage, also bis zu sieben Tage zu lang.
 */
export function einwilligungGiltBis(ms: number): number {
  const d = new Date(ms);
  const zielMonat = d.getUTCMonth() + EINWILLIGUNG_HOECHSTALTER_MONATE;
  const letzterTag = new Date(Date.UTC(d.getUTCFullYear(), zielMonat + 1, 0)).getUTCDate();
  return Date.UTC(
    d.getUTCFullYear(),
    zielMonat,
    Math.min(d.getUTCDate(), letzterTag),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

/** Spielraum fuer eine vorgehende Uhr im Browser. */
const UHR_SPIELRAUM_MS = 5 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ist der Zeitpunkt lesbar, nicht in der Zukunft und nicht zu alt? */
export function einwilligungsZeitpunktGueltig(zeitpunkt: unknown, jetzt: number = Date.now()): boolean {
  if (typeof zeitpunkt !== "string" || zeitpunkt.length > 40) return false;
  const ms = Date.parse(zeitpunkt);
  if (!Number.isFinite(ms)) return false;
  if (ms > jetzt + UHR_SPIELRAUM_MS) return false;
  // Genau am Ablaufzeitpunkt gilt sie noch, eine Millisekunde spaeter nicht.
  return jetzt <= einwilligungGiltBis(ms);
}

/**
 * Name und Anschrift des Partners als gemeinsam Verantwortlicher fuer sein
 * Meta Pixel, aus den Gewerbedaten der Einstellungen
 * (`user_settings.einstellungen.gewerbedaten`). Ohne Strasse, PLZ oder Ort:
 * `null`, dann darf das Pixel nicht laden, denn der Cookie-Hinweis muss den
 * Partner mit Anschrift nennen. Dieselbe Regel nutzt der Hinweis in den
 * Einstellungen, damit der Partner weiss, woran es liegt.
 */
export function pixelVerantwortlicherAus(
  gewerbedaten: unknown,
  ersatzName: string,
): { name: string; anschrift: string } | null {
  const g = gewerbedaten && typeof gewerbedaten === "object" ? (gewerbedaten as Record<string, unknown>) : {};
  const feld = (k: string) => (typeof g[k] === "string" ? (g[k] as string).trim().slice(0, 120) : "");
  const strasse = [feld("strasse"), feld("hausnummer")].filter(Boolean).join(" ");
  const ort = [feld("plz"), feld("ort")].filter(Boolean).join(" ");
  if (!feld("strasse") || !feld("plz") || !feld("ort")) return null;
  const land = feld("land");
  const anschrift = [strasse, ort, land && land.toLowerCase() !== "deutschland" ? land : ""].filter(Boolean).join(", ");
  const name = feld("firmenname") || ersatzName.trim();
  return name ? { name, anschrift } : null;
}

/** Der Nachweis, der am Lead (`meta.marketingEinwilligung`) gespeichert wird. */
export interface MarketingNachweis {
  fassung: number;
  /** Zeitpunkt der Einwilligung im Browser. */
  zeitpunkt: string;
  kategorie: "marketing_partner";
  /** Der Partner, dessen Pixel die Einwilligung gilt. */
  partnerId: string;
  /** Wann der Server die Einwilligung geprueft hat. */
  geprueftAm: string;
}

/**
 * Prueft die mitgeschickte Einwilligung fuer das Pixel von `partnerId`.
 * Liefert den Nachweis oder `null`, dann geht nichts an Meta.
 */
export function pruefePartnerMarketingEinwilligung(
  roh: unknown,
  partnerId: string | null | undefined,
  jetzt: number = Date.now(),
): MarketingNachweis | null {
  if (!partnerId || !UUID.test(partnerId)) return null;
  if (!roh || typeof roh !== "object") return null;
  const e = roh as Record<string, unknown>;
  if (typeof e.version !== "number" || !GUELTIGE_COOKIE_FASSUNGEN.includes(e.version)) return null;
  const p = e.partnerMarketing;
  if (!p || typeof p !== "object") return null;
  const partner = p as Record<string, unknown>;
  if (typeof partner.partnerId !== "string" || partner.partnerId.toLowerCase() !== partnerId.toLowerCase()) return null;
  if (!einwilligungsZeitpunktGueltig(partner.zeitpunkt, jetzt)) return null;
  return {
    fassung: e.version,
    zeitpunkt: partner.zeitpunkt as string,
    kategorie: "marketing_partner",
    partnerId,
    geprueftAm: new Date(jetzt).toISOString(),
  };
}

/**
 * Die Schluessel, unter denen am Kontakt Nachweise der Pixel-Einwilligung
 * stehen. Sie entstehen ausschliesslich aus der Pruefung auf dem Server.
 */
export const NACHWEIS_SCHLUESSEL = ["marketingEinwilligung", "marketingEinwilligungen"] as const;

/**
 * Entfernt Nachweise aus einem `meta`, das von aussen kam (Browser, Zapier,
 * Partnerwebsite). Sonst liesse sich eine gefaelschte Liste einschleusen, die
 * der Dienstschluessel speichert und die danach sogar geschuetzt waere
 * (Codex-Pruefung DS-001). Alles andere bleibt unveraendert.
 */
export function ohneEinwilligungsNachweise<T>(meta: T): T {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return meta;
  const kopie = { ...(meta as Record<string, unknown>) };
  for (const schluessel of NACHWEIS_SCHLUESSEL) delete kopie[schluessel];
  return kopie as T;
}

/** Was `haengeMarketingNachweisAn` vom Supabase-Client braucht. */
export interface NachweisRpc {
  rpc(
    funktion: string,
    argumente: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

/**
 * Haengt einen Nachweis atomar an `kontakte.meta.marketingEinwilligungen` an,
 * ueber die Funktion `kontakt_marketing_nachweis_anhaengen` (Migration
 * 20260927090000, Codex-Pruefung DS-002). Zwei gleichzeitige Anfragen
 * verlieren so keinen Eintrag.
 *
 * "rueckfall": Die Funktion fehlt (Migration noch nicht gelaufen) oder der
 * Aufruf scheiterte. Dann haengt der Aufrufer auf dem bisherigen Weg an,
 * damit der Nachweis nicht verloren geht. Wirft nie.
 */
export async function haengeMarketingNachweisAn(
  db: NachweisRpc,
  kontaktId: string,
  nachweis: MarketingNachweis,
): Promise<"angehaengt" | "rueckfall"> {
  try {
    const { data, error } = await db.rpc("kontakt_marketing_nachweis_anhaengen", {
      p_kontakt_id: kontaktId,
      p_nachweis: nachweis,
    });
    if (!error && data === true) return "angehaengt";
    if (error) {
      console.warn("Pixel-Nachweis: Anhaengen ueber die Datenbank nicht moeglich, Rueckfall:", error.code || error.message);
    }
  } catch (fehler) {
    console.warn("Pixel-Nachweis: Anhaengen fehlgeschlagen, Rueckfall:", String(fehler));
  }
  return "rueckfall";
}
