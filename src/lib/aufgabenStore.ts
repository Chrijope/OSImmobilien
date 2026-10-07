/**
 * Aufgaben am Kunden.
 *
 * Bisher lagen Aufgaben ausschließlich als JSON-Liste in den persönlichen
 * Einstellungen des Nutzers, der sie angelegt hat. Eine Aufgabe kannte damit
 * keinen Kunden und keinen Empfänger, sie gehörte dem, in dessen Datensatz sie
 * zufällig gelandet ist. In der Pipeline hat das dazu geführt, dass ein
 * vereinbarter Termin für alle anderen unsichtbar blieb.
 *
 * Die Tabelle `aufgaben` gibt es schon lange, sie hat `kontakt_id` und
 * `zugewiesen_an` und wurde nur nie gelesen. Dieser Store macht sie zur
 * gemeinsamen Quelle: Wer auf denselben Kunden schaut, sieht denselben
 * nächsten Kontakt.
 */

import { cacheGet, cacheInsert, cacheUpdate, isTableLoaded } from "./dataCache";
import { getAktivitaeten, setzeAktivitaetErledigt } from "./aktivitaetenStore";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Merkt sich, ob die Spalte für den Auslöser existiert. Ohne die Migration
 * 20260727130000 gibt es sie nicht. Automatische Erinnerungen müssen dann
 * pausieren, sonst legen sie bei jedem Durchlauf dieselbe Aufgabe erneut an,
 * weil sie die vorhandene nicht wiedererkennen können.
 */
let ausloeserSpalteFehlt = false;

export type AufgabeTyp = "anruf" | "meeting" | "follow_up" | "aufgabe" | "deadline";
export type AufgabePrioritaet = "niedrig" | "mittel" | "hoch" | "dringend";
export type AufgabeStatus = "offen" | "in_bearbeitung" | "erledigt" | "abgesagt";

export interface Aufgabe {
  id: string;
  /** Ersteller. */
  benutzerId: string;
  /** Kunde, an dem die Aufgabe hängt. Ohne Kontakt bleibt die Aufgabe privat. */
  kontaktId?: string;
  /**
   * Investment, zu dem die Aufgabe gehört. Leer bedeutet: betrifft den Kunden
   * als Ganzes und erscheint auf jeder seiner Pipeline-Kacheln.
   */
  investmentId?: string;
  typ: AufgabeTyp;
  prioritaet: AufgabePrioritaet;
  status: AufgabeStatus;
  titel: string;
  beschreibung?: string;
  /** ISO-Zeitstempel. */
  faelligAm?: string;
  /** HH:MM, optional. */
  uhrzeit?: string;
  erledigtAm?: string;
  /** Wer sie abarbeiten soll. Ohne Angabe der Ersteller selbst. */
  zugewiesenAn?: string;
  /** Klartextname des Erstellers, damit der Empfänger sieht, von wem sie kommt. */
  erstelltVonName?: string;
  /** Grund, aus dem eine automatische Aufgabe entstanden ist. Leer bei manuellen. */
  ausloeserSchluessel?: string;
  /**
   * Bewerber, an dem die Aufgabe hängt. Die Tabelle hat dafür keine Spalte,
   * der Bezug steckt im Auslöser, siehe bewerbungIdAusAusloeser().
   */
  bewerbungId?: string;
  erstelltAm?: string;
  /**
   * Das Meeting im Verlauf, zu dem diese Aufgabe gehört (Spalte
   * `meeting_aktivitaet_id`). Terminseite, Meeting-Dialog und Buchungen legen
   * Meeting und Aufgabe gemeinsam an; die Titel weichen dabei ab ("Erstgespräch"
   * gegen "Erstgespräch mit …"), deshalb zählt diese Kennung vor Titel und Tag.
   */
  meetingAktivitaetId?: string;
}

/**
 * Auslöser, die einen Bewerber statt eines Kunden meinen, beginnen mit
 * diesem Präfix und enden auf die Bewerbungs-ID, etwa
 * `bewerber_vertrag_unterschrieben:<id>`. Geschrieben wird die Form in
 * supabase/functions/_shared/bewerber-name.ts.
 */
const BEWERBER_AUSLOESER_PRAEFIX = "bewerber_";

/** Bewerbungs-ID aus einem Auslöser-Schlüssel, sonst undefined. */
export function bewerbungIdAusAusloeser(schluessel?: string | null): string | undefined {
  if (!schluessel || !schluessel.startsWith(BEWERBER_AUSLOESER_PRAEFIX)) return undefined;
  const trenner = schluessel.indexOf(":");
  if (trenner < 0) return undefined;
  const id = schluessel.slice(trenner + 1).trim();
  return id || undefined;
}

/** Rohzeile aus der Tabelle, bewusst locker typisiert. */
type AufgabeZeile = Record<string, string | null | undefined>;

function fromDb(r: AufgabeZeile): Aufgabe {
  return {
    id: String(r.id),
    benutzerId: String(r.benutzer_id || ""),
    kontaktId: r.kontakt_id || undefined,
    investmentId: r.investment_id || undefined,
    typ: (r.typ as AufgabeTyp) || "aufgabe",
    prioritaet: (r.prioritaet as AufgabePrioritaet) || "mittel",
    status: (r.status as AufgabeStatus) || "offen",
    titel: r.titel || "",
    beschreibung: r.beschreibung || undefined,
    faelligAm: r.faellig_am || undefined,
    uhrzeit: r.uhrzeit ? String(r.uhrzeit).slice(0, 5) : undefined,
    erledigtAm: r.erledigt_am || undefined,
    zugewiesenAn: r.zugewiesen_an || undefined,
    erstelltVonName: r.erstellt_von_name || undefined,
    ausloeserSchluessel: r.ausloeser_schluessel || undefined,
    bewerbungId: bewerbungIdAusAusloeser(r.ausloeser_schluessel),
    erstelltAm: r.erstellt_am || undefined,
    meetingAktivitaetId: r.meeting_aktivitaet_id || undefined,
  };
}

export function getAufgaben(): Aufgabe[] {
  try {
    return cacheGet<AufgabeZeile>("aufgaben").map(fromDb);
  } catch {
    return [];
  }
}

/**
 * Offene Aufgaben eines Kunden, unabhängig davon, wer sie angelegt hat.
 *
 * Ist ein Investment angegeben, kommen nur die Aufgaben zurück, die zu genau
 * diesem Investment gehören, plus die allgemeinen ohne Zuordnung. Ohne Angabe
 * kommen alle Aufgaben des Kunden.
 */
export function getAufgabenFuerKunde(kontaktId: string, investmentId?: string): Aufgabe[] {
  if (!kontaktId) return [];
  return getAufgaben().filter((a) => {
    if (a.kontaktId !== kontaktId) return false;
    if (a.status === "erledigt" || a.status === "abgesagt") return false;
    if (!investmentId) return true;
    return !a.investmentId || a.investmentId === investmentId;
  });
}

/** Offene Aufgaben, die mir zugewiesen sind oder die ich selbst angelegt habe. */
export function getMeineAufgaben(userId?: string): Aufgabe[] {
  if (!userId) return [];
  return getAufgaben().filter((a) => {
    if (a.status === "erledigt" || a.status === "abgesagt") return false;
    // Zugewiesen schlägt Ersteller: Wer eine Aufgabe weitergibt, hat sie
    // nicht mehr auf dem Tisch.
    if (a.zugewiesenAn) return a.zugewiesenAn === userId;
    return a.benutzerId === userId;
  });
}

export interface NeueAufgabe {
  kontaktId?: string;
  investmentId?: string;
  typ?: AufgabeTyp;
  prioritaet?: AufgabePrioritaet;
  titel: string;
  beschreibung?: string;
  /** Datum als YYYY-MM-DD oder voller ISO-Zeitstempel. */
  faelligAm?: string;
  uhrzeit?: string;
  /** Leer lassen für "ich selbst". */
  zugewiesenAn?: string;
  /** Klartextname des Erstellers. */
  erstelltVonName?: string;
  /** Nur für automatisch erzeugte Aufgaben, siehe schliesseErledigte(). */
  ausloeserSchluessel?: string;
}

/**
 * Legt eine Aufgabe an. Ohne angemeldeten Nutzer passiert nichts, statt
 * einen Datensatz ohne Urheber zu erzeugen.
 */
export async function addAufgabe(neu: NeueAufgabe): Promise<Aufgabe | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) {
    console.error("addAufgabe: kein angemeldeter Nutzer, Aufgabe nicht gespeichert");
    return null;
  }

  const basis = {
    id: crypto.randomUUID(),
    benutzer_id: uid,
    kontakt_id: neu.kontaktId || null,
    typ: neu.typ || "aufgabe",
    prioritaet: neu.prioritaet || "mittel",
    status: "offen",
    titel: neu.titel,
    beschreibung: neu.beschreibung || null,
    faellig_am: normalisiereFaellig(neu.faelligAm, neu.uhrzeit),
    uhrzeit: neu.uhrzeit && /^\d{1,2}:\d{2}/.test(neu.uhrzeit) ? neu.uhrzeit : null,
    erledigt_am: null,
    zugewiesen_an: neu.zugewiesenAn || uid,
    erstellt_am: new Date().toISOString(),
  };

  // Die beiden Zusatzspalten kommen erst mit der Migration
  // 20260727130000. Läuft die noch nicht, scheitert ein Insert mit ihnen an
  // "column does not exist", und die Aufgabe wäre spurlos verschwunden.
  // Deshalb wird sie in dem Fall ohne die Zusätze gespeichert.
  const mitZusatz = {
    ...basis,
    erstellt_von_name: neu.erstelltVonName || null,
    ausloeser_schluessel: neu.ausloeserSchluessel || null,
    investment_id: neu.investmentId || null,
  };

  try {
    await cacheInsert("aufgaben", mitZusatz, { silent: true });
    return fromDb(mitZusatz);
  } catch (fehler) {
    const text = String((fehler as { message?: string })?.message || "").toLowerCase();
    const spalteFehlt =
      text.includes("erstellt_von_name") ||
      text.includes("ausloeser_schluessel") ||
      text.includes("column") ||
      text.includes("schema cache");

    if (!spalteFehlt) {
      console.error("addAufgabe:", fehler);
      toast.error("Aufgabe konnte nicht gespeichert werden");
      return null;
    }

    try {
      await cacheInsert("aufgaben", basis, { silent: true });
      ausloeserSpalteFehlt = true;
      console.warn(
        "addAufgabe: Migration 20260727130000 fehlt, Aufgabe ohne Auslöser und Ersteller gespeichert",
      );
      return fromDb(basis);
    } catch (zweiter) {
      console.error("addAufgabe:", zweiter);
      toast.error("Aufgabe konnte nicht gespeichert werden");
      return null;
    }
  }
}

/** Felder, die sich an einer bestehenden Aufgabe nachträglich ändern lassen. */
export interface AufgabeAenderung {
  titel?: string;
  beschreibung?: string;
  prioritaet?: AufgabePrioritaet;
  /** Datum als YYYY-MM-DD oder voller ISO-Zeitstempel. */
  faelligAm?: string;
  uhrzeit?: string;
  /** Nutzer-ID des Empfängers. Leerer String bedeutet "ich selbst". */
  zugewiesenAn?: string;
  /** Investment-Zuordnung. null entfernt sie (Aufgabe gilt dann allgemein). */
  investmentId?: string | null;
}

/**
 * Ändert eine bestehende Aufgabe.
 *
 * Bisher war eine Aufgabe nach dem Anlegen unveränderlich: Wer sich beim Datum
 * vertippt hatte, konnte nur eine zweite anlegen, und die alte blieb stehen und
 * bestimmte weiter die Anzeige hinter dem Kundennamen. Geändert werden nur die
 * übergebenen Felder; Ersteller, Status und Anlagezeitpunkt bleiben unberührt.
 *
 * Wer ändern darf, entscheidet die Datenbank (RLS): der Ersteller, der
 * Empfänger sowie Admin und Inhaber (Migration 20260831120000).
 */
export async function updateAufgabe(id: string, aenderung: AufgabeAenderung): Promise<boolean> {
  const patch: Record<string, string | null> = {};
  if (aenderung.titel !== undefined) patch.titel = aenderung.titel;
  if (aenderung.beschreibung !== undefined) patch.beschreibung = aenderung.beschreibung || null;
  if (aenderung.prioritaet !== undefined) patch.prioritaet = aenderung.prioritaet;
  if (aenderung.faelligAm !== undefined) {
    patch.faellig_am = normalisiereFaellig(aenderung.faelligAm, aenderung.uhrzeit);
  }
  if (aenderung.uhrzeit !== undefined) {
    patch.uhrzeit =
      aenderung.uhrzeit && /^\d{1,2}:\d{2}/.test(aenderung.uhrzeit) ? aenderung.uhrzeit : null;
  }
  if (aenderung.zugewiesenAn !== undefined) {
    // Leer bedeutet wie beim Anlegen: der aktuelle Nutzer selbst. Ein Update
    // auf NULL wäre falsch, dann hätte die Aufgabe niemanden mehr.
    let empfaenger = aenderung.zugewiesenAn;
    if (!empfaenger) {
      const { data: auth } = await supabase.auth.getUser();
      empfaenger = auth?.user?.id || "";
    }
    if (empfaenger) patch.zugewiesen_an = empfaenger;
  }

  // Die Spalte investment_id kommt erst mit der Migration 20260728060000.
  // Fehlt sie noch, wird unten ohne sie erneut gespeichert, damit die übrigen
  // Änderungen nicht verloren gehen.
  const mitInvestment = { ...patch };
  if (aenderung.investmentId !== undefined) {
    mitInvestment.investment_id = aenderung.investmentId || null;
  }
  if (Object.keys(mitInvestment).length === 0) return true;

  try {
    await cacheUpdate("aufgaben", id, mitInvestment, { silent: true });
    return true;
  } catch (fehler) {
    const text = String((fehler as { message?: string })?.message || "").toLowerCase();
    const spalteFehlt =
      "investment_id" in mitInvestment &&
      (text.includes("investment_id") || text.includes("column") || text.includes("schema cache"));
    if (spalteFehlt && Object.keys(patch).length > 0) {
      try {
        await cacheUpdate("aufgaben", id, patch, { silent: true });
        return true;
      } catch (zweiter) {
        console.error("updateAufgabe:", zweiter);
        toast.error("Aufgabe konnte nicht geändert werden");
        return false;
      }
    }
    console.error("updateAufgabe:", fehler);
    toast.error("Aufgabe konnte nicht geändert werden");
    return false;
  }
}

/**
 * Der Schlüssel, über den ein Eintrag der Aktivitätsliste und die echte
 * Aufgabe zusammenfinden: gleicher Titel, gleicher Tag. Es ist derselbe
 * Schlüssel, mit dem `kontaktTermine` die Dublette entdoppelt. Gespeichert
 * verknüpft sind nur Meetings, über `Aufgabe.meetingAktivitaetId`.
 */
export function aufgabenSchluessel(titel?: string, faelligAm?: string): string {
  return `${(titel || "").trim().toLowerCase()}|${String(faelligAm || "").slice(0, 10)}`;
}

/**
 * Findet die Aufgabe, die zu einem Eintrag der Aktivitätsliste gehört.
 *
 * Die Schnellaktion im Kundenprofil schreibt jede Aufgabe zweimal: als echte
 * Aufgabe in die Tabelle `aufgaben` und als Kopie in die Aktivitätsliste.
 * Wiedergefunden wird die echte Aufgabe über `aufgabenSchluessel`.
 */
export function findeAufgabeZuAktivitaet(
  kontaktId: string,
  titel?: string,
  faelligAm?: string,
  aktivitaetId?: string,
): Aufgabe | null {
  if (!kontaktId) return null;
  const gesucht = aufgabenSchluessel(titel, faelligAm);
  const offene = getAufgaben().filter(
    (a) => a.kontaktId === kontaktId && a.status !== "erledigt" && a.status !== "abgesagt",
  );
  // Die gespeicherte Kopplung zuerst, der Titel nur für ältere Einträge ohne sie.
  return (
    (aktivitaetId && offene.find((a) => a.meetingAktivitaetId === aktivitaetId)) ||
    // Ein leerer Titel erkennt nichts wieder, er würde jede titellose Aufgabe treffen.
    ((titel || "").trim() && offene.find((a) => aufgabenSchluessel(a.titel, a.faelligAm) === gesucht)) ||
    null
  );
}

/**
 * Offene Aufgaben eines Kunden, zu denen kein Eintrag der Aktivitätsliste
 * (mehr) existiert.
 *
 * So etwas entsteht, wenn der Papierkorb der Zeitleiste früher nur den
 * Aktivitätseintrag entfernt hat: Die echte Aufgabe blieb offen stehen und
 * bestimmte weiter die Anzeige hinter dem Kundennamen, war aber nirgends mehr
 * zu sehen. Gemeldet bei Ayce Özgün Özler: unten stand nur noch der 17.09.,
 * oben weiter der 14.09.
 *
 * Solche Waisen sollen im Reiter "Aufgaben & Termine" wieder auftauchen,
 * damit man sie bearbeiten oder löschen kann. Automatisch erzeugte Aufgaben
 * (mit Auslöser-Schlüssel, etwa die Nachfassen-Wiedervorlagen) bleiben außen
 * vor: Sie hatten nie einen Aktivitätseintrag und gehören in die Inbox, nicht
 * in die Zeitleiste.
 *
 * @param vorhandeneSchluessel `aufgabenSchluessel` aller Aufgaben- und
 *                             Meeting-Einträge, die bereits in der Liste stehen.
 */
export function offeneAufgabenOhneAktivitaet(
  kontaktId: string,
  vorhandeneSchluessel: Set<string>,
  vorhandeneAktivitaetIds: Set<string> = new Set(),
): Aufgabe[] {
  if (!kontaktId) return [];
  return getAufgaben().filter(
    (a) =>
      a.kontaktId === kontaktId &&
      a.status !== "erledigt" &&
      a.status !== "abgesagt" &&
      !a.ausloeserSchluessel &&
      !(a.meetingAktivitaetId && vorhandeneAktivitaetIds.has(a.meetingAktivitaetId)) &&
      !vorhandeneSchluessel.has(aufgabenSchluessel(a.titel, a.faelligAm)),
  );
}

/**
 * Die Kopie einer Aufgabe im Verlauf, sofern es eine gibt.
 *
 * Umkehrung von `findeAufgabeZuAktivitaet`: die gespeicherte Kopplung, sonst
 * Titel plus Tag.
 *
 * @param geschlossen false sucht die noch offene Kopie (zum Abhaken),
 *                    true die bereits geschlossene (zum Wiederöffnen).
 */
function findeAktivitaetsKopie(aufgabe: Aufgabe, geschlossen: boolean): { id: string } | null {
  if (!aufgabe.kontaktId) return null;
  const gesucht = aufgabenSchluessel(aufgabe.titel, aufgabe.faelligAm);
  try {
    return (
      getAktivitaeten(aufgabe.kontaktId).find(
        (a) =>
          (a.art === "aufgabe" || a.art === "meeting") &&
          !!a.erledigtAm === geschlossen &&
          (aufgabe.meetingAktivitaetId
            ? a.id === aufgabe.meetingAktivitaetId
            : aufgabenSchluessel(a.beschreibung, a.faelligAm) === gesucht),
      ) || null
    );
  } catch {
    // Der Zwischenspeicher der Aktivitäten ist noch nicht bereit. Dann bleibt
    // es bei der Aufgabe selbst, die Kopie holt der nächste Klick.
    return null;
  }
}

/**
 * Setzt den Verlaufseintrag einer Aufgabe auf denselben Stand.
 *
 * Eine Aufgabe aus der Schnellaktion existiert zweimal: als Zeile in
 * `aufgaben` und als Kopie in `aktivitaeten`. Eine gespeicherte Verknüpfung
 * gibt es nicht, nur Titel und Tag. Wurde bisher nur eine Seite geschlossen,
 * erschien derselbe Vorgang gleich wieder in der Kachel "Nächste Aktion",
 * diesmal als Verlaufseintrag, und es brauchte einen zweiten Haken.
 *
 * Fehlschläge sind still: Die Aufgabe selbst steht schon, und eine Meldung
 * über eine Kopie, von der der Nutzer nichts weiß, hilft ihm nicht weiter.
 */
async function gleicheKopieAb(aufgabe: Aufgabe | undefined, erledigt: boolean): Promise<void> {
  if (!aufgabe) return;
  const kopie = findeAktivitaetsKopie(aufgabe, !erledigt);
  if (!kopie) return;
  try {
    await setzeAktivitaetErledigt(kopie.id, erledigt ? new Date().toISOString() : null);
  } catch (fehler) {
    console.error("Verlaufseintrag zur Aufgabe konnte nicht mitgeführt werden:", fehler);
  }
}

/**
 * Hakt eine Aufgabe ab, mitsamt ihrer Kopie im Verlauf.
 *
 * Alle Wege im Kundenprofil laufen hier zusammen: der Haken im Kasten
 * "Offene Aufgaben", der Haken in der Aktionsliste und der Sammelweg für alle
 * überfälligen. Deshalb steht das Schließen beider Seiten hier und nicht an
 * den Aufrufstellen, wo die nächste wieder die Hälfte vergessen würde.
 */
export async function erledigeAufgabe(id: string, opts?: { silent?: boolean }): Promise<void> {
  const aufgabe = getAufgaben().find((a) => a.id === id);
  await cacheUpdate("aufgaben", id, {
    status: "erledigt",
    erledigt_am: new Date().toISOString(),
  }, opts);
  await gleicheKopieAb(aufgabe, true);
}

/**
 * Schliesst eine Aufgabe, ohne sie als erledigt zu zaehlen: Status
 * "abgesagt". Fuer den Termin, der nicht stattfand (No-Show). Die Kopie im
 * Verlauf geht mit aus der Liste.
 */
export async function sageAufgabeAb(id: string): Promise<void> {
  const aufgabe = getAufgaben().find((a) => a.id === id);
  await cacheUpdate("aufgaben", id, { status: "abgesagt", erledigt_am: null });
  await gleicheKopieAb(aufgabe, true);
}

/** Nimmt das Abhaken zurück, ebenfalls auf beiden Seiten. */
export async function oeffneAufgabe(id: string): Promise<void> {
  const aufgabe = getAufgaben().find((a) => a.id === id);
  await cacheUpdate("aufgaben", id, { status: "offen", erledigt_am: null });
  await gleicheKopieAb(aufgabe, false);
}

/**
 * Bringt Datum und Uhrzeit zu einem Zeitstempel zusammen.
 * Akzeptiert YYYY-MM-DD, TT.MM.JJJJ und volle ISO-Strings.
 */
export function normalisiereFaellig(datum?: string, uhrzeit?: string): string | null {
  if (!datum) return null;
  const s = String(datum).trim();

  // Voller ISO-Zeitstempel: unverändert übernehmen.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;

  let tag = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    tag = s;
  } else {
    const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (de) {
      const [, dd, mm, yyyy] = de;
      tag = `${yyyy}-${String(+mm).padStart(2, "0")}-${String(+dd).padStart(2, "0")}`;
    }
  }
  if (!tag) return null;

  const zeit = uhrzeit && /^\d{1,2}:\d{2}/.test(uhrzeit)
    ? uhrzeit.slice(0, 5).padStart(5, "0")
    : "09:00";
  const d = new Date(`${tag}T${zeit}:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Schließt automatisch erzeugte Aufgaben, deren Grund entfallen ist.
 *
 * Das war bisher die größte Schwäche der Inbox: Eine Aufgabe wie "Notarfoto
 * fehlt" blieb stehen, auch nachdem das Foto längst hochgeladen war. Wer
 * jeden Eintrag von Hand abhaken muss, glaubt der Liste irgendwann nicht mehr.
 *
 * Der Aufrufer gibt an, welche Auslöser gerade noch gelten. Alles, was mit
 * demselben Präfix offen ist und nicht in dieser Menge steht, wird geschlossen.
 * Zusätzlich bleibt pro noch gültigem Auslöser genau eine Aufgabe offen; früher
 * mehrfach angelegte Duplikate (gleicher Schlüssel) werden ebenfalls
 * geschlossen, sodass sich Altbestände von selbst auflösen.
 *
 * @param praefix    Kennung der Quelle, etwa "notarfoto:".
 * @param aktiv      Die Schlüssel, die gerade noch zutreffen.
 * @param userId     Nur eigene Aufgaben werden angefasst.
 * @returns Anzahl der geschlossenen Aufgaben.
 */
export async function schliesseErledigteAutomatikAufgaben(
  praefix: string,
  aktiv: Set<string>,
  userId?: string,
): Promise<number> {
  if (ausloeserSpalteFehlt) return 0;
  if (!praefix) return 0;
  if (!isTableLoaded("aufgaben")) return 0;
  // Geschlossen wird ebenfalls unabhängig vom Besitzer, passend dazu, dass
  // eine automatische Aufgabe nur einmal existiert.
  const offen = getAufgaben().filter(
    (a) =>
      a.status !== "erledigt" &&
      a.status !== "abgesagt" &&
      !!a.ausloeserSchluessel &&
      a.ausloeserSchluessel.startsWith(praefix),
  );
  // Zwei Fälle werden geschlossen:
  //  1) Der Auslöser gilt nicht mehr (Schlüssel nicht in `aktiv`).
  //  2) Duplikat: Pro noch gültigem Auslöser bleibt genau EINE Aufgabe offen,
  //     früher mehrfach angelegte (gleicher Schlüssel) werden geschlossen. So
  //     lösen sich Altbestände wie die acht Otto-Hans-Aufgaben beim nächsten
  //     Lauf von selbst auf, ohne dass jemand sie von Hand abhaken muss.
  const behalten = new Set<string>();
  const zuSchliessen = offen.filter((a) => {
    const schluessel = a.ausloeserSchluessel!;
    if (!aktiv.has(schluessel)) return true;
    if (behalten.has(schluessel)) return true;
    behalten.add(schluessel);
    return false;
  });
  // Still und einzeln: Die Automatik läuft im Hintergrund, und eine fremde
  // Aufgabe, die die Zeilenregel nicht schließen lässt, soll weder die
  // übrigen aufhalten noch bei jedem Lauf eine Meldung zeigen.
  let geschlossen = 0;
  for (const a of zuSchliessen) {
    try {
      await erledigeAufgabe(a.id, { silent: true });
      geschlossen += 1;
    } catch (fehler) {
      console.warn("Automatik-Aufgabe nicht geschlossen:", a.id, fehler);
    }
  }
  return geschlossen;
}

/**
 * True, wenn zu diesem Auslöser bereits eine offene Aufgabe existiert.
 *
 * Bewusst ohne Rücksicht darauf, wer sie angelegt hat. Eine automatische
 * Aufgabe beschreibt einen Zustand am Kunden, nicht eine Zuständigkeit: die
 * Kaufpreisfälligkeit ist einmal zu prüfen, nicht einmal je Buchhalter. Vorher
 * zählte nur die eigene, und weil Buchhaltung, Admin und Inhaber denselben
 * Auslöser haben, entstand dieselbe Aufgabe dreimal.
 */
export function hatOffeneAutomatikAufgabe(schluessel: string, _userId?: string): boolean {
  if (!schluessel) return false;
  return getAufgaben().some(
    (a) =>
      a.ausloeserSchluessel === schluessel &&
      a.status !== "erledigt" &&
      a.status !== "abgesagt",
  );
}

/**
 * Wurde diese Automatikaufgabe schon einmal abgehakt?
 *
 * Der Unterschied zu `hatOffeneAutomatikAufgabe` ist der ganze Punkt: Dort
 * zählt nur, was noch offen ist. Hakt jemand eine Aufgabe ab, ohne die Ursache
 * zu beseitigen, gilt sie als nicht mehr vorhanden und wird beim nächsten Lauf
 * neu angelegt.
 *
 * Bei einer Wiedervorlage ist das richtig. Bei einer Aufgabe, die nur einmal
 * erledigt werden muss, ist es eine Endlosschleife: Der Musterkunde Otto Hans
 * stand jeden Tag mit "Kaufpreisfälligkeit prüfen" in der Inbox. Abhaken half
 * nur bis zum nächsten Laden der Anwendung, und weil der Reminder alle zehn
 * Minuten läuft, kam sie auch mehrfach am Tag zurück.
 */
export function wurdeAutomatikAufgabeErledigt(schluessel: string): boolean {
  if (!schluessel) return false;
  return getAufgaben().some(
    (a) => a.ausloeserSchluessel === schluessel && a.status === "erledigt",
  );
}

/**
 * Legt eine automatische Aufgabe an, sofern es sie nicht schon gibt.
 * Rückgabe: true, wenn wirklich eine neue entstanden ist.
 */
export async function stelleAutomatikAufgabeSicher(
  neu: NeueAufgabe & { ausloeserSchluessel: string },
  userId?: string,
  /**
   * Einmal abgehakt, nie wieder anlegen.
   *
   * Standard ist `false`, damit sich am Verhalten der vorhandenen Aufrufer
   * nichts ändert: Eine Wiedervorlage soll wiederkommen. Wer eine Aufgabe
   * stellt, die nur einmal zu erledigen ist, setzt das hier auf `true`.
   */
  nurEinmal = false,
): Promise<boolean> {
  // Ohne die Auslöser-Spalte lässt sich eine bestehende Aufgabe nicht
  // wiedererkennen. Dann lieber keine anlegen als alle fünf Minuten eine neue.
  if (ausloeserSpalteFehlt) return false;

  // Solange die Tabelle nicht geladen ist, weiss der Cache von keiner einzigen
  // Aufgabe. Die Prüfung unten fände dann nie eine bestehende und legte eine
  // neue an, bei jedem Seitenaufruf erneut.
  //
  // Genau das ist passiert: Bei Otto Hans stand "Kaufpreisfälligkeit prüfen"
  // acht Mal im Protokoll, jeweils zu den Zeitpunkten, zu denen jemand die
  // Anwendung geöffnet hatte. Der Reminder läuft direkt beim Einhängen, also
  // regelmässig bevor die erste Welle des Caches durch ist.
  if (!isTableLoaded("aufgaben")) return false;

  if (hatOffeneAutomatikAufgabe(neu.ausloeserSchluessel, userId)) return false;
  if (nurEinmal && wurdeAutomatikAufgabeErledigt(neu.ausloeserSchluessel)) return false;
  const erzeugt = await addAufgabe(neu);
  if (erzeugt && !erzeugt.ausloeserSchluessel) {
    ausloeserSpalteFehlt = true;
    return false;
  }
  return !!erzeugt;
}
