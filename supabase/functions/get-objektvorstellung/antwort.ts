/**
 * Was `get-objektvorstellung` seit dem 23.09.2026 noch herausgibt.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Die interaktive Objektvorstellung ist abgeschaltet. Exposé, Kundenansicht
 * und „Kundenlink senden“ decken sie ab (Entscheidung von Christian am
 * 23.09.2026). Bereits verschickte Links sollen aber nicht ins Leere laufen:
 * Die Seite `/objektvorstellung/:token` zeigt einen Hinweis mit den
 * Kontaktdaten des zuständigen Partners.
 *
 * Bis dahin gab diese Function zu jedem Token ganze Zeilen heraus, mit
 * `select("*")`: Kontakt samt `meta`, das Investment samt Selbstauskunft,
 * Objekt und Einheiten samt `meta.investagonRaw` (darin die eigene
 * Provision), Kundendokumente mit signierten Adressen und den Partner samt
 * Kennung und Buchungslinks. Das ist vorbei.
 *
 * HEUTE GILT
 *
 *   - Ungültiger oder unbekannter Token: 404, ohne jede Angabe.
 *   - Gültiger Token: 410 und höchstens die vier Angaben des Partners
 *     (Name, Telefon, E-Mail, Bild), dieselbe Positivliste wie beim
 *     abgelaufenen Exposé (`oeffentlicherAnsprechpartner`).
 *
 * Gelesen werden genau drei Zeilen und davon nur die nötigen Spalten
 * (seit dem 25.09.2026 am Kontakt auch `meta`, nur für die Sprache). Es wird
 * nichts geschrieben, auch der Aufrufzähler nicht mehr: Die Tabelle
 * `objektvorstellungen` bleibt stehen, wird aber nicht mehr beschrieben.
 *
 * Hier stehen nur reine Regeln ohne Deno-Bezug, damit Vitest sie prüfen kann
 * (`src/lib/objektvorstellungAntwort.test.ts`).
 */
import { oeffentlicherAnsprechpartner } from "../_shared/expose-oeffentlich.ts";
import { spracheAusMeta, type Sprache } from "../_shared/kunden-sprache.ts";

export type OeffentlicherPartner = NonNullable<ReturnType<typeof oeffentlicherAnsprechpartner>>;

/** Die kleinste Sicht auf den Datenbankzugang, die hier gebraucht wird: nur lesen. */
export interface LeseClient {
  from(tabelle: string): {
    select(spalten: string): {
      eq(spalte: string, wert: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
}

export interface VorstellungsAntwort {
  status: 404 | 410;
  body: { nichtMehrVerfuegbar: true; ansprechpartner?: OeffentlicherPartner; sprache?: Sprache } | { error: "Nicht gefunden" };
}

export const NICHT_GEFUNDEN: VorstellungsAntwort = { status: 404, body: { error: "Nicht gefunden" } };

/**
 * So sieht ein Token der Objektvorstellung aus: eine UUID ohne Bindestriche,
 * also 32 Hexzeichen (Standardwert der Spalte seit der Migration
 * 20260709103340). Alles andere fragt gar nicht erst die Datenbank.
 */
export function istVorstellungsToken(token: unknown): token is string {
  return typeof token === "string" && /^[0-9a-f]{32}$/i.test(token);
}

function kennung(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function eineZeile(db: LeseClient, tabelle: string, spalten: string, spalte: string, wert: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from(tabelle).select(spalten).eq(spalte, wert).maybeSingle();
  if (error || !data || typeof data !== "object") return null;
  return data as Record<string, unknown>;
}

/**
 * Die Antwort zu einem Token.
 *
 * Dazu die Sprache des Kunden (`kontakte.meta.kundenSprache`, Plan
 * Kundensprache Etappe 3), damit der Hinweis in seiner Sprache erscheint.
 * Nur „de“ oder „en“, ohne Kontakt fehlt sie.
 *
 * Der Partner ist der für den Kunden zuständige (`kontakte.zustaendig_id`),
 * sonst der Ersteller der Objektvorstellung; dieselbe Reihenfolge wie beim
 * Exposé. Scheitert das Nachschlagen des Partners, geht der Hinweis ohne
 * Partner hinaus, die Seite nennt dann die allgemeine Adresse.
 */
export async function vorstellungsAntwort(db: LeseClient, token: unknown): Promise<VorstellungsAntwort> {
  if (!istVorstellungsToken(token)) return NICHT_GEFUNDEN;

  const vorstellung = await eineZeile(db, "objektvorstellungen", "kontakt_id, erstellt_von", "token", token);
  if (!vorstellung) return NICHT_GEFUNDEN;

  let partnerId: string | null = null;
  let sprache: Sprache | undefined;
  const kontaktId = kennung(vorstellung.kontakt_id);
  if (kontaktId) {
    const kontakt = await eineZeile(db, "kontakte", "zustaendig_id, meta", "id", kontaktId);
    partnerId = kennung(kontakt?.zustaendig_id);
    if (kontakt) sprache = spracheAusMeta(kontakt.meta);
  }
  partnerId = partnerId || kennung(vorstellung.erstellt_von);

  let ansprechpartner: OeffentlicherPartner | undefined;
  if (partnerId) {
    const profil = await eineZeile(db, "profiles", "name, telefon, email, avatar_url", "id", partnerId);
    ansprechpartner = oeffentlicherAnsprechpartner(profil);
  }

  return {
    status: 410,
    body: { nichtMehrVerfuegbar: true, ...(ansprechpartner ? { ansprechpartner } : {}), ...(sprache ? { sprache } : {}) },
  };
}
