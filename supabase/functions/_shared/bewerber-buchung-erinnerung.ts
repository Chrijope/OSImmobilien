/**
 * Was nach dem abgeschickten Kennenlernen von allein passiert.
 *
 * ## Was hier am 08.09.2026 umgedreht wurde
 *
 * Bis dahin mahnte diese Kette den Bewerber: „Dein Termin fehlt noch" an Tag 3,
 * „sonst rufen wir an" an Tag 7, an Tag 10 die Bitte an HR. Das ergab Sinn,
 * solange der Bogen im Kalender endete und der Bewerber sich selbst buchen
 * konnte.
 *
 * Seit der Bogen ohne Terminwahl endet, ergibt es keinen mehr: Er **kann** gar
 * nicht buchen, solange wir ihn nicht eingeladen haben. Ihn dafür zu mahnen,
 * wäre der Vorwurf für etwas, das er nicht tun darf.
 *
 * Die Kette ist deshalb nicht entfallen, sondern umgedreht, und sie hat jetzt
 * zwei Hälften. Wer am Zug ist, entscheidet allein die Frage, ob die Einladung
 * schon hinausgegangen ist:
 *
 *   **Vor der Einladung, wir sind am Zug (Sichtung):**
 *   | Tag 3 | „Ein Kennenlernen wartet auf eure Entscheidung" | Glocke und Mail an HR |
 *   | Tag 7 | dasselbe, deutlicher                            | Glocke und Mail an HR |
 *   | danach | nichts                                         |                       |
 *
 *   **Nach der Einladung, er ist am Zug (Buchung):**
 *   | Tag 3  | „Deine Einladung wartet noch"                   | Mail an den Bewerber |
 *   | Tag 7  | „sonst rufen wir kurz an"                       | Mail an den Bewerber |
 *   | Tag 10 | Bitte um Anruf                                  | Glocke und Mail an HR |
 *   | danach | nichts                                         |                       |
 *
 * Ersatzlos entfallen wäre der schlechtere Weg gewesen. Vorher lag es am
 * Bewerber, ob etwas geschieht; jetzt liegt es an uns, und ein Bogen, den
 * niemand ansieht, lässt einen Menschen wochenlang warten, dem wir gerade
 * geschrieben haben, dass wir uns melden. Das wäre schlimmer als der Zustand
 * vorher.
 *
 * ## Zwei Zähler, nicht einer
 *
 * Die Sichtung zählt in `meta.kennenlernen.sichtungStufe`, die Buchung
 * unverändert in `buchungStufe`. Ein gemeinsamer Zähler wäre kürzer und
 * falsch: Geht die Einladung erst am fünften Tag hinaus, hätte die zweite
 * Hälfte sonst schon eine Stufe verbraucht, die sie nie benutzt hat, und der
 * Bewerber bekäme als Erstes die Mail mit dem angekündigten Anruf.
 *
 * **Keine Migration.** Beide Zähler und der Vermerk `einladungAm` liegen im
 * vorhandenen JSON-Feld `bewerbungen.meta`. Ein Bestand, in dem nur
 * `buchungStufe` steht, wird richtig gelesen: Ohne `einladungAm` läuft für ihn
 * die Sichtung, und die beginnt bei null.
 *
 * ## Warum getrennt von der Function
 *
 * Aus demselben Grund wie bei der anderen Kette: Eine Edge Function lässt sich
 * nicht testen, diese Datei schon. Die Regel „ein abgelehnter Bewerber bekommt
 * nichts" gehört in eine Zeile, die ein Test lesen kann, und nicht in eine
 * Schleife mitten im Versand. Gelesen wird sie von
 * `src/lib/bewerberBuchungErinnerung.test.ts`.
 */

import {
  BUCHUNG_ERINNERUNG_TAG,
  BUCHUNG_ERINNERUNG_TAG_2,
  BUCHUNG_HR_TAG,
  SICHTUNG_TAG,
  SICHTUNG_TAG_2,
} from "./bewerber-kennenlernen-mail.ts";

export {
  BUCHUNG_ERINNERUNG_TAG,
  BUCHUNG_ERINNERUNG_TAG_2,
  BUCHUNG_HR_TAG,
  SICHTUNG_TAG,
  SICHTUNG_TAG_2,
};

/** Wie weit die Buchungshälfte bei diesem Bewerber schon gelaufen ist. */
export type BuchungStufe = 0 | 1 | 2 | 3;

/** Wie weit die Sichtungshälfte gelaufen ist. */
export type SichtungStufe = 0 | 1 | 2;

/** Was über den Bewerber bekannt sein muss, um zu entscheiden. */
export type BuchungStand = {
  /** Wann die Zusammenfassung hinausging, ISO. Ohne sie läuft nichts. */
  zusammenfassungAm?: string | null;
  /**
   * Wann die Einladung zum persönlichen Gespräch hinausging, ISO.
   *
   * Der Schalter zwischen den beiden Hälften. Leer heißt: Wir haben noch nicht
   * entschieden, also sind wir am Zug. Geschrieben wird er von
   * `vermerkeKooperationsEinladung` in `src/lib/bewerberEinladung.ts`.
   */
  einladungAm?: string | null;
  /** Pipelinestufe des Bewerbers. */
  bewerberStatus?: string | null;
  /** Steht ein Termin? Dann stoppt jede Erinnerung sofort. */
  terminGebucht?: boolean;
  /** Hat der Bewerber selbst pausiert? */
  pauseGesetzt?: boolean;
  /** Bis wann, ISO. Leer heißt „ich melde mich selbst". */
  pausiertBis?: string | null;
  /** Wie weit die Buchungshälfte gelaufen ist. */
  stufe?: BuchungStufe;
  /** Wie weit die Sichtungshälfte gelaufen ist. */
  sichtungStufe?: SichtungStufe;
};

/** Warum die Erinnerung ausbleibt. `null` heißt: sie ist erlaubt. */
export type BuchungStoppGrund =
  | "keine_zusammenfassung"
  | "fertig"
  | "termin_steht"
  | "kein_interesse"
  | "abgelehnt"
  | "pausiert"
  | "weiter_im_prozess";

export const BUCHUNG_STOPP_TEXTE: Record<BuchungStoppGrund, string> = {
  keine_zusammenfassung: "Das Kennenlernen ist noch nicht abgeschickt.",
  fertig: "Die Kette ist durchgelaufen. Jetzt ist ein Anruf dran.",
  termin_steht: "Der Termin ist gebucht.",
  kein_interesse: "Es steht auf „Kein Interesse“.",
  abgelehnt: "Der Bewerber ist abgelehnt.",
  pausiert: "Der Bewerber pausiert gerade. Danach läuft die Kette weiter.",
  weiter_im_prozess: "Der Bewerber ist längst weiter als die Terminwahl.",
};

/**
 * Stufen, ab denen eine Erinnerung falsch wäre.
 *
 * Wer schon im Closing steht, hat sein Gespräch geführt. Ihn zu bitten, sich
 * einen Termin auszusuchen, wirkt so, als hätte niemand mitbekommen, dass er
 * längst da war. Und die Bitte an HR, den Bogen doch endlich anzusehen, wäre
 * bei ihm genauso falsch.
 */
const WEITER_ALS_TERMINWAHL = [
  "Closing",
  "FollowUp",
  "Bedenkzeit",
  "Paketwahl",
  "Vertrag",
  "Rechnung",
  "Nutzer_anlegen",
  "Aktiv",
];

/** Ganze Tage zwischen zwei Zeitpunkten. Negativ, wenn nichts dasteht. */
export function tageSeit(iso: string | null | undefined, jetzt: Date): number {
  if (!iso) return -1;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return -1;
  return Math.floor((jetzt.getTime() - start.getTime()) / 86_400_000);
}

/** Läuft die selbst gewählte Pause gerade noch? */
export function buchungPausiert(stand: BuchungStand, jetzt: Date = new Date()): boolean {
  if (!stand.pauseGesetzt) return false;
  // Ohne Wunschdatum hat der Bewerber gesagt: „Ich melde mich selbst."
  if (!stand.pausiertBis) return true;
  const ziel = new Date(stand.pausiertBis);
  if (Number.isNaN(ziel.getTime())) return true;
  return ziel > jetzt;
}

/** Ist die Einladung zum persönlichen Gespräch schon hinausgegangen? */
export function istEingeladen(stand: BuchungStand): boolean {
  return !!(stand.einladungAm && String(stand.einladungAm).trim());
}

/** Warum die Kette bei diesem Bewerber steht. `null`, wenn sie läuft. */
export function buchungStoppGrund(
  stand: BuchungStand,
  jetzt: Date = new Date(),
): BuchungStoppGrund | null {
  if (!stand.zusammenfassungAm) return "keine_zusammenfassung";
  if (stand.terminGebucht) return "termin_steht";
  const status = stand.bewerberStatus || "";
  if (status === "KeinInteresse") return "kein_interesse";
  if (status === "Abgelehnt") return "abgelehnt";
  if (WEITER_ALS_TERMINWAHL.includes(status)) return "weiter_im_prozess";
  if (buchungPausiert(stand, jetzt)) return "pausiert";
  // „Fertig" heißt bei jeder Hälfte etwas anderes, denn sie haben verschieden
  // viele Stufen. Maßgeblich ist die Hälfte, in der der Bewerber gerade steht.
  if (istEingeladen(stand)) {
    if ((stand.stufe ?? 0) >= 3) return "fertig";
  } else if ((stand.sichtungStufe ?? 0) >= 2) {
    return "fertig";
  }
  return null;
}

export type BuchungFaellig = "keine" | "sichtung3" | "sichtung7" | "tag3" | "tag7" | "hr10";

/** Die beiden Stufen, die an HR gehen und nicht an den Bewerber. */
export const AN_HR: ReadonlyArray<BuchungFaellig> = ["sichtung3", "sichtung7", "hr10"];

/** Geht diese Stufe an uns statt an den Bewerber? */
export function gehtAnHr(art: BuchungFaellig): boolean {
  return AN_HR.includes(art);
}

/**
 * Einen Startzeitpunkt um eine laufende Pause verschieben.
 *
 * Hat der Bewerber sich auf einen späteren Tag vertagt, zählt die Kette ab
 * diesem Tag weiter. Ohne diese Verschiebung wären nach einer Pause von einem
 * Monat alle Stufen am selben Morgen fällig: Erinnerung, letzte Erinnerung und
 * Anruf auf einen Schlag.
 */
function nachPause(basis: string | null, stand: BuchungStand): string | null {
  if (!basis) return null;
  if (!stand.pausiertBis) return basis;
  const ende = new Date(stand.pausiertBis);
  const anfang = new Date(basis);
  if (Number.isNaN(ende.getTime()) || Number.isNaN(anfang.getTime())) return basis;
  return ende > anfang ? stand.pausiertBis : basis;
}

/**
 * Ab wann die Sichtung zählt: ab dem abgeschickten Bogen.
 *
 * Das ist der Zeitpunkt, ab dem der Bewerber wartet, und genau der zählt.
 */
export function sichtungStartAm(stand: BuchungStand): string | null {
  return nachPause(stand.zusammenfassungAm || null, stand);
}

/**
 * Ab wann die Buchungshälfte zählt: ab der verschickten Einladung.
 *
 * Bis zum 08.09.2026 war es der abgeschickte Bogen. Das war richtig, solange
 * der Bewerber sich von da an selbst buchen konnte. Jetzt kann er es erst ab
 * der Einladung, also zählt die Kette auch erst ab da; sonst käme die erste
 * Erinnerung womöglich am Tag der Einladung selbst.
 */
export function buchungStartAm(stand: BuchungStand): string | null {
  return nachPause(stand.einladungAm || null, stand);
}

/** Was heute fällig ist. */
export function faelligeBuchungErinnerung(
  stand: BuchungStand,
  jetzt: Date = new Date(),
): BuchungFaellig {
  if (buchungStoppGrund(stand, jetzt)) return "keine";

  // Vor der Einladung sind wir am Zug, und niemand sonst.
  if (!istEingeladen(stand)) {
    const tage = tageSeit(sichtungStartAm(stand), jetzt);
    const stufe = stand.sichtungStufe ?? 0;
    if (stufe < 1 && tage >= SICHTUNG_TAG) return "sichtung3";
    if (stufe < 2 && tage >= SICHTUNG_TAG_2) return "sichtung7";
    return "keine";
  }

  const tage = tageSeit(buchungStartAm(stand), jetzt);
  const stufe = stand.stufe ?? 0;
  if (stufe < 1 && tage >= BUCHUNG_ERINNERUNG_TAG) return "tag3";
  if (stufe < 2 && tage >= BUCHUNG_ERINNERUNG_TAG_2) return "tag7";
  if (stufe < 3 && tage >= BUCHUNG_HR_TAG) return "hr10";
  return "keine";
}

/**
 * Die alte Frage „ist die eine Erinnerung fällig", für alles, was sie noch
 * stellt. Sie meint die erste Stufe nach der Einladung.
 */
export function buchungErinnerungFaellig(stand: BuchungStand, jetzt: Date = new Date()): boolean {
  return faelligeBuchungErinnerung(stand, jetzt) === "tag3";
}

/** Beschriftung der fälligen Nachricht, für die Oberfläche. */
export const BUCHUNG_FAELLIG_TEXTE: Record<Exclude<BuchungFaellig, "keine">, string> = {
  sichtung3: `Bogen ungesichtet, Erinnerung an HR, Tag ${SICHTUNG_TAG}`,
  sichtung7: `Bogen ungesichtet, letzte Erinnerung an HR, Tag ${SICHTUNG_TAG_2}`,
  tag3: `Erste Terminerinnerung nach der Einladung, Tag ${BUCHUNG_ERINNERUNG_TAG}`,
  tag7: `Letzte Terminerinnerung nach der Einladung, Tag ${BUCHUNG_ERINNERUNG_TAG_2}`,
  hr10: `Anruf durch HR, Tag ${BUCHUNG_HR_TAG}`,
};

/** Die Zeile aus `bewerbungen`, so weit diese Kette sie braucht. */
export type BewerberZeile = {
  status?: string | null;
  meta?: Record<string, unknown> | null;
};

/**
 * Der gebuchte Termin aus `meta`, oder `null`.
 *
 * Die eine Stelle, die weiß, woran ein Termin zu erkennen ist:
 * `meta.erstgespraechDatum` und `meta.erstgespraechUhrzeit`. Genau diese Felder
 * trägt `bewerber_termin_buchen` nach und genau diese räumt
 * `bewerber_termin_absagen`. Damit stimmt die Antwort auch dann, wenn die
 * HR-Managerin den Termin von Hand in die Akte geschrieben hat.
 *
 * Gelesen wird sie von `buchungStand` unten und von
 * `submit-bewerber-formular`, das anhand desselben Feldes entscheidet, ob die
 * Zusammenfassungsmail den allgemeinen Satz trägt oder den konkreten.
 */
export function terminAusMeta(
  meta: Record<string, unknown> | null | undefined,
): { datum: string; uhrzeit: string } | null {
  const felder = (meta || {}) as Record<string, unknown>;
  const datum = typeof felder.erstgespraechDatum === "string" ? felder.erstgespraechDatum.trim() : "";
  if (!datum) return null;
  const uhrzeit = typeof felder.erstgespraechUhrzeit === "string" ? felder.erstgespraechUhrzeit.trim() : "";
  return { datum, uhrzeit };
}

/**
 * Den Stand aus der Zeile lesen.
 *
 * Ob ein Termin steht, wird an `meta.erstgespraechDatum` erkannt. Genau dieses
 * Feld trägt `bewerber_termin_buchen` nach, und genau dieses räumt
 * `bewerber_termin_absagen` wieder. Damit ist die Antwort auch dann richtig,
 * wenn die HR-Managerin den Termin von Hand eingetragen hat, und sie braucht
 * keine zweite Abfrage auf `buchungen`.
 *
 * Die Stufe der Buchungshälfte steht in `meta.kennenlernen.buchungStufe`.
 * Fehlt sie, greift der alte Merker `buchungErinnerungAm`: Wer die eine alte
 * Mail schon bekommen hat, steht auf Stufe 1 und bekommt als Nächstes Tag 7.
 * So braucht diese Änderung keine Migration und niemand bekommt die erste Mail
 * zweimal.
 */
export function buchungStand(bewerber: BewerberZeile): BuchungStand {
  const meta = (bewerber.meta || {}) as Record<string, unknown>;
  const block = (meta.kennenlernen && typeof meta.kennenlernen === "object" && !Array.isArray(meta.kennenlernen)
    ? meta.kennenlernen
    : {}) as Record<string, unknown>;
  const pause = (block.pause && typeof block.pause === "object" && !Array.isArray(block.pause)
    ? block.pause
    : null) as Record<string, unknown> | null;

  const stufeRoh = Number(
    block.buchungStufe ?? (typeof block.buchungErinnerungAm === "string" && block.buchungErinnerungAm ? 1 : 0),
  );
  const stufe = (Number.isFinite(stufeRoh) ? Math.min(3, Math.max(0, Math.trunc(stufeRoh))) : 0) as BuchungStufe;

  const sichtungRoh = Number(block.sichtungStufe ?? 0);
  const sichtungStufe = (Number.isFinite(sichtungRoh)
    ? Math.min(2, Math.max(0, Math.trunc(sichtungRoh)))
    : 0) as SichtungStufe;

  return {
    zusammenfassungAm: typeof block.zusammenfassungAm === "string" ? block.zusammenfassungAm : null,
    einladungAm: typeof block.einladungAm === "string" ? block.einladungAm : null,
    bewerberStatus: bewerber.status ?? null,
    terminGebucht: !!terminAusMeta(meta),
    pauseGesetzt: !!pause && typeof pause.gesetztAm === "string" && pause.gesetztAm !== "",
    pausiertBis: pause && typeof pause.erinnerungAm === "string" ? pause.erinnerungAm : null,
    stufe,
    sichtungStufe,
  };
}

/**
 * Der Vermerk nach der verschickten Nachricht.
 *
 * Ohne ihn käme dieselbe Nachricht jeden Morgen erneut, denn die Tage sind
 * dann immer noch vergangen. `buchungErinnerungAm` wird bei der ersten Stufe
 * weitergeschrieben, damit ein Bestand, der nur dieses Feld kennt, weiter
 * richtig gelesen wird.
 */
export function vermerkNachBuchungStufe(
  block: Record<string, unknown>,
  versandt: Exclude<BuchungFaellig, "keine">,
  jetztIso: string,
  versandOk: boolean,
): Record<string, unknown> {
  const felder: Record<
    Exclude<BuchungFaellig, "keine">,
    { zaehler: "buchungStufe" | "sichtungStufe"; stufe: number; zeit: string; ok: string }
  > = {
    sichtung3: { zaehler: "sichtungStufe", stufe: 1, zeit: "sichtungMeldungAm", ok: "sichtungMeldungOk" },
    sichtung7: { zaehler: "sichtungStufe", stufe: 2, zeit: "sichtungMeldung2Am", ok: "sichtungMeldung2Ok" },
    tag3: { zaehler: "buchungStufe", stufe: 1, zeit: "buchungErinnerungAm", ok: "buchungErinnerungOk" },
    tag7: { zaehler: "buchungStufe", stufe: 2, zeit: "buchungErinnerung2Am", ok: "buchungErinnerung2Ok" },
    hr10: { zaehler: "buchungStufe", stufe: 3, zeit: "buchungHrMitteilungAm", ok: "buchungHrMitteilungOk" },
  };
  const feld = felder[versandt];
  return {
    ...block,
    [feld.zaehler]: feld.stufe,
    [feld.zeit]: jetztIso,
    [feld.ok]: versandOk,
  };
}

/** Der alte Name derselben Sache, für die erste Stufe nach der Einladung. */
export function vermerkNachBuchungErinnerung(
  block: Record<string, unknown>,
  jetztIso: string,
  versandOk: boolean,
): Record<string, unknown> {
  return vermerkNachBuchungStufe(block, "tag3", jetztIso, versandOk);
}
