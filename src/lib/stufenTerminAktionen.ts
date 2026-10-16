/**
 * Die Schreibwege zu `stufenTermin.ts`: Termin anlegen, nach „stattgefunden"
 * vorruecken, Aufgaben „… vereinbaren" anlegen und schliessen.
 *
 * Getrennt von `stufenTermin.ts`, damit die Regeln dort ohne Datenbank und
 * Zwischenspeicher pruefbar bleiben.
 */
import { speichereMeeting } from "./meetingSpeichern";
import { isTableLoaded } from "./dataCache";
import { erledigeAufgabe, getAufgaben } from "./aufgabenStore";
import { getInvestmentById, updateInvestment } from "./investmentsStore";
import { addProzessAufgabe } from "./prozessAufgabe";
import {
  stufenTerminDetails, stufeNachStattgefunden, TERMIN_STUFEN, VEREINBAREN_TITEL, vereinbarenSchluessel,
  type StufenTerminEingabe, type TerminStufe,
} from "./stufenTermin";

export interface StufenTerminKontext {
  kundeId: string;
  kundeName: string;
  investmentId: string;
  investmentLabel?: string;
  userName: string;
}

/**
 * Legt den Termin als Meeting mit gekoppelter Aufgabe am Investment an
 * (`meeting_anlegen`, eine Transaktion). Wirft bei einem Fehler; die Stufe
 * setzt der Aufrufer erst danach, sonst stuende sie ohne Termin da.
 */
export async function speichereStufenTermin(
  stufe: TerminStufe,
  eingabe: StufenTerminEingabe,
  ctx: StufenTerminKontext,
): Promise<void> {
  const titel = TERMIN_STUFEN[stufe].titel;
  const details = stufenTerminDetails(eingabe, ctx.investmentLabel);
  const uhrzeit = eingabe.uhrzeit.slice(0, 5);
  await speichereMeeting(crypto.randomUUID(), {
    von: ctx.userName,
    kundeId: ctx.kundeId,
    art: "meeting",
    beschreibung: titel,
    details,
    prioritaet: "hoch",
    faelligAm: eingabe.datum,
    uhrzeit,
    teilnehmer: ctx.kundeName,
    dauer: "60",
  }, {
    kontaktId: ctx.kundeId,
    investmentId: ctx.investmentId,
    typ: "meeting",
    prioritaet: "hoch",
    titel,
    beschreibung: [`${titel} mit ${ctx.kundeName}`, details].filter(Boolean).join("\n"),
    faelligAm: eingabe.datum,
    uhrzeit,
    erstelltVonName: ctx.userName,
  });
  // Die Aufgabe „… vereinbaren" ist damit erledigt.
  await schliesseVereinbarenAufgabe(stufe, ctx.investmentId);
}

/** Offene Aufgaben „… vereinbaren" zu diesem Investment abhaken. Wirft nie. */
async function schliesseVereinbarenAufgabe(stufe: TerminStufe, investmentId: string): Promise<void> {
  const schluessel = vereinbarenSchluessel(stufe, investmentId);
  try {
    const offen = getAufgaben().filter((a) =>
      a.ausloeserSchluessel === schluessel && a.status !== "erledigt" && a.status !== "abgesagt");
    for (const a of offen) await erledigeAufgabe(a.id, { silent: true });
  } catch (fehler) {
    // Der Termin steht schon; eine offen gebliebene Aufgabe hakt der Partner selbst ab.
    console.error("Aufgabe zum Vereinbaren nicht geschlossen:", fehler);
  }
}

/**
 * Die Aufgabe „Besichtigung vereinbaren" oder „Termin Bankgutachter
 * vereinbaren" fuer den Zustaendigen, ohne ihn fuer die Leitung. Je
 * Investment hoechstens eine offene. Rueckgabe wie `addProzessAufgabe`.
 */
export async function legeVereinbarenAufgabeAn(
  stufe: TerminStufe,
  ctx: Omit<StufenTerminKontext, "userName"> & { erstelltVonName?: string; rueckfallZustaendig?: string },
): Promise<boolean> {
  const was = stufe === "besichtigung"
    ? "Die Reservierung ist unterschrieben. Vereinbare mit dem Kunden die Besichtigung des Objekts."
    : "Die Besichtigung hat stattgefunden. Vereinbare den Termin mit dem Gutachter der Bank.";
  const heute = new Date();
  const tag = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}-${String(heute.getDate()).padStart(2, "0")}`;
  return addProzessAufgabe({
    titel: VEREINBAREN_TITEL[stufe],
    beschreibung: `${ctx.kundeName}${ctx.investmentLabel ? ` (${ctx.investmentLabel})` : ""}: ${was}`,
    prioritaet: "hoch",
    typ: "aufgabe",
    faellig_am: tag,
    uhrzeit: "09:00",
    kundeId: ctx.kundeId,
    kundeName: ctx.kundeName,
    investmentId: ctx.investmentId,
    erstelltVonName: ctx.erstelltVonName,
    ausloeserSchluessel: vereinbarenSchluessel(stufe, ctx.investmentId),
  }, ctx.rueckfallZustaendig);
}

/**
 * Nach „stattgefunden": die Stufe des Investments vorruecken und nach der
 * Besichtigung die Aufgabe fuer den Bankgutachter anlegen.
 *
 * Rueckgabe: die neue Stufe, oder `null`, wenn nichts zu tun war (anderer
 * Termin, Vorgang schon weiter, Investment unbekannt). Wirft nie: Das
 * Ergebnis des Termins ist zu diesem Zeitpunkt schon gespeichert.
 */
export async function rueckeNachStufenTermin(
  titel: string,
  investmentId: string | undefined,
  ctx: { kundeId: string; kundeName: string; erstelltVonName?: string; rueckfallZustaendig?: string },
): Promise<string | null> {
  if (!investmentId) return null;
  try {
    const inv = getInvestmentById(investmentId);
    if (!inv) return null;
    const ziel = stufeNachStattgefunden(titel, inv.pipelineStufe);
    if (!ziel) return null;
    if (!(await updateInvestment(investmentId, { pipelineStufe: ziel }))) return null;
    if (ziel === "bankgutachter") {
      await legeVereinbarenAufgabeAn("bankgutachter", {
        kundeId: ctx.kundeId,
        kundeName: ctx.kundeName,
        investmentId,
        investmentLabel: inv.label,
        erstelltVonName: ctx.erstelltVonName,
        rueckfallZustaendig: ctx.rueckfallZustaendig,
      });
    }
    return ziel;
  } catch (fehler) {
    console.error("Stufe nach dem Termin nicht vorgerückt:", fehler);
    return null;
  }
}

/**
 * „Besichtigung vereinbaren" nach der unterschriebenen Reservierung, je
 * Investment genau einmal, auch nach dem Abhaken nicht wieder.
 *
 * Solange die Aufgaben nicht geladen sind, entsteht nichts: Die Pruefung
 * faende sonst nie eine bestehende und legte bei jedem Lauf eine neue an.
 */
export async function stelleBesichtigungsAufgabeSicher(
  ctx: Omit<StufenTerminKontext, "userName"> & { erstelltVonName?: string; rueckfallZustaendig?: string },
): Promise<boolean> {
  if (!isTableLoaded("aufgaben")) return false;
  const schluessel = vereinbarenSchluessel("besichtigung", ctx.investmentId);
  if (getAufgaben().some((a) => a.ausloeserSchluessel === schluessel)) return false;
  return legeVereinbarenAufgabeAn("besichtigung", ctx);
}
