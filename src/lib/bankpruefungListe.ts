/**
 * Gemeinsame, vollständige Bankprüfungs-Dokumentliste für Kundenprofil (CRM)
 * und Kundenportal.
 *
 * Vorher baute jede Seite ihre eigene Liste: Das Profil ergänzte die
 * Grundliste dynamisch um Wohn-Nachweis, Kreditverträge, Vermögens- und
 * Kontonachweise (für Person 1 UND Person 2), das Portal hatte eine eigene,
 * kleinere Variante ohne Kontoauszüge, ohne PKV-Nachweis und ganz ohne
 * dynamische Person-2-Dokumente. Weil docStatuses über den exakten
 * Namens-String synchronisiert wird, liefen die Ansichten auseinander.
 *
 * Kanonisch ist die Fassung des Kundenprofils. Diese Funktion bildet sie ab
 * und wird von beiden Seiten aufgerufen.
 */
import { applyLegacyDocKeys, BankDoc, buildBankpruefungBaseDocs, zaehltFuerAbschluss } from "./bankpruefungDocs";
import { buildBonitaetDocs, buildBonitaetDocsPerson2 } from "./bonitaetDocs";
import { extractAusgaben, extractEinkuenfte, parseFinanzNum } from "./finanzierbarkeitUtils";
import { eigeneSaDataFuerInvestmentRow, type InvestmentZeileMitSa } from "./saQuelle";

/**
 * Liest einen Ausgaben-/Einnahmenwert aus beiden Formen, in denen die
 * Selbstauskunft ihn ablegt:
 * 1. extrahierter Wert aus der SA (neue und alte Form),
 * 2. verschachteltes ausgaben-/einkuenfte-Objekt (so tragen es die
 *    Person-2-Daten).
 *
 * Der frühere dritte Weg, der Rückfall auf die am Kontakt gepflegten Zahlen,
 * ist entfallen (Entscheidung Christian, 10.09.2026). Welche Nachweise die
 * Bank für diesen Kauf sehen will, ergibt sich allein aus der Selbstauskunft
 * dieses Vorgangs. Ein Kredit, der nur am Kontakt stand, konnte aus einem
 * ganz anderen Kauf stammen.
 */
function wertAusQuellen(extrahiert: number, verschachtelt: unknown): number {
  if (extrahiert > 0) return extrahiert;
  return parseFinanzNum(verschachtelt);
}

/** SA-Ausschnitt einer Person, so weit ihn die Dokumentliste braucht. */
export interface SaPersonDaten {
  beschaeftigungsart?: string;
  privateKV?: string | number;
  mietart?: string;
  ausgaben?: Record<string, unknown>;
  einkuenfte?: Record<string, unknown>;
  vermoegenswerte?: { art?: string; institut?: string; betrag?: string }[];
  bankkonten?: { konto?: string; institut?: string; iban?: string }[];
  [weitereFelder: string]: unknown;
}

export interface BankpruefungListeOptionen {
  person: 1 | 2;
  /**
   * SA-Daten der jeweiligen Person (Person 1: saData selbst, Person 2:
   * saData.person2Data). Bewusst `unknown`, weil die Aufrufer die SA in
   * unterschiedlich strengen Typen halten; intern wird auf SaPersonDaten
   * eingeengt.
   */
  saData?: unknown;
  /** Vom VP/Admin manuell ergänzte Dokumente (werden ans Ende gehängt). */
  customBankDocs?: BankDoc[];
}

type Vermoegenswert = NonNullable<SaPersonDaten["vermoegenswerte"]>[number];
type Bankkonto = NonNullable<SaPersonDaten["bankkonten"]>[number];

function istAusgefuellt(wert: unknown): boolean {
  if (wert === undefined || wert === null) return false;
  return String(wert).trim() !== "";
}

/** Ein Vermögenswert zählt erst mit einem Betrag über null. */
function hatBetrag(v: Vermoegenswert): boolean {
  const betrag = typeof v?.betrag === "string" ? v.betrag.trim() : v?.betrag;
  return !!betrag && betrag !== "0" && betrag !== "0,00";
}

/** Die Vermögenswerte einer Person, zu denen ein eigener Nachweis verlangt wird. */
function vermoegenswerteMitBetrag(sa: SaPersonDaten | null): Vermoegenswert[] {
  return (sa?.vermoegenswerte || []).filter(hatBetrag);
}

/**
 * Braucht diese Kontozeile einen Nachweis?
 *
 * Erst wenn Institut oder IBAN eingetragen ist. Die Kontoart allein reicht
 * nicht: Die erste Zeile ist im Formular mit „Girokonto" vorbelegt und lässt
 * sich nicht löschen. Vorher bekam deshalb fast jeder Kunde „Nachweis:
 * Girokonto" als Pflicht, auch wenn er gar kein Konto eingetragen hatte
 * (Entscheidung Christian, 25.09.2026).
 */
export function kontoBrauchtNachweis(konto: Bankkonto | null | undefined): boolean {
  return istAusgefuellt(konto?.institut) || istAusgefuellt(konto?.iban);
}

/**
 * Ist das Eigenkapital dieser Person schon je Vermögenswert belegt?
 *
 * Sobald die Selbstauskunft mindestens einen Vermögenswert mit Betrag
 * enthält, verlangt die Liste dafür einen eigenen Nachweis. Der allgemeine
 * „Eigenkapitalnachweis" wäre dann doppelt und entfällt. Ohne solche
 * Vermögenswerte bleibt er Pflicht. Gilt je Person, Person 2 richtet sich
 * nach ihren eigenen Angaben (Entscheidung Christian, 25.09.2026).
 */
export function eigenkapitalJeVermoegenswertBelegt(saData: unknown): boolean {
  return vermoegenswerteMitBetrag((saData || null) as SaPersonDaten | null).length > 0;
}

/** Die vollständige Bankprüfungsliste einer Person, inklusive aller dynamischen Nachweise. */
export function buildBankpruefungDocListe(opts: BankpruefungListeOptionen): BankDoc[] {
  const sa = (opts.saData || null) as SaPersonDaten | null;
  const suffix = opts.person === 2 ? " Person 2" : "";

  const docs = buildBankpruefungBaseDocs({
    beschaeftigungsart: sa?.beschaeftigungsart,
    privateKV: sa?.privateKV,
    person: opts.person,
    variant: "admin",
    ohneEigenkapitalnachweis: eigenkapitalJeVermoegenswertBelegt(sa),
  });

  // Wohnsituation aus der SA: "Zur Miete" (oder noch keine Angabe) verlangt den
  // Mietvertrag, "Mietfrei" die Mietfreibestätigung, "Eigentum" keinen Nachweis.
  const mietart = sa?.mietart;
  if (mietart === "Mietfrei") {
    docs.push({ name: `Mietfreibestätigung${suffix}`, required: true });
  } else if (mietart === "Zur Miete" || !mietart) {
    docs.push({ name: `Mietvertrag${suffix}`, required: true });
  }

  const ausgaben = sa ? extractAusgaben(sa) : { autokredite: 0, privatkredite: 0, sonstigeKredite: 0, zinsTilgung: 0 };
  const einkuenfte = sa ? extractEinkuenfte(sa) : { mieteinnahmen: 0 };
  const nestedAusgaben = sa?.ausgaben || {};
  const nestedEinkuenfte = sa?.einkuenfte || {};

  if (wertAusQuellen(ausgaben.autokredite, nestedAusgaben.autokredite) > 0) {
    docs.push({ name: `Kreditvertrag Autokredit${suffix}`, required: true });
  }
  if (wertAusQuellen(ausgaben.privatkredite, nestedAusgaben.privatkredite) > 0) {
    docs.push({ name: `Kreditvertrag Privatkredit${suffix}`, required: true });
  }
  if (wertAusQuellen(ausgaben.sonstigeKredite, nestedAusgaben.sonstigeKredite) > 0) {
    docs.push({ name: `Kreditvertrag Sonstige${suffix}`, required: true });
  }
  if (wertAusQuellen(ausgaben.zinsTilgung, nestedAusgaben.zinsTilgung) > 0) {
    docs.push({ name: `Darlehensvertrag Hypothek${suffix}`, required: true });
  }
  if (wertAusQuellen(einkuenfte.mieteinnahmen, nestedEinkuenfte.mieteinnahmen) > 0) {
    docs.push({ name: `Mietvertrag Vermietungsobjekt${suffix}`, required: true });
  }

  // Die Namen bleiben wie bisher, sie sind der Schlüssel in docStatuses.
  for (const v of vermoegenswerteMitBetrag(sa)) {
    const label = v.institut ? `${v.art} – ${v.institut}` : v.art;
    docs.push({ name: `Nachweis: ${label}${suffix}`, required: true });
  }
  const bankkonten = (sa?.bankkonten || []) as { konto: string; institut: string; iban: string }[];
  for (const b of bankkonten) {
    if (!kontoBrauchtNachweis(b)) continue;
    const label = b.institut ? `${b.konto || "Konto"} – ${b.institut}` : (b.konto || "Konto");
    docs.push({ name: `Nachweis: ${label}${suffix}`, required: true });
  }

  for (const cd of opts.customBankDocs || []) {
    docs.push({ name: cd.name, required: cd.required });
  }

  return docs;
}

/**
 * Die Bankprüfungslisten eines Investments, streng aus dessen EIGENER
 * Selbstauskunft.
 *
 * Gemeinsame Fassung für Kundenprofil und Kundenportal, damit beide dieselbe
 * Liste zeigen.
 *
 * Ohne eigene Selbstauskunft steht die Liste noch gar nicht fest: Welche
 * Nachweise die Bank sehen will, hängt an Beschäftigungsart, Wohnsituation,
 * Krediten, Vermögen und Konten, und all das steht in der Selbstauskunft
 * genau dieses Vorgangs. Die Liste aus einem anderen Investment abzuleiten
 * hieße, dem Kunden Unterlagen abzuverlangen, die zu seinem anderen Kauf
 * gehören, und andere zu vergessen. Deshalb bleibt dann nur, was ohnehin
 * nicht aus der Selbstauskunft stammt: die vom Vertriebspartner von Hand
 * ergänzten Zusatzunterlagen (Entscheidung Christian, 10.09.2026).
 *
 * Bereits hochgeladene Positionen verschwinden dadurch nicht, die Seiten
 * hängen sie über `mergeVorhandeneDocs` weiterhin an.
 */
export function bankpruefungListenFuerInvestment(opts: {
  /** Die eigene Selbstauskunft des Investments, sonst null. */
  eigeneSaData: unknown | null;
  customBankDocs?: BankDoc[];
}): { p1: BankDoc[]; p2: BankDoc[]; ohneEigeneSa: boolean } {
  const sa = opts.eigeneSaData as SaPersonDaten | null;
  if (!sa) {
    return {
      p1: (opts.customBankDocs || []).map((cd) => ({ name: cd.name, required: cd.required })),
      p2: [],
      ohneEigeneSa: true,
    };
  }
  return {
    p1: buildBankpruefungDocListe({
      person: 1,
      saData: sa,
      customBankDocs: opts.customBankDocs,
    }),
    p2: buildBankpruefungDocListe({ person: 2, saData: (sa as { person2Data?: unknown }).person2Data }),
    ohneEigeneSa: false,
  };
}

/**
 * Der ruhige Satz, der überall dort steht, wo die Unterlagenliste eines
 * Investments noch nicht feststeht. Eine leere Kachel ohne Erklärung sieht
 * aus wie ein Fehler.
 */
export const OHNE_EIGENE_SA_HINWEIS =
  "Welche Unterlagen für diesen Kauf gebraucht werden, ergibt sich aus der Selbstauskunft. Sobald sie für dieses Investment ausgefüllt ist, erscheint hier die vollständige Liste.";

/**
 * Gilt die Bonität dieses Investments in der Conversion-Statistik als
 * freigegeben?
 *
 * Vorher zählte sie nur, wenn JEDER Eintrag in `docStatuses` freigegeben war.
 * Eine abgelehnte Altzeile, die nach der aktuellen Selbstauskunft gar nicht
 * mehr verlangt wird (etwa ein alter Eigenkapitalnachweis), hielt die Stufe
 * damit für immer auf. Jetzt zählen nur die Einträge, die auch den Abschluss
 * im Kundenprofil verlangen: Pflichtzeilen des Bonitätschecks und der
 * Bankprüfung beider Personen sowie die von Hand ergänzten Unterlagen
 * (`zaehltFuerAbschluss`). Wie bisher muss mindestens einer davon vorliegen.
 */
export function bonitaetFuerStatistikFreigegeben(
  investmentRow: { id?: string; meta?: Record<string, unknown> | null } | null | undefined,
  kontaktMeta: Record<string, unknown> | null | undefined,
): boolean {
  const customBankDocs = ((kontaktMeta?.customBankDocs || []) as { name?: string; required?: boolean }[])
    .filter((cd) => !!cd?.name)
    .map((cd) => ({ name: String(cd.name), required: !!cd.required }));
  const sa = eigeneSaDataFuerInvestmentRow(investmentRow as InvestmentZeileMitSa | null | undefined) as SaPersonDaten | null;
  const bank = bankpruefungListenFuerInvestment({ eigeneSaData: sa, customBankDocs });
  const vonHandErgaenzt = new Set(customBankDocs.map((cd) => cd.name));
  const liste = [
    ...buildBonitaetDocs(sa?.beschaeftigungsart),
    ...buildBonitaetDocsPerson2((sa?.person2Data as SaPersonDaten | undefined)?.beschaeftigungsart),
    ...bank.p1,
    ...bank.p2,
  ];
  const zaehlt = new Set(liste.filter((d) => zaehltFuerAbschluss(d, vonHandErgaenzt)).map((d) => d.name));
  const statuses = applyLegacyDocKeys(
    (investmentRow?.meta?.docStatuses || {}) as Record<string, string>,
    liste.map((d) => d.name),
  );
  const relevant = Object.entries(statuses).filter(([name]) => zaehlt.has(name));
  return relevant.length > 0 && relevant.every(([, status]) => status === "approved");
}
