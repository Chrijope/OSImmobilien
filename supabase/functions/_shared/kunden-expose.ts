/**
 * Der Kundenlink: gemeinsame Regeln für den Versand (`send-kunden-expose`),
 * die beiden Kundenseiten (`get-expose` für das Exposé, `get-kundenansicht`
 * für die Objektübersicht) und die Mailvorlage (`kunden-expose.tsx`).
 *
 * Seit dem 23.09.2026 ist „Kundenlink senden“ ein einziger Weg: Der Link geht
 * per Mail mit einem Knopf hinaus, oder er wird kopiert, etwa für WhatsApp.
 * Beides legt ihn im Kundenprofil unter „Gesendete Links“ ab.
 *
 * Zwei Arten (Spalte `objekt_exposes.art`, Migration 20260923171000):
 *   - `objektuebersicht` (Standard): die Kundenansicht des Hauses. EIN Link
 *     je Kunde, Investment und Objekt; er öffnet bei der Wohnung, aus der er
 *     zuletzt gesendet wurde (`einstieg_wohnung_id`), und der Kunde sieht
 *     alle freien Wohnungen des Hauses.
 *   - `expose`: das Exposé genau einer Einheit oder des ganzen Objekts, wie
 *     bisher je Einheit.
 *
 * Entscheidungen von Christian, die hier festgehalten sind:
 *   - Der Link ist persönlich und 60 Tage gültig, jederzeit zurückziehbar.
 *     Erneut senden verlängert ihn, Zurückziehen ist endgültig.
 *   - Der Link zeigt neutrale Rechenannahmen, nie Werte aus der
 *     Selbstauskunft. Er kann weitergeleitet werden.
 *   - In der Mail stehen keine Preise.
 *   - Für den Kunden heißt die Kundenansicht „Objektübersicht“.
 *
 * Bewusst ohne Deno-Importe: Vitest liest diese Datei über die
 * Verzeichnisgrenze hinweg (siehe `src/lib/kundenExposeVersand.test.ts`).
 * Der Browser hat dieselbe Linkregel in `src/lib/objektExposeStore.ts`
 * (`kundenExposeLink`); ein Test hält beide gleich.
 */

/** Die veröffentlichte Adresse. Fest, nie die Vorschau-Adresse von Lovable. */
export const KUNDEN_EXPOSE_BASIS = "https://osimmobilien.netlify.app";

/** So lange gilt ein gesendeter Link. */
export const KUNDEN_EXPOSE_GUELTIG_TAGE = 60;

/** Die Meldung, solange die Migration 20260923151000 nicht gelaufen ist. */
export const EXPOSE_VERSAND_MIGRATION_FEHLT = "Migration Exposé-Versand noch nicht ausgeführt";

/**
 * Die Meldung, solange die Migration 20260923171000 (Spalten `art` und
 * `einstieg_wohnung_id`) nicht gelaufen ist. Betrifft nur die
 * Objektübersicht, das Exposé geht ohne sie weiter wie bisher.
 */
export const KUNDENLINK_MIGRATION_FEHLT = "Migration Kundenlink noch nicht ausgeführt";

/**
 * Die Meldung, solange die Migration 20261005100000 (Spalte
 * `wohnung_auswahl`) nicht gelaufen ist. Betrifft nur eine Objektübersicht,
 * die nicht alle Wohnungen zeigen soll. Mit allen Wohnungen geht sie ohne die
 * Migration weiter wie bisher; eine Auswahl, die sich nicht speichern lässt,
 * schickt die Function dagegen nicht hinaus, sonst sähe der Kunde mehr
 * Wohnungen als gewählt.
 */
export const KUNDENLINK_AUSWAHL_MIGRATION_FEHLT =
  "Migration Wohnungsauswahl noch nicht ausgeführt. Bis dahin geht die Objektübersicht nur mit allen Wohnungen";

/** Was der Link öffnet. Siehe Kopf dieser Datei. */
export type KundenlinkArt = "expose" | "objektuebersicht";

/** Die Wahl im Fenster „Kundenlink senden“ steht auf der Objektübersicht. */
export const KUNDENLINK_ART_STANDARD: KundenlinkArt = "objektuebersicht";

export function istKundenlinkArt(wert: unknown): wert is KundenlinkArt {
  return wert === "expose" || wert === "objektuebersicht";
}

/** Wie der Kunde und das CRM die Art nennen. */
export function kundenlinkArtName(art: KundenlinkArt): string {
  return art === "objektuebersicht" ? "Objektübersicht" : "Exposé";
}

/**
 * Der persönliche Kundenlink. Mit Einheit das Exposé der Einheit, ohne
 * Einheit das des ganzen Objekts (Globalobjekt).
 */
export function kundenExposeLink(objektId: string, wohnungId: string | null | undefined, token: string): string {
  const pfad = wohnungId
    ? `/expose/${encodeURIComponent(objektId)}/wohnung/${encodeURIComponent(wohnungId)}`
    : `/expose/${encodeURIComponent(objektId)}`;
  return `${KUNDEN_EXPOSE_BASIS}${pfad}?token=${encodeURIComponent(token)}`;
}

/**
 * Der persönliche Link zur Objektübersicht. Nur der Schlüssel steht darin:
 * Die Einstiegswohnung liest `get-kundenansicht` aus der Zeile
 * (`einstieg_wohnung_id`). So bleibt der Link derselbe, wenn er später aus
 * einer anderen Wohnung erneut gesendet wird.
 */
export function kundenansichtLink(token: string): string {
  return `${KUNDEN_EXPOSE_BASIS}/immobilie/${encodeURIComponent(token)}`;
}

/** Der Link je Art. Beim Exposé gehört die Einheit in die Adresse, bei der Objektübersicht nicht. */
export function kundenlinkFuer(art: KundenlinkArt, objektId: string, wohnungId: string | null | undefined, token: string): string {
  return art === "objektuebersicht" ? kundenansichtLink(token) : kundenExposeLink(objektId, wohnungId, token);
}

/** Ablauf eines Links, der jetzt hinausgeht. */
export function gueltigBisAb(jetzt: Date): Date {
  return new Date(jetzt.getTime() + KUNDEN_EXPOSE_GUELTIG_TAGE * 24 * 60 * 60 * 1000);
}

/** „22. November 2026“, in deutscher Zeit. */
export function datumLang(datum: Date): string {
  return datum.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

/**
 * „Wohnung 7“ aus der Einheitennummer, wie im Kopf des Exposés
 * (`src/lib/exposeInhalt.ts`). Ein vorangestelltes „WE“ fällt weg, es ist
 * Fachsprache und sagt dem Kunden nichts.
 */
export function wohnungTitel(weNr: string | null | undefined): string {
  const nummer = String(weNr ?? "").replace(/^WE\s*/i, "").trim();
  return nummer ? `Wohnung ${nummer}` : "Wohnung";
}

function sauber(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

export interface ExposeBezeichnungEingabe {
  /** Einheitennummer. Leer beim Exposé des ganzen Objekts. */
  weNr?: string | null;
  /** Mit Einheit wird daraus „Wohnung 7“, ohne Einheit steht der Objekttitel vorn. */
  mitEinheit: boolean;
  objektTitel?: string | null;
  adresse?: string | null;
  ort?: string | null;
}

/**
 * Die drei Teile, unter denen der Kunde das Exposé wiedererkennt:
 * Wohnung (oder Objekt), Straße, Ort. Doppelte Teile fallen weg, etwa wenn
 * der Objekttitel schon die Straße ist.
 */
export function exposeBezeichnungTeile(e: ExposeBezeichnungEingabe): string[] {
  const vorn = e.mitEinheit ? wohnungTitel(e.weNr) : sauber(e.objektTitel);
  const teile: string[] = [];
  for (const teil of [vorn, sauber(e.adresse), sauber(e.ort)]) {
    if (!teil) continue;
    if (teile.some((t) => t.toLowerCase() === teil.toLowerCase())) continue;
    teile.push(teil);
  }
  return teile;
}

/** „Wohnung 7, Parkstraße 8, Augsburg“. */
export function exposeBezeichnung(e: ExposeBezeichnungEingabe): string {
  return exposeBezeichnungTeile(e).join(", ");
}

/**
 * Die Bezeichnung in der Kundensprache (Etappe 2). Aus „Wohnung 7“ wird
 * englisch „Apartment 7“, wie im Portal. Straße und Ort bleiben, wie sie sind.
 */
export function bezeichnungInSprache(bezeichnung: string | null | undefined, sprache?: unknown): string {
  const b = sauber(bezeichnung);
  if (sprache !== "en") return b;
  return b.replace(/(^|,\s*)Wohnung(?=\s|,|$)/g, "$1Apartment");
}

/** Der Betreff der Mail. Ohne Bezeichnung bleibt es beim schlichten Satz. */
export function kundenExposeBetreff(bezeichnung: string | null | undefined, sprache?: unknown): string {
  const b = bezeichnungInSprache(bezeichnung, sprache);
  if (sprache === "en") return b ? `Your personal exposé: ${b}` : "Your personal exposé";
  return b ? `Dein persönliches Exposé: ${b}` : "Dein persönliches Exposé";
}

/** Der Betreff je Art: „Deine Objektübersicht: Wohnung 7, Parkstraße 8, Augsburg“. */
export function kundenlinkBetreff(art: unknown, bezeichnung: string | null | undefined, sprache?: unknown): string {
  if (art !== "objektuebersicht") return kundenExposeBetreff(bezeichnung, sprache);
  const b = bezeichnungInSprache(bezeichnung, sprache);
  if (sprache === "en") return b ? `Your property overview: ${b}` : "Your property overview";
  return b ? `Deine Objektübersicht: ${b}` : "Deine Objektübersicht";
}

/** Der Satz unter dem Knopf. Das Datum kommt schon in der Sprache der Mail. */
export function gueltigkeitsSatz(gueltigBis: string | null | undefined, sprache?: unknown): string {
  const datum = sauber(gueltigBis);
  if (sprache === "en") return datum ? `This link is personal and valid until ${datum}.` : "This link is personal.";
  return datum ? `Der Link ist persönlich und bis ${datum} gültig.` : "Der Link ist persönlich.";
}

/**
 * Fehlt eine Spalte aus der Migration 20260923151000?
 *
 * Postgres meldet eine unbekannte Spalte mit `42703`, PostgREST mit
 * `PGRST204` (beim Schreiben) oder mit einem Satz über den Schema-Cache.
 */
export function versandSpalteFehlt(fehler: unknown): boolean {
  if (!fehler || typeof fehler !== "object") return false;
  const f = fehler as { code?: unknown; message?: unknown };
  const code = typeof f.code === "string" ? f.code : "";
  if (code === "42703" || code === "PGRST204") return true;
  const text = typeof f.message === "string" ? f.message : "";
  return /column .* does not exist|could not find the .* column/i.test(text);
}

/*
 * Die Glocke beim ersten Öffnen, je Art. Läuten lässt sie die Function, die
 * den Link ausliefert (`get-expose` für das Exposé, `get-kundenansicht` für
 * die Objektübersicht); hier stehen nur die Texte, damit beide gleich reden.
 */

/** „Martina hat deine Objektübersicht geöffnet“. Ohne Vornamen der Nachname, sonst „Dein Kunde“. */
export function kundenlinkGlockenTitel(art: KundenlinkArt, vorname: string | null | undefined, nachname?: string | null): string {
  const wer = sauber(vorname) || sauber(nachname) || "Dein Kunde";
  return art === "objektuebersicht" ? `${wer} hat deine Objektübersicht geöffnet` : `${wer} hat dein Exposé geöffnet`;
}

/** Der Text unter der Glocke. */
export function kundenlinkGlockenText(art: KundenlinkArt, bezeichnung: string | null | undefined): string {
  const b = sauber(bezeichnung);
  const was = art === "objektuebersicht" ? "Die Objektübersicht" : "Das Exposé";
  return b ? `${was} ${b} wurde zum ersten Mal aufgerufen.` : `${was} wurde zum ersten Mal aufgerufen.`;
}
