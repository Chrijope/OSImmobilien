/**
 * Die Mails zum Notartermin.
 *
 * ## Wann sie hinausgehen
 *
 * Erst beim Klick auf „Freigeben“ im Kundenprofil, nicht mehr beim Verlassen
 * des Datumsfelds. Vorher fehlten beim ersten Datum meist Uhrzeit, Notar und
 * Adresse, der Kunde bekam den Termin vor der Freigabe im Portal, und nach
 * „Termin ändern“ ging gar nichts mehr hinaus.
 *
 * Jeder Versand gehört zu einem Terminstand aus Datum, Uhrzeit, Notar und
 * Adresse (`notarterminStandSchluessel`). Der zuletzt verschickte Stand wird
 * am Investment gemerkt. Daraus folgt bei jeder Freigabe genau eins:
 *
 * - noch nie verschickt: die normale Terminmail,
 * - anderer Stand als zuletzt: eine Änderungsmail,
 * - derselbe Stand: nichts.
 *
 * ## Wer was bekommt
 *
 * - Der Kunde bekommt `notartermin-geplant`, eine Kundenmail in der Sie-Form
 *   (Notar gehört zur Gruppe F) mit Datum, Uhrzeit, Notar, Anschrift und
 *   seinem Ansprechpartner.
 * - Der zuständige Vertriebspartner und das Büro bekommen die interne Meldung
 *   `notartermin-benachrichtigung`, jede Adresse genau einmal.
 * - Wählt der Kunde den Termin im Portal selbst aus den Vorschlägen, bekommen
 *   Vertriebspartner und Büro `notartermin-bestaetigt`
 *   (`notarterminBestaetigungIntern`). Der Kunde bekommt dort seine eigene
 *   Bestätigung `notartermin-bestaetigung-kunde`.
 *
 * ## Kein Doppelversand
 *
 * Hat der Kunde genau dieses Datum im Portal schon bestätigt, geht keine
 * zweite Kundenmail hinaus. Die Idempotenzschlüssel hängen am Investment, am
 * Terminstand und je interner Adresse am Empfänger. Ein zweites Auslösen für
 * denselben Stand verschickt also auch dann nichts neu, wenn der gemerkte
 * Stand verloren ginge.
 */
import { sendeVorlagenMail, type VersandErgebnis } from "@/lib/mailVersand";
import { BUERO_EMAIL } from "@/lib/impressumKontakt";

/**
 * Meta-Feld am Investment mit dem zuletzt verschickten Terminstand. Braucht
 * keine Migration, interne Rollen dürfen jeden Meta-Schlüssel schreiben.
 */
export const NOTAR_MAIL_STAND_FELD = "notarTerminMailStand";

export interface NotarterminEintrag {
  investmentId: string;
  /** Vor- und Nachname des Kunden. */
  kundeName: string;
  kundeEmail?: string;
  /** Der Kontakt, dessen Kundensprache die Kundenmail bekommt. */
  kontaktId?: string;
  /** Wie im Datumsfeld gespeichert, meist JJJJ-MM-TT. */
  datum: string;
  uhrzeit?: string;
  notarName?: string;
  notarAdresse?: string;
  notarEmail?: string;
  objektName?: string;
  wohnungName?: string;
  /** Link ins Kundenportal für die Kundenmail. */
  portalUrl?: string;
  /** Zuständiger Vertriebspartner des Kontakts. */
  vp?: { userId?: string; name?: string; email?: string };
  /** Termin, den der Kunde im Portal schon bestätigt hat, falls es einen gibt. */
  bestaetigterTermin?: { datum: string } | null;
}

export interface NotarterminVersand {
  /** null, wenn keine Kundenmail fällig war. */
  kunde: VersandErgebnis | null;
  intern: Array<{ empfaenger: string; ergebnis: VersandErgebnis }>;
}

/** JJJJ-MM-TT wird zu "Donnerstag, 15. Oktober 2026", alles andere bleibt, wie es ist. */
export function lesbaresNotarDatum(datum: string): string {
  const roh = (datum || "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(roh);
  if (!iso) return roh;
  const tag = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  if (Number.isNaN(tag.getTime())) return roh;
  return tag.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function adresse(wert: string | undefined | null): string {
  return (wert || "").trim().toLowerCase();
}

/** Leerraum zusammenfassen, damit ein zusätzliches Leerzeichen keinen neuen Stand ergibt. */
function glatt(wert: string | undefined | null): string {
  return (wert || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** FNV-1a, 32 Bit. Nur zum Wiedererkennen eines Stands, nicht als Schutz. */
function kurzerHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type NotarterminStand = Pick<NotarterminEintrag, "datum" | "uhrzeit" | "notarName" | "notarAdresse">;

/**
 * Ein kurzer, stabiler Schlüssel je Terminstand. Das Datum steht lesbar
 * vorne, damit man den Stand im Mailprotokoll wiederfindet. Die Adresse
 * steckt nur im Hash, sie wäre als Schlüssel zu lang.
 */
export function notarterminStandSchluessel(stand: NotarterminStand): string {
  const teile = [stand.datum, stand.uhrzeit, stand.notarName, stand.notarAdresse].map(glatt);
  return `${teile[0] || "ohne-datum"}:${kurzerHash(teile.join("|"))}`;
}

export type NotarMailAnlass = "erstmals" | "geaendert" | "unveraendert";

/** Vergleicht den zuletzt verschickten Stand mit dem aktuellen. */
export function notarMailAnlass(letzterStand: string | null | undefined, aktuellerStand: string): NotarMailAnlass {
  const letzter = (letzterStand || "").trim();
  if (!letzter) return "erstmals";
  return letzter === aktuellerStand ? "unveraendert" : "geaendert";
}

/**
 * Empfänger der internen Meldung: Vertriebspartner und Büro, ohne doppelte
 * Adresse und nie der Kunde selbst.
 */
export function interneNotarEmpfaenger(vpEmail: string | undefined, kundeEmail: string | undefined): string[] {
  const kunde = adresse(kundeEmail);
  const liste: string[] = [];
  for (const kandidat of [vpEmail, BUERO_EMAIL]) {
    const a = adresse(kandidat);
    if (!a || a === kunde || liste.includes(a)) continue;
    liste.push(a);
  }
  return liste;
}

/** Hat der Kunde für dieses Datum schon die Bestätigungsmail aus dem Portal? */
export function kundeKenntTerminSchon(eintrag: Pick<NotarterminEintrag, "datum" | "bestaetigterTermin">): boolean {
  const bestaetigt = eintrag.bestaetigterTermin?.datum?.trim();
  return !!bestaetigt && bestaetigt === eintrag.datum.trim();
}

/** Ist alles hinausgegangen, was fällig war? */
export function allesVerschickt(versand: NotarterminVersand): boolean {
  return (versand.kunde === null || versand.kunde.ok) && versand.intern.every((i) => i.ergebnis.ok);
}

export async function notarterminMailsVersenden(
  eintrag: NotarterminEintrag,
  optionen: { geaendert?: boolean } = {},
): Promise<NotarterminVersand> {
  const datumLesbar = lesbaresNotarDatum(eintrag.datum);
  const uhrzeit = (eintrag.uhrzeit || "").trim();
  const stand = notarterminStandSchluessel(eintrag);
  const geaendert = optionen.geaendert ? { geaendert: true } : {};
  const ergebnis: NotarterminVersand = { kunde: null, intern: [] };

  const kundeEmail = (eintrag.kundeEmail || "").trim();
  if (kundeEmail && !kundeKenntTerminSchon(eintrag)) {
    ergebnis.kunde = await sendeVorlagenMail({
      vorlage: "notartermin-geplant",
      empfaenger: kundeEmail,
      idempotenzSchluessel: `notartermin-geplant:${eintrag.investmentId}:${stand}`,
      // Deutsch oder Englisch ermittelt der Server aus dem Kundenprofil.
      kontaktId: eintrag.kontaktId,
      felder: {
        kundeName: eintrag.kundeName,
        datum: datumLesbar,
        uhrzeit,
        notarName: eintrag.notarName || "",
        notarAdresse: eintrag.notarAdresse || "",
        objektName: eintrag.objektName || "",
        wohnungName: eintrag.wohnungName || "",
        ...geaendert,
        ...(eintrag.portalUrl ? { portalUrl: eintrag.portalUrl } : {}),
        // Der zuständige Partner steht unter der Mail, nicht wer den Termin
        // zufällig eingetragen hat. Ohne Partner löst der Server den Absender auf.
        ...(eintrag.vp?.userId ? { beraterUserId: eintrag.vp.userId } : {}),
      },
    });
  }

  for (const empfaenger of interneNotarEmpfaenger(eintrag.vp?.email, kundeEmail)) {
    const versand = await sendeVorlagenMail({
      vorlage: "notartermin-benachrichtigung",
      empfaenger,
      idempotenzSchluessel: `notartermin-intern:${eintrag.investmentId}:${stand}:${empfaenger}`,
      felder: {
        kundeName: eintrag.kundeName,
        terminDatum: datumLesbar,
        terminUhrzeit: uhrzeit,
        vertriebspartner: eintrag.vp?.name || "",
        notarName: eintrag.notarName || "",
        notarAdresse: eintrag.notarAdresse || "",
        notarEmail: eintrag.notarEmail || "",
        objektName: eintrag.objektName || "",
        wohnungName: eintrag.wohnungName || "",
        ...geaendert,
      },
    });
    ergebnis.intern.push({ empfaenger, ergebnis: versand });
  }

  return ergebnis;
}

export interface NotarterminFreigabeVersand {
  anlass: NotarMailAnlass | "ohne-datum";
  /** null, wenn nichts verschickt wurde. */
  versand: NotarterminVersand | null;
  /**
   * Der Stand, den sich das Investment merken soll. null heißt: nicht merken,
   * weil nichts fällig war oder etwas nicht hinausging. Im zweiten Fall
   * holt eine erneute Freigabe das Fehlende nach, die schon verschickten
   * Mails hält der Idempotenzschlüssel zurück.
   */
  merken: string | null;
}

/**
 * Die Mails bei der Freigabe eines gesetzten Termins. Ohne Datum geht nichts
 * hinaus, eine Terminmail ohne Termin hilft niemandem.
 */
export async function notarterminFreigabeMails(
  eintrag: NotarterminEintrag,
  letzterStand: string | null | undefined,
): Promise<NotarterminFreigabeVersand> {
  if (!(eintrag.datum || "").trim()) return { anlass: "ohne-datum", versand: null, merken: null };
  const stand = notarterminStandSchluessel(eintrag);
  const anlass = notarMailAnlass(letzterStand, stand);
  if (anlass === "unveraendert") return { anlass, versand: null, merken: null };
  const versand = await notarterminMailsVersenden(eintrag, { geaendert: anlass === "geaendert" });
  return { anlass, versand, merken: allesVerschickt(versand) ? stand : null };
}

/**
 * Der Satz für die Rückmeldung nach der Freigabe. `problem` heißt: nicht
 * alles ging hinaus, die Rückmeldung soll auffallen.
 */
export function freigabeRueckmeldung(ergebnis: NotarterminFreigabeVersand): { text: string; problem: boolean } {
  if (ergebnis.anlass === "ohne-datum") {
    return { text: "Ohne Datum ging keine Terminmail hinaus.", problem: true };
  }
  if (ergebnis.anlass === "unveraendert" || !ergebnis.versand) {
    return { text: "Der Termin ist unverändert, es ging keine neue E-Mail hinaus.", problem: false };
  }
  const v = ergebnis.versand;
  const fehlgeschlagen = [
    ...(v.kunde && !v.kunde.ok ? ["Kunde"] : []),
    ...v.intern.filter((i) => !i.ergebnis.ok).map((i) => i.empfaenger),
  ];
  if (fehlgeschlagen.length > 0) {
    return {
      text: `Nicht zugestellt an: ${fehlgeschlagen.join(", ")}. Über „Termin ändern“ und erneutes Freigeben wird nachgeschickt.`,
      problem: true,
    };
  }
  const was = ergebnis.anlass === "geaendert" ? "die Änderung per E-Mail" : "eine E-Mail";
  return v.kunde
    ? { text: `Kunde, Vertriebspartner und Büro haben ${was} bekommen.`, problem: false }
    // Ohne Kundenmail: keine Adresse hinterlegt, oder er kennt den Termin schon aus dem Portal.
    : { text: `Vertriebspartner und Büro haben ${was} bekommen, an den Kunden ging keine Terminmail.`, problem: false };
}

export interface NotarterminBestaetigung {
  investmentId: string;
  kundeName: string;
  kundeEmail?: string;
  /** Wie aus dem Vorschlag übernommen, meist JJJJ-MM-TT. */
  datum: string;
  uhrzeit?: string;
  vpName?: string;
  vpEmail?: string;
  /** Link auf die Kundenakte im CRM. */
  kundeLink?: string;
}

/**
 * Der Kunde hat im Portal einen Vorschlag bestätigt: Vertriebspartner und
 * Büro bekommen `notartermin-bestaetigt`, jede Adresse einmal je Termin.
 * Vorher ging die Meldung nur an den Partner, und ohne zuständigen Partner
 * an niemanden.
 */
export async function notarterminBestaetigungIntern(
  eintrag: NotarterminBestaetigung,
): Promise<Array<{ empfaenger: string; ergebnis: VersandErgebnis }>> {
  const uhrzeit = (eintrag.uhrzeit || "").trim();
  const vp = adresse(eintrag.vpEmail);
  const ergebnisse: Array<{ empfaenger: string; ergebnis: VersandErgebnis }> = [];
  for (const empfaenger of interneNotarEmpfaenger(eintrag.vpEmail, eintrag.kundeEmail)) {
    const ergebnis = await sendeVorlagenMail({
      vorlage: "notartermin-bestaetigt",
      empfaenger,
      idempotenzSchluessel: `notartermin-bestaetigt:${eintrag.investmentId}:${eintrag.datum}:${uhrzeit || "x"}:${empfaenger}`,
      felder: {
        kundeName: eintrag.kundeName,
        datum: lesbaresNotarDatum(eintrag.datum),
        uhrzeit,
        // Die Anrede mit Vornamen nur für den Partner, das Büro bekommt „Hallo,“.
        ...(empfaenger === vp && eintrag.vpName ? { vpName: eintrag.vpName } : {}),
        ...(eintrag.kundeLink ? { kundeLink: eintrag.kundeLink } : {}),
      },
    });
    ergebnisse.push({ empfaenger, ergebnis });
  }
  return ergebnisse;
}
