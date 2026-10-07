/**
 * Die Unterlagenliste des Kundenportals, für beide Portalseiten.
 *
 * `/kunde/investments` und `/kunde/profil` bauten ihre Liste vorher je
 * selbst. Die Profilseite hatte eine eigene, kürzere Fassung ohne Konto-
 * und Vermögensnachweise, ohne Kontoauszüge und ohne Altzeilen, dazu eine
 * andere Freischaltregel. Der Kunde las so auf zwei Seiten zwei verschiedene
 * Pflichtlisten zu demselben Kauf (Entscheidung Christian, 25.09.2026: eine
 * Liste im Portal).
 *
 * Diese Funktion setzt die Liste einmal zusammen. Die Bankprüfung kommt aus
 * `bankpruefungListenFuerInvestment`, also derselben Funktion wie im CRM.
 * Die Übersicht „Deine nächsten Schritte" zählt ihre offenen Unterlagen
 * ebenfalls hier heraus (portalNaechsteSchritte.ts).
 *
 * Bewusst ohne Zugriff auf den Datencache: Die Portalseiten laden ihre
 * Zeilen direkt aus Supabase. Alles kommt aus den übergebenen Zeilen.
 */
import { type BankDoc, mergeVorhandeneDocs } from "@/lib/bankpruefungDocs";
import { bankpruefungListenFuerInvestment } from "@/lib/bankpruefungListe";
import { istSelbststaendig } from "@/lib/bonitaetDocs";
import { eigeneSaDataFuerInvestmentRow, type InvestmentZeileMitSa } from "@/lib/saQuelle";
import { istUnterlagenFreigeschaltetAusMeta } from "@/lib/unterlagenFreigabe";

/** Kann der Kunde schon vor der Freischaltung hochladen. */
export const INITIAL_PFLICHT_DOCS: BankDoc[] = [
  { name: "Personalausweis", required: true },
  { name: "Letzter Gehaltsnachweis", required: true },
];
export const SCHUFA_DOC: BankDoc = { name: "Schufa-Bonitätsauskunft", required: false };
export const GEHALTS_DOCS_P1: BankDoc[] = [
  { name: "Vorletzter Gehaltsnachweis", required: true },
  { name: "Vorvorletzter Gehaltsnachweis", required: true },
  { name: "Gehaltsnachweis Dezember Vorjahr", required: true },
];
export const INITIAL_PFLICHT_DOCS_P2: BankDoc[] = [
  { name: "Personalausweis Person 2", required: true },
  { name: "Letzter Gehaltsnachweis Person 2", required: true },
];
export const SCHUFA_DOC_P2: BankDoc = { name: "Schufa-Bonitätsauskunft Person 2", required: false };
export const GEHALTS_DOCS_P2: BankDoc[] = [
  { name: "Vorletzter Gehaltsnachweis Person 2", required: true },
  { name: "Vorvorletzter Gehaltsnachweis Person 2", required: true },
  { name: "Gehaltsnachweis Dezember Vorjahr Person 2", required: true },
];

/** Namen des Bonitätschecks. Sie tauchen nie als Altzeile der Bankprüfung auf. */
const BONITAET_NAMEN = new Set([
  "Selbstauskunft",
  ...INITIAL_PFLICHT_DOCS.map((d) => d.name), SCHUFA_DOC.name, ...GEHALTS_DOCS_P1.map((d) => d.name),
  ...INITIAL_PFLICHT_DOCS_P2.map((d) => d.name), SCHUFA_DOC_P2.name, ...GEHALTS_DOCS_P2.map((d) => d.name),
]);

/** Der Ausschnitt einer investments-Zeile, den die Liste braucht. */
export interface PortalInvestmentZeile {
  id?: string;
  meta?: Record<string, unknown> | null;
}

type KontaktMeta = Record<string, unknown> | null | undefined;

/** Die Selbstauskunft dieses Investments, sonst null (Regel in saQuelle.ts). */
function eigeneSa(investmentRow: PortalInvestmentZeile | null | undefined): Record<string, unknown> | null {
  return eigeneSaDataFuerInvestmentRow(investmentRow as InvestmentZeileMitSa | null | undefined);
}

export interface PortalPersonListe {
  /** Personalausweis und letzter Gehaltsnachweis (bei Selbstständigen nur der Ausweis). */
  pflicht: BankDoc[];
  schufa: BankDoc;
  /** Die übrigen Gehaltsnachweise, bei Selbstständigen leer. */
  gehalts: BankDoc[];
  /**
   * Die Bankprüfung wie im CRM, samt von Hand ergänzten Unterlagen (nur
   * Person 1) und Altzeilen mit vorhandener Datei (freiwillig).
   */
  bank: BankDoc[];
  /** gehalts + bank, erst nach der Freischaltung offen. */
  weitere: BankDoc[];
  /** Alles, was die Seite für diese Person zeigt. Auch die Liste für den Handy-Scan. */
  alle: BankDoc[];
  /** Was gerade verlangt wird: vor der Freischaltung nur pflicht und Schufa. */
  aktiv: BankDoc[];
}

export interface PortalUnterlagenListe {
  freigeschaltet: boolean;
  /** Ohne eigene Selbstauskunft steht die Bankprüfung noch nicht fest. */
  listeOffen: boolean;
  p1: PortalPersonListe;
  p2: PortalPersonListe;
}

/** Die von Hand ergänzten Zusatzunterlagen aus den Kontaktdaten. */
export function customBankDocsAusKontaktMeta(kontaktMeta: KontaktMeta): BankDoc[] {
  const liste = (kontaktMeta?.customBankDocs || []) as { name?: string; required?: boolean }[];
  return liste
    .filter((cd) => !!cd?.name)
    .map((cd) => ({ name: String(cd.name), required: !!cd.required }));
}

/**
 * Die Bankprüfung eines Investments ohne Altzeilen. Die Seiten brauchen die
 * Namen vorab, um alte Portal-Schlüssel umzuschreiben (applyLegacyDocKeys),
 * bevor die Altzeilen angehängt werden.
 */
export function portalBankListen(
  investmentRow: PortalInvestmentZeile | null | undefined,
  kontaktMeta: KontaktMeta,
) {
  return bankpruefungListenFuerInvestment({
    eigeneSaData: eigeneSa(investmentRow),
    customBankDocs: customBankDocsAusKontaktMeta(kontaktMeta),
  });
}

function personListe(opts: {
  selbststaendig: boolean;
  initial: BankDoc[];
  schufa: BankDoc;
  gehaltsDocs: BankDoc[];
  bank: BankDoc[];
  freigeschaltet: boolean;
}): PortalPersonListe {
  // Selbstständige haben keine Gehaltsnachweise (Entscheidung Christian, 15.09.2026).
  const pflicht = opts.selbststaendig
    ? opts.initial.filter((d) => !d.name.includes("Gehaltsnachweis"))
    : opts.initial;
  const gehalts = opts.selbststaendig ? [] : opts.gehaltsDocs;
  const weitere = [...gehalts, ...opts.bank];
  const alle = [...pflicht, opts.schufa, ...weitere];
  return {
    pflicht,
    schufa: opts.schufa,
    gehalts,
    bank: opts.bank,
    weitere,
    alle,
    aktiv: opts.freigeschaltet ? alle : [...pflicht, opts.schufa],
  };
}

/**
 * Die vollständige Unterlagenliste des Portals zu einem Investment.
 *
 * `docStatuses` ist der Stand, mit dem die Seite arbeitet (alte Schlüssel
 * schon umgeschrieben). Daraus kommen die Altzeilen: Positionen mit Datei,
 * die nach der aktuellen Selbstauskunft nicht mehr verlangt werden, bleiben
 * als freiwillige Zeile sichtbar.
 */
export function portalUnterlagenListe(opts: {
  investmentRow: PortalInvestmentZeile | null | undefined;
  kontaktMeta: KontaktMeta;
  docStatuses?: Record<string, string> | null;
  /** Schon berechnete Bankprüfung aus `portalBankListen`, sonst wird sie hier gebaut. */
  bankListen?: ReturnType<typeof portalBankListen>;
}): PortalUnterlagenListe {
  const invMeta = opts.investmentRow?.meta || {};
  const bankListen = opts.bankListen ?? portalBankListen(opts.investmentRow, opts.kontaktMeta);
  const freigeschaltet = istUnterlagenFreigeschaltetAusMeta(invMeta, opts.kontaktMeta);
  const docStatuses = opts.docStatuses || undefined;

  const bankP1 = mergeVorhandeneDocs(
    bankListen.p1,
    docStatuses,
    (name) => !BONITAET_NAMEN.has(name) && !name.endsWith(" Person 2"),
  );
  const bankP2 = mergeVorhandeneDocs(
    bankListen.p2,
    docStatuses,
    (name) => !BONITAET_NAMEN.has(name) && name.endsWith(" Person 2"),
  );

  const sa = eigeneSa(opts.investmentRow);
  const person2 = (sa?.person2Data || null) as Record<string, unknown> | null;
  return {
    freigeschaltet,
    listeOffen: bankListen.ohneEigeneSa,
    p1: personListe({
      selbststaendig: istSelbststaendig(sa?.beschaeftigungsart as string | undefined),
      initial: INITIAL_PFLICHT_DOCS,
      schufa: SCHUFA_DOC,
      gehaltsDocs: GEHALTS_DOCS_P1,
      bank: bankP1,
      freigeschaltet,
    }),
    p2: personListe({
      selbststaendig: istSelbststaendig(person2?.beschaeftigungsart as string | undefined),
      initial: INITIAL_PFLICHT_DOCS_P2,
      schufa: SCHUFA_DOC_P2,
      gehaltsDocs: GEHALTS_DOCS_P2,
      bank: bankP2,
      freigeschaltet,
    }),
  };
}
