/**
 * Zentrale Quelle für die Bankprüfungs-Unterlagen.
 *
 * Die Liste hing früher an vier Stellen im Code und war fest auf Angestellte
 * verdrahtet. Wählt jemand in der Selbstauskunft "selbstständig", brauchen die
 * Banken andere Nachweise: keinen Arbeitsvertrag, dafür Bilanz/BWA,
 * Steuererklärungen und Steuerbescheide der letzten drei Jahre.
 *
 * Der Bonitätscheck bleibt bewusst für alle Beschäftigungsarten gleich.
 */

export interface BankDoc {
  name: string;
  required: boolean;
}

/**
 * admin   = Kundenprofil UND Kundenportal (mit Kontoauszügen und PKV-Nachweis)
 * kompakt = Kundenprofilseite (Wohn-Nachweis kommt dort separat dazu)
 *
 * Die frühere Variante "portal" ist abgeschafft: Das Kundenportal zeigt jetzt
 * exakt dieselbe Liste wie das Kundenprofil, damit der Kunde auch Kontoauszüge
 * und PKV-Nachweis selbst hochladen kann. Der fest gelistete "Eigene
 * Mietvertrag" der Portal-Variante ist durch den dynamischen Wohn-Nachweis
 * ersetzt (siehe buildBankpruefungDocListe in bankpruefungListe.ts); für
 * Alt-Uploads unter dem alten Namen sorgt applyLegacyDocKeys weiter unten.
 */
export type BankDocVariant = "admin" | "kompakt";

/** Namen für Person 1 und Person 2. Die Person-2-Namen sind historisch gewachsen. */
function n(person: 1 | 2, name1: string, name2: string): string {
  return person === 1 ? name1 : name2;
}

/**
 * Baut die Grundliste der Bankprüfungs-Unterlagen abhängig von der
 * Beschäftigungsart. Dynamische Nachweise (Kredite, Vermögenswerte,
 * Bankkonten) kommen weiterhin aus den aufrufenden Ansichten dazu.
 */
export function buildBankpruefungBaseDocs(opts: {
  beschaeftigungsart?: string;
  person?: 1 | 2;
  variant?: BankDocVariant;
  /** Betrag aus der Selbstauskunft ("Private Krankenversicherung"). */
  privateKV?: string | number;
  /**
   * Das Eigenkapital ist schon je Vermögenswert belegt, der allgemeine
   * Eigenkapitalnachweis entfällt dann. Ob das so ist, entscheidet
   * `eigenkapitalJeVermoegenswertBelegt` in bankpruefungListe.ts.
   */
  ohneEigenkapitalnachweis?: boolean;
}): BankDoc[] {
  const art = (opts.beschaeftigungsart || "").toLowerCase();
  const person = opts.person ?? 1;
  const variant = opts.variant ?? "admin";
  const selbststaendig = art === "selbstaendig";
  const beamter = art === "beamter";
  const suffix = person === 2 ? " Person 2" : "";

  const docs: BankDoc[] = [];

  docs.push({
    name: n(person, "Lohnsteuerbescheinigung des Vorjahrs", "Lohnsteuerbescheinigung Vorjahr Person 2"),
    required: !selbststaendig,
  });

  if (selbststaendig) {
    docs.push({ name: `Steuerbescheide der letzten 3 Jahre${suffix}`, required: true });
    docs.push({ name: `Steuererklärungen der letzten 3 Jahre${suffix}`, required: true });
    docs.push({ name: `Bilanz / BWA der letzten 3 Jahre${suffix}`, required: true });
    docs.push({ name: `Handelsregisterauszug${suffix}`, required: false });
  } else {
    docs.push({
      name: n(person, 'Letzter Steuerbescheid / „Negativ-Erklärung"', 'Steuerbescheid / „Negativ-Erklärung" Person 2'),
      required: true,
    });
  }

  docs.push({ name: `Arbeitsvertrag${suffix}`, required: !selbststaendig && !beamter });
  if (beamter) {
    docs.push({ name: `Ernennungsurkunde${suffix}`, required: false });
    docs.push({ name: `Aktuelle Besoldungsbescheide (letzte 3 Monate)${suffix}`, required: true });
  }

  docs.push({ name: `Aktuelle Renteninformation${suffix}`, required: !selbststaendig });
  if (!opts.ohneEigenkapitalnachweis) {
    docs.push({ name: `Eigenkapitalnachweis${suffix}`, required: true });
  }

  if (variant === "admin") {
    docs.push({ name: `Kontoauszüge der letzten 3 Monate${suffix}`, required: true });
  }
  if (selbststaendig) {
    docs.push({ name: `Geschäftskontoauszüge der letzten 3 Monate${suffix}`, required: true });
  }
  // Der PKV-Nachweis wird nur verlangt, wenn in der Selbstauskunft auch ein
  // Beitrag zur privaten Krankenversicherung angegeben wurde.
  if (variant === "admin" && hatPrivateKV(opts.privateKV)) {
    docs.push({ name: `PKV Nachweis${suffix}`, required: true });
  }

  return docs;
}

/** Prüft, ob in der Selbstauskunft ein PKV-Beitrag angegeben wurde. */
function hatPrivateKV(wert?: string | number): boolean {
  if (wert === undefined || wert === null || wert === "") return false;
  if (typeof wert === "number") return wert > 0;
  const zahl = parseFloat(wert.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(zahl) && zahl > 0;
}

/**
 * Hängt Positionen an, zu denen bereits eine Datei vorliegt, die aber in der
 * aktuellen Liste nicht mehr vorgesehen sind. So geht kein Upload verloren,
 * wenn die Beschäftigungsart nachträglich korrigiert wird.
 */
/**
 * Alte Dokument-Schlüssel, unter denen im Kundenportal bereits Dateien
 * hochgeladen wurden, bevor die Namen an das Kundenprofil angeglichen wurden.
 *
 * Der Wohn-Nachweis hieß im Portal fest 'Eigener Mietvertrag /
 * „Mietfrei-Bestätigung"', im Profil dagegen "Mietvertrag" beziehungsweise
 * "Mietfreibestätigung". Weil docStatuses über den exakten Namens-String
 * synchronisiert wird, tauchten Portal-Uploads in der Profil-Zeile nie auf.
 * Die Namen des Kundenprofils sind kanonisch; damit Bestandsuploads nicht
 * verschwinden, zählt beim Lesen der alte Schlüssel für die neue Zeile.
 */
export const LEGACY_DOC_KEYS: Record<string, string[]> = {
  "Mietvertrag": ['Eigener Mietvertrag / „Mietfrei-Bestätigung"'],
  "Mietfreibestätigung": ['Eigener Mietvertrag / „Mietfrei-Bestätigung"'],
  "Mietvertrag Person 2": ['Eigener Mietvertrag / „Mietfrei-Bestätigung" Person 2'],
  "Mietfreibestätigung Person 2": ['Eigener Mietvertrag / „Mietfrei-Bestätigung" Person 2'],
};

/** Werte, die als "kein Eintrag" gelten (Status "none" oder leer). */
function istLeererDocWert(wert: unknown): boolean {
  return wert === undefined || wert === null || wert === "" || wert === "none";
}

/**
 * Spiegelt Einträge alter Dokument-Schlüssel auf die neuen Namen.
 *
 * Für jeden Namen aus `docNames`, der einen Legacy-Alias hat: Ist unter dem
 * neuen Namen nichts eingetragen, zählt der Eintrag des alten Schlüssels.
 * Der alte Schlüssel wird aus der Rückgabe entfernt, damit er nicht zusätzlich
 * als verwaiste Extra-Zeile auftaucht (mergeVorhandeneDocs). Es wird nur die
 * Ansicht umgeschrieben, nie der gespeicherte Datensatz.
 */
export function applyLegacyDocKeys<T>(
  map: Record<string, T> | undefined,
  docNames: string[],
): Record<string, T> {
  const result: Record<string, T> = { ...(map || {}) };
  for (const neu of docNames) {
    const alte = LEGACY_DOC_KEYS[neu];
    if (!alte) continue;
    for (const alt of alte) {
      if (istLeererDocWert(result[alt])) continue;
      if (istLeererDocWert(result[neu])) result[neu] = result[alt];
      delete result[alt];
    }
  }
  return result;
}

export function mergeVorhandeneDocs(
  docs: BankDoc[],
  docStatuses: Record<string, string> | undefined,
  istBankDoc: (name: string) => boolean,
): BankDoc[] {
  if (!docStatuses) return docs;
  const bekannt = new Set(docs.map(d => d.name));
  const extra: BankDoc[] = [];
  for (const [name, status] of Object.entries(docStatuses)) {
    if (!status || status === "none") continue;
    if (bekannt.has(name)) continue;
    if (!istBankDoc(name)) continue;
    extra.push({ name, required: false });
  }
  return extra.length ? [...docs, ...extra] : docs;
}

/**
 * Muss diese Zeile geprüft sein, bevor die Prüfung als abgeschlossen gilt?
 *
 * Ja für jede Pflichtzeile und für jede Unterlage, die ein Mitarbeiter von
 * Hand ergänzt hat (`customBankDocs`), auch wenn sie freiwillig ist: Die hat
 * jemand bewusst angefordert.
 *
 * Nein für die übrigen freiwilligen Zeilen. Dazu gehören die Altzeilen aus
 * `mergeVorhandeneDocs`, also Positionen, die nach der aktuellen
 * Selbstauskunft gar nicht mehr verlangt werden (etwa ein alter
 * Eigenkapitalnachweis). Vorher hielt eine solche abgelehnte Altzeile
 * „Ergebnis senden" und „alle freigegeben" auf, obwohl niemand sie mehr
 * braucht.
 */
export function zaehltFuerAbschluss(
  doc: BankDoc,
  vonHandErgaenzt: ReadonlySet<string>,
): boolean {
  return doc.required || vonHandErgaenzt.has(doc.name);
}
