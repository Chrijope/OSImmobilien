/**
 * Der Sammelmodus von `objekt-texte-ki`: Beschreibung, Standortargumente und
 * Sanierungen für alle sichtbaren Objekte auf dem Server nachholen.
 *
 * WARUM ES IHN GIBT
 *
 * Christian am 23.09.2026: Jedes sichtbare Objekt muss Beschreibung und
 * Standort mit Argumenten tragen, und jedes neue aus dem Investagon-Import
 * soll schon gefüllt ankommen. Der Sammellauf im Browser erreicht das nicht,
 * denn er läuft nur, wenn jemand den Knopf drückt. Deshalb stößt der Import
 * am Ende jedes echten Laufs diesen Modus an, und der arbeitet den Bestand in
 * kleinen Etappen ab.
 *
 * WER IHN AUFRUFEN DARF
 *
 * Nur ein Aufruf mit dem Service-Role-Schlüssel als Anmeldetoken, also nur
 * eine andere Function. Im Sammelmodus liest und schreibt die Function mit der
 * Dienstrolle und damit an der Zeilensicherheit vorbei. Ein Nutzertoken darf
 * das nie auslösen, auch nicht das eines Admins.
 *
 * Die Datei ist reine Rechnung ohne Deno-Eigenheiten. Getestet wird sie in
 * `src/lib/objektTexteSammelmodus.test.ts`.
 */

import { OBJEKT_TEXTE_SCHEMA } from "./objekt-texte.ts";

/**
 * Höchstens so viele Objekte je Anstoß.
 *
 * Eine Edge Function darf nur begrenzt lange laufen, und jedes Objekt kostet
 * eine Messung und einen KI-Aufruf, zusammen oft 15 bis 30 Sekunden. Sechs
 * sind die Obergrenze; meist setzt vorher die Zeitgrenze `SAMMEL_START_BIS_MS`
 * den Schlusspunkt. Der Import stößt alle 15 Minuten an, der Bestand wird also
 * über einige Stunden abgearbeitet.
 */
export const SAMMEL_LIMIT_MAX = 6;

/**
 * Nach so vielen Millisekunden beginnt der Lauf kein neues Objekt mehr.
 *
 * Ein angefangenes Objekt braucht im schlimmsten Fall Adresssuche (8 s),
 * Overpass (25 s) und KI (50 s). 55 Sekunden Vorlauf plus dieser schlimmste
 * Fall bleiben unter den 150 Sekunden, die eine Edge Function höchstens hat.
 */
export const SAMMEL_START_BIS_MS = 55_000;

/** Pause zwischen zwei Objekten, aus Höflichkeit gegenüber Gateway und Overpass. */
export const SAMMEL_PAUSE_MS = 1_500;

/** Die gewünschte Zahl je Anstoß, auf 1 bis `SAMMEL_LIMIT_MAX` begrenzt. */
export function sammelLimit(roh: unknown): number {
  const n = typeof roh === "number" ? roh : typeof roh === "string" && roh.trim() ? Number(roh) : NaN;
  if (!Number.isFinite(n) || n < 1) return SAMMEL_LIMIT_MAX;
  return Math.min(SAMMEL_LIMIT_MAX, Math.floor(n));
}

/**
 * Vergleich in gleichbleibender Zeit.
 *
 * Dasselbe Muster wie `gleichInFesterZeit` in `automatik-schutz.ts`. Dort ist
 * die Funktion nicht exportiert, und die Datei greift auf `Deno.env` zu, was
 * die Tests im Browser-Teil nicht kennen. Deshalb steht sie hier noch einmal.
 * Die Längenprüfung vorweg verrät nur die Länge.
 */
function gleichInFesterZeit(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

/**
 * Kommt dieser Aufruf von einer anderen Function mit der Dienstrolle?
 *
 * Verlangt wird genau `Authorization: Bearer <Service-Role-Schlüssel>`. Ist
 * der Schlüssel in der Umgebung leer, ist die Antwort immer nein, sonst
 * passte ein leerer Kopf auf einen leeren Schlüssel.
 */
export function istDienstAufruf(authorization: string | null | undefined, dienstSchluessel: string | null | undefined): boolean {
  const treffer = /^bearer\s+(.+)$/i.exec((authorization || "").trim());
  return treffer ? istDienstSchluessel(treffer[1], dienstSchluessel) : false;
}

/** Ist dieser Wert genau der Service-Role-Schlüssel? Ein leerer passt nie. */
function istDienstSchluessel(wert: string | null | undefined, dienstSchluessel: string | null | undefined): boolean {
  const schluessel = (dienstSchluessel || "").trim();
  const kandidat = (wert || "").trim();
  if (!schluessel || !kandidat) return false;
  return gleichInFesterZeit(kandidat, schluessel);
}

/**
 * Kommt diese Anfrage von einer anderen Function mit der Dienstrolle, egal
 * in welchem Kopf der Schlüssel steht?
 *
 * Die Functions rufen einander mit `createClient(url, SERVICE_ROLE_KEY)` und
 * `functions.invoke` auf. Ist der Schlüssel im neuen Format (`sb_secret_…`),
 * schickt supabase-js ihn dabei nicht mehr als `Authorization: Bearer`,
 * sondern nur noch im Kopf `apikey`. Wer nur den Bearer prüft, hält solche
 * Aufrufe für anonym. Der Kopf `apikey` zählt nur, wenn er genau der geheime
 * Schlüssel ist; der öffentliche Schlüssel aus dem Browser passt nie.
 */
export function istDienstAnfrage(
  koepfe: { get(name: string): string | null },
  dienstSchluessel: string | null | undefined,
): boolean {
  return istDienstAufruf(koepfe.get("Authorization"), dienstSchluessel)
    || istDienstSchluessel(koepfe.get("apikey"), dienstSchluessel);
}

/**
 * Braucht ein Objekt mit diesem gespeicherten Stand einen Lauf?
 *
 * Ja, wenn gar nichts gespeichert ist oder nur eine ältere Fassung, auch ein
 * alter Vermerk ohne Ergebnis. Ein Vermerk der aktuellen Fassung zählt als
 * erledigt: Er entsteht nur noch, wenn zum Objekt gar keine Angaben
 * vorliegen, und ein neuer Lauf fände dieselbe Lücke.
 */
export function standBrauchtLauf(schema: unknown): boolean {
  const n = typeof schema === "number" ? schema : typeof schema === "string" && schema.trim() ? Number(schema) : NaN;
  return !Number.isFinite(n) || n < OBJEKT_TEXTE_SCHEMA;
}

/** Eine Zeile der Auswahlabfrage. `texte_schema` ist `meta->objekttexteKi->schema`. */
export interface SammelZeile {
  id?: unknown;
  titel?: unknown;
  erstellt_am?: unknown;
  texte_schema?: unknown;
}

/**
 * Die Objekte, die einen Lauf brauchen, in der Reihenfolge der Abarbeitung.
 *
 * Zuerst die ohne jeden Stand, darunter die neuesten zuerst: Das sind die
 * frisch importierten, und die sollen schnell gefüllt sein. Danach die mit
 * einem Stand älterer Fassung. Die Zahl je Lauf begrenzt der Aufrufer, denn
 * einzelne Objekte können unterwegs noch wegfallen.
 */
export function waehleSammelObjekte(zeilen: SammelZeile[] | null | undefined): Array<{ id: string; titel: string }> {
  return (zeilen || [])
    .map((z, platz) => ({ z, platz }))
    .filter(({ z }) => typeof z?.id === "string" && !!z.id && standBrauchtLauf(z.texte_schema))
    .map(({ z, platz }) => ({
      id: z.id as string,
      titel: typeof z.titel === "string" ? z.titel : "",
      ohneStand: z.texte_schema === null || z.texte_schema === undefined,
      erstellt: typeof z.erstellt_am === "string" ? z.erstellt_am : "",
      platz,
    }))
    .sort((a, b) => {
      if (a.ohneStand !== b.ohneStand) return a.ohneStand ? -1 : 1;
      return b.erstellt.localeCompare(a.erstellt) || a.platz - b.platz;
    })
    .map(({ id, titel }) => ({ id, titel }));
}
