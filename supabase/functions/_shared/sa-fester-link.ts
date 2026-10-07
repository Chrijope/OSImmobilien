/**
 * Ein fester Selbstauskunfts-Link je Kontakt, Investment und Person.
 *
 * Freigabe der Geschaeftsfuehrung vom 07.10.2026. Frueher legte jeder Versand
 * einen neuen Link an, der nach sieben Tagen ablief. Kunden oeffneten dann
 * den Link aus einer aelteren Mail und landeten vor "Ungueltiger Link".
 *
 * Welcher Link wiederverwendet, widerrufen oder neu angelegt wird, entscheidet
 * die Datenbank (`sa_link_ausstellen`, Migration 20261007100000) in einer
 * Transaktion. Hier liegt nur, was die Functions daneben brauchen. Reine
 * Rechnerei ohne Netz, damit sie in Vitest und Deno pruefbar ist.
 */

/** Tage, die ein Link nach der letzten Aktivitaet gilt. */
export const SA_LINK_GUELTIG_TAGE = 30;

/** Neuer Ablauf: 30 Tage ab jetzt, nie frueher als der bisherige. */
export function saLinkAblauf(jetzt: Date, bisher?: string | null): string {
  const neu = jetzt.getTime() + SA_LINK_GUELTIG_TAGE * 24 * 60 * 60 * 1000;
  const alt = bisher ? new Date(bisher).getTime() : NaN;
  return new Date(Number.isNaN(alt) ? neu : Math.max(neu, alt)).toISOString();
}

type Daten = Record<string, unknown>;
const istObjekt = (w: unknown): w is Daten => !!w && typeof w === "object" && !Array.isArray(w);

/**
 * Was ein Link fuer diese Person in den Stand schreiben darf.
 *
 * Person 1 ersetzt den Stand (gemeinsamer Antrag, sie fuellt Person 2 mit
 * aus). Person 2 traegt nur `person2Data` in den vorhandenen Stand ein, die
 * Angaben von Person 1 bleiben unberuehrt. Gleiche Regel wie
 * `sa_daten_fuer_person` in der Datenbank.
 */
export function saDatenFuerPerson(personNr: unknown, eingabe: unknown, bestand: unknown): Daten {
  if (Number(personNr) !== 2) return istObjekt(eingabe) ? eingabe : {};
  const p2 = istObjekt(eingabe) && istObjekt(eingabe.person2Data) ? eingabe.person2Data : {};
  return { ...(istObjekt(bestand) ? bestand : {}), person2: true, person2Data: p2 };
}

/**
 * Fehlt die Datenbankfunktion noch (Migration nicht gelaufen)? Dann faellt
 * die Function auf den alten Weg zurueck. PostgREST meldet PGRST202,
 * Postgres selbst 42883.
 */
export function rpcFehlt(fehler: unknown): boolean {
  if (!fehler || typeof fehler !== "object") return false;
  const code = String((fehler as { code?: unknown }).code ?? "");
  return code === "PGRST202" || code === "42883";
}

/**
 * Was ein Link fuer diese Person herausbekommt: Person 1 alles, Person 2 nur
 * `person2Data`. Gleiche Regel wie `sa_daten_sicht` in der Datenbank.
 */
export function saDatenSicht(personNr: unknown, daten: unknown): Daten | null {
  if (!istObjekt(daten)) return null;
  if (Number(personNr) !== 2) return daten;
  return { person2: true, person2Data: istObjekt(daten.person2Data) ? daten.person2Data : {} };
}

/**
 * Darf ein Link dieser Person diese Unterschrift einreichen? Person 2 nur
 * `person2`; Person 1 wie bisher (sie unterschreibt im selben Fenster auch
 * fuer Person 2). Gleiche Regel wie `sa_signatur_passt` in der Datenbank.
 */
export function saSignaturErlaubt(personNr: unknown, personType: unknown): boolean {
  if (Number(personNr) !== 2) return true;
  return String(personType ?? "").trim().toLowerCase() === "person2";
}

/** Unterschriften je `person_type`: fuer Person 2 nur ihre eigene. */
export function saUnterschriftenSicht<T>(personNr: unknown, unterschriften: Record<string, T> | null | undefined): Record<string, T> | undefined {
  if (!unterschriften) return undefined;
  if (Number(personNr) !== 2) return unterschriften;
  return Object.fromEntries(Object.entries(unterschriften).filter(([typ]) => saSignaturErlaubt(2, typ)));
}

/** Liegt unter diesen offenen Links einer an einer anderen Adresse? */
export function andereAdresseOffen(offene: readonly { email?: string | null }[], email: string): boolean {
  const ziel = String(email ?? "").trim().toLowerCase();
  return offene.some((z) => String(z.email ?? "").trim().toLowerCase() !== ziel);
}

/** Wie lange ein abgeschlossener Link noch Angaben abholen darf (PDF danach). */
export const SA_LINK_NACH_ABSCHLUSS_MS = 2 * 60 * 60 * 1000;

/**
 * Ist dieser abgeschlossene Link gerade erst abgeschlossen worden? Massgeblich
 * ist `abgeschlossen_am` (gesetzt von `sa_link_abschliessen`); fehlt die
 * Spalte noch (Migration offen), `updated_at`. Eine gesetzte, aber leere
 * Spalte heisst: nicht ueber den Abschluss dieses Links beendet (etwa von
 * `finalize` mit geschlossen), dann nie.
 */
export function saLinkFrischAbgeschlossen(zeile: Record<string, unknown>, jetzt: Date): boolean {
  const mitSpalte = Object.prototype.hasOwnProperty.call(zeile, "abgeschlossen_am");
  const wert = mitSpalte ? zeile.abgeschlossen_am : zeile.updated_at;
  const t = typeof wert === "string" ? Date.parse(wert) : NaN;
  if (Number.isNaN(t)) return false;
  const alter = jetzt.getTime() - t;
  return alter >= -60_000 && alter <= SA_LINK_NACH_ABSCHLUSS_MS;
}

/** Nur Person 1 oder 2; alles andere ist kein gueltiger Link. */
export function saPersonNr(wert: unknown): 1 | 2 | null {
  if (wert === undefined || wert === null || wert === "") return 1;
  const n = Number(wert);
  return n === 1 || n === 2 ? n : null;
}
