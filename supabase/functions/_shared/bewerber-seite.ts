/**
 * Die persönliche Bewerberseite: Zustände, Zuständigkeit, Pausen.
 *
 * Reine Logik, ohne Datenbank und ohne React. Sie liegt unter `_shared`, weil
 * beide Seiten sie brauchen: die Edge Function `bewerber-seite`, die Pause,
 * Ausstieg und Widerspruch entgegennimmt, und die Seite selbst über
 * `src/lib/bewerberSeite.ts`. Zwei Fassungen derselben Regel laufen sonst
 * auseinander, und das fällt erst auf, wenn die Seite „Pause" anzeigt und die
 * Erinnerungskette trotzdem läuft.
 *
 * ── Die fünf Zustände ──
 *
 *   1. `eingang`       Ab Minute null. Die Bewerbung ist da, das Kennenlernen
 *                      wartet.
 *   2. `unterbrochen`  Selbst pausiert oder mit offener Rückfrage. Kein
 *                      fehlendes Interesse und kein technischer Abbruch.
 *   3. `termin`        Der Videocall steht, mit Datum und Tagesordnung.
 *   4. `entscheidung`  Das Gespräch ist gelaufen, der Bewerber ist am Zug.
 *   5. `start`         Nach der Zusage, mit den Voraussetzungen bis Tag 1.
 *
 * Dazu kommt `beendet`, und das ist kein sechster Zustand, sondern das Ende:
 * Der Bewerber ist ausgestiegen oder die Sache ist abgeschlossen.
 *
 * ── Wer am Zug ist ──
 *
 * Wird aus dem tatsächlichen Vorgang abgeleitet und nicht aus der
 * Pipelinestufe. Eine offene Rückfrage macht OS Immobilien zum Zugführer, obwohl
 * der Bewerber formal in der Stufe Eingang steht. Genau darum bekommt diese
 * Datei die Stufe gar nicht erst zu sehen.
 */

// ── Was die Datenbank liefert ─────────────────────────────────────────────

/** Die Angaben zum Kennenlernen, so wie `get_bewerber_seite` sie ausgibt. */
export type SeiteKennenlernen = {
  /** Das Token des Bogens. Leer, wenn noch keine Einladung hinausging. */
  token: string;
  /** offen | eingereicht | abgelaufen | ersetzt, oder leer. */
  status: string;
  laeuftAbAm: string;
  eingereichtAm: string;
  /** Steht im Bogen schon mehr als das Kennzeichen beim Anlegen? */
  angefangen: boolean;
  gesendetAm: string;
};

export type SeiteTermin = {
  /** JJJJ-MM-TT, leer wenn nichts gebucht ist. */
  datum: string;
  /** HH:MM */
  uhrzeit: string;
  berater: string;
  /** Gesetzt heißt: das Gespräch ist gelaufen. */
  gefuehrtAm: string;
};

/** Der offene Punkt aus dem Gespräch: immer mit Namen und Frist. */
export type OffenerPunkt = {
  wer: string;
  was: string;
  bis: string;
};

/** Nur nach ausdrücklicher Freigabe gefüllt. Ohne Freigabe geht nichts raus. */
export type SeiteEntscheidung = {
  freigegebenAm: string;
  text: string;
  einschaetzung: string;
  offenerPunkt: OffenerPunkt | null;
};

export type SeiteStart = {
  vertragStatus: string;
  vertragUnterschriebenAm: string;
  aktivAm: string;
};

/** Die selbst gewählte Pause. `erinnerungAm` leer heißt: keine Erinnerung. */
export type SeitePause = {
  gesetztAm: string;
  erinnerungAm: string;
};

/** Die schriftliche Frage vor dem Termin, mit Frist und Namen. */
export type SeiteFrage = {
  gestelltAm: string;
  text: string;
  bisAm: string;
  beantwortetAm: string;
};

export type BewerberSeiteStand = {
  vorname: string;
  beworbenAm: string;
  beendet: boolean;
  /** bewerber | moreimmo | leer. Trennt den Ausstieg von der Absage. */
  beendetDurch: string;
  zugesagt: boolean;
  kennenlernen: SeiteKennenlernen;
  termin: SeiteTermin;
  entscheidung: SeiteEntscheidung | null;
  start: SeiteStart;
  pause: SeitePause | null;
  frage: SeiteFrage | null;
  anrufWidersprochen: boolean;
};

// ── Lesen, nachsichtig ────────────────────────────────────────────────────

function text(wert: unknown): string {
  return typeof wert === "string" ? wert : "";
}

function objekt(wert: unknown): Record<string, unknown> {
  return wert && typeof wert === "object" && !Array.isArray(wert)
    ? (wert as Record<string, unknown>)
    : {};
}

/** Ein Block gilt als leer, wenn keins seiner Felder Inhalt trägt. */
function leer(o: Record<string, unknown>): boolean {
  return Object.values(o).every((w) => w == null || w === "" || w === false);
}

/**
 * Die Antwort der Datenbank in ein geprüftes Objekt übersetzen.
 *
 * Bewusst nachsichtig: Fehlt ein Feld, weil die Migration noch eine ältere
 * Fassung hat, steht dort ein vernünftiger Wert statt `undefined`. Nur wenn
 * gar nichts Brauchbares kommt, gibt es `null`, und dann meldet die Seite
 * einen unbekannten Link statt einer halben Auskunft.
 */
export function leseStand(roh: unknown): BewerberSeiteStand | null {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const q = roh as Record<string, unknown>;
  if (typeof q.vorname !== "string") return null;

  const k = objekt(q.kennenlernen);
  const t = objekt(q.termin);
  const e = objekt(q.entscheidung);
  const s = objekt(q.start);
  const p = objekt(q.pause);
  const f = objekt(q.frage);
  const op = objekt(e.offener_punkt);

  return {
    vorname: text(q.vorname),
    beworbenAm: text(q.beworben_am),
    beendet: q.beendet === true,
    beendetDurch: text(q.beendet_durch),
    zugesagt: q.zugesagt === true,
    kennenlernen: {
      token: text(k.token),
      status: text(k.status),
      laeuftAbAm: text(k.laeuft_ab_am),
      eingereichtAm: text(k.eingereicht_am),
      angefangen: k.angefangen === true,
      gesendetAm: text(k.gesendet_am),
    },
    termin: {
      datum: text(t.datum),
      uhrzeit: text(t.uhrzeit),
      berater: text(t.berater),
      gefuehrtAm: text(t.gefuehrt_am),
    },
    entscheidung: text(e.freigegeben_am)
      ? {
        freigegebenAm: text(e.freigegeben_am),
        text: text(e.text),
        einschaetzung: text(e.einschaetzung),
        offenerPunkt: leer(op)
          ? null
          : { wer: text(op.wer), was: text(op.was), bis: text(op.bis) },
      }
      : null,
    start: {
      vertragStatus: text(s.vertrag_status),
      vertragUnterschriebenAm: text(s.vertrag_unterschrieben_am),
      aktivAm: text(s.aktiv_am),
    },
    pause: leer(p) ? null : { gesetztAm: text(p.gesetztAm), erinnerungAm: text(p.erinnerungAm) },
    frage: leer(f)
      ? null
      : {
        gestelltAm: text(f.gestelltAm),
        text: text(f.text),
        bisAm: text(f.bisAm),
        beantwortetAm: text(f.beantwortetAm),
      },
    anrufWidersprochen: q.anruf_widersprochen === true,
  };
}

// ── Der Zustand ───────────────────────────────────────────────────────────

export type SeitenZustand =
  | "eingang"
  | "unterbrochen"
  | "termin"
  | "entscheidung"
  | "start"
  | "beendet";

/** Läuft die selbst gewählte Pause gerade? */
export function pauseLaeuft(pause: SeitePause | null, jetzt: Date = new Date()): boolean {
  if (!pause || !pause.gesetztAm) return false;
  // Ohne Erinnerungsdatum hat der Bewerber gesagt: „Ich melde mich selbst."
  // Dann endet die Pause nicht von allein.
  if (!pause.erinnerungAm) return true;
  const ziel = new Date(pause.erinnerungAm);
  if (Number.isNaN(ziel.getTime())) return true;
  return ziel > jetzt;
}

/** Steht eine Frage des Bewerbers offen? */
export function frageOffen(frage: SeiteFrage | null): boolean {
  return !!frage && !!frage.gestelltAm && !frage.beantwortetAm;
}

/**
 * Der Zustand der Seite.
 *
 * Die Reihenfolge ist die Aussage: Das Ende schlägt alles, danach der Start,
 * danach die Entscheidung, danach der Termin. Die Unterbrechung steht bewusst
 * erst hinter dem Termin, denn wer schon gebucht hat, ist nicht unterbrochen,
 * auch wenn er nebenbei eine Frage gestellt hat.
 */
export function zustandVon(stand: BewerberSeiteStand, jetzt: Date = new Date()): SeitenZustand {
  if (stand.beendet) return "beendet";
  if (stand.zugesagt || stand.start.vertragUnterschriebenAm) return "start";
  if (stand.termin.gefuehrtAm) return "entscheidung";
  if (stand.termin.datum) return "termin";
  if (pauseLaeuft(stand.pause, jetzt) || frageOffen(stand.frage)) return "unterbrochen";
  return "eingang";
}

/** Wer gerade handeln muss. */
export type AmZug = "bewerber" | "moreimmo" | "niemand";

/**
 * Wer am Zug ist, abgeleitet aus dem Vorgang und nicht aus der Stufe.
 *
 * Der Satz aus der Abstimmungsfassung, in Code: „Deshalb kann OS Immobilien am Zug
 * sein, obwohl der Bewerber formal noch in der Stufe Eingang steht." Genau das
 * passiert hier, wenn eine Frage offen ist.
 */
export function werAmZug(stand: BewerberSeiteStand, jetzt: Date = new Date()): AmZug {
  if (stand.beendet) return "niemand";
  // Eine offene Rückfrage schlägt alles andere. Sie hat eine Frist und einen
  // Namen; ohne beides wird aus einer offenen Frage ein stiller Stillstand.
  if (frageOffen(stand.frage)) return "moreimmo";
  const zustand = zustandVon(stand, jetzt);
  if (zustand === "entscheidung") {
    // Nach dem Gespräch wartet der Bewerber, solange die Zusammenfassung noch
    // nicht freigegeben ist. Erst danach ist er selbst am Zug.
    return stand.entscheidung ? "bewerber" : "moreimmo";
  }
  if (zustand === "start") {
    // Der Zugang wird eingerichtet, das macht nicht der Bewerber.
    return stand.start.aktivAm ? "bewerber" : "moreimmo";
  }
  return "bewerber";
}

// ── Die vier Stationen, die die Seite zeigt ───────────────────────────────

export type StationsSchluessel = "bewerbung" | "kennenlernen" | "videocall" | "entscheidung";
export type StationsStand = "erledigt" | "dran" | "danach";

export type Station = {
  schluessel: StationsSchluessel;
  nummer: number;
  titel: string;
  /** Die Zeile darunter, aus den tatsächlichen Daten. */
  zeile: string;
  stand: StationsStand;
};

/** Ein ISO-Datum als TT.MM.JJJJ. Leer bleibt leer, Unsinn bleibt Unsinn. */
export function alsDatum(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Die vier Stationen mit ihrem Stand.
 *
 * Immer dieselben vier, immer in derselben Reihenfolge, in jedem Zustand. Das
 * ist der Grund, warum die Seite in jedem Zustand dieselben drei Fragen
 * beantwortet: Was ist erledigt, wer ist am Zug, was kann ich als Nächstes tun.
 */
export function stationen(stand: BewerberSeiteStand, jetzt: Date = new Date()): Station[] {
  const zustand = zustandVon(stand, jetzt);
  const kennenlernenFertig = !!stand.kennenlernen.eingereichtAm
    || stand.kennenlernen.status === "eingereicht"
    || !!stand.termin.datum
    || !!stand.termin.gefuehrtAm
    || zustand === "start";
  const terminFertig = !!stand.termin.gefuehrtAm || zustand === "start";
  const entscheidungFertig = zustand === "start";

  const kennenlernenZeile = (): string => {
    if (kennenlernenFertig) {
      const am = alsDatum(stand.kennenlernen.eingereichtAm);
      return am ? `Am ${am} abgesendet. Ändern geht weiter.` : "Abgesendet. Ändern geht weiter.";
    }
    if (pauseLaeuft(stand.pause, jetzt)) {
      const bis = alsDatum(stand.pause?.erinnerungAm);
      return bis
        ? `Pausiert. Du hörst am ${bis} wieder von uns, vorher nicht.`
        : "Pausiert. Du entscheidest, wann es weitergeht.";
    }
    if (stand.kennenlernen.angefangen) return "Angefangen. Du machst da weiter, wo du aufgehört hast.";
    return "Noch nicht begonnen. Du kannst jederzeit anfangen und jederzeit aufhören.";
  };

  const terminZeile = (): string => {
    if (stand.termin.gefuehrtAm) {
      const am = alsDatum(stand.termin.gefuehrtAm);
      return am ? `Am ${am} geführt.` : "Geführt.";
    }
    if (stand.termin.datum) {
      const tag = alsDatum(stand.termin.datum);
      return stand.termin.uhrzeit ? `${tag} um ${stand.termin.uhrzeit} Uhr.` : tag;
    }
    if (kennenlernenFertig) return "Such dir eine Zeit aus, die dir passt.";
    return "Kommt nach dem Kennenlernen. Vorher gibt es nichts zu buchen.";
  };

  const entscheidungZeile = (): string => {
    if (entscheidungFertig) {
      const am = alsDatum(stand.start.vertragUnterschriebenAm) || alsDatum(stand.start.aktivAm);
      return am ? `Am ${am} hast du zugesagt.` : "Du hast zugesagt.";
    }
    if (zustand === "entscheidung") return "Du bist am Zug. Es gibt keine Frist.";
    return "In Ruhe, ohne Frist, und du bestimmst, ob wir uns melden.";
  };

  const marke = (fertig: boolean, dran: boolean): StationsStand =>
    fertig ? "erledigt" : dran ? "dran" : "danach";

  const beworben = alsDatum(stand.beworbenAm);

  return [
    {
      schluessel: "bewerbung",
      nummer: 1,
      titel: "Deine Bewerbung ist angekommen",
      zeile: beworben ? `Am ${beworben} eingegangen.` : "Sie liegt uns vor.",
      stand: "erledigt",
    },
    {
      schluessel: "kennenlernen",
      nummer: 2,
      titel: "Dein Kennenlernen",
      zeile: kennenlernenZeile(),
      stand: marke(kennenlernenFertig, !kennenlernenFertig),
    },
    {
      schluessel: "videocall",
      nummer: 3,
      titel: "Dein Videocall",
      zeile: terminZeile(),
      stand: marke(terminFertig, !terminFertig && kennenlernenFertig),
    },
    {
      schluessel: "entscheidung",
      nummer: 4,
      titel: "Deine Entscheidung",
      zeile: entscheidungZeile(),
      stand: marke(entscheidungFertig, !entscheidungFertig && terminFertig),
    },
  ];
}

// ── Die selbst gewählte Pause ─────────────────────────────────────────────

/**
 * Die vier Möglichkeiten der Pausenwahl, in genau dieser Reihenfolge.
 *
 * Keine davon ist eine Absage, auch die letzte nicht: Sie ist der selbst
 * gewählte Ausstieg und bekommt einen eigenen Weg, nicht denselben wie eine
 * Absage durch OS Immobilien.
 */
export type PausenWahl = "woche" | "monat" | "ohne" | "beenden";

export const PAUSEN_WAHLEN: { wert: PausenWahl; titel: string; hinweis?: string }[] = [
  { wert: "woche", titel: "Erinnere mich in einer Woche" },
  { wert: "monat", titel: "Erinnere mich in einem Monat" },
  { wert: "ohne", titel: "Erinnere mich nicht, ich melde mich selbst" },
  { wert: "beenden", titel: "Ich möchte die Bewerbung beenden", hinweis: "Wir melden uns dann nicht mehr" },
];

/** Ab wann die Kette wieder laufen darf. Leerer String heißt: gar nicht mehr. */
export function erinnerungsDatum(wahl: PausenWahl, jetzt: Date = new Date()): string {
  if (wahl === "woche") return new Date(jetzt.getTime() + 7 * 86_400_000).toISOString();
  if (wahl === "monat") return new Date(jetzt.getTime() + 30 * 86_400_000).toISOString();
  return "";
}

// ── Die Aktionen der Seite ────────────────────────────────────────────────

/** Was der Bewerber von seiner Seite aus auslösen kann. */
export type SeitenAktion = "pause" | "weiter" | "frage" | "kein_anruf" | "ausstieg";

export const SEITEN_AKTIONEN: SeitenAktion[] = [
  "pause",
  "weiter",
  "frage",
  "kein_anruf",
  "ausstieg",
];

/** Ein Token ist 32 Byte Zufall als Hex, also 64 Zeichen. */
export const SEITE_TOKEN_MUSTER = /^[0-9a-f]{64}$/;

/** Höchstlänge der freien Texte. Eine Frage ist keine Abhandlung. */
export const FRAGE_MAX = 1000;
export const GRUND_MAX = 500;

export type AnfragePruefung =
  | { ok: true; token: string; aktion: SeitenAktion; text: string; erinnerungAm: string }
  | { ok: false; fehler: string; bot?: boolean };

/**
 * Die Anfrage der Seite prüfen, bevor irgendetwas geschrieben wird.
 *
 * Steht hier und nicht in der Function, damit ein Test sie lesen kann. Der
 * Honigtopf antwortet freundlich und schreibt nichts, wie in
 * `pruefeKeinInteresseAnfrage`.
 */
export function pruefeAnfrage(body: unknown): AnfragePruefung {
  const b = objekt(body);
  if (text(b.hp).length > 0) return { ok: false, fehler: "Bot", bot: true };

  const token = text(b.token).trim().toLowerCase();
  if (!SEITE_TOKEN_MUSTER.test(token)) return { ok: false, fehler: "Link unbekannt" };

  const aktion = text(b.aktion).trim() as SeitenAktion;
  if (!SEITEN_AKTIONEN.includes(aktion)) return { ok: false, fehler: "Unbekannte Aktion" };

  const roh = text(b.text).trim();
  const grenze = aktion === "frage" ? FRAGE_MAX : GRUND_MAX;
  if (roh.length > grenze) return { ok: false, fehler: "Text zu lang" };
  if (aktion === "frage" && roh.length < 3) return { ok: false, fehler: "Bitte schreib deine Frage auf" };

  let erinnerungAm = "";
  if (aktion === "pause") {
    const wahl = text(b.wahl).trim() as PausenWahl;
    if (wahl !== "woche" && wahl !== "monat" && wahl !== "ohne") {
      return { ok: false, fehler: "Unbekannte Wahl" };
    }
    erinnerungAm = erinnerungsDatum(wahl);
  }

  return { ok: true, token, aktion, text: roh, erinnerungAm };
}

// ── Die Frist der Rückfrage ───────────────────────────────────────────────

/**
 * Bis wann eine Frage beantwortet wird: zwei Werktage, nie am Wochenende.
 *
 * „Ein offener Punkt hat immer eine Zuständigkeit und eine Frist. Sonst wartet
 * jede Seite auf die andere." Eine Frist am Sonntag wäre keine.
 */
export const FRAGE_WERKTAGE = 2;

export function antwortFrist(jetzt: Date = new Date(), werktage = FRAGE_WERKTAGE): string {
  const d = new Date(jetzt.getTime());
  let offen = werktage;
  while (offen > 0) {
    d.setDate(d.getDate() + 1);
    const tag = d.getDay();
    if (tag !== 0 && tag !== 6) offen--;
  }
  return d.toISOString();
}

// ── Die Seite anlegen ─────────────────────────────────────────────────────

/**
 * Der schmale Ausschnitt von Supabase, den das Anlegen braucht.
 *
 * Wie in `hr-benachrichtigung.ts` bewusst strukturell getippt und nicht über
 * den echten Client: So bleibt diese Datei ohne `https://`-Import und damit
 * auch für Vitest lesbar.
 */
export interface Datenzugriff {
  from(tabelle: string): {
    select(spalten: string): {
      eq(spalte: string, wert: string): {
        maybeSingle(): Promise<{ data: { token?: string } | null; error: unknown }>;
      };
    };
    insert(zeile: Record<string, unknown>): {
      select(spalten: string): {
        single(): Promise<{ data: { token?: string } | null; error: unknown }>;
      };
    };
  };
}

/**
 * Sorgt dafür, dass dieser Bewerber eine Seite hat, und gibt ihr Token zurück.
 *
 * Best-Effort: Fehlt die Tabelle, weil die Migration noch nicht gelaufen ist,
 * kommt ein leerer String zurück und der Bewerbungsweg läuft unverändert
 * weiter. Eine eingegangene Bewerbung darf niemals daran scheitern, dass ihre
 * Seite nicht angelegt werden konnte.
 */
export async function sorgeFuerBewerberSeite(
  admin: Datenzugriff,
  bewerbungId: string,
): Promise<string> {
  if (!bewerbungId) return "";
  try {
    const vorhanden = await admin
      .from("bewerber_seite")
      .select("token")
      .eq("bewerbung_id", bewerbungId)
      .maybeSingle();
    if (vorhanden.data?.token) return vorhanden.data.token;

    const neu = await admin
      .from("bewerber_seite")
      .insert({ bewerbung_id: bewerbungId })
      .select("token")
      .single();
    if (neu.data?.token) return neu.data.token;

    if (neu.error) console.error("[bewerber-seite] Anlegen fehlgeschlagen", neu.error);
    return "";
  } catch (e) {
    console.error("[bewerber-seite] Anlegen fehlgeschlagen", e);
    return "";
  }
}

/** Die öffentliche Adresse der persönlichen Seite. */
export const BEWERBER_SEITE_BASIS_URL = "https://osimmobilien.netlify.app/deine-bewerbung";

export function bewerberSeiteLink(token: string): string {
  return `${BEWERBER_SEITE_BASIS_URL}/${token}`;
}

/** Der Pfad innerhalb der Anwendung, für die Erfolgsseite der Bewerbung. */
export function bewerberSeitePfad(token: string): string {
  return `/deine-bewerbung/${token}`;
}
