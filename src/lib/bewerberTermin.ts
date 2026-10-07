/**
 * Die Terminbuchung des Bewerbers, reine Rechen- und Beschriftungslogik.
 *
 * Ohne Datenbank und ohne React, damit sie prüfbar bleibt. Der Zugriff auf
 * Supabase liegt in `bewerberTerminStore.ts`, die Darstellung auf der letzten
 * Ansicht von `src/pages/BewerberKennenlernen.tsx`.
 *
 * Warum es diese Datei überhaupt gibt, obwohl es `buchungAuswahl.ts` schon
 * gibt: Die Zeitrechnung wird von dort übernommen und nicht nachgebaut,
 * `gruppiereNachTag`, `fensterTage`, `beschriftungZeitraum` und alles Weitere
 * stehen dort und werden hier nur benutzt. Was sich unterscheidet, ist die
 * Ansprache. Die Buchungsseite siezt den Kunden, das Kennenlernen duzt den
 * Bewerber von der ersten bis zur zwanzigsten Ansicht. Eine Meldung, die
 * plötzlich „Bitte wählen Sie" sagt, fiele aus dem ganzen Bogen heraus.
 *
 * Und die eine Sache, um die es hier fachlich geht: Ein Bewerber ist **kein
 * Lead**. Seine Buchung läuft deshalb nicht über `buchung_anlegen`, sondern
 * über `bewerber_termin_buchen`, und die legt weder einen Kontakt an noch
 * setzt sie eine Pipelinestufe. Bewacht wird das von
 * `bewerberTermin.test.ts`, und zwar am Text der Migration.
 */

import { beschriftungDatumLang, beschriftungDauer, tagInZone, uhrzeitInZone } from "@/lib/buchungAuswahl";

/** Der Anlass, unter dem ein Bewerbergespräch im Buchungssystem läuft. */
export const BEWERBER_TERMIN_ANLASS = "bewerbergespraech";

/** Wie viele Tage die Zeitauswahl auf einer Seite zeigt. Eine Woche. */
export const BEWERBER_TAGE_PRO_SEITE = 7;

/** Die Person, mit der der Bewerber spricht. Aus dem Profil, nicht erfunden. */
export interface BewerberTerminGastgeber {
  name: string;
  email?: string | null;
  telefon?: string | null;
  bild?: string | null;
  position?: string | null;
}

/** Der gebuchte Termin, so wie der Bewerber ihn sieht. */
export interface BewerberTerminBuchung {
  id: string;
  startAt: string;
  endeAt: string;
  dauerMinuten: number;
  status: string;
  bezeichnung: string | null;
  /** Zugang zum Videoraum. Fehlt, wenn der Raum inzwischen fort ist. */
  raumToken: string | null;
}

/** Was `bewerber_termin_zugang` herausgibt. */
export interface BewerberTerminZugang {
  gastgeber: BewerberTerminGastgeber;
  zeitzone: string;
  /** Die Dauer, die sich aus seinem Klärungsbedarf ergibt: 30 oder 45. */
  dauerMinuten: number;
  bezeichnung: string;
  beschreibung: string | null;
  vorausschauTage: number;
  /** Erst nach dem Absenden der Angaben lässt sich buchen. */
  buchbar: boolean;
  buchung: BewerberTerminBuchung | null;
}

function text(wert: unknown): string {
  return typeof wert === "string" ? wert : "";
}

function zahl(wert: unknown, ersatz: number): number {
  const n = typeof wert === "number" ? wert : Number(wert);
  return Number.isFinite(n) && n > 0 ? n : ersatz;
}

/**
 * Die Antwort der Datenbank in ein geprüftes Objekt übersetzen.
 *
 * Bewusst nachsichtig: Fehlt ein Feld, weil die Migration eine ältere Fassung
 * hat, steht dort ein vernünftiger Wert statt `undefined`. Nur wenn gar nichts
 * Brauchbares kommt, gibt es `null`, und dann zeigt die Terminansicht wieder
 * das, was sie vor der Terminbuchung gezeigt hat.
 */
export function leseZugang(roh: unknown): BewerberTerminZugang | null {
  // Eine Liste ist keine Antwort dieser Funktion. Sie kommt von einer anderen
  // RPC, und ein Objekt daraus zu bauen ergäbe einen Kalender, den es nicht gibt.
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const q = roh as Record<string, unknown>;

  const g = (q.gastgeber && typeof q.gastgeber === "object" ? q.gastgeber : {}) as Record<string, unknown>;
  const name = text(g.name).trim();
  const zeitzone = text(q.zeitzone).trim() || "Europe/Berlin";
  const bezeichnung = text(q.bezeichnung).trim() || "Bewerbergespräch";

  const b = (q.buchung && typeof q.buchung === "object" ? q.buchung : null) as Record<string, unknown> | null;
  const buchung: BewerberTerminBuchung | null =
    b && text(b.id) && text(b.start_at)
      ? {
          id: text(b.id),
          startAt: text(b.start_at),
          endeAt: text(b.ende_at),
          dauerMinuten: zahl(b.dauer_minuten, 45),
          status: text(b.status) || "offen",
          bezeichnung: text(b.bezeichnung) || null,
          raumToken: text(b.raum_token) || null,
        }
      : null;

  return {
    gastgeber: {
      name: name || "Deine Ansprechpartnerin",
      email: text(g.email) || null,
      telefon: text(g.telefon) || null,
      bild: text(g.bild) || null,
      position: text(g.position) || null,
    },
    zeitzone,
    dauerMinuten: zahl(q.dauer_minuten, 45),
    bezeichnung,
    beschreibung: text(q.beschreibung) || null,
    vorausschauTage: zahl(q.vorausschau_tage, 30),
    buchbar: q.buchbar === true,
    buchung,
  };
}

/** Steht gerade ein Termin, den der Bewerber verschieben oder absagen kann? */
export function hatOffenenTermin(zugang: BewerberTerminZugang | null): boolean {
  return !!zugang?.buchung && zugang.buchung.status === "offen";
}

/**
 * Die Zeile, die dem Bewerber seinen Termin nennt.
 *
 * Beispiel: „Montag, 7. September 2026, 10:00 bis 10:45 Uhr (45 Minuten)".
 * Das Datum steht ausgeschrieben, denn es ist die eine Angabe, die er sich
 * merken muss.
 */
export function terminZeile(buchung: BewerberTerminBuchung, zeitzone: string): string {
  const start = new Date(buchung.startAt);
  if (Number.isNaN(start.getTime())) return "";
  const ende = new Date(buchung.endeAt);
  const bis = Number.isNaN(ende.getTime())
    ? new Date(start.getTime() + Math.max(0, buchung.dauerMinuten) * 60_000)
    : ende;
  const tag = tagInZone(start, zeitzone);
  return (
    `${beschriftungDatumLang(tag)}, ${uhrzeitInZone(start, zeitzone)} bis ` +
    `${uhrzeitInZone(bis, zeitzone)} Uhr (${beschriftungDauer(buchung.dauerMinuten)})`
  );
}

function fehlertext(meldung: unknown): string {
  if (meldung instanceof Error) return meldung.message;
  if (typeof meldung === "string") return meldung;
  if (meldung && typeof meldung === "object") {
    const felder = meldung as { message?: unknown; error_description?: unknown; details?: unknown };
    for (const wert of [felder.message, felder.error_description, felder.details]) {
      if (typeof wert === "string" && wert.trim()) return wert;
    }
  }
  return "";
}

/**
 * Die Meldung der Datenbank in einen Satz übersetzen, den der Bewerber
 * versteht, und dabei sagen, ob die freien Zeiten neu geholt werden müssen.
 *
 * Gegenstück zu `deuteBuchungsfehler` in `buchungAuswahl.ts`, aber in der
 * Anrede des Kennenlernens und mit den drei Fällen, die es dort nicht gibt:
 * noch nicht abgesendet, schon gebucht, gerade kein Kalender.
 *
 * Zwei Menschen können im selben Augenblick auf dieselbe Zeit klicken. Wer
 * dann verliert, soll nicht in einer Sackgasse stehen, sondern die
 * aktualisierte Auswahl sehen.
 */
export function deuteBewerberTerminFehler(meldung: unknown): { text: string; neuLaden: boolean } {
  const roh = fehlertext(meldung).toLowerCase();

  if (roh.includes("vergeben")) {
    return {
      text: "Diese Zeit war einen Moment schneller weg, als du klicken konntest. Wir haben die freien Zeiten aktualisiert, such dir bitte eine andere aus.",
      neuLaden: true,
    };
  }
  if (roh.includes("kein termin moeglich") || roh.includes("kein termin möglich")) {
    return {
      text: "Zu dieser Zeit geht es leider nicht mehr. Such dir bitte eine der aktualisierten Zeiten aus.",
      neuLaden: true,
    };
  }
  if (roh.includes("kurzfristig")) {
    return { text: "Das ist uns zu kurzfristig. Such dir bitte eine spätere Zeit aus.", neuLaden: true };
  }
  if (roh.includes("weit in der zukunft")) {
    return { text: "Das liegt zu weit in der Zukunft. Such dir bitte eine frühere Zeit aus.", neuLaden: true };
  }
  if (roh.includes("sende zuerst")) {
    return { text: "Sende bitte zuerst deine Angaben ab, danach kannst du dir einen Termin aussuchen.", neuLaden: false };
  }
  if (roh.includes("bereits einen termin")) {
    return { text: "Du hast schon einen Termin. Du kannst ihn hier verschieben oder absagen.", neuLaden: true };
  }
  if (roh.includes("keine terminbuchung moeglich") || roh.includes("keine terminbuchung möglich")) {
    return {
      text: "Gerade können wir dir keine Zeiten anbieten. Antworte einfach auf unsere Mail, dann melden wir uns mit einem Vorschlag.",
      neuLaden: false,
    };
  }
  if (roh.includes("unbekannt")) {
    return { text: "Diesen Link kennen wir nicht mehr. Schreib uns kurz, dann bekommst du einen neuen.", neuLaden: false };
  }
  if (roh.includes("absagen")) {
    return { text: "Dieser Termin lässt sich nicht mehr absagen.", neuLaden: true };
  }
  if (roh.includes("verschieben")) {
    return { text: "Dieser Termin lässt sich nicht mehr verschieben.", neuLaden: true };
  }

  return { text: "Das hat leider nicht geklappt. Versuch es bitte gleich noch einmal.", neuLaden: true };
}

/** Die drei Vorgänge, über die HR benachrichtigt wird. */
export type BewerberTerminVorgang = "gebucht" | "verschoben" | "abgesagt";

/** Die Betreffzeile der Meldung an HR. Steht hier, damit ein Test sie liest. */
export const VORGANG_TEXTE: Record<BewerberTerminVorgang, string> = {
  gebucht: "hat einen Termin gebucht",
  verschoben: "hat seinen Termin verschoben",
  abgesagt: "hat seinen Termin abgesagt",
};
