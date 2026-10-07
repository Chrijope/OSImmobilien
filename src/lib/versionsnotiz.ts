/**
 * „Neu im CRM“: die Versionsnotiz aus `public/versionsnotiz.json`.
 *
 * Wer die Einträge auf der News-Seite sieht, regelt `neuImCrmZugang.ts`
 * (seit 26.09.2026 alle, gefiltert nach `zielrollen`). Die Entscheidung über das Neuladen weiter unten gilt dagegen
 * für alle.
 *
 * Warum die Datei unter `public` liegt und nicht im Code: Ein Browser mit dem
 * alten Programmstand soll die Notiz der NEUEN Fassung lesen können, bevor er
 * neu lädt. Nur so weiß er, ob unter den neuen Einträgen einer `kritisch` ist
 * und er den Nutzer deshalb ausdrücklich bitten muss, neu zu laden. Eine
 * Datei unter `public` liefert der Server immer in der neuesten Fassung aus.
 *
 * Die höchste Nummer, die dieser Programmstand kennt, baut Vite beim Build
 * als `__VERSIONSNOTIZ_NR__` ein (siehe `vite.config.ts`).
 *
 * Gelesen wird wie bei den Datenbank-News über `markNewsAsRead`, also in
 * `user_settings.news_read_ids`. Die Kennung eines Eintrags ist dort
 * `neu-im-crm-<nr>`, damit sie sich nie mit einer News-Kennung überschneidet.
 * Dafür braucht es keine Tabelle und keine Migration.
 *
 * Freigabe (seit 27.09.2026): Einträge ab `FREIGABE_PFLICHT_AB_NR` sieht
 * zuerst nur Christian. Er gibt sie auf der News-Seite frei oder lehnt sie ab,
 * der Stand liegt in `app_config` (siehe `neuImCrmZugang.ts`). Achtung: Die
 * Datei unter `public` ist für jeden abrufbar, auch ohne Anmeldung. Die
 * Freigabe steuert also nur, was das CRM anzeigt, sie hält nichts geheim.
 */

export type VersionsnotizArt = "neu" | "geaendert" | "behoben";

export interface VersionsnotizEintrag {
  nr: number;
  /** ISO-Datum, `2026-09-26`. */
  datum: string;
  art: VersionsnotizArt;
  titel: string;
  /** Rollenkennungen wie in `types/user.ts`, oder `"alle"`. */
  zielrollen: string[];
  kurztext: string;
  wasHeisstDasFuerDich?: string[];
  soFindestDuEs?: string;
  angepinnt?: boolean;
  /** Nur, wenn alter Code mit neuer Datenbank nicht mehr richtig speichert. */
  kritisch: boolean;
}

/** Die höchste Nummer, die dieser Programmstand kennt. Ohne Build (Tests) 0. */
export const BEKANNTE_NOTIZ_NR: number =
  typeof __VERSIONSNOTIZ_NR__ === "number" ? __VERSIONSNOTIZ_NR__ : 0;

const ARTEN: readonly string[] = ["neu", "geaendert", "behoben"];

/**
 * Prüft, was vom Server kam. Keine Liste: `null`, das heißt „Notiz nicht
 * lesbar“, und dann gilt das alte Verhalten. Einzelne kaputte Einträge fallen
 * weg, statt die ganze Notiz zu verwerfen.
 */
export function pruefeVersionsnotiz(roh: unknown): VersionsnotizEintrag[] | null {
  if (!Array.isArray(roh)) return null;
  return roh.filter((e): e is VersionsnotizEintrag =>
    !!e && typeof e === "object"
    && Number.isFinite((e as VersionsnotizEintrag).nr)
    && typeof (e as VersionsnotizEintrag).titel === "string"
    && ARTEN.includes((e as VersionsnotizEintrag).art)
    && Array.isArray((e as VersionsnotizEintrag).zielrollen),
  );
}

let geladen: VersionsnotizEintrag[] = [];

/**
 * Holt die Notiz frisch vom Server. `null` bei Netzfehler oder unlesbarer
 * Datei, still, ohne Eintrag in der Konsole. Nach Erfolg zählt die
 * Seitenleiste über `news-updated` neu.
 */
export async function ladeVersionsnotiz(
  holen: typeof fetch = fetch,
): Promise<VersionsnotizEintrag[] | null> {
  try {
    const antwort = await holen("/versionsnotiz.json", { cache: "reload" });
    if (!antwort.ok) return null;
    const eintraege = pruefeVersionsnotiz(await antwort.json());
    if (eintraege) {
      geladen = eintraege;
      window.dispatchEvent(new CustomEvent("news-updated"));
    }
    return eintraege;
  } catch {
    return null;
  }
}

/** Was zuletzt geladen wurde, sonst eine leere Liste. */
export function geladeneVersionsnotiz(): VersionsnotizEintrag[] {
  return geladen;
}

/** Ab dieser Nummer wartet ein Eintrag auf Christians Freigabe. 1 bis 24 waren schon an alle ausgespielt. */
export const FREIGABE_PFLICHT_AB_NR = 25;

export type NotizFreigabe = "frei" | "abgelehnt";
/** Schlüssel ist die Nummer als Text, `{"25":"frei","26":"abgelehnt"}`. */
export type NotizFreigaben = Readonly<Record<string, NotizFreigabe>>;
export type NotizFreigabeStand = NotizFreigabe | "offen";

/** Nimmt nur gültige Werte aus der Datenbank, alles andere zählt als nicht entschieden. */
export function pruefeNotizFreigaben(roh: unknown): NotizFreigaben {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return {};
  return Object.fromEntries(
    Object.entries(roh).filter(([, w]) => w === "frei" || w === "abgelehnt"),
  ) as NotizFreigaben;
}

/** Eine Entscheidung gilt immer. Ohne Entscheidung: Bestand frei, alles Neue offen. */
export function notizFreigabeStand(e: VersionsnotizEintrag, freigaben: NotizFreigaben): NotizFreigabeStand {
  return freigaben[String(e.nr)] ?? (e.nr < FREIGABE_PFLICHT_AB_NR ? "frei" : "offen");
}

/**
 * Christians Überarbeitung eines Eintrags vor der Freigabe (seit 30.09.2026).
 *
 * Die Datei unter `public` lässt sich aus dem Browser nicht ändern. Deshalb
 * liegt der geänderte Text wie die Freigabe in `app_config` und wird beim
 * Anzeigen über den Eintrag gelegt. Nur Textfelder, Nummer, Art, Rollen und
 * `kritisch` bleiben wie in der Datei.
 */
export type NotizUeberarbeitung = Partial<Pick<VersionsnotizEintrag, "titel" | "kurztext" | "wasHeisstDasFuerDich" | "soFindestDuEs">>;
/** Schlüssel ist die Nummer als Text, wie bei den Freigaben. */
export type NotizUeberarbeitungen = Readonly<Record<string, NotizUeberarbeitung>>;

/** Nimmt nur Textfelder mit dem richtigen Typ, alles andere fällt weg. */
export function pruefeNotizUeberarbeitungen(roh: unknown): NotizUeberarbeitungen {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return {};
  const ergebnis: Record<string, NotizUeberarbeitung> = {};
  for (const [nr, w] of Object.entries(roh as Record<string, unknown>)) {
    if (!w || typeof w !== "object" || Array.isArray(w)) continue;
    const u = w as Record<string, unknown>;
    const sauber: NotizUeberarbeitung = {};
    if (typeof u.titel === "string" && u.titel.trim()) sauber.titel = u.titel;
    if (typeof u.kurztext === "string") sauber.kurztext = u.kurztext;
    if (typeof u.soFindestDuEs === "string") sauber.soFindestDuEs = u.soFindestDuEs;
    if (Array.isArray(u.wasHeisstDasFuerDich)) {
      sauber.wasHeisstDasFuerDich = u.wasHeisstDasFuerDich.filter((p): p is string => typeof p === "string");
    }
    if (Object.keys(sauber).length > 0) ergebnis[nr] = sauber;
  }
  return ergebnis;
}

/** Der Eintrag, wie er angezeigt wird: Datei plus Überarbeitung. */
export function mitUeberarbeitung(e: VersionsnotizEintrag, ueberarbeitungen: NotizUeberarbeitungen): VersionsnotizEintrag {
  const u = ueberarbeitungen[String(e.nr)];
  return u ? { ...e, ...u } : e;
}

/** Wer die Notiz gerade ansieht. `istFreigeber` ist Christian. */
export interface NotizBetrachter {
  rolle?: string;
  istFreigeber: boolean;
  freigaben: NotizFreigaben;
}

/**
 * Gilt der Eintrag für diesen Betrachter schon, unabhängig von der Rolle?
 * Christian sieht auch Offenes und Abgelehntes, sonst könnte er es nicht
 * entscheiden. Der Warnstreifen fragt nur das, siehe `entscheideNeuladen`.
 */
export function istNotizFreigegebenFuer(
  e: VersionsnotizEintrag,
  b: Pick<NotizBetrachter, "istFreigeber" | "freigaben">,
): boolean {
  return b.istFreigeber || notizFreigabeStand(e, b.freigaben) === "frei";
}

/**
 * Die eine Stelle, die entscheidet, ob ein Eintrag angezeigt und gezählt
 * wird: News-Seite und Seitenleiste nutzen beide diese Funktion. Christian
 * sieht alle Einträge, auch die anderer Rollen, damit er jeden freigeben
 * oder zurückziehen kann.
 */
export function istNotizSichtbar(e: VersionsnotizEintrag, b: NotizBetrachter): boolean {
  return istNotizFreigegebenFuer(e, b) && (b.istFreigeber || istNotizFuerRolle(e, b.rolle));
}

export function istNotizFuerRolle(e: VersionsnotizEintrag, rolle: string | undefined): boolean {
  return e.zielrollen.includes("alle") || (!!rolle && e.zielrollen.includes(rolle));
}

/** Kennung in `news_read_ids`. */
export function notizLeseId(nr: number): string {
  return `neu-im-crm-${nr}`;
}

export function zaehleUngeleseneNotizen(
  eintraege: VersionsnotizEintrag[],
  betrachter: NotizBetrachter,
  gelesen: ReadonlySet<string>,
): number {
  return eintraege.filter((e) => istNotizSichtbar(e, betrachter) && !gelesen.has(notizLeseId(e.nr))).length;
}

/**
 * Wie auf einen neuen Build reagiert wird, für alle Nutzer.
 *
 *  - `kritisch`: der Warnstreifen, ein neuer Eintrag verlangt das Neuladen.
 *  - `still`: beim nächsten Seitenwechsel ohne Rückfrage neu laden.
 *  - `nichts`: für diesen Build wurde schon einmal still neu geladen, und er
 *    ist trotzdem noch nicht da (Zwischenspeicher, Auslieferung noch nicht
 *    fertig). Ein zweiter Versuch könnte zur Schleife werden, also Ruhe bis
 *    zum nächsten Build.
 *
 * Fehlt die Notiz oder ist sie unlesbar, wird ebenfalls still neu geladen:
 * Sie kommt mit demselben Publish, ihr Fehlen ist kein Grund für einen
 * Streifen. Einen Streifen gibt es nur noch bei `kritisch`, und seit dem
 * 27.09.2026 nur für einen freigegebenen Eintrag (Christian sieht ihn schon
 * vorher). Die Rolle zählt hier bewusst nicht: Ein kritischer Eintrag heißt,
 * der alte Stand speichert für niemanden mehr richtig. Ohne Streifen lädt die
 * App trotzdem still beim nächsten Seitenwechsel neu.
 */
export type NeuladenArt = "kritisch" | "still" | "nichts";

export function entscheideNeuladen(p: {
  notiz: VersionsnotizEintrag[] | null;
  bekannteNr: number;
  schonStillGeladen: boolean;
  betrachter: Pick<NotizBetrachter, "istFreigeber" | "freigaben">;
}): NeuladenArt {
  if (p.notiz?.some((e) => e.nr > p.bekannteNr && e.kritisch && istNotizFreigegebenFuer(e, p.betrachter))) {
    return "kritisch";
  }
  return p.schonStillGeladen ? "nichts" : "still";
}
