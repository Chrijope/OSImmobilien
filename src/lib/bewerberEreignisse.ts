/**
 * Die Ereignisse eines Bewerbers, aus allen Quellen an einer Stelle.
 *
 * ## Warum es diese Datei gibt
 *
 * Was mit einem Bewerber geschehen ist, steht heute an mindestens vier
 * Stellen: in der Tabelle `bewerber_mail_tracking` (jede versendete Mail mit
 * Öffnungs- und Klickzeit), in rund zwanzig Zeitstempeln am Bewerber selbst
 * (Versandvermerke, Termine, Onboarding-Schritte), in den Buchungen
 * (`buchungen.bewerbung_id`) und in den eingereichten Bögen. Keine Ansicht
 * führt das zusammen, und deshalb kann niemand die einfachste Frage
 * beantworten: Was ist bei diesem Bewerber zuletzt passiert?
 *
 * Diese Datei beantwortet sie. Sie rechnet nur, sie zeigt nichts an und sie
 * fragt nichts ab. Alles, was sie braucht, bekommt sie übergeben. So lässt
 * sich jede Ereignisart mit echten Beispieldaten prüfen, ohne eine Oberfläche
 * zu bauen oder eine Datenbank anzuwerfen.
 *
 * ## Was hier NICHT steht: der Stufenwechsel
 *
 * Der Entwurf zeigt Einträge wie „Stufe: Videocall zu Closing". Die gibt es
 * nicht. Gespeichert ist ausschliesslich die **aktuelle** Stufe des Bewerbers
 * (`bewerbungen.status`), niemals, wann sie sich geändert hat und durch wen.
 * Es gibt keine Verlaufstabelle dafür.
 *
 * Deshalb erfindet diese Datei keine Stufenwechsel. Sie zeigt nur, was
 * wirklich belegt ist. Wer den Verlauf künftig haben will, braucht eine
 * Migration: eine Tabelle `bewerber_stufen_verlauf` und einen Trigger auf
 * `bewerbungen.status`. Rückwirkend wäre auch die leer, denn die alten
 * Wechsel sind nirgends aufgeschrieben.
 *
 * ## Zur Zeitrechnung
 *
 * Zeitstempel aus der Datenbank sind vollständige ISO-Zeitpunkte, die rechnen
 * sich von selbst. Termine am Bewerber sind dagegen ein deutsches Datum plus
 * eine Uhrzeit ohne Zeitzone, so wie sie eingetragen wurden. Sie werden hier
 * als Ortszeit gelesen. Das ist für die Tagesgruppen genau richtig: Wer den
 * Termin eingetragen hat, sass in Deutschland, und die Liste liest jemand,
 * der ebenfalls dort sitzt.
 */
import { mailArtLabel } from "./bewerberMailTracking";
import { istImNeuenProzess } from "./bewerberprozessZuordnung";
import type { Bewerber } from "./bewerbungStore";

/* ── Was ein Ereignis ist ────────────────────────────────────────────────── */

/**
 * Die vier Arten, nach denen sich die Liste filtern lässt.
 *
 * Bewusst grob. Wer zwanzig Arten anbietet, zwingt zum Suchen statt zum
 * Filtern. „Mail" ist alles, was hinausging, „Termin" alles mit Datum und
 * Uhrzeit, „Bogen" jeder ausgefüllte Fragebogen, „Schritt" jeder erledigte
 * Punkt im Ablauf.
 */
export type EreignisArt = "mail" | "termin" | "bogen" | "schritt";

/** Wie eine Marke aussieht. Reine Bedeutung, keine Farbe. */
export type MarkeTon = "gut" | "info" | "still" | "warnung";

/** Eine kurze Marke unter dem Eintrag, etwa „geöffnet 08:51". */
export type EreignisMarke = { text: string; ton: MarkeTon };

export type BewerberEreignis = {
  /** Eindeutig innerhalb eines Bewerbers, taugt als React-Schlüssel. */
  id: string;
  art: EreignisArt;
  /** Der Zeitpunkt, wie er in den Daten steht. */
  zeitpunkt: string;
  /** Millisekunden, für Reihenfolge und Tagesgruppe. */
  ms: number;
  /**
   * Ob nur der Tag bekannt ist. Ein Termin ohne Uhrzeit bekommt sonst „00:00"
   * angezeigt, und das behauptet eine Genauigkeit, die es nicht gibt.
   */
  nurTag: boolean;
  titel: string;
  text?: string;
  marken: EreignisMarke[];
};

/** Eine Zeile aus `bewerber_mail_tracking`, so weit der Verlauf sie braucht. */
export type MailVerlaufZeile = {
  token: string;
  kind: string;
  paket_titel?: string | null;
  sent_at: string;
  opened_at?: string | null;
  clicked_at?: string | null;
  tracked?: boolean;
};

/** Ein gebuchter Termin aus `buchungen`, so weit der Verlauf ihn braucht. */
export type BuchungVerlaufZeile = {
  id: string;
  startAt: string;
  status: string;
  abgesagtAt?: string;
  bezeichnung?: string | null;
};

/**
 * Alles, was der Verlauf braucht.
 *
 * Der Bewerber kommt als Teilmenge herein: Für den Test soll sich ein
 * Beispiel mit fünf Feldern schreiben lassen und nicht mit hundertzwanzig.
 */
export type EreignisQuellen = {
  bewerber: Partial<Bewerber>;
  /** Alle Trackingzeilen dieses Bewerbers, ungefiltert. */
  mails?: MailVerlaufZeile[];
  /** Die jüngste Buchung, falls es eine gibt. */
  buchung?: BuchungVerlaufZeile | null;
  /** Wann der Kennenlernbogen eingereicht wurde, ISO. */
  kennenlernEingereichtAm?: string;
  /** Wann der frühere Vorabbogen eingereicht wurde, ISO. */
  vorabEingereichtAm?: string;
};

/* ── Zeitrechnung ────────────────────────────────────────────────────────── */

/** Ein vollständiger Zeitstempel aus der Datenbank, sonst null. */
function msAusIso(wert?: string | null): number | null {
  const roh = (wert || "").trim();
  if (!roh) return null;
  const ms = new Date(roh).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * „TT.MM.JJJJ" oder „JJJJ-MM-TT" plus optionale Uhrzeit, als Ortszeit.
 *
 * Dieselbe Erkennung wie in `bewerberTermine.ts`, hier aber ohne Zeitzone:
 * Diese Datei sortiert und gruppiert nur, sie entscheidet nichts über
 * „vergangen" oder „steht noch an".
 */
function msAusTermin(datum?: string | null, uhrzeit?: string | null): number | null {
  const roh = (datum || "").trim();
  if (!roh) return null;
  const deutsch = roh.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const iso = roh.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let jahr: number, monat: number, tag: number;
  if (deutsch) {
    tag = +deutsch[1]; monat = +deutsch[2]; jahr = +deutsch[3];
  } else if (iso) {
    jahr = +iso[1]; monat = +iso[2]; tag = +iso[3];
  } else {
    // Weder das eine noch das andere: vielleicht ein voller Zeitstempel.
    return msAusIso(roh);
  }
  const zeit = (uhrzeit || "").match(/^(\d{1,2}):(\d{2})/);
  const d = new Date(jahr, monat - 1, tag, zeit ? +zeit[1] : 0, zeit ? +zeit[2] : 0, 0, 0);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Die Uhrzeit eines Zeitpunkts in Millisekunden, zweistellig, als „08:51". */
export function uhrzeitAusMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Dasselbe für einen Zeitstempel. Leer, wenn er sich nicht lesen lässt. */
export function uhrzeitAus(wert?: string | null): string {
  const ms = msAusIso(wert);
  if (ms === null) return "";
  return uhrzeitAusMs(ms);
}

/** Der Tagesschlüssel „JJJJ-MM-TT" eines Zeitpunkts, in Ortszeit. */
export function tagesSchluessel(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── Die Zusammenführung ─────────────────────────────────────────────────── */

/** Ein Ereignis anlegen, wenn sein Zeitpunkt auswertbar ist. */
function ausIso(
  liste: BewerberEreignis[],
  id: string,
  art: EreignisArt,
  zeitpunkt: string | null | undefined,
  titel: string,
  text?: string,
  marken: EreignisMarke[] = [],
): void {
  const ms = msAusIso(zeitpunkt);
  if (ms === null) return;
  liste.push({ id, art, zeitpunkt: String(zeitpunkt), ms, nurTag: false, titel, text, marken });
}

/** Dasselbe für einen Termin aus Datum und Uhrzeit. */
function ausTermin(
  liste: BewerberEreignis[],
  id: string,
  zeitpunkt: { datum?: string | null; uhrzeit?: string | null },
  titel: string,
  text?: string,
  marken: EreignisMarke[] = [],
): void {
  const ms = msAusTermin(zeitpunkt.datum, zeitpunkt.uhrzeit);
  if (ms === null) return;
  const hatUhrzeit = /^\d{1,2}:\d{2}/.test((zeitpunkt.uhrzeit || "").trim());
  liste.push({
    id,
    art: "termin",
    zeitpunkt: String(zeitpunkt.datum),
    ms,
    nurTag: !hatUhrzeit,
    titel,
    text,
    marken,
  });
}

/**
 * Die Marken einer versendeten Mail.
 *
 * Seit dem 26.09.2026 zählt nur der Aufruf des Links (`clicked_at`), kein
 * Zählpixel mehr. Ein `opened_at` aus der Pixelzeit wird nicht mehr als
 * „geöffnet" gezeigt, siehe `bewerberMailTracking.ts`. Grau heißt auch hier
 * nie „nicht gelesen".
 */
function mailMarken(zeile: MailVerlaufZeile): EreignisMarke[] {
  const marken: EreignisMarke[] = [];
  const geklickt = uhrzeitAus(zeile.clicked_at);
  if (geklickt) marken.push({ text: `Link geöffnet ${geklickt}`, ton: "gut" });
  else if (zeile.tracked !== false) marken.push({ text: "Link noch nicht geöffnet", ton: "still" });
  return marken;
}

/**
 * Alle belegten Ereignisse eines Bewerbers, das jüngste zuerst.
 *
 * Doppelte Einträge werden bewusst vermieden: Für dieselbe Mail gibt es oft
 * beides, eine Trackingzeile **und** einen Zeitstempel am Bewerber. Die
 * Trackingzeile gewinnt, denn nur sie kennt Öffnung und Klick. Der
 * Zeitstempel springt nur ein, wenn keine Trackingzeile dieser Art vorliegt,
 * etwa weil die Mail vor dem 15.09.2026 hinausging.
 */
export function baueBewerberEreignisse(quellen: EreignisQuellen): BewerberEreignis[] {
  const b = quellen.bewerber || {};
  const mails = quellen.mails || [];
  const liste: BewerberEreignis[] = [];
  const artenMitZeile = new Set(mails.map((m) => m.kind));

  /* ── Mails aus der Trackingtabelle ─────────────────────────────────── */
  for (const zeile of mails) {
    ausIso(
      liste,
      `mail:${zeile.token}`,
      "mail",
      zeile.sent_at,
      mailArtLabel(zeile.kind, zeile.paket_titel),
      undefined,
      mailMarken(zeile),
    );
  }

  /* ── Mails, die nur am Bewerber vermerkt sind ──────────────────────── */
  if (!artenMitZeile.has("kennenlernen_einladung")) {
    ausIso(
      liste, "mail:kennenlernenGesendetAm", "mail", b.kennenlernenGesendetAm,
      "Einladung zum Kennenlernbogen",
      b.kennenlernenGesendetVon ? `Versendet von ${b.kennenlernenGesendetVon}` : undefined,
    );
  }
  // Der erneute Versand steht getrennt: Er ist ein eigener Vorgang mit Grund.
  ausIso(
    liste, "mail:kennenlernenVersandAm", "mail", b.kennenlernenVersandAm,
    "Kennenlernbogen erneut versendet",
    (b.kennenlernenVersandGrund || "").trim() || undefined,
  );
  ausIso(liste, "mail:klNachfassMailAm", "mail", b.klNachfassMailAm, "Nachfassmail zum Kennenlernen");
  ausIso(liste, "mail:nachfassMailAm", "mail", b.nachfassMailAm, "Nachfassmail aus dem Eingang");
  if (!artenMitZeile.has("paket_uebersicht")) {
    ausIso(liste, "mail:paketUebersichtSentAt", "mail", b.paketUebersichtSentAt, "Startfahrplan versendet");
  }
  if (!artenMitZeile.has("muster_vertrag")) {
    for (const eintrag of b.musterVertraegeSentAt || []) {
      ausIso(
        liste, `mail:muster:${eintrag.at}`, "mail", eintrag.at,
        mailArtLabel("muster_vertrag", eintrag.paketTitel),
      );
    }
  }
  ausIso(liste, "mail:vertragErstVersandAt", "mail", b.vertragErstVersandAt, "Vertrag zur Unterschrift versendet");
  (b.vertragErinnerungenAt || []).forEach((am, i) => {
    ausIso(liste, `mail:vertragErinnerung:${i}:${am}`, "mail", am, `Erinnerung an den Vertrag (${i + 1}.)`);
  });
  ausIso(
    liste, "mail:zugangsdatenGesendetAm", "mail", b.zugangsdatenGesendetAm, "Zugangsdaten versendet",
    b.zugangsdatenGesendetAn ? `An ${b.zugangsdatenGesendetAn}` : undefined,
  );
  ausIso(liste, "mail:userInviteSentAt", "mail", b.userInviteSentAt, "Einladung ins CRM versendet");

  /* ── Termine ───────────────────────────────────────────────────────── */
  const buchung = quellen.buchung;
  if (buchung) {
    if (buchung.status === "abgesagt") {
      ausIso(
        liste, `termin:absage:${buchung.id}`, "termin", buchung.abgesagtAt, "Termin abgesagt",
        buchung.bezeichnung || undefined,
        [{ text: "vom Bewerber abgesagt", ton: "warnung" }],
      );
    }
    ausIso(
      liste, `termin:buchung:${buchung.id}`, "termin", buchung.startAt,
      buchung.bezeichnung || "Videocall",
      undefined,
      [{ text: "selbst gebucht", ton: "info" }],
    );
  }
  /*
    Im neuen Bewerberprozess heißt derselbe Termin „Kennenlerngespräch", so wie
    ihn Bewerber und HR-Managerin nennen. Im alten ist es ein Telefonat, dort
    bleibt die alte Beschriftung. Beides steht in denselben zwei Feldern.
  */
  ausTermin(
    liste, "termin:erstgespraech", { datum: b.erstgespraechDatum, uhrzeit: b.erstgespraechUhrzeit },
    istImNeuenProzess(b) ? "Kennenlerngespräch" : "Erstgesprächstermin",
    b.erstgespraechBerater ? `Mit ${b.erstgespraechBerater}` : undefined,
  );
  /*
   * Der von Hand gepflegte Videocall. Steht schon eine Buchung, wäre er
   * derselbe Termin ein zweites Mal: Die Buchung schreibt Datum und Uhrzeit in
   * dieselben Felder.
   */
  if (!buchung) {
    ausTermin(
      liste, "termin:closing", { datum: b.closingTerminDatum, uhrzeit: b.closingTerminUhrzeit },
      "Videocall-Termin",
      b.closingBeraterName ? `Mit ${b.closingBeraterName}` : undefined,
      [{ text: "von Hand eingetragen", ton: "still" }],
    );
  }
  ausTermin(
    liste, "termin:onboarding", { datum: b.onboardingTerminDatum, uhrzeit: b.onboardingTerminUhrzeit },
    "Onboarding-Termin",
  );
  ausTermin(
    liste, "termin:followup", { datum: b.followUpDatum, uhrzeit: b.followUpUhrzeit },
    "Follow-up",
    (b.followUpNotiz || "").trim() || undefined,
  );
  ausTermin(
    liste, "termin:bedenkzeit", { datum: b.bedenkzeitRueckrufAm, uhrzeit: b.bedenkzeitRueckrufUhrzeit },
    "Rückruf aus der Bedenkzeit",
    (b.bedenkzeitGrund || "").trim() || undefined,
  );

  /* ── Ausgefüllte Bögen ─────────────────────────────────────────────── */
  ausIso(
    liste, "bogen:kennenlernen", "bogen", quellen.kennenlernEingereichtAm, "Kennenlernbogen ausgefüllt",
  );
  ausIso(
    liste, "bogen:vorab", "bogen", quellen.vorabEingereichtAm, "Vorabbogen ausgefüllt",
  );

  /* ── Schritte im Ablauf ────────────────────────────────────────────── */
  ausTermin(
    liste, "schritt:beworben", { datum: b.beworben },
    "Bewerbung eingegangen",
    (b.quelle || "").trim() ? `Über ${b.quelle}` : undefined,
  );
  // `beworben` steht mancherorts als voller Zeitstempel, `erstelltAm` immer.
  if (!b.beworben) ausIso(liste, "schritt:erstelltAm", "schritt", b.erstelltAm, "Bewerbung eingegangen");
  ausIso(liste, "schritt:paketBestaetigt", "schritt", b.paketBestaetigtAm, "Paket bestätigt",
    (b.paketwahl || "").trim() || undefined);
  ausIso(liste, "schritt:vertragSigned", "schritt", b.vertragSignedAt, "Vertrag unterschrieben");
  ausIso(liste, "schritt:rechnungErstellt", "schritt", b.rechnungErstelltAm, "Rechnung erstellt",
    (b.rechnungNr || "").trim() || undefined);
  ausIso(liste, "schritt:rechnungBezahlt", "schritt", b.rechnungBezahltAm, "Rechnung bezahlt");
  ausIso(liste, "schritt:aktiv", "schritt", b.aktivAm, "Als Partner aktiviert");
  ausIso(
    liste, "schritt:selbstAbgemeldet", "schritt", b.selbstAbgemeldetAm, "Selbst abgemeldet",
    (b.selbstAbgemeldetGrund || "").trim() || undefined,
    [{ text: "kein Interesse mehr", ton: "warnung" }],
  );
  ausIso(
    liste, "schritt:abgelehnt", "schritt", b.erstgespraechSkript?.abgelehntAm, "Abgesagt",
    (b.erstgespraechSkript?.absageGrund || "").trim() || undefined,
    [{ text: "abgesagt", ton: "warnung" }],
  );

  /*
   * Die Onboarding-Schritte. Drei Listen mit demselben Aufbau: erledigt,
   * wann, durch wen. Sie stehen einzeln in der Liste, denn genau danach fragt
   * die Aktivierung: Wer hat den Schritt abgehakt, und wann.
   */
  for (const eintrag of b.onboardingChecklist || []) {
    if (!eintrag?.done) continue;
    ausIso(
      liste, `schritt:onboarding:${eintrag.id}`, "schritt", eintrag.doneAt, eintrag.label || "Onboarding-Schritt",
      eintrag.doneBy ? `Erledigt von ${eintrag.doneBy}` : undefined,
    );
  }
  for (const eintrag of b.academyPflichtModule || []) {
    if (!eintrag?.done) continue;
    ausIso(
      liste, `schritt:academy:${eintrag.id}`, "schritt", eintrag.doneAt, eintrag.label || "Pflichtmodul",
      eintrag.doneBy ? `Erledigt von ${eintrag.doneBy}` : undefined,
    );
  }
  for (const [id, eintrag] of Object.entries(b.aktivierungOnboarding || {})) {
    if (!eintrag?.done) continue;
    ausIso(
      liste, `schritt:aktivierung:${id}`, "schritt", eintrag.doneAt, "Aktivierungsschritt erledigt",
      (eintrag.notiz || "").trim() || (eintrag.doneBy ? `Erledigt von ${eintrag.doneBy}` : undefined),
    );
  }

  /*
   * Das jüngste zuerst. Bei gleichem Zeitpunkt entscheidet die Kennung, damit
   * die Reihenfolge bei jedem Aufruf dieselbe ist; sonst springen Einträge in
   * der Liste, sobald React neu zeichnet.
   */
  return liste.sort((a, z) => (z.ms - a.ms) || a.id.localeCompare(z.id));
}

/* ── Filter und Tagesgruppen ─────────────────────────────────────────────── */

export const EREIGNIS_FILTER: { key: "alle" | EreignisArt; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "mail", label: "Mails" },
  { key: "termin", label: "Termine" },
  { key: "bogen", label: "Bögen" },
  { key: "schritt", label: "Schritte" },
];

export type EreignisTag = { schluessel: string; label: string; ereignisse: BewerberEreignis[] };

/**
 * Nach Tagen gruppieren, in derselben Reihenfolge wie die Liste.
 *
 * „Heute" und „Gestern" tragen zusätzlich ihr Datum, sonst weiss man am
 * Montag nicht mehr, welcher Tag „Gestern" war, wenn die Seite über das
 * Wochenende offen stand.
 */
export function gruppiereNachTag(
  ereignisse: BewerberEreignis[],
  jetzt: Date = new Date(),
): EreignisTag[] {
  const heute = tagesSchluessel(jetzt.getTime());
  const gestern = tagesSchluessel(jetzt.getTime() - 24 * 60 * 60 * 1000);
  const gruppen: EreignisTag[] = [];
  const nachSchluessel = new Map<string, EreignisTag>();
  for (const ereignis of ereignisse) {
    const schluessel = tagesSchluessel(ereignis.ms);
    let gruppe = nachSchluessel.get(schluessel);
    if (!gruppe) {
      const d = new Date(ereignis.ms);
      const datum = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
      const label =
        schluessel === heute ? `Heute, ${datum}`
        : schluessel === gestern ? `Gestern, ${datum}`
        : datum;
      gruppe = { schluessel, label, ereignisse: [] };
      nachSchluessel.set(schluessel, gruppe);
      gruppen.push(gruppe);
    }
    gruppe.ereignisse.push(ereignis);
  }
  return gruppen;
}

/** Wie viele Ereignisse je Art vorliegen, für die Zahlen an den Filtern. */
export function zaehleArten(ereignisse: BewerberEreignis[]): Record<string, number> {
  const zahlen: Record<string, number> = { alle: ereignisse.length };
  for (const ereignis of ereignisse) {
    zahlen[ereignis.art] = (zahlen[ereignis.art] || 0) + 1;
  }
  return zahlen;
}
