/**
 * Bewirbt sich jemand ein zweites Mal, gehört die Anfrage an die bestehende
 * Bewerbung (M17 vom 04.10.2026).
 *
 * Bis dahin: zapier-bewerber-webhook verglich die Adresse genau, also mit
 * Groß- und Kleinschreibung, und verwarf eine erkannte zweite Anfrage still.
 * Mit `.maybeSingle()` scheiterte die Suche obendrein, sobald es zwei Treffer
 * gab, und dann entstand eine weitere Dublette. submit-bewerbung prüfte gar
 * nicht. Jetzt suchen beide ohne Groß- und Kleinschreibung, nehmen den ersten
 * Treffer, hängen die Anfrage an und informieren HR per Glocke.
 */

// deno-lint-ignore no-explicit-any
type Datenzugriff = { from: (tabelle: string) => any };

export interface BewerbungsTreffer {
  id: string;
  vorname: string | null;
  nachname: string | null;
  telefon: string | null;
  meta: Record<string, unknown> | null;
}

/** Muster für `ilike`: klein geschrieben, Platzhalter maskiert, sonst passt "a_b@x.de" auch auf "aXb@x.de". */
export function emailMuster(email: string): string {
  return email.trim().toLowerCase().replace(/[\\%_]/g, (z) => `\\${z}`);
}

/** Die neueste Bewerbung mit dieser Adresse, ohne Groß- und Kleinschreibung. Wirft bei einem Lesefehler. */
export async function findeBewerbungNachEmail(admin: Datenzugriff, email: string): Promise<BewerbungsTreffer | null> {
  const adresse = email.trim();
  if (!adresse || !adresse.includes("@")) return null;
  const { data, error } = await admin
    .from("bewerbungen")
    .select("id, vorname, nachname, telefon, meta")
    .ilike("email", emailMuster(adresse))
    .order("erstellt_am", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data || [])[0] as BewerbungsTreffer | undefined) ?? null;
}

export interface WeitereBewerbung {
  eingegangenAm: string;
  quelle: string;
  angaben: Record<string, unknown>;
}

/** meta der bestehenden Bewerbung mit der neuen Anfrage. Begrenzt, damit ein Bot die Zeile nicht aufbläht. */
export function metaMitWeitererBewerbung(
  meta: Record<string, unknown> | null | undefined,
  anfrage: WeitereBewerbung,
): Record<string, unknown> {
  const bisher = meta && typeof meta === "object" ? meta : {};
  const liste = Array.isArray(bisher.weitereAnfragen) ? bisher.weitereAnfragen : [];
  return {
    ...bisher,
    weitereAnfragen: [...liste, anfrage].slice(-25),
    letzteAnfrageAm: anfrage.eingegangenAm,
    letzteAnfrageQuelle: anfrage.quelle,
  };
}

/** Hoechstgroesse des Lebenslaufs: die bisherigen 11.000.000 Zeichen base64. */
export const LEBENSLAUF_MAX_BYTES = 8_250_000;

/**
 * Ein Lebenslauf als data:-Adresse ist nur als PDF erlaubt, wie im Formular.
 * Geprueft wird der Inhalt, nicht nur die Angabe davor: gueltiges base64,
 * hoechstens LEBENSLAUF_MAX_BYTES, und die Datei beginnt mit "%PDF-".
 */
export function erlaubterLebenslauf(url: string): boolean {
  const treffer = /^data:application\/pdf;base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
  if (!treffer) return false;
  const roh = treffer[1].replace(/\s/g, "");
  if (roh.length < 8 || roh.length % 4 !== 0) return false;
  const bytes = (roh.length / 4) * 3 - (roh.endsWith("==") ? 2 : roh.endsWith("=") ? 1 : 0);
  if (bytes > LEBENSLAUF_MAX_BYTES) return false;
  try {
    // Die ersten acht Zeichen ergeben sechs Bytes, genug fuer "%PDF-".
    return atob(roh.slice(0, 8)).startsWith("%PDF-");
  } catch {
    return false;
  }
}
