import { pflichtBonitaetDocs } from "@/lib/bonitaetDocs";

/**
 * Wann die Finanzierung freigegeben ist.
 *
 * Der Ablauf lautet: Objektauswahl, Reservierung, Bonitaetsunterlagen,
 * Finanzierung, Notar. Zwischen der unterschriebenen Reservierung und der
 * Finanzierung liegen also die Bonitaetsunterlagen, und die koennen Wochen
 * dauern.
 *
 * Bis zum 11.09.2026 wurde der Finanzierungspartner schon mit der
 * unterschriebenen Reservierungsvereinbarung gerufen
 * (`supabase/functions/finalize-reservierung/index.ts`). Er bekam damit eine
 * Aufgabe, an der er nicht arbeiten konnte, weil ihm die Unterlagen fehlten.
 * Gerufen wird er jetzt erst, wenn alle Bonitaetsunterlagen hochgeladen **und**
 * freigegeben sind; das erledigt `meldeBonitaetFreigabe`.
 *
 * Diese Datei beantwortet dieselbe Frage fuer die Anzeige im Kundenportal und
 * fuer den automatischen Stufenwechsel auf Finanzierung. Entscheidung
 * Christians vom 11.09.2026.
 *
 * Seit dem 25.09.2026 gilt sie NICHT mehr fuer die Finanzierungskarte im
 * Kundenprofil. Dort ist die Finanzierung schon ab der unterschriebenen
 * Reservierung offen, siehe `finanzierungIntern` in
 * `src/lib/investmentFreischaltung.ts`. Intern frueher, beim Kunden erst nach
 * der Freigabe, und zwar mit Absicht.
 */

export interface FinanzierungFreigabeStand {
  /** Alle Unterlagen liegen vor und sind freigegeben. */
  frei: boolean;
  /** Unterlagen, die der Kunde noch hochladen muss. */
  fehlend: string[];
  /** Hochgeladen, aber noch nicht freigegeben. */
  inPruefung: string[];
  /** Abgelehnt und deshalb erneut hochzuladen. */
  abgelehnt: string[];
}

/** Ein Status gilt als hochgeladen, sobald er nicht mehr leer ist. */
function istHochgeladen(status: unknown): boolean {
  const s = String(status || "").trim();
  return s !== "" && s !== "missing" && s !== "offen";
}

export function finanzierungFreigabeStand(opts: {
  /** Die fuer dieses Investment benoetigten Unterlagen, beim Namen. */
  benoetigt: readonly string[];
  /** Der Stand je Unterlage, wie er am Investment liegt (`meta.docStatuses`). */
  statuses: Record<string, unknown> | undefined | null;
}): FinanzierungFreigabeStand {
  const statuses = opts.statuses || {};
  const fehlend: string[] = [];
  const inPruefung: string[] = [];
  const abgelehnt: string[] = [];

  for (const name of opts.benoetigt) {
    const status = String(statuses[name] || "").trim();
    if (status === "approved") continue;
    if (status === "rejected") { abgelehnt.push(name); continue; }
    if (istHochgeladen(status)) { inPruefung.push(name); continue; }
    fehlend.push(name);
  }

  // Ohne bekannte Liste ist die Frage nicht zu beantworten. Dann gilt die
  // Finanzierung als nicht frei, denn "wir wissen es nicht" darf nie wie
  // "alles erledigt" aussehen.
  const frei = opts.benoetigt.length > 0
    && fehlend.length === 0 && inPruefung.length === 0 && abgelehnt.length === 0;

  return { frei, fehlend, inPruefung, abgelehnt };
}

/**
 * Ein Satz, der den Stand der Bonitaetsunterlagen mit Grund benennt.
 *
 * Achtung: Zurzeit zeigt ihn keine Oberflaeche an. Das Kundenportal nutzt den
 * festen Text `portal.investments.finanzierung.locked`, das Kundenprofil den
 * Sperrgrund aus `finanzierungIntern`. Er bleibt fuer eine spaetere Anzeige
 * stehen und ist durch Tests abgesichert.
 */
export function finanzierungFreigabeText(stand: FinanzierungFreigabeStand): string {
  if (stand.frei) {
    return "Alle Bonitätsunterlagen sind freigegeben. Die Finanzierung ist damit angestoßen.";
  }
  if (stand.abgelehnt.length > 0) {
    return `Die Finanzierung wird freigegeben, sobald alle Bonitätsunterlagen vorliegen und geprüft sind. ${stand.abgelehnt.length === 1 ? "Eine Unterlage wurde abgelehnt und muss" : `${stand.abgelehnt.length} Unterlagen wurden abgelehnt und müssen`} noch einmal hochgeladen werden.`;
  }
  if (stand.fehlend.length > 0) {
    return `Die Finanzierung wird freigegeben, sobald alle Bonitätsunterlagen hochgeladen und geprüft sind. ${stand.fehlend.length === 1 ? "Eine Unterlage fehlt noch." : `Es fehlen noch ${stand.fehlend.length} Unterlagen.`}`;
  }
  if (stand.inPruefung.length > 0) {
    return "Alle Bonitätsunterlagen liegen vor und werden gerade geprüft. Sobald sie freigegeben sind, wird die Finanzierung angestoßen.";
  }
  // Keine Liste bekannt, etwa weil die Selbstauskunft für dieses Investment
  // noch nicht ausgefüllt ist.
  return "Die Finanzierung wird freigegeben, sobald alle Bonitätsunterlagen hochgeladen und geprüft sind.";
}

/**
 * Ist die Finanzierung fuer dieses Investment freigegeben?
 *
 * Maszgeblich ist das Merkmal `bonitaetFreigabeGemeldetAm` am Investment. Es
 * wird genau in dem Augenblick gesetzt, in dem alle Bonitaetsunterlagen
 * freigegeben sind und der Finanzierungspartner gerufen wird
 * (`meldeBonitaetFreigabe`). Damit sagen Anzeige und Meldung dasselbe, und die
 * Anzeige kann nicht behaupten, die Finanzierung laufe, waehrend niemand
 * gerufen wurde.
 *
 * Zwei Rueckfaelle, beide fuer Altbestand: Steht am Investment bereits eine
 * Bank oder ein Finanzierungsstand, ist die Finanzierung offensichtlich
 * gelaufen, auch wenn das Merkmal aus der Zeit davor fehlt.
 */
export function finanzierungIstFrei(invMeta: Record<string, unknown> | undefined | null): boolean {
  const m = invMeta || {};
  if (m.bonitaetFreigabeGemeldetAm) return true;
  /*
    Zweiter Weg: Jedes Pflichtdokument steht auf "freigegeben". Das ist
    dieselbe Pruefung, die `sindDokumenteFreigegeben` in
    `src/lib/kontaktPipeline.ts` fuer die Stufenberechnung benutzt. Sie ist
    noetig, weil das Merkmal oben erst seit dem Umbau gesetzt wird: Unterlagen,
    die vorher freigegeben wurden, tragen es nicht und wuerden sonst ewig als
    "noch nicht frei" gelten.
  */
  const statuses = (m.docStatuses || {}) as Record<string, unknown>;
  const art = ((m.saData || m.saSnapshot) as Record<string, unknown> | undefined)?.beschaeftigungsart as string | undefined;
  if (pflichtBonitaetDocs(art).every((name) => statuses[name] === "approved")) return true;
  if (m.finanzierungsStatus || m.finanzierungsBank) return true;
  return false;
}
